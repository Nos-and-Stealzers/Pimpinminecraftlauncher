// Electron entry point: creates the custom frameless window and exposes the
// launcher backend to the UI through a single whitelisted RPC channel.
const path = require('path');
const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, clipboard } = require('electron');
const store = require('./store');
const screenshots = require('./screenshots').createScreenshots({ instancesRoot: store.dirs.instances, nativeImage, clipboard });
const auth = require('./auth');
const minecraft = require('./minecraft');
const instances = require('./instances');
const servers = require('./servers');
const content = require('./content');
const modrinth = require('./modrinth');
const files = require('./files');
const packs = require('./packs');
const shaders = require('./shaders');
const importer = require('./importer');
const gameLogs = require('./logs');
const wardrobe = require('./wardrobe');
const worldBackups = require('./world-backups');
const clientSettings = require('./client-settings');
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
    backgroundColor: '#16171a',
    title: 'Pimpin Launcher',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false, // nothing to spell-check; saves memory and CPU
      v8CacheOptions: 'bypassHeatCheck', // cache compiled UI code for faster starts
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win.show();
  });
  win.on('close', (e) => {
    if (!quitting && store.getSettings().minimizeToTray) {
      e.preventDefault();
      win.hide();
      ensureTray();
    }
  });
  win.on('maximize', () => send('window:state', { maximized: true }));
  win.on('unmaximize', () => send('window:state', { maximized: false }));
  // Never navigate the launcher window away; open links in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// ------------------------------------------------------------------- tray --
let tray = null;
let quitting = false;

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function trayMenu() {
  const list = await instances.list().catch(() => []);
  const last = list.find((i) => i.id === store.getSettings().lastInstance) || list[0];
  return Menu.buildFromTemplate([
    { label: 'Open Pimpin Launcher', click: showWindow },
    last ? { label: `Play ${last.name}`, click: () => instances.launch(last.id).catch((err) => send('toast', { kind: 'err', text: err.message })) } : null,
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ].filter(Boolean));
}

function ensureTray() {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', '..', 'build', 'icon.png')).resize({ width: 18, height: 18 }));
  tray.setToolTip('Pimpin Launcher');
  tray.on('click', showWindow);
  // Rebuild the menu when it's opened so "Play" names the current instance.
  const refresh = async () => tray.setContextMenu(await trayMenu());
  tray.on('right-click', refresh);
  tray.on('mouse-enter', refresh);
  refresh();
}

function applySystemSettings(s) {
  if (s.minimizeToTray) ensureTray();
  else if (tray) {
    tray.destroy();
    tray = null;
  }
  if (process.platform !== 'linux' && app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: Boolean(s.launchOnStartup), args: ['--hidden'] });
  }
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

const previewCache = new Map();

async function packTarget(id) {
  const inst = await instances.get(id);
  return { inst, dir: instances.dirOf(id) };
}

/** Install a shader pack from the library and switch it on in Iris. */
/**
 * Installs one of our shader packs and makes sure the instance can load it:
 * Iris + Sodium on Fabric/Quilt (OptiFine users pick it up from shaderpacks/ too).
 */
async function enablePimpinShader(inst, dir, shaderId, target) {
  const failed = [];
  if (inst.loader === 'vanilla') throw new Error('Shaders need a Fabric or Quilt instance (for Iris).');
  const holder = await holderFor(target);
  const res = await content.setFeature(holder, 'shaders', true, progressFor(target)).catch((err) => ({ failed: [err.message] }));
  failed.push(...(res.failed || []));
  await shaders.install(dir, shaderId, true);
  return failed;
}

