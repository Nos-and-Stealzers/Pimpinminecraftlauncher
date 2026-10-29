// Installing / removing / updating library content (mods, shaders, resource
// packs, plugins) for an instance or a server, including dependency resolution.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const modrinth = require('./modrinth');
const { download, sha1File } = require('./net');
const { safeJoin } = require('./store');

const FOLDERS = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks', plugin: 'plugins' };
const PLUGIN_LOADERS = ['paper', 'spigot', 'bukkit', 'purpur'];

/**
 * Curated one-click "client features", Feather / Lunar style. Each one is a set
 * of Modrinth projects that get installed (with dependencies) when switched on.
 */
const FEATURES = [
  { id: 'pimpinclient', name: 'Pimpin Client', icon: 'sparkle', desc: 'Our own mod: HUD, keystrokes, a fast minimap + big map, zoom, FPS booster and a mod menu.', custom: true, projects: [] },
  { id: 'fps', name: 'FPS Boost', icon: 'bolt', desc: 'Sodium, Lithium, FerriteCore, Entity Culling & ImmediatelyFast.', projects: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast'] },
  { id: 'faststart', name: 'Fast Startup', icon: 'bolt', desc: 'ModernFix: the game starts faster and uses less memory.', projects: ['modernfix'] },
  { id: 'shaders', name: 'Shader Support', icon: 'sun', desc: 'Iris, so you can use any shader pack from the library.', projects: ['iris'] },
  { id: 'zoom', name: 'Zoom', icon: 'search', desc: 'Smooth, scrollable zoom (Zoomify).', projects: ['zoomify'] },
  { id: 'minimap', name: 'Minimap', icon: 'map', desc: "Xaero's Minimap with waypoints.", projects: ['xaeros-minimap'] },
  { id: 'worldmap', name: 'World Map', icon: 'globe', desc: "Xaero's full-screen World Map.", projects: ['xaeros-world-map'] },
  { id: 'freelook', name: 'Freelook', icon: 'eye', desc: 'Look around without turning your player.', projects: ['freelook'] },
  { id: 'skinlayers', name: '3D Skin Layers', icon: 'user', desc: 'Renders the outer skin layer in 3D.', projects: ['3dskinlayers'] },
  { id: 'dynamiclights', name: 'Dynamic Lights', icon: 'flame', desc: 'Torches light up the world in your hand.', projects: ['lambdynamiclights'] },
  { id: 'animations', name: 'Better Animations', icon: 'sparkle', desc: 'Not Enough Animations: better first-person animations.', projects: ['not-enough-animations'] },
  { id: 'hud', name: 'Better HUD', icon: 'layout', desc: 'AppleSkin food info + BetterF3 debug screen.', projects: ['appleskin', 'betterf3'] },
  { id: 'ctm', name: 'Connected Textures', icon: 'grid', desc: 'Continuity: seamless glass and bookshelves.', projects: ['continuity'] },
  { id: 'dynamicfps', name: 'Background Saver', icon: 'moon', desc: 'Dynamic FPS: lowers FPS when you tab out.', projects: ['dynamic-fps'] },
  { id: 'modmenu', name: 'Mod Menu', icon: 'menu', desc: 'In-game list of your mods and their settings.', projects: ['modmenu'] },
];

// ------------------------------------------------------- Pimpin Client --
// The launcher's own Fabric mod ships inside the app. resources/mods/pimpin-client.json
// (written by `gradlew collect` in mod/) lists each jar and the Minecraft versions it runs on.
const CLIENT_DIR = path.join(__dirname, '..', '..', 'resources', 'mods');
const CLIENT_FILE = 'pimpin-client.jar';
const CLIENT_LOADERS = ['fabric', 'quilt'];

let clientManifest = null;
function readClientManifest() {
  if (!clientManifest) {
    try {
      clientManifest = JSON.parse(fs.readFileSync(path.join(CLIENT_DIR, 'pimpin-client.json'), 'utf8'));
    } catch {
      clientManifest = { version: '0', jars: [] };
    }
  }
  return clientManifest;
}

function clientEntry(mcVersion) {
  return readClientManifest().jars.find((j) => j.covers.includes(mcVersion)) || null;
}

function clientJar(mcVersion, loader = 'fabric') {
  if (loader && !CLIENT_LOADERS.includes(loader)) return null;
  const entry = clientEntry(mcVersion);
  return entry ? path.join(CLIENT_DIR, entry.file) : null;
}

/** "1.20.1 – 26.3" style summary for messages. */
function clientRange() {
  const all = readClientManifest().jars.flatMap((j) => j.covers);
  return all.length ? `${all[0]} – ${all[all.length - 1]}` : 'none';
}

const clientVersion = () => readClientManifest().version;

async function writeClientJar(holder) {
  const jar = clientJar(holder.mcVersion, holder.loader);
  if (!jar) return false;
  const mods = path.join(holder.dir, 'mods');
  await fsp.mkdir(mods, { recursive: true });
  // Read + write (not copy) so this also works from inside the packaged app archive.
  await fsp.writeFile(path.join(mods, CLIENT_FILE), await fsp.readFile(jar));
  return true;
}

async function setPimpinClient(holder, enabled, onProgress) {
  const dest = path.join(holder.dir, 'mods', CLIENT_FILE);
  if (!enabled) {
    await remove(holder, { type: 'mod', file: CLIENT_FILE });
    return { failed: [] };
  }
  if (!CLIENT_LOADERS.includes(holder.loader)) throw new Error('Pimpin Client needs a Fabric or Quilt instance.');
  if (!(await writeClientJar(holder))) {
    throw new Error(`Pimpin Client isn't built for Minecraft ${holder.mcVersion}. It runs on ${clientRange()}.`);
  }
  await fsp.rm(`${dest}.disabled`, { force: true });
  await withLock(holder.dir, async () => {
    const meta = await holder.load();
    meta.content = (meta.content || []).filter((c) => c.file !== CLIENT_FILE);
    meta.content.push({ type: 'mod', file: CLIENT_FILE, title: 'Pimpin Client', projectId: null, versionNumber: clientVersion(), icon: null, pimpin: true });
    await holder.save(meta);
  });
  const failed = [];
  // Pimpin Client needs Fabric API.
  try {
    const res = await install(holder, { projectId: 'fabric-api', type: 'mod' }, onProgress, { label: 'Pimpin Client', source: 'feature' });
    failed.push(...res.failed);
  } catch (err) {
    failed.push(`Fabric API: ${err.message}`);
  }
  return { failed };
}

/**
 * Before each launch: if the instance has Pimpin Client switched on, swap in the jar
 * shipped with this launcher build, so app updates also update the mod.
 */
async function refreshPimpinClient(holder) {
  const dest = path.join(holder.dir, 'mods', CLIENT_FILE);
  if (!fs.existsSync(dest)) return false;
  const jar = clientJar(holder.mcVersion, holder.loader);
  if (!jar) return false;
  const [have, want] = await Promise.all([sha1File(dest).catch(() => null), sha1Buffer(await fsp.readFile(jar))]);
  if (have === want) return false;
  await writeClientJar(holder);
  await withLock(holder.dir, async () => {
    const meta = await holder.load();
    const entry = (meta.content || []).find((c) => c.file === CLIENT_FILE);
    if (entry) entry.versionNumber = clientVersion();
    await holder.save(meta);
  });
  return true;
}

const sha1Buffer = (buf) => require('crypto').createHash('sha1').update(buf).digest('hex');

const slugIds = new Map();
async function resolveSlugs(slugs) {
  const missing = slugs.filter((s) => !slugIds.has(s));
  if (missing.length) {
    for (const p of await modrinth.getProjects(missing)) slugIds.set(p.slug, { id: p.id, title: p.title, icon: p.icon_url });
  }
  return slugs.map((s) => slugIds.get(s)).filter(Boolean);
}

const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  return next;
}

