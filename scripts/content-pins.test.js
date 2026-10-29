// Content pinning: pins persist on the metadata record, hide the item from
// update checks (both the live check and the launcher's scheduled scan share
// checkUpdates), and unpinning restores it. Untracked files refuse to pin.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('pinned mods are skipped by update checks until unpinned', async (t) => {
  const scratchRoot = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'cache', 'scratch');
  await fs.mkdir(scratchRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratchRoot, 'content-pins-'));
  process.env.PIMPIN_ROOT = root;
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  // Stub Modrinth and the net helpers before content.js requires either; never hit the network.
  const modrinthPath = require.resolve('../src/main/modrinth');
  const versionA = {
    id: 'aaa-new', version_number: '1.1', project_id: 'mod-a',
    files: [{ primary: true, filename: 'A2.jar', url: 'https://modrinth.test/a2.jar', hashes: { sha1: 'hash-a2' }, size: 4 }],
    dependencies: [],
  };
  const versionB = {
    id: 'bbb-new', version_number: '2.1', project_id: 'mod-b',
    files: [{ primary: true, filename: 'B2.jar', url: 'https://modrinth.test/b2.jar', hashes: { sha1: 'hash-b2' }, size: 4 }],
    dependencies: [],
  };
  require.cache[modrinthPath] = {
    id: modrinthPath,
    filename: modrinthPath,
    loaded: true,
    exports: {
      latestForHashes: async () => ({
        'hash-a': { id: 'aaa-new', version_number: '1.1' },
        'hash-b': { id: 'bbb-new', version_number: '2.1' },
      }),
      getVersions: async () => [],
      getVersion: async (id) => (id === 'aaa-new' ? versionA : versionB),
      getProject: async (pid) => ({ title: `Project ${pid}` }),
    },
  };
  const netPath = require.resolve('../src/main/net');
  require.cache[netPath] = {
    id: netPath,
    filename: netPath,
    loaded: true,
    exports: {
      download: async (url, dest) => { await fs.appendFile(dest, 'data'); },
      sha1File: async () => 'stub-sha1',
    },
  };

  const dir = path.join(root, 'instance');
  await fs.mkdir(path.join(dir, 'mods'), { recursive: true });
  await fs.writeFile(path.join(dir, 'mods', 'A.jar'), 'a');
  await fs.writeFile(path.join(dir, 'mods', 'B.jar'), 'b');
  await fs.writeFile(path.join(dir, 'mods', 'Local.jar'), 'local');
  await fs.writeFile(path.join(dir, 'mods', 'Old-CF.jar'), 'cf');

  let meta = { content: [
    { file: 'A.jar', type: 'mod', projectId: 'mod-a', versionId: 'aaa-old', versionNumber: '1.0', sha1: 'hash-a', title: 'Mod A' },
    { file: 'B.jar', type: 'mod', projectId: 'mod-b', versionId: 'bbb-old', versionNumber: '2.0', sha1: 'hash-b', title: 'Mod B' },
    { file: 'Local.jar', type: 'mod', title: 'Local jar' },
    // installed by an older version from the removed CurseForge source
    { file: 'Old-CF.jar', type: 'mod', provider: 'curseforge', projectId: 'cf:100', modId: 100, fileId: 1001, versionId: 'cf:1001', sha1: 'hash-cf', title: 'Old CF mod' },
  ] };
  const holder = {
    dir,
    kind: 'instance',
    mcVersion: '1.21.4',
    loader: 'fabric',
    load: async () => meta,
    save: async (next) => { meta = next; },
  };

  const content = require('../src/main/content');

  let rows = await content.list(holder);
  assert.equal(rows.find((r) => r.file === 'A.jar').pinned, false);
  // Legacy CurseForge records behave like local files: no project link, no pin, no update check.
  const legacy = rows.find((r) => r.file === 'Old-CF.jar');
  assert.equal(legacy.projectId, null);
  assert.equal(legacy.provider, null);
  assert.equal(legacy.title, 'Old CF mod');
  await assert.rejects(content.setPinned(holder, { type: 'mod', file: 'Old-CF.jar', pinned: true }), /installed from the library/);

  let updates = await content.checkUpdates(holder);
  assert.deepEqual(updates.map((u) => u.projectId).sort(), ['mod-a', 'mod-b']);

  assert.equal(await content.setPinned(holder, { type: 'mod', file: 'A.jar', pinned: true }), true);
  rows = await content.list(holder);
  assert.equal(rows.find((r) => r.file === 'A.jar').pinned, true);
  assert.equal(rows.find((r) => r.file === 'Local.jar').pinned, false);
  updates = await content.checkUpdates(holder);
  assert.deepEqual(updates.map((u) => u.projectId), ['mod-b']);

  await assert.rejects(
    content.setPinned(holder, { type: 'mod', file: 'Local.jar', pinned: true }),
    /installed from the library/,
  );

  assert.equal(await content.setPinned(holder, { type: 'mod', file: 'A.jar', pinned: false }), false);
  updates = await content.checkUpdates(holder);
  assert.deepEqual(updates.map((u) => u.projectId).sort(), ['mod-a', 'mod-b']);

  // A deliberate version switch keeps the pin: the user controls this mod.
  assert.equal(await content.setPinned(holder, { type: 'mod', file: 'B.jar', pinned: true }), true);
  const installed = await content.install(holder, { projectId: 'mod-b', type: 'mod', versionId: 'bbb-new' });
  assert.deepEqual(installed.installed, ['Project mod-b']);
  assert.deepEqual(installed.failed, []);
  rows = await content.list(holder);
  assert.equal(rows.find((r) => r.file === 'B2.jar').pinned, true);
  updates = await content.checkUpdates(holder);
  assert.deepEqual(updates.map((u) => u.projectId).sort(), ['mod-a']);
});

test('CurseForge modpack zips are refused with a pointer to .mrpack', async (t) => {
  const AdmZip = require('adm-zip');
  const scratchRoot = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'cache', 'scratch');
  const dir = await fs.mkdtemp(path.join(scratchRoot, 'cf-zip-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  process.env.PIMPIN_ROOT = process.env.PIMPIN_ROOT || dir;
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({ manifestType: 'minecraftModpack', minecraft: { version: '1.21.4', modLoaders: [] }, files: [] })));
  const file = path.join(dir, 'pack.zip');
  zip.writeZip(file);
  const importer = require('../src/main/importer');
  await assert.rejects(importer.importFile(file), /CurseForge modpacks are not supported.*\.mrpack/);
});
