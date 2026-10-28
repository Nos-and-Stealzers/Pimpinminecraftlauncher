// CurseForge provider: key handling, search mapping, version selection,
// dependency resolution, distribution-blocked mods and hash verification.
// Fully offline: a fake fetch stands in for api.curseforge.com and its CDN.
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
const root = fss.mkdtempSync(path.join(scratch, 'curseforge-test-'));
process.env.PIMPIN_ROOT = root;

const { mod, file, installFakeFetch, CDN } = require('./fixtures/curseforge-fake');
const store = require('../src/main/store');
const curseforge = require('../src/main/curseforge');
const content = require('../src/main/content');

assert.ok(path.resolve(store.dirs.root).startsWith(path.resolve(scratch)), 'tests must run in scratch, never the real launcher folder');
assert.equal(fss.existsSync(curseforge.KEY_FILE), false, 'a build key file in the checkout would hide the missing-key state');

test.after(() => fs.rm(root, { recursive: true, force: true }));

function makeHolder(name, { loader = 'fabric', mcVersion = '1.21.4' } = {}) {
  const dir = path.join(root, 'instances', name);
  fss.mkdirSync(path.join(dir, 'mods'), { recursive: true });
  let meta = { content: [] };
  return {
    holder: { kind: 'instance', dir, mcVersion, loader, load: async () => JSON.parse(JSON.stringify(meta)), save: async (m) => { meta = JSON.parse(JSON.stringify(m)); } },
    meta: () => meta,
    dir,
  };
}

function captureEvents() {
  const events = [];
  content.setEmitter((channel, payload) => events.push({ channel, payload }));
  return events;
}

const KEY = 'test-key-$2a$10$abcdefghijklmnopqrstuv';

