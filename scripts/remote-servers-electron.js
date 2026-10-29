// Real renderer/preload/CSS for the Remote servers view, with the real
// src/main/remote/* modules talking to local fakes (a Minecraft status server,
// an RCON server, a Pterodactyl-style panel and a real Share this PC agent
// over a fixture servers module). Disposable data root, never user data.
// Run: TMPDIR=<scratch> node_modules/.bin/electron scripts/remote-servers-electron.js
const { app, BrowserWindow, ipcMain, nativeImage, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const assert = require('node:assert/strict');

const scratch = process.env.TMPDIR;
if (!scratch) throw new Error('TMPDIR is required; never use launcher user data');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('remote-debugging-port', '0');
// Windows stops painting windows it thinks are covered; screenshots need frames.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.on('window-all-closed', () => {});
const output = fsSync.mkdtempSync(path.join(scratch, 'pimpin-remote-servers-'));
const root = path.join(output, 'data');
process.env.PIMPIN_ROOT = root;
app.setPath('userData', path.join(output, 'electron-profile'));

const KEY = 'ptlc_' + 'F'.repeat(43);
const T0 = Date.now();
const failures = [];
const errors = [];
const closers = [];
let win;

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => { closers.push(() => { srv.closeAllConnections?.(); srv.close(); }); r(srv.address().port); }));

function fakeMinecraft(ping, favicon) {
  const status = { version: { name: 'Paper 1.21.4', protocol: 769 }, players: { online: 3, max: 20, sample: [{ name: 'Alex', id: '1' }, { name: 'Steve', id: '2' }, { name: 'Sunny', id: '3' }] }, description: { text: '§aSky islands survival', extra: [{ text: '\n§7Season 3, whitelist on' }] }, favicon };
  return net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on('error', () => {});
    sock.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      for (;;) {
        const len = ping.readVarInt(buf);
        if (!len || buf.length < len.size + len.value) return;
        const body = buf.subarray(len.size, len.size + len.value);
        buf = buf.subarray(len.size + len.value);
        const id = ping.readVarInt(body);
        if (id.value === 0 && body.length === 1) sock.write(ping.packet(0, ping.writeString(JSON.stringify(status))));
        else if (id.value === 1) setTimeout(() => sock.write(ping.packet(1, body.subarray(id.size))), 12);
      }
    });
  });
}

function fakeRcon(rcon) {
  return net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    let authed = false;
    sock.on('error', () => {});
    sock.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      const { packets, rest } = rcon.decode(buf);
      buf = rest;
      for (const p of packets) {
        if (p.type === 3) { authed = p.body === 'fixture-rcon'; sock.write(rcon.encode(authed ? p.id : -1, 2, '')); }
        else if (p.type === 2 && authed) sock.write(rcon.encode(p.id, 0, p.body === 'list' ? 'There are 3 of a max of 20 players online: Alex, Steve, Sunny' : p.body.startsWith('time') ? 'Set the time to 1000' : `Unknown or incomplete command, see below for error`));
        else sock.write(rcon.encode(p.id, 0, `Unknown request ${p.type}`));
      }
    });
  });
}

function fakePanel(mcPort) {
  return http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(data ? JSON.stringify(data) : ''); };
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { errors: [{ detail: 'Unauthenticated.' }] });
      const attrs = (id, name) => ({ identifier: id, uuid: `${id}-uuid`, name, node: 'Frankfurt 2', limits: { memory: 6144, disk: 20480, cpu: 300 }, server_owner: true, relationships: { allocations: { data: [{ attributes: { ip: '127.0.0.1', ip_alias: null, port: mcPort, is_default: true } }] } } });
      const u = req.url.split('?')[0];
      if (u === '/api/client') return send(200, { data: [{ attributes: attrs('a1b2c3d4', 'Sky islands SMP') }, { attributes: attrs('e5f6a7b8', 'Creative build') }], meta: { pagination: { total_pages: 1 } } });
      if (u === '/api/client/servers/a1b2c3d4') return send(200, { attributes: attrs('a1b2c3d4', 'Sky islands SMP') });
      if (u.endsWith('/resources')) return send(200, { attributes: { current_state: 'running', resources: { memory_bytes: 3.2 * 1024 ** 3, cpu_absolute: 84.2, disk_bytes: 7.6 * 1024 ** 3, uptime: 5 * 3600e3 + 12 * 60e3 } } });
      if (u.endsWith('/websocket')) return send(200, { data: { token: 'fixture-jwt', socket: 'wss://wings.fixture.invalid:8080/api/servers/a1b2c3d4-uuid/ws' } });
      if (u.endsWith('/power') || u.endsWith('/command')) return send(204);
      return send(404, { errors: [{ detail: 'Not found' }] });
    });
  });
}

