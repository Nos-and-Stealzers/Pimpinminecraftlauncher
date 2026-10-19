// Electron entry point: creates the custom frameless window and exposes the
// launcher backend to the UI through a single whitelisted RPC channel.
const path = require('path');
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const store = require('./store');
const auth = require('./auth');
const minecraft = require('./minecraft');
const instances = require('./instances');
const servers = require('./servers');
const content = require('./content');
const modrinth = require('./modrinth');
const files = require('./files');
const { getJson, request } = require('./net');

let win;
let updateState = { state: 'idle' };

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#0b0914',
    title: 'Pimpin Launcher',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => send('window:state', { maximized: true }));
  win.on('unmaximize', () => send('window:state', { maximized: false }));
  // Never navigate the launcher window away; open links in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function emit(channel, payload) {
  send(channel, payload);
  if (channel === 'game:state' && store.getSettings().closeOnLaunch && win) {
    if (payload.state === 'running') win.hide();
    if (payload.state === 'stopped') win.show();
  }
}
instances.setEmitter(emit);
servers.setEmitter(emit);

async function holderFor(target) {
  if (!target || !target.id) throw new Error('Select an instance first');
  return target.kind === 'server' ? servers.holder(target.id) : instances.holder(target.id);
}

const skinCache = new Map();

/** Fetch a player's skin as a data URL so the UI can draw it in 3D. */
async function getSkin(name) {
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(name || '')) throw new Error('Invalid player');
  if (!skinCache.has(name)) {
    const res = await request(`https://mc-heads.net/skin/${encodeURIComponent(name)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 512 * 1024) throw new Error('Skin too large');
    skinCache.set(name, `data:image/png;base64,${buf.toString('base64')}`);
  }
  return skinCache.get(name);
}

// Only documents and images open in their default app — never programs or scripts.
const OPENABLE = /\.(txt|log|json|json5|properties|toml|ya?ml|cfg|conf|ini|md|csv|mcmeta|png|jpe?g|gif|webp|zip|mrpack|pdf)$/i;

const progressFor = (target) => (p) => send('task:progress', { id: target?.id, ...p });

const handlers = {
  'app:info': () => ({ version: app.getVersion(), platform: process.platform, arch: process.arch, root: store.dirs.root }),
  'window:minimize': () => win.minimize(),
  'window:maximize': () => (win.isMaximized() ? win.unmaximize() : win.maximize()),
  'window:close': () => win.close(),
  'window:zoom': (factor) => win.webContents.setZoomFactor(Math.min(1.5, Math.max(0.7, Number(factor) || 1))),
  'shell:openExternal': (url) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  },
  'shell:openRoot': () => shell.openPath(store.dirs.root),

  'settings:get': () => store.getSettings(),
  'settings:update': (patch) => store.updateSettings(patch),
  'dialog:pickJava': async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Select a Java executable',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [],
    });
    return res.canceled ? null : res.filePaths[0];
  },

  'accounts:list': () => auth.listAccounts(),
  'accounts:addOffline': (name) => auth.addOffline(name),
  'accounts:addMicrosoft': () => auth.addMicrosoft(),
  'accounts:remove': (id) => auth.removeAccount(id),
  'accounts:setActive': (id) => auth.setActive(id),

  'versions:list': async () => {
    const m = await minecraft.getVersionManifest();
    return { latest: m.latest, versions: m.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime })) };
  },
  'loaders:versions': (loader, mc) => minecraft.getLoaderVersions(loader, mc),
  'loaders:games': (loader) => minecraft.getLoaderGameVersions(loader),

  'instances:list': () => instances.list(),
  'instances:get': (id) => instances.get(id),
  'instances:create': (opts) => instances.create(opts),
  'instances:update': (id, patch) => instances.update(id, patch),
  'instances:delete': (id) => instances.remove(id),
  'instances:open': (id, sub) => shell.openPath(sub ? store.safeJoin(instances.dirOf(id), sub) : instances.dirOf(id)),
  'instances:launch': (id, opts) => instances.launch(id, opts),
  'instances:kill': (id) => instances.kill(id),
  'instances:logs': (id) => instances.getLogs(id),
  'instances:duplicate': (id) => instances.duplicate(id),
  'instances:worlds': (id) => instances.worlds(id),
  'instances:screenshots': (id) => instances.screenshots(id),
  'instances:deleteScreenshot': (id, name) => instances.deleteScreenshot(id, name),
  'instances:crashInfo': (id) => instances.crashInfo(id),
  'shell:showItem': (id, sub, name) => shell.showItemInFolder(store.safeJoin(instances.dirOf(id), sub, name)),

  'update:get': () => updateState,
  'update:install': () => {
    if (updateState.state === 'ready') require('electron-updater').autoUpdater.quitAndInstall();
  },

  'content:list': async (target) => content.list(await holderFor(target)),
  'content:install': async (target, item) => content.install(await holderFor(target), item, progressFor(target)),
  'content:remove': async (target, item) => content.remove(await holderFor(target), item),
  'content:toggle': async (target, item) => content.setEnabled(await holderFor(target), item),
  'content:checkUpdates': async (target) => content.checkUpdates(await holderFor(target)),
  'content:applyUpdates': async (target, updates) => content.applyUpdates(await holderFor(target), updates, progressFor(target)),
  'content:identify': async (target) => content.identifyLocal(await holderFor(target)),
  'features:list': async (target) => content.featureState(await holderFor(target)),
  'features:set': async (target, id, enabled) => content.setFeature(await holderFor(target), id, enabled, progressFor(target)),

  'library:search': (opts) => modrinth.search(opts),
  'library:project': (id) => modrinth.getProject(id),
  'library:versions': (id, opts) => modrinth.getVersions(id, opts),
  'library:categories': () => modrinth.getCategories(),
  'modpack:install': (opts) => instances.installModpack(opts),

  'skin:get': (name) => getSkin(name),

  'files:list': async (target, sub) => files.list((await holderFor(target)).dir, sub),
  'files:size': async (target, sub) => files.folderSize((await holderFor(target)).dir, sub),
  'files:read': async (target, sub, name) => files.read((await holderFor(target)).dir, sub, name),
  'files:write': async (target, sub, name, text) => files.write((await holderFor(target)).dir, sub, name, text),
  'files:delete': async (target, sub, name) => files.remove((await holderFor(target)).dir, sub, name),
  'files:rename': async (target, sub, from, to) => files.rename((await holderFor(target)).dir, sub, from, to),
  'files:mkdir': async (target, sub, name) => files.mkdir((await holderFor(target)).dir, sub, name),
  'files:import': async (target, sub, paths) => files.importPaths((await holderFor(target)).dir, sub, paths),
  'files:pickImport': async (target, sub) => {
    const res = await dialog.showOpenDialog(win, { title: 'Add files', properties: ['openFile', 'multiSelections'] });
    if (res.canceled) return [];
    return files.importPaths((await holderFor(target)).dir, sub, res.filePaths);
  },
  'files:reveal': async (target, sub, name) => {
    const dir = (await holderFor(target)).dir;
    if (name) shell.showItemInFolder(files.resolve(dir, sub, name));
    else shell.openPath(files.resolve(dir, sub));
  },
  'files:open': async (target, sub, name) => {
    if (!OPENABLE.test(name || '')) throw new Error('This kind of file is not opened from the launcher. Use "Show in folder" instead.');
    const err = await shell.openPath(files.resolve((await holderFor(target)).dir, sub, name));
    if (err) throw new Error(err);
  },

  'servers:software': () => servers.SOFTWARE,
  'servers:versions': (software) => servers.versions(software),
  'servers:list': () => servers.list(),
  'servers:get': (id) => servers.get(id),
  'servers:create': (opts) => servers.create(opts),
  'servers:update': (id, patch) => servers.update(id, patch),
  'servers:delete': (id) => servers.remove(id),
  'servers:start': (id) => servers.start(id),
  'servers:stop': (id) => servers.stop(id),
  'servers:restart': (id) => servers.restart(id),
  'servers:properties': (id) => servers.readProperties(id),
  'servers:setProperties': (id, patch) => servers.setProperties(id, patch),
  'servers:players': (id) => servers.playerInfo(id),
  'servers:playerAction': (id, action, name) => servers.playerAction(id, action, name),
  'servers:backups': (id) => servers.backups(id),
  'servers:backup': (id) => servers.backup(id),
  'servers:restoreBackup': (id, name) => servers.restoreBackup(id, name),
  'servers:deleteBackup': (id, name) => servers.deleteBackup(id, name),
  'servers:network': () => ({ lan: servers.lanAddresses() }),
  'servers:command': (id, cmd) => servers.command(id, cmd),
  'servers:logs': (id) => servers.getLogs(id),
  'servers:open': (id) => shell.openPath(servers.dirOf(id)),

  'news:get': async () => {
    const data = await getJson('https://launchercontent.mojang.com/v2/news.json');
    return data.entries
      .filter((e) => e.category === 'Minecraft: Java Edition' || e.tag === 'Java')
      .slice(0, 12)
      .map((e) => ({
        title: e.title,
        text: e.text,
        date: e.date,
        tag: e.tag,
        image: e.newsPageImage?.url ? `https://launchercontent.mojang.com${e.newsPageImage.url}` : null,
        link: e.readMoreLink,
      }));
  },
};

