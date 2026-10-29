// Real launcher renderer/preload/CSS with fixture-only IPC and disposable data.
// Run: TMPDIR=<scratch> npm run test:electron-integrations
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const scratch = process.env.TMPDIR;
if (!scratch) throw new Error('TMPDIR is required; never use launcher user data');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('remote-debugging-port', '0');
app.on('window-all-closed', () => {});
const output = fsSync.mkdtempSync(path.join(scratch, 'pimpin-consumer-integrations-'));
const root = path.join(output, 'data');
process.env.PIMPIN_ROOT = root;
app.setPath('userData', path.join(output, 'electron-profile'));
let win, server;
const failures = [], errors = [];
app.whenReady().then(async () => {
  // An older launcher may have saved a CurseForge key; seed it before the store loads.
  fsSync.mkdirSync(root, { recursive: true });
  fsSync.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ curseforgeApiKey: 'fixture-legacy-key' }));
  const store = require('../src/main/store');
  await store.updateSettings({ startPage: 'settings', onboarded: true, lastSeenVersion: 'fixture', discordAppId: '123456789012345678', mcStyle: false, mcSceneSpeed: 0.85, textSize: 100, sidebarMode: 'auto' });
  const renderer = path.resolve(__dirname, '../src/renderer');
  let releaseTheme;
  const themeGate = new Promise(r => { releaseTheme = r; });
  server = http.createServer(async (req, res) => {
    const name = decodeURIComponent(req.url === '/' ? '/index.html' : req.url.split('?')[0]);
    const file = path.resolve(renderer, '.' + name);
    if (!file.startsWith(renderer + path.sep)) { res.writeHead(403); res.end(); return; }
    // Reproduce search entered before the optional settings module arrives.
    if (name === '/themes/minecraft/index.js') await themeGate;
    try {
      res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  ipcMain.handle('rpc', async (_event, channel, args) => {
    try {
      let data;
      switch (channel) {
        case 'settings:get': data = store.getSettings(); break;
        case 'settings:update': data = await store.updateSettings(args[0]); break;
        case 'window:zoom': win.webContents.setZoomFactor(args[0]); break;
        case 'app:info': data = { platform: process.platform, arch: process.arch, version: 'fixture' }; break;
        case 'accounts:list': data = { accounts: [], active: null }; break;
        case 'instances:list': case 'servers:list': data = []; break;
        case 'update:get': data = { status: 'idle' }; break;
        case 'notifications:list': data = { items: [], unread: 0 }; break;
        case 'presence:status': case 'presence:refresh': data = require('../src/main/presence').createPresence({ getSettings: () => store.getSettings(), effectiveAppId: () => null }).getStatus(); break;
        case 'library:search': data = { hits: [], total_hits: 0 }; break;
        default: throw new Error('Unexpected fixture IPC ' + channel);
      }
      return { ok: true, data };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  win = new BrowserWindow({ width: 1000, height: 760, show: true, backgroundColor: '#111214', webPreferences: { preload: path.resolve(__dirname, '../src/main/preload.js'), contextIsolation: true, sandbox: true } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const run = code => win.webContents.executeJavaScript(code);
  const wait = async code => { for (let i = 0; i < 160; i++) { if (await run(code)) return; await new Promise(r => setTimeout(r, 40)); } throw new Error('Timed out: ' + code); };
  const search = value => run(`{ const n=document.querySelector('[aria-label="Search settings"]'); n.value=${JSON.stringify(value)}; n.dispatchEvent(new Event('input',{bubbles:true})); }`);
  const shot = async name => {
    await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    await new Promise(r=>setTimeout(r, 200));
    await fs.writeFile(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  const test = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { failures.push({ name, error: e.message }); console.error('FAIL', name, e.message); } };
  try {
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
    await wait('!!document.querySelector(".settings")');

    releaseTheme();
    await test('settings contain privacy and honest status but no developer integration setup', async () => {
      const result = await run(`(()=>({text:document.querySelector('.settings').textContent,labels:[...document.querySelectorAll('input')].map(n=>n.getAttribute('aria-label'))}))()`);
      assert.doesNotMatch(result.text, /API key|Own application ID|Studios|CurseForge/);
      assert.ok(!result.labels.includes('Discord application ID'));
      for (const label of ['Discord Rich Presence','Show instance name','Show game version','Show elapsed time']) assert.ok(result.labels.includes(label));
      await wait(`document.querySelector('#set-launcher').textContent.includes('Discord presence is unavailable')`);
    });
    await test('privacy edits keep the Discord override and drop the removed CurseForge key', async () => {
      await run(`document.querySelector('[aria-label="Show instance name"]').click()`);
      await wait(`import('./js/state.js').then(m=>m.state.settings.discordShowInstance===false)`);
      const saved = JSON.parse(await fs.readFile(path.join(root, 'settings.json'), 'utf8'));
      assert.equal(saved.discordShowInstance, false);
      assert.equal(saved.discordAppId, '123456789012345678');
      assert.equal(Object.hasOwn(saved, 'curseforgeApiKey'), false);
    });
    await search('Discord');
    await shot('settings-discord-consumer');
    await search('');
    await run(`document.querySelector('.set-nav a[data-target="set-launcher"]').click()`);
    await shot('settings-launcher-consumer');
    const library = source => run(`import('./js/pages/library.js').then(m=>{const page=document.querySelector('#view');page.replaceChildren();m.render(page,{source:${JSON.stringify(source)}},()=>{throw new Error('Unexpected navigation')});})`);
    await test('library is Modrinth only, even when an old link asks for CurseForge', async () => {
      await library('curseforge');
      await wait(`document.querySelector('input[placeholder="Search Modrinth"]') && document.querySelector('#view').textContent.includes('Nothing found')`);
      const text = await run(`document.querySelector('#view').textContent`);
      assert.doesNotMatch(text, /CurseForge/);
      assert.equal(await run(`!!document.querySelector('.lib-source')`), false);
    });
    await shot('library-modrinth-only');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ failures, errors, root }, null, 2));
    console.log('Evidence:', output);
    if (failures.length) throw new Error(`${failures.length} consumer integration regressions failed`);
  } finally { releaseTheme(); win?.destroy(); server?.close(); app.quit(); }
}).catch(error => { console.error(error); win?.destroy(); server?.close(); app.exit(1); });