/** Fixture-only websocket: plays the panel side of the console protocol. */
class FixtureWings {
  constructor(url, opts) {
    this.readyState = 0;
    FixtureWings.last = { url, origin: opts?.headers?.Origin };
    setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 20);
  }
  send(raw) {
    const msg = JSON.parse(raw);
    const out = (event, ...args) => setTimeout(() => this.onmessage?.({ data: JSON.stringify({ event, args }) }), 10);
    if (msg.event === 'auth') out('auth success');
    if (msg.event === 'send logs') {
      for (const line of ['[17:02:11 INFO]: Starting minecraft server version 1.21.4', '[17:02:14 INFO]: Preparing level "world"', '[17:02:19 INFO]: Done (8.214s)! For help, type "help"', '[17:05:40 INFO]: Alex joined the game', '[17:06:02 WARN]: Can\'t keep up! Is the server overloaded? Running 2104ms or 42 ticks behind']) out('console output', `\u001b[0m${line}`);
      out('status', 'running');
    }
    if (msg.event === 'send command') out('console output', `> ${msg.args[0]}`);
  }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
}

app.whenReady().then(async () => {
  const store = require('../src/main/store');
  assert.equal(store.dirs.root, root);
  await store.updateSettings({ onboarded: true, lastSeenVersion: 'fixture', mcStyle: false, textSize: 100 });
  const ping = require('../src/main/remote/ping');
  const rconLib = require('../src/main/remote/rcon');
  const { createRemoteServers } = require('../src/main/remote/remote-servers');
  const { createHostAgent } = require('../src/main/remote/host-agent');

  const favicon = nativeImage.createFromPath(path.resolve(__dirname, '../build/icon.png')).resize({ width: 64, height: 64 }).toDataURL();
  const mcPort = await listen(fakeMinecraft(ping, favicon));
  const rconPort = await listen(fakeRcon(rconLib));
  const panelPort = await listen(fakePanel(mcPort));

  // Share this PC: the real agent over fixture local servers
  const localServers = [
    { id: 'sky-islands', name: 'Sky islands', software: 'paper', mcVersion: '1.21.4', port: mcPort, memory: 4096, running: true, ready: true, started: Date.now() - 3600e3, online: ['Alex'], pluginCount: 4, created: 2 },
    { id: 'vanilla-test', name: 'Vanilla test', software: 'vanilla', mcVersion: '1.20.1', port: 25566, memory: 2048, running: false, ready: false, online: [], pluginCount: 0, created: 1 },
  ];
  const fixtureServers = {
    list: async () => localServers.map((s) => ({ ...s })),
    start: async () => ({ ok: true }), stop: () => {}, restart: async () => {}, command: () => {},
    getLogs: () => ['[17:00:00 INFO]: Done (5.1s)! For help, type "help"', '[17:10:00 INFO]: Alex joined the game'],
    playerInfo: async () => ({ online: ['Alex'], ops: ['Alex', 'Sunny'], whitelist: ['Alex', 'Steve', 'Sunny'], banned: [] }),
  };
  const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);
  const agent = createHostAgent({ servers: fixtureServers, store, root, version: 'fixture', hostname: 'FIXTURE-PC', lanAddresses: () => ['192.168.1.50', '100.88.12.4'] });
  const agentPort = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  await agent.update({ port: agentPort, bind: '127.0.0.1' });
  const remote = createRemoteServers({ root, store, safeStorage, emit: send, WebSocket: FixtureWings, pingFn: (a, o) => ping.ping(a, { ...o, resolveSrv: async () => { throw new Error('no srv'); } }) });
  assert.ok(remote.secureAvailable(), 'Electron safeStorage should work on this machine');

  // seed one connection of each kind through the real store
  const panelConn = await remote.save({ kind: 'pterodactyl', name: 'Sky islands SMP', panelUrl: `http://127.0.0.1:${panelPort}`, serverId: 'a1b2c3d4' }, KEY);
  const rconConn = await remote.save({ kind: 'rcon', name: 'VPS (RCON)', host: '127.0.0.1', port: rconPort, address: `127.0.0.1:${mcPort}` }, 'fixture-rcon');
  const agentState = await agent.update({ enabled: true });
  const pcConn = await remote.save({ kind: 'pimpin', name: 'Sky islands on FIXTURE-PC', host: '127.0.0.1', port: agentPort, serverId: 'sky-islands', gamePort: mcPort, mcVersion: '1.21.4' }, agentState.token);
  await agent.update({ enabled: false }); // the renderer turns it back on through the UI
  const offlinePort = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  await remote.save({ kind: 'address', name: 'Friend\'s server', address: `127.0.0.1:${offlinePort}` });
  const onDisk = await fs.readFile(path.join(root, 'remote-servers.json'), 'utf8') + await fs.readFile(path.join(root, 'remote-secrets.json'), 'utf8');
  assert.doesNotMatch(onDisk, /fixture-rcon|ptlc_F/);

  const renderer = path.resolve(__dirname, '../src/renderer');
  const server = http.createServer(async (req, res) => {
    const name = decodeURIComponent(req.url === '/' ? '/index.html' : req.url.split('?')[0]);
    const file = path.resolve(renderer, '.' + name);
    if (!file.startsWith(renderer + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  const httpPort = await listen(server);
  const rendererCalls = [];
  ipcMain.handle('rpc', async (_e, channel, args) => {
    rendererCalls.push(channel);
    try {
      let data;
      if (channel.startsWith('remote:')) {
        const fn = { 'remote:list': remote.list, 'remote:save': remote.save, 'remote:remove': remote.remove, 'remote:status': remote.status, 'remote:power': remote.power, 'remote:command': remote.command, 'remote:players': remote.players, 'remote:console': (id, on) => remote.console(id, on !== false), 'remote:discover': remote.discover, 'remote:secure': () => ({ available: remote.secureAvailable() }) }[channel];
        if (!fn) throw new Error('Unexpected fixture IPC ' + channel);
        data = await fn(...args);
      } else if (channel.startsWith('remote-host:')) {
        data = await { 'remote-host:status': agent.status, 'remote-host:update': agent.update, 'remote-host:regenerate': agent.regenerate }[channel](...args);
      } else switch (channel) {
        case 'settings:get': data = store.getSettings(); break;
        case 'settings:update': data = await store.updateSettings(args[0]); break;
        case 'window:zoom': break;
        case 'app:info': data = { platform: process.platform, arch: process.arch, version: 'fixture' }; break;
        case 'accounts:list': data = { accounts: [], active: null }; break;
        case 'instances:list': data = []; break;
        case 'servers:list': data = localServers; break;
        case 'servers:network': data = { lan: ['192.168.1.50'] }; break;
        case 'update:get': data = { state: 'idle' }; break;
        case 'notifications:list': data = { items: [], unread: 0 }; break;
        case 'news:get': data = []; break;
        case 'presence:status': data = { enabled: false }; break;
        default: throw new Error('Unexpected fixture IPC ' + channel);
      }
      return { ok: true, data };
    } catch (error) {
      if (/Unexpected fixture IPC/.test(error.message)) errors.push(error.message);
      return { ok: false, error: error.message };
    }
  });

  win = new BrowserWindow({ width: 1280, height: 820, show: true, backgroundColor: '#111214', webPreferences: { preload: path.resolve(__dirname, '../src/main/preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', (d) => { if (d.level === 'error' && !/mc-heads\.net|ERR_NAME|ERR_INTERNET/.test(d.message)) errors.push(d.message); });
  const run = (code) => Promise.race([win.webContents.executeJavaScript(code), new Promise((_, rej) => setTimeout(() => rej(new Error('Renderer did not answer: ' + code.slice(0, 80))), 10000))]);
  const wait = async (code, ms = 8000) => { for (let i = 0; i < ms / 40; i++) { if (await run(code)) return; await new Promise((r) => setTimeout(r, 40)); } throw new Error('Timed out: ' + code); };
  const shots = [];
  const shot = async (name) => {
    win.webContents.invalidate();
    await run('new Promise(r=>{requestAnimationFrame(()=>requestAnimationFrame(r)); setTimeout(r, 1000);})');
    await new Promise((r) => setTimeout(r, 250));
    const file = path.join(output, `${name}.png`);
    await fs.writeFile(file, (await win.webContents.capturePage()).toPNG());
    shots.push(file);
  };
  const test = async (name, fn) => {
    try { await fn(); console.log('PASS', name, ((Date.now() - T0) / 1000).toFixed(1) + 's'); } catch (e) {
      failures.push({ name, error: e.message });
      console.error('FAIL', name, e.message);
      await fs.writeFile(path.join(output, `fail-${failures.length}.png`), (await win.webContents.capturePage()).toPNG()).catch(() => {});
    }
  };
  const text = () => run('document.querySelector("#view").innerText');
  const clickText = (sel, t) => run(`(()=>{const n=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.textContent.trim()===${JSON.stringify(t)}); if(!n) throw new Error('no ${t}'); n.click(); return true})()`);
  const go = (params) => run(`window.pimpinNavigate('servers', ${JSON.stringify(params)})`);

  try {
    await win.loadURL(`http://127.0.0.1:${httpPort}/`);
    await wait('typeof window.pimpinNavigate === "function" && !!document.querySelector("#view")');
    await go({ view: 'local' });

    await test('This PC view shows the switcher and an off Share this PC card', async () => {
      await wait('document.querySelector(".rs-share .switch")');
      const t = await text();
      assert.match(t, /This PC/);
      assert.match(t, /Remote/);
      assert.match(t, /Share this PC/);
      assert.doesNotMatch(t, /Pairing token/);
    });
    await test('turning on Share this PC starts the real agent and shows address and token', async () => {
      await run('document.querySelector(".rs-share .switch input").click()');
      await wait('document.querySelector(".rs-token")');
      const st = await agent.status();
      assert.equal(st.listening, true);
      const t = await text();
      assert.match(t, /192\.168\.1\.50/);
      assert.match(t, /not encrypted/);
      assert.match(t, /Tailscale/);
      assert.doesNotMatch(t, new RegExp(st.token), 'token is hidden until Show');
    });
    await shot('1-this-pc-share');

    await test('Remote view lists every connection with live ping data', async () => {
      await clickText('.seg button', 'Remote');
      await wait('document.querySelectorAll(".rs-card").length === 4');
      await wait('document.querySelectorAll(".rs-card .chip.ok").length === 3 && document.querySelectorAll(".rs-card .rs-motd").length >= 3', 12000);
      const t = await text();
      assert.match(t, /Sky islands survival/);
      assert.match(t, /3\/20/);
      assert.match(t, /Offline/);
      assert.match(t, /Paper 1\.21\.4/);
    });
    await shot('2-remote-list');

    await test('Add connection modal finds panel servers with a client key', async () => {
      await clickText('.page-head button', 'Connect');
      await wait('document.querySelector(".rs-modal .rs-kind.on")');
      await run(`(()=>{const m=document.querySelector('.rs-modal'); const [url]=m.querySelectorAll('input.input'); url.value='http://127.0.0.1:${panelPort}'; m.querySelector('input[type=password]').value='${KEY}'; return true})()`);
      await clickText('.rs-modal button', 'Find servers');
      await wait('document.querySelector(".rs-modal .rs-found").textContent.includes("2 servers")');
      const opts = await run('[...document.querySelectorAll(".rs-modal select option")].map(o=>o.textContent)');
      assert.deepEqual(opts, ['Sky islands SMP · Frankfurt 2', 'Creative build · Frankfurt 2']);
      assert.equal(await run('document.querySelector(".rs-modal input[placeholder=\\"play.example.com\\"]").value'), `127.0.0.1:${mcPort}`);
    });
    await shot('3-add-panel');
    await test('kind picker swaps the fields for another Pimpin PC', async () => {
      await run('[...document.querySelectorAll(".rs-kind")].find(n=>n.textContent.includes("Another PC")).click()');
      await wait('document.querySelector(".rs-modal").textContent.includes("Pairing token")');
      await run(`(()=>{const m=document.querySelector('.rs-modal'); m.querySelector('input[placeholder*="Tailscale"]').value='127.0.0.1'; m.querySelector('input[type=number]').value='${agentPort}'; m.querySelector('input[type=password]').value=${JSON.stringify((await agent.status()).token)}; return true})()`);
      await clickText('.rs-modal button', 'Find servers');
      await wait('document.querySelector(".rs-modal .rs-found").textContent.includes("FIXTURE-PC")');
    });
    await shot('4-add-pimpin');
    await run('document.querySelector(".modal-wrap .modal-head button").click()');

    await test('panel detail shows resources, power and the live console', async () => {
      await go({ remote: panelConn.id });
      await wait('document.querySelectorAll(".rs-stat").length === 4');
      await wait('document.querySelector(".console") && document.querySelector(".console").textContent.includes("Done (8.214s)")');
      const t = await text();
      assert.match(t, /84\.2%/);
      assert.match(t, /of 6\.0 GB/);
      assert.match(t, /5h 12m/);
      assert.ok(await run('!!document.querySelector(".play-btn.running")'), 'online panel server offers Stop');
      assert.deepEqual(await run('[...document.querySelectorAll(".detail-head .btn")].map(b=>b.textContent.trim()).filter(Boolean)'), ['Restart', 'Kill', 'Join']);
      assert.equal(FixtureWings.last.origin, `http://127.0.0.1:${panelPort}`);
    });
    await shot('5-panel-detail');

    await test('RCON console shows command replies and players from list', async () => {
      await go({ remote: rconConn.id });
      await wait('document.querySelector(".console-input input")');
      await run(`(()=>{const i=document.querySelector('.console-input input'); i.value='time set day'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); return true})()`);
      await wait('document.querySelector(".console").textContent.includes("Set the time to 1000")');
      await clickText('.tabs button', 'Players');
      await wait('document.querySelector(".players-grid") && document.querySelector(".players-grid").textContent.includes("Sunny")');
      assert.match(await text(), /from the list command/);
    });
    await shot('6-rcon-players');

    await test('Pimpin PC detail polls the other launcher log', async () => {
      await go({ remote: pcConn.id });
      await wait('document.querySelector(".console") && document.querySelector(".console").textContent.includes("Alex joined the game")');
      assert.match(await text(), /Another PC with Pimpin/);
    });
    await shot('7-pimpin-console');

    await test('address-only connection reports offline honestly', async () => {
      const id = (await remote.list()).find((c) => c.kind === 'address').id;
      await go({ remote: id });
      await wait('document.querySelector(".rs-error-line") && document.querySelector(".chip") && document.querySelector("#view").innerText.includes("Offline")');
      assert.match(await text(), /No console for address-only connections/);
    });
    await shot('8-address-offline');

    await test('narrow window keeps list and modal usable', async () => {
      win.setSize(1024, 640);
      await go({ view: 'remote' });
      await wait('document.querySelectorAll(".rs-card").length === 4');
      await shot('9-narrow-list');
      await clickText('.page-head button', 'Connect');
      await run('[...document.querySelectorAll(".rs-kind")].find(n=>n.textContent.includes("RCON")).click()');
      const overflow = await run('(()=>{const m=document.querySelector(".rs-modal"); return m.scrollWidth - m.clientWidth})()');
      assert.ok(overflow <= 1, `modal overflows horizontally by ${overflow}px`);
      await shot('10-narrow-add-rcon');
      await run('document.querySelector(".modal-wrap .modal-head button").click()');
      await go({ remote: panelConn.id });
      await wait('document.querySelectorAll(".rs-stat").length === 4');
      await shot('11-narrow-panel-detail');
    });

    await test('renderer never received a secret', async () => {
      const list = JSON.stringify(await run('window.pimpin.call("remote:list")'));
      assert.doesNotMatch(list, /fixture-rcon|ptlc_/);
    });
    assert.deepEqual(errors, []);
  } catch (e) {
    failures.push({ name: 'fixture', error: e.message });
    console.error(e);
  } finally {
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ failures, errors, shots, root }, null, 2));
    console.log('Evidence:', output);
    console.log(`${failures.length ? 'FAILED' : 'OK'}: ${failures.length} failure(s), ${shots.length} screenshots`);
    remote.shutdown();
    await agent.close();
    for (const c of closers) c();
    win?.destroy();
    app.exit(failures.length ? 1 : 0);
  }
}).catch((error) => { console.error(error); app.exit(1); });