ipcMain.handle('rpc', async (_e, channel, args) => {
  const fn = handlers[channel];
  if (!fn) return { ok: false, error: `Unknown call ${channel}` };
  try {
    return { ok: true, data: await fn(...(Array.isArray(args) ? args : [])) };
  } catch (err) {
    console.error(`[rpc ${channel}]`, err);
    return { ok: false, error: err.message || String(err) };
  }
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

/**
 * Self-update from GitHub Releases. Works for the Windows installer and the
 * AppImage; the portable exe and .deb are updated by downloading a new copy.
 */
function setupUpdater() {
  if (!app.isPackaged) return;
  if (process.env.PORTABLE_EXECUTABLE_DIR) return;
  if (process.platform === 'linux' && !process.env.APPIMAGE) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const set = (s) => {
    updateState = { ...updateState, ...s };
    send('update:state', updateState);
  };
  autoUpdater.on('update-available', (info) => set({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => console.warn('Updater:', err.message));
  const check = () => autoUpdater.checkForUpdates().catch((err) => console.warn('Update check failed:', err.message));
  check();
  setInterval(check, 4 * 3600e3);
}

app.whenReady().then(() => {
  createWindow();
  setupUpdater();
});
app.on('before-quit', () => servers.stopAll());
app.on('window-all-closed', () => app.quit());
