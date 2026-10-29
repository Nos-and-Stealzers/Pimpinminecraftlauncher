// Remote servers: ping, RCON, Pterodactyl client, Share this PC agent and the
// saved-connection store. Everything runs against local fakes; nothing here
// touches a real panel, a real server or the user's launcher data.
// Run: TMPDIR=<scratch> node --test scripts/remote-servers.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const scratch = process.env.TMPDIR;
if (!scratch) throw new Error('Set TMPDIR to a scratch folder; this test never uses launcher data');
const root = fs.mkdtempSync(path.join(scratch, 'pimpin-remote-test-'));
process.env.PIMPIN_ROOT = root; // before store.js computes its folders
const store = require('../src/main/store');
assert.equal(store.dirs.root, root);

const ping = require('../src/main/remote/ping');
const rconLib = require('../src/main/remote/rcon');
const ptero = require('../src/main/remote/pterodactyl');
const { createHostAgent, createAgentClient } = require('../src/main/remote/host-agent');
const { createRemoteServers } = require('../src/main/remote/remote-servers');

const listen = (srv, host = '127.0.0.1') => new Promise((r) => srv.listen(0, host, () => r(srv.address().port)));
const close = (srv) => new Promise((r) => { srv.closeAllConnections?.(); srv.close(() => r()); });
const freePort = async () => { const s = net.createServer(); const p = await listen(s); await close(s); return p; };
const noSrv = async () => { throw new Error('no srv'); };

// ------------------------------------------------------------------ ping --
/** A fake Minecraft server that answers the status handshake. */
function fakeMc(statusJson, { chunked = false, silent = false, pong = true } = {}) {
  const seen = [];
  const srv = net.createServer((sock) => {
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
        seen.push({ id: id.value, size: body.length });
        if (silent) continue;
        if (id.value === 0 && body.length === 1) {
          const out = ping.packet(0x00, ping.writeString(typeof statusJson === 'string' ? statusJson : JSON.stringify(statusJson)));
          if (chunked) {
            let i = 0;
            const tick = () => { if (i < out.length && !sock.destroyed) { sock.write(out.subarray(i, i + 7)); i += 7; setImmediate(tick); } };
            tick();
          } else sock.write(out);
        } else if (id.value === 1 && pong) sock.write(ping.packet(0x01, body.subarray(id.size)));
      }
    });
  });
  srv.seen = seen;
  return srv;
}

test('varints: known encodings, negatives, partial and oversized input', () => {
  const hex = (n) => ping.writeVarInt(n).toString('hex');
  assert.equal(hex(0), '00');
  assert.equal(hex(1), '01');
  assert.equal(hex(127), '7f');
  assert.equal(hex(128), '8001');
  assert.equal(hex(255), 'ff01');
  assert.equal(hex(25565), 'ddc701');
  assert.equal(hex(2097151), 'ffff7f');
  assert.equal(hex(2147483647), 'ffffffff07');
  assert.equal(hex(-1), 'ffffffff0f');
  for (const n of [0, 1, 127, 128, 300, 16384, 2097152, 2147483647, -1, -2147483648]) {
    assert.deepEqual(ping.readVarInt(ping.writeVarInt(n)), { value: n, size: ping.writeVarInt(n).length });
  }
  assert.equal(ping.readVarInt(Buffer.from([0x80, 0x80])), null);
  assert.equal(ping.readVarInt(Buffer.from([0x05, 0x80]), 1), null);
  assert.throws(() => ping.readVarInt(Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x01])), /too big/);
});

test('motd components: extra, translate, nested arrays and section codes', () => {
  assert.equal(ping.motdText('§aHello §lWorld§r'), 'Hello World');
  assert.equal(ping.motdText({ text: '§6Gold ', extra: [{ text: 'and ', bold: true }, { text: 'more', extra: ['!', { text: '\n§7line two ' }] }] }), 'Gold and more!\nline two');
  assert.equal(ping.motdText([{ text: 'A' }, 'B', { translate: 'x.y', fallback: 'C' }]), 'ABC');
  assert.equal(ping.motdText({ translate: 'menu.server' }), 'menu.server');
  assert.equal(ping.motdText(null), '');
  let deep = { text: 'x' };
  for (let i = 0; i < 100; i++) deep = { extra: [deep] };
  assert.equal(ping.motdText(deep), ''); // depth-capped, no stack overflow
});

