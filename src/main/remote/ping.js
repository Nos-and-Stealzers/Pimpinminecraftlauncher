// Minecraft Server List Ping (the status request the multiplayer screen uses).
// Works against any Java Edition server 1.7+, no login needed. Used by every
// remote connection kind to show online/players/version/MOTD and latency.
// Protocol: https://minecraft.wiki/w/Java_Edition_protocol/Server_List_Ping
const net = require('net');
const dns = require('dns').promises;

const DEFAULT_PORT = 25565;
const DEFAULT_TIMEOUT = 5000;
const MAX_RESPONSE = 1024 * 1024; // modded servers send big forgeData blobs
const MAX_FAVICON = 128 * 1024;

// --------------------------------------------------------------- varints --
function writeVarInt(value) {
  let v = value >>> 0; // negatives are sent as their 32-bit two's complement
  const out = [];
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return Buffer.from(out);
}

/** { value, size } or null when the buffer ends mid-varint. Throws on >5 bytes. */
function readVarInt(buf, offset = 0) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return null;
    const b = buf[offset + i];
    value |= (b & 0x7f) << (7 * i);
    if (!(b & 0x80)) return { value: value | 0, size: i + 1 };
  }
  throw new Error('VarInt is too big');
}

function writeString(s) {
  const data = Buffer.from(String(s), 'utf8');
  return Buffer.concat([writeVarInt(data.length), data]);
}

function packet(id, ...parts) {
  const body = Buffer.concat([writeVarInt(id), ...parts]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

// ------------------------------------------------------------ addresses --
const HOSTNAME = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.?$/;
/** "host", "host:port", "[v6]:port" -> { host, port|null }. Throws on junk. */
function parseAddress(input) {
  const text = String(input || '').trim();
  if (!text || text.length > 260) throw new Error('Enter a server address, for example play.example.com');
  let host = text;
  let port = null;
  const v6 = text.match(/^\[([0-9a-fA-F:.]+)\](?::(\d+))?$/);
  if (v6) {
    host = v6[1];
    port = v6[2] ? Number(v6[2]) : null;
  } else if ((text.match(/:/g) || []).length === 1) {
    const [h, p] = text.split(':');
    if (!/^\d{1,5}$/.test(p)) throw new Error('The port must be a number');
    host = h;
    port = Number(p);
  } else if (text.includes(':') && net.isIPv6(text)) {
    host = text;
  }
  if (port !== null && (port < 1 || port > 65535)) throw new Error('The port must be between 1 and 65535');
  if (!net.isIP(host) && !HOSTNAME.test(host)) throw new Error('That is not a valid host name');
  return { host, port };
}

/** Like the game: no port means look up _minecraft._tcp SRV, else 25565. */
async function resolveAddress(input, { resolveSrv = dns.resolveSrv } = {}) {
  const { host, port } = parseAddress(input);
  if (port) return { host, port, srv: false };
  if (!net.isIP(host) && host !== 'localhost') {
    try {
      const records = await Promise.race([
        resolveSrv(`_minecraft._tcp.${host}`),
        new Promise((_, rej) => setTimeout(() => rej(new Error('srv timeout')), 3000)),
      ]);
      if (records?.length) {
        records.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
        return { host: records[0].name.replace(/\.$/, ''), port: records[0].port, srv: true };
      }
    } catch {
      /* no SRV record: plain host */
    }
  }
  return { host, port: DEFAULT_PORT, srv: false };
}

// ------------------------------------------------------------ chat text --
const stripCodes = (s) => String(s ?? '').replace(/§[0-9a-fk-orx]/gi, '').replace(/§/g, '');

/** Chat component (string / object / array) to plain text. */
function componentText(c, depth = 0) {
  if (depth > 32 || c === null || c === undefined) return '';
  if (typeof c === 'string') return c;
  if (typeof c === 'number' || typeof c === 'boolean') return String(c);
  if (Array.isArray(c)) return c.map((x) => componentText(x, depth + 1)).join('');
  if (typeof c === 'object') {
    let out = '';
    if (typeof c.text === 'string' || typeof c.text === 'number') out += c.text;
    else if (typeof c.translate === 'string') out += c.fallback ?? c.translate;
    if (Array.isArray(c.extra)) out += c.extra.map((x) => componentText(x, depth + 1)).join('');
    return out;
  }
  return '';
}

const motdText = (description) => stripCodes(componentText(description)).replace(/\r/g, '').split('\n').map((l) => l.trim()).join('\n').trim();

function parseStatus(json, latency, host, port) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('The server sent an invalid status reply');
  }
  if (!data || typeof data !== 'object') throw new Error('The server sent an invalid status reply');
  const players = data.players || {};
  const sample = Array.isArray(players.sample)
    ? players.sample.map((p) => stripCodes(p?.name)).filter((n) => n && n.length <= 64).slice(0, 50)
    : [];
  const favicon = typeof data.favicon === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(data.favicon) && data.favicon.length <= MAX_FAVICON ? data.favicon.replace(/\s/g, '') : null;
  return {
    online: true,
    host,
    port,
    version: { name: stripCodes(data.version?.name || '').slice(0, 120), protocol: Number(data.version?.protocol) || null },
    players: { online: Number(players.online) || 0, max: Number(players.max) || 0, sample },
    motd: motdText(data.description).slice(0, 400),
    favicon,
    latency,
  };
}

