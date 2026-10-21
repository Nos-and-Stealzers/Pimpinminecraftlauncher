// Run with node_modules/.bin/electron scripts/screenshots-preview.js.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const fs = require('fs/promises');
const syncFs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const { createScreenshots } = require('../src/main/screenshots');
const { png } = require('./screenshots-fixtures');

assert.ok(process.env.TMPDIR, 'TMPDIR scratch is required');
const output = syncFs.mkdtempSync(path.join(process.env.TMPDIR, 'screenshots-preview-'));
app.setPath('userData', path.join(output, 'electron-profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const instancesRoot = path.join(output, 'instances');
  const folder = path.join(instancesRoot, 'fixture', 'screenshots');
  await fs.mkdir(folder, { recursive: true });
  for (let index = 0; index < 3; index++) {
    const name = ['2026-10-18_forest.png', '2026-10-19_sunset.png', '2026-10-20_night.png'][index];
    await fs.writeFile(path.join(folder, name), png(960, 540, index));
    await fs.utimes(path.join(folder, name), 1792386000 + index * 86400, 1792386000 + index * 86400);
  }
  let copied, failNext = false, delayList = false, releaseList;
  const calls = [];
  const manager = createScreenshots({ instancesRoot, nativeImage, clipboard: { writeImage(image) { copied = image; } } });
  const renderer = path.resolve(__dirname, '../src/renderer');
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/screenshots.css"></head><body data-theme="modern" style="display:block;overflow:auto;background:var(--bg-0)"><main style="padding:28px"><h1>Screenshots</h1><p class="muted">Isolated renderer fixture | Synthetic images, no real Minecraft data</p><div id="page"></div></main><div id="toasts"></div><div id="modal-root"></div><script type="module">import {renderScreenshots} from '/js/screenshots.js';window.mount=()=>{window.cleanup=renderScreenshots(document.querySelector('#page'),{id:'fixture',name:'Screenshot fixture'});};window.mount();</script></body></html>`;
  const server = http.createServer(async (request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
    const requested = request.url.split('?')[0];
    const file = requested === '/screenshots.css' ? path.join(__dirname, 'screenshots.css') : path.resolve(renderer, '.' + decodeURIComponent(requested));
    if (requested !== '/screenshots.css' && !file.startsWith(renderer + path.sep)) { response.writeHead(403); response.end(); return; }
    try {
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  ipcMain.handle('rpc', async (_event, channel, args) => {
    calls.push({ channel, args });
    try {
      assert.equal(args[0], 'fixture');
      if (channel === 'screenshots:list') {
        assert.equal(args.length, 1);
        if (delayList) { await new Promise((resolve) => { releaseList = resolve; }); }
        if (failNext) { failNext = false; throw new Error('Fixture refresh failed'); }
        const listing = await manager.list(args[0]);
        for (const shot of listing.screenshots) shot.url = 'data:image/png;base64,' + (await manager.bytes(args[0], shot.name)).toString('base64');
        return { ok: true, data: listing };
      }
      if (channel === 'screenshots:favorite') { assert.equal(args.length, 3); return { ok: true, data: await manager.favorite(...args) }; }
      assert.equal(args.length, 2, 'Renderer must not supply an export path');
      const methods = { 'screenshots:copy': 'copy', 'screenshots:delete': 'remove' };
      if (methods[channel]) return { ok: true, data: await manager[methods[channel]](...args) };
      if (channel === 'screenshots:export') return { ok: true, data: await manager.exportWithDialog(...args, async (options) => {
        assert.equal(options.defaultPath, args[1]);
        return { canceled: false, filePath: path.join(output, 'dialog-export.png') };
      }) };
      throw new Error('Unexpected fixture IPC: ' + channel);
    } catch (error) { return { ok: false, error: error.message }; }
  });
  const window = new BrowserWindow({ width: 1220, height: 960, show: true, backgroundColor: '#111214', webPreferences: { preload: path.resolve(__dirname, '../src/main/preload.js'), contextIsolation: true, sandbox: true } });
  const errors = [];
  window.webContents.on('console-message', (details) => { if (details.level === 'error') errors.push(details.message); });
  const run = (code) => window.webContents.executeJavaScript(code).catch((error) => { console.error('Evaluation failed:', code, errors); throw error; });
  const wait = async (expression) => {
    for (let attempt = 0; attempt < 160; attempt++) {
      if (await run(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error('Timed out: ' + expression);
  };
  const click = (selector) => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const search = (value) => run(`{const input=document.querySelector('input[type=search]');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input'));}`);
  const settle = () => wait('!document.querySelector(".shots-toolbar button").disabled');
  const capture = async (name) => {
    await run('Promise.all(Array.from(document.images).map(image => image.decode().catch(()=>{})))');
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await new Promise((resolve) => setTimeout(resolve, 200));
    await fs.writeFile(path.join(output, name), (await window.webContents.capturePage()).toPNG());
  };
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
    await wait('document.querySelectorAll(".shots-card").length === 3');
    await settle();
    assert.equal(await run('document.querySelector(".shots-preview strong").textContent'), '2026-10-20_night.png');
    await capture('gallery.png');
    await search('SUNSET');
    assert.equal(await run('document.querySelectorAll(".shots-card").length'), 1);
    await search('does-not-exist');
    assert.equal(await run('document.querySelector(".shots-gallery").textContent.includes("No screenshots match")'), true);
    await search('');
    await run(`{const select=document.querySelector('select');select.value='oldest';select.dispatchEvent(new Event('change'));}`);
    assert.equal(await run('document.querySelector(".shots-card-name").textContent'), '2026-10-18_forest.png');
    await click('.shots-card');
    assert.equal(await run('document.activeElement.id'), 'page');
    await run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));`);
    assert.equal(await run('document.querySelector(".shots-preview strong").textContent'), '2026-10-20_night.png');
    await run(`{const input=document.querySelector('input[type=search]');input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));}`);
    assert.equal(await run('document.querySelector(".shots-preview strong").textContent'), '2026-10-20_night.png');
    await click('.shots-preview [data-action=favorite]'); await settle();
    assert.equal((await manager.list('fixture')).screenshots[0].favorite, true);
    await click('.shots-filter input');
    assert.equal(await run('document.querySelectorAll(".shots-card").length'), 1);
    await run('window.cleanup();window.mount()'); await settle();
    assert.equal(await run('document.querySelector(".shots-preview [data-action=favorite]").textContent'), 'Unfavorite');
    await click('.shots-preview [data-action=copy]'); await settle();
    assert.deepEqual(copied.getSize(), { width: 960, height: 540 });
    assert.deepEqual(copied.toBitmap(), nativeImage.createFromBuffer(await manager.bytes('fixture', '2026-10-20_night.png')).toBitmap());
    await click('.shots-preview [data-action=export]'); await settle();
    assert.deepEqual(await fs.readFile(path.join(output, 'dialog-export.png')), await manager.bytes('fixture', '2026-10-20_night.png'));
    await click('.shots-preview [data-action=full]');
    await wait('!!document.querySelector("dialog[open]")');
    assert.equal(await run('document.querySelector(".shots-full-scroll img").naturalWidth'), 960);
    assert.equal(await run('getComputedStyle(document.querySelector(".shots-full-scroll img")).maxWidth'), 'none');
    await capture('full-size.png');
    await run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));`);
    await click('.shots-full [data-action=delete]');
    await wait('!!document.querySelector(".modal-foot .danger")');
    await click('.modal-foot button:first-child'); await settle();
    assert.equal((await manager.list('fixture')).screenshots.length, 3);
    await click('.shots-preview [data-action=delete]');
    await wait('!!document.querySelector(".modal-foot .danger")');
    await capture('delete-confirmation.png');
    await click('.modal-foot .danger'); await settle();
    assert.equal((await manager.list('fixture')).screenshots.length, 2);
    await fs.writeFile(path.join(folder, 'fresh.png'), png(128, 72));
    await click('.shots-toolbar button'); await settle();
    assert.equal(await run('document.querySelectorAll(".shots-card").length'), 3);
    failNext = true;
    await click('.shots-toolbar button'); await settle();
    assert.equal(await run('document.querySelector("[role=alert]").textContent'), 'Fixture refresh failed');
    await click('.shots-toolbar button'); await settle();
    assert.equal(await run('document.querySelector("[role=alert]").hidden'), true);
    window.setSize(720, 920);
    await capture('narrow.png');
    await click('.shots-preview [data-action=delete]');
    await wait('!!document.querySelector(".modal-foot .danger")');
    await run('window.cleanup()');
    await wait('document.querySelectorAll(".modal-wrap").length===0');
    assert.equal((await manager.list('fixture')).screenshots.length, 3);
    delayList = true;
    await run('window.mount()');
    for (let attempt = 0; !releaseList && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(releaseList);
    await run('window.cleanup();document.querySelector("#page").textContent="Next tab";');
    releaseList();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(await run('document.querySelector("#page").textContent'), 'Next tab');
    assert.deepEqual(errors, []);
    assert.ok(calls.filter((call) => call.channel === 'screenshots:export').every((call) => call.args.length === 2));
    console.log('Screenshot renderer PASS: search, sort, repeated keyboard navigation, full-size, persisted favorites, image copy, byte-exact export, delete cancel/confirm, refresh/error recovery, narrow layout, pending request/modal cleanup.');
    console.log('Artifacts: ' + output);
  } finally { window.destroy(); server.close(); app.quit(); }
}).catch((error) => { console.error(error); app.exit(1); });