test('address parsing and SRV fallback', async () => {
  assert.deepEqual(ping.parseAddress('play.example.com'), { host: 'play.example.com', port: null });
  assert.deepEqual(ping.parseAddress('1.2.3.4:25570'), { host: '1.2.3.4', port: 25570 });
  assert.deepEqual(ping.parseAddress('[::1]:25565'), { host: '::1', port: 25565 });
  for (const bad of ['', 'a b', 'host:abc', 'host:70000', 'user@host', 'http://x', 'a/b']) assert.throws(() => ping.parseAddress(bad), undefined, bad);
  assert.deepEqual(await ping.resolveAddress('mc.example.com', { resolveSrv: async () => [{ name: 'node7.host.net.', port: 25601, priority: 0, weight: 5 }] }), { host: 'node7.host.net', port: 25601, srv: true });
  assert.deepEqual(await ping.resolveAddress('mc.example.com', { resolveSrv: noSrv }), { host: 'mc.example.com', port: 25565, srv: false });
  assert.deepEqual(await ping.resolveAddress('mc.example.com:1234', { resolveSrv: () => assert.fail('no SRV with a port') }), { host: 'mc.example.com', port: 1234, srv: false });
});

test('ping reads version, players, motd, favicon and latency', async () => {
  const favicon = 'data:image/png;base64,iVBORw0KGgo=';
  const srv = fakeMc({ version: { name: 'Paper 1.21.4', protocol: 769 }, players: { online: 3, max: 20, sample: [{ name: 'Alex', id: 'x' }, { name: '§cSteve', id: 'y' }] }, description: { text: '§aMy ', extra: [{ text: 'server' }] }, favicon, padding: 'x'.repeat(20000) });
  const port = await listen(srv);
  const r = await ping.ping(`127.0.0.1:${port}`, { resolveSrv: noSrv });
  assert.equal(r.online, true);
  assert.deepEqual(r.version, { name: 'Paper 1.21.4', protocol: 769 });
  assert.deepEqual(r.players, { online: 3, max: 20, sample: ['Alex', 'Steve'] });
  assert.equal(r.motd, 'My server');
  assert.equal(r.favicon, favicon);
  assert.ok(Number.isFinite(r.latency) && r.latency >= 0);
  assert.deepEqual(srv.seen.map((p) => p.id), [0, 0, 1]); // handshake, status request, ping
  await close(srv);
});

test('ping copes with a reply split into tiny chunks and rejects bad favicons', async () => {
  const srv = fakeMc({ version: { name: '1.20.1', protocol: 763 }, players: { online: 0, max: 5 }, description: 'Hi', favicon: 'javascript:alert(1)' }, { chunked: true });
  const port = await listen(srv);
  const r = await ping.ping(`127.0.0.1:${port}`, { resolveSrv: noSrv });
  assert.equal(r.motd, 'Hi');
  assert.equal(r.favicon, null);
  assert.deepEqual(r.players.sample, []);
  await close(srv);
});

test('ping falls back to the status latency when the server never pongs', async () => {
  const srv = fakeMc({ version: { name: '1.8.9', protocol: 47 }, players: { online: 1, max: 2 }, description: 'old' }, { pong: false });
  const port = await listen(srv);
  const r = await ping.ping(`127.0.0.1:${port}`, { resolveSrv: noSrv, timeout: 400 });
  assert.equal(r.version.name, '1.8.9');
  await close(srv);
});

test('ping times out, reports refused connections and invalid JSON', async () => {
  const silent = fakeMc({}, { silent: true });
  const port = await listen(silent);
  const t0 = Date.now();
  await assert.rejects(ping.ping(`127.0.0.1:${port}`, { resolveSrv: noSrv, timeout: 300 }), /did not answer in time/);
  assert.ok(Date.now() - t0 < 2000);
  await close(silent);
  await assert.rejects(ping.ping(`127.0.0.1:${await freePort()}`, { resolveSrv: noSrv }), /offline|refused/);
  const junk = fakeMc('not json{');
  const jp = await listen(junk);
  await assert.rejects(ping.ping(`127.0.0.1:${jp}`, { resolveSrv: noSrv }), /invalid status reply/);
  await close(junk);
});

test('ping refuses oversized replies', async () => {
  const srv = net.createServer((sock) => {
    sock.on('error', () => {});
    sock.once('data', () => sock.write(Buffer.concat([ping.writeVarInt(5 * 1024 * 1024), Buffer.alloc(64 * 1024)])));
  });
  const port = await listen(srv);
  await assert.rejects(ping.ping(`127.0.0.1:${port}`, { resolveSrv: noSrv, timeout: 2000 }), /invalid status reply|too much/);
  await close(srv);
});