// ----------------------------------------------------------------- ping --
/**
 * Pings a server. Resolves { online:true, version, players, motd, favicon,
 * latency } or rejects with a friendly message (offline, timeout, bad reply).
 */
async function ping(address, { timeout = DEFAULT_TIMEOUT, resolveSrv, connect = net.connect } = {}) {
  const target = await resolveAddress(address, { resolveSrv });
  return new Promise((resolve, reject) => {
    const sock = connect({ host: target.host, port: target.port });
    let buf = Buffer.alloc(0);
    let status = null;
    let sentAt = 0;
    let finished = false;
    const finish = (err, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      sock.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(status ? null : new Error('The server did not answer in time'), status), timeout);
    sock.setNoDelay?.(true);
    sock.on('error', (err) => {
      const msg = { ECONNREFUSED: 'The server is offline (connection refused)', ENOTFOUND: 'That address could not be found', EHOSTUNREACH: 'The server cannot be reached', ETIMEDOUT: 'The server did not answer in time' }[err.code];
      finish(status ? null : new Error(msg || `Could not reach the server: ${err.message}`), status);
    });
    sock.on('close', () => finish(status ? null : new Error('The server closed the connection'), status));
    sock.on('connect', () => {
      const port = Buffer.alloc(2);
      port.writeUInt16BE(target.port);
      // protocol -1: "I don't know", every version answers the status request
      sock.write(Buffer.concat([packet(0x00, writeVarInt(-1), writeString(target.host), port, writeVarInt(1)), packet(0x00)]));
      sentAt = Date.now();
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > MAX_RESPONSE) return finish(new Error('The server sent too much data'));
      try {
        for (;;) {
          const len = readVarInt(buf);
          if (!len) return;
          if (len.value < 1 || len.value > MAX_RESPONSE) throw new Error('The server sent an invalid status reply');
          if (buf.length < len.size + len.value) return;
          const body = buf.subarray(len.size, len.size + len.value);
          buf = buf.subarray(len.size + len.value);
          const id = readVarInt(body);
          if (!id) throw new Error('The server sent an invalid status reply');
          if (id.value === 0x00 && !status) {
            const slen = readVarInt(body, id.size);
            if (!slen || slen.value < 0 || id.size + slen.size + slen.value > body.length) throw new Error('The server sent an invalid status reply');
            const json = body.subarray(id.size + slen.size, id.size + slen.size + slen.value).toString('utf8');
            status = parseStatus(json, Date.now() - sentAt, target.host, target.port);
            // ping/pong for an honest latency figure, status latency is the fallback
            const payload = Buffer.alloc(8);
            payload.writeBigInt64BE(BigInt(Date.now()));
            sentAt = Date.now();
            sock.write(packet(0x01, payload));
          } else if (id.value === 0x01 && status) {
            status.latency = Date.now() - sentAt;
            return finish(null, status);
          }
        }
      } catch (err) {
        finish(status ? null : err, status);
      }
    });
  });
}

module.exports = { ping, parseAddress, resolveAddress, writeVarInt, readVarInt, writeString, packet, componentText, motdText, stripCodes, parseStatus, DEFAULT_PORT };
