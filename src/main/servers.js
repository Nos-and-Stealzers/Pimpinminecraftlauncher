// Local Minecraft servers (Paper, Purpur or Vanilla) with plugins from the
// library. Lets players spin up a server for friends / testing, tweak its
// properties, manage players, back up worlds and join it in one click.
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { dirs, readJson, writeJson, uniqueDir, safeJoin } = require('./store');
const { getJson, download } = require('./net');
const { ensureJava, consoleJava } = require('./java');
const minecraft = require('./minecraft');

const FILL = 'https://fill.papermc.io/v3/projects/paper';
const PURPUR = 'https://api.purpurmc.org/v2/purpur';
const META = 'pimpin-server.json';
const SOFTWARE = {
  paper: { name: 'Paper', plugins: true },
  purpur: { name: 'Purpur', plugins: true },
  vanilla: { name: 'Vanilla', plugins: false },
};
const PLAYER_NAME = /^\.?[A-Za-z0-9_]{1,20}$/; // the dot is for Geyser/Floodgate bedrock players
const LOG_LIMIT = 3000;

const running = new Map(); // id -> { child, started, ready, stopping }
const logs = new Map();
const players = new Map(); // id -> Set of online player names
const crashes = new Map(); // id -> timestamps of recent auto-restarts
const waiters = new Map(); // id -> Set of { re, resolve }, see waitForLog
let emit = () => {};

function setEmitter(fn) {
  emit = fn;
}

function dirOf(id) {
  return safeJoin(dirs.servers, id);
}

async function versions(software = 'paper') {
  if (software === 'purpur') {
    const purpur = await getJson(PURPUR);
    return [...purpur.versions].reverse();
  }
  if (software === 'vanilla') {
    const manifest = await minecraft.getVersionManifest();
    // Mojang's server jars are reliable from 1.8 onwards.
    return manifest.versions.filter((v) => v.type === 'release' && v.releaseTime >= '2014-09-02').map((v) => v.id);
  }
  // Fill groups versions by major: { "1.21": ["1.21.1", ...] }
  const paper = await getJson(FILL);
  return Object.values(paper.versions)
    .flat()
    .filter((v) => !/(pre|rc|snapshot)/i.test(v));
}

function status(id) {
  const r = running.get(id);
  return {
    running: Boolean(r),
    ready: Boolean(r?.ready),
    started: r?.started || null,
    online: [...(players.get(id) || [])],
  };
}

// Servers made before Purpur/Vanilla support have no `software` field.
async function get(id) {
  const meta = await readJson(path.join(dirOf(id), META), null);
  if (!meta) throw new Error('Server not found');
  return { software: 'paper', ...meta, id, ...status(id) };
}

async function save(id, meta) {
  // strip the live status that get() mixes in
  const { running: _r, ready: _re, started: _s, online: _o, ...clean } = meta;
  await writeJson(path.join(dirOf(id), META), { ...clean, id });
}

function holder(meta) {
  return {
    kind: 'server',
    dir: dirOf(meta.id),
    mcVersion: meta.mcVersion,
    loader: meta.software,
    load: () => get(meta.id),
    save: (m) => save(meta.id, m),
  };
}

async function list() {
  const out = [];
  for (const id of await fsp.readdir(dirs.servers).catch(() => [])) {
    const meta = await readJson(path.join(dirs.servers, id, META), null);
    if (meta) out.push({ software: 'paper', ...meta, id, ...status(id), content: undefined, pluginCount: (meta.content || []).length });
  }
  return out.sort((a, b) => (b.created || 0) - (a.created || 0));
}

async function create({ name, mcVersion, software = 'paper', memory = 2048, port = 25565, properties = {} }) {
  if (!mcVersion) throw new Error('Pick a server version');
  if (!Object.hasOwn(SOFTWARE, software)) throw new Error('Unknown server software');
  const { name: label, plugins } = SOFTWARE[software];
  const id = uniqueDir(dirs.servers, name || `${software} ${mcVersion}`);
  const meta = { id, name: name || `${label} ${mcVersion}`, mcVersion, software, memory, port, eulaAccepted: false, autoRestart: false, created: Date.now(), content: [] };
  await fsp.mkdir(path.join(dirOf(id), plugins ? 'plugins' : 'world'), { recursive: true });
  await save(id, meta);
  if (Object.keys(properties).length) await setProperties(id, properties);
  return get(id);
}