// ------------------------------------------------------------------ rcon --
function fakeRcon({ password = 'secret', sourceStyle = false } = {}) {
  const state = { connections: 0, commands: [] };
  const srv = net.createServer((sock) => {
    state.connections++;
    let authed = false;
    let buf = Buffer.alloc(0);
    sock.on('error', () => {});
    // like vanilla, one packet is handled at a time, so replies stay in order
    let queue = Promise.resolve();
    sock.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      const { packets, rest } = rconLib.decode(buf);
      buf = rest;
      for (const p of packets) queue = queue.then(() => handle(p));
    });
    const handle = async (p) => {
      {
        if (p.type === rconLib.TYPE_AUTH) {
          if (sourceStyle) sock.write(rconLib.encode(p.id, rconLib.TYPE_RESPONSE, ''));
          authed = p.body === password;
          sock.write(rconLib.encode(authed ? p.id : -1, rconLib.TYPE_EXEC, ''));
        } else if (p.type === rconLib.TYPE_EXEC && authed) {
          state.commands.push(p.body);
          if (p.body === 'big') {
            const text = 'abcdefghij'.repeat(1000); // 10000 bytes -> 3 packets
            for (let i = 0; i < text.length; i += 4096) sock.write(rconLib.encode(p.id, rconLib.TYPE_RESPONSE, text.slice(i, i + 4096)));
          } else if (p.body === 'list') sock.write(rconLib.encode(p.id, rconLib.TYPE_RESPONSE, 'There are 2 of a max of 20 players online: Alex, §bSteve'));
          else if (p.body.startsWith('slow')) {
            await new Promise((r) => setTimeout(r, 60));
            sock.write(rconLib.encode(p.id, rconLib.TYPE_RESPONSE, `done ${p.body}`));
          }
          else sock.write(rconLib.encode(p.id, rconLib.TYPE_RESPONSE, `ran ${p.body}`));
        } else {
          // vanilla answers unknown packet types like this, which ends a reply
          sock.write(rconLib.encode(p.id, rconLib.TYPE_RESPONSE, `Unknown request ${p.type.toString(16)}`));
        }
      }
    };
  });
  srv.state = state;
  return srv;
}

test('rcon packet encoding matches the Source layout', () => {
  const b = rconLib.encode(7, 2, 'list');
  assert.equal(b.length, 18);
  assert.equal(b.readInt32LE(0), 14);
  assert.equal(b.readInt32LE(4), 7);
  assert.equal(b.readInt32LE(8), 2);
  assert.equal(b.subarray(12, 16).toString(), 'list');
  assert.deepEqual([...b.subarray(16)], [0, 0]);
  assert.deepEqual(rconLib.decode(b).packets, [{ id: 7, type: 2, body: 'list' }]);
  assert.equal(rconLib.decode(b.subarray(0, 10)).packets.length, 0);
  const huge = Buffer.alloc(12);
  huge.writeInt32LE(9000, 0);
  assert.throws(() => rconLib.decode(huge), /malformed/);
  assert.throws(() => rconLib.validateCommand('say a\nop me'), /single line/);
  assert.throws(() => rconLib.validateCommand('x'.repeat(1447)), /too long/);
  assert.equal(rconLib.validateCommand('/say hi'), 'say hi');
});

test('rcon authenticates, reassembles multi-packet replies and serializes commands', async () => {
  const srv = fakeRcon({ sourceStyle: true });
  const port = await listen(srv);
  const c = new rconLib.RconClient({ host: '127.0.0.1', port, password: 'secret', timeout: 3000 });
  const big = await c.command('big');
  assert.equal(big.length, 10000);
  assert.equal(big, 'abcdefghij'.repeat(1000));
  const replies = await Promise.all([c.command('slow1'), c.command('fast'), c.command('slow2')]);
  assert.deepEqual(replies, ['done slow1', 'ran fast', 'done slow2']);
  assert.deepEqual(rconLib.parseList(await c.command('list')), { online: 2, max: 20, names: ['Alex', 'Steve'] });
  assert.equal(srv.state.connections, 1, 'connection is reused');
  c.close();
  await close(srv);
});

test('rcon reports a wrong password and closes idle connections', async () => {
  const srv = fakeRcon();
  const port = await listen(srv);
  const bad = new rconLib.RconClient({ host: '127.0.0.1', port, password: 'nope' });
  await assert.rejects(bad.command('list'), (err) => err.code === 'RCON_AUTH' && /password was not accepted/.test(err.message));
  const good = new rconLib.RconClient({ host: '127.0.0.1', port, password: 'secret', idleMs: 50 });
  await good.command('a');
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(good.sock, null, 'idle connection was closed');
  await good.command('b');
  assert.equal(srv.state.connections, 3);
  good.close();
  await close(srv);
  await assert.rejects(new rconLib.RconClient({ host: '127.0.0.1', port: await freePort(), password: 'x' }).command('list'), /refused/);
});

