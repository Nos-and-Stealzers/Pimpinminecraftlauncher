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
    await install(holder, { projectId: 'fabric-api', type: 'mod' }, onProgress);
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

/**
 * Install a project (and its required dependencies) into a holder.
 * holder: { kind, dir, mcVersion, loader, load(): meta, save(meta) }
 */
async function install(holder, { projectId, type, versionId }, onProgress) {
  checkTarget(type, holder);
  return withLock(holder.dir, async () => {
    const installed = [];
    const seen = new Set();
    const meta = await holder.load();
    meta.content = meta.content || [];

    const installOne = async (pid, vid, kind) => {
      if (pid && seen.has(pid)) return;
      const version = vid ? await modrinth.getVersion(vid) : await pickVersion(pid, kind, holder);
      pid = version.project_id;
      if (seen.has(pid)) return;
      seen.add(pid);

      const existing = meta.content.find((c) => c.projectId === pid);
      const folder = path.join(holder.dir, FOLDERS[kind]);
      const onDisk = existing && (fs.existsSync(path.join(folder, existing.file)) || fs.existsSync(path.join(folder, `${existing.file}.disabled`)));
      if (onDisk && existing.versionId === version.id && !vid) return;

      const file = version.files.find((f) => f.primary) || version.files[0];
      const dest = safeJoin(folder, file.filename);
      const project = await modrinth.getProject(pid).catch(() => null);
      onProgress?.({ stage: `Downloading ${project?.title || file.filename}`, done: 0, total: file.size });
      await download(file.url, dest, {
        sha1: file.hashes?.sha1,
        size: file.size,
        onProgress: (d, t) => onProgress?.({ stage: `Downloading ${project?.title || file.filename}`, done: d, total: t, bytes: true }),
      });
      if (existing && existing.file !== file.filename) {
        await fsp.rm(path.join(folder, existing.file), { force: true });
        await fsp.rm(path.join(folder, `${existing.file}.disabled`), { force: true });
      }
      meta.content = meta.content.filter((c) => c.projectId !== pid);
      meta.content.push(toRecord(kind, version, file, project));
      installed.push(project?.title || file.filename);

      if (kind === 'mod' || kind === 'plugin') {
        for (const dep of version.dependencies || []) {
          if (dep.dependency_type !== 'required') continue;
          if (dep.project_id && meta.content.some((c) => c.projectId === dep.project_id)) continue;
          try {
            await installOne(dep.project_id, dep.project_id ? null : dep.version_id, kind);
          } catch (err) {
            console.warn(`Dependency ${dep.project_id || dep.version_id} failed: ${err.message}`);
          }
        }
      }
    };

    await installOne(projectId, versionId, type);

    // Shader packs need Iris (which pulls in Sodium as a dependency).
    if (type === 'shader') {
      const [iris] = await resolveSlugs(['iris']);
      if (iris && !meta.content.some((c) => c.projectId === iris.id)) {
        await installOne(iris.id, null, 'mod');
      }
    }

    await holder.save(meta);
    return { installed };
  });
}

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
      out.push({ type, file, enabled, title: rec?.title || file, icon: rec?.icon || null, projectId: rec?.projectId || null, versionNumber: rec?.versionNumber || null });
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

/** Find newer compatible versions of tracked mods/plugins. */
async function checkUpdates(holder) {
  const meta = await holder.load();
  const items = (meta.content || []).filter((c) => c.sha1 && (c.type === 'mod' || c.type === 'plugin'));
  const byType = {};
  for (const c of items) (byType[c.type] = byType[c.type] || []).push(c);
  const updates = [];
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
  for (const u of updates) {
    await install(holder, { projectId: u.projectId, type: u.type, versionId: u.newVersionId }, onProgress);
  }
  return { updated: updates.length };
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
    for (const p of projects) {
      const meta = await holder.load();
      const rec = (meta.content || []).find((c) => c.projectId === p.id);
      const modsDir = path.join(holder.dir, 'mods');
      // the record can outlive its jar if someone deleted it by hand; reinstall then
      if (rec && (fs.existsSync(path.join(modsDir, rec.file)) || fs.existsSync(path.join(modsDir, `${rec.file}.disabled`)))) {
        await setEnabled(holder, { type: 'mod', file: rec.file, enabled: true });
        continue;
      }
      try {
        await install(holder, { projectId: p.id, type: 'mod' }, onProgress);
      } catch (err) {
        failed.push(`${p.title}: ${err.message}`);
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
      meta.content = meta.content.filter((c) => c.projectId !== rec.projectId);
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
  list,
  remove,
  setEnabled,
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
