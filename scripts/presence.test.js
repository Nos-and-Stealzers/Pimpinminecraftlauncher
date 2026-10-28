'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPresence } = require('../src/main/presence');
const ID = '123456789012345678';
const game = (name = 'Survival', started = 1700000000000) => ({ name, started, mcVersion: '1.21.4', loader: 'fabric' });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
class FakeClient extends EventEmitter {
  constructor() { super(); this.activities = []; this.logins = []; this.clears = 0; this.destroys = 0; }
  login(args) { this.logins.push(args); return this.loginResult || Promise.resolve(); }
  setActivity(activity) { this.activities.push(activity); return this.activityResult || Promise.resolve(); }
  clearActivity() { this.clears++; return Promise.resolve(); }
  destroy() { this.destroys++; return Promise.resolve(); }
}
function fixture(clients = []) {
  let clock = 1700000010000;
  const settings = { discordRich: true, discordAppId: ID };
  const timers = new Set();
  const made = [];
  const presence = createPresence({
    getSettings: () => settings,
    createClient: () => { const c = clients.shift() || new FakeClient(); made.push(c); return c; },
    now: () => clock,
    setTimeout: (fn, delay) => { const t = { fn, delay, unrefed: false, unref() { this.unrefed = true; } }; timers.add(t); return t; },
    clearTimeout: (t) => timers.delete(t),
    connectTimeoutMs: 100, requestTimeoutMs: 50, retryBaseMs: 10, retryMaxMs: 40,
  });
  return { presence, settings, timers, made, advance() { clock += 1000; }, async fire(delay) {
    const t = [...timers].find((t) => t.delay === delay);
    assert.ok(t, `Expected timer ${delay}; got ${[...timers].map((x) => x.delay)}`);
    timers.delete(t); t.fn(); await tick();
  } };
}

test('factory sends activity, stable fallback elapsed and timestamp-aware dedupe without store import', async () => {
  assert.equal(typeof createPresence, 'function');
  const f = fixture();
  await f.presence.setGames([game()]);
  assert.equal(f.made.length, 1);
  assert.deepEqual(f.made[0].logins, [{ clientId: ID }]);
  assert.deepEqual(f.made[0].activities[0], { details: 'Playing Survival', state: '1.21.4 · fabric', startTimestamp: 1700000000, instance: false });
  await f.presence.setGames([game()]);
  assert.equal(f.made[0].activities.length, 1);
  await f.presence.setGames([game('Survival', 1700000005000)]);
  assert.equal(f.made[0].activities.length, 2);
  await f.presence.setGames([game('No timestamp', undefined)]);
  // An explicitly absent start time must remain stable across refreshes.
  const noStart = { name: 'No timestamp', mcVersion: '1.21.4' };
  await f.presence.setGames([noStart]);
  const count = f.made[0].activities.length;
  f.advance(); await f.presence.refresh();
  assert.equal(f.made[0].activities.length, count);
  assert.equal(require.cache[require.resolve('../src/main/store')], undefined);
  await f.presence.quit();
  assert.equal(f.timers.size, 0);
});

test('serializes pending writes and coalesces intermediate lists during login', async () => {
  const gate = deferred(); const c = new FakeClient(); c.loginResult = gate.promise;
  const f = fixture([c]);
  const first = f.presence.setGames([game('Old')]); await tick();
  f.presence.setGames([game('Intermediate')]);
  const last = f.presence.setGames([game('Newest')]);
  assert.equal(c.logins.length, 1); assert.equal(c.activities.length, 0);
  gate.resolve(); await Promise.all([first, last]);
  assert.equal(c.activities.length, 1); assert.equal(c.activities[0].details, 'Playing Newest');
  const writing = deferred(); c.activityResult = writing.promise;
  const a = f.presence.setGames([game('Writing')]); await tick();
  f.presence.setGames([game('Skipped')]);
  const b = f.presence.setGames([game('Final')]); await tick();
  assert.equal(c.activities.length, 2);
  c.activityResult = null; writing.resolve(); await Promise.all([a, b]);
  assert.equal(c.activities.length, 3); assert.equal(c.activities[2].details, 'Playing Final');
  await f.presence.quit();
});