// ----------------------------------------------------------- pterodactyl --
const KEY = 'ptlc_' + 'A'.repeat(43);
function fakePanel() {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, accept: req.headers.accept, type: req.headers['content-type'], body: body ? JSON.parse(body) : null });
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(data ? JSON.stringify(data) : ''); };
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { errors: [{ code: 'AuthenticationException', detail: 'Unauthenticated.' }] });
      const attrs = (id) => ({ identifier: id, uuid: `${id}-uuid`, name: `Server ${id}`, node: 'Node 1', is_suspended: false, is_installing: false, server_owner: true, limits: { memory: 4096, disk: 10240, cpu: 200 }, relationships: { allocations: { data: [{ attributes: { ip: '10.0.0.5', ip_alias: 'node1.host.net', port: 25571, is_default: true } }] } } });
      const u = req.url.split('?')[0];
      if (u === '/api/client') return send(200, { data: [{ attributes: attrs('abc12345') }, { attributes: attrs('def67890') }], meta: { pagination: { total_pages: 1 } } });
      if (u === '/api/client/servers/abc12345') return send(200, { attributes: attrs('abc12345') });
      if (u === '/api/client/servers/abc12345/resources') return send(200, { attributes: { current_state: 'running', is_suspended: false, resources: { memory_bytes: 1073741824, cpu_absolute: 37.5, disk_bytes: 2147483648, network_rx_bytes: 1, network_tx_bytes: 2, uptime: 3600000 } } });
      if (u === '/api/client/servers/abc12345/power' || u === '/api/client/servers/abc12345/command') return send(204);
      if (u === '/api/client/servers/abc12345/websocket') return send(200, { data: { token: 'jwt-1', socket: 'wss://node1.host.net:8080/api/servers/abc12345-uuid/ws' } });
      if (u === '/api/client/servers/busy0000/power') return send(409, { errors: [{ detail: 'Server is installing' }] });
      if (u === '/api/client/servers/nope0000/command') return send(403, { errors: [{ detail: 'This action is unauthorized.' }] });
      if (u === '/api/client/servers/redirect/resources') { res.writeHead(302, { Location: 'https://evil.example/' }); return res.end(); }
      return send(404, { errors: [{ detail: 'The requested resource could not be found.' }] });
    });
  });
  srv.calls = calls;
  return srv;
}

test('panel URL and key validation', () => {
  assert.equal(ptero.validatePanelUrl('https://panel.example.com/'), 'https://panel.example.com');
  assert.equal(ptero.validatePanelUrl(' https://host.net/panel/?x=1#y '), 'https://host.net/panel');
  assert.equal(ptero.validatePanelUrl('http://192.168.1.20:8080'), 'http://192.168.1.20:8080');
  assert.equal(ptero.validatePanelUrl('http://localhost'), 'http://localhost');
  assert.equal(ptero.validatePanelUrl('http://100.101.102.103'), 'http://100.101.102.103'); // Tailscale
  assert.throws(() => ptero.validatePanelUrl('http://panel.example.com'), /https/);
  assert.throws(() => ptero.validatePanelUrl('http://8.8.8.8'), /https/);
  assert.throws(() => ptero.validatePanelUrl('ftp://x.y'), /https/);
  assert.throws(() => ptero.validatePanelUrl('https://u:p@x.y'), /login/);
  assert.throws(() => ptero.validatePanelUrl('panel.example.com'), /panel address/);
  assert.throws(() => ptero.validateApiKey('ptla_' + 'x'.repeat(43)), /application key/);
  assert.throws(() => ptero.validateApiKey('short'), /does not look/);
  assert.throws(() => ptero.validateServerId('../../x'), /Pick a server/);
  assert.equal(ptero.validateApiKey(` ${KEY} `), KEY);
});

test('panel client sends the right headers, endpoints and bodies', async () => {
  const srv = fakePanel();
  const port = await listen(srv);
  const p = ptero.createPanelClient({ panelUrl: `http://127.0.0.1:${port}/`, apiKey: KEY });
  const list = await p.listServers();
  assert.deepEqual(list.map((s) => [s.id, s.address]), [['abc12345', 'node1.host.net:25571'], ['def67890', 'node1.host.net:25571']]);
  const r = await p.resources('abc12345');
  assert.deepEqual({ state: r.state, cpu: r.cpu, memory: r.memory, uptime: r.uptime }, { state: 'running', cpu: 37.5, memory: 1073741824, uptime: 3600000 });
  await p.power('abc12345', 'restart');
  await p.command('abc12345', '/say hello');
  const creds = await p.websocketCredentials('abc12345');
  assert.equal(creds.token, 'jwt-1');
  for (const c of srv.calls) {
    assert.equal(c.auth, `Bearer ${KEY}`);
    assert.equal(c.accept, 'application/vnd.pterodactyl.v1+json');
  }
  const power = srv.calls.find((c) => c.url.endsWith('/power'));
  assert.deepEqual([power.method, power.type, power.body], ['POST', 'application/json', { signal: 'restart' }]);
  assert.deepEqual(srv.calls.find((c) => c.url.endsWith('/command')).body, { command: 'say hello' });
  await assert.rejects(p.power('abc12345', 'explode'), /Unknown power action/);
  await assert.rejects(p.command('abc12345', 'a\nb'), /single short line/);
  await close(srv);
});