async function update(id, patch) {
  const meta = await get(id);
  for (const k of ['name', 'memory', 'port', 'eulaAccepted', 'mcVersion', 'software', 'autoRestart', 'jvmArgs']) if (k in patch) meta[k] = patch[k];
  if (!Object.hasOwn(SOFTWARE, meta.software)) throw new Error('Unknown server software');
  // different jar now, make ensureJar fetch it on next start
  if ('mcVersion' in patch || 'software' in patch) meta.build = null;
  await save(id, meta);
  return get(id);
}

async function remove(id) {
  if (running.has(id)) throw new Error('Stop the server first.');
  await fsp.rm(dirOf(id), { recursive: true, force: true });
  return list();
}

function trackPlayers(id, line) {
  const online = players.get(id) || new Set();
  players.set(id, online);
  const joined = line.match(/\]: (\.?[A-Za-z0-9_]{1,20}) joined the game/);
  const left = line.match(/\]: (\.?[A-Za-z0-9_]{1,20}) left the game/);
  let changed = false;
  if (joined && !online.has(joined[1])) {
    online.add(joined[1]);
    changed = true;
  }
  if (left && online.delete(left[1])) changed = true;
  if (changed) emit('server:players', { id, online: [...online] });
}

function pushLog(id, line) {
  line = line.replace(/\x1b\[[0-9;]*m/g, ''); // colour codes from the console
  const buf = logs.get(id) || [];
  buf.push(line);
  if (buf.length > LOG_LIMIT) buf.splice(0, buf.length - LOG_LIMIT);
  logs.set(id, buf);
  trackPlayers(id, line);

  const r = running.get(id);
  if (r && !r.ready && /\]: Done \([\d.,]+s\)!/.test(line)) {
    r.ready = true;
    emit('server:state', { id, state: 'running', ready: true });
  }
  for (const w of waiters.get(id) || []) if (w.re.test(line)) w.resolve(true);
  emit('server:log', { id, line });
}

// Resolves true when a matching line shows up, false after `ms`.
function waitForLog(id, re, ms) {
  return new Promise((resolve) => {
    const set = waiters.get(id) || new Set();
    waiters.set(id, set);
    const w = {
      re,
      resolve: (v) => {
        clearTimeout(timer);
        set.delete(w);
        resolve(v);
      },
    };
    const timer = setTimeout(() => w.resolve(false), ms);
    set.add(w);
  });
}

// Downloads the server jar when the build changed. Mutates meta.build, the
// caller saves it.
async function ensureJar(meta, progress) {
  const { software } = meta;
  const jar = path.join(dirOf(meta.id), `${software}.jar`);
  const fetchJar = (url, label, opts = {}) =>
    download(url, jar, { ...opts, onProgress: (d, t) => progress({ stage: label, done: d, total: t, bytes: true }) });

  if (software === 'vanilla') {
    const vanilla = await minecraft.getVanillaJson(meta.mcVersion);
    const dl = vanilla.downloads?.server;
    if (!dl) throw new Error(`Mojang has no server download for ${meta.mcVersion}`);
    await fetchJar(dl.url, `Minecraft server ${meta.mcVersion}`, { sha1: dl.sha1, size: dl.size });
    return jar;
  }
  if (software === 'purpur') {
    const base = `${PURPUR}/${encodeURIComponent(meta.mcVersion)}`;
    const build = (await getJson(base)).builds.latest;
    // compare as strings, Purpur's API isn't consistent about the type
    if (String(meta.build) !== String(build) || !fs.existsSync(jar)) {
      await fetchJar(`${base}/${build}/download`, `Purpur ${meta.mcVersion} #${build}`, { force: true });
      meta.build = build;
    }
    return jar;
  }
  const build = await getJson(`${FILL}/versions/${encodeURIComponent(meta.mcVersion)}/builds/latest`);
  const dl = build.downloads['server:default'];
  if (meta.build !== build.id || !fs.existsSync(jar)) {
    await fetchJar(dl.url, `Paper ${meta.mcVersion} #${build.id}`, { force: true, size: dl.size });
    meta.build = build.id;
  }
  return jar;
}

// server.properties only exists after the first start, so missing = empty.
const propertiesFile = (id) => path.join(dirOf(id), 'server.properties');
const readPropertiesText = (id) => fsp.readFile(propertiesFile(id), 'utf8').catch(() => '');

