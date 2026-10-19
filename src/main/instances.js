// Instances: separate game folders with their own version, loader, mods,
// shaders and resource packs. Also runs the game and installs modpacks.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
const AdmZip = require('adm-zip');
const { dirs, readJson, writeJson, uniqueDir, safeJoin, getSettings, updateSettings } = require('./store');
const minecraft = require('./minecraft');
const content = require('./content');
const modrinth = require('./modrinth');
const auth = require('./auth');
const { download, pool } = require('./net');

const META = 'pimpin-instance.json';
const LOADER_NAMES = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt' };
const running = new Map(); // id -> { child, started }
const logs = new Map(); // id -> string[]
const lastRun = new Map(); // id -> { started, code }
let emit = () => {};

function setEmitter(fn) {
  emit = fn;
}

function dirOf(id) {
  return safeJoin(dirs.instances, id);
}

async function get(id) {
  const meta = await readJson(path.join(dirOf(id), META), null);
  if (!meta) throw new Error('Instance not found');
  return { ...meta, id, running: running.has(id) };
}

async function save(id, meta) {
  const { running: _r, ...clean } = meta;
  await writeJson(path.join(dirOf(id), META), { ...clean, id });
}

function holder(meta) {
  return {
    kind: 'instance',
    dir: dirOf(meta.id),
    mcVersion: meta.mcVersion,
    loader: meta.loader,
    load: () => get(meta.id),
    save: (m) => save(meta.id, m),
  };
}

async function list() {
  const out = [];
  for (const id of await fsp.readdir(dirs.instances).catch(() => [])) {
    const meta = await readJson(path.join(dirs.instances, id, META), null);
    if (meta) out.push({ ...meta, id, running: running.has(id), content: undefined, contentCount: (meta.content || []).length });
  }
  return out.sort((a, b) => (b.lastPlayed || b.created || 0) - (a.lastPlayed || a.created || 0));
}

async function create({ name, mcVersion, loader = 'fabric', loaderVersion = null, icon = 'violet', essentials = false, iconUrl = null }) {
  if (!mcVersion) throw new Error('Pick a Minecraft version');
  const id = uniqueDir(dirs.instances, name || `${loader}-${mcVersion}`);
  const meta = {
    id,
    name: name || `${LOADER_NAMES[loader] || loader} ${mcVersion}`,
    mcVersion,
    loader,
    loaderVersion,
    icon,
    iconUrl,
    created: Date.now(),
    lastPlayed: 0,
    playTime: 0,
    content: [],
  };
  for (const sub of ['mods', 'shaderpacks', 'resourcepacks', 'saves']) {
    await fsp.mkdir(path.join(dirOf(id), sub), { recursive: true });
  }
  await save(id, meta);
  if (!getSettings().lastInstance) await updateSettings({ lastInstance: id });
  if (essentials && loader !== 'vanilla') {
    // Install in the background so the UI isn't blocked.
    (async () => {
      for (const f of ['fps', 'zoom', 'modmenu']) {
        await content.setFeature(holder(meta), f, true, (p) => emit('task:progress', { id, ...p })).catch(() => {});
      }
      emit('instances:changed');
      emit('toast', { kind: 'ok', text: `Pimpin Essentials installed in ${meta.name}` });
    })();
  }
  return get(id);
}

async function update(id, patch) {
  const meta = await get(id);
  const allowed = ['name', 'icon', 'mcVersion', 'loader', 'loaderVersion', 'memoryMax', 'memoryMin', 'jvmArgs', 'javaPath', 'width', 'height', 'notes'];
  for (const k of allowed) if (k in patch) meta[k] = patch[k];
  if ('mcVersion' in patch || 'loader' in patch) {
    if (!('loaderVersion' in patch)) meta.loaderVersion = null;
  }
  await save(id, meta);
  return get(id);
}

async function remove(id) {
  if (running.has(id)) throw new Error('Close the game before deleting this instance.');
  await fsp.rm(dirOf(id), { recursive: true, force: true });
  if (getSettings().lastInstance === id) await updateSettings({ lastInstance: null });
  return list();
}