test('panel errors are mapped to friendly messages', async () => {
  const srv = fakePanel();
  const port = await listen(srv);
  const base = `http://127.0.0.1:${port}`;
  const bad = ptero.createPanelClient({ panelUrl: base, apiKey: 'ptlc_' + 'B'.repeat(43) });
  await assert.rejects(bad.listServers(), (e) => e.status === 401 && /rejected the API key/.test(e.message) && !/Unauthenticated/.test(e.message));
  const p = ptero.createPanelClient({ panelUrl: base, apiKey: KEY });
  await assert.rejects(p.resources('missing0'), (e) => e.status === 404 && /could not find that server/.test(e.message));
  await assert.rejects(p.power('busy0000', 'start'), (e) => e.status === 409 && /busy/.test(e.message) && /installing/.test(e.message));
  await assert.rejects(p.command('nope0000', 'list'), (e) => e.status === 403 && /not allowed/.test(e.message));
  await assert.rejects(p.resources('redirect'), /Could not reach the panel/); // redirects are never followed with the key
  const slow = http.createServer(() => {});
  const sp = await listen(slow);
  await assert.rejects(ptero.createPanelClient({ panelUrl: `http://127.0.0.1:${sp}`, apiKey: KEY, timeout: 200 }).listServers(), /did not answer in time/);
  await close(slow);
  await close(srv);
});

test('panel console authenticates over the websocket with the panel Origin and refreshes tokens', async () => {
  const srv = fakePanel();
  const port = await listen(srv);
  const sockets = [];
  class FakeWS {
    constructor(url, opts) { this.url = url; this.opts = opts; this.sent = []; this.readyState = 0; sockets.push(this); setImmediate(() => { this.readyState = 1; this.onopen?.(); }); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
    emit(event, ...args) { this.onmessage?.({ data: JSON.stringify({ event, args }) }); }
  }
  const p = ptero.createPanelClient({ panelUrl: `http://127.0.0.1:${port}`, apiKey: KEY, WebSocket: FakeWS });
  const lines = [], states = [], stats = [];
  const errors = [];
  const con = p.openConsole('abc12345', { onLine: (l) => lines.push(l), onStatus: (s) => states.push(s), onStats: (s) => stats.push(s), onError: (e) => errors.push(e) });
  await new Promise((r) => setTimeout(r, 100));
  const ws = sockets[0];
  assert.equal(ws.url, 'wss://node1.host.net:8080/api/servers/abc12345-uuid/ws');
  assert.equal(ws.opts.headers.Origin, `http://127.0.0.1:${port}`);
  assert.deepEqual(ws.sent[0], { event: 'auth', args: ['jwt-1'] });
  ws.emit('auth success');
  assert.deepEqual(ws.sent.slice(1).map((m) => m.event), ['send logs', 'send stats']);
  ws.emit('console output', '\x1b[33m[12:00:00 INFO]: Done (3.2s)!\x1b[0m\r');
  ws.emit('status', 'running');
  ws.emit('stats', JSON.stringify({ cpu_absolute: 12.5, memory_bytes: 5, disk_bytes: 6, uptime: 7, state: 'running', network: { rx_bytes: 1, tx_bytes: 2 } }));
  assert.deepEqual(lines, ['[12:00:00 INFO]: Done (3.2s)!']);
  assert.deepEqual(states, ['running']);
  assert.equal(stats[0].cpu, 12.5);
  ws.emit('token expiring');
  for (let i = 0; i < 50 && ws.sent.length < 4; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(errors, []);
  assert.deepEqual(ws.sent.at(-1), { event: 'auth', args: ['jwt-1'] });
  con.close();
  assert.equal(sockets.length, 1, 'closing does not reconnect');
  await close(srv);
});

// ------------------------------------------------------------ host agent --
function fakeServers() {
  const calls = [];
  const list = [
    { id: 'survival', name: 'Survival', software: 'paper', mcVersion: '1.21.4', port: 25565, running: true, ready: true, started: 1, online: ['Alex'], memory: 2048, jvmArgs: '-Dsecret', content: [{ file: 'x.jar' }], pluginCount: 1 },
    { id: 'creative', name: 'Creative', software: 'vanilla', mcVersion: '1.20.1', port: 25566, running: false, ready: false, online: [], eulaAccepted: false },
  ];
  return {
    calls,
    list: async () => list.map((s) => ({ ...s })),
    start: async (id) => { calls.push(['start', id]); if (id === 'creative') throw new Error('You need to accept the Minecraft EULA first.'); return { ok: true }; },
    stop: (id) => calls.push(['stop', id]),
    restart: async (id) => { calls.push(['restart', id]); },
    command: (id, cmd) => calls.push(['command', id, cmd]),
    getLogs: () => ['[12:00] Starting', '[12:01] Done'],
    playerInfo: async () => ({ online: ['Alex'], ops: ['Alex'], whitelist: [], banned: [] }),
  };
}

async function startAgent(servers = fakeServers(), dir = fs.mkdtempSync(path.join(root, 'agent-'))) {
  const agent = createHostAgent({ servers, store, root: dir, version: '9.9.9', hostname: 'fixture-pc', lanAddresses: () => ['192.168.1.50'] });
  const port = await freePort();
  const st = await agent.update({ enabled: true, port, bind: '127.0.0.1' });
  assert.equal(st.listening, true, st.error);
  const call = async (method, p, { token = st.token, body, headers = {} } = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
  };
  return { agent, servers, port, token: st.token, call, dir };
}

test('agent is off by default and persists a strong token', async () => {
  const dir = fs.mkdtempSync(path.join(root, 'agent-off-'));
  const agent = createHostAgent({ servers: fakeServers(), store, root: dir });
  const st = await agent.status();
  assert.equal(st.enabled, false);
  assert.equal(st.listening, false);
  assert.match(st.token, /^[A-Za-z0-9_-]{32}$/);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'remote-host.json'), 'utf8'));
  assert.equal(saved.token, st.token);
  const regen = await agent.regenerate();
  assert.notEqual(regen.token, st.token);
  await assert.rejects(agent.update({ port: 80 }), /between 1024/);
});

