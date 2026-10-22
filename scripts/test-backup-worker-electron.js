// Exercises backup workers from an actual ASAR in Electron, not just Node source.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

if (!process.versions.electron) {
  (async () => {
    const root = await fsp.mkdtemp(path.join(process.env.TMPDIR || require('node:os').tmpdir(), 'pimpin-worker-asar-'));
    const source = path.join(root, 'source');
    await fsp.mkdir(source);
    for (const name of ['world-backups.js', 'world-backup-worker.js', 'world-backup-archive.js', 'store.js']) {
      await fsp.copyFile(path.join(__dirname, '../src/main', name), path.join(source, name));
    }
    await fsp.cp(path.dirname(require.resolve('adm-zip/package.json')), path.join(source, 'node_modules/adm-zip'), { recursive: true });
    const archive = path.join(root, 'app.asar');
    await require('@electron/asar').createPackage(source, archive);
    const env = { ...process.env, PIMPIN_ROOT: path.join(root, 'launcher-data') };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = require('node:child_process').spawnSync(require('electron'), [__filename, archive, root], { env, encoding: 'utf8', timeout: 120000 });
    process.stdout.write(child.stdout || '');
    process.stderr.write(child.stderr || '');
    assert.equal(child.status, 0, `Electron worker test failed; fixture kept at ${root}`);
    await fsp.rm(root, { recursive: true, force: true });
  })().catch((error) => { console.error(error); process.exitCode = 1; });
} else {
  const { app } = require('electron');
  app.whenReady().then(async () => {
    const archive = process.argv[2];
    const root = process.argv[3];
    const world = path.join(root, 'instance/saves/TestWorld');
    await fsp.mkdir(world, { recursive: true });
    await fsp.writeFile(path.join(world, 'level.dat'), 'synthetic isolated worker fixture');
    await fsp.writeFile(path.join(world, 'region.bin'), crypto.randomBytes(16 * 1024 * 1024));
    const backups = require(path.join(archive, 'world-backups.js')).createService({ instances: {
      get: async () => ({}),
      dirOf: () => path.join(root, 'instance'),
      withStopped: async (_id, task) => task(),
    } });
    let heartbeats = 0;
    let last = Date.now();
    let maximumGapMs = 0;
    const timer = setInterval(() => { const now = Date.now(); maximumGapMs = Math.max(maximumGapMs, now - last); last = now; heartbeats++; }, 10);
    try {
      const start = Date.now();
      const backup = await backups.create('test-instance', 'TestWorld');
      assert(backup.size > 0);
      assert(heartbeats >= 3, 'Main process heartbeat stalled during compression');
      await fsp.writeFile(path.join(world, 'level.dat'), 'changed synthetic fixture');
      const restored = await backups.restore('test-instance', 'TestWorld', backup.name);
      assert.equal(await fsp.readFile(path.join(world, 'level.dat'), 'utf8'), 'synthetic isolated worker fixture');
      assert(restored.safetyBackup.safety);
      console.log(JSON.stringify({ asarWorker: 'PASS', archiveBytes: backup.size, roundtripMs: Date.now() - start, mainProcessHeartbeats: heartbeats, maximumGapMs }));
    } finally { clearInterval(timer); }
    app.exit(0);
  }).catch((error) => { console.error(error); app.exit(1); });
}
