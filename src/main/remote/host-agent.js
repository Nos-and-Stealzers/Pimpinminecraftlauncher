// "Share this PC": an opt-in, token-protected HTTP API so another Pimpin
// Launcher can see and control this PC's local servers (start, stop,
// restart, console commands, logs, players). Off by default. It never
// exposes files, properties, backups or deletion.
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULTS = { enabled: false, port: 25590, bind: '0.0.0.0' };
const BODY_LIMIT = 16 * 1024;
const LOG_KEEP = 1000;
const MAX_FAILS = 5;
const FAIL_WINDOW = 10 * 60e3;
const PLAYER_NAME = /^\.?[A-Za-z0-9_]{1,20}$/;

const newToken = () => crypto.randomBytes(24).toString('base64url');
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

function validCommand(cmd) {
  if (typeof cmd !== 'string') throw httpError(400, 'Send a command');
  const c = cmd.trim().replace(/^\//, '');
  if (!c) throw httpError(400, 'Send a command');
  if (c.length > 256) throw httpError(400, 'Commands are limited to 256 characters');
  if (/[\x00-\x1f\x7f]/.test(c)) throw httpError(400, 'A command has to be a single line');
  return c;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeConfig(c = {}) {
  const port = Number(c.port);
  return {
    enabled: c.enabled === true,
    port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULTS.port,
    bind: typeof c.bind === 'string' && /^[0-9a-fA-F:.]{2,45}$/.test(c.bind) ? c.bind : DEFAULTS.bind,
    token: typeof c.token === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(c.token) ? c.token : null,
  };
}

/**
 * servers: the local servers module (list, start, stop, restart, command,
 * getLogs, playerInfo). store: { readJson, writeJson }. root: data folder.
 */
function createHostAgent({ servers, store, root, version = '0.0.0', hostname = os.hostname(), lanAddresses = () => [], now = Date.now } = {}) {
  const file = path.join(root, 'remote-host.json');
  let config = null;
  let server = null;
  let lastError = null;
  const fails = new Map(); // ip -> { count, first, until, strikes }
  const logs = new Map(); // id -> { seq, lines: [{ seq, line }] }

  async function load() {
    if (config) return config;
    config = normalizeConfig(await store.readJson(file, {}));
    if (!config.token) {
      config.token = newToken();
      await store.writeJson(file, config);
    }
    return config;
  }

  // ------------------------------------------------------------ logs --
  function bufferOf(id) {
    let b = logs.get(id);
    if (!b) {
      b = { seq: 0, lines: [] };
      // seed with what the server printed before anyone asked
      for (const line of (servers.getLogs(id) || []).slice(-200)) b.lines.push({ seq: ++b.seq, line });
      logs.set(id, b);
    }
    return b;
  }

  /** Fed from main.js' emitter: keeps a monotonic cursor per server. */
  function observe(channel, payload) {
    if (!server || channel !== 'server:log' || !payload?.id) return;
    if (!logs.has(payload.id)) return void bufferOf(payload.id); // seeding already includes this line
    const b = logs.get(payload.id);
    b.lines.push({ seq: ++b.seq, line: String(payload.line) });
    if (b.lines.length > LOG_KEEP) b.lines.splice(0, b.lines.length - LOG_KEEP);
  }

  // ------------------------------------------------------------ auth --
  function lockedFor(ip) {
    const f = fails.get(ip);
    return f && f.until > now() ? Math.ceil((f.until - now()) / 1000) : 0;
  }

  function noteFail(ip) {
    const t = now();
    let f = fails.get(ip);
    if (!f || t - f.first > FAIL_WINDOW) f = { count: 0, first: t, until: 0, strikes: f?.strikes || 0 };
    f.count++;
    if (f.count >= MAX_FAILS) {
      f.strikes++;
      f.until = t + Math.min(15 * 60e3, 60e3 * 2 ** (f.strikes - 1)); // 1, 2, 4 ... 15 minutes
      f.count = 0;
      f.first = t;
    }
    fails.set(ip, f);
    if (fails.size > 5000) fails.delete(fails.keys().next().value);
  }

  function authorized(req) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/);
    if (!m || !config?.token) return false;
    return crypto.timingSafeEqual(digest(m[1]), digest(config.token));
  }

  // --------------------------------------------------------- handlers --
  async function knownId(id) {
    const list = await servers.list();
    const s = list.find((x) => x.id === id);
    if (!s) throw httpError(404, 'No server with that id');
    return s;
  }

  const publicServer = (s) => ({
    id: s.id,
    name: s.name,
    software: s.software || 'paper',
    mcVersion: s.mcVersion,
    port: s.port,
    running: Boolean(s.running),
    ready: Boolean(s.ready),
    started: s.started || null,
    online: Array.isArray(s.online) ? s.online.filter((n) => PLAYER_NAME.test(n)) : [],
  });

  // start/restart can take minutes (jar download, world save). Report early
  // failures (EULA, missing jar) and otherwise answer "starting".
  async function kick(promise) {
    promise.catch(() => {});
    const early = await Promise.race([promise.then(() => null, (err) => err), new Promise((r) => setTimeout(() => r(null), 1500))]);
    if (early) throw httpError(409, early.message);
    return { ok: true };
  }

  async function route(req, url, body) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'v1') throw httpError(404, 'Not found');
    const method = req.method;
    if (parts.length === 2 && parts[1] === 'info' && method === 'GET') {
      const list = await servers.list();
      return { app: 'pimpin-launcher', api: 1, version, hostname, servers: list.length };
    }
    if (parts[1] !== 'servers') throw httpError(404, 'Not found');
    if (parts.length === 2 && method === 'GET') return { servers: (await servers.list()).map(publicServer) };
    if (parts.length < 3 || parts.length > 4) throw httpError(404, 'Not found');
    const id = parts[2];
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) throw httpError(404, 'No server with that id');
    const s = await knownId(id);
    const action = parts[3] || '';
    if (method === 'GET' && action === '') return publicServer(s);
    if (method === 'GET' && action === 'logs') {
      const b = bufferOf(id);
      const since = Math.max(0, Number.parseInt(url.searchParams.get('since') || '0', 10) || 0);
      const first = b.lines[0]?.seq ?? b.seq + 1;
      const lines = b.lines.filter((l) => l.seq > since).slice(-500);
      return { cursor: b.seq, lines: lines.map((l) => l.line), truncated: since > 0 && since < first - 1 };
    }
    if (method === 'GET' && action === 'players') {
      const info = await servers.playerInfo(id);
      return { online: info.online || [], ops: info.ops || [], whitelist: info.whitelist || [], banned: info.banned || [] };
    }
    if (method === 'POST' && action === 'start') {
      if (s.running) throw httpError(409, 'The server is already running');
      return kick(Promise.resolve().then(() => servers.start(id)));
    }
    if (method === 'POST' && action === 'stop') {
      servers.stop(id);
      return { ok: true };
    }
    if (method === 'POST' && action === 'restart') return kick(Promise.resolve().then(() => servers.restart(id)));
    if (method === 'POST' && action === 'command') {
      const cmd = validCommand(body?.command);
      if (!s.running) throw httpError(409, 'The server is not running');
      servers.command(id, cmd);
      return { ok: true };
    }
    throw httpError(404, 'Not found');
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length'] || 0);
      if (declared > BODY_LIMIT) return reject(httpError(413, 'Request body is too large'));
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > BODY_LIMIT) {
          reject(httpError(413, 'Request body is too large'));
          req.pause();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (size > BODY_LIMIT) return;
        if (!size) return resolve(null);
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(httpError(400, 'Body must be JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  async function handle(req, res) {
    const ip = req.socket.remoteAddress || '?';
    const reply = (status, data, headers = {}) => {
      if (res.headersSent) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
      res.end(JSON.stringify(data));
    };
    try {
      // Browsers attach Origin; nothing in a web page should talk to this API.
      if (req.headers.origin) throw httpError(403, 'Browser requests are not allowed');
      const wait = lockedFor(ip);
      if (wait) return reply(429, { error: 'Too many wrong tokens. Try again later.' }, { 'Retry-After': String(wait), Connection: 'close' });
      if (!authorized(req)) {
        noteFail(ip);
        return reply(401, { error: 'Missing or wrong pairing token' }, { 'WWW-Authenticate': 'Bearer' });
      }
      fails.delete(ip);
      const url = new URL(req.url, 'http://agent');
      const body = req.method === 'POST' ? await readBody(req) : null;
      reply(200, await route(req, url, body));
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.warn(`[remote-host] ${err.message}`);
      reply(status, { error: status === 500 ? 'The host launcher had an error' : err.message }, status === 413 ? { Connection: 'close' } : {});
      if (status === 413) res.once('finish', () => req.socket.destroy());
    }
  }

  // ------------------------------------------------------------ server --
  function listen() {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => void handle(req, res));
      srv.headersTimeout = 10000;
      srv.requestTimeout = 15000;
      srv.keepAliveTimeout = 5000;
      srv.maxHeadersCount = 40;
      srv.maxConnections = 64;
      srv.once('error', (err) => {
        reject(new Error(err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Pick another port.` : err.code === 'EADDRNOTAVAIL' ? `This PC has no address ${config.bind}` : `Could not share this PC: ${err.message}`));
      });
      srv.listen(config.port, config.bind, () => {
        srv.removeAllListeners('error');
        srv.on('error', (err) => console.warn(`[remote-host] ${err.message}`));
        resolve(srv);
      });
    });
  }

  async function stopServer() {
    if (!server) return;
    const s = server;
    server = null;
    await new Promise((r) => {
      s.close(() => r());
      s.closeAllConnections?.();
    });
  }

  async function apply() {
    await stopServer();
    lastError = null;
    if (!config.enabled) return;
    try {
      server = await listen();
    } catch (err) {
      lastError = err.message;
      throw err;
    }
  }

  async function status() {
    await load();
    const port = server ? server.address().port : config.port;
    const ips = config.bind === '0.0.0.0' || config.bind === '::' ? lanAddresses() : [config.bind];
    return {
      enabled: config.enabled,
      listening: Boolean(server),
      port,
      bind: config.bind,
      token: config.token,
      addresses: ips.map((ip) => (ip.includes(':') ? `[${ip}]:${port}` : `${ip}:${port}`)),
      error: lastError,
    };
  }

  async function update(patch = {}) {
    await load();
    const next = normalizeConfig({ ...config, ...patch, token: config.token });
    if ('port' in patch && next.port !== Number(patch.port)) throw new Error('Pick a port between 1024 and 65535');
    if ('bind' in patch && next.bind !== patch.bind) throw new Error('That is not a valid bind address');
    config = next;
    await store.writeJson(file, config);
    try {
      await apply();
    } catch {
      /* reported through status().error */
    }
    return status();
  }

  async function regenerate() {
    await load();
    config.token = newToken();
    await store.writeJson(file, config);
    fails.clear();
    return status();
  }

  async function startIfEnabled() {
    await load();
    if (config.enabled) await apply().catch((err) => console.warn(`[remote-host] ${err.message}`));
  }

  return { load, status, update, regenerate, startIfEnabled, close: stopServer, observe, handle };
}

// ------------------------------------------------------------- client --
/** Talks to another PC's host agent. */
function createAgentClient({ host, port = DEFAULTS.port, token, fetch: fetchFn = globalThis.fetch, timeout = 8000 } = {}) {
  const h = String(host || '').trim();
  if (!h || !/^[A-Za-z0-9.:[\]-]{1,255}$/.test(h)) throw new Error('Enter the other PC\'s address');
  const p = Number(port) || DEFAULTS.port;
  if (p < 1 || p > 65535) throw new Error('The port must be between 1 and 65535');
  if (!token) throw new Error('Paste the pairing token from the other PC');
  const base = `http://${h.includes(':') && !h.startsWith('[') ? `[${h}]` : h}:${p}`;

  async function call(method, pathName, body) {
    let res;
    try {
      res = await fetchFn(`${base}${pathName}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('The other PC did not answer in time');
      throw new Error(`Could not reach the other PC. Is "Share this PC" turned on there? (${err.cause?.code || err.message})`);
    }
    const text = (await res.text()).slice(0, 2 * 1024 * 1024);
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const msg = res.status === 401 ? 'The other PC rejected the pairing token. Copy it again from Share this PC.'
        : res.status === 429 ? 'Too many wrong tokens. The other PC is blocking this one for a while.'
        : json?.error || `The other PC answered with HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (!json || typeof json !== 'object') throw new Error('That address is not a Pimpin Launcher');
    return json;
  }
  const sid = (id) => {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(String(id || ''))) throw new Error('Pick a server on the other PC');
    return encodeURIComponent(id);
  };
  return {
    base,
    info: () => call('GET', '/v1/info'),
    list: async () => (await call('GET', '/v1/servers')).servers || [],
    get: (id) => call('GET', `/v1/servers/${sid(id)}`),
    power: (id, action) => {
      if (!['start', 'stop', 'restart'].includes(action)) throw new Error('Unknown power action');
      return call('POST', `/v1/servers/${sid(id)}/${action}`);
    },
    command: (id, command) => call('POST', `/v1/servers/${sid(id)}/command`, { command }),
    logs: (id, since = 0) => call('GET', `/v1/servers/${sid(id)}/logs?since=${Math.max(0, Number(since) || 0)}`),
    players: (id) => call('GET', `/v1/servers/${sid(id)}/players`),
  };
}

module.exports = { createHostAgent, createAgentClient, normalizeConfig, validCommand, DEFAULTS, BODY_LIMIT };
