// Isolated Electron UI test for the install review popup. Runs the REAL
// main-process install code (content.js + net.js) with Modrinth stubbed and a
// fake CDN behind global fetch, the real preload, the real
// install-review.js module and the real stylesheet. Nothing touches the
// network, %APPDATA% or real instances: everything lives in a TMPDIR scratch root.
//   TMPDIR=<scratch> npx electron scripts/install-review-electron.js
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs/promises');
const fss = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert/strict');

assert.ok(process.env.TMPDIR, 'Set TMPDIR to isolated scratch.');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('remote-debugging-port', '0');
const root = fss.mkdtempSync(path.join(process.env.TMPDIR, 'pimpin-install-review-'));
app.setPath('userData', path.join(root, 'profile'));
process.env.PIMPIN_ROOT = root;

const errors = [];
const opened = [];
let win;
let server;
const timer = setTimeout(() => { console.error('Fixture timeout'); app.exit(1); }, 90000);

// ---------------------------------------------------------- fake world --
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const MR_CDN = 'https://cdn.modrinth.test';
const ICONS = 'https://icons.fixture.test';
const COLORS = { sodiumextra: '#6c8ebf', reeses: '#b07cc6', fabricapi: '#c9a46a', create: '#d08a3b', flywheel: '#4f9f8a', blocked: '#9a6a6a', broken: '#777' };
const projects = {};
const versions = {};
function project(id, title, deps, size, icon) {
  const bytes = Buffer.alloc(size, id.charCodeAt(0));
  projects[id] = { id, slug: id, title, icon_url: `${ICONS}/${icon}.svg`, project_type: 'mod' };
  versions[`${id}-v1`] = { id: `${id}-v1`, project_id: id, version_number: { sodiumextra: '0.6.1', reeses: '1.8.3', fabricapi: '0.119.2' }[id] || '1.0.0', version_type: 'release', files: [{ primary: true, filename: `${id}.jar`, url: `${MR_CDN}/${id}.jar`, size, hashes: { sha1: sha1(bytes) } }], dependencies: deps.map((d) => ({ project_id: d, dependency_type: 'required' })), _bytes: bytes };
}
project('sodiumextra', 'Sodium Extra', ['reeses', 'fabricapi'], 1_250_000, 'sodiumextra');
project('reeses', "Reese's Sodium Options", ['fabricapi'], 236_000, 'reeses');
project('fabricapi', 'Fabric API', [], 2_410_000, 'fabricapi');
project('iris', 'Iris', [], 900_000, 'reeses');
project('addonpack', 'Addon Pack', ['fabricapi', 'broken'], 300_000, 'flywheel');
// a required dependency with no file for this Minecraft version
projects.broken = { id: 'broken', slug: 'broken', title: 'Old Library', icon_url: `${ICONS}/broken.svg`, project_type: 'mod' };

const modrinthPath = require.resolve('../src/main/modrinth');
require.cache[modrinthPath] = {
  id: modrinthPath, filename: modrinthPath, loaded: true,
  exports: {
    getVersions: async (pid) => [versions[`${pid}-v1`]].filter(Boolean),
    getVersion: async (vid) => versions[vid],
    getProject: async (pid) => projects[pid],
    getProjects: async (ids) => ids.map((i) => projects[i]).filter(Boolean),
    latestForHashes: async () => ({}),
    versionsForHashes: async () => ({}),
  },
};

