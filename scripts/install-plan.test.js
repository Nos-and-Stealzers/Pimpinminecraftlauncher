// Install plans: recursion, cycles, already-installed and optional
// dependencies, surfaced dependency failures, features as one task, shader ->
// Iris, and cancellation that leaves no partial files. Modrinth is stubbed;
// downloads run through the real net.js against a fake fetch (no network).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const scratch = process.env.TMPDIR && /hermes[\\/]cache[\\/]scratch|runner|tmp|temp/i.test(process.env.TMPDIR)
  ? process.env.TMPDIR
  : path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'cache', 'scratch');
fss.mkdirSync(scratch, { recursive: true });
const root = fss.mkdtempSync(path.join(scratch, 'install-plan-test-'));
process.env.PIMPIN_ROOT = root;
test.after(() => fs.rm(root, { recursive: true, force: true }));

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const CDN = 'https://cdn.modrinth.test';

// ---- Modrinth world ------------------------------------------------------
const projects = {};
const versions = {};
function project(id, title, deps = [], { slug, size = 64, fail = false } = {}) {
  const bytes = Buffer.alloc(size, id.charCodeAt(0));
  projects[id] = { id, slug: slug || id, title, icon_url: `https://cdn.modrinth.test/${id}.png`, project_type: 'mod' };
  versions[`${id}-v1`] = {
    id: `${id}-v1`,
    project_id: id,
    version_number: '1.0.0',
    version_type: 'release',
    files: [{ primary: true, filename: `${id}.jar`, url: `${CDN}/${id}.jar`, size: bytes.length, hashes: { sha1: sha1(bytes) } }],
    dependencies: deps.map(([pid, type]) => ({ project_id: pid, dependency_type: type })),
    _bytes: bytes,
    _fail: fail,
  };
}
const modrinthPath = require.resolve('../src/main/modrinth');
require.cache[modrinthPath] = {
  id: modrinthPath,
  filename: modrinthPath,
  loaded: true,
  exports: {
    getVersions: async (pid) => {
      const id = Object.values(projects).find((p) => p.id === pid || p.slug === pid)?.id;
      if (!id || versions[`${id}-v1`]._fail) throw new Error(`No version available for Minecraft 1.21.4`);
      return [versions[`${id}-v1`]];
    },
    getVersion: async (vid) => versions[vid],
    getProject: async (pid) => projects[pid] || Object.values(projects).find((p) => p.slug === pid),
    getProjects: async (ids) => ids.map((i) => projects[i] || Object.values(projects).find((p) => p.slug === i)).filter(Boolean),
    latestForHashes: async () => ({}),
    versionsForHashes: async () => ({}),
  },
};

let downloadHook = null;
const fetched = [];
global.fetch = async (input, opts = {}) => {
  const url = String(input);
  fetched.push(url);
  if (!url.startsWith(CDN)) throw new Error(`Unexpected network call ${url}`);
  const id = url.slice(CDN.length + 1).replace(/\.jar$/, '');
  const v = versions[`${id}-v1`];
  if (downloadHook) {
    const r = await downloadHook(id, v, opts);
    if (r) return r;
  }
  return new Response(v._bytes, { status: 200, headers: { 'Content-Length': String(v._bytes.length) } });
};

const content = require('../src/main/content');

function makeHolder(name, { loader = 'fabric' } = {}) {
  const dir = path.join(root, 'instances', name);
  fss.mkdirSync(path.join(dir, 'mods'), { recursive: true });
  let meta = { content: [] };
  return {
    holder: { kind: 'instance', dir, mcVersion: '1.21.4', loader, load: async () => JSON.parse(JSON.stringify(meta)), save: async (m) => { meta = JSON.parse(JSON.stringify(m)); } },
    meta: () => meta,
    dir,
  };
}

function events() {
  const list = [];
  content.setEmitter((channel, payload) => list.push({ channel, payload }));
  return list;
}