test('agent rejects missing and wrong tokens, then locks the address out', async () => {
  const { agent, call, token } = await startAgent();
  assert.equal((await call('GET', '/v1/info', { token: null })).status, 401);
  assert.equal((await call('GET', '/v1/info', { token: 'wrong' })).status, 401);
  for (let i = 0; i < 3; i++) await call('GET', '/v1/info', { token: 'wrong' + i });
  const locked = await call('GET', '/v1/info', { token });
  assert.equal(locked.status, 429, 'even the right token waits during a lockout');
  assert.ok(Number(locked.headers.get('retry-after')) > 0);
  await agent.close();
});

test('agent serves info, a path-free server list, logs with a cursor and players', async () => {
  const { agent, call } = await startAgent();
  const info = await call('GET', '/v1/info');
  assert.deepEqual(info.json, { app: 'pimpin-launcher', api: 1, version: '9.9.9', hostname: 'fixture-pc', servers: 2 });
  const list = (await call('GET', '/v1/servers')).json.servers;
  assert.deepEqual(Object.keys(list[0]).sort(), ['id', 'mcVersion', 'name', 'online', 'port', 'ready', 'running', 'software', 'started']);
  assert.doesNotMatch(JSON.stringify(list), /secret|x\.jar|jvm/i);
  const first = (await call('GET', '/v1/servers/survival/logs?since=0')).json;
  assert.deepEqual(first.lines, ['[12:00] Starting', '[12:01] Done']);
  agent.observe('server:log', { id: 'survival', line: 'new line' });
  agent.observe('server:log', { id: 'other', line: 'x' }); // seeds that server, harmless
  const next = (await call('GET', `/v1/servers/survival/logs?since=${first.cursor}`)).json;
  assert.deepEqual(next.lines, ['new line']);
  assert.equal(next.cursor, first.cursor + 1);
  assert.deepEqual((await call('GET', `/v1/servers/survival/logs?since=${next.cursor}`)).json.lines, []);
  assert.deepEqual((await call('GET', '/v1/servers/survival/players')).json.online, ['Alex']);
  await agent.close();
});

