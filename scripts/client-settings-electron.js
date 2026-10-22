// Isolated Electron fixture: real page, preload, CSS and settings service.
// Packs/shaders/presets are clearly labelled fixture services; no Minecraft runs.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
assert.ok(process.env.TMPDIR, 'Set TMPDIR to an isolated scratch directory.');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('remote-debugging-port', '0');
let win, server;
const root = require('fs').mkdtempSync(path.join(process.env.TMPDIR, 'pimpin-settings-electron-'));
process.env.PIMPIN_ROOT = root;
app.setPath('userData', path.join(root, 'electron-profile'));
const errors = [];
const timeout = setTimeout(() => { console.error('Fixture timed out'); app.exit(1); }, 60000);
app.whenReady().then(async () => {
  const output = path.join(root, 'screenshots');
  await fs.mkdir(output);
  const service = require('../src/main/client-settings');
  const instances = require('../src/main/instances');
  const fixtureDir = path.join(root, 'instances/fixture');
  await fs.mkdir(fixtureDir, { recursive: true });
  const inst = { id: 'fixture', name: 'Fixture instance', mcVersion: '1.21.4', loader: 'fabric' };
  await fs.writeFile(path.join(fixtureDir, 'pimpin-instance.json'), JSON.stringify(inst));
  const renderer = path.resolve(__dirname, '../src/renderer');
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/app.css"></head>
  <body data-theme="modern" style="display:block;overflow:auto;background:var(--bg-0)"><main id="page" style="padding:24px;max-width:1100px;margin:auto"><p class="hint">Fixture services · Disposable instance · No game or account access</p></main><div id="toasts"></div><div id="modal-root"></div>
  <script type="module">import {drawPimpin} from '/js/pages/pimpin.js';import {state} from '/js/state.js';window.fixtureState=state;await drawPimpin(document.querySelector('#page'),${JSON.stringify(inst)});window.fixtureReady=true;</script></body></html>`;
  server = http.createServer(async (request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
    const file = path.resolve(renderer, '.' + decodeURIComponent(request.url.split('?')[0]));
    if (!file.startsWith(renderer + path.sep)) { response.writeHead(403); response.end(); return; }
    try { response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream'); response.end(await fs.readFile(file)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const calls = [];
  ipcMain.handle('rpc', async (_event, channel, args) => {
    calls.push({ channel, args });
    try {
      const methods = {
        'client-settings:get': id => service.get(id),
        'client-settings:update': (id, patch, revision) => service.update(id, patch, revision),
        'packs:status': async () => [], 'shaders:status': async () => [], 'game:presets': async () => [],
      };
      if (!methods[channel]) throw new Error('Unexpected fixture IPC: ' + channel);
      return { ok: true, data: await methods[channel](...args) };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  win = new BrowserWindow({ width: 1200, height: 1000, show: true, backgroundColor: '#111214', webPreferences: { preload: path.resolve(__dirname, '../src/main/preload.js'), contextIsolation: true, sandbox: true } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const run = code => win.webContents.executeJavaScript(code).catch(error => { console.error('Fixture evaluation:', code, 'Renderer errors:', errors); throw error; });
  const wait = async expression => { for (let n = 0; n < 160; n++) { if (await run(expression)) return; await new Promise(resolve => setTimeout(resolve, 30)); } throw new Error('Timed out: ' + expression); };
  const screenshot = async name => { await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'); await new Promise(resolve => setTimeout(resolve, 150)); await fs.writeFile(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  await wait('window.fixtureReady && !!document.querySelector("#client-setting-hud")');
  assert.equal(await run('document.querySelector("#client-settings-save").disabled'), true);
  await run('document.querySelector("#client-setting-hudOpacity").value="101";document.querySelector("#client-setting-hudOpacity").dispatchEvent(new Event("input"));Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Quality of life").click();document.querySelector("#client-settings-save").click()');
  await wait('!document.querySelector("#client-setting-hudOpacity").closest("section").hidden');
  assert.equal(calls.some(c => c.channel === 'client-settings:update'), false);
  await run('document.querySelector("#client-setting-hudOpacity").value="55";document.querySelector("#client-setting-hudOpacity").dispatchEvent(new Event("input"))');
  await screenshot('hud-defaults');
  await run('document.querySelector("#client-setting-showBiome").click();document.querySelector("#client-settings-save").click()');
  await wait('document.querySelector("section[aria-label] [role=status]").textContent.includes("Saved for")');
  const file = path.join(fixtureDir, 'config/pimpin-client.json');
  assert.deepEqual(JSON.parse(await fs.readFile(file)), { showBiome: true });
  assert.deepEqual(calls.find(c => c.channel === 'client-settings:update').args.slice(0, 2), ['fixture', { showBiome: true }]);
  await run('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Minimap").click()');
  await screenshot('minimap');
  await run('document.querySelector("#client-setting-minimapSize").value="128";document.querySelector("#client-setting-minimapSize").dispatchEvent(new Event("input"));document.querySelector("#client-settings-save").click()');
  await wait('document.querySelector("#client-settings-save").disabled');
  await wait('document.querySelector("section[aria-label] [role=status]").textContent.includes("Saved for")');
  assert.equal(JSON.parse(await fs.readFile(file)).minimapSize, 128);
  await run('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Quality of life").click()');
  await screenshot('quality-of-life');
  await run('document.querySelector("#client-setting-toggleSprint").click();window.fixtureState.game.fixture={state:"running"};document.querySelector("#client-settings-save").click()');
  await wait('document.querySelector("[role=alert]")?.textContent.includes("Stop Minecraft")');
  assert.equal(JSON.parse(await fs.readFile(file)).toggleSprint, undefined);
  await run('window.fixtureState.game.fixture={state:"stopped"}');
  let release;
  const held = instances.withStopped('fixture', () => new Promise(resolve => { release = resolve; }));
  await run('document.querySelector("#client-settings-save").click()');
  await wait('document.querySelector("[role=alert]")?.textContent.includes("other tasks")');
  release(); await held;
  await run('document.querySelector("#client-settings-save").click()');
  await wait('document.querySelector("[role=status]")?.textContent.includes("Saved for")');
  assert.equal(JSON.parse(await fs.readFile(file)).toggleSprint, true);
  await win.setSize(760, 1000);
  await screenshot('narrow-qol');
  assert.equal(await run('document.documentElement.scrollWidth <= window.innerWidth'), true);
  await fs.writeFile(file, '{ invalid fixture JSON');
  await run('document.querySelector("#client-settings-reload").click()');
  await wait('document.querySelector("[role=alert]")?.textContent.includes("Cannot parse")');
  await screenshot('malformed-json');
  assert.equal(await fs.readFile(file, 'utf8'), '{ invalid fixture JSON');
  assert.equal(await run('document.querySelector("#client-setting-toggleSprint").disabled'), true);
  assert.equal(await run('document.querySelector("#client-settings-save").disabled'), true);
  assert.deepEqual(errors, []);
  console.log('PASS Electron fixture: actual Pimpin page/preload/CSS, explicit-ID IPC, checkbox/numeric saves read back on disk, groups, running and maintenance rejection, retry, narrow layout, readable malformed JSON.');
  console.log('Screenshots: ' + output);
  console.log('Disposable PIMPIN_ROOT: ' + root);
}).then(() => { clearTimeout(timeout); win?.destroy(); server?.close(); app.quit(); }).catch(error => { console.error(error); clearTimeout(timeout); win?.destroy(); server?.close(); app.exit(1); });