project('aaa', 'Sodium Extra', [['bbb', 'required'], ['ccc', 'optional'], ['eee', 'incompatible'], ['fff', 'embedded']]);
project('bbb', "Reese's Sodium Options", [['ddd', 'required'], ['aaa', 'required'], ['ggg', 'required']]);
project('ccc', 'Optional Thing');
project('ddd', 'Sodium');
project('eee', 'Incompatible');
project('fff', 'Embedded');
project('ggg', 'Fabric API', [['bbb', 'required']]);

test('plan: recursion, cycles cut once, already-installed and optional/incompatible deps skipped', async () => {
  const { holder, dir } = makeHolder('plan');
  await fs.writeFile(path.join(dir, 'mods', 'ddd.jar.disabled'), 'x'); // installed but switched off still counts
  const meta = { content: [{ type: 'mod', file: 'ddd.jar', projectId: 'ddd', versionId: 'ddd-v1', title: 'Sodium' }] };
  const plan = await content.resolvePlan(holder, [{ projectId: 'aaa', type: 'mod' }], meta);
  assert.deepEqual(plan.map((p) => [p.projectId, p.dependency, p.parent]), [['aaa', false, null], ['bbb', true, 'Sodium Extra'], ['ggg', true, "Reese's Sodium Options"]]);
  assert.equal(plan.every((p) => p.status === 'pending'), true);

  // a record whose jar was deleted by hand does not count as installed
  await fs.rm(path.join(dir, 'mods', 'ddd.jar.disabled'));
  const again = await content.resolvePlan(holder, [{ projectId: 'aaa', type: 'mod' }], meta);
  assert.deepEqual(again.map((p) => p.projectId), ['aaa', 'bbb', 'ddd', 'ggg']);
});

test('plan: an installed root at the same version plans nothing; an explicit version reinstalls', async () => {
  const { holder, dir } = makeHolder('same');
  await fs.writeFile(path.join(dir, 'mods', 'ccc.jar'), 'x');
  const meta = { content: [{ type: 'mod', file: 'ccc.jar', projectId: 'ccc', versionId: 'ccc-v1', title: 'Optional Thing' }] };
  assert.deepEqual(await content.resolvePlan(holder, [{ projectId: 'ccc', type: 'mod' }], meta), []);
  assert.equal((await content.resolvePlan(holder, [{ projectId: 'ccc', type: 'mod', versionId: 'ccc-v1' }], meta)).length, 1);
});

test('install: plan event, per-item progress, dependency failures are reported (not swallowed)', async () => {
  project('hhh', 'Has Broken Dep', [['zzz', 'required'], ['ddd', 'required']]);
  project('zzz', 'Broken Dep', [], { fail: true });
  const ev = events();
  const { holder, dir, meta } = makeHolder('broken');
  const res = await content.install(holder, { projectId: 'hhh', type: 'mod' });
  assert.deepEqual(res.installed, ['Has Broken Dep', 'Sodium']);
  assert.deepEqual(res.failed, ['Broken Dep: No version available for Minecraft 1.21.4']);
  const plan = ev.find((e) => e.channel === 'content:plan').payload;
  assert.equal(plan.label, 'Has Broken Dep');
  assert.deepEqual(plan.target, { kind: 'instance', id: 'broken' });
  assert.deepEqual(plan.items.map((i) => [i.title, i.status]), [['Has Broken Dep', 'pending'], ['Broken Dep', 'failed'], ['Sodium', 'pending']]);
  assert.equal(plan.items[0].icon, 'https://cdn.modrinth.test/hhh.png');
  assert.equal(plan.items[0].versionNumber, '1.0.0');
  assert.equal(plan.items[0].size, 64);
  assert.deepEqual(ev.at(-1).payload, { taskId: plan.taskId, state: 'partial', installed: 2, failed: res.failed, blocked: 0 });
  assert.deepEqual((await fs.readdir(path.join(dir, 'mods'))).sort(), ['ddd.jar', 'hhh.jar']);
  assert.deepEqual(meta().content.map((c) => c.projectId).sort(), ['ddd', 'hhh']);
  assert.equal(meta().content.some((c) => c.provider), false, 'Modrinth records keep their old shape');
  content.setEmitter(null);
});

