'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const release = require('./release-assets');
const baseEnv = { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: release.SOURCE_REPO,
  GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '12345', GITHUB_RUN_NUMBER: '42', GH_TOKEN: 'fixture-source', RELEASES_TOKEN: 'fixture-public' };
function fixture(t, overrides = {}) {
  const env = { ...baseEnv, ...overrides }, c = release.config(env);
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'pimpin-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dirs = {};
  for (const platform of ['Windows', 'Linux']) {
    const dir = path.join(root, platform); fs.mkdirSync(dir); dirs[platform] = dir;
    const names = release.required(c, platform);
    for (const name of names.filter(n => !n.endsWith('.yml'))) fs.writeFileSync(path.join(dir, name), `OFFLINE TEST FIXTURE ONLY: ${name}`);
    const update = names.filter(n => /\.(exe|AppImage|deb)$/.test(n) && !n.includes('Portable'));
    const files = update.map(url => ({ url, sha512: release.hash(path.join(dir, url), 'sha512', 'base64'), size: fs.statSync(path.join(dir, url)).size }));
    fs.writeFileSync(path.join(dir, names.at(-1)), yaml.dump({ version: c.version, files, path: names[0], sha512: files[0].sha512 }));
  }
  return { root, dirs, env, c };
}
function missing() { return Object.assign(new Error('fixture not found'), { notFound: true }); }
// Stateful, in-memory gh stub: real fixture bytes round-trip through upload and
// download. It never invokes gh, accesses credentials, or makes a network call.
function stub() {
  const state = { repos: {}, calls: [], fail: null, race: false, tagSha: null, corrupt: false };
  function run(args, token) {
    state.calls.push({ args, token });
    if (state.fail && state.fail(args)) throw new Error('fixture injected failure');
    if (args[0] === 'api') {
      if (!state.tagSha) throw missing();
      return JSON.stringify({ object: { sha: state.tagSha, type: 'commit' } });
    }
    const repo = args[args.indexOf('-R') + 1], command = args[1];
    assert.equal(token, repo === release.SOURCE_REPO ? 'fixture-source' : 'fixture-public');
    let r = state.repos[repo];
    const value = flag => args[args.indexOf(flag) + 1];
    if (command === 'view') { if (!r) throw missing(); return JSON.stringify({ ...r, assets: Object.entries(r.bytes).map(([name, b]) => ({ name, size: b.length })) }); }
    if (command === 'create') {
      assert.ok(args.includes('--draft')); assert.ok(args.includes('--latest=false'));
      if (repo === release.PUBLIC_REPO) assert.ok(!args.includes('--target'));
      if (r) throw new Error('fixture already exists');
      r = state.repos[repo] = { tagName: args[2], targetCommitish: repo === release.SOURCE_REPO ? value('--target') : 'main',
        isDraft: true, isPrerelease: args.includes('--prerelease=true'), body: value('--notes'), bytes: {} };
      if (state.race) { state.race = false; throw new Error('fixture concurrent create won'); }
      return '';
    }
    assert.ok(r, 'fixture release must exist');
    if (command === 'upload') {
      assert.equal(r.isDraft, true, 'must never upload to published release');
      for (const file of args.slice(args.indexOf('--clobber') + 1)) r.bytes[path.basename(file)] = fs.readFileSync(file);
    } else if (command === 'download') {
      const dir = value('--dir'); fs.mkdirSync(dir, { recursive: true });
      const patterns = args.filter((_, i) => args[i - 1] === '--pattern');
      for (const [name, data] of Object.entries(r.bytes)) {
        if (patterns.includes('*') || patterns.includes(name)) fs.writeFileSync(path.join(dir, name), state.corrupt ? Buffer.from('corrupt fixture') : data);
      }
    } else if (command === 'edit') { assert.equal(r.isDraft, true); r.isDraft = false; }
    else assert.fail(`Unexpected stub command ${command}`);
    return '';
  }
  return { state, run };
}
function stageBoth(f, s) { for (const platform of ['Windows', 'Linux']) release.execute('stage', platform, f.dirs[platform], f.env, s.run); }
function publish(f, s) { release.execute('publish', undefined, path.join(f.root, 'download'), f.env, s.run); }
const publishes = s => s.state.calls.filter(x => x.args[1] === 'edit');