function pushLog(id, line) {
  line = line.replace(/\x1b\[[0-9;]*m/g, '');
  const buf = logs.get(id) || [];
  buf.push(line);
  if (buf.length > 3000) buf.splice(0, buf.length - 3000);
  logs.set(id, buf);
  emit('game:log', { id, line });
}

async function launch(id, { server, world } = {}) {
  if (running.has(id)) throw new Error('This instance is already running.');
  const meta = await get(id);
  const settings = getSettings();
  logs.set(id, []);
  emit('game:state', { id, state: 'preparing' });
  try {
    const account = await auth.getLaunchAccount(settings.activeAccount);
    const { child, loaderVersion } = await minecraft.launch(
      {
        instance: meta,
        account,
        settings,
        gameDir: dirOf(id),
        server,
        world,
        javaPath: meta.javaPath || settings.javaPath || null,
      },
      {
        progress: (p) => emit('game:progress', { id, ...p }),
        log: (line) => pushLog(id, line),
      },
    );
    const started = Date.now();
    running.set(id, { child, started });
    // Attach listeners before any await: a JVM that fails fast (bad flag,
    // wrong Java) can exit within milliseconds.
    const parse = log4jParser((line) => pushLog(id, line));
    const onData = (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) parse(line);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => pushLog(id, `[Pimpin] Failed to start java: ${err.message}`));
    child.on('close', async (code) => {
      running.delete(id);
      lastRun.set(id, { started, code });
      pushLog(id, `[Pimpin] Game exited with code ${code}`);
      try {
        const m = await get(id);
        m.playTime = (m.playTime || 0) + Math.round((Date.now() - started) / 1000);
        await save(id, m);
      } catch {
        /* instance deleted */
      }
      emit('game:state', { id, state: 'stopped', code, crashed: code !== 0 && code !== null });
    });
    emit('game:state', { id, state: 'running' });

    meta.lastPlayed = started;
    if (loaderVersion && !meta.loaderVersion) meta.loaderVersion = loaderVersion;
    await save(id, meta);
    await updateSettings({ lastInstance: id });
    return { ok: true };
  } catch (err) {
    pushLog(id, `[Pimpin] ${err.stack || err.message}`);
    emit('game:state', { id, state: 'stopped', error: err.message });
    throw err;
  }
}

/**
 * The official log config prints XML events (meant for launchers). Turn them
 * back into readable "[12:00:00] [Render thread/INFO]: message" lines.
 */
