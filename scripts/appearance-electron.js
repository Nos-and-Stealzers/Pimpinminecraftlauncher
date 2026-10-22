// Real launcher renderer, CSS and sandbox preload; disposable settings only.
// Run: node_modules/.bin/electron scripts/appearance-electron.js
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {}); // Reopen inside this fixture, do not quit early.
const scratch = process.env.TMPDIR;
if (!scratch) throw new Error('TMPDIR is required: never test against real launcher data');
let win, server;
app.whenReady().then(async () => {
  const output = path.join(scratch, 'pimpin-appearance');
  await fs.mkdir(output, { recursive: true });
  const root = await fs.mkdtemp(path.join(output, 'fixture-'));
  process.env.PIMPIN_ROOT = root;
  const store = require('../src/main/store');
  app.setPath('userData', path.join(root, 'electron-profile'));
  await store.updateSettings({ startPage: 'settings', onboarded: true, lastSeenVersion: 'fixture', memoryMax: 4096 });
  const renderer = path.resolve(__dirname, '../src/renderer');
  server = http.createServer(async (req, res) => {
    const file = path.resolve(renderer, '.' + decodeURIComponent(req.url === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(renderer + path.sep)) { res.writeHead(403); res.end(); return; }
    try { res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream'); res.end(await fs.readFile(file)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  ipcMain.handle('rpc', async (_e, channel, args) => {
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
        default: throw new Error('Unexpected fixture IPC ' + channel);
      }
      return { ok: true, data };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  const errors = [];
  const open = async () => {
    win = new BrowserWindow({ width: 1280, height: 1000, show: true, backgroundColor: '#111214', webPreferences: { preload: path.resolve(__dirname, '../src/main/preload.js'), contextIsolation: true, sandbox: true } });
    win.webContents.on('console-message', d => { if (d.level === 'error') { errors.push(d.message); console.error('Renderer:', d.message); } });
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  };
  const run = code => win.webContents.executeJavaScript(code).catch(error => { console.error('Evaluation:', code); throw error; });
  const wait = async code => { for (let i=0; i<160; i++) { if (await run(code)) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Timed out: '+code+'; renderer errors: '+errors.join('; ')); };
  const change = async (label, value) => {
    await run(`{const node=document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)});if(!node)throw new Error('Missing control: '+${JSON.stringify(label)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('change',{bubbles:true}));}`);
  };
  const shot = async name => {
    await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    await new Promise(r=>setTimeout(r,200));
    await fs.writeFile(path.join(output,name+'.png'), (await win.webContents.capturePage()).toPNG());
  };
  try {
    await open();
    await wait('!!document.querySelector(".settings")');
    assert.equal(await run('!!document.querySelector(\'[aria-label="Custom accent hex"]\')'), true, 'Custom hex control exists');
    await shot('dark');
    // Test real primary-button CSS, not just the ink token. Include the
    // mid-luminance boundary where a dark grey foreground is insufficient.
    for (const colour of ['#000000', '#ffffff', '#777777', '#808080', '#ff0000', '#00ff00', '#0000ff', '#8f5cf7']) {
      await change('Custom accent hex', colour);
      await wait(`document.body.style.getPropertyValue('--accent') === '${colour}'`);
      const contrast = await run(`(()=>{const button=document.createElement('button');button.className='btn primary';document.body.append(button);const style=getComputedStyle(button);const lum=rgb=>{const c=rgb.match(/[\\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const a=lum(style.backgroundColor),b=lum(style.color);button.remove();return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);})()`);
      assert.ok(contrast >= 4.5, `${colour} primary-button contrast ${contrast} is below 4.5`);
    }
    await run('document.querySelector(\'[aria-label="Light theme"]\').click()');
    await wait('document.body.dataset.theme === "light"');
    await shot('light');
    await change('Custom accent hex', '#f5d742');
    await wait('document.body.style.getPropertyValue("--accent") === "#f5d742"');
    assert.equal(await run('document.body.style.getPropertyValue("--accent-ink")'), '#000000');
    await change('Layout density', 'compact');
    await change('Text size', '115');
    await change('Sidebar width', '270');
    await wait('getComputedStyle(document.querySelector(".sidebar")).width === "270px"');
    assert.equal(await run('getComputedStyle(document.querySelector(".set-row .grow b")).fontSize'), '14.95px');
    assert.equal(await run('getComputedStyle(document.querySelector(".set-list > .set-row")).paddingTop'), '9px');
    await change('Sidebar layout', 'compact');
    await wait('document.body.dataset.sidebar === "compact" && document.body.dataset.density === "compact" && document.body.style.getPropertyValue("--text-scale") === "1.15"');
    await shot('custom-compact');
    await change('Custom accent hex', 'red;display:none');
    assert.equal(await run('document.querySelector(\'[aria-label="Custom accent hex"]\').getAttribute("aria-invalid")'), 'true');
    assert.equal(store.getSettings().customA1, '#f5d742');
    await run('document.querySelector(\'[aria-label="Reduce motion"]\').click()');
    await wait('document.body.classList.contains("reduce-motion")');
    // Native keyboard path, not just synthetic click handlers.
    await run('document.querySelector(\'[aria-label="Dark theme"]\').focus()');
    win.webContents.sendInputEvent({ type:'keyDown', keyCode:'Space' });
    win.webContents.sendInputEvent({ type:'keyUp', keyCode:'Space' });
    await wait('document.body.dataset.theme === "dark"');
    await shot('dark-custom');
    win.destroy(); await open();
    await wait('document.body.dataset.density === "compact" && !!document.querySelector(".settings")');
    assert.equal(await run('document.body.style.getPropertyValue("--accent")'), '#f5d742');
    assert.equal(await run('document.body.classList.contains("reduce-motion")'), true);
    assert.equal(await run('document.querySelector(\'[aria-label="Text size"]\').value'), '115');
    // System palette updates without reopening the settings page.
    nativeTheme.themeSource = 'light';
    await run('document.querySelector(\'[aria-label="System theme"]\').click()');
    await wait('document.body.dataset.theme === "light"');
    nativeTheme.themeSource = 'dark';
    console.log('System-theme transition:', nativeTheme.themeSource, nativeTheme.shouldUseDarkColors, await run('({dark:matchMedia("(prefers-color-scheme: dark)").matches,theme:document.body.dataset.theme})'));
    await wait('document.body.dataset.theme === "dark"');
    await change('Sidebar layout', 'auto');
    win.setSize(720, 1000);
    await wait('innerWidth <= 720');
    assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(await run('getComputedStyle(document.querySelector(".sidebar")).width'), '64px');
    await shot('narrow');
    await run('document.querySelector(\'[aria-label="Reset appearance"]\').click()');
    await wait('document.body.dataset.density === "comfortable" && document.querySelector(\'[aria-label="Text size"]\').value === "100"');
    assert.equal(store.getSettings().memoryMax, 4096);
    assert.equal(store.getSettings().customA1, '#8f5cf7');
    assert.equal(await run('[...document.querySelectorAll(".appearance-section button, .appearance-section input, .appearance-section select")].every(n=>n.getAttribute("aria-label") || n.labels?.length)'), true);
    assert.deepEqual(errors, []);
    console.log('PASS Electron appearance: actual launcher shell/settings/CSS/preload; light/dark/system live changes; custom hex validation and contrast; density/text/sidebar; keyboard Space; reduced motion; persisted reopen; narrow layout; reset preserves memory; no renderer errors.');
    console.log('Screenshots: '+output);
  } finally { win?.destroy(); server?.close(); app.quit(); }
}).catch(error=>{console.error(error); win?.destroy(); server?.close(); app.exit(1);});