test('agent validates ids, commands, bodies and browser origins', async () => {
  const { agent, call, servers } = await startAgent();
  assert.equal((await call('GET', '/v1/servers/nope')).status, 404);
  assert.equal((await call('GET', '/v1/servers/..%2F..%2Fsettings')).status, 404);
  assert.equal((await call('POST', '/v1/servers/survival/delete')).status, 404);
  assert.equal((await call('GET', '/v1/servers/survival/files')).status, 404);
  assert.equal((await call('POST', '/v1/servers/survival/command', { body: { command: 'x'.repeat(257) } })).status, 400);
  assert.equal((await call('POST', '/v1/servers/survival/command', { body: { command: 'say a\nop Mallory' } })).status, 400);
  assert.equal((await call('POST', '/v1/servers/survival/command', { body: { command: '  ' } })).status, 400);
  assert.equal((await call('POST', '/v1/servers/survival/command', { body: '{bad json' })).status, 400);
  assert.equal((await call('POST', '/v1/servers/creative/command', { body: { command: 'list' } })).status, 409);
  const big = await call('POST', '/v1/servers/survival/command', { body: JSON.stringify({ command: 'say hi', pad: 'x'.repeat(20000) }) });
  assert.equal(big.status, 413);
  assert.equal((await call('GET', '/v1/info', { headers: { Origin: 'http://evil.example' } })).status, 403);
  assert.equal((await call('POST', '/v1/servers/survival/command', { body: { command: '/say hi' } })).status, 200);
  assert.deepEqual(servers.calls.filter((c) => c[0] === 'command'), [['command', 'survival', 'say hi']]);
  await agent.close();
});

test('agent power endpoints report early start failures', async () => {
  const { agent, call, servers } = await startAgent();
  assert.equal((await call('POST', '/v1/servers/survival/start')).status, 409); // already running
  const eula = await call('POST', '/v1/servers/creative/start');
  assert.equal(eula.status, 409);
  assert.match(eula.json.error, /EULA/);
  assert.equal((await call('POST', '/v1/servers/survival/stop')).status, 200);
  assert.equal((await call('POST', '/v1/servers/survival/restart')).status, 200);
  assert.deepEqual(servers.calls.map((c) => c[0]), ['start', 'stop', 'restart']);
  await agent.close();
});

test('agent client talks to a real agent and explains a wrong token', async () => {
  const { agent, port, token } = await startAgent();
  const c = createAgentClient({ host: '127.0.0.1', port, token });
  assert.equal((await c.info()).hostname, 'fixture-pc');
  assert.deepEqual((await c.list()).map((s) => s.id), ['survival', 'creative']);
  await c.command('survival', 'list');
  await assert.rejects(createAgentClient({ host: '127.0.0.1', port, token: 'nope' }).info(), /rejected the pairing token/);
  await agent.close();
  await assert.rejects(c.info(), /Could not reach the other PC/);
});