function log4jParser(push) {
  let ev = null;
  return (line) => {
    const start = line.match(/<log4j:Event logger="[^"]*" timestamp="(\d+)" level="(\w+)" thread="([^"]*)">/);
    if (start) {
      const time = new Date(Number(start[1])).toTimeString().slice(0, 8);
      ev = { prefix: `[${time}] [${start[3]}/${start[2]}]: `, lines: [] };
      return;
    }
    if (!ev) return push(line);
    if (line.includes('</log4j:Event>')) {
      const [first = '', ...rest] = ev.lines;
      push(ev.prefix + first);
      rest.forEach((l) => push(l));
      ev = null;
      return;
    }
    const text = line
      .replace(/<log4j:(Message|Throwable)><!\[CDATA\[/g, '')
      .replace(/\]\]><\/log4j:(Message|Throwable)>/g, '')
      .replace(/<\/?log4j:(Message|Throwable)>/g, '');
    if (text.trim()) ev.lines.push(ev.lines.length ? text : text.trim());
  };
}

function kill(id) {
  const r = running.get(id);
  if (r) r.child.kill();
}

/** Copy an instance (worlds, mods and settings included) under a new name. */
async function duplicate(id) {
  if (running.has(id)) throw new Error('Close the game before duplicating this instance.');
  const meta = await get(id);
  const name = `${meta.name} (copy)`;
  const newId = uniqueDir(dirs.instances, name);
  await fsp.cp(dirOf(id), dirOf(newId), {
    recursive: true,
    filter: (src) => !/[\\/](logs|crash-reports)$/.test(src),
  });
  await save(newId, { ...meta, id: newId, name, created: Date.now(), lastPlayed: 0, playTime: 0 });
  return get(newId);
}

async function worlds(id) {
  const saves = path.join(dirOf(id), 'saves');
  const out = [];
  for (const folder of await fsp.readdir(saves).catch(() => [])) {
    const dir = path.join(saves, folder);
    const level = path.join(dir, 'level.dat');
    const st = await fsp.stat(level).catch(() => null);
    if (!st) continue;
    const iconPath = path.join(dir, 'icon.png');
    out.push({
      folder,
      lastPlayed: st.mtimeMs,
      icon: fs.existsSync(iconPath) ? `${pathToFileURL(iconPath).href}?t=${Math.round(st.mtimeMs)}` : null,
    });
  }
  return out.sort((a, b) => b.lastPlayed - a.lastPlayed);
}

async function screenshots(id) {
  const dir = path.join(dirOf(id), 'screenshots');
  const out = [];
  for (const name of await fsp.readdir(dir).catch(() => [])) {
    if (!/\.(png|jpe?g)$/i.test(name)) continue;
    const st = await fsp.stat(path.join(dir, name)).catch(() => null);
    if (st) out.push({ name, url: pathToFileURL(path.join(dir, name)).href, time: st.mtimeMs });
  }
  return out.sort((a, b) => b.time - a.time);
}

async function deleteScreenshot(id, name) {
  await fsp.rm(safeJoin(path.join(dirOf(id), 'screenshots'), name), { force: true });
}

/** Explain why the last run crashed: log tail, crash report and known causes. */
async function crashInfo(id) {
  const run = lastRun.get(id) || { started: 0, code: null };
  const lines = getLogs(id);
  let report = null;
  const crashDir = path.join(dirOf(id), 'crash-reports');
  const files = await fsp.readdir(crashDir).catch(() => []);
  let newest = null;
  for (const f of files) {
    const st = await fsp.stat(path.join(crashDir, f)).catch(() => null);
    if (st && st.mtimeMs >= run.started - 1000 && (!newest || st.mtimeMs > newest.time)) newest = { file: f, time: st.mtimeMs };
  }
  if (newest) {
    const text = await fsp.readFile(path.join(crashDir, newest.file), 'utf8').catch(() => '');
    report = { file: newest.file, description: (text.match(/^Description: (.*)$/m) || [])[1] || null, head: text.split(/\r?\n/).slice(0, 40).join('\n') };
  }
  const all = lines.join('\n');
  const hints = [];
  if (/Incompatible mods? found|Mod resolution (failed|encountered)/i.test(all)) {
    const m = all.match(/(?:Incompatible mods? found|Mod resolution encountered)[\s\S]{0,900}/i);
    hints.push({ title: 'Some mods are incompatible', text: m ? m[0].split('\n').slice(0, 10).join('\n') : '' });
  }
  if (/Unrecognized VM option|Unrecognized option|Invalid maximum heap size/.test(all)) {
    hints.push({ title: 'Invalid Java arguments', text: 'Clear the JVM arguments in this instance\'s settings (or reset them in Settings → Java & memory).' });
  }
  if (/Could not reserve enough space|Cannot allocate memory/.test(all)) {
    hints.push({ title: 'Not enough free memory', text: 'Lower the memory slider — your PC could not give Minecraft that much RAM.' });
  }
  if (/OutOfMemoryError/.test(all)) hints.push({ title: 'Minecraft ran out of memory', text: 'Give it more RAM in Settings → Java & memory (or in this instance\'s settings).' });
  if (/UnsupportedClassVersionError/.test(all)) hints.push({ title: 'Wrong Java version', text: 'Clear the custom Java path so the launcher can pick the right Java automatically.' });
  if (/Failed to create backend|GLFW error|Pixel format not accelerated|No OpenGL context/i.test(all)) {
    hints.push({ title: 'Graphics driver problem', text: 'Update your graphics drivers (NVIDIA / AMD / Intel). On laptops, make sure Minecraft uses the dedicated GPU.' });
  }
  return { code: run.code, tail: lines.slice(-60), report, hints };
}

function getLogs(id) {
  return logs.get(id) || [];
}

function isAnyRunning() {
  return running.size > 0;
}

/** Install a Modrinth modpack (.mrpack) as a brand new instance. */
async function installModpack({ projectId, versionId }) {
  const project = await modrinth.getProject(projectId);
  let version;
  if (versionId) version = await modrinth.getVersion(versionId);
  else {
    const versions = await modrinth.getVersions(projectId, { loaders: ['fabric', 'quilt'] });
    version = versions.find((v) => v.version_type === 'release') || versions[0];
  }
  if (!version) throw new Error('This modpack has no Fabric or Quilt version.');
  const file = version.files.find((f) => f.primary) || version.files[0];
  const packFile = path.join(dirs.cache, `${version.id}.mrpack`);
  const progress = (p) => emit('task:progress', { id: 'modpack', ...p });
  await download(file.url, packFile, { sha1: file.hashes?.sha1, onProgress: (d, t) => progress({ stage: `Downloading ${project.title}`, done: d, total: t, bytes: true }) });

  const zip = new AdmZip(packFile);
  const index = JSON.parse(zip.readAsText('modrinth.index.json'));
  const deps = index.dependencies || {};
  if (deps.forge || deps.neoforge) throw new Error('Forge / NeoForge modpacks are not supported yet. Pick a Fabric or Quilt pack.');
  const loader = deps['quilt-loader'] ? 'quilt' : deps['fabric-loader'] ? 'fabric' : 'vanilla';

  const inst = await create({
    name: project.title,
    mcVersion: deps.minecraft,
    loader,
    loaderVersion: deps['quilt-loader'] || deps['fabric-loader'] || null,
    icon: 'pack',
    iconUrl: project.icon_url,
  });
  const dir = dirOf(inst.id);
  const files = index.files.filter((f) => f.env?.client !== 'unsupported');
  let done = 0;
  await pool(files, 8, async (f) => {
    const dest = safeJoin(dir, f.path);
    await download(f.downloads[0], dest, { sha1: f.hashes?.sha1, size: f.fileSize });
    progress({ stage: `Installing ${project.title}`, done: ++done, total: files.length });
  });
  for (const entry of zip.getEntries()) {
    for (const prefix of ['overrides/', 'client-overrides/']) {
      if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue;
      const dest = safeJoin(dir, entry.entryName.slice(prefix.length));
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, entry.getData());
    }
  }
  await fsp.rm(packFile, { force: true });
  const meta = await get(inst.id);
  meta.modpack = { projectId, versionId: version.id, versionNumber: version.version_number };
  await save(inst.id, meta);
  // Give the pack's files proper names/icons in the content list.
  await content.identifyLocal(holder(meta)).catch(() => {});
  return get(inst.id);
}

module.exports = {
  setEmitter,
  list,
  get,
  create,
  update,
  remove,
  launch,
  kill,
  getLogs,
  isAnyRunning,
  holder: async (id) => holder(await get(id)),
  dirOf,
  installModpack,
  duplicate,
  worlds,
  screenshots,
  deleteScreenshot,
  crashInfo,
};
