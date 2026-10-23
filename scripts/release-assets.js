'use strict';
// Quota-independent release transport. No tokens in arguments, logs or assets.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml'); // Locked electron-builder dependency, installed by npm ci.
const PUBLIC_REPO = 'Nos-and-Stealzers/pimpin-launcher-releases';
const SOURCE_REPO = 'Nos-and-Stealzers/Pimpinminecraftlauncher';
const FIELDS = 'tagName,targetCommitish,isDraft,isPrerelease,body,assets';
function check(ok, message) { if (!ok) throw new Error(message); }
function config(env = process.env) {
  const ref = env.GITHUB_REF || '';
  const enabled = env.GITHUB_EVENT_NAME === 'push' &&
    (ref === 'refs/heads/main' || ref.startsWith('refs/heads/claude/') || ref.startsWith('refs/tags/v'));
  if (!enabled) return { enabled: false };
  check(env.GITHUB_REPOSITORY === SOURCE_REPO, 'Unexpected source repository');
  check(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || ''), 'Invalid source SHA');
  check(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID || ''), 'Invalid run ID');
  check(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_NUMBER || ''), 'Invalid run number');
  // Version comes from a tag, the build job's own choice (PIMPIN_VERSION, set
  // from main's VERSION file), or the run number for unversioned branches.
  const version = ref.startsWith('refs/tags/v') ? ref.slice(11) : (env.PIMPIN_VERSION || `0.1.${env.GITHUB_RUN_NUMBER}`);
  check(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version), 'Invalid release version');
  const prerelease = ref.startsWith('refs/heads/claude/');
  const tag = `v${version}${prerelease ? '-test' : ''}`;
  const c = { enabled, version, prerelease, tag, sha: env.GITHUB_SHA, run: env.GITHUB_RUN_ID, repo: SOURCE_REPO };
  c.marker = `<!-- pimpin-release:${JSON.stringify({ source: c.repo, sha: c.sha, run: c.run, tag: c.tag, version: c.version })} -->`;
  c.notes = `${c.marker}\n\n**Windows 10/11:** download PimpinLauncher-Setup-${version}.exe (installer) or PimpinLauncher-Portable-${version}.exe. The unsigned app may trigger SmartScreen: More info → Run anyway.\n\n**Linux:** download the AppImage, run chmod +x on it, then open it; Debian/Ubuntu can use the .deb.\n\nInstalled Setup/AppImage launchers update automatically.`;
  c.notes += '\n\n' + fs.readFileSync(path.join(__dirname, 'release-notes.md'), 'utf8');
  return c;
}
function gh(args, token) {
  check(token, 'Missing release credential');
  const env = { ...process.env, GH_TOKEN: token, GH_PROMPT_DISABLED: '1' };
  delete env.GITHUB_TOKEN;
  delete env.RELEASES_TOKEN; // A child gh process receives only its selected credential.
  const r = spawnSync('gh', args, { env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  // Do not echo stderr: authentication/network errors can contain sensitive data.
  if (r.error || r.status !== 0) {
    const error = new Error(`gh ${args.slice(0, 2).join(' ')} failed`);
    error.notFound = /HTTP 404|release not found/i.test(r.stderr || '');
    throw error;
  }
  return r.stdout;
}
function hash(file, algorithm = 'sha256', encoding = 'hex') {
  // Stream-sized reads avoid loading several hundred MB installers into memory.
  const h = crypto.createHash(algorithm), buffer = Buffer.alloc(1024 * 1024);
  const fd = fs.openSync(file, 'r');
  try { let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) h.update(buffer.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return h.digest(encoding);
}
function required(c, platform) {
  if (platform === 'Windows') return [`PimpinLauncher-Setup-${c.version}.exe`, `PimpinLauncher-Portable-${c.version}.exe`, `PimpinLauncher-Setup-${c.version}.exe.blockmap`, 'latest.yml'];
  check(platform === 'Linux', 'Unsupported release platform');
  return [`PimpinLauncher-${c.version}-linux-x86_64.AppImage`, `PimpinLauncher-${c.version}-linux-amd64.deb`, 'latest-linux.yml'];
}
function safeName(name) { return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9.+_-]*$/.test(name); }
function validatePlatform(c, platform, dir) {
  const names = required(c, platform);
  for (const name of names) check(fs.existsSync(path.join(dir, name)) && fs.lstatSync(path.join(dir, name)).isFile() && fs.statSync(path.join(dir, name)).size > 0, `Missing or invalid asset: ${name}`);
  const metadata = yaml.load(fs.readFileSync(path.join(dir, platform === 'Windows' ? 'latest.yml' : 'latest-linux.yml'), 'utf8'));
  check(metadata && metadata.version === c.version && Array.isArray(metadata.files) && metadata.files.length > 0, 'Update metadata version/files mismatch');
  const expectedUpdate = platform === 'Windows' ? names[0] : names[0];
  check(metadata.path === expectedUpdate && metadata.files.some(f => f.url === expectedUpdate), 'Update metadata installer mismatch');
  for (const f of metadata.files) {
    check(f && safeName(f.url) && names.includes(f.url), 'Unexpected update metadata URL');
    const file = path.join(dir, f.url);
    check(f.sha512 === hash(file, 'sha512', 'base64') && f.size === fs.statSync(file).size, `Update metadata hash/size mismatch: ${f.url}`);
  }
  check(metadata.sha512 === hash(path.join(dir, metadata.path), 'sha512', 'base64'), 'Legacy update metadata hash mismatch');
  return names;
}
function manifest(c, platform, dir) {
  return { source: c.repo, sha: c.sha, run: c.run, tag: c.tag, version: c.version, platform,
    files: validatePlatform(c, platform, dir).map(name => ({ name, size: fs.statSync(path.join(dir, name)).size, sha256: hash(path.join(dir, name)) })) };
}
function validateAll(c, dir) {
  const names = [];
  for (const platform of ['Windows', 'Linux']) {
    const file = `release-${platform}.json`;
    const actual = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const expected = manifest(c, platform, dir);
    check(JSON.stringify(actual) === JSON.stringify(expected), `Invalid ${platform} release manifest`);
    names.push(...expected.files.map(f => f.name), file);
  }
  check(new Set(names).size === names.length, 'Duplicate release asset names');
  check(fs.readdirSync(dir).sort().join('\n') === [...names].sort().join('\n'), 'Unexpected release assets');
  return names;
}
function transport(c, token, repo, run = gh) {
  function view() { return JSON.parse(run(['release', 'view', c.tag, '-R', repo, '--json', FIELDS], token)); }
  function identity(r, draft = true) {
    check(r.tagName === c.tag && r.isPrerelease === c.prerelease && typeof r.body === 'string' && r.body.split('\n').includes(c.marker), 'Release identity/tag/SHA/run mismatch');
    if (repo === c.repo) check(r.targetCommitish === c.sha, 'Release target SHA mismatch');
    if (draft) check(r.isDraft === true, 'Refusing to overwrite a published release');
    return r;
  }
  function verifyTag() {
    if (repo !== c.repo) return;
    let ref;
    try { ref = JSON.parse(run(['api', `repos/${repo}/git/ref/tags/${encodeURIComponent(c.tag)}`], token)); }
    catch (e) { if (e.notFound) return; throw e; }
    let object = ref.object;
    // Peel annotated tags too; a missing ref is 404, unlike commits/{ref} (422).
    for (let depth = 0; object && object.type === 'tag' && depth < 10; depth++) {
      check(/^[a-f0-9]{40}$/.test(object.sha), 'Invalid annotated tag SHA');
      object = JSON.parse(run(['api', `repos/${repo}/git/tags/${object.sha}`], token)).object;
    }
    check(object && object.type === 'commit' && object.sha === c.sha, 'Existing source tag points at a different SHA');
  }
  function ensure() {
    verifyTag();
    let r;
    try { r = view(); } catch (e) {
      if (!e.notFound) throw e;
      try {
        run(['release', 'create', c.tag, '-R', repo, '--draft', `--prerelease=${c.prerelease}`, '--latest=false', '--title', `Pimpin Launcher ${c.tag}`, '--notes', c.notes, ...(repo === c.repo ? ['--target', c.sha] : [])], token);
      } catch { /* A matrix peer can win creation. Always re-read and verify. */ }
      r = view();
    }
    return identity(r);
  }
  function download(dir, names) {
    identity(view(), false);
    fs.mkdirSync(dir, { recursive: true });
    run(['release', 'download', c.tag, '-R', repo, '--dir', dir, ...names.flatMap(n => ['--pattern', n])], token);
  }
  function upload(dir, names) {
    identity(view());
    run(['release', 'upload', c.tag, '-R', repo, '--clobber', ...names.map(n => path.join(dir, n))], token);
    const r = identity(view());
    for (const name of names) check(r.assets.some(a => a.name === name && a.size === fs.statSync(path.join(dir, name)).size), `Uploaded asset missing or wrong size: ${name}`);
  }
  function verify(dir, names, exact = false) {
    verifyTag();
    const r = identity(view(), false);
    if (exact) check(r.assets.map(a => a.name).sort().join('\n') === [...names].sort().join('\n'), 'Remote release asset set mismatch');
    const temp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'pimpin-release-verify-'));
    try {
      download(temp, names);
      for (const name of names) check(hash(path.join(temp, name)) === hash(path.join(dir, name)), `Remote asset hash mismatch: ${name}`);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
  function publish() {
    verifyTag();
    identity(view());
    run(['release', 'edit', c.tag, '-R', repo, '--draft=false', `--prerelease=${c.prerelease}`, `--latest=${!c.prerelease}`], token);
    check(identity(view(), false).isDraft === false, 'Release did not publish');
  }
  return { view, identity, ensure, upload, download, verify, publish };
}
function execute(command, platform, dir, env = process.env, run = gh) {
  const c = config(env);
  if (!c.enabled) { console.log('Release transport skipped: not an eligible push.'); return; }
  if (command === 'validate') { validateAll(c, dir); return; }
  const source = transport(c, env.GH_TOKEN, c.repo, run);
  if (command === 'stage') {
    const data = manifest(c, platform, dir), file = `release-${platform}.json`;
    fs.writeFileSync(path.join(dir, file), `${JSON.stringify(data)}\n`);
    source.ensure();
    const names = [...data.files.map(f => f.name), file];
    source.upload(dir, names);
    source.verify(dir, names);
    return;
  }
  check(command === 'publish', 'Expected stage, validate or publish');
  // Download into an empty dedicated directory. Never merge stale local builds.
  check(!fs.existsSync(dir) || fs.readdirSync(dir).length === 0, 'Download directory must be empty');
  const expectedNames = ['Windows', 'Linux'].flatMap(p => [...required(c, p), `release-${p}.json`]);
  const remote = source.identity(source.view(), false);
  check(remote.assets.map(a => a.name).sort().join('\n') === [...expectedNames].sort().join('\n'), 'Incomplete or unexpected source release assets');
  source.download(dir, expectedNames);
  const names = validateAll(c, dir);
  source.verify(dir, names, true);
  let publicRelease;
  if (!c.prerelease) {
    check(env.RELEASES_TOKEN, 'Missing restricted public publishing credential');
    publicRelease = transport(c, env.RELEASES_TOKEN, PUBLIC_REPO, run);
    publicRelease.ensure();
    publicRelease.upload(dir, names);
    publicRelease.verify(dir, names, true);
  }
  // Only publish after BOTH builds and every remote byte have been verified.
  // A previous public publish failure may leave the source already published;
  // verify it above, never upload to it, and finish the still-draft public copy.
  if (source.view().isDraft) source.publish();
  if (publicRelease) publicRelease.publish();
}
if (require.main === module) {
  try { execute(process.argv[2], process.env.RUNNER_OS, path.resolve(process.argv[3] || 'dist')); }
  catch (e) { console.error(`Release stopped: ${e.message}`); process.exitCode = 1; }
}
module.exports = { config, required, manifest, validateAll, transport, execute, hash, PUBLIC_REPO, SOURCE_REPO };