async function readProperties(id) {
  const props = {};
  for (const line of (await readPropertiesText(id)).split(/\r?\n/)) {
    const m = line.match(/^\s*([^#!=\s][^=]*?)\s*=(.*)$/);
    if (m) props[m[1]] = m[2];
  }
  return props;
}

// Edits lines in place so the server's comments and key order survive.
async function setProperties(id, patch) {
  let text = await readPropertiesText(id);
  for (const [key, raw] of Object.entries(patch || {})) {
    if (!/^[a-z0-9.\-_]+$/i.test(key)) throw new Error(`Invalid property ${key}`);
    const value = String(raw ?? '').replace(/[\r\n]/g, ' ');
    const re = new RegExp(`^${key.replace(/[.\-]/g, '\\$&')}=.*$`, 'm');
    if (re.test(text)) {
      text = text.replace(re, () => `${key}=${value}`); // fn so a "$" in the value stays literal
    } else {
      if (text && !text.endsWith('\n')) text += '\n';
      text += `${key}=${value}\n`;
    }
  }
  await fsp.writeFile(propertiesFile(id), text);
  return readProperties(id);
}

async function start(id) {
  if (running.has(id)) throw new Error('Server is already running.');
  const meta = await get(id);
  if (!meta.eulaAccepted) throw new Error('You need to accept the Minecraft EULA first.');
  const dir = dirOf(id);
  const progress = (p) => emit('server:progress', { id, ...p });
  logs.set(id, []);
  players.set(id, new Set());
  emit('server:state', { id, state: 'preparing' });
  try {
    // Offline is fine as long as some jar was downloaded before.
    let jar;
    try {
      jar = await ensureJar(meta, progress);
    } catch (err) {
      jar = path.join(dir, `${meta.software}.jar`);
      if (!fs.existsSync(jar)) throw err;
    }
    const vanilla = await minecraft.getVanillaJson(meta.mcVersion);
    const java = consoleJava(await ensureJava(vanilla.javaVersion, progress));
    await fsp.writeFile(path.join(dir, 'eula.txt'), 'eula=true\n');
    await setProperties(id, { 'server-port': meta.port });
    await save(id, meta);

    const extra = (meta.jvmArgs || '').split(/\s+/).filter(Boolean);
    const args = [`-Xmx${meta.memory}M`, `-Xms${Math.min(1024, meta.memory)}M`, ...extra, '-jar', jar, 'nogui'];
    pushLog(id, `[Pimpin] ${java} ${args.join(' ')}`);
    const child = spawn(java, args, { cwd: dir, windowsHide: true });
    const entry = { child, started: Date.now(), ready: false, stopping: false };
    running.set(id, entry);
    emit('server:state', { id, state: 'running' });
    const onData = (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) pushLog(id, line);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => pushLog(id, `[Pimpin] ${err.message}`));
    child.on('close', (code) => {
      running.delete(id);
      players.set(id, new Set());
      pushLog(id, `[Pimpin] Server stopped (code ${code})`);
      emit('server:state', { id, state: 'stopped', code });
      if (!entry.stopping && code !== 0) maybeRestart(id);
    });
    return { ok: true };
  } catch (err) {
    pushLog(id, `[Pimpin] ${err.message}`);
    emit('server:state', { id, state: 'stopped', error: err.message });
    throw err;
  }
}

// Auto-restart after a crash, at most 3 times in 10 minutes so a broken
// plugin doesn't put it in a loop.
async function maybeRestart(id) {
  const meta = await get(id).catch(() => null); // deleted while it was running
  if (!meta?.autoRestart) return;
  const recent = (crashes.get(id) || []).filter((t) => Date.now() - t < 10 * 60e3);
  if (recent.length >= 3) {
    pushLog(id, '[Pimpin] Crashed 3 times in 10 minutes, not restarting again.');
    return;
  }
  crashes.set(id, [...recent, Date.now()]);
  pushLog(id, '[Pimpin] Server crashed, restarting in 5 seconds...');
  setTimeout(() => start(id).catch((err) => pushLog(id, `[Pimpin] Restart failed: ${err.message}`)), 5000);
}

function command(id, cmd) {
  const r = running.get(id);
  if (!r) throw new Error('Server is not running');
  pushLog(id, `> ${cmd}`);
  r.child.stdin.write(`${cmd}\n`);
}

function stop(id) {
  const r = running.get(id);
  if (!r) return;
  r.stopping = true;
  r.child.stdin.write('stop\n');
  // give it 30s to save the world, then kill it
  const timer = setTimeout(() => r.child.kill(), 30000);
  r.child.once('close', () => clearTimeout(timer));
}

async function restart(id) {
  const r = running.get(id);
  if (r) {
    const closed = new Promise((res) => r.child.once('close', res));
    stop(id);
    await closed;
  }
  return start(id);
}

function stopAll() {
  for (const id of running.keys()) stop(id);
}

function getLogs(id) {
  return logs.get(id) || [];
}

const readList = async (id, file) => (await readJson(path.join(dirOf(id), file), [])).map((e) => e.name).filter(Boolean);

async function playerInfo(id) {
  return {
    online: [...(players.get(id) || [])],
    ops: await readList(id, 'ops.json'),
    whitelist: await readList(id, 'whitelist.json'),
    banned: await readList(id, 'banned-players.json'),
  };
}

// action -> console command, the player name goes after it
const PLAYER_COMMANDS = {
  op: 'op',
  deop: 'deop',
  kick: 'kick',
  ban: 'ban',
  pardon: 'pardon',
  whitelist: 'whitelist add',
  unwhitelist: 'whitelist remove',
};

async function playerAction(id, action, name) {
  if (!Object.hasOwn(PLAYER_COMMANDS, action)) throw new Error('Unknown action');
  if (typeof name !== 'string' || !PLAYER_NAME.test(name)) throw new Error('That is not a valid player name');
  if (!running.has(id)) throw new Error('Start the server to manage players.');
  command(id, `${PLAYER_COMMANDS[action]} ${name}`);
  // The server writes ops.json / whitelist.json right after the command.
  await new Promise((r) => setTimeout(r, 600));
  return playerInfo(id);
}

async function worldFolders(id) {
  const level = (await readProperties(id))['level-name'] || 'world';
  return [level, `${level}_nether`, `${level}_the_end`].filter((f) => fs.existsSync(safeJoin(dirOf(id), f)));
}

async function backups(id) {
  const folder = path.join(dirOf(id), 'backups');
  const out = [];
  for (const name of await fsp.readdir(folder).catch(() => [])) {
    if (!name.endsWith('.zip')) continue;
    const st = await fsp.stat(path.join(folder, name)).catch(() => null);
    if (st) out.push({ name, size: st.size, created: st.mtimeMs });
  }
  return out.sort((a, b) => b.created - a.created);
}

// Backup names come from the renderer: only plain .zip names in backups/.
function backupFile(id, name) {
  if (typeof name !== 'string' || path.basename(name) !== name || !name.endsWith('.zip')) throw new Error('Unknown backup');
  return safeJoin(dirOf(id), 'backups', name);
}

async function backup(id) {
  const worlds = await worldFolders(id);
  if (!worlds.length) throw new Error('There is no world yet. Start the server once first.');
  const dir = dirOf(id);
  const live = running.has(id);
  if (live) {
    // flush chunks to disk and keep the server from writing while we zip.
    // On timeout we back up anyway, worst case a few seconds are missing.
    command(id, 'save-off');
    command(id, 'save-all flush');
    await waitForLog(id, /Saved the (game|world)/i, 15000);
  }
  try {
    const zip = new AdmZip();
    for (const w of worlds) {
      // session.lock is held open by a running server
      await zip.addLocalFolderPromise(path.join(dir, w), { zipPath: w, filter: (f) => !/session\.lock$/.test(f) });
    }
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    await fsp.mkdir(path.join(dir, 'backups'), { recursive: true });
    await zip.writeZipPromise(path.join(dir, 'backups', `backup-${stamp}.zip`));
  } finally {
    if (live && running.has(id)) command(id, 'save-on');
  }
  return backups(id);
}

async function restoreBackup(id, name) {
  if (running.has(id)) throw new Error('Stop the server before restoring a backup.');
  const dir = dirOf(id);
  const zip = new AdmZip(backupFile(id, name));
  const tops = new Set(zip.getEntries().map((e) => e.entryName.split('/')[0]).filter(Boolean));
  // check everything before deleting anything
  for (const t of tops) {
    if (t === 'backups' || t.endsWith('.jar') || t === META) throw new Error('This backup contains unexpected files.');
  }
  // wipe the old world folders first so deleted chunks/region files don't linger
  for (const t of tops) await fsp.rm(safeJoin(dir, t), { recursive: true, force: true });
  await zip.extractAllToAsync(dir, true);
  return backups(id);
}

async function deleteBackup(id, name) {
  await fsp.rm(backupFile(id, name), { force: true });
  return backups(id);
}

// Home networks first, VPN / virtual adapters last.
const LAN_RANGES = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];

function lanAddresses() {
  const out = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const a of iface || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  const rank = (ip) => {
    const i = LAN_RANGES.findIndex((re) => re.test(ip));
    return i === -1 ? LAN_RANGES.length : i;
  };
  return out.sort((a, b) => rank(a) - rank(b));
}

module.exports = {
  SOFTWARE,
  setEmitter,
  versions,
  list,
  get,
  create,
  update,
  remove,
  start,
  stop,
  restart,
  stopAll,
  command,
  getLogs,
  readProperties,
  setProperties,
  playerInfo,
  playerAction,
  backups,
  backup,
  restoreBackup,
  deleteBackup,
  lanAddresses,
  holder: async (id) => holder(await get(id)),
  dirOf,
};