function loadersFor(type, holder) {
  if (type === 'mod') {
    if (!holder.loader || holder.loader === 'vanilla') {
      throw new Error('Mods need the Fabric or Quilt loader. Edit this instance and switch its loader first.');
    }
    return holder.loader === 'quilt' ? ['quilt', 'fabric'] : [holder.loader];
  }
  if (type === 'shader') return ['iris', 'optifine'];
  if (type === 'resourcepack') return ['minecraft'];
  if (type === 'plugin') return PLUGIN_LOADERS;
  throw new Error(`Cannot install ${type} here`);
}

function checkTarget(type, holder) {
  if (holder.kind === 'server' && type !== 'plugin') throw new Error('Servers can only install plugins.');
  if (holder.kind === 'server' && holder.loader === 'vanilla') throw new Error('Vanilla servers cannot run plugins. Switch the server to Paper or Purpur in its Settings tab.');
  if (holder.kind !== 'server' && type === 'plugin') throw new Error('Plugins go on a server. Open the Servers tab.');
  if (type === 'shader' && (!holder.loader || holder.loader === 'vanilla')) {
    throw new Error('Shaders need a Fabric or Quilt instance (Iris is installed for you automatically).');
  }
}

async function pickVersion(projectId, type, holder) {
  const loaders = loadersFor(type, holder);
  let versions = await modrinth.getVersions(projectId, { loaders, gameVersions: [holder.mcVersion] });
  if (!versions.length && (type === 'shader' || type === 'resourcepack')) {
    versions = await modrinth.getVersions(projectId, { loaders });
  }
  if (!versions.length) throw new Error(`No version available for Minecraft ${holder.mcVersion}`);
  return versions.find((v) => v.version_type === 'release') || versions[0];
}

