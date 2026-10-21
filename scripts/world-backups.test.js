const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const AdmZip = require('adm-zip');

async function fixture(t) {
  const scratchRoot = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'cache', 'scratch');
  await fs.mkdir(scratchRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratchRoot, 'world-backups-'));
  process.env.PIMPIN_ROOT = root;
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, 'instance');
  const world = path.join(dir, 'saves', 'My world');
  await fs.mkdir(path.join(world, 'region'), { recursive: true });
  await fs.writeFile(path.join(world, 'level.dat'), 'original level');
  await fs.writeFile(path.join(world, 'region', 'r.0.0.mca'), 'original chunks');
  let running = false;
  let preparing = false;
  let locked = false;
  const instances = {
    dirOf: () => dir,
    get: async () => ({ running }),
    isAnyRunning: () => running,
    isBusy: () => running || preparing || locked,
    withStopped: async (_id, task) => {
      if (running || preparing || locked) throw new Error('Stop Minecraft and wait for preparation to finish first.');
      locked = true;
      try { return await task(); } finally { locked = false; }
    },
    worlds: async () => [{ folder: 'My world' }],
  };
  const { createService } = require('../src/main/world-backups');
  const service = createService({ instances });
  return { root, dir, world, service, instances, run: (value) => { running = value; }, prepare: (value) => { preparing = value; } };
}

async function putArchive(f, zip, name = 'test.zip') {
  const folder = path.join(f.dir, 'pimpin-backups', 'My world');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, name), Buffer.isBuffer(zip) ? zip : zip.toBuffer());
  return name;
}

function rawNameZip(name) {
  const zip = new AdmZip();
  zip.addFile('level.dat', Buffer.from('restored'));
  const placeholder = 'x'.repeat(Buffer.byteLength(name));
  zip.addFile(placeholder, Buffer.from('bad'));
  const bytes = zip.toBuffer();
  let offset = 0;
  while ((offset = bytes.indexOf(placeholder, offset)) !== -1) {
    bytes.write(name, offset);
    offset += placeholder.length;
  }
  return bytes;
}

test('backs up a world outside saves with size and date', async (t) => {
  const f = await fixture(t);
  const backup = await f.service.create('test', 'My world');
  assert.ok(backup.size > 0);
  assert.ok(backup.created > 0);
  assert.equal(backup.safety, false);
  const archive = new AdmZip(path.join(f.dir, 'pimpin-backups', 'My world', backup.name));
  assert.equal(archive.readAsText('level.dat'), 'original level');
  assert.equal(archive.readAsText('region/r.0.0.mca'), 'original chunks');
});

test('restore roundtrip makes a safety snapshot of changed data before swapping', async (t) => {
  const f = await fixture(t);
  const backup = await f.service.create('test', 'My world');
  await fs.writeFile(path.join(f.world, 'level.dat'), 'changed level');
  await fs.writeFile(path.join(f.world, 'new-file'), 'preserve me');
  const result = await f.service.restore('test', 'My world', backup.name);
  assert.equal(await fs.readFile(path.join(f.world, 'level.dat'), 'utf8'), 'original level');
  await assert.rejects(fs.stat(path.join(f.world, 'new-file')), { code: 'ENOENT' });
  assert.equal(result.safetyBackup.safety, true);
  const safety = new AdmZip(path.join(f.dir, 'pimpin-backups', 'My world', result.safetyBackup.name));
  assert.equal(safety.readAsText('level.dat'), 'changed level');
  assert.equal(safety.readAsText('new-file'), 'preserve me');
  assert.equal(await fs.readFile(path.join(result.recoveryPath, 'new-file'), 'utf8'), 'preserve me');
});

for (const name of ['../escape', '/absolute', 'C:/drive', 'a\\..\\escape', 'folder/../escape', 'NUL.txt', 'a:stream', 'trailing.']) {
  test(`rejects unsafe zip path ${name} without changing saves`, async (t) => {
    const f = await fixture(t);
    await putArchive(f, rawNameZip(name));
    await assert.rejects(f.service.restore('test', 'My world', 'test.zip'));
    assert.equal(await fs.readFile(path.join(f.world, 'level.dat'), 'utf8'), 'original level');
  });
}

