// Isolated Electron UI test: real notifications module, preload, stylesheet
// and persisted service. Update actions are explicit fixtures; no downloads.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
assert.ok(process.env.TMPDIR, 'Set TMPDIR to isolated scratch.');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('remote-debugging-port', '0');
const root = require('fs').mkdtempSync(path.join(process.env.TMPDIR, 'pimpin-notice-electron-'));
app.setPath('userData', path.join(root, 'profile'));
process.env.PIMPIN_ROOT = root;
let win, server;
const errors = [], calls = [];
const timer = setTimeout(() => { console.error('Fixture timeout'); app.exit(1); }, 60000);
app.whenReady().then(async () => {
  const { createNotifications } = require('../src/main/notifications');
  const service = createNotifications({ file: path.join(root, 'notifications.json'), onChange: (snap, fresh) => win?.webContents.send('notifications:changed', { ...snap, fresh }) });
  const settingsService = require('../src/main/store');
  const renderer = path.resolve(__dirname, '../src/renderer');
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/app.css"></head>
  <body data-theme="modern" style="display:block"><header class="titlebar"><div class="brand"><img src="/img/logo.svg" class="brand-logo"><span class="brand-name">Pimpin Launcher</span></div><div class="titlebar-center"></div><div class="titlebar-right"><div id="notif-slot"></div><button class="account-btn">Fixture account</button></div></header>
  <main id="page" style="padding:32px;margin-top:38px;overflow:auto;height:calc(100vh - 38px)"><h1 class="page-title">Notification test</h1><p class="muted">Disposable fixture. No game or download access.</p></main><div id="toasts"></div><div id="modal-root"></div>
  <script type="module">import {installNotifications} from '/js/notifications.js';import {state} from '/js/state.js';state.settings=await window.pimpin.call('settings:get');state.info={version:'0.1.26',platform:'win32'};state.instances=[{id:'fixture',name:'Survival'}];window.fixtureState=state;window.lastNavigation=null;window.fixtureNavigate=(p,args)=>window.lastNavigation={page:p,params:args};await installNotifications(document.querySelector('#notif-slot'),window.fixtureNavigate);window.fixtureReady=true;</script></body></html>`;
  server = http.createServer(async (req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    const file = path.resolve(renderer, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(renderer + path.sep)) { res.writeHead(403); res.end(); return; }
    try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(await fs.readFile(file)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  ipcMain.handle('rpc', async (_e, channel, args) => {
    calls.push({ channel, args });
    const methods = {
      'notifications:list': () => service.list(),
      'notifications:read': async ids => { await service.markRead(ids); return service.list(); },
      'notifications:dismiss': async id => { await service.dismiss(id); return service.list(); },
      'notifications:check': () => service.list(),
      'settings:get': () => settingsService.getSettings(),
      'settings:update': patch => settingsService.updateSettings(patch),
      'update:get': () => ({ state: 'manual', current: '0.1.26', version: '0.1.27', notes: 'Fixture release notes' }),
      'update:busy': () => ({ games: false, servers: false }),
      'update:install': () => true,
      'shell:openExternal': () => true,
    };
    try { if (!methods[channel]) throw new Error('Unexpected fixture IPC: ' + channel); return { ok: true, data: await methods[channel](...args) }; }
    catch (err) { return { ok: false, error: err.message }; }
  });
  win = new BrowserWindow({ width: 1100, height: 780, show: true, backgroundColor: '#111214', webPreferences: { preload: path.resolve(__dirname, '../src/main/preload.js'), contextIsolation: true, sandbox: true } });
  win.webContents.on('console-message', d => { if (d.level === 'error') errors.push(d.message); });
  const run = code => { console.log('UI:', code.slice(0, 120)); return win.webContents.executeJavaScript(code); };
  const wait = async expr => { for (let i = 0; i < 160; i++) { if (await run(expr)) return; await new Promise(r => setTimeout(r, 30)); } throw new Error('Timed out: ' + expr); };
  const shot = async name => { await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await new Promise(r => setTimeout(r, 150)); await fs.writeFile(path.join(root, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  await wait('window.fixtureReady');
  await run('document.querySelector(".notif-btn").click()');
  assert.equal(await run('document.querySelector(".notif-empty").textContent'), "You're all caught up.");
  await shot('empty');
  await service.upsert({ id: 'launcher-update', kind: 'launcher-update', rev: '0.1.27-manual', title: 'Pimpin 0.1.27 is available', body: 'This copy cannot update itself. Download the new installer to update.', action: { type: 'update', label: 'View update' } });
  await service.upsert({ id: 'mods-fixture', kind: 'mod-updates', title: '3 mod updates for Survival', body: 'Sodium, Iris and Mod Menu', action: { type: 'instance', id: 'fixture', tab: 'content', label: 'Review updates' }, inGame: false });
  await service.upsert({ id: 'ann-shaders', kind: 'announcement', title: 'Shader improvements', body: 'New water reflections and calmer lighting are on the way. <img src=x onerror=alert(1)>', action: { type: 'link', url: 'https://example.com/fixture', label: 'Read more' } });
  await wait('document.querySelectorAll(".notif-item").length===3');
  assert.equal(await run('document.querySelector(".notif-count").textContent'), '3');
  assert.equal(await run('!!document.querySelector(".notif-item p img")'), false, 'remote text cannot inject markup');
  await shot('populated');
  // Read one and verify independently on disk.
  await run('document.querySelectorAll(".notif-item")[0].querySelectorAll(".link")[1].click()');
  await wait('document.querySelectorAll(".notif-item.unread").length===2');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'notifications.json'))).items.filter(n => n.read).length, 1);
  await run('Array.from(document.querySelectorAll(".notif-item")).find(n=>n.textContent.includes("Review updates")).querySelector(".notif-meta .link").click()');
  await wait('window.lastNavigation?.page==="instances"');
  assert.deepEqual(await run('window.lastNavigation'), { page: 'instances', params: { id: 'fixture', tab: 'content' } });
  await run('document.querySelector(".notif-btn").click()');
  await wait('!!document.querySelector(".notif-panel")');
  await run('Array.from(document.querySelectorAll(".notif-item")).find(n=>n.textContent.includes("View update")).querySelector(".notif-meta .link").click()');
  await wait('document.querySelector(".modal")?.textContent.includes("Launcher updates")');
  await shot('update-details');
  await run('document.querySelector(".modal-head button[title=Close]").click()');
  await run('document.querySelector(".notif-btn").click()');
  await run('document.querySelector(".notif-head .link")?.click()');
  await wait('document.querySelector(".notif-count").hidden');
  assert.equal((await service.list()).unread, 0);
  // Dismiss persists, settings deep link navigates, refresh uses the whitelisted RPC.
  await run('document.querySelector(".notif-x").click()');
  await wait('document.querySelectorAll(".notif-item").length===2');
  await run('document.querySelector(".notif-head .icon").click()');
  await wait('document.querySelector(".notif-head .icon:not(:disabled)")');
  assert.ok(calls.some(c => c.channel === 'notifications:check'));
  await run('document.querySelector(".notif-foot .link").click()');
  assert.deepEqual(await run('window.lastNavigation'), { page: 'settings', params: { section: 'notifications' } });
  await run(`(async()=>{const {render}=await import('/js/pages/settings.js');document.querySelector('#page').replaceChildren();render(document.querySelector('#page'),{section:'notifications'},window.fixtureNavigate);})()`);
  await wait('!!document.querySelector("#set-notifications")');
  await shot('settings');
  await run('document.querySelector("#set-notifications .switch").click()');
  await wait('window.fixtureState.settings.notifyLauncherUpdates===false');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'settings.json'))).notifyLauncherUpdates, false);
  await win.setSize(760, 700);
  await run('document.querySelector(".notif-btn").click()');
  await shot('narrow');
  assert.equal(await run('document.querySelector(".notif-pop").getBoundingClientRect().right<=innerWidth'), true);
  assert.deepEqual(errors, []);
  console.log('PASS: real renderer/preload/CSS + persisted notifications service; 3 notice types, live badge, XSS-safe text, mark read/all, dismiss, update modal, instance action, refresh, settings navigation/persistence, narrow layout.');
  console.log(JSON.stringify({ root, screenshots: ['empty','populated','update-details','settings','narrow'].map(n=>path.join(root,n+'.png')), calls: calls.length }));
  clearTimeout(timer); server.close(); app.exit(0);
}).catch(err => { console.error(err); console.error('Renderer errors:', errors); clearTimeout(timer); server?.close(); app.exit(1); });
