// Only public client preferences belong here. Layouts, waypoints, boost and
// native-option rollback metadata are deliberately opaque and never patched.
const fs = require('fs/promises');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const instances = require('./instances');
const { dirs } = require('./store');

const fields = [];
function bool(group, key, label, value, help = '') { fields.push({ group, key, label, type: 'boolean', default: value, help }); }
function number(group, key, label, value, min, max, help = '', step = 1) { fields.push({ group, key, label, type: 'number', default: value, min, max, step, help }); }
for (const [key, label, value] of [
  ['hud', 'Show HUD', true], ['showFps', 'FPS', true], ['showCoords', 'Coordinates', true],
  ['showDirection', 'Direction', true], ['showBiome', 'Biome', false], ['showPing', 'Ping', true],
  ['showSpeed', 'Movement speed', false], ['showClock', 'Clock', false], ['showDeath', 'Last death', true],
  ['keystrokes', 'Keystrokes', true], ['armorHud', 'Armor HUD', true], ['effectHud', 'Active effects', false],
  ['hudBackground', 'Panel backgrounds', true], ['hudSnap', 'Snap HUD in editor', true],
]) bool('HUD', key, label, value);
fields.push({ group: 'HUD', key: 'armorReadout', label: 'Durability text', type: 'choice', default: 0, choices: [{ value: 0, label: 'Remaining' }, { value: 1, label: 'Percent' }, { value: 2, label: 'Both' }], help: 'How the armor HUD shows item durability.' });
bool('HUD', 'armorMainHand', 'Held item in armor HUD', true);
bool('HUD', 'armorOffHand', 'Offhand in armor HUD', false);
fields.push({ group: 'HUD', key: 'armorWarningPercent', label: 'Low durability warning', type: 'choice', default: 0, choices: [0, 5, 10, 15, 20, 25, 30].map(v => ({ value: v, label: v ? `Below ${v}%` : 'Off' })), help: 'Highlights a worn item in red. No sounds or chat messages.' });
number('HUD', 'effectHudRows', 'Effect rows', 8, 4, 12);
number('HUD', 'hudOpacity', 'Panel opacity (%)', 55, 0, 100);
fields.push({ group: 'HUD', key: 'accent', label: 'HUD accent', type: 'color', default: -4887297, help: 'Client HUD color, not the launcher theme. Saving a color makes it fully opaque.' });
for (const [key, label, value] of [
  ['minimap', 'Show minimap', true], ['minimapRound', 'Round map', false], ['minimapRotate', 'Rotate with player', false],
  ['minimapCoords', 'Coordinates under map', true], ['minimapPlayers', 'Players', true], ['minimapMobs', 'Mobs', true],
  ['minimapHostiles', 'Hostile mobs', true], ['minimapAnimals', 'Animals', true], ['minimapCaves', 'Cave map', true],
  ['minimapShading', 'Terrain shading', true], ['minimapCompass', 'Compass labels', true],
  ['minimapWaypoints', 'Waypoint markers', true], ['minimapEdgeMarkers', 'Off-map markers', true],
]) bool('Minimap', key, label, value);
number('Minimap', 'minimapSize', 'Map size (pixels)', 96, 48, 192);
number('Minimap', 'mapZoom', 'Map zoom level', 1, 0, 4, '0 is the widest view; 4 is the closest view.');
number('Minimap', 'minimapEntityHeight', 'Entity height range (blocks)', 48, 8, 256);
number('Minimap', 'minimapRefresh', 'Map refresh (FPS)', 30, 10, 60, 'Lower values reduce map work.');
number('Minimap', 'minimapWaypointRange', 'Waypoint range (blocks)', 0, 0, 4096, '0 means unlimited. Waypoint locations are never changed here.');
bool('Quality of life', 'toggleSprint', 'Toggle sprint', false, 'Uses Minecraft accessibility toggle sprint during a world session.');
bool('Quality of life', 'smoothZoom', 'Smooth zoom', true);
bool('Quality of life', 'scrollZoom', 'Scroll to zoom', true);
number('Quality of life', 'zoomFactor', 'Zoom strength', 4, 2, 12, 'Magnification while holding the zoom key.', 0.5);
bool('Quality of life', 'backgroundFps', 'Limit background FPS', true, 'Reduces rendering when Minecraft is not focused.');
number('Quality of life', 'backgroundFpsLimit', 'Background FPS limit', 15, 5, 60);
bool('Quality of life', 'menuButtons', 'Pimpin menu buttons', true);
bool('Quality of life', 'brandedLoading', 'Pimpin loading screen', true);
const schema = Object.freeze(fields.map(Object.freeze));
const byKey = new Map(schema.map(f => [f.key, f]));
const hash = bytes => bytes === null ? 'absent' : createHash('sha256').update(bytes).digest('hex');
function valid(f, value) {
  if (f.type === 'boolean') return typeof value === 'boolean';
  if (f.type === 'choice') return f.choices.some(c => c.value === value);
  if (f.type === 'color') return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
  return typeof value === 'number' && Number.isFinite(value) && value >= f.min && value <= f.max && Number.isInteger((value - f.min) / f.step);
}
function validatePatch(patch) {
  if (!patch || Object.getPrototypeOf(patch) !== Object.prototype || !Object.keys(patch).length) throw new Error('Provide at least one client setting.');
  for (const [key, value] of Object.entries(patch)) {
    const f = byKey.get(key);
    if (!f) throw new Error(`Unknown or protected client setting: ${key}`);
    if (!valid(f, value)) throw new Error(`Invalid ${f.label}: ${f.type === 'boolean' ? 'use true or false' : f.type === 'choice' ? `choose ${f.choices.map(c => c.label).join(', ')}` : f.type === 'color' ? 'use a signed ARGB integer' : `expected ${f.min} to ${f.max}${f.step === 1 ? ' (whole numbers)' : ''}`}.`);
  }
}
function createClientSettings({ io = fs, lifecycle = instances, instancesRoot = dirs.instances } = {}) {
  async function noLink(file, optional = false) {
    try { const st = await io.lstat(file); if (st.isSymbolicLink()) throw new Error('Client settings cannot use linked folders or files.'); }
    catch (err) { if (!optional || err.code !== 'ENOENT') throw err; }
  }
  async function target(id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(id)) throw new Error('Invalid instance id.');
    await noLink(instancesRoot);
    await lifecycle.get(id);
    const dir = path.join(instancesRoot, id);
    await noLink(dir);
    const config = path.join(dir, 'config');
    await noLink(config, true);
    const file = path.join(config, 'pimpin-client.json');
    await noLink(file, true);
    return file;
  }
  async function read(file) {
    let bytes;
    try { bytes = await io.readFile(file); }
    catch (err) { if (err.code === 'ENOENT') return { bytes: null, data: {} }; throw new Error(`Cannot read Pimpin Client settings: ${err.message}`); }
    if (bytes.length > 2 * 1024 * 1024) throw new Error('Pimpin Client settings exceed the 2 MiB safety limit. File left unchanged.');
    try {
      const data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('expected a JSON object');
      return { bytes, data };
    } catch (err) { throw new Error(`Cannot parse config/pimpin-client.json: ${err.message}. File left unchanged. Repair the JSON manually, then reload.`); }
  }
  function result(snapshot) {
    const warnings = schema.filter(f => Object.hasOwn(snapshot.data, f.key) && !valid(f, snapshot.data[f.key])).map(f => `${f.label} has an unsupported saved value; showing the default until you change it.`);
    return { exists: snapshot.bytes !== null, revision: hash(snapshot.bytes), schema, warnings,
      values: Object.fromEntries(schema.map(f => [f.key, valid(f, snapshot.data[f.key]) ? snapshot.data[f.key] : f.default])) };
  }
  async function get(id) { return result(await read(await target(id))); }
  function update(id, patch, revision) {
    // withStopped reserves synchronously, before any filesystem await.
    return lifecycle.withStopped(id, async () => {
      validatePatch(patch);
      if (typeof revision !== 'string' || !/^(absent|[a-f0-9]{64})$/.test(revision)) throw new Error('Reload client settings before saving.');
      const file = await target(id);
      const previous = await read(file);
      if (hash(previous.bytes) !== revision) throw new Error('Client settings changed since you opened them. Reload before saving; your file was not changed.');
      const bytes = Buffer.from(JSON.stringify({ ...previous.data, ...patch }, null, 2) + '\n');
      const token = randomUUID();
      const tmp = `${file}.${token}.tmp`;
      let backup = null;
      try {
        await io.mkdir(path.dirname(file), { recursive: true });
        const handle = await io.open(tmp, 'wx');
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        if (previous.bytes !== null) {
          const backupFile = `${file}.${token}.bak`;
          const saved = await io.open(backupFile, 'wx');
          try {
            try { await saved.writeFile(previous.bytes); await saved.sync(); } finally { await saved.close(); }
            backup = backupFile; // advertise only a fully written, flushed safety copy
          } catch (err) { await io.rm(backupFile, { force: true }).catch(() => {}); throw err; }
        }
        // Catch edits from outside this launcher while the transaction was staged.
        await target(id);
        if (hash((await read(file)).bytes) !== revision) throw new Error('Client settings changed while saving. Reload and try again.');
        await io.rename(tmp, file);
        return { ...result({ bytes, data: JSON.parse(bytes.toString()) }), backup: backup ? path.basename(backup) : null };
      } catch (err) {
        throw new Error(`Could not save Pimpin Client settings: ${err.message}. Existing config was not replaced.${backup ? ` Safety copy: ${path.basename(backup)}.` : ''}`);
      } finally { await io.rm(tmp, { force: true }).catch(() => {}); }
    });
  }
  return { get, update };
}
module.exports = { ...createClientSettings(), createClientSettings };
