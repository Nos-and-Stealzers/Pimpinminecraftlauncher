// Persistent launcher state: settings, folders and small JSON file helpers.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { APPEARANCE_DEFAULTS, normalizeAppearance } = require('./appearance-settings');
const { DEFAULTS: PRESENCE_DEFAULTS, normalizePresence, validatePresencePatch } = require('./presence-preferences');

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

// Writes are queued per file. Two quick saves (the settings sliders do this)
// otherwise race on the same .tmp and one of the renames fails.
const pending = new Map(); // file -> last queued write

function writeJson(file, data) {
  const json = JSON.stringify(data, null, 2);
  const tmp = `${file}.tmp`;
  const write = (pending.get(file) || Promise.resolve())
    .catch(() => {}) // the previous write already reported its own error
    .then(async () => {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await fsp.writeFile(tmp, json);
      await fsp.rename(tmp, file);
    });
  pending.set(file, write);
  const done = () => {
    if (pending.get(file) === write) pending.delete(file);
  };
  write.then(done, done);
  return write;
}

const SETTINGS_FILE = path.join(ROOT, 'settings.json');
const totalMb = () => Math.floor(os.totalmem() / 1024 / 1024);

const DEFAULT_SETTINGS = {
  // a third of the RAM in 512 MB steps, kept between 2 and 6 GB
  memoryMax: Math.max(2048, Math.min(6144, Math.floor(totalMb() / 3 / 512) * 512)),
  memoryMin: 1024,
  jvmArgs: '-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:MaxGCPauseMillis=50',
  javaPath: '',
  width: 1280,
  height: 720,
  fullscreen: false,
  closeOnLaunch: false,
  showConsoleOnLaunch: false,
  accent: 'violet',
  effects3d: true,
  uiStyle: 'modern',
  font: 'default',
  background: 'glow',
  corners: 'round',
  customA1: '#b56cff',
  customA2: '#ff4fb8',
  uiScale: 100,
  animations: true,
  blur: true,
  blockIcons: false,
  skinMode: '3d',
  skinPose: 'idle',
  skinSpin: 'sway',
  skinPedestal: 'glow',
  showFeatures: true,
  showNews: true,
  startPage: 'home',
  // launcher window geometry, remembered between runs (null = let the OS place it)
  winX: null,
  winY: null,
  winW: null,
  winH: null,
  winMax: false,
  autoUpdate: true,
  updateChannel: 'stable',
  lastSeenVersion: null,
  onboarded: false,
  notifications: true,
  ...PRESENCE_DEFAULTS,
  notifyLauncherUpdates: true,
  notifyModUpdates: true,
  notifyAnnouncements: true,
  inGameNotices: true,
  minimizeToTray: false,
  launchOnStartup: false,
  lastInstance: null,
  activeAccount: null,
  // personal CurseForge API key (null = use the build's key, if any)
  curseforgeApiKey: null,
  ...APPEARANCE_DEFAULTS,
};

const savedSettings = readJsonSync(SETTINGS_FILE, {});
const settings = { ...DEFAULT_SETTINGS, ...savedSettings, ...normalizeAppearance(savedSettings), ...normalizePresence(savedSettings) };

function getSettings() {
  return { ...settings, root: ROOT, totalMemory: totalMb() };
}

/** null/'' clears it; otherwise a single printable token, no spaces. */
function normalizeCurseforgeKey(v) {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return null;
  const k = typeof v === 'string' ? v.trim() : '';
  if (!k || k.length > 200 || !/^[!-~]+$/.test(k)) throw new Error('That does not look like a CurseForge API key.');
  return k;
}

async function updateSettings(patch) {
  validatePresencePatch(patch);
  if (patch && Object.hasOwn(patch, 'curseforgeApiKey')) patch = { ...patch, curseforgeApiKey: normalizeCurseforgeKey(patch.curseforgeApiKey) };
  // only known keys, anything else from the renderer is dropped
  for (const [k, v] of Object.entries(patch || {})) {
    if (Object.hasOwn(DEFAULT_SETTINGS, k)) settings[k] = v;
  }
  Object.assign(settings, normalizeAppearance(settings), normalizePresence(settings));
  if (patch?.appearanceReset === true) Object.assign(settings, APPEARANCE_DEFAULTS);
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
  const slug = slugify(name);
  let id = slug;
  let n = 1;
  while (fs.existsSync(path.join(parent, id))) id = `${slug}-${++n}`;
  return id;
}

/** Guard against path traversal from ids/file names supplied by the renderer. */
function safeJoin(base, ...parts) {
  const target = path.resolve(base, ...parts);
  const rel = path.relative(path.resolve(base), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Invalid path');
  return target;
}

/**
 * Sanitized launcher window geometry: sensible defaults for garbage values,
 * clamped to the window's minimum size, position silently dropped when it
 * isn't a finite number (e.g. after a settings-file hand edit).
 */
function launcherBounds(s = settings, workAreas) {
  const width = Math.min(Math.max(Number(s.winW) || 1280, 1024), 8192);
  const height = Math.min(Math.max(Number(s.winH) || 800, 640), 8192);
  const coordinate = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null;
  let x = coordinate(s.winX);
  let y = coordinate(s.winY);
  // Restore only if enough of the draggable titlebar remains on a current
  // display. Saved secondary-monitor coordinates can otherwise strand the app.
  if (Array.isArray(workAreas) && workAreas.length && x !== null && y !== null) {
    const reachable = workAreas.some(a => a && [a.x, a.y, a.width, a.height].every(Number.isFinite)
      && Math.min(x + width, a.x + a.width) - Math.max(x, a.x) >= 96
      && Math.min(y + 32, a.y + a.height) - Math.max(y, a.y) >= 24);
    if (!reachable) { x = null; y = null; }
  }
  return { x, y, width, height, maximized: Boolean(s.winMax) };
}

module.exports = {
  dirs,
  readJson,
  readJsonSync,
  writeJson,
  getSettings,
  updateSettings,
  launcherBounds,
  slugify,
  uniqueDir,
  safeJoin,
  normalizeCurseforgeKey,
};
