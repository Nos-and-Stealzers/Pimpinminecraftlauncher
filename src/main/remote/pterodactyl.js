// Pterodactyl / Pelican panel client (the Client API, the one a normal
// player account can use with a key from Account > API credentials).
// Covers listing servers, status + resource usage, power, commands and the
// live console over the panel's websocket.
// Docs: https://dashflo.net/docs/api/pterodactyl/v1/ (Client API)
const net = require('net');

const DEFAULT_TIMEOUT = 12000;
const MAX_BODY = 2 * 1024 * 1024;
const SERVER_ID = /^[A-Za-z0-9-]{1,64}$/;
const SIGNALS = new Set(['start', 'stop', 'restart', 'kill']);

const PRIVATE_V4 = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** http:// is only allowed for the local machine and private networks. */
function isPrivateHost(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1') return true;
  if (net.isIPv4(h)) return PRIVATE_V4.some((re) => re.test(h));
  if (net.isIPv6(h)) return /^f[cd]/.test(h) || /^fe80:/.test(h);
  return false;
}

/** Normalizes a panel URL: https (or http on a LAN), no credentials/query. */
function validatePanelUrl(input) {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    throw new Error('Enter the panel address, for example https://panel.example.com');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('The panel address must start with https://');
  if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) throw new Error('Use https:// for panels on the internet. Plain http is only allowed on your own network.');
  if (url.username || url.password) throw new Error('Do not put a login in the panel address');
  url.search = '';
  url.hash = '';
  return url.href.replace(/\/+$/, '');
}

function validateApiKey(key) {
  const k = String(key || '').trim();
  if (/^ptla_/.test(k)) throw new Error('That is an application key. Create a client key under Account > API credentials instead.');
  if (!/^[A-Za-z0-9_.-]{16,200}$/.test(k)) throw new Error('That does not look like a panel API key');
  return k;
}

function validateServerId(id) {
  const s = String(id || '').trim();
  if (!SERVER_ID.test(s)) throw new Error('Pick a server from the panel');
  return s;
}

const FRIENDLY = {
  400: 'The panel did not accept that request.',
  401: 'The panel rejected the API key. Check that it is a client key and has not been deleted.',
  403: 'This API key is not allowed to do that on this server.',
  404: 'The panel could not find that server. It may have been deleted or the key has no access.',
  409: 'The server is busy right now (installing, transferring or suspended). Try again in a moment.',
  412: 'The server is not ready for that yet.',
  429: 'The panel is rate limiting requests. Wait a minute and try again.',
  502: 'The panel could not reach the server node. The server may be offline.',
};

function panelError(status, detail) {
  const base = FRIENDLY[status] || (status >= 500 ? `The panel had an error (HTTP ${status}).` : `The panel answered with HTTP ${status}.`);
  const err = new Error(detail && status !== 401 ? `${base} (${String(detail).slice(0, 160)})` : base);
  err.status = status;
  return err;
}

async function readBody(res) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new Error('The panel sent too much data');
  if (!res.body) return '';
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('The panel sent too much data');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function mapServer(a) {
  const allocs = (a.relationships?.allocations?.data || []).map((x) => x.attributes || {});
  const main = allocs.find((x) => x.is_default) || allocs[0];
  const host = main ? main.ip_alias || (main.ip && main.ip !== '0.0.0.0' ? main.ip : a.sftp_details?.ip) : null;
  return {
    id: a.identifier,
    uuid: a.uuid,
    name: a.name,
    node: a.node,
    description: a.description || '',
    address: host && main?.port ? `${host}:${main.port}` : null,
    limits: { memory: a.limits?.memory ?? null, disk: a.limits?.disk ?? null, cpu: a.limits?.cpu ?? null },
    suspended: Boolean(a.is_suspended),
    installing: Boolean(a.is_installing),
    owner: a.server_owner !== false,
  };
}

const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');

