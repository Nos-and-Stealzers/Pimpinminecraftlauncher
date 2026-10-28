// Exercise the actual instance metadata/presence seam without starting Java.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/main/instances.js'), 'utf8');
const start = source.indexOf("const presence = require('./presence');");
const end = source.indexOf('function pushLog(', start);
assert.ok(start >= 0 && end > start, 'presence integration seam is present');
const seam = source.slice(start, end);
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const running = new Map();
  const pending = [];
  const snapshots = [];
  const context = vm.createContext({
    running,
    get: id => new Promise(resolve => pending.push({ id, resolve })),
    require: name => { assert.equal(name, './presence'); return { setGames: games => { snapshots.push(JSON.parse(JSON.stringify(games))); return Promise.resolve(); } }; },
  });
  vm.runInContext(seam + '\nglobalThis.updatePresence = updatePresence;', context);
  return { running, pending, snapshots, update: () => context.updatePresence() };
}
test('latest instance revision wins when metadata completes in reverse order', async () => {
  const f = fixture();
  f.running.set('a', { started: 1000 }); f.update();
  f.running.set('b', { started: 2000 }); f.update();
  assert.deepEqual(f.pending.map(p => p.id), ['a', 'a', 'b']);
  f.pending[1].resolve({ name: 'A', mcVersion: '1.21.4', loader: 'fabric' });
  f.pending[2].resolve({ name: 'B', mcVersion: '26.3', loader: 'quilt' });
  await tick();
  assert.equal(f.snapshots.length, 1);
  assert.deepEqual(f.snapshots[0].map(g => g.name), ['A', 'B']);
  f.pending[0].resolve({ name: 'stale A', mcVersion: '1.21.4' });
  await tick();
  assert.equal(f.snapshots.length, 1, 'old metadata cannot replace the newest game list');
});
test('late metadata after stop cannot resurrect presence or read a removed process', async () => {
  const f = fixture();
  f.running.set('a', { started: 1000 }); f.update();
  f.running.clear(); f.update();
  await tick();
  assert.deepEqual(f.snapshots, [[]]);
  f.pending[0].resolve({ name: 'A', mcVersion: '1.21.4' });
  await tick();
  assert.deepEqual(f.snapshots, [[]]);
});
test('restarting the same instance discards the old process timestamp', async () => {
  const f = fixture();
  f.running.set('a', { started: 1000 }); f.update();
  f.running.set('a', { started: 9000 }); f.update();
  f.pending[1].resolve({ name: 'A', mcVersion: '1.21.4', loader: 'fabric' });
  await tick();
  f.pending[0].resolve({ name: 'old A', mcVersion: '1.21.4' });
  await tick();
  assert.equal(f.snapshots.length, 1);
  assert.equal(f.snapshots[0][0].started, 9000);
});
