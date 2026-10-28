// CurseForge modpack zip import: manifest.json -> new instance, files fetched
// through the official API with hash checks, blocked mods reported, overrides
// copied with traversal protection, Forge packs refused. Offline (fake fetch).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const scratch = process.env.TMPDIR && /hermes[\\/]cache[\\/]scratch|runner|tmp|temp/i.test(process.env.TMPDIR)
  ? process.env.TMPDIR
  : path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'cache', 'scratch');
fss.mkdirSync(scratch, { recursive: true });
const root = fss.mkdtempSync(path.join(scratch, 'curseforge-pack-test-'));
process.env.PIMPIN_ROOT = root;
test.after(() => fs.rm(root, { recursive: true, force: true }));

const AdmZip = require('adm-zip');
const { mod, file, installFakeFetch } = require('./fixtures/curseforge-fake');
const store = require('../src/main/store');
const importer = require('../src/main/importer');
const instances = require('../src/main/instances');

function pack(name, manifest, extra = {}) {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
  for (const [k, v] of Object.entries(extra)) zip.addFile(k, Buffer.from(v));
  const p = path.join(root, name);
  zip.writeZip(p);
  return p;
}

test('CurseForge modpack zip imports as a Fabric instance with tracked files and blocked mods reported', async () => {
  assert.ok(path.resolve(store.dirs.root).startsWith(path.resolve(scratch)));
  await store.updateSettings({ curseforgeApiKey: 'pack-test-key' });
  const world = {
    mods: [mod(100, 'Sodium Extra'), mod(300, 'Blocked Lib', { allow: false }), mod(600, 'Faithful', { classId: 12 })],
    files: [file(1001, 100, 'sodium-extra.jar'), file(3001, 300, 'blocked.jar'), file(6001, 600, 'faithful.zip')],
  };
  const fake = installFakeFetch(world);
  try {
    const zipPath = pack('pack.zip', {
      manifestType: 'minecraftModpack', manifestVersion: 1, name: 'Fixture Pack', version: '1.2',
      minecraft: { version: '1.21.4', modLoaders: [{ id: 'fabric-0.16.10', primary: true }] },
      files: [{ projectID: 100, fileID: 1001, required: true }, { projectID: 300, fileID: 3001, required: true }, { projectID: 600, fileID: 6001, required: true }, { projectID: 999, fileID: 9999, required: false }],
      overrides: 'overrides',
    }, { 'overrides/config/sodium-extra.properties': 'a=1', 'overrides/../evil.txt': 'x' });
    const inst = await importer.importFile(zipPath, () => {});
    assert.equal(inst.name, 'Fixture Pack');
    assert.equal(inst.mcVersion, '1.21.4');
    assert.equal(inst.loader, 'fabric');
    assert.equal(inst.loaderVersion, '0.16.10');
    assert.deepEqual(inst.blocked.map((b) => b.title), ['Blocked Lib']);
    const dir = instances.dirOf(inst.id);
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), ['sodium-extra.jar']);
    assert.deepEqual(await fs.readdir(path.join(dir, 'resourcepacks')), ['faithful.zip']);
    assert.equal(await fs.readFile(path.join(dir, 'config', 'sodium-extra.properties'), 'utf8'), 'a=1');
    assert.equal(fss.existsSync(path.join(root, 'instances', 'evil.txt')), false);
    const meta = await instances.get(inst.id);
    const rec = meta.content.find((c) => c.file === 'sodium-extra.jar');
    assert.equal(rec.provider, 'curseforge');
    assert.equal(rec.projectId, 'cf:100');
    assert.equal(rec.fileId, 1001);
    assert.equal(meta.modpack.provider, 'curseforge');
    assert.equal(fake.calls.some((c) => c.url.includes('/files/3001/') && c.url.includes('forgecdn')), false);
  } finally {
    fake.restore();
  }
});

test('Forge CurseForge packs are refused before creating an instance', async () => {
  const before = (await instances.list()).length;
  const fake = installFakeFetch({ mods: [], files: [] });
  try {
    const zipPath = pack('forge.zip', { manifestType: 'minecraftModpack', name: 'Forge Pack', minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0', primary: true }] }, files: [] });
    await assert.rejects(importer.importFile(zipPath), /Forge and NeoForge/);
    assert.equal((await instances.list()).length, before);
    assert.equal(fake.calls.length, 0);
  } finally {
    fake.restore();
  }
});
