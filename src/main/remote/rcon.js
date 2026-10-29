// Source RCON client (what Minecraft's enable-rcon speaks). One TCP
// connection per server, reused for a while and closed when idle. Commands
// are sent one at a time so responses can't get mixed up.
// Protocol: https://developer.valvesoftware.com/wiki/Source_RCON_Protocol
const net = require('net');
const { stripCodes } = require('./ping');

const TYPE_AUTH = 3;
const TYPE_EXEC = 2; // also the auth reply type
const TYPE_RESPONSE = 0;
const MAX_PACKET = 4110; // 4 len + 4 id + 4 type + 4096 body + 2 nulls
const MAX_COMMAND = 1446; // vanilla rejects longer client packets
const DEFAULT_PORT = 25575;

function encode(id, type, body) {
  const data = Buffer.from(String(body), 'utf8');
  const buf = Buffer.alloc(14 + data.length);
  buf.writeInt32LE(10 + data.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  data.copy(buf, 12);
  return buf; // the two trailing zero bytes are already there from alloc
}

/** Pulls complete packets out of `buf`. Returns { packets, rest }. */
function decode(buf) {
  const packets = [];
  let off = 0;
  while (buf.length - off >= 4) {
    const len = buf.readInt32LE(off);
    if (len < 10 || len + 4 > MAX_PACKET) throw new Error('The RCON server sent a malformed packet');
    if (buf.length - off < len + 4) break;
    const id = buf.readInt32LE(off + 4);
    const type = buf.readInt32LE(off + 8);
    const body = buf.subarray(off + 12, off + 4 + len - 2).toString('utf8');
    packets.push({ id, type, body });
    off += len + 4;
  }
  return { packets, rest: buf.subarray(off) };
}

function validateCommand(cmd) {
  const c = String(cmd ?? '').trim().replace(/^\//, '');
  if (!c) throw new Error('Type a command first');
  if (/[\r\n\0]/.test(c)) throw new Error('A command has to be a single line');
  if (Buffer.byteLength(c, 'utf8') > MAX_COMMAND) throw new Error('That command is too long for RCON');
  return c;
}

class RconClient {
  constructor({ host, port = DEFAULT_PORT, password, timeout = 6000, idleMs = 60000, connect = net.connect } = {}) {
    if (!host) throw new Error('RCON needs a host');
    if (!password) throw new Error('RCON needs a password');
    Object.assign(this, { host, port: Number(port) || DEFAULT_PORT, password, timeout, idleMs, connectFn: connect });
    this.sock = null;
    this.ready = null; // promise of an authenticated connection
    this.nextId = 1;
    this.waiting = null; // { onPacket, fail }
    this.chain = Promise.resolve();
    this.idleTimer = null;
  }

  id() {
    this.nextId = (this.nextId % 0x3fffffff) + 1;
    return this.nextId;
  }

  connect() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const sock = this.connectFn({ host: this.host, port: this.port });
      this.sock = sock;
      let buf = Buffer.alloc(0);
      const fail = (err) => {
        clearTimeout(timer);
        if (this.sock !== sock) return reject(err); // a stale socket, a newer one is in use
        const w = this.waiting;
        this.waiting = null;
        this.drop();
        w?.fail(err);
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error('RCON did not answer in time')), this.timeout);
      sock.on('error', (err) => {
        const msg = { ECONNREFUSED: 'RCON refused the connection. Check enable-rcon and the RCON port.', ENOTFOUND: 'That RCON host could not be found', ETIMEDOUT: 'RCON did not answer in time' }[err.code];
        fail(new Error(msg || `RCON connection failed: ${err.message}`));
      });
      sock.on('close', () => fail(new Error('The RCON connection was closed')));
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (buf.length > MAX_PACKET * 64) return fail(new Error('The RCON server sent too much data'));
        let out;
        try {
          out = decode(buf);
        } catch (err) {
          return fail(err);
        }
        buf = out.rest;
        for (const p of out.packets) this.waiting?.onPacket(p);
      });
      sock.on('connect', () => {
        const authId = this.id();
        this.waiting = {
          onPacket: (p) => {
            // Source servers send an empty RESPONSE first; the auth answer is type 2
            if (p.type !== TYPE_EXEC) return;
            clearTimeout(timer);
            this.waiting = null;
            if (p.id === -1) {
              const err = new Error('RCON password was not accepted');
              err.code = 'RCON_AUTH';
              this.drop();
              reject(err);
            } else if (p.id === authId) resolve();
          },
          fail: () => {},
        };
        sock.write(encode(authId, TYPE_AUTH, this.password));
      });
    });
    this.ready.catch(() => {});
    return this.ready;
  }

  drop() {
    clearTimeout(this.idleTimer);
    this.ready = null;
    if (this.sock) {
      this.sock.removeAllListeners('close');
      this.sock.on('error', () => {});
      this.sock.destroy();
    }
    this.sock = null;
  }

  close() {
    const w = this.waiting;
    this.waiting = null;
    this.drop();
    w?.fail(new Error('RCON connection closed'));
  }

  /** Runs one command and resolves with the full (multi-packet) response text. */
  command(cmd) {
    const c = validateCommand(cmd);
    const run = this.chain.then(() => this.exec(c));
    this.chain = run.catch(() => {});
    return run;
  }

  async exec(cmd) {
    clearTimeout(this.idleTimer);
    await this.connect();
    const result = await new Promise((resolve, reject) => {
      const reqId = this.id();
      const endId = this.id();
      const parts = [];
      const done = (err, text) => {
        clearTimeout(timer);
        this.waiting = null;
        if (err) reject(err);
        else resolve(text);
      };
      const timer = setTimeout(() => {
        // no terminator (some non-vanilla servers ignore unknown packets): use what came
        if (parts.length) done(null, parts.join(''));
        else {
          this.drop();
          done(new Error('RCON did not answer in time'));
        }
      }, this.timeout);
      this.waiting = {
        onPacket: (p) => {
          if (p.id === reqId) parts.push(p.body);
          // the follow-up packet is answered after every part of the real reply
          else if (p.id === endId) done(null, parts.join(''));
        },
        fail: (err) => done(err),
      };
      this.sock.write(Buffer.concat([encode(reqId, TYPE_EXEC, cmd), encode(endId, TYPE_RESPONSE, '')]));
    });
    this.idleTimer = setTimeout(() => this.drop(), this.idleMs);
    this.idleTimer.unref?.();
    return stripCodes(result);
  }
}

/** "There are 2 of a max of 20 players online: a, b" -> { online, max, names } */
function parseList(text) {
  const m = String(text).match(/There are (\d+)\s*(?:of a max of|\/)\s*(\d+) players online:?\s*(.*)$/is);
  if (!m) return null;
  const names = m[3].split(/[,\s]+/).map((n) => n.trim()).filter((n) => /^\.?[A-Za-z0-9_]{1,20}$/.test(n));
  return { online: Number(m[1]), max: Number(m[2]), names };
}

module.exports = { RconClient, encode, decode, validateCommand, parseList, MAX_PACKET, MAX_COMMAND, DEFAULT_PORT, TYPE_AUTH, TYPE_EXEC, TYPE_RESPONSE };