test('rejects missing level.dat and corrupt data without changing saves', async (t) => {
  const f = await fixture(t);
  const missing = new AdmZip();
  missing.addFile('region/r.0.0.mca', Buffer.from('chunks'));
  await putArchive(f, missing);
  await assert.rejects(f.service.restore('test', 'My world', 'test.zip'), /level.dat/);
  const corrupt = new AdmZip();
  corrupt.addFile('level.dat', Buffer.from('restored'));
  const bytes = corrupt.toBuffer();
  const offset = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28);
  bytes[offset] ^= 0xff;
  await putArchive(f, bytes);
  await assert.rejects(f.service.restore('test', 'My world', 'test.zip'));
  await putArchive(f, Buffer.from('not a zip'));
  await assert.rejects(f.service.restore('test', 'My world', 'test.zip'));
  assert.equal(await fs.readFile(path.join(f.world, 'level.dat'), 'utf8'), 'original level');
});

test('rejects symlink entries, case collisions and zip bombs', async (t) => {
  const f = await fixture(t);
  const zip = new AdmZip();
  zip.addFile('level.dat', Buffer.from('restored'));
  zip.addFile('link', Buffer.from('target'));
  zip.getEntry('link').attr = (0o120777 << 16) >>> 0;
  await putArchive(f, zip);
  await assert.rejects(f.service.restore('test', 'My world', 'test.zip'), /link|file type/);
  zip.deleteFile('link');
  zip.addFile('LEVEL.DAT', Buffer.from('collision'));
  await putArchive(f, zip);
  await assert.rejects(f.service.restore('test', 'My world', 'test.zip'), /duplicate/);
  zip.deleteFile('LEVEL.DAT');
  zip.addFile('bomb', Buffer.alloc(2 * 1024 * 1024));
  await putArchive(f, zip);
  const { createService, LIMITS } = require('../src/main/world-backups');
  const restricted = createService({ instances: f.instances, limits: { ...LIMITS, ratio: 10 } });
  await assert.rejects(restricted.restore('test', 'My world', 'test.zip'), /limits/);
  const declaredBomb = zip.toBuffer();
  for (let offset = 0; offset < declaredBomb.length - 46; offset++) {
    if (declaredBomb.readUInt32LE(offset) === 0x02014b50 && declaredBomb.subarray(offset + 46, offset + 50).toString() === 'bomb') {
      declaredBomb.writeUInt32LE(LIMITS.file + 1, offset + 24);
      break;
    }
  }
  await putArchive(f, declaredBomb);
  await assert.rejects(f.service.restore('test', 'My world', 'test.zip'), /limits/);
  assert.equal(await fs.readFile(path.join(f.world, 'level.dat'), 'utf8'), 'original level');
});

test('highly compressible valid world data can be restored', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.world, 'region', 'zero.mca'), Buffer.alloc(2 * 1024 * 1024));
  const backup = await f.service.create('test', 'My world');
  await f.service.restore('test', 'My world', backup.name);
  assert.equal((await fs.stat(path.join(f.world, 'region', 'zero.mca'))).size, 2 * 1024 * 1024);
});

test('blocks create and restore while running', async (t) => {
  const f = await fixture(t);
  const backup = await f.service.create('test', 'My world');
  f.run(true);
  await assert.rejects(f.service.create('test', 'My world'), /Stop Minecraft/);
  await assert.rejects(f.service.restore('test', 'My world', backup.name), /Stop Minecraft/);
});

test('exports exact zip and deletes only the selected backup', async (t) => {
  const f = await fixture(t);
  const backup = await f.service.create('test', 'My world');
  assert.equal((await f.service.list('test', 'My world')).length, 1);
  const destination = path.join(f.root, 'export.zip');
  await f.service.exportBackup('test', 'My world', backup.name, destination);
  const source = path.join(f.dir, 'pimpin-backups', 'My world', backup.name);
  assert.deepEqual(await fs.readFile(destination), await fs.readFile(source));
  await f.service.deleteBackup('test', 'My world', backup.name);
  assert.deepEqual(await f.service.list('test', 'My world'), []);
  assert.equal(await fs.readFile(path.join(f.world, 'level.dat'), 'utf8'), 'original level');
  await assert.rejects(f.service.deleteBackup('test', 'My world', '../bad.zip'));
});

