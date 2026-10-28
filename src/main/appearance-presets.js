// Pure appearance-only JSON conversion. Dialogs and disk I/O belong to main.js.
const { APPEARANCE_DEFAULTS, normalizeAppearance } = require('./appearance-settings');
const MAX_PRESET_BYTES = 16 * 1024;
const SCHEMA = 'pimpin-appearance';
const VERSION = 1;
const keys = Object.keys(APPEARANCE_DEFAULTS);

function parsePreset(text) {
  if (typeof text !== 'string') throw new Error('Appearance preset must be JSON text.');
  if (Buffer.byteLength(text, 'utf8') > MAX_PRESET_BYTES) throw new Error('Appearance preset is too large (maximum 16 KiB).');
  let preset;
  try { preset = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Appearance preset is not valid JSON.'); }
  if (!preset || typeof preset !== 'object' || Array.isArray(preset)) throw new Error('Invalid appearance preset envelope.');
  for (const key of Object.keys(preset)) {
    if (!['schema', 'version', 'appearance'].includes(key)) throw new Error('Unknown appearance preset field.');
  }
  if (preset.schema !== SCHEMA) throw new Error('Invalid appearance preset schema.');
  if (preset.version !== VERSION) throw new Error('Unsupported appearance preset version.');
  const source = preset.appearance;
  if (!source || typeof source !== 'object' || Array.isArray(source) || !Object.keys(source).length) {
    throw new Error('Invalid appearance settings: provide at least one appearance key.');
  }
  for (const key of Object.keys(source)) {
    if (!Object.hasOwn(APPEARANCE_DEFAULTS, key)) throw new Error('Unknown or protected appearance setting.');
  }
  const normalized = normalizeAppearance(source);
  const patch = {};
  for (const [key, value] of Object.entries(source)) {
    // The shared normalizer normally repairs bad values. Imports instead reject
    // repairs, so a typo cannot silently reset or clamp somebody's preferences.
    const expected = /^customA[12]$/.test(key) && typeof value === 'string' ? value.toLowerCase() : value;
    if (normalized[key] !== expected) throw new Error(`Invalid appearance value for ${key}.`);
    patch[key] = normalized[key];
  }
  return patch;
}

function serializePreset(settings) {
  const appearance = normalizeAppearance(Object.fromEntries(
    keys.filter(key => Object.hasOwn(settings || {}, key)).map(key => [key, settings[key]]),
  ));
  return JSON.stringify({ schema: SCHEMA, version: VERSION, appearance }, null, 2) + '\n';
}

module.exports = { parsePreset, serializePreset, MAX_PRESET_BYTES };