function toRecord(type, version, file, project) {
  return {
    type,
    file: file.filename,
    projectId: version.project_id,
    versionId: version.id,
    versionNumber: version.version_number,
    title: project?.title || file.filename,
    icon: project?.icon_url || null,
    sha1: file.hashes?.sha1,
  };
}

// ------------------------------------------------------- install plans --
// An install is planned first (the item plus its required dependencies,
// recursively, minus what is already installed), announced to the UI as
// 'content:plan', then downloaded item by item with 'content:progress'.

let emitter = null;
/** main.js hands in its window sender so plans and progress reach the install popup. */
function setEmitter(fn) {
  emitter = typeof fn === 'function' ? fn : null;
}
function emitEvent(channel, payload) {
  try {
    emitter?.(channel, payload);
  } catch {
    /* a closed window must not break an install */
  }
}

const tasks = new Map(); // taskId -> AbortController
let taskSeq = 0;

/** Stop the remaining downloads of a running install. Finished items stay installed. */
function cancel(taskId) {
  const ctl = tasks.get(String(taskId));
  if (!ctl) return false;
  ctl.abort();
  return true;
}

function recordOnDisk(holder, rec) {
  if (!rec?.file || !FOLDERS[rec.type]) return false;
  const folder = path.join(holder.dir, FOLDERS[rec.type]);
  return fs.existsSync(path.join(folder, rec.file)) || fs.existsSync(path.join(folder, `${rec.file}.disabled`));
}