test('preparing guard covers create, restore and delete; lock acquired before first await', async (t) => {
  const f = await fixture(t);
  const backup = await f.service.create('test', 'My world');
  f.prepare(true);
  await assert.rejects(f.service.create('test', 'My world'), /Stop Minecraft/);
  await assert.rejects(f.service.restore('test', 'My world', backup.name), /Stop Minecraft/);
  await assert.rejects(f.service.deleteBackup('test', 'My world', backup.name), /Stop Minecraft/);
  f.prepare(false);
  const work = f.service.create('test', 'My world');
  assert.equal(f.instances.isBusy('test'), true);
  await assert.rejects(f.service.create('test', 'My world'), /progress/);
  await work;
  assert.equal(f.instances.isBusy('test'), false);
});

test('failed replacement rename rolls the original folder back', async (t) => {
  const f = await fixture(t);
  const backup = await f.service.create('test', 'My world');
  await fs.writeFile(path.join(f.world, 'level.dat'), 'changed level');
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (path.basename(from).startsWith('.restore-') && to === f.world) throw new Error('simulated rename failure');
    return rename(from, to);
  };
  try { await assert.rejects(f.service.restore('test', 'My world', backup.name), /simulated rename failure/); }
  finally { fs.rename = rename; }
  assert.equal(await fs.readFile(path.join(f.world, 'level.dat'), 'utf8'), 'changed level');
  assert.ok((await f.service.list('test', 'My world')).some((b) => b.safety));
  assert.equal(f.instances.isBusy('test'), false);
});

test('if rollback is blocked, original data remains recoverable outside saves', async (t) => {
  const f = await fixture(t);
  const backup = await f.service.create('test', 'My world');
  await fs.writeFile(path.join(f.world, 'level.dat'), 'changed level');
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (to === f.world) throw new Error('simulated blocked save directory');
    return rename(from, to);
  };
  try { await assert.rejects(f.service.restore('test', 'My world', backup.name), /Original save.*previous-/); }
  finally { fs.rename = rename; }
  const folder = path.join(f.dir, 'pimpin-backups', 'My world');
  const retained = (await fs.readdir(folder)).find((name) => name.startsWith('.previous-'));
  assert.ok(retained);
  assert.equal(await fs.readFile(path.join(folder, retained, 'level.dat'), 'utf8'), 'changed level');
  const safety = (await fs.readdir(folder)).find((name) => name.startsWith('safety-'));
  assert.ok(safety);
  assert.equal(new AdmZip(path.join(folder, safety)).readAsText('level.dat'), 'changed level');
  assert.equal(f.instances.isBusy('test'), false);
});

test('rejects junctions rather than reading another directory', async (t) => {
  const f = await fixture(t);
  const external = path.join(f.root, 'external');
  await fs.mkdir(external);
  await fs.writeFile(path.join(external, 'private'), 'not world data');
  await fs.symlink(external, path.join(f.world, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.service.create('test', 'My world'), /links|junctions/);
  assert.equal(await fs.readFile(path.join(external, 'private'), 'utf8'), 'not world data');
});

test('export cannot overwrite a file or write into the instance', async (t) => {
  const f = await fixture(t);
  const backup = await f.service.create('test', 'My world');
  await assert.rejects(f.service.exportBackup('test', 'My world', backup.name, path.join(f.world, 'level.dat')), /outside/);
  const destination = path.join(f.root, 'existing.zip');
  await fs.writeFile(destination, 'keep');
  await assert.rejects(f.service.exportBackup('test', 'My world', backup.name, destination), { code: 'EEXIST' });
  assert.equal(await fs.readFile(destination, 'utf8'), 'keep');
});