function createPanelClient({ panelUrl, apiKey, fetch: fetchFn = globalThis.fetch, WebSocket: WS = globalThis.WebSocket, timeout = DEFAULT_TIMEOUT } = {}) {
  const base = validatePanelUrl(panelUrl);
  const key = validateApiKey(apiKey);
  const origin = new URL(base).origin;

  async function call(method, path, body) {
    let res;
    try {
      res = await fetchFn(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: 'application/vnd.pterodactyl.v1+json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error', // never follow a redirect with the key attached
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('The panel did not answer in time');
      throw new Error(`Could not reach the panel: ${err.cause?.code || err.message}`);
    }
    const text = await readBody(res);
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        if (res.ok) throw new Error('The panel sent an unexpected reply. Is this a Pterodactyl or Pelican panel?');
      }
    }
    if (!res.ok) throw panelError(res.status, json?.errors?.[0]?.detail);
    return json;
  }

  const srv = (id) => `/api/client/servers/${encodeURIComponent(validateServerId(id))}`;

  async function listServers() {
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const json = await call('GET', `/api/client?per_page=100&page=${page}`);
      for (const item of json?.data || []) if (item?.attributes?.identifier) out.push(mapServer(item.attributes));
      const pages = json?.meta?.pagination?.total_pages || 1;
      if (page >= pages) break;
    }
    return out;
  }

  async function getServer(id) {
    const json = await call('GET', srv(id));
    if (!json?.attributes) throw new Error('The panel sent an unexpected reply');
    return mapServer(json.attributes);
  }

  async function resources(id) {
    const a = (await call('GET', `${srv(id)}/resources`))?.attributes || {};
    const r = a.resources || {};
    return {
      state: a.current_state || 'offline',
      suspended: Boolean(a.is_suspended),
      cpu: Number(r.cpu_absolute) || 0,
      memory: Number(r.memory_bytes) || 0,
      disk: Number(r.disk_bytes) || 0,
      rx: Number(r.network_rx_bytes) || 0,
      tx: Number(r.network_tx_bytes) || 0,
      uptime: Number(r.uptime) || 0, // ms
    };
  }

  async function power(id, signal) {
    if (!SIGNALS.has(signal)) throw new Error('Unknown power action');
    await call('POST', `${srv(id)}/power`, { signal });
    return { ok: true };
  }

  async function command(id, cmd) {
    const c = String(cmd ?? '').trim().replace(/^\//, '');
    if (!c) throw new Error('Type a command first');
    if (/[\r\n]/.test(c) || c.length > 1000) throw new Error('A command has to be a single short line');
    await call('POST', `${srv(id)}/command`, { command: c });
    return { ok: true };
  }

  async function websocketCredentials(id) {
    const d = (await call('GET', `${srv(id)}/websocket`))?.data;
    if (!d?.token || !d?.socket) throw new Error('The panel did not hand out a console token');
    const socket = new URL(d.socket);
    if (socket.protocol !== 'wss:' && !(socket.protocol === 'ws:' && (base.startsWith('http:') || isPrivateHost(socket.hostname)))) {
      throw new Error('The panel console uses an insecure connection');
    }
    return { token: d.token, socket: socket.href };
  }

  /**
   * Live console. Returns { close() }. Callbacks: onLine(text), onStatus(state),
   * onStats(stats), onError(message), onClose(). Reconnects a few times.
   */
  function openConsole(id, { onLine = () => {}, onStatus = () => {}, onStats = () => {}, onError = () => {}, onClose = () => {} } = {}) {
    if (typeof WS !== 'function') {
      onError('Live console needs a newer launcher runtime. Commands still work.');
      return { close() {} };
    }
    let ws = null;
    let closed = false;
    let attempts = 0;
    let retry = null;

    const send = (event, args) => ws?.readyState === 1 && ws.send(JSON.stringify({ event, args }));
    const reauth = async () => {
      try {
        const { token } = await websocketCredentials(id);
        send('auth', [token]);
      } catch (err) {
        onError(err.message);
      }
    };
    const connect = async () => {
      if (closed) return;
      let creds;
      try {
        creds = await websocketCredentials(id);
      } catch (err) {
        onError(err.message);
        return schedule();
      }
      if (closed) return;
      try {
        // Wings checks Origin against the panel URL; Node's WebSocket lets us set it.
        ws = new WS(creds.socket, { headers: { Origin: origin } });
      } catch (err) {
        onError(`Console connection failed: ${err.message}`);
        return schedule();
      }
      ws.onopen = () => send('auth', [creds.token]);
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
        } catch {
          return;
        }
        const arg = msg.args?.[0];
        switch (msg.event) {
          case 'auth success':
            attempts = 0;
            send('send logs', [null]);
            send('send stats', [null]);
            break;
          case 'console output':
          case 'install output':
            for (const line of stripAnsi(arg ?? '').split('\n')) if (line.trim()) onLine(line);
            break;
          case 'daemon message':
            onLine(`[Panel] ${stripAnsi(arg ?? '')}`);
            break;
          case 'status':
            onStatus(String(arg || 'offline'));
            break;
          case 'stats':
            try {
              const s = JSON.parse(arg);
              onStats({ state: s.state, cpu: Number(s.cpu_absolute) || 0, memory: Number(s.memory_bytes) || 0, disk: Number(s.disk_bytes) || 0, uptime: Number(s.uptime) || 0, rx: Number(s.network?.rx_bytes) || 0, tx: Number(s.network?.tx_bytes) || 0 });
            } catch {
              /* ignore a malformed stats frame */
            }
            break;
          case 'token expiring':
            reauth();
            break;
          case 'token expired':
          case 'jwt error':
            ws.close();
            break;
          case 'daemon error':
            onError(stripAnsi(arg ?? 'The server node reported an error'));
            break;
          default:
        }
      };
      ws.onerror = () => {};
      ws.onclose = (ev) => {
        ws = null;
        if (closed) return;
        if (ev?.code === 4004 || ev?.code === 1008) onError('The panel refused the console connection (check that the panel URL matches the panel exactly)');
        schedule();
      };
    };
    const schedule = () => {
      if (closed) return;
      if (++attempts > 6) {
        onError('Lost the live console. Open the console again to retry.');
        closed = true;
        onClose();
        return;
      }
      retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts));
    };
    connect();
    return {
      close() {
        closed = true;
        clearTimeout(retry);
        try {
          ws?.close();
        } catch {
          /* already closed */
        }
        ws = null;
      },
    };
  }

  return { base, origin, listServers, getServer, resources, power, command, websocketCredentials, openConsole };
}

module.exports = { createPanelClient, validatePanelUrl, validateApiKey, validateServerId, isPrivateHost, panelError, mapServer, stripAnsi, SIGNALS };