test('disabled during login cancels immediately; late login and errors cannot resurrect activity', async () => {
  const gate = deferred(); const c = new FakeClient(); c.loginResult = gate.promise;
  const f = fixture([c]);
  const pending = f.presence.setGames([game()]); await tick();
  f.settings.discordRich = false; await f.presence.refresh(); await pending;
  assert.equal(c.destroys, 1); assert.equal(f.presence.getStatus().state, 'disabled');
  gate.resolve(); c.emit('error', new Error('sensitive-secret')); c.emit('disconnected'); await tick();
  assert.equal(c.activities.length, 0); assert.equal(f.timers.size, 0);
  await f.presence.quit();
});

test('app ID changes cancel old login, and stale disconnect cannot retire a replacement', async () => {
  const gate = deferred(); const c = new FakeClient(); c.loginResult = gate.promise;
  const f = fixture([c]);
  f.presence.setGames([game()]); await tick();
  f.settings.discordAppId = '987654321098765432'; await f.presence.refresh();
  assert.equal(f.made.length, 2); const replacement = f.made[1];
  assert.deepEqual(replacement.logins, [{ clientId: f.settings.discordAppId }]);
  c.emit('disconnected'); gate.resolve(); await tick();
  assert.equal(replacement.destroys, 0); assert.equal(f.presence.getStatus().state, 'connected');
  await f.presence.quit();
});

test('login failures retry with capped exponential backoff and unref timers; Discord restart recovers', async () => {
  const fail = () => { const c = new FakeClient(); c.login = () => Promise.reject(new Error('private host path')); return c; };
  const f = fixture([fail(), fail(), fail(), fail(), new FakeClient()]);
  await f.presence.setGames([game()]);
  assert.equal(f.presence.getStatus().state, 'retrying');
  assert.ok([...f.timers].every((t) => t.unrefed));
  for (const delay of [10, 20, 40, 40]) await f.fire(delay);
  assert.equal(f.made.length, 5); assert.equal(f.presence.getStatus().state, 'connected');
  f.made[4].emit('disconnected'); await f.fire(10);
  assert.equal(f.made.length, 6); assert.equal(f.made[5].activities.length, 1);
  assert.equal(f.made[5].activities[0].startTimestamp, 1700000000);
  await f.presence.quit(); assert.equal(f.timers.size, 0);
});

test('hung login and activity requests are bounded and rejected writes are retried not deduped', async () => {
  const c = new FakeClient(); c.loginResult = deferred().promise;
  const f = fixture([c]); const pending = f.presence.setGames([game()]); await tick();
  await f.fire(100); await pending;
  assert.equal(c.destroys, 1); await f.fire(10);
  const next = f.made[1]; next.activityResult = deferred().promise;
  const writing = f.presence.setGames([game('Changed')]); await tick(); await f.fire(50); await writing;
  assert.equal(next.destroys, 1); await f.fire(10);
  assert.equal(f.made[2].activities[0].details, 'Playing Changed');
  const bad = f.made[2]; bad.setActivity = () => Promise.reject(new Error('bad request'));
  await f.presence.setGames([game('Retry exactly this')]); await f.fire(10);
  assert.equal(f.made[3].activities[0].details, 'Playing Retry exactly this');
  await f.presence.quit();
});

