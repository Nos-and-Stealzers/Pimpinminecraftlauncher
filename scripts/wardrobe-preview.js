// Run with: node_modules/.bin/electron scripts/wardrobe-preview.js
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const { createWardrobe } = require('../src/main/wardrobe');
const { CHARACTERS, skin } = require('../src/main/wardrobe-art');

app.whenReady().then(async () => {
  const output = process.env.WARDROBE_OUTPUT || path.join(process.env.TMPDIR || path.join(app.getPath('home'), 'AppData/Local/hermes/cache/scratch'), 'wardrobe-preview');
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const wardrobe = createWardrobe(profile);
  const renderer = path.resolve(__dirname, '../src/renderer');
  let window;
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/app.css"></head>
  <body data-theme="modern" style="display:block;overflow:auto;background:var(--bg-0)"><main id="page" style="padding:32px"></main><div id="toasts"></div><div id="modal-root"></div>
  <script type="module">import {render} from '/js/pages/wardrobe.js';import {state} from '/js/state.js';state.accounts={accounts:[{id:'preview',name:'Preview only',type:'msa'}],active:'preview'};window.cleanup=render(document.querySelector('#page'));window.ready=true;</script></body></html>`;
  const server = http.createServer(async (request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
    const file = path.resolve(renderer, '.' + decodeURIComponent(request.url.split('?')[0]));
    if (!file.startsWith(renderer + path.sep)) { response.writeHead(403); response.end(); return; }
    try {
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  ipcMain.handle('rpc', async (_event, channel, args) => {
    const methods = { 'wardrobe:list': 'listSkins', 'wardrobe:select': 'selectSkin', 'wardrobe:import': 'importSkin', 'wardrobe:export': 'exportSkin', 'wardrobe:delete': 'deleteSkin' };
    try {
      if (!methods[channel]) throw new Error('Unexpected test IPC: ' + channel);
      return { ok: true, data: await wardrobe[methods[channel]](...args) };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  window = new BrowserWindow({ width: 1280, height: 1000, show: true, backgroundColor: '#111214', webPreferences: { preload: path.resolve(__dirname, '../src/main/preload.js'), contextIsolation: true, sandbox: true } });
  const errors = [];
  window.webContents.on('console-message', (details) => { if (details.level === 'error') { errors.push(details.message); console.error('Renderer:', details.message); } });
  await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
  const run = (code) => window.webContents.executeJavaScript(code).catch((error) => { console.error('Evaluation:', code); throw error; });
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await run(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out: ' + expression);
  };
  try {
    await waitFor('document.querySelectorAll(".wardrobe-card .mc-model").length === 6 && !!document.querySelector(".wardrobe-preview .mc-model")');
    assert.equal(await run('document.querySelectorAll(".wardrobe-preview .face").length'), 72);
    assert.equal(await run('document.body.textContent.includes("does not change your in-game or online skin")'), true);
    await fs.writeFile(path.join(output, 'wardrobe-ui.png'), (await window.webContents.capturePage()).toPNG());
    await run('document.querySelectorAll(".wardrobe-card")[2].click()');
    await waitFor('document.querySelector(".wardrobe-details h2")?.textContent === "Fern, the ranger" && !!document.querySelector(".wardrobe-preview .mc-model")');
    assert.equal(await run('document.querySelector("#wardrobe-model").value'), 'slim');
    assert.equal(await run('document.querySelector(".wardrobe-preview .rarm").style.width'), '21px');
    await run(`document.querySelector('[aria-label="Rotate preview right"]').click()`);
    await waitFor('document.querySelector(".wardrobe-preview .mc-spin").style.transform.includes("20deg")');
    await run('document.querySelector("#wardrobe-model").value="classic";document.querySelector("#wardrobe-model").dispatchEvent(new Event("change"))');
    await waitFor('document.querySelector(".wardrobe-preview .rarm")?.style.width === "28px"');
    assert.equal((await wardrobe.listSkins()).selected.model, 'classic');
    const exportedFile = path.join(output, 'wardrobe-ui-export.png');
    const downloaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PNG download timed out.')), 10000);
      window.webContents.session.once('will-download', (_event, download) => {
        download.setSavePath(exportedFile);
        download.once('done', (_event, state) => { clearTimeout(timer); state === 'completed' ? resolve() : reject(new Error('PNG download ' + state)); });
      });
    });
    await run('document.querySelector(".wardrobe-actions button").click()');
    await downloaded;
    assert.deepEqual(await fs.readFile(exportedFile), skin('ranger').toPNG());
    const importURL = skin('ranger').toPNG().toString('base64');
    await run(`{const bytes=Uint8Array.from(atob(${JSON.stringify(importURL)}), c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes], 'Imported ranger.png', {type:'image/png'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change'));}`);
    await waitFor('document.querySelectorAll(".wardrobe-card").length === 7');
    const imports = await wardrobe.listSkins();
    await run(`window.cleanup();document.querySelector('#page').replaceChildren();import('/js/pages/wardrobe.js').then(({render})=>{window.cleanup=render(document.querySelector('#page'));})`);
    await waitFor('document.querySelectorAll(".wardrobe-card").length === 7 && document.querySelector(".wardrobe-details h2")?.textContent === "Imported ranger" && !!document.querySelector(".wardrobe-preview .mc-model")');
    assert.equal(await run('document.querySelector(".wardrobe-actions").textContent.includes("Delete import")'), true);
    await run('Array.from(document.querySelectorAll(".wardrobe-actions button")).find(button => button.textContent.includes("Delete import")).click()');
    await waitFor('!!document.querySelector(".modal-foot .danger")');
    await run('document.querySelector(".modal-foot .danger").click()');
    await waitFor('document.querySelectorAll(".wardrobe-card").length === 6');
    assert.equal((await wardrobe.listSkins()).skins.some((entry) => entry.id === imports.selected.id), false);

    await run(`window.cleanup();document.querySelector('#page').innerHTML='<h1 style="margin-bottom:12px">Pimpin wardrobe · Original characters</h1><p class="muted">Six original 64 x 64 skins. Preview and export only.</p><div id="contact" style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px"></div>';`);
    for (const c of CHARACTERS) {
      const png = skin(c.id).toPNG();
      assert.deepEqual(nativeImage.createFromBuffer(png).getSize(), { width: 64, height: 64 });
      await fs.writeFile(path.join(output, `wardrobe-${c.id}.png`), png);
      const url = 'data:image/png;base64,' + png.toString('base64');
      await run(`(async()=>{const {el}=await import('/js/dom.js');const {mountSkinTexture}=await import('/js/skin3d.js');const card=el('section',{style:{background:'var(--bg-1)',border:'1px solid var(--line)',borderRadius:'8px',padding:'16px'}},el('b',{},${JSON.stringify(c.name)}));const models=el('div',{style:{display:'flex',justifyContent:'space-around',height:'260px',alignItems:'center'}});card.append(models);document.querySelector('#contact').append(card);for(const back of [false,true]){const host=el('div');models.append(host);await mountSkinTexture(host,${JSON.stringify(url)},{model:${JSON.stringify(c.model)},scale:5.5,interactive:false});if(back)host.querySelector('.mc-spin').style.transform='rotateX(-6deg) rotateY(155deg)';}card.append(el('p',{class:'muted',style:{fontSize:'12px',margin:0}},${JSON.stringify(c.outfit + ' · ' + c.model)}));})()`);
    }
    await waitFor('document.querySelectorAll("#contact section .mc-model").length === 12');
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await new Promise((resolve) => setTimeout(resolve, 250));
    await fs.writeFile(path.join(output, 'wardrobe-contact-sheet.png'), (await window.webContents.capturePage()).toPNG());
    assert.deepEqual(errors, []);
    console.log('Wardrobe Electron: real 3D mounts, 72 faces, selection, slim/classic width, rotation, persistence, FileReader import, byte-exact PNG download, confirmed delete, native PNG decode verified.');
    console.log('Visual artifacts: ' + output);
  } finally {
    window.destroy(); server.close(); app.quit();
  }
}).catch((error) => { console.error(error); app.exit(1); });
