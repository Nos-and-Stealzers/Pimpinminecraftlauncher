// No game is started and no instance files are written by these checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ownRoot = process.env.PIMPIN_ROOT ? null : fs.mkdtempSync(path.join(process.env.TMPDIR || require('node:os').tmpdir(), 'pimpin-lock-test-'));
if (ownRoot) process.env.PIMPIN_ROOT = ownRoot;
process.on('exit', () => { if (ownRoot) fs.rmSync(ownRoot, { recursive: true, force: true }); });
const instances = require('../src/main/instances');

(async () => {
  const id = 'pimpin-lock-test-nonexistent';
  let release;
  const pending = instances.withStopped(id, () => new Promise((resolve) => { release = resolve; }));
  assert.equal(instances.isBusy(id), true);
  await assert.rejects(instances.launch(id), /busy/);
  await assert.rejects(instances.remove(id), /Stop Minecraft/);
  await assert.rejects(instances.repair(id), /Stop Minecraft/);
  await assert.rejects(instances.withStopped(id, async () => {}), /Stop Minecraft/);
  release();
  await pending;
  assert.equal(instances.isBusy(id), false);
  await assert.rejects(instances.withStopped(id, async () => { throw new Error('test failure'); }), /test failure/);
  assert.equal(instances.isBusy(id), false);

  const first = instances.launch(id);
  assert.equal(instances.isBusy(id), true);
  await assert.rejects(instances.launch(id), /busy/);
  await assert.rejects(first, /Instance not found/);
  assert.equal(instances.isBusy(id), false);
  console.log('Instance locks: concurrent launch, repair, delete and failure cleanup passed.');
})().catch((err) => { console.error(err); process.exitCode = 1; });
