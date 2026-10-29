// Saved remote server connections and one set of operations for all kinds:
//   pterodactyl  a hosting panel (Pterodactyl / Pelican) with a client API key
//   rcon         any server with enable-rcon
//   pimpin       a server on another PC running Pimpin Launcher (Share this PC)
//   address      ping only, for any server you just want to watch
// Secrets (API key, RCON password, pairing token) are encrypted with the OS
// keychain through Electron safeStorage and never sent to the renderer.
const path = require('path');
const crypto = require('crypto');
const ping = require('./ping');
const { RconClient, parseList, DEFAULT_PORT: RCON_PORT } = require('./rcon');
const ptero = require('./pterodactyl');
const { createAgentClient, DEFAULTS: AGENT_DEFAULTS } = require('./host-agent');

const KINDS = ['pterodactyl', 'rcon', 'pimpin', 'address'];
const LOG_KEEP = 600;
const MAX_CONNECTIONS = 100;

const POWER = {
  pterodactyl: ['start', 'stop', 'restart', 'kill'],
  pimpin: ['start', 'stop', 'restart'],
  rcon: ['stop'], // "stop" is a console command; RCON can't start a stopped server
  address: [],
};

const NO_SECURE = 'Secure storage is not available on this system, so the launcher will not save passwords or API keys. Use an "Address only" connection instead.';
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function createRemoteServers({ root, store, safeStorage, emit = () => {}, fetch: fetchFn = globalThis.fetch, WebSocket: WS = globalThis.WebSocket, pingFn = ping.ping, connect } = {}) {
  const file = path.join(root, 'remote-servers.json');
  const secretsFile = path.join(root, 'remote-secrets.json');
  let cache = null;
  const rcons = new Map(); // id -> RconClient
  const logs = new Map(); // id -> string[]
  const consoles = new Map(); // id -> { refs, close }
  const lastStatus = new Map();

  // --------------------------------------------------------- storage --
  async function all() {
    if (!cache) {
      const data = await store.readJson(file, { connections: [] });
      cache = Array.isArray(data?.connections) ? data.connections.filter((c) => c && KINDS.includes(c.kind) && typeof c.id === 'string') : [];
    }
    return cache;
  }
  const persist = () => store.writeJson(file, { version: 1, connections: cache });

  function secureAvailable() {
    try {
      if (!safeStorage?.isEncryptionAvailable?.()) return false;
      // Linux without a keyring falls back to a hard-coded key: not real protection
      return safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
    } catch {
      return false;
    }
  }

  async function readSecrets() {
    const s = await store.readJson(secretsFile, {});
    return s && typeof s === 'object' ? s : {};
  }

  async function setSecret(id, secret) {
    const secrets = await readSecrets();
    if (secret === null) delete secrets[id];
    else {
      if (!secureAvailable()) throw new Error(NO_SECURE);
      secrets[id] = safeStorage.encryptString(String(secret)).toString('base64');
    }
    await store.writeJson(secretsFile, secrets);
  }

  async function getSecret(id) {
    const enc = (await readSecrets())[id];
    if (!enc) return null;
    if (!secureAvailable()) throw new Error('Secure storage is not available, so the saved password or key cannot be read.');
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch {
      throw new Error('The saved password or key could not be decrypted. Edit the connection and enter it again.');
    }
  }

  /** What the renderer may see: never the secret itself. */
  async function publicList() {
    const secrets = await readSecrets();
    return (await all()).map((c) => ({ ...c, hasSecret: Boolean(secrets[c.id]), power: POWER[c.kind] }));
  }

  // Validates and normalizes a connection draft from the renderer.
  function clean(draft) {
    const kind = draft?.kind;
    if (!KINDS.includes(kind)) throw new Error('Pick a connection type');
    const c = { kind, name: str(draft.name, 60) };
    const mc = str(draft.mcVersion, 32);
    if (mc && !/^[0-9A-Za-z.\-_ ]+$/.test(mc)) throw new Error('That is not a Minecraft version');
    if (mc) c.mcVersion = mc;
    const address = str(draft.address, 260);
    if (address) {
      ping.parseAddress(address); // throws a friendly message on junk
      c.address = address;
    }
    if (kind === 'address') {
      if (!c.address) throw new Error('Enter the server address');
    } else if (kind === 'rcon') {
      const host = str(draft.host, 255) || (c.address ? ping.parseAddress(c.address).host : '');
      if (!host) throw new Error('Enter the RCON host');
      ping.parseAddress(host);
      const port = Number(draft.port) || RCON_PORT;
      if (port < 1 || port > 65535) throw new Error('The RCON port must be between 1 and 65535');
      Object.assign(c, { host, port });
    } else if (kind === 'pimpin') {
      const host = str(draft.host, 255);
      if (!host) throw new Error('Enter the other PC\'s address');
      ping.parseAddress(host);
      const port = Number(draft.port) || AGENT_DEFAULTS.port;
      if (port < 1 || port > 65535) throw new Error('The port must be between 1 and 65535');
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(str(draft.serverId, 80))) throw new Error('Pick a server on the other PC');
      Object.assign(c, { host, port, serverId: str(draft.serverId, 80) });
      if (draft.gamePort && Number(draft.gamePort) > 0 && Number(draft.gamePort) < 65536) c.gamePort = Number(draft.gamePort);
    } else if (kind === 'pterodactyl') {
      c.panelUrl = ptero.validatePanelUrl(draft.panelUrl);
      c.serverId = ptero.validateServerId(draft.serverId);
    }
    if (!c.name) c.name = c.address || c.host || 'Remote server';
    return c;
  }

  async function save(draft, secret) {
    const list = await all();
    const c = clean(draft);
    const existing = draft.id ? list.find((x) => x.id === draft.id) : null;
    if (draft.id && !existing) throw new Error('Connection not found');
    const needsSecret = c.kind !== 'address';
    const newSecret = typeof secret === 'string' && secret.trim() ? secret.trim() : null;
    if (newSecret && c.kind === 'pterodactyl') ptero.validateApiKey(newSecret);
    if (needsSecret && !newSecret && !(existing && (await readSecrets())[existing.id])) {
      throw new Error(c.kind === 'rcon' ? 'Enter the RCON password' : c.kind === 'pimpin' ? 'Paste the pairing token from the other PC' : 'Paste a client API key from the panel');
    }
    if (needsSecret && newSecret && !secureAvailable()) throw new Error(NO_SECURE);
    if (!existing && list.length >= MAX_CONNECTIONS) throw new Error('That is a lot of connections. Remove some first.');
    const id = existing?.id || crypto.randomBytes(8).toString('hex');
    if (needsSecret && newSecret) await setSecret(id, newSecret);
    if (!needsSecret && existing) await setSecret(id, null);
    const record = { id, ...c, created: existing?.created || Date.now(), updated: Date.now() };
    if (existing) list[list.indexOf(existing)] = record;
    else list.push(record);
    dropClients(id);
    await persist();
    return (await publicList()).find((x) => x.id === id);
  }

  async function remove(id) {
    const list = await all();
    const i = list.findIndex((x) => x.id === id);
    if (i === -1) throw new Error('Connection not found');
    list.splice(i, 1);
    dropClients(id);
    logs.delete(id);
    lastStatus.delete(id);
    await setSecret(id, null);
    await persist();
    return publicList();
  }

  async function find(id) {
    const c = (await all()).find((x) => x.id === id);
    if (!c) throw new Error('Connection not found');
    return c;
  }

  // ------------------------------------------------------------ clients --
  async function panel(c, secret) {
    return ptero.createPanelClient({ panelUrl: c.panelUrl, apiKey: secret ?? (await getSecret(c.id)), fetch: fetchFn, WebSocket: WS });
  }
  async function agent(c, secret) {
    return createAgentClient({ host: c.host, port: c.port, token: secret ?? (await getSecret(c.id)), fetch: fetchFn });
  }
  async function rcon(c) {
    let r = rcons.get(c.id);
    if (!r) {
      r = new RconClient({ host: c.host, port: c.port, password: await getSecret(c.id), connect });
      rcons.set(c.id, r);
    }
    return r;
  }
  function dropClients(id) {
    rcons.get(id)?.close();
    rcons.delete(id);
    const con = consoles.get(id);
    if (con) {
      con.close();
      consoles.delete(id);
    }
  }

  // --------------------------------------------------------------- logs --
  function pushLog(id, line) {
    const buf = logs.get(id) || [];
    buf.push(String(line));
    if (buf.length > LOG_KEEP) buf.splice(0, buf.length - LOG_KEEP);
    logs.set(id, buf);
    emit('remote:log', { id, line: String(line) });
  }

  // ------------------------------------------------------------- status --
  function gameAddress(c, extra = {}) {
    if (c.address) return c.address;
    if (c.kind === 'pimpin' && (c.gamePort || extra.port)) return `${c.host}:${c.gamePort || extra.port}`;
    if (c.kind === 'pterodactyl' && extra.address) return extra.address;
    if (c.kind === 'rcon') return c.host;
    return null;
  }

  async function doPing(address) {
    if (!address) return { ping: null, pingError: null };
    try {
      return { ping: await pingFn(address, { timeout: 4000 }), pingError: null };
    } catch (err) {
      return { ping: null, pingError: err.message };
    }
  }

  /** Unified status: { state, ping, resources, remote, error, address, ... }. */
  async function status(id) {
    const c = await find(id);
    const out = { id, kind: c.kind, state: 'unknown', ping: null, pingError: null, resources: null, remote: null, error: null, address: null, power: POWER[c.kind], checkedAt: Date.now() };
    try {
      if (c.kind === 'pterodactyl') {
        const p = await panel(c);
        const [res, info] = await Promise.all([p.resources(c.serverId), p.getServer(c.serverId).catch(() => null)]);
        out.resources = { ...res, limits: info?.limits || null };
        out.state = res.state === 'running' ? 'online' : res.state === 'offline' ? 'offline' : res.state; // starting / stopping
        out.remote = info ? { name: info.name, node: info.node, address: info.address, suspended: info.suspended, installing: info.installing } : null;
        out.address = gameAddress(c, { address: info?.address });
      } else if (c.kind === 'pimpin') {
        const a = await agent(c);
        const s = await a.get(c.serverId);
        out.remote = s;
        out.state = s.running ? (s.ready ? 'online' : 'starting') : 'offline';
        out.address = gameAddress(c, { port: s.port });
      } else {
        out.address = gameAddress(c);
      }
    } catch (err) {
      out.error = err.message;
    }
    Object.assign(out, await doPing(out.address));
    if (out.ping) out.state = out.state === 'starting' && c.kind === 'pimpin' ? 'starting' : 'online';
    else if (c.kind === 'address' || c.kind === 'rcon') out.state = out.pingError ? 'offline' : 'unknown';
    else if (out.state === 'unknown' && out.error) out.state = 'error';
    lastStatus.set(id, out);
    emit('remote:status', out);
    return out;
  }

  // ---------------------------------------------------------- actions --
  async function power(id, action) {
    const c = await find(id);
    if (!POWER[c.kind].includes(action)) throw new Error(c.kind === 'address' ? 'An address-only connection can only be watched' : `This connection cannot ${action} the server`);
    if (c.kind === 'pterodactyl') await (await panel(c)).power(c.serverId, action);
    else if (c.kind === 'pimpin') await (await agent(c)).power(c.serverId, action);
    else if (c.kind === 'rcon') await command(id, 'stop');
    pushLog(id, `[Pimpin] Sent ${action}`);
    return { ok: true };
  }

  async function command(id, cmd) {
    const c = await find(id);
    if (c.kind === 'address') throw new Error('An address-only connection cannot run commands. Add RCON or a panel connection for that.');
    const text = String(cmd ?? '').trim().replace(/^\//, '');
    if (c.kind === 'rcon') {
      const r = await rcon(c);
      pushLog(id, `> ${text}`);
      try {
        const reply = await r.command(text);
        for (const line of reply.split('\n')) if (line.trim()) pushLog(id, line);
        if (!reply.trim()) pushLog(id, '[Pimpin] (no output)');
        return { ok: true, reply };
      } catch (err) {
        if (err.code === 'RCON_AUTH') dropClients(id);
        pushLog(id, `[Pimpin] ${err.message}`);
        throw err;
      }
    }
    if (c.kind === 'pterodactyl') await (await panel(c)).command(c.serverId, text);
    else await (await agent(c)).command(c.serverId, text);
    if (!consoles.has(id)) pushLog(id, `> ${text}`); // live consoles echo it themselves
    return { ok: true };
  }

  async function players(id) {
    const c = await find(id);
    const st = lastStatus.get(id) && Date.now() - lastStatus.get(id).checkedAt < 15000 ? lastStatus.get(id) : await status(id);
    const out = { online: st.ping?.players?.online ?? null, max: st.ping?.players?.max ?? null, names: st.ping?.players?.sample || [], source: 'ping', note: null };
    try {
      if (c.kind === 'pimpin') {
        const p = await (await agent(c)).players(c.serverId);
        Object.assign(out, { names: p.online, online: p.online.length, ops: p.ops, whitelist: p.whitelist, banned: p.banned, source: 'pimpin' });
      } else if (c.kind === 'rcon') {
        const list = parseList(await (await rcon(c)).command('list'));
        if (list) Object.assign(out, { names: list.names, online: list.online, max: list.max, source: 'rcon' });
      }
    } catch (err) {
      out.note = err.message;
    }
    if (out.source === 'ping' && out.online > out.names.length) out.note = 'The server only shares part of the player list.';
    return out;
  }

  // ----------------------------------------------------------- console --
  /** Starts (on) or stops (off) the live console. Returns the backlog. */
  async function consoleSubscribe(id, on = true) {
    const c = await find(id);
    let con = consoles.get(id);
    if (!on) {
      if (con && --con.refs <= 0) {
        con.close();
        consoles.delete(id);
      }
      return { lines: logs.get(id) || [], live: false };
    }
    if (con) {
      con.refs++;
      return { lines: logs.get(id) || [], live: true };
    }
    if (c.kind === 'pterodactyl') {
      const p = await panel(c);
      logs.set(id, []); // the panel replays recent output on connect
      const handle = p.openConsole(c.serverId, {
        onLine: (line) => pushLog(id, line),
        onStatus: (s) => emit('remote:status', { ...(lastStatus.get(id) || { id, kind: c.kind }), id, state: s === 'running' ? 'online' : s, live: true }),
        onStats: (s) => {
          const prev = lastStatus.get(id);
          if (prev?.resources) {
            prev.resources = { ...prev.resources, ...s };
            emit('remote:status', { ...prev, live: true });
          }
        },
        onError: (msg) => pushLog(id, `[Pimpin] ${msg}`),
        onClose: () => consoles.delete(id),
      });
      con = { refs: 1, close: handle.close };
    } else if (c.kind === 'pimpin') {
      const a = await agent(c);
      let cursor = 0;
      let stopped = false;
      let timer = null;
      let failures = 0;
      logs.set(id, []);
      const poll = async () => {
        if (stopped) return;
        try {
          const r = await a.logs(c.serverId, cursor);
          if (r.truncated) pushLog(id, '[Pimpin] Some lines were skipped');
          for (const line of r.lines || []) pushLog(id, line);
          cursor = Number(r.cursor) || cursor;
          failures = 0;
        } catch (err) {
          if (++failures === 1) pushLog(id, `[Pimpin] ${err.message}`);
        }
        if (!stopped) timer = setTimeout(poll, failures ? Math.min(15000, 1500 * 2 ** failures) : 1500);
      };
      await poll();
      con = { refs: 1, close: () => { stopped = true; clearTimeout(timer); } };
    } else {
      if (!logs.has(id)) pushLog(id, c.kind === 'rcon' ? '[Pimpin] RCON shows the reply to each command you send. It does not stream the server log.' : '[Pimpin] An address-only connection has no console.');
      return { lines: logs.get(id) || [], live: false };
    }
    consoles.set(id, con);
    return { lines: logs.get(id) || [], live: true };
  }

  // -------------------------------------------------------- discovery --
  /** Lists servers a panel key or another PC can see, before saving. */
  async function discover(draft, secret) {
    const existing = draft?.id ? await find(draft.id).catch(() => null) : null;
    const key = typeof secret === 'string' && secret.trim() ? secret.trim() : existing ? await getSecret(existing.id) : null;
    if (draft?.kind === 'pterodactyl') {
      const p = await panel({ panelUrl: draft.panelUrl }, key);
      return { servers: await p.listServers() };
    }
    if (draft?.kind === 'pimpin') {
      const a = await agent({ host: str(draft.host, 255), port: Number(draft.port) || AGENT_DEFAULTS.port }, key);
      const info = await a.info();
      return { info: { hostname: String(info.hostname || '').slice(0, 80), version: String(info.version || '').slice(0, 20) }, servers: (await a.list()).map((s) => ({ id: s.id, name: s.name, mcVersion: s.mcVersion, software: s.software, port: s.port, running: s.running })) };
    }
    if (draft?.kind === 'rcon') {
      const r = new RconClient({ host: str(draft.host, 255), port: Number(draft.port) || RCON_PORT, password: key, connect, timeout: 5000 });
      try {
        await r.command('list');
        return { ok: true };
      } finally {
        r.close();
      }
    }
    if (draft?.kind === 'address') return { ping: await pingFn(str(draft.address, 260), { timeout: 4000 }) };
    throw new Error('Pick a connection type');
  }

  function shutdown() {
    for (const id of [...rcons.keys(), ...consoles.keys()]) dropClients(id);
  }

  return { list: publicList, save, remove, status, power, command, players, console: consoleSubscribe, discover, ping: (address) => pingFn(address, { timeout: 4000 }), shutdown, secureAvailable, KINDS, POWER };
}

module.exports = { createRemoteServers, KINDS, POWER };