/** Best-effort name for an item that could not be resolved, so the popup can say what failed. */
async function projectTitle(provider, projectId) {
  if (!projectId) return null;
  try {
    return (await modrinth.getProject(projectId))?.title || null;
  } catch {
    return null;
  }
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** One resolved, downloadable item in a provider-neutral shape. */
async function resolveCandidate(holder, req) {
  const type = req.type;
  const version = req.versionId ? await modrinth.getVersion(req.versionId) : await pickVersion(req.projectId, type, holder);
  const file = version.files.find((f) => f.primary) || version.files[0];
  const project = await modrinth.getProject(version.project_id).catch(() => null);
  const kind = type === 'plugin' ? 'plugin' : 'mod';
  return {
    provider: 'modrinth',
    projectId: version.project_id,
    versionId: version.id,
    type,
    title: project?.title || file.filename,
    icon: project?.icon_url || null,
    versionNumber: version.version_number,
    filename: file.filename,
    url: file.url,
    size: file.size || 0,
    sha1: file.hashes?.sha1 || null,
    pageUrl: project?.slug ? `https://modrinth.com/${project.project_type || type}/${project.slug}` : null,
    blocked: false,
    deps:
      type === 'mod' || type === 'plugin'
        ? (version.dependencies || [])
            .filter((d) => d.dependency_type === 'required' && (d.project_id || d.version_id))
            .map((d) => ({ provider: 'modrinth', projectId: d.project_id || null, versionId: d.project_id ? null : d.version_id, type: kind }))
        : [],
  };
}

/**
 * Resolve everything an install needs, before downloading anything.
 * requests: [{provider?, projectId, versionId?, type, title?}]
 * Required dependencies are followed recursively (cycles are cut by project id);
 * dependencies that are already installed (also when they came from the other
 * provider: same hash, file name or title) are skipped; optional ones never install.
 * With rootsFatal a request that cannot be resolved throws; otherwise it becomes a failed item.
 */
async function resolvePlan(holder, requests, meta, { rootsFatal = true } = {}) {
  const plan = [];
  const seen = new Set();
  const content = meta.content || [];
  const installed = () => content.filter((c) => recordOnDisk(holder, c));
  const seenKey = (provider, id) => `${provider}:${id}`;

  const visit = async (req, parent) => {
    const provider = 'modrinth';
    if (req.projectId) {
      if (seen.has(seenKey(provider, req.projectId))) return;
      seen.add(seenKey(provider, req.projectId));
      if (parent) {
        const rec = content.find((c) => c.projectId === req.projectId);
        if (rec && recordOnDisk(holder, rec)) return;
      }
    }
    let c;
    try {
      c = await resolveCandidate(holder, req);
    } catch (err) {
      if (!parent && rootsFatal) throw err;
      const title = req.title || (await projectTitle(provider, req.projectId)) || (parent ? `A dependency of ${parent.title}` : req.projectId);
      plan.push({ key: seenKey(provider, req.projectId || req.versionId), provider, projectId: req.projectId || null, type: req.type, title, dependency: Boolean(parent), parent: parent?.title || null, status: 'failed', error: err.message, size: 0 });
      return;
    }
    const key = seenKey(c.provider, c.projectId);
    if (key !== seenKey(provider, req.projectId) && seen.has(key)) return;
    seen.add(key);
    const existing = content.find((r) => r.projectId === c.projectId);
    if (!parent && existing && recordOnDisk(holder, existing) && existing.versionId === c.versionId && !req.versionId) return;
    if (parent) {
      // the same mod from the other library (Fabric API on both, say) counts as installed
      const dup = installed().find((r) => r.type === c.type && ((c.sha1 && r.sha1 === c.sha1) || r.file === c.filename || (norm(r.title) && norm(r.title) === norm(c.title))));
      if (dup) return;
    }
    const item = {
      key,
      provider: c.provider,
      projectId: c.projectId,
      versionId: c.versionId,
      type: c.type,
      title: c.title,
      icon: c.icon,
      versionNumber: c.versionNumber,
      filename: c.filename,
      url: c.url,
      size: c.size,
      sha1: c.sha1,
      pageUrl: c.pageUrl,
      dependency: Boolean(parent),
      parent: parent?.title || null,
      status: 'pending',
      error: null,
    };
    plan.push(item);
    for (const dep of c.deps) await visit(dep, item);
  };

  for (const req of requests) {
    checkTarget(req.type, holder);
    await visit(req, null);
  }

  // Shader packs need Iris (which pulls in Sodium as a dependency).
  if (requests.some((r) => r.type === 'shader') && plan.some((p) => p.type === 'shader' && p.status === 'pending')) {
    try {
      const [iris] = await resolveSlugs(['iris']);
      if (!iris) throw new Error('Iris was not found on Modrinth');
      await visit({ provider: 'modrinth', projectId: iris.id, type: 'mod', title: 'Iris' }, { title: 'Shader support' });
    } catch (err) {
      plan.push({ key: 'modrinth:iris', provider: 'modrinth', projectId: null, type: 'mod', title: 'Iris', dependency: true, parent: 'Shader support', status: 'failed', error: err.message, size: 0 });
    }
  }
  return plan;
}

const PUBLIC_FIELDS = ['key', 'provider', 'type', 'title', 'icon', 'versionNumber', 'size', 'dependency', 'parent', 'status', 'error', 'pageUrl'];
const publicItem = (item) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, item[k] ?? null]));