test('missing key: status says so, calls fail with a clear message and nothing hits the network', async () => {
  const fake = installFakeFetch({ mods: [], files: [] });
  try {
    await store.updateSettings({ curseforgeApiKey: null });
    const st = curseforge.status();
    assert.equal(st.configured, false);
    assert.equal(st.source, null);
    assert.match(st.applyUrl, /^https:\/\//);
    assert.equal('key' in st, false);
    await assert.rejects(curseforge.search({ type: 'mod', query: 'sodium' }), (err) => err.code === 'CURSEFORGE_NO_KEY' && /needs an API key/.test(err.message));
    const { holder } = makeHolder('nokey');
    await assert.rejects(content.install(holder, { projectId: 'cf:100', type: 'mod' }), /needs an API key/);
    assert.equal(fake.calls.length, 0);
  } finally {
    fake.restore();
  }
});

test('settings key is validated and trimmed', async () => {
  await assert.rejects(store.updateSettings({ curseforgeApiKey: 'has a space' }), /CurseForge API key/);
  await assert.rejects(store.updateSettings({ curseforgeApiKey: 42 }), /CurseForge API key/);
  assert.equal((await store.updateSettings({ curseforgeApiKey: '   ' })).curseforgeApiKey, null);
  assert.equal((await store.updateSettings({ curseforgeApiKey: `  ${KEY}  ` })).curseforgeApiKey, KEY);
  assert.deepEqual(curseforge.status(), { configured: true, source: 'settings', applyUrl: curseforge.APPLY_URL });
});

test('search maps CurseForge results to the library shape with the right class and loader filters', async () => {
  await store.updateSettings({ curseforgeApiKey: KEY });
  const world = {
    mods: [mod(100, 'Sodium Extra'), mod(101, 'Blocked Mod', { allow: false }), mod(500, 'Fancy Shaders', { classId: 6552 }), mod(600, 'Faithful', { classId: 12 }), mod(700, 'Pack', { classId: 4471 })],
    files: [],
  };
  const fake = installFakeFetch(world);
  try {
    const res = await curseforge.search({ type: 'mod', query: 'sodium', sort: 'downloads', offset: 24, limit: 24, mcVersion: '1.21.4', loader: 'fabric' });
    const url = new URL(fake.calls[0].url);
    assert.equal(url.pathname, '/v1/mods/search');
    assert.equal(url.searchParams.get('gameId'), '432');
    assert.equal(url.searchParams.get('classId'), '6');
    assert.equal(url.searchParams.get('searchFilter'), 'sodium');
    assert.equal(url.searchParams.get('sortField'), '6');
    assert.equal(url.searchParams.get('sortOrder'), 'desc');
    assert.equal(url.searchParams.get('gameVersion'), '1.21.4');
    assert.equal(url.searchParams.get('modLoaderType'), '4');
    assert.equal(url.searchParams.get('index'), '24');
    assert.equal(url.searchParams.get('pageSize'), '24');
    assert.equal(fake.calls[0].headers['x-api-key'], KEY);
    assert.equal(res.total_hits, 10000, 'the API cannot page past 10,000');
    assert.deepEqual(res.hits.map((h) => h.project_id), ['cf:100', 'cf:101']);
    const h = res.hits[0];
    assert.equal(h.provider, 'curseforge');
    assert.equal(h.title, 'Sodium Extra');
    assert.equal(h.author, 'Author');
    assert.equal(h.description, 'Sodium Extra summary');
    assert.equal(h.downloads, 1000);
    assert.equal(h.icon_url, 'https://media.forgecdn.test/100.png');
    assert.equal(h.allowModDistribution, true);
    assert.equal(res.hits[1].allowModDistribution, false);

    for (const [type, classId] of [['shader', '6552'], ['resourcepack', '12'], ['modpack', '4471']]) {
      await curseforge.search({ type });
      assert.equal(new URL(fake.calls.at(-1).url).searchParams.get('classId'), classId, type);
    }
    await assert.rejects(curseforge.search({ type: 'plugin' }), /Modrinth/);

    const p = await curseforge.getProject('cf:100');
    assert.equal(p.id, 'cf:100');
    assert.equal(p.project_type, 'mod');
    assert.equal(p.body.includes('<'), false, 'HTML description is reduced to text');
    assert.equal(p.body.includes('alert'), false, 'scripts are dropped');
    assert.match(p.body, /Hello world/);
    // the key is only ever a header: never in URLs
    assert.equal(fake.calls.some((c) => c.url.includes(KEY)), false);
  } finally {
    fake.restore();
  }
});

test('version selection: game version + loader, releases first, newest first, sha1 from algo 1', async () => {
  await store.updateSettings({ curseforgeApiKey: KEY });
  const world = {
    mods: [mod(100, 'Sodium Extra')],
    files: [
      file(1, 100, 'se-forge.jar', { versions: ['1.21.4', 'Forge'], date: '2026-05-01T00:00:00Z' }),
      file(2, 100, 'se-beta.jar', { release: 2, date: '2026-04-01T00:00:00Z' }),
      file(3, 100, 'se-old.jar', { date: '2026-01-01T00:00:00Z' }),
      file(4, 100, 'se-new.jar', { date: '2026-03-01T00:00:00Z' }),
      file(5, 100, 'se-1201.jar', { versions: ['1.20.1', 'Fabric'], date: '2026-06-01T00:00:00Z' }),
      file(6, 100, 'se-gone.jar', { available: false, date: '2026-07-01T00:00:00Z' }),
      file(7, 100, 'se-quilt.jar', { versions: ['1.21.4', 'Quilt'], date: '2026-08-01T00:00:00Z' }),
    ],
  };
  const fake = installFakeFetch(world);
  try {
    const v = await curseforge.pickVersion('cf:100', { loaders: ['fabric'], gameVersions: ['1.21.4'] });
    assert.equal(v.id, 'cf:4');
    assert.equal(v.files[0].filename, 'se-new.jar');
    assert.equal(v.files[0].hashes.sha1.length, 40);
    assert.notEqual(v.files[0].hashes.sha1, 'd41d8cd98f00b204e9800998ecf8427e');
    assert.equal(v.game_versions.join(), '1.21.4');
    assert.deepEqual(v.loaders, ['fabric']);
    const all = await curseforge.getVersions('cf:100', { loaders: ['fabric'], gameVersions: ['1.21.4'] });
    assert.deepEqual(all.map((x) => x.id), ['cf:4', 'cf:3', 'cf:2'], 'releases newest first, then betas; forge/other versions/unavailable dropped');
    const q = await curseforge.pickVersion('cf:100', { loaders: ['quilt', 'fabric'], gameVersions: ['1.21.4'] });
    assert.equal(q.id, 'cf:7', 'a Quilt instance takes Quilt and Fabric files');
    assert.equal(await curseforge.pickVersion('cf:100', { loaders: ['fabric'], gameVersions: ['1.19.2'] }), null);
  } finally {
    fake.restore();
  }
});

test('install resolves required dependencies only, follows cycles once and records provider ids', async () => {
  await store.updateSettings({ curseforgeApiKey: KEY });
  const world = {
    mods: [mod(100, 'Sodium Extra'), mod(200, "Reese's Sodium Options"), mod(250, 'Fabric API'), mod(300, 'Optional Thing'), mod(400, 'Embedded Lib'), mod(450, 'Incompatible Mod')],
    files: [
      file(1001, 100, 'sodium-extra.jar', { deps: [[200, 3], [300, 2], [400, 1], [450, 5]] }),
      file(2001, 200, 'reeses.jar', { deps: [[100, 3], [250, 3]] }),
      file(2501, 250, 'fabric-api.jar'),
      file(3001, 300, 'optional.jar'),
      file(4001, 400, 'embedded.jar'),
      file(4501, 450, 'incompatible.jar'),
    ],
  };
  const fake = installFakeFetch(world);
  const events = captureEvents();
  try {
    const { holder, meta, dir } = makeHolder('deps');
    const res = await content.install(holder, { projectId: 'cf:100', type: 'mod', provider: 'curseforge' });
    assert.deepEqual(res.installed, ['Sodium Extra', "Reese's Sodium Options", 'Fabric API']);
    assert.deepEqual(res.failed, []);
    assert.equal(res.cancelled, false);
    const files = (await fs.readdir(path.join(dir, 'mods'))).sort();
    assert.deepEqual(files, ['fabric-api.jar', 'reeses.jar', 'sodium-extra.jar']);
    const plan = events.find((e) => e.channel === 'content:plan').payload;
    assert.equal(plan.taskId, res.taskId);
    assert.deepEqual(plan.items.map((i) => [i.title, i.dependency, i.status]), [['Sodium Extra', false, 'pending'], ["Reese's Sodium Options", true, 'pending'], ['Fabric API', true, 'pending']]);
    assert.equal(plan.items[0].size > 0, true);
    assert.equal(plan.items.some((i) => 'url' in i || 'sha1' in i), false, 'download URLs stay in the main process');
    const done = events.filter((e) => e.channel === 'content:progress' && e.payload.status === 'done').map((e) => e.payload.key);
    assert.deepEqual(done, ['curseforge:cf:100', 'curseforge:cf:200', 'curseforge:cf:250']);
    assert.equal(events.at(-1).payload.state, 'done');
    const rec = meta().content.find((c) => c.file === 'sodium-extra.jar');
    assert.deepEqual(
      { provider: rec.provider, projectId: rec.projectId, modId: rec.modId, versionId: rec.versionId, fileId: rec.fileId, title: rec.title },
      { provider: 'curseforge', projectId: 'cf:100', modId: 100, versionId: 'cf:1001', fileId: 1001, title: 'Sodium Extra' },
    );
    assert.equal(rec.sha1.length, 40);

    // list / pin / update checks keep working on CurseForge records
    const rows = await content.list(holder);
    assert.equal(rows.find((r) => r.file === 'reeses.jar').provider, 'curseforge');
    assert.equal(await content.setPinned(holder, { type: 'mod', file: 'reeses.jar', pinned: true }), true);
    world.mods.find((m) => m.id === 100).latestFilesIndexes = [{ gameVersion: '1.21.4', fileId: 1002, filename: 'sodium-extra-2.jar', releaseType: 1, modLoader: 4 }, { gameVersion: '1.21.4', fileId: 1009, filename: 'forge.jar', releaseType: 1, modLoader: 1 }];
    world.mods.find((m) => m.id === 200).latestFilesIndexes = [{ gameVersion: '1.21.4', fileId: 2002, filename: 'reeses-2.jar', releaseType: 1, modLoader: 4 }];
    world.files.push(file(1002, 100, 'sodium-extra-2.jar', { deps: [[200, 3]] }));
    const before = fake.calls.length;
    const updates = await content.checkUpdates(holder);
    assert.deepEqual(updates.map((u) => [u.projectId, u.newVersionId, u.newVersionNumber]), [['cf:100', 'cf:1002', 'sodium-extra-2']], 'pinned mod skipped, Forge index ignored');
    assert.equal(fake.calls.slice(before).some((c) => c.url.includes('modrinth')), false);
    await content.applyUpdates(holder, updates);
    const after = (await fs.readdir(path.join(dir, 'mods'))).sort();
    assert.deepEqual(after, ['fabric-api.jar', 'reeses.jar', 'sodium-extra-2.jar'], 'old jar replaced, installed deps not re-downloaded');
    assert.equal(meta().content.find((c) => c.projectId === 'cf:100').fileId, 1002);
    assert.equal(meta().content.find((c) => c.projectId === 'cf:200').pinned, true);

    // removal keeps working
    await content.remove(holder, { type: 'mod', file: 'fabric-api.jar' });
    assert.equal(meta().content.some((c) => c.projectId === 'cf:250'), false);
  } finally {
    fake.restore();
    content.setEmitter(null);
  }
});

test('a dependency that is already installed from Modrinth is not installed twice', async () => {
  await store.updateSettings({ curseforgeApiKey: KEY });
  const world = { mods: [mod(100, 'Sodium Extra'), mod(250, 'Fabric API')], files: [file(1001, 100, 'sodium-extra.jar', { deps: [[250, 3]] }), file(2501, 250, 'fabric-api-cf.jar')] };
  const fake = installFakeFetch(world);
  try {
    const { holder, dir } = makeHolder('cross');
    await fs.writeFile(path.join(dir, 'mods', 'fabric-api-mr.jar'), 'x');
    const m = await holder.load();
    m.content = [{ type: 'mod', file: 'fabric-api-mr.jar', projectId: 'P7dR8mSH', versionId: 'v1', title: 'Fabric API', sha1: 'abc' }];
    await holder.save(m);
    const res = await content.install(holder, { projectId: 'cf:100', type: 'mod' });
    assert.deepEqual(res.installed, ['Sodium Extra']);
    assert.deepEqual((await fs.readdir(path.join(dir, 'mods'))).sort(), ['fabric-api-mr.jar', 'sodium-extra.jar']);
  } finally {
    fake.restore();
  }
});

test('distribution-blocked mods are never downloaded and point to CurseForge instead', async () => {
  await store.updateSettings({ curseforgeApiKey: KEY });
  const world = {
    mods: [mod(100, 'Main Mod'), mod(800, 'Blocked Lib', { allow: false }), mod(900, 'No Url Mod'), mod(950, 'Blocked Main', { allow: false })],
    files: [
      file(1001, 100, 'main.jar', { deps: [[800, 3], [900, 3]] }),
      file(8001, 800, 'blocked-lib.jar'),
      file(9001, 900, 'nourl.jar', { url: false }),
      file(9501, 950, 'blocked-main.jar', { url: false }),
    ],
  };
  const fake = installFakeFetch(world);
  const events = captureEvents();
  try {
    const { holder, dir, meta } = makeHolder('blocked');
    const res = await content.install(holder, { projectId: 'cf:100', type: 'mod' });
    assert.deepEqual(res.installed, ['Main Mod']);
    assert.deepEqual(res.blocked.map((b) => [b.title, b.dependency]), [['Blocked Lib', true], ['No Url Mod', true]]);
    assert.match(res.blocked[0].pageUrl, /^https:\/\/www\.curseforge\.com\/minecraft\/mc-mods\/blocked-lib\/files\/8001$/);
    assert.equal(fake.calls.some((c) => c.url.startsWith(CDN) && /8001|9001/.test(c.url)), false, 'blocked files are never fetched');
    assert.equal(fake.calls.some((c) => c.url.includes('/mods/900/files/9001/download-url')), true, 'missing URL asks the official download-url endpoint');
    assert.equal(fake.calls.some((c) => c.url.includes('/mods/800/files/8001/download-url')), false, 'allowModDistribution=false is respected without asking');
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), ['main.jar']);
    const plan = events.find((e) => e.channel === 'content:plan').payload;
    assert.deepEqual(plan.items.filter((i) => i.status === 'blocked').map((i) => i.error), ['Author requires download on CurseForge', 'Author requires download on CurseForge']);
    assert.equal(events.at(-1).payload.state, 'partial');

    const main = await content.install(holder, { projectId: 'cf:950', type: 'mod' });
    assert.deepEqual(main.installed, []);
    assert.equal(main.blocked[0].dependency, false);
    assert.equal(meta().content.some((c) => c.projectId === 'cf:950'), false);
  } finally {
    fake.restore();
    content.setEmitter(null);
  }
});

test('a hash mismatch fails the install and leaves no jar, no partial file and no record', async () => {
  await store.updateSettings({ curseforgeApiKey: KEY });
  const world = { mods: [mod(100, 'Tampered')], files: [file(1001, 100, 'tampered.jar', { badHash: true })] };
  const fake = installFakeFetch(world);
  const events = captureEvents();
  try {
    const { holder, dir, meta } = makeHolder('hash');
    await assert.rejects(content.install(holder, { projectId: 'cf:100', type: 'mod' }), /Checksum mismatch/);
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), []);
    assert.equal((meta().content || []).length, 0);
    const failed = events.find((e) => e.channel === 'content:progress' && e.payload.status === 'failed');
    assert.match(failed.payload.error, /Checksum mismatch/);
  } finally {
    fake.restore();
    content.setEmitter(null);
  }
});
