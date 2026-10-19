// Persistent launcher state: settings, folders and small JSON file helpers.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

function defaultRoot() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.pimpinlauncher');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'pimpinlauncher');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'pimpinlauncher');
}

const ROOT = process.env.PIMPIN_ROOT || defaultRoot();

const dirs = {
  root: ROOT,
  instances: path.join(ROOT, 'instances'),
  servers: path.join(ROOT, 'servers'),
  shared: path.join(ROOT, 'shared'),
  versions: path.join(ROOT, 'shared', 'versions'),
  libraries: path.join(ROOT, 'shared', 'libraries'),
  assets: path.join(ROOT, 'shared', 'assets'),
  natives: path.join(ROOT, 'shared', 'natives'),
  runtimes: path.join(ROOT, 'runtimes'),
  cache: path.join(ROOT, 'cache'),
  logs: path.join(ROOT, 'logs'),
};

for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

function readJsonSync(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}

const SETTINGS_FILE = path.join(ROOT, 'settings.json');

const DEFAULT_SETTINGS = {
  memoryMax: Math.max(2048, Math.min(6144, Math.floor(os.totalmem() / 1024 / 1024 / 3 / 512) * 512)),
  memoryMin: 1024,
  jvmArgs: '-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:MaxGCPauseMillis=50',
  javaPath: '',
  width: 1280,
  height: 720,
  fullscreen: false,
  closeOnLaunch: false,
  showConsoleOnLaunch: false,
  accent: 'violet',
  lastInstance: null,
  activeAccount: null,
};

let settings = { ...DEFAULT_SETTINGS, ...readJsonSync(SETTINGS_FILE, {}) };

function getSettings() {
  return { ...settings, root: ROOT, totalMemory: Math.floor(os.totalmem() / 1024 / 1024) };
}

async function updateSettings(patch) {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  for (const [k, v] of Object.entries(patch || {})) {
    if (allowed.includes(k)) settings[k] = v;
  }
  await writeJson(SETTINGS_FILE, settings);
  return getSettings();
}

/** Turn arbitrary text into a safe folder name. */
function slugify(text) {
  const base = String(text || 'instance')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'instance';
}

function uniqueDir(parent, name) {
  let id = slugify(name);
  let n = 1;
  while (fs.existsSync(path.join(parent, id))) id = `${slugify(name)}-${++n}`;
  return id;
}

/** Guard against path traversal from ids/file names supplied by the renderer. */
function safeJoin(base, ...parts) {
  const target = path.resolve(base, ...parts);
  const rel = path.relative(path.resolve(base), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Invalid path');
  return target;
}

module.exports = {
  dirs,
  readJson,
  readJsonSync,
  writeJson,
  getSettings,
  updateSettings,
  slugify,
  uniqueDir,
  safeJoin,
};