// ------------------------------------------------------- saved connections --
const fakeSafe = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('hex')}`),
  decryptString: (b) => Buffer.from(b.toString().slice(4), 'hex').toString(),
});

test('secrets are encrypted at rest and never returned by list()', async () => {
  const dir = fs.mkdtempSync(path.join(root, 'conns-'));
  const events = [];
  const remote = createRemoteServers({ root: dir, store, safeStorage: fakeSafe(), emit: (c, p) => events.push([c, p]) });
  const saved = await remote.save({ kind: 'rcon', name: 'My VPS', host: '127.0.0.1', port: 25575 }, 'hunter2-password');
  assert.equal(saved.hasSecret, true);
  const all = JSON.stringify(await remote.list());
  assert.doesNotMatch(all, /hunter2/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'remote-servers.json'), 'utf8'), /hunter2/);
  const secrets = fs.readFileSync(path.join(dir, 'remote-secrets.json'), 'utf8');
  assert.doesNotMatch(secrets, /hunter2/);
  assert.match(secrets, new RegExp(saved.id));
  // editing without a new secret keeps the old one
  const edited = await remote.save({ ...saved, name: 'Renamed' });
  assert.equal(edited.hasSecret, true);
  assert.equal(edited.name, 'Renamed');
  await assert.rejects(remote.save({ kind: 'pterodactyl', panelUrl: 'https://p.example.com', serverId: 'abc12345' }), /client API key/);
  await assert.rejects(remote.save({ kind: 'pterodactyl', panelUrl: 'http://p.example.com', serverId: 'abc12345' }, KEY), /https/);
  await remote.remove(saved.id);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'remote-secrets.json'), 'utf8'), new RegExp(saved.id));
});

test('without secure storage, secrets are refused instead of stored as plain text', async () => {
  const dir = fs.mkdtempSync(path.join(root, 'conns-plain-'));
  for (const safe of [fakeSafe(false), { ...fakeSafe(true), getSelectedStorageBackend: () => 'basic_text' }, undefined]) {
    const remote = createRemoteServers({ root: dir, store, safeStorage: safe });
    assert.equal(remote.secureAvailable(), false);
    await assert.rejects(remote.save({ kind: 'rcon', host: '127.0.0.1' }, 'plain-pass'), /Secure storage is not available/);
    assert.equal(fs.existsSync(path.join(dir, 'remote-secrets.json')) && /plain-pass/.test(fs.readFileSync(path.join(dir, 'remote-secrets.json'), 'utf8')), false);
    assert.deepEqual(await remote.list(), []);
  }
  const remote = createRemoteServers({ root: dir, store, safeStorage: fakeSafe(false) });
  const watch = await remote.save({ kind: 'address', address: 'play.example.com' });
  assert.equal(watch.hasSecret, false);
  assert.deepEqual(watch.power, []);
});

test('saved connections run end to end: RCON, another PC and a panel', async () => {
  const dir = fs.mkdtempSync(path.join(root, 'conns-e2e-'));
  const events = [];
  const mc = fakeMc({ version: { name: 'Paper 1.21.4', protocol: 769 }, players: { online: 1, max: 10, sample: [{ name: 'Alex' }] }, description: 'Fixture' });
  const mcPort = await listen(mc);
  const remote = createRemoteServers({ root: dir, store, safeStorage: fakeSafe(), emit: (c, p) => events.push([c, p]), pingFn: (addr, o) => ping.ping(addr, { ...o, resolveSrv: noSrv }) });

  // RCON: commands show up as console lines, list feeds the players tab
  const rs = fakeRcon();
  const rp = await listen(rs);
  const r = await remote.save({ kind: 'rcon', host: '127.0.0.1', port: rp, address: `127.0.0.1:${mcPort}` }, 'secret');
  assert.deepEqual(await remote.discover({ kind: 'rcon', host: '127.0.0.1', port: rp }, 'secret'), { ok: true });
  const rst = await remote.status(r.id);
  assert.equal(rst.state, 'online');
  assert.equal(rst.ping.version.name, 'Paper 1.21.4');
  assert.equal((await remote.command(r.id, 'say hi')).reply, 'ran say hi');
  assert.deepEqual((await remote.console(r.id)).lines.slice(0, 2), ['> say hi', 'ran say hi']);
  const rpl = await remote.players(r.id);
  assert.deepEqual([rpl.source, rpl.names], ['rcon', ['Alex', 'Steve']]);
  await assert.rejects(remote.power(r.id, 'start'), /cannot start/);

  // Another PC through Share this PC
  const { agent, port: agentPort, token } = await startAgent();
  const found = await remote.discover({ kind: 'pimpin', host: '127.0.0.1', port: agentPort }, token);
  assert.equal(found.info.hostname, 'fixture-pc');
  const pc = await remote.save({ kind: 'pimpin', host: '127.0.0.1', port: agentPort, serverId: 'survival', gamePort: mcPort }, token);
  const pst = await remote.status(pc.id);
  assert.equal(pst.state, 'online');
  assert.equal(pst.remote.name, 'Survival');
  const con = await remote.console(pc.id);
  assert.equal(con.live, true);
  assert.deepEqual(con.lines, ['[12:00] Starting', '[12:01] Done']);
  await remote.command(pc.id, 'list');
  await remote.power(pc.id, 'restart');
  await remote.console(pc.id, false);
  assert.deepEqual((await remote.players(pc.id)).ops, ['Alex']);
  await agent.close();

  // Panel: status mixes resource usage with the game ping
  const panel = fakePanel();
  const pp = await listen(panel);
  const pd = await remote.discover({ kind: 'pterodactyl', panelUrl: `http://127.0.0.1:${pp}` }, KEY);
  assert.equal(pd.servers.length, 2);
  const pt = await remote.save({ kind: 'pterodactyl', panelUrl: `http://127.0.0.1:${pp}`, serverId: 'abc12345', address: `127.0.0.1:${mcPort}` }, KEY);
  const tst = await remote.status(pt.id);
  assert.equal(tst.state, 'online');
  assert.equal(tst.resources.cpu, 37.5);
  assert.equal(tst.resources.limits.memory, 4096);
  await remote.power(pt.id, 'kill');
  assert.ok(panel.calls.some((c) => c.url.endsWith('/power') && c.body.signal === 'kill'));
  assert.ok(events.some(([c, p]) => c === 'remote:status' && p.id === pt.id));
  assert.ok(events.some(([c, p]) => c === 'remote:log' && p.id === r.id));
  assert.doesNotMatch(JSON.stringify(events), /secret|ptlc_/);

  remote.shutdown();
  await close(panel);
  await close(rs);
  await close(mc);
});

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