test('PRs (including main-shaped refs), manual runs and other branches never call gh or inspect assets', () => {
  for (const overrides of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_REF: 'refs/heads/feature' }]) {
    release.execute('stage', 'Windows', 'nonexistent-fixture', { ...baseEnv, ...overrides }, () => assert.fail('gh must not run'));
    release.execute('publish', '', 'nonexistent-fixture', { ...baseEnv, ...overrides }, () => assert.fail('gh must not run'));
  }
});
test('version/tag rules preserve main, version tags and private claude prereleases', () => {
  assert.equal(release.config(baseEnv).tag, 'v0.1.42');
  assert.equal(release.config({ ...baseEnv, GITHUB_REF: 'refs/tags/v1.2.3' }).version, '1.2.3');
  assert.equal(release.config({ ...baseEnv, GITHUB_REF: 'refs/heads/claude/test' }).tag, 'v0.1.42-test');
  assert.throws(() => release.config({ ...baseEnv, GITHUB_SHA: 'main' }), /SHA/);
  assert.throws(() => release.config({ ...baseEnv, GITHUB_REPOSITORY: 'evil/fork' }), /repository/);
});
test('matrix race recovers create/view, stages disjoint assets and safely retries staging', t => {
  const f = fixture(t), s = stub(); s.state.race = true;
  stageBoth(f, s);
  release.execute('stage', 'Windows', f.dirs.Windows, f.env, s.run);
  assert.equal(Object.keys(s.state.repos[release.SOURCE_REPO].bytes).length, 9);
  assert.equal(publishes(s).length, 0);
});
test('both builds round-trip, verify SHA512 metadata and SHA256 manifests, then publish source/public drafts', t => {
  const f = fixture(t), s = stub(); stageBoth(f, s); publish(f, s);
  assert.equal(publishes(s).length, 2);
  assert.equal(s.state.repos[release.SOURCE_REPO].isDraft, false);
  assert.equal(s.state.repos[release.PUBLIC_REPO].isDraft, false);
  const firstPublish = s.state.calls.findIndex(x => x.args[1] === 'edit');
  assert.ok(s.state.calls.slice(0, firstPublish).some(x => x.args[1] === 'download' && x.args.includes(release.PUBLIC_REPO)));
});
test('claude builds publish private prereleases only and never use the public token', t => {
  const f = fixture(t, { GITHUB_REF: 'refs/heads/claude/test', RELEASES_TOKEN: '' }), s = stub();
  stageBoth(f, s); publish(f, s);
  assert.equal(publishes(s).length, 1); assert.equal(s.state.repos[release.PUBLIC_REPO], undefined);
  assert.equal(s.state.repos[release.SOURCE_REPO].isPrerelease, true);
  assert.ok(publishes(s)[0].args.includes('--latest=false'));
});
test('existing drafts must match SHA, target, tag, run and prerelease identity; published staging is rejected', t => {
  for (const [key, value] of [['targetCommitish', 'b'.repeat(40)], ['tagName', 'v0.1.41'], ['body', 'foreign release'], ['isDraft', false], ['isPrerelease', true]]) {
    const f = fixture(t), s = stub(); stageBoth(f, s);
    s.state.repos[release.SOURCE_REPO][key] = value;
    const before = s.state.calls.length;
    assert.throws(() => release.execute('stage', 'Windows', f.dirs.Windows, f.env, s.run), /mismatch|published/);
    assert.ok(!s.state.calls.slice(before).some(x => ['upload', 'edit'].includes(x.args[1])));
  }
});
test('a pre-existing source tag for a different commit is rejected before creating anything', t => {
  const f = fixture(t), s = stub(); s.state.tagSha = 'b'.repeat(40);
  assert.throws(() => release.execute('stage', 'Windows', f.dirs.Windows, f.env, s.run), /different SHA/);
  assert.ok(!s.state.calls.some(x => x.args[1] === 'create'));
});
test('authentication lookup failure is not mistaken for a missing draft', t => {
  const f = fixture(t), s = stub(); s.state.fail = args => args[1] === 'view';
  assert.throws(() => release.execute('stage', 'Windows', f.dirs.Windows, f.env, s.run), /injected failure/);
  assert.ok(!s.state.calls.some(x => x.args[1] === 'create'));
});
test('missing installers fail before creating a draft', t => {
  const f = fixture(t), s = stub(); fs.unlinkSync(path.join(f.dirs.Windows, release.required(f.c, 'Windows')[1]));
  assert.throws(() => release.execute('stage', 'Windows', f.dirs.Windows, f.env, s.run), /Missing/);
  assert.equal(s.state.calls.length, 0);
});
test('one-platform staging cannot create a public draft or publish either repository', t => {
  const f = fixture(t), s = stub(); release.execute('stage', 'Windows', f.dirs.Windows, f.env, s.run);
  assert.throws(() => publish(f, s), /Incomplete/);
  assert.equal(publishes(s).length, 0); assert.equal(s.state.repos[release.PUBLIC_REPO], undefined);
});
test('corrupt update hash or version and unsafe URL are rejected before staging', t => {
  for (const change of [m => { m.version = '0.0.0'; }, m => { m.files[0].sha512 = 'bad'; }, m => { m.files[0].url = '../escape.exe'; }]) {
    const f = fixture(t), s = stub(), file = path.join(f.dirs.Windows, 'latest.yml');
    const m = yaml.load(fs.readFileSync(file, 'utf8')); change(m); fs.writeFileSync(file, yaml.dump(m));
    assert.throws(() => release.execute('stage', 'Windows', f.dirs.Windows, f.env, s.run), /mismatch|Unexpected/);
    assert.equal(s.state.calls.length, 0);
  }
});
test('tampered manifest, missing remote asset, wrong remote bytes and missing public secret cannot publish', t => {
  for (const fault of ['manifest', 'missing', 'bytes', 'secret']) {
    const f = fixture(t), s = stub(); stageBoth(f, s);
    const bytes = s.state.repos[release.SOURCE_REPO].bytes;
    if (fault === 'manifest') bytes['release-Linux.json'] = Buffer.from('{}');
    if (fault === 'missing') delete bytes[release.required(f.c, 'Linux')[0]];
    if (fault === 'bytes') bytes[release.required(f.c, 'Linux')[0]][0] ^= 1;
    if (fault === 'secret') f.env.RELEASES_TOKEN = '';
    assert.throws(() => publish(f, s));
    assert.equal(publishes(s).length, 0);
  }
});
test('public upload or download verification failure leaves both releases unpublished', t => {
  for (const command of ['upload', 'download']) {
    const f = fixture(t), s = stub(); stageBoth(f, s);
    s.state.fail = args => args[1] === command && args.includes(release.PUBLIC_REPO);
    assert.throws(() => publish(f, s), /injected/);
    assert.equal(publishes(s).length, 0);
    assert.equal(s.state.repos[release.SOURCE_REPO].isDraft, true);
  }
});
test('published public target is never overwritten', t => {
  const f = fixture(t), s = stub(); stageBoth(f, s);
  release.transport(f.c, f.env.RELEASES_TOKEN, release.PUBLIC_REPO, s.run).ensure();
  s.state.repos[release.PUBLIC_REPO].isDraft = false;
  const before = s.state.calls.length;
  assert.throws(() => publish(f, s), /published/);
  assert.ok(!s.state.calls.slice(before).some(x => ['upload', 'edit'].includes(x.args[1])));
});
test('failed public publish can resume from verified published source without overwriting it', t => {
  const f = fixture(t), s = stub(); stageBoth(f, s);
  s.state.fail = args => args[1] === 'edit' && args.includes(release.PUBLIC_REPO);
  assert.throws(() => publish(f, s), /injected/);
  assert.equal(s.state.repos[release.SOURCE_REPO].isDraft, false);
  fs.rmSync(path.join(f.root, 'download'), { recursive: true }); s.state.fail = null;
  publish(f, s);
  assert.equal(s.state.repos[release.PUBLIC_REPO].isDraft, false);
});
test('actual helper CLI validates complete fixture and rejects incomplete fixture, without network', t => {
  const f = fixture(t), s = stub(); stageBoth(f, s);
  const dir = path.join(f.root, 'cli'); fs.mkdirSync(dir);
  for (const [name, bytes] of Object.entries(s.state.repos[release.SOURCE_REPO].bytes)) fs.writeFileSync(path.join(dir, name), bytes);
  const launch = env => spawnSync(process.execPath, [path.join(__dirname, 'release-assets.js'), 'validate', dir], { env: { ...process.env, ...env }, encoding: 'utf8' });
  let r = launch(f.env); assert.equal(r.status, 0, r.stderr);
  fs.unlinkSync(path.join(dir, 'latest.yml')); r = launch(f.env);
  assert.equal(r.status, 1); assert.match(r.stderr, /Missing/);
  r = launch({ ...f.env, GITHUB_EVENT_NAME: 'pull_request' }); assert.equal(r.status, 0); assert.match(r.stdout, /skipped/);
});
test('annotated version tags are peeled to the exact source commit', t => {
  for (const finalSha of [baseEnv.GITHUB_SHA, 'b'.repeat(40)]) {
    const f = fixture(t, { GITHUB_REF: 'refs/tags/v1.2.3' }), s = stub();
    const run = (args, token) => {
      if (args[0] !== 'api') return s.run(args, token);
      if (args[1].includes('/git/ref/tags/')) return JSON.stringify({ object: { type: 'tag', sha: 'c'.repeat(40) } });
      assert.ok(args[1].endsWith(`/git/tags/${'c'.repeat(40)}`));
      return JSON.stringify({ object: { type: 'commit', sha: finalSha } });
    };
    if (finalSha === f.c.sha) release.execute('stage', 'Windows', f.dirs.Windows, f.env, run);
    else assert.throws(() => release.execute('stage', 'Windows', f.dirs.Windows, f.env, run), /different SHA/);
  }
});
test('unexpected remote names are rejected before any asset download', t => {
  const f = fixture(t), s = stub(); stageBoth(f, s);
  s.state.repos[release.SOURCE_REPO].bytes['../unexpected.txt'] = Buffer.from('fixture');
  const before = s.state.calls.length;
  assert.throws(() => publish(f, s), /unexpected/);
  assert.ok(!s.state.calls.slice(before).some(x => x.args[1] === 'download'));
  assert.equal(publishes(s).length, 0);
});
test('source upload failure and public SHA/run mismatch never publish', t => {
  const f = fixture(t), s = stub(); s.state.fail = args => args[1] === 'upload';
  assert.throws(() => release.execute('stage', 'Windows', f.dirs.Windows, f.env, s.run), /injected/);
  assert.equal(publishes(s).length, 0);
  s.state.fail = null; stageBoth(f, s);
  release.transport(f.c, f.env.RELEASES_TOKEN, release.PUBLIC_REPO, s.run).ensure();
  s.state.repos[release.PUBLIC_REPO].body = f.c.notes.replace(f.c.sha, 'b'.repeat(40));
  assert.throws(() => publish(f, s), /mismatch/);
  assert.equal(publishes(s).length, 0);
});
test('workflow keeps both platforms/checks and guards staging/publication; no Actions artifacts', () => {
  const text = fs.readFileSync(path.join(__dirname, '../.github/workflows/build.yml'), 'utf8');
  const workflow = yaml.load(text), build = workflow.jobs.build, publishJob = workflow.jobs.release;
  assert.deepEqual(build.strategy.matrix.os, ['windows-latest', 'ubuntu-latest']);
  assert.equal(publishJob.needs, 'build'); assert.match(publishJob.if, /github.event_name == 'push'/);
  assert.ok(build.steps.some(s => s.run === 'npm run check'));
  assert.ok(build.steps.some(s => s.run === 'npm test'));
  assert.ok(build.steps.some(s => s.run === 'npx electron-builder --win --publish never'));
  assert.ok(build.steps.some(s => s.run === 'npx electron-builder --linux --publish never'));
  assert.match(build.steps.find(s => s.run === 'node scripts/release-assets.js stage dist').if, /github.event_name == 'push'/);
  assert.ok(!text.includes('actions/upload-artifact') && !text.includes('actions/download-artifact'));
  assert.ok(!build.steps.some(s => s.env && s.env.RELEASES_TOKEN));
});
