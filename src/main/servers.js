// Local Paper servers with plugins from the library. Lets players spin up a
// server for friends / testing, install plugins and join it in one click.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { dirs, readJson, writeJson, uniqueDir, safeJoin } = require('./store');
const { getJson, download } = require('./net');
const { ensureJava, consoleJava } = require('./java');
const minecraft = require('./minecraft');

const FILL = 'https://fill.papermc.io/v3/projects/paper';
const META = 'pimpin-server.json';
const running = new Map();
const logs = new Map();
let emit = () => {};

function setEmitter(fn) {
  emit = fn;
}

function dirOf(id) {
  return safeJoin(dirs.servers, id);
}

async function paperVersions() {
  const data = await getJson(FILL);
  return Object.values(data.versions)
    .flat()
    .filter((v) => !/(pre|rc|snapshot)/i.test(v));
}

async function get(id) {
  const meta = await readJson(path.join(dirOf(id), META), null);
  if (!meta) throw new Error('Server not found');
  return { ...meta, id, running: running.has(id) };
}

async function save(id, meta) {
  const { running: _r, ...clean } = meta;
  await writeJson(path.join(dirOf(id), META), { ...clean, id });
}

function holder(meta) {
  return {
    kind: 'server',
    dir: dirOf(meta.id),
    mcVersion: meta.mcVersion,
    loader: 'paper',
    load: () => get(meta.id),
    save: (m) => save(meta.id, m),
  };
}

async function list() {
  const out = [];
  for (const id of await fsp.readdir(dirs.servers).catch(() => [])) {
    const meta = await readJson(path.join(dirs.servers, id, META), null);
    if (meta) out.push({ ...meta, id, running: running.has(id), content: undefined });
  }
  return out.sort((a, b) => (b.created || 0) - (a.created || 0));
}

async function create({ name, mcVersion, memory = 2048, port = 25565 }) {
  if (!mcVersion) throw new Error('Pick a server version');
  const id = uniqueDir(dirs.servers, name || `paper ${mcVersion}`);
  const meta = { id, name: name || `Paper ${mcVersion}`, mcVersion, software: 'paper', memory, port, eulaAccepted: false, created: Date.now(), content: [] };
  await fsp.mkdir(path.join(dirOf(id), 'plugins'), { recursive: true });
  await save(id, meta);
  return get(id);
}

async function update(id, patch) {
  const meta = await get(id);
  for (const k of ['name', 'memory', 'port', 'eulaAccepted', 'mcVersion']) if (k in patch) meta[k] = patch[k];
  if ('mcVersion' in patch) meta.build = null;
  await save(id, meta);
  return get(id);
}

async function remove(id) {
  if (running.has(id)) throw new Error('Stop the server first.');
  await fsp.rm(dirOf(id), { recursive: true, force: true });
  return list();
}

function pushLog(id, line) {
  line = line.replace(/\x1b\[[0-9;]*m/g, '');
  const buf = logs.get(id) || [];
  buf.push(line);
  if (buf.length > 3000) buf.splice(0, buf.length - 3000);
  logs.set(id, buf);
  emit('server:log', { id, line });
}

async function ensurePaper(meta, progress) {
  const build = await getJson(`${FILL}/versions/${encodeURIComponent(meta.mcVersion)}/builds/latest`);
  const dl = build.downloads['server:default'];
  const jar = path.join(dirOf(meta.id), 'paper.jar');
  if (meta.build !== build.id || !fs.existsSync(jar)) {
    await download(dl.url, jar, {
      force: true,
      size: dl.size,
      onProgress: (d, t) => progress({ stage: `Paper ${meta.mcVersion} #${build.id}`, done: d, total: t, bytes: true }),
    });
    meta.build = build.id;
  }
  return jar;
}

async function setProperty(dir, key, value) {
  const file = path.join(dir, 'server.properties');
  let text = '';
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch {
    /* first start */
  }
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${key}=${value}\n`;
  await fsp.writeFile(file, text);
}

async function start(id) {
  if (running.has(id)) throw new Error('Server is already running.');
  const meta = await get(id);
  if (!meta.eulaAccepted) throw new Error('You need to accept the Minecraft EULA first.');
  const dir = dirOf(id);
  const progress = (p) => emit('server:progress', { id, ...p });
  logs.set(id, []);
  emit('server:state', { id, state: 'preparing' });
  try {
    let jar;
    try {
      jar = await ensurePaper(meta, progress);
    } catch (err) {
      jar = path.join(dir, 'paper.jar');
      if (!fs.existsSync(jar)) throw err; // offline and nothing cached
    }
    const vanilla = await minecraft.getVanillaJson(meta.mcVersion);
    const java = consoleJava(await ensureJava(vanilla.javaVersion, progress));
    await fsp.writeFile(path.join(dir, 'eula.txt'), 'eula=true\n');
    await setProperty(dir, 'server-port', meta.port);
    await save(id, meta);

    const args = [`-Xmx${meta.memory}M`, `-Xms${Math.min(1024, meta.memory)}M`, '-jar', jar, '--nogui'];
    pushLog(id, `[Pimpin] ${java} ${args.join(' ')}`);
    const child = spawn(java, args, { cwd: dir, windowsHide: true });
    running.set(id, { child });
    emit('server:state', { id, state: 'running' });
    const onData = (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) pushLog(id, line);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => pushLog(id, `[Pimpin] ${err.message}`));
    child.on('close', (code) => {
      running.delete(id);
      pushLog(id, `[Pimpin] Server stopped (code ${code})`);
      emit('server:state', { id, state: 'stopped', code });
    });
    return { ok: true };
  } catch (err) {
    pushLog(id, `[Pimpin] ${err.message}`);
    emit('server:state', { id, state: 'stopped', error: err.message });
    throw err;
  }
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
  r.child.stdin.write('stop\n');
  const timer = setTimeout(() => r.child.kill(), 30000);
  r.child.once('close', () => clearTimeout(timer));
}

function stopAll() {
  for (const id of running.keys()) stop(id);
}

function getLogs(id) {
  return logs.get(id) || [];
}

module.exports = {
  setEmitter,
  paperVersions,
  list,
  get,
  create,
  update,
  remove,
  start,
  stop,
  stopAll,
  command,
  getLogs,
  holder: async (id) => holder(await get(id)),
  dirOf,
};
