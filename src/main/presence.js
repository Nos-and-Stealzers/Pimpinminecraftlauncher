'use strict';

// IPC only: never call RPC.register(), which installs a native URL scheme.
// The factory has no store/Electron side effects; the public singleton is lazy.
function createPresence({
  getSettings = () => require('./store').getSettings(),
  createClient = () => new (require('discord-rpc').Client)({ transport: 'ipc' }),
  now = Date.now,
  setTimeout: later = setTimeout,
  clearTimeout: cancelTimer = clearTimeout,
  connectTimeoutMs = 10000,
  requestTimeoutMs = 5000,
  retryBaseMs = 1000,
  retryMaxMs = 30000,
} = {}) {
  let games = [];
  let fallbackStarted = null;
  let desired = null;
  let current = null;
  let worker = null;
  let dirty = false;
  let stopped = false;
  let retryTimer = null;
  let failures = 0;
  let status = { state: 'idle', message: 'No game is running.' };
  const cleanups = new Set();
  const messages = {
    disabled: 'Discord presence is disabled.',
    unconfigured: 'Enter a valid Discord application ID.',
    idle: 'No game is running.',
    connecting: 'Connecting to Discord.',
    connected: 'Discord presence is connected.',
    retrying: 'Discord is unavailable. Retrying automatically.',
  };
  const setStatus = (state) => { status = { state, message: messages[state] }; };
  function timer(fn, delay) {
    const t = later(fn, delay);
    if (t && typeof t.unref === 'function') t.unref();
    return t;
  }
  function stopRetry() {
    if (retryTimer !== null) cancelTimer(retryTimer);
    retryTimer = null;
  }
  // Bound text by UTF-8 bytes as well as characters, without splitting emoji.
  function text(value, fallback) {
    const clean = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
    let result = '';
    for (const ch of clean || fallback) {
      if (Buffer.byteLength(result + ch, 'utf8') > 128) break;
      result += ch;
    }
    return result;
  }
  function readDesired() {
    let s;
    try { s = getSettings() || {}; } catch { return { state: 'unconfigured' }; }
    if (stopped || s.discordRich === false) return { state: 'disabled' };
    // Do not trim/repair malformed IDs, or attempt any network authorization.
    if (typeof s.discordAppId !== 'string' || !/^\d{17,20}$/.test(s.discordAppId)) return { state: 'unconfigured' };
    if (!games.length) return { state: 'idle' };
    const main = [...games].sort((a, b) => (b.started || 0) - (a.started || 0))[0];
    const parts = [];
    if (s.discordShowVersion !== false) parts.push(text(main.mcVersion, 'Minecraft'), text(main.loader, 'vanilla'));
    const extra = games.length - 1;
    if (extra) parts.push(`${extra} more game${extra === 1 ? '' : 's'}`);
    const activity = {
      details: s.discordShowInstance === false ? 'Playing Minecraft' : text(`Playing ${text(main.name, 'Minecraft')}`, 'Playing Minecraft'),
      instance: false,
    };
    if (parts.length) activity.state = text(parts.join(' · '), 'Minecraft');
    if (s.discordShowElapsed !== false) activity.startTimestamp = Math.floor((main.started || fallbackStarted) / 1000);
    return { id: s.discordAppId, activity, key: JSON.stringify(activity) };
  }
  function forceSocket(c) {
    // discord-rpc destroy() awaits a close event forever if the peer vanished.
    // Also cover transport.connect() resolving after our login was cancelled.
    try { c.transport?.socket?.destroy(); } catch { /* already closed */ }
  }
  function bounded(rec, action, ms) {
    return new Promise((resolve, reject) => {
      let done = false;
      let t;
      const finish = (err, value) => {
        if (done) return;
        done = true;
        if (t !== undefined) cancelTimer(t);
        if (rec) rec.cancels.delete(abort);
        if (err) reject(err); else resolve(value);
      };
      const abort = () => finish(new Error('Presence operation cancelled'));
      if (rec) rec.cancels.add(abort);
      t = timer(() => finish(new Error('Presence operation timed out')), ms);
      Promise.resolve().then(() => {
        if (rec?.retired) throw new Error('Presence client retired');
        return action();
      }).then((v) => finish(null, v), (e) => finish(e));
    });
  }
  function retire(rec) {
    if (!rec || rec.retired) return;
    rec.retired = true;
    if (current === rec) current = null;
    for (const abort of [...rec.cancels]) abort();
    // Best-effort clear before closing, but neither a hung clear nor destroy
    // may block disable, replacement or app quit. Socket close clears presence.
    if (rec.ready) {
      try { Promise.resolve(rec.client.clearActivity()).catch(() => {}); } catch { /* gone */ }
    }
    let destruction;
    try { destruction = Promise.resolve(rec.client.destroy()); } catch { destruction = Promise.resolve(); }
    forceSocket(rec.client); // synchronous cleanup: before-quit does not await us
    const cleanup = bounded(null, () => destruction, requestTimeoutMs).catch(() => {}).finally(() => cleanups.delete(cleanup));
    cleanups.add(cleanup);
    // Handle a login promise that settles after cancellation (including rejects).
    if (rec.login) rec.login.then(() => forceSocket(rec.client), () => forceSocket(rec.client));
  }
  function retry() {
    if (stopped || !desired?.activity || retryTimer !== null) return;
    setStatus('retrying');
    const delay = Math.min(retryMaxMs, retryBaseMs * (2 ** Math.min(failures++, 16)));
    retryTimer = timer(() => {
      retryTimer = null;
      update(false);
    }, delay);
  }
  function connect(id) {
    const client = createClient();
    const rec = { client, id, ready: false, retired: false, cancels: new Set(), key: null, login: null };
    current = rec;
    const lost = () => {
      if (current !== rec || rec.retired) return;
      retire(rec);
      retry();
    };
    client.on('disconnected', lost);
    client.on('error', lost); // installed before login, including late errors
    client.transport?.on('open', () => { if (rec.retired) forceSocket(client); });
    return rec;
  }
  async function drain() {
    while (dirty) {
      dirty = false;
      if (!desired?.activity || stopped || retryTimer !== null) continue;
      let rec = current;
      try {
        if (!rec) {
          setStatus('connecting');
          rec = connect(desired.id);
          await bounded(rec, () => {
            rec.login = Promise.resolve(rec.client.login({ clientId: rec.id }));
            return rec.login;
          }, connectTimeoutMs);
          if (rec.retired || current !== rec) continue;
          rec.ready = true;
        }
        // Read the latest snapshot AFTER login: intermediate game lists coalesce.
        if (!desired?.activity || rec.id !== desired.id || current !== rec) continue;
        const target = desired;
        if (rec.key !== target.key) {
          await bounded(rec, () => rec.client.setActivity(target.activity), requestTimeoutMs);
          if (rec.retired || current !== rec) continue;
          rec.key = target.key; // only acknowledged writes count for dedupe
        }
        failures = 0;
        setStatus('connected');
      } catch {
        if (!rec || current === rec) {
          retire(rec);
          retry();
        }
      }
    }
  }
  function schedule() {
    dirty = true;
    if (!worker) {
      worker = Promise.resolve().then(drain).finally(() => {
        worker = null;
        if (dirty) schedule();
      });
    }
    return worker;
  }
  function update(immediate) {
    desired = readDesired();
    if (!desired.activity) {
      stopRetry(); failures = 0;
      retire(current);
      setStatus(desired.state);
    } else {
      if (current && current.id !== desired.id) { retire(current); failures = 0; }
      if (immediate) stopRetry();
    }
    return schedule();
  }
  /** Latest running list wins. Values are copied; caller mutations cannot leak. */
  function setGames(list) {
    if (stopped) return Promise.resolve();
    games = (Array.isArray(list) ? list : []).filter((g) => g && typeof g === 'object').map((g) => ({
      name: typeof g.name === 'string' ? g.name : '',
      mcVersion: typeof g.mcVersion === 'string' ? g.mcVersion : '',
      loader: typeof g.loader === 'string' ? g.loader : '',
      started: Number.isFinite(g.started) && g.started > 0 ? g.started : null,
    }));
    if (!games.length) fallbackStarted = null;
    else if (fallbackStarted === null) fallbackStarted = now();
    return update(false);
  }
  /** Re-read settings and retry now, retaining the latest running list. */
  function refresh() { return stopped ? Promise.resolve() : update(true); }
  function getStatus() {
    // Status is a snapshot, never an error dump or an implicit connection attempt.
    if (desired === null) setStatus(readDesired().state);
    return { ...status };
  }
  async function quit() {
    stopped = true;
    games = [];
    desired = { state: 'disabled' };
    stopRetry();
    retire(current);
    setStatus('disabled');
    if (worker) await worker;
    await Promise.all([...cleanups]);
  }
  return { setGames, refresh, getStatus, quit };
}

let singleton;
const instance = () => singleton || (singleton = createPresence());
module.exports = {
  createPresence,
  setGames: (games) => instance().setGames(games),
  refresh: () => instance().refresh(),
  getStatus: () => instance().getStatus(),
  quit: () => instance().quit(),
};