function recordFor(item) {
  const rec = {
    type: item.type,
    file: item.filename,
    projectId: item.projectId,
    versionId: item.versionId,
    versionNumber: item.versionNumber,
    title: item.title || item.filename,
    icon: item.icon || null,
    sha1: item.sha1 || undefined,
  };
  return rec;
}

/** Download the plan item by item. Records are saved after each item, so a cancel leaves a consistent instance. */
async function executePlan(holder, plan, meta, { taskId, signal, onProgress }) {
  const send = (item, extra = {}) => emitEvent('content:progress', { taskId, key: item.key, status: item.status, error: item.error || null, ...extra });
  for (const item of plan) {
    if (item.status !== 'pending') continue;
    if (signal.aborted) {
      item.status = 'cancelled';
      send(item);
      continue;
    }
    item.status = 'downloading';
    send(item, { done: 0, total: item.size });
    const folder = path.join(holder.dir, FOLDERS[item.type]);
    // throttled to ~8 updates a second, with a trailing update so a stalled download shows its real position
    let last = 0;
    let trailing = null;
    const report = (d, t) => {
      clearTimeout(trailing);
      const wait = 120 - (Date.now() - last);
      if (wait <= 0) {
        last = Date.now();
        send(item, { done: d, total: t });
      } else {
        trailing = setTimeout(() => {
          last = Date.now();
          if (item.status === 'downloading') send(item, { done: d, total: t });
        }, wait);
      }
    };
    try {
      const dest = safeJoin(folder, item.filename);
      onProgress?.({ stage: `Downloading ${item.title}`, done: 0, total: item.size });
      await download(item.url, dest, {
        sha1: item.sha1 || undefined,
        size: item.size || undefined,
        signal,
        onProgress: (d, t) => {
          onProgress?.({ stage: `Downloading ${item.title}`, done: d, total: t, bytes: true });
          report(d, t);
        },
      });
      if (signal.aborted) throw Object.assign(new Error('Cancelled'), { cancelled: true });
      const existing = meta.content.find((c) => c.projectId === item.projectId);
      if (existing && existing.file !== item.filename) {
        await fsp.rm(path.join(folder, existing.file), { force: true });
        await fsp.rm(path.join(folder, `${existing.file}.disabled`), { force: true });
      }
      meta.content = meta.content.filter((c) => c.projectId !== item.projectId);
      const record = recordFor(item);
      // A pin is the user's choice for this project, not for one version: keep it.
      record.pinned = Boolean(existing?.pinned);
      meta.content.push(record);
      await holder.save(meta);
      item.status = 'done';
      send(item, { done: item.size, total: item.size });
    } catch (err) {
      if (signal.aborted || err.cancelled || err.name === 'AbortError') {
        item.status = 'cancelled';
        item.error = null;
      } else {
        item.status = 'failed';
        item.error = err.message;
      }
      send(item);
    } finally {
      clearTimeout(trailing);
    }
  }
}