async function notRunning(id) {
  const { inst } = await packTarget(id);
  if (inst.running) throw new Error('Close the game first — Minecraft saves its options when it quits.');
}

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

  'client-settings:get': (id) => clientSettings.get(id),
  'client-settings:update': (id, patch, revision) => clientSettings.update(id, patch, revision),

  'settings:get': () => store.getSettings(),
  'settings:update': async (patch) => {
    const next = await store.updateSettings(patch);
    if ('minimizeToTray' in patch || 'launchOnStartup' in patch) applySystemSettings(next);
    return next;
  },
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

  'wardrobe:list': () => wardrobe.listSkins(),
  'wardrobe:select': (options) => wardrobe.selectSkin(options),
  'wardrobe:import': (options) => wardrobe.importSkin(options),
  'wardrobe:export': (options) => wardrobe.exportSkin(options),
  'wardrobe:delete': (options) => wardrobe.deleteSkin(options),

  'worldBackups:list': (id, world) => worldBackups.list(id, world),
  'worldBackups:create': (id, world) => worldBackups.create(id, world),
  'worldBackups:restore': (id, world, name) => worldBackups.restore(id, world, name),
  'worldBackups:delete': (id, world, name) => worldBackups.deleteBackup(id, world, name),
  'worldBackups:export': async (id, world, name) => {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.basename(String(name)),
      filters: [{ name: 'World backup', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return { exported: false };
    return worldBackups.exportBackup(id, world, name, result.filePath);
  },

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
  'instances:screenshots': async (id) => (await screenshots.list(id)).screenshots,
  'screenshots:list': (id) => screenshots.list(id),
  'screenshots:favorite': (id, name, on) => screenshots.favorite(id, name, on),
  'screenshots:delete': (id, name) => screenshots.remove(id, name),
  'screenshots:copy': (id, name) => screenshots.copy(id, name),
  'screenshots:export': (id, name) => screenshots.exportWithDialog(id, name, (options) => dialog.showSaveDialog(win, options)),
  'instances:deleteScreenshot': (id, name) => screenshots.remove(id, name),
  'instances:crashInfo': (id) => instances.crashInfo(id),
  'instances:repair': (id) => instances.repair(id),
  'instances:warm': (id) => instances.warm(id),
  'instances:export': async (id) => {
    const inst = await instances.get(id);
    const res = await dialog.showSaveDialog(win, { title: `Export ${inst.name}`, defaultPath: `${inst.name}.pimpin.zip`, filters: [{ name: 'Pimpin instance', extensions: ['zip'] }] });
    if (res.canceled || !res.filePath) return null;
    await instances.exportZip(id, res.filePath);
    shell.showItemInFolder(res.filePath);
    return res.filePath;
  },
  'instances:import': async (file) => {
    if (!file) {
      const res = await dialog.showOpenDialog(win, { title: 'Import an instance', properties: ['openFile'], filters: [{ name: 'Modpack or Pimpin export', extensions: ['mrpack', 'zip'] }] });
      if (res.canceled || !res.filePaths[0]) return null;
      file = res.filePaths[0];
    }
    return importer.importFile(String(file), progressFor({ id: 'import' }));
  },
  'logs:list': (id) => gameLogs.listLogs(instances.dirOf(id)),
  'logs:read': (id, name) => gameLogs.readLog(instances.dirOf(id), String(name)),
  'logs:upload': (lines) => gameLogs.upload(lines),
  'content:updateAll': async () => {
    const summary = { updated: 0, instances: 0, skipped: [] };
    for (const inst of await instances.list()) {
      if (inst.running) {
        summary.skipped.push(inst.name);
        continue;
      }
      const target = { kind: 'instance', id: inst.id };
      try {
        const holder = await holderFor(target);
        const updates = await content.checkUpdates(holder);
        if (updates.length) {
          await content.applyUpdates(holder, updates, progressFor(target));
          summary.updated += updates.length;
          summary.instances++;
        }
      } catch (err) {
        summary.skipped.push(`${inst.name} (${err.message})`);
      }
    }
    send('instances:changed');
    return summary;
  },
  'shell:showItem': (id, sub, name) => shell.showItemInFolder(store.safeJoin(instances.dirOf(id), sub, name)),

  'update:get': () => setUpdate({}),
  'update:check': () => checkForUpdates(),
  'update:download': () => {
    if (autoUpdater && updateState.state === 'available') {
      setUpdate({ state: 'downloading', percent: 0 });
      autoUpdater.downloadUpdate().catch((err) => setUpdate({ state: 'error', error: err.message }));
    } else if (updateState.url) shell.openExternal(updateState.url);
  },
  'update:busy': async () => ({
    games: instances.isAnyRunning(),
    servers: (await servers.list()).some((s) => s.running),
  }),
  'update:install': () => {
    if (autoUpdater && updateState.state === 'ready') autoUpdater.quitAndInstall();
  },
  'update:notes': async (version) => {
    const rel = await getJson(`https://api.github.com/repos/${REPO}/releases/tags/v${encodeURIComponent(version)}`, { headers: { Accept: 'application/vnd.github+json' } });
    return { version, name: rel.name, notes: rel.body || '', url: rel.html_url, date: rel.published_at };
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

  'packs:status': async (id) => {
    const { inst, dir } = await packTarget(id);
    return packs.status(dir, inst.mcVersion);
  },
  'packs:preview': (packId) => {
    if (!previewCache.has(packId)) previewCache.set(packId, packs.preview(packId));
    return previewCache.get(packId);
  },
  'packs:install': async (id, packId) => {
    await notRunning(id);
    const { inst, dir } = await packTarget(id);
    return packs.install(dir, packId, inst.mcVersion);
  },
  'packs:toggle': async (id, packId, on) => {
    await notRunning(id);
    const { inst, dir } = await packTarget(id);
    await packs.setActive(dir, packs.PACKS[packId].file, inst.mcVersion, on);
    return packs.status(dir, inst.mcVersion);
  },
  'packs:remove': async (id, packId) => {
    await notRunning(id);
    const { inst, dir } = await packTarget(id);
    return packs.remove(dir, packId, inst.mcVersion);
  },
  'packs:export': async (packId, mcVersion) => {
    const pack = packs.PACKS[packId];
    const res = await dialog.showSaveDialog(win, { title: `Save ${pack.name}`, defaultPath: pack.file, filters: [{ name: 'Resource pack', extensions: ['zip'] }] });
    if (res.canceled || !res.filePath) return null;
    await require('fs/promises').writeFile(res.filePath, packs.build(packId, mcVersion));
    shell.showItemInFolder(res.filePath);
    return res.filePath;
  },
  'game:presets': () => packs.presetInfo(),
  'game:applyPreset': async (id, presetId) => {
    await notRunning(id);
    const { inst, dir } = await packTarget(id);
    return packs.applyPreset(dir, presetId, inst.mcVersion);
  },
  'packs:combo': async (id, mode) => {
    await notRunning(id);
    const { inst, dir } = await packTarget(id);
    const pack = mode === 'fps' ? 'performance' : 'pretty';
    const other = pack === 'pretty' ? 'performance' : 'pretty';
    await packs.setActive(dir, packs.PACKS[other].file, inst.mcVersion, false);
    await packs.install(dir, pack, inst.mcVersion);
    await packs.applyPreset(dir, mode === 'pretty' ? 'pretty' : mode === 'balanced' ? 'balanced' : 'fps', inst.mcVersion);
    const failed = [];
    if (inst.loader !== 'vanilla') {
      const target = { kind: 'instance', id };
      const holder = await holderFor(target);
      const own = content.clientJar(inst.mcVersion, inst.loader) ? ['pimpinclient'] : [];
      const extras = { pretty: ['skinlayers', 'animations', 'ctm', 'dynamiclights'], balanced: ['skinlayers', 'ctm'], fps: ['dynamicfps'] }[mode] || [];
      for (const f of ['fps', 'faststart', ...own, ...extras]) {
        const res = await content.setFeature(holder, f, true, progressFor(target)).catch((err) => ({ failed: [err.message] }));
        // ModernFix isn't out for every version; the combo works fine without it
        if (f !== 'faststart') failed.push(...(res.failed || []));
      }
      if (mode === 'pretty' || mode === 'balanced') {
        try {
          failed.push(...(await enablePimpinShader(inst, dir, mode === 'pretty' ? 'ultra' : 'lite', target)));
        } catch (err) {
          failed.push(`Shaders: ${err.message}`);
        }
      } else {
        for (const id of Object.keys(shaders.SHADERS)) await shaders.setActive(dir, id, false);
      }
      send('instances:changed');
    }
    return { failed, status: await packs.status(dir, inst.mcVersion) };
  },

  'shaders:status': async (id) => {
    const { dir } = await packTarget(id);
    return shaders.status(dir);
  },
  'shaders:install': async (id, shaderId) => {
    await notRunning(id);
    const { inst, dir } = await packTarget(id);
    const failed = await enablePimpinShader(inst, dir, shaderId, { kind: 'instance', id });
    send('instances:changed');
    return { failed, status: await shaders.status(dir) };
  },
  'shaders:toggle': async (id, shaderId, on) => {
    await notRunning(id);
    const { dir } = await packTarget(id);
    if (on) await shaders.install(dir, shaderId, true);
    else await shaders.setActive(dir, shaderId, false);
    return shaders.status(dir);
  },
  'shaders:remove': async (id, shaderId) => {
    await notRunning(id);
    const { dir } = await packTarget(id);
    await shaders.remove(dir, shaderId);
    return shaders.status(dir);
  },
  'shaders:export': async (shaderId) => {
    const pack = shaders.SHADERS[shaderId];
    const res = await dialog.showSaveDialog(win, { title: `Save ${pack.name}`, defaultPath: pack.file, filters: [{ name: 'Shader pack', extensions: ['zip'] }] });
    if (res.canceled || !res.filePath) return null;
    await require('fs/promises').writeFile(res.filePath, await shaders.build(shaderId));
    shell.showItemInFolder(res.filePath);
    return res.filePath;
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

app.on('second-instance', showWindow);

// ---------------------------------------------------------------- updates --
// PIMPIN_UPDATE_REPO only exists to test the update screens against another repo
// Installers are published to a public repo (the source repo is private), so
// launchers can check for updates without a login.
const REPO = process.env.PIMPIN_UPDATE_REPO || 'Nos-and-Stealzers/pimpin-launcher-releases';

/** Installer builds update themselves; portable, .deb, macOS and dev builds get a download link. */
function canSelfUpdate() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return false;
  if (process.platform === 'linux') return Boolean(process.env.APPIMAGE);
  return process.platform === 'win32';
}

function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function setUpdate(patch) {
  updateState = { ...updateState, ...patch, current: app.getVersion(), selfUpdate: canSelfUpdate() };
  send('update:state', updateState);
  return updateState;
}

let autoUpdater = null;

async function latestRelease() {
  const beta = store.getSettings().updateChannel === 'beta';
  const list = await getJson(`https://api.github.com/repos/${REPO}/releases?per_page=15`, { headers: { Accept: 'application/vnd.github+json' } });
  return list.find((r) => !r.draft && (beta || !r.prerelease)) || null;
}

function assetFor(release) {
  const want = process.platform === 'win32' ? (process.env.PORTABLE_EXECUTABLE_DIR ? /Portable.*\.exe$/ : /Setup.*\.exe$/) : process.platform === 'linux' ? (process.env.APPIMAGE ? /\.AppImage$/ : /\.deb$/) : /\.dmg$/;
  return release.assets?.find((a) => want.test(a.name))?.browser_download_url || release.html_url;
}

async function checkForUpdates() {
  setUpdate({ state: 'checking', error: null });
  try {
    if (autoUpdater) {
      const settings = store.getSettings();
      autoUpdater.allowPrerelease = settings.updateChannel === 'beta';
      autoUpdater.autoDownload = settings.autoUpdate !== false;
      const res = await autoUpdater.checkForUpdates();
      if (!res?.updateInfo || !newer(res.updateInfo.version, app.getVersion())) setUpdate({ state: 'up-to-date', checkedAt: Date.now() });
      return updateState;
    }
    const rel = await latestRelease();
    const version = rel?.tag_name?.replace(/^v/, '');
    if (rel && newer(version, app.getVersion())) {
      return setUpdate({ state: 'manual', version, notes: rel.body || '', url: assetFor(rel), checkedAt: Date.now() });
    }
    return setUpdate({ state: 'up-to-date', checkedAt: Date.now() });
  } catch (err) {
    return setUpdate({ state: 'error', error: err.message, checkedAt: Date.now() });
  }
}

function setupUpdater() {
  setUpdate({ state: 'idle' });
  if (canSelfUpdate()) {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoInstallOnAppQuit = true;
    const notes = (info) => (Array.isArray(info.releaseNotes) ? info.releaseNotes.map((n) => n.note).join('\n\n') : info.releaseNotes || '');
    autoUpdater.on('update-available', (info) => setUpdate({ state: autoUpdater.autoDownload ? 'downloading' : 'available', version: info.version, percent: 0, notes: notes(info) }));
    autoUpdater.on('download-progress', (p) => setUpdate({ state: 'downloading', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info) => setUpdate({ state: 'ready', version: info.version, notes: notes(info) }));
    autoUpdater.on('error', (err) => setUpdate({ state: 'error', error: err.message }));
  }
  if (!app.isPackaged) return; // no update checks while developing
  setTimeout(checkForUpdates, 8000);
  setInterval(checkForUpdates, 4 * 3600e3);
}

app.whenReady().then(() => {
  createWindow();
  setupUpdater();
  applySystemSettings(store.getSettings());
});
app.on('before-quit', () => {
  quitting = true;
  servers.stopAll();
});
app.on('window-all-closed', () => app.quit());
