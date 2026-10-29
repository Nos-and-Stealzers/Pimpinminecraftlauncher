// Real launcher renderer/preload/CSS with fixture-only IPC and disposable data.
// Run: TMPDIR=<scratch> node_modules/.bin/electron scripts/settings-usability-electron.js
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
const output = fsSync.mkdtempSync(path.join(scratch, 'pimpin-settings-usability-'));
const root = path.join(output, 'data');
process.env.PIMPIN_ROOT = root;
app.setPath('userData', path.join(output, 'electron-profile'));
let win, server;
const failures = [], errors = [];
app.whenReady().then(async () => {
  const store = require('../src/main/store');
  await store.updateSettings({ startPage: 'settings', onboarded: true, lastSeenVersion: 'fixture', mcStyle: true, mcSceneSpeed: 0.85, textSize: 120, sidebarMode: 'auto' });
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
        case 'presence:status': data = { message: 'Fixture: Discord not connected' }; break;
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
    await search('scene speed');
    releaseTheme();
    await wait('!!document.querySelector(\'[aria-label="Scene speed"]\')');
    await test('late optional rows obey active search', async () => {
      const result = await run(`(()=>{const sec=document.querySelector('#set-appearance');const row=document.querySelector('[aria-label="Scene speed"]').closest('.set-row');return {section:!sec.hidden,group:!row.closest('.set-group').hidden,row:!row.hidden,unrelated:document.querySelector('[aria-label="Minecraft style"]').closest('.set-row').hidden,empty:document.querySelector('.set-empty').hidden};})()`);
      assert.deepEqual(result, { section: true, group: true, row: true, unrelated: true, empty: true });
      assert.deepEqual(await run('[...document.querySelectorAll(".set-list > .set-row")].filter(n=>n.getClientRects().length).map(n=>n.querySelector("b").textContent)'), ['Scene speed'], 'Nonmatching rows must be visually hidden, not only marked hidden');
    });
    await shot('filtered-late-theme');
    await search('');
    await test('imported custom scene speed is visible without changing persisted value', async () => {
      assert.equal(await run('document.querySelector(\'[aria-label="Scene speed"]\').value'), '0.85');
      assert.match(await run('document.querySelector(\'[aria-label="Scene speed"]\').selectedOptions[0]?.textContent || ""'), /0.85/);
      assert.equal(store.getSettings().mcSceneSpeed, 0.85);
    });
    await run('document.querySelector(\'[aria-label="Scene speed"]\').scrollIntoView({block:"center"})');
    await shot('custom-speed');
    await test('settings controls fit available column at medium widths and 120 percent text', async () => {
      for (const width of [1000, 1060, 1280]) {
        win.setSize(width, 760);
        await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
        const overflow = await run(`(()=>{const content=document.querySelector('.set-content').getBoundingClientRect();return [...document.querySelectorAll('.set-control, .set-control > *')].filter(n=>n.getClientRects().length && n.getBoundingClientRect().right>content.right+1).map(n=>n.closest('.set-row').querySelector('b')?.textContent);})()`);
        assert.deepEqual(overflow, [], 'Overflow at ' + width + 'px');
      }
    });
    await shot('medium-text-120');
    win.setSize(720, 760);
    await wait('innerWidth <= 720');
    await search('');
    await run('document.querySelector(\'.set-nav a[data-target="set-java-and-memory"]\').focus()');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await shot('narrow-keyboard-navigation');
    await test('keyboard section target is not covered by sticky search/navigation', async () => {
      const box = await run(`({heading:document.querySelector('#set-java-and-memory-title').getBoundingClientRect().top,nav:document.querySelector('.set-nav').getBoundingClientRect().bottom})`);
      assert.ok(box.heading >= box.nav - 1, JSON.stringify(box));
      assert.equal(await run('document.querySelector(".set-nav a.on")?.dataset.target'), 'set-java-and-memory');
    });
    await test('narrow page has no horizontal clipping', async () => {
      assert.equal(await run('document.querySelector("#view").scrollWidth <= document.querySelector("#view").clientWidth + 1'), true);
    });
    await test('theme redraw respects search and Escape restores all sections', async () => {
      await search('minecraft style');
      await run('document.querySelector(\'[aria-label="Minecraft style"]\').click()');
      await wait('!document.querySelector(\'[aria-label="Scene speed"]\') && !document.body.hasAttribute("data-mc")');
      assert.equal(await run('document.querySelector("#set-appearance").hidden'), false);
      await search('no-such-setting-unique');
      assert.equal(await run('document.querySelector(".set-empty").hidden'), false);
      assert.equal(await run('document.querySelectorAll(".set-nav a.on").length'), 0);
      await run('document.querySelector(\'[aria-label="Search settings"]\').focus()');
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await wait('document.querySelector(\'[aria-label="Search settings"]\').value === ""');
      assert.equal(await run('[...document.querySelectorAll(".set-section")].every(n=>!n.hidden)'), true);
    });
    await test('narrow section deep link remains visible with Minecraft style off', async () => {
      await run(`import('./js/pages/settings.js').then(m=>{const page=document.querySelector('.settings').closest('.page');page.replaceChildren();m.render(page,{section:'java-and-memory'},()=>{});})`);
      await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const box = await run(`({heading:document.querySelector('#set-java-and-memory-title').getBoundingClientRect().top,nav:document.querySelector('.set-nav').getBoundingClientRect().bottom})`);
      assert.ok(box.heading >= box.nav - 1, JSON.stringify(box));
    });
    await shot('narrow-default-theme');
    await run('document.querySelector(\'[aria-label="Minecraft style"]\').click()');
    await wait('document.querySelector(\'[aria-label="Scene speed"]\')?.value === "0.85"');
    // Real persistence and reopened custom selection, plus a regular speed edit.
    await run(`{const n=document.querySelector('[aria-label="Scene speed"]');n.value='1.5';n.dispatchEvent(new Event('change',{bubbles:true}));}`);
    await wait('import("./js/state.js").then(m=>m.state.settings.mcSceneSpeed===1.5)');
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'settings.json'), 'utf8')).mcSceneSpeed, 1.5);
    await win.reload();
    await wait('document.querySelector(\'[aria-label="Scene speed"]\')?.value === "1.5"');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ failures, errors, root }, null, 2));
    console.log('Evidence:', output);
    if (failures.length) throw new Error(`${failures.length} settings regressions failed`);
  } finally { releaseTheme(); win?.destroy(); server?.close(); app.quit(); }
}).catch(error => { console.error(error); win?.destroy(); server?.close(); app.exit(1); });