/**
 * Plan and install several projects as one task (one popup).
 * opts: { onProgress, label, rootsFatal, source }
 */
async function installMany(holder, requests, { onProgress, label, rootsFatal = true, source = 'library' } = {}) {
  return withLock(holder.dir, async () => {
    const meta = await holder.load();
    meta.content = meta.content || [];
    const plan = await resolvePlan(holder, requests, meta, { rootsFatal });
    if (!plan.length) return { installed: [], failed: [], blocked: [], cancelled: false, taskId: null };

    const taskId = `install-${Date.now().toString(36)}-${++taskSeq}`;
    const ctl = new AbortController();
    tasks.set(taskId, ctl);
    const target = { kind: holder.kind, id: path.basename(holder.dir) };
    const roots = plan.filter((p) => !p.dependency);
    emitEvent('content:plan', { taskId, target, source, label: label || (roots.length === 1 ? roots[0].title : `${roots.length} items`), items: plan.map(publicItem) });
    try {
      await executePlan(holder, plan, meta, { taskId, signal: ctl.signal, onProgress });
    } finally {
      tasks.delete(taskId);
    }
    const res = {
      taskId,
      installed: plan.filter((p) => p.status === 'done').sort((a, b) => a.dependency - b.dependency).map((p) => p.title),
      failed: plan.filter((p) => p.status === 'failed').map((p) => `${p.title}: ${p.error}`),
      blocked: plan.filter((p) => p.status === 'blocked').map((p) => ({ title: p.title, pageUrl: p.pageUrl, dependency: p.dependency })),
      cancelled: ctl.signal.aborted,
    };
    const state = res.cancelled ? 'cancelled' : res.failed.length || res.blocked.length ? 'partial' : 'done';
    emitEvent('content:progress', { taskId, state, installed: res.installed.length, failed: res.failed, blocked: res.blocked.length });
    const rootFailed = roots.find((p) => p.status === 'failed');
    if (rootsFatal && rootFailed) throw new Error(rootFailed.error);
    return res;
  });
}

/**
 * Install a project (and its required dependencies) into a holder.
 * holder: { kind, dir, mcVersion, loader, load(): meta, save(meta) }
 * item: { projectId, type, versionId?, provider? ('modrinth') }
 */
async function install(holder, { projectId, type, versionId, provider }, onProgress, opts = {}) {
  checkTarget(type, holder);
  return installMany(holder, [{ projectId, type, versionId, provider }], { onProgress, ...opts });
}

// Records from the removed CurseForge source behave like local files now.
const tracked = (rec) => Boolean(rec?.projectId) && rec.provider !== 'curseforge';