test('privacy refresh retains list, omits fields, bounds unicode, and never mutates caller data', async () => {
  const f = fixture(); const list = [game('Older', 1700000000000), game('秘密😀'.repeat(100), 1700000001000)];
  await f.presence.setGames(list); const c = f.made[0];
  assert.ok(Buffer.byteLength(c.activities[0].details) <= 128);
  assert.equal(c.activities[0].details.includes('\ufffd'), false);
  assert.match(c.activities[0].state, /1 more game/);
  list[1].name = 'mutated';
  f.settings.discordShowInstance = false; f.settings.discordShowVersion = false; f.settings.discordShowElapsed = false;
  await f.presence.refresh();
  assert.deepEqual(c.activities.at(-1), { details: 'Playing Minecraft', instance: false, state: '1 more game' });
  await f.presence.setGames([game()]);
  assert.deepEqual(c.activities.at(-1), { details: 'Playing Minecraft', instance: false });
  f.settings.discordShowInstance = true; f.settings.discordShowVersion = true; f.settings.discordShowElapsed = true;
  await f.presence.refresh(); assert.equal(c.activities.at(-1).startTimestamp, 1700000000);
  await f.presence.setGames([{ name: '\n\0', started: NaN, mcVersion: null, loader: {} }]);
  assert.equal(c.activities.at(-1).details, 'Playing Minecraft');
  assert.equal(c.activities.at(-1).state, 'Minecraft · vanilla');
  await f.presence.quit();
});

test('idle, invalid ID, disabled, and settings failures fail closed without connections', async () => {
  const f = fixture(); await f.presence.refresh(); assert.equal(f.presence.getStatus().state, 'idle');
  for (const value of [null, '', '123', ' 123456789012345678', '123456789012345678\n', 'x'.repeat(18)]) {
    f.settings.discordAppId = value;
    await f.presence.setGames([game()]); assert.equal(f.presence.getStatus().state, 'unconfigured');
  }
  assert.equal(f.made.length, 0);
  f.settings.discordRich = false; await f.presence.refresh(); assert.equal(f.presence.getStatus().state, 'disabled');
  await f.presence.quit();
  const broken = createPresence({ getSettings() { throw new Error('secret path'); }, createClient() { assert.fail('must not connect'); } });
  await broken.setGames([game()]); assert.equal(broken.getStatus().state, 'unconfigured');
  assert.doesNotMatch(JSON.stringify(broken.getStatus()), /secret/); await broken.quit();
});

test('empty lists cancel retries and clear connected presence; refresh re-enables retained games', async () => {
  const f = fixture(); await f.presence.setGames([game()]); const c = f.made[0];
  f.settings.discordRich = false; await f.presence.refresh();
  assert.equal(c.clears, 1); assert.equal(c.destroys, 1);
  f.settings.discordRich = true; await f.presence.refresh(); assert.equal(f.made.length, 2);
  f.made[1].emit('disconnected'); assert.equal(f.presence.getStatus().state, 'retrying');
  await f.presence.setGames([]); assert.equal(f.presence.getStatus().state, 'idle'); assert.equal(f.timers.size, 0);
  await f.presence.quit();
});