test('install: a root that cannot be resolved still throws for the library', async () => {
  const { holder } = makeHolder('rootfail');
  await assert.rejects(content.install(holder, { projectId: 'zzz', type: 'mod' }), /No version available/);
});

test('features install as one task; shader installs add Iris in the same plan', async () => {
  project('iris', 'Iris', [['ddd', 'required']]);
  project('shd', 'Cool Shader');
  versions['shd-v1'].files[0].filename = 'cool-shader.zip';
  const ev = events();
  const { holder, dir } = makeHolder('shader');
  const res = await content.install(holder, { projectId: 'shd', type: 'shader' });
  const plan = ev.find((e) => e.channel === 'content:plan').payload;
  assert.deepEqual(plan.items.map((i) => [i.title, i.dependency, i.parent]), [['Cool Shader', false, null], ['Iris', true, 'Shader support'], ['Sodium', true, 'Iris']]);
  assert.deepEqual(res.installed, ['Cool Shader', 'Iris', 'Sodium']);
  assert.deepEqual(await fs.readdir(path.join(dir, 'shaderpacks')), ['cool-shader.zip']);

  ev.length = 0;
  const f = makeHolder('feature');
  const out = await content.setFeature(f.holder, 'shaders', true);
  assert.deepEqual(out.failed, []);
  const plans = ev.filter((e) => e.channel === 'content:plan');
  assert.equal(plans.length, 1);
  assert.equal(plans[0].payload.source, 'feature');
  assert.equal(plans[0].payload.label, 'Shader Support');
  assert.deepEqual(plans[0].payload.items.map((i) => i.title), ['Iris', 'Sodium']);
  content.setEmitter(null);
});

test('cancel stops the remaining downloads and leaves no partial or half-written files', async () => {
  project('c1', 'First', [['c2', 'required'], ['c3', 'required']], { size: 32 });
  project('c2', 'Second', [], { size: 256 * 1024 });
  project('c3', 'Third', [], { size: 32 });
  const ev = events();
  let release;
  downloadHook = async (id, v, opts) => {
    if (id !== 'c2') return null;
    // send one chunk, then stall until cancelled
    const body = new ReadableStream({
      start(ctl) {
        ctl.enqueue(new Uint8Array(v._bytes.subarray(0, 1024)));
      },
      pull() {
        return new Promise((r) => { release = r; });
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Length': String(v._bytes.length) } });
  };
  const { holder, dir, meta } = makeHolder('cancel');
  const run = content.install(holder, { projectId: 'c1', type: 'mod' });
  // wait until the second item is mid-download
  for (let i = 0; i < 200; i++) {
    if (ev.some((e) => e.channel === 'content:progress' && e.payload.key === 'modrinth:c2' && e.payload.status === 'downloading')) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const files = await fs.readdir(path.join(dir, 'mods'));
  assert.equal(files.some((f) => f.endsWith('.part')), true, 'the download writes to a .part file');
  const taskId = ev.find((e) => e.channel === 'content:plan').payload.taskId;
  assert.equal(content.cancel(taskId), true);
  const res = await run;
  release?.();
  downloadHook = null;
  assert.equal(res.cancelled, true);
  assert.deepEqual(res.installed, ['First']);
  assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), ['c1.jar'], 'no c2.jar, no .part leftovers, c3 never written');
  assert.equal(fetched.some((u) => u.endsWith('/c3.jar')), false, 'remaining items are not fetched');
  assert.deepEqual(meta().content.map((c) => c.projectId), ['c1'], 'records match the files on disk');
  const statuses = Object.fromEntries(ev.filter((e) => e.channel === 'content:progress' && e.payload.key).map((e) => [e.payload.key, e.payload.status]));
  assert.deepEqual(statuses, { 'modrinth:c1': 'done', 'modrinth:c2': 'cancelled', 'modrinth:c3': 'cancelled' });
  assert.equal(ev.at(-1).payload.state, 'cancelled');
  assert.equal(content.cancel(taskId), false, 'finished tasks are forgotten');
  content.setEmitter(null);
});