/** List content on disk merged with what the launcher knows about it. */
async function list(holder) {
  const meta = await holder.load();
  const records = meta.content || [];
  const types = holder.kind === 'server' ? ['plugin'] : ['mod', 'shader', 'resourcepack'];
  const out = [];
  for (const type of types) {
    const folder = path.join(holder.dir, FOLDERS[type]);
    let files = [];
    try {
      files = await fsp.readdir(folder);
    } catch {
      /* folder not created yet */
    }
    for (const name of files) {
      if (name.endsWith('.part') || name.startsWith('.')) continue;
      const enabled = !name.endsWith('.disabled');
      const file = enabled ? name : name.slice(0, -'.disabled'.length);
      if (type !== 'shader' && type !== 'resourcepack' && !file.endsWith('.jar')) continue;
      const rec = records.find((r) => r.file === file && r.type === type);
      out.push({ type, file, enabled, title: rec?.title || file, icon: rec?.icon || null, projectId: tracked(rec) ? rec.projectId : null, provider: tracked(rec) ? 'modrinth' : null, versionNumber: rec?.versionNumber || null, pinned: Boolean(rec?.pinned) });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

async function remove(holder, { type, file }) {
  return withLock(holder.dir, async () => {
    const folder = path.join(holder.dir, FOLDERS[type]);
    await fsp.rm(safeJoin(folder, file), { force: true, recursive: true });
    await fsp.rm(safeJoin(folder, `${file}.disabled`), { force: true, recursive: true });
    const meta = await holder.load();
    meta.content = (meta.content || []).filter((c) => !(c.file === file && c.type === type));
    await holder.save(meta);
  });
}

async function setEnabled(holder, { type, file, enabled }) {
  const folder = path.join(holder.dir, FOLDERS[type]);
  const on = safeJoin(folder, file);
  const off = safeJoin(folder, `${file}.disabled`);
  if (enabled && fs.existsSync(off)) await fsp.rename(off, on);
  if (!enabled && fs.existsSync(on)) await fsp.rename(on, off);
}

/** Pin (or unpin) a tracked mod so update checks skip it: the user keeps their version on purpose. */
async function setPinned(holder, { type, file, pinned }) {
  return withLock(holder.dir, async () => {
    const meta = await holder.load();
    const rec = (meta.content || []).find((c) => c.file === file && c.type === type);
    if (!tracked(rec)) throw new Error('Only mods installed from the library can be pinned.');
    rec.pinned = Boolean(pinned);
    await holder.save(meta);
    return rec.pinned;
  });
}

/** Find newer compatible versions of tracked mods/plugins. Pinned ones stay untouched on purpose. */
async function checkUpdates(holder) {
  const meta = await holder.load();
  const candidates = (meta.content || []).filter((c) => !c.pinned && (c.type === 'mod' || c.type === 'plugin'));
  const updates = [];
  // Records left over from the removed CurseForge source are treated as local files.
  const items = candidates.filter((c) => c.sha1 && c.provider !== 'curseforge');
  const byType = {};
  for (const c of items) (byType[c.type] = byType[c.type] || []).push(c);
  for (const [type, group] of Object.entries(byType)) {
    const latest = await modrinth.latestForHashes(
      group.map((c) => c.sha1),
      { loaders: loadersFor(type, holder), gameVersions: [holder.mcVersion] },
    );
    for (const c of group) {
      const v = latest[c.sha1];
      if (v && v.id !== c.versionId) updates.push({ ...c, newVersionId: v.id, newVersionNumber: v.version_number });
    }
  }
  return updates;
}

async function applyUpdates(holder, updates, onProgress) {
  if (!updates.length) return { updated: 0, failed: [] };
  const label = updates.length === 1 ? `Updating ${updates[0].title}` : `Updating ${updates.length} mods`;
  const res = await installMany(
    holder,
    updates.map((u) => ({ provider: u.provider, projectId: u.projectId, type: u.type, versionId: u.newVersionId, title: u.title })),
    { onProgress, label, source: 'update' },
  );
  return { updated: updates.length, failed: res.failed };
}

// ---------------------------------------------------------------- features --

async function featureState(holder) {
  if (holder.kind === 'server') return [];
  const meta = await holder.load();
  const installedIds = new Set((meta.content || []).filter((c) => c.type === 'mod').map((c) => c.projectId));
  let enabledFiles = new Set();
  try {
    enabledFiles = new Set(await fsp.readdir(path.join(holder.dir, 'mods')));
  } catch {
    /* none */
  }
  let resolved = [];
  try {
    resolved = await resolveSlugs([...new Set(FEATURES.flatMap((f) => f.projects))]);
  } catch {
    /* offline */
  }
  const idOf = Object.fromEntries([...slugIds.entries()].map(([slug, v]) => [slug, v.id]));
  return FEATURES.map((f) => {
    if (f.custom) {
      const available = Boolean(clientJar(holder.mcVersion, holder.loader));
      const note = available ? null : CLIENT_LOADERS.includes(holder.loader) ? `Runs on Minecraft ${clientRange()}` : 'Needs Fabric or Quilt';
      return { id: f.id, name: f.name, icon: f.icon, desc: f.desc, enabled: enabledFiles.has(CLIENT_FILE), available, custom: true, note };
    }
    const ids = f.projects.map((s) => idOf[s]).filter(Boolean);
    const on =
      ids.length > 0 &&
      ids.every((id) => {
        if (!installedIds.has(id)) return false;
        const rec = meta.content.find((c) => c.projectId === id);
        return enabledFiles.has(rec.file);
      });
    return { id: f.id, name: f.name, icon: f.icon, desc: f.desc, enabled: on, available: resolved.length > 0 };
  });
}

async function setFeature(holder, featureId, enabled, onProgress) {
  const feature = FEATURES.find((f) => f.id === featureId);
  if (!feature) throw new Error('Unknown feature');
  if (feature.custom) return setPimpinClient(holder, enabled, onProgress);
  const projects = await resolveSlugs(feature.projects);
  const failed = [];
  if (enabled) {
    const requests = [];
    for (const p of projects) {
      const meta = await holder.load();
      const rec = (meta.content || []).find((c) => c.projectId === p.id);
      const modsDir = path.join(holder.dir, 'mods');
      // the record can outlive its jar if someone deleted it by hand; reinstall then
      if (rec && (fs.existsSync(path.join(modsDir, rec.file)) || fs.existsSync(path.join(modsDir, `${rec.file}.disabled`)))) {
        await setEnabled(holder, { type: 'mod', file: rec.file, enabled: true });
        continue;
      }
      requests.push({ provider: 'modrinth', projectId: p.id, type: 'mod', title: p.title });
    }
    if (requests.length) {
      // one task for the whole feature, so the popup lists everything it brings
      try {
        const res = await installMany(holder, requests, { onProgress, label: feature.name, rootsFatal: false, source: 'feature' });
        failed.push(...res.failed);
      } catch (err) {
        failed.push(`${feature.name}: ${err.message}`);
      }
    }
  } else {
    const meta = await holder.load();
    for (const p of projects) {
      const rec = (meta.content || []).find((c) => c.projectId === p.id);
      if (rec) await remove(holder, { type: 'mod', file: rec.file });
    }
  }
  return { failed };
}

/** Identify a manually added file by hash so it shows a proper name/icon. */
async function identifyLocal(holder) {
  const items = await list(holder);
  const untracked = items.filter((i) => !i.projectId);
  if (!untracked.length) return 0;
  const hashes = {};
  for (const i of untracked) {
    const p = path.join(holder.dir, FOLDERS[i.type], i.enabled ? i.file : `${i.file}.disabled`);
    try {
      hashes[await sha1File(p)] = i;
    } catch {
      /* folders (unzipped shader packs) */
    }
  }
  const found = await modrinth.versionsForHashes(Object.keys(hashes));
  const projects = await modrinth.getProjects([...new Set(Object.values(found).map((v) => v.project_id))]);
  return withLock(holder.dir, async () => {
    const meta = await holder.load();
    meta.content = meta.content || [];
    for (const [hash, version] of Object.entries(found)) {
      const item = hashes[hash];
      const file = version.files.find((f) => f.hashes.sha1 === hash) || { filename: item.file, hashes: { sha1: hash } };
      const rec = toRecord(item.type, version, { ...file, filename: item.file }, projects.find((p) => p.id === version.project_id));
      // also replaces a stale record for the same file (e.g. one from the removed CurseForge source)
      meta.content = meta.content.filter((c) => c.projectId !== rec.projectId && !(c.type === rec.type && c.file === rec.file));
      meta.content.push(rec);
    }
    await holder.save(meta);
    return Object.keys(found).length;
  });
}

module.exports = {
  FEATURES,
  FOLDERS,
  install,
  installMany,
  resolvePlan,
  setEmitter,
  cancel,
  list,
  remove,
  setEnabled,
  setPinned,
  checkUpdates,
  applyUpdates,
  featureState,
  setFeature,
  identifyLocal,
  resolveSlugs,
  clientJar,
  clientRange,
  refreshPimpinClient,
};