const gates = new Map(); // file id -> { at: fraction, release() }
function gate(id, at) {
  let release;
  const p = new Promise((r) => { release = r; });
  gates.set(id, { at, p, release });
}
function streamBytes(id, bytes) {
  const g = gates.get(id);
  let sent = 0;
  const chunk = 64 * 1024;
  const body = new ReadableStream({
    async pull(ctl) {
      if (sent >= bytes.length) return ctl.close();
      if (g && sent >= bytes.length * g.at) await g.p;
      const next = bytes.subarray(sent, Math.min(bytes.length, sent + chunk));
      sent += next.length;
      ctl.enqueue(new Uint8Array(next));
      await new Promise((r) => setTimeout(r, 4));
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Length': String(bytes.length) } });
}

const realFetch = global.fetch;
global.fetch = async (input, opts = {}) => {
  const url = String(input);
  if (url.startsWith(MR_CDN)) {
    const id = url.slice(MR_CDN.length + 1).replace(/\.jar$/, '');
    return streamBytes(id, versions[`${id}-v1`]._bytes);
  }
  if (url.startsWith('https://')) throw new Error('Fixture blocks network: ' + url);
  return realFetch(input, opts);
};

app.whenReady().then(async () => {
  const store = require('../src/main/store');
  assert.ok(path.resolve(store.dirs.root).startsWith(path.resolve(process.env.TMPDIR)), 'fixture must use the scratch root');
  const content = require('../src/main/content');
  content.setEmitter((ch, payload) => win?.webContents.send(ch, payload));

  const holder = (name) => {
    const dir = path.join(root, 'instances', name);
    fss.mkdirSync(path.join(dir, 'mods'), { recursive: true });
    let meta = { content: [] };
    return { kind: 'instance', dir, mcVersion: '1.21.4', loader: 'fabric', load: async () => JSON.parse(JSON.stringify(meta)), save: async (m) => { meta = JSON.parse(JSON.stringify(m)); } };
  };

  const renderer = path.resolve(__dirname, '../src/renderer');
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/app.css"></head>
  <body data-theme="modern" style="display:block"><header class="titlebar"><div class="brand"><img src="/img/logo.svg" class="brand-logo"><span class="brand-name">Pimpin Launcher</span></div><div class="titlebar-center"></div><div class="titlebar-right"></div></header>
  <main id="page" style="padding:32px;margin-top:38px;overflow:auto;height:calc(100vh - 38px)"><h1 class="page-title">Library</h1><p class="page-sub">Install review fixture. Real install code, fake library and downloads.</p>
  <div class="lib-grid" style="margin-top:20px">${['Sodium Extra', 'Create Fabric', 'Iris Shaders', 'Lithium', 'Mod Menu', 'Zoomify'].map((t) => `<div class="card proj"><div class="proj-icon ph"></div><div class="body"><div class="title">${t}</div><div class="author">by Someone</div><div class="desc">Fixture card so the popup is seen over a real page.</div></div></div>`).join('')}</div></main>
  <div class="toasts" id="toasts"></div><div id="modal-root"></div>
  <script type="module">import {installReview} from '/js/install-review.js';installReview();window.fixtureReady=true;</script></body></html>`;
  server = http.createServer(async (req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    const f = path.resolve(renderer, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(renderer + path.sep)) { res.writeHead(403); res.end(); return; }
    try { res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream'); res.end(await fs.readFile(f)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  ipcMain.handle('rpc', async (_e, channel, args) => {
    const methods = {
      'content:cancel': (id) => content.cancel(String(id)),
      'shell:openExternal': (url) => { opened.push(url); return true; },
      // library page fixture (no network): one Modrinth hit
      'library:search': () => ({ hits: [{ project_id: 'sodiumextra', title: 'Sodium Extra', author: 'FlashyReese', description: 'Features that should be in Sodium.', downloads: 41000000, follows: 9000, icon_url: `${ICONS}/sodiumextra.svg` }], total_hits: 1 }),
      'content:list': () => [],
    };
    try { if (!methods[channel]) throw new Error('Unexpected fixture IPC: ' + channel); return { ok: true, data: await methods[channel](...args) }; }
    catch (err) { return { ok: false, error: err.message }; }
  });

  win = new BrowserWindow({ width: 1100, height: 760, show: true, backgroundColor: '#111214', webPreferences: { preload: path.resolve(__dirname, '../src/main/preload.js'), contextIsolation: true, sandbox: true } });
  // fixture icons: small flat squares, served without network
  win.webContents.session.protocol.handle('https', (req) => {
    const u = new URL(req.url);
    if (u.origin !== ICONS) return new Response('offline fixture', { status: 404 });
    const key = u.pathname.slice(1).replace(/\.svg$/, '');
    const c = COLORS[key] || '#666';
    const letter = key[0].toUpperCase();
    return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="8" fill="${c}"/><text x="24" y="31" font-family="Segoe UI,sans-serif" font-size="22" font-weight="600" fill="#fff" text-anchor="middle">${letter}</text></svg>`, { headers: { 'Content-Type': 'image/svg+xml' } });
  });
  win.webContents.on('console-message', (d) => { if (d.level === 'error' && !/404|Failed to load resource/.test(d.message)) errors.push(d.message); });
  const run = (code) => win.webContents.executeJavaScript(code);
  const wait = async (expr, ms = 8000) => { for (let i = 0; i < ms / 25; i++) { if (await run(expr)) return; await new Promise((r) => setTimeout(r, 25)); } throw new Error('Timed out: ' + expr); };
  const shots = [];
  const shot = async (name) => {
    await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    await new Promise((r) => setTimeout(r, 200));
    const p = path.join(root, `${name}.png`);
    await fs.writeFile(p, (await win.webContents.capturePage()).toPNG());
    shots.push(p);
  };
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  await wait('window.fixtureReady');

  // 1) Library install with two required dependencies, caught mid-download.
  gate('reeses', 0.45);
  const h1 = holder('survival');
  const first = content.install(h1, { projectId: 'sodiumextra', type: 'mod' });
  await wait('document.querySelectorAll(".install-review .ir-item").length===3');
  assert.equal(await run('document.querySelector(".install-review .ir-title b").textContent'), 'Installing Sodium Extra and 2 required dependencies');
  assert.equal(await run('document.querySelector(".install-review .ir-title span").textContent'), "Reese's Sodium Options, Fabric API");
  await wait('document.querySelector(".install-review .ir-item.downloading")?.textContent.includes("Reese")');
  await wait('parseInt(document.querySelector(".install-review .ir-item.downloading .ir-status .dim").textContent)>=40');
  await shot('install-review-running');
  gates.get('reeses').release();
  const r1 = await first;
  assert.deepEqual(r1.installed, ['Sodium Extra', "Reese's Sodium Options", 'Fabric API']);
  await wait('document.querySelector(".install-review .ir-title b").textContent.startsWith("Installed")');
  assert.equal(await run('document.querySelectorAll(".install-review .ir-status.ok").length'), 3);
  assert.equal(await run('!!document.querySelector(".install-review .ir-cancel")'), false, 'no Cancel once finished');
  await shot('install-review-done');
  await run('document.querySelector(".install-review .ir-hide").click()');
  await wait('!document.querySelector(".install-review")');

  // 2) A required dependency with no compatible file: the rest still installs.
  const h2 = holder('addons');
  const r2 = await content.install(h2, { projectId: 'addonpack', type: 'mod' });
  assert.deepEqual(r2.installed, ['Addon Pack', 'Fabric API']);
  assert.equal(r2.failed.length, 1);
  await wait('document.querySelector(".install-review .ir-foot")?.textContent.includes("1 failed")');
  assert.match(await run('document.querySelector(".install-review .ir-item.failed").textContent'), /Old Library/);
  assert.equal(await run('document.querySelector(".install-review").textContent.includes("CurseForge")'), false);
  await shot('install-review-partial');
  await run('document.querySelector(".install-review .ir-hide").click()');

  // 3) Cancel from the popup mid-download: no partial files, remaining items cancelled.
  gate('fabricapi', 0.3);
  const h3 = holder('cancel');
  const third = content.install(h3, { projectId: 'sodiumextra', type: 'mod' });
  await wait('document.querySelector(".install-review .ir-item.downloading")?.textContent.includes("Fabric API")', 15000);
  await run('document.querySelector(".install-review .ir-cancel").click()');
  const r3 = await third;
  gates.get('fabricapi').release();
  assert.equal(r3.cancelled, true);
  const left = await fs.readdir(path.join(h3.dir, 'mods'));
  assert.equal(left.some((f) => f.endsWith('.part') || f === 'fabricapi.jar'), false, `no partial files: ${left}`);
  await wait('document.querySelector(".install-review .ir-title b").textContent==="Install cancelled"');
  await shot('install-review-cancelled');

  // 4) Narrow window: the card stays inside the viewport.
  await win.setSize(720, 560);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await run('(()=>{const r=document.querySelector(".install-review").getBoundingClientRect();return r.right<=innerWidth&&r.left>=0&&r.bottom<=innerHeight})()'), true);
  await shot('install-review-narrow');

  // copy text rules: sentence case, no em dashes anywhere in the popup
  assert.equal(await run('document.querySelector(".install-review").textContent.includes("\\u2014")'), false);

  // 5) Library page: Modrinth only, an old CurseForge link falls back to it.
  await win.setSize(1100, 760);
  await run('document.querySelector(".install-review .ir-hide")?.click()');
  await run(`(async()=>{const {state}=await import('/js/state.js');state.instances=[{id:'survival',name:'Survival',mcVersion:'1.21.4',loader:'fabric'}];state.servers=[];state.settings={};
    const {render}=await import('/js/pages/library.js');const page=document.querySelector('#page');page.replaceChildren();window.fixtureNav=null;render(page,{source:'curseforge',type:'mod'},(p,a)=>window.fixtureNav={p,a});})()`);
  await wait('document.querySelectorAll(".lib-grid .card.proj").length===1');
  assert.equal(await run('document.querySelector("#page").textContent.includes("CurseForge")'), false);
  assert.equal(await run('!!document.querySelector(".lib-source")'), false);
  await shot('library-modrinth');
  assert.deepEqual(errors, []);
  console.log('PASS: real content.js plans + net.js downloads through the real preload into install-review.js; deps listed, live progress, done, failed dependency row, Cancel from the popup with no partial files, narrow layout.');
  console.log(JSON.stringify({ root, screenshots: shots }));
  clearTimeout(timer); server.close(); app.exit(0);
}).catch((err) => { console.error(err); console.error('Renderer errors:', errors); clearTimeout(timer); server?.close(); app.exit(1); });