test('default IPC client never registers a native scheme and singleton imports no store', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const { EventEmitter } = require('node:events');
    const load = Module._load;
    let made = 0;
    class Client extends EventEmitter {
      constructor(options) { super(); assert.deepEqual(options, { transport: 'ipc' }); made++; }
      login(options) { assert.deepEqual(options, { clientId: '${ID}' }); return Promise.resolve(); }
      setActivity() { return Promise.resolve(); }
      clearActivity() { return Promise.resolve(); }
      destroy() { return Promise.resolve(); }
    }
    Module._load = function(request, ...args) {
      if (request === './store') throw new Error('Must not load real settings');
      if (request === 'discord-rpc') return { Client, register() { assert.fail('Native scheme registration'); } };
      return load.call(this, request, ...args);
    };
    const backend = require(${JSON.stringify(require.resolve('../src/main/presence'))});
    for (const name of ['setGames', 'refresh', 'getStatus', 'quit', 'createPresence']) assert.equal(typeof backend[name], 'function');
    const service = backend.createPresence({ getSettings: () => ({ discordAppId: '${ID}' }) });
    (async () => { await service.setGames([{ name: 'Test', started: 1700000000000 }]); assert.equal(made, 1); await service.quit(); })().catch((e) => { console.error(e); process.exitCode = 1; });
  `], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('synchronous failures and active error events recover without uncaught errors', async () => {
  const badLogin = new FakeClient(); badLogin.login = () => { throw new Error('sync login'); };
  const f = fixture([badLogin]); await f.presence.setGames([game()]); await f.fire(10);
  const connected = f.made[1]; connected.emit('error', new Error('socket error'));
  assert.equal(connected.destroys, 1); await f.fire(10);
  const badWrite = f.made[2]; badWrite.setActivity = () => { throw new Error('sync write'); };
  badWrite.clearActivity = () => { throw new Error('sync clear'); };
  badWrite.destroy = () => { throw new Error('sync destroy'); };
  await f.presence.setGames([game('After error')]); await f.fire(10);
  assert.equal(f.made[3].activities[0].details, 'Playing After error');
  await f.presence.quit(); assert.equal(f.timers.size, 0);
});

test('default unrefed login deadline does not keep a child process alive', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, ['-e', `
    const { EventEmitter } = require('node:events');
    const { createPresence } = require(${JSON.stringify(require.resolve('../src/main/presence'))});
    class Client extends EventEmitter { login() { return new Promise(() => {}); } }
    createPresence({ getSettings: () => ({ discordAppId: '${ID}' }), createClient: () => new Client() }).setGames([{ name: 'Test' }]);
  `], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
});

test('initial status classifies configuration without requiring refresh', () => {
  assert.equal(createPresence({ getSettings: () => ({ discordRich: false }) }).getStatus().state, 'disabled');
  assert.equal(createPresence({ getSettings: () => ({}) }).getStatus().state, 'unconfigured');
});

test('bounded retries observe settings changes even without another launch event', async () => {
  const c = new FakeClient(); c.login = () => Promise.reject(new Error('offline'));
  const f = fixture([c]); await f.presence.setGames([game()]);
  f.settings.discordRich = false; await f.fire(10);
  assert.equal(f.presence.getStatus().state, 'disabled'); assert.equal(f.made.length, 1);
  assert.equal(f.timers.size, 0); await f.presence.quit();
});

test('quit during an activity write cancels work and no late rejection causes retry', async () => {
  const f = fixture(); await f.presence.setGames([game()]); const c = f.made[0];
  const gate = deferred(); c.activityResult = gate.promise;
  const pending = f.presence.setGames([game('Pending')]); await tick();
  await f.presence.quit(); await pending;
  gate.reject(new Error('late')); await tick();
  assert.equal(c.destroys, 1); assert.equal(f.timers.size, 0);
  assert.equal(f.presence.getStatus().state, 'disabled');
});

test('quit is terminal, immediate socket cleanup, bounded destroy, and safe late transport open', async () => {
  const c = new FakeClient(); const gate = deferred(); c.loginResult = gate.promise;
  c.transport = new EventEmitter(); let socketsDestroyed = 0;
  c.transport.socket = { destroy() { socketsDestroyed++; } };
  c.destroy = () => deferred().promise;
  const f = fixture([c]); f.presence.setGames([game()]); await tick();
  const quit = f.presence.quit(); assert.equal(socketsDestroyed, 1); await tick();
  await f.fire(50); await quit; assert.equal(f.timers.size, 0);
  c.transport.emit('open'); gate.resolve(); c.emit('disconnected'); await tick();
  assert.ok(socketsDestroyed >= 2); assert.equal(c.activities.length, 0);
  await f.presence.setGames([game()]); await f.presence.refresh(); await f.presence.quit();
  assert.equal(f.made.length, 1); assert.equal(f.timers.size, 0);
  const copy = f.presence.getStatus(); copy.message = 'tampered';
  assert.deepEqual(Object.keys(f.presence.getStatus()).sort(), ['message', 'state']);
  assert.notEqual(f.presence.getStatus().message, 'tampered');
});
