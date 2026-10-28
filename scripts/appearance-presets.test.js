const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePreset, serializePreset, MAX_PRESET_BYTES } = require('../src/main/appearance-presets');
const { APPEARANCE_DEFAULTS } = require('../src/main/appearance-settings');
const preset = appearance => JSON.stringify({ schema: 'pimpin-appearance', version: 1, appearance });

test('partial import returns only supplied keys and normalizes hex', () => {
  assert.deepEqual(parsePreset(preset({ customA1: '#ABCDEF', animations: false })), { customA1: '#abcdef', animations: false });
});

test('rejects malformed JSON, wrong envelope, unsupported versions and empty appearance', () => {
  for (const text of [null, {}, Buffer.from('{}'), '', '{', 'null', '[]', 'true', '{}',
    preset(null), preset([]), preset({}), JSON.stringify({ schema: 'other', version: 1, appearance: { accent: 'red' } }),
    ...[0, 2, '1', null].map(version => JSON.stringify({ schema: 'pimpin-appearance', version, appearance: { accent: 'red' } })),
    JSON.stringify({ version: 1, appearance: { accent: 'red' } }),
  ]) assert.throws(() => parsePreset(text), undefined, String(text));
});

test('rejects unknown, sensitive and prototype keys at either level', () => {
  for (const key of ['unknown', 'accounts', 'activeAccount', 'root', 'javaPath', 'token', 'accessToken', 'discordAppId', 'css', '__proto__', 'constructor', 'prototype']) {
    assert.throws(() => parsePreset(preset({ accent: 'red', [key]: 'never import' })), /Unknown/);
    assert.throws(() => parsePreset(JSON.stringify({ schema: 'pimpin-appearance', version: 1, appearance: { accent: 'red' }, [key]: 'never import' })), /Unknown/);
  }
  assert.equal({}.polluted, undefined);
});

test('rejects invalid values instead of silently replacing or clamping them', () => {
  for (const appearance of [
    { uiStyle: 'javascript:alert(1)' }, { accent: 'toString' }, { font: 'url(https://example.invalid)' },
    { density: 'huge' }, { sidebarMode: 'none' }, { customA1: '#fff' }, { customA2: 'red; color:black' },
    { animations: 'false' }, { gradient: 1 }, { uiScale: '100' }, { uiScale: 79 }, { uiScale: 131 },
    { textSize: 89 }, { textSize: 121 }, { sidebarWidth: 189 }, { sidebarWidth: 301 },
    { gradientAngle: -1 }, { gradientAngle: 361 }, { gradientAngle: 1.5 }, { uiScale: 100.5 },
    { accent: {} }, { customA1: null }, { gradient: [] },
  ]) assert.throws(() => parsePreset(preset(appearance)), /Invalid/);
  assert.throws(() => parsePreset('{"schema":"pimpin-appearance","version":1,"appearance":{"uiScale":1e999}}'), /Invalid/);
});

test('bounds input by UTF-8 bytes before parsing', () => {
  assert.equal(MAX_PRESET_BYTES, 16 * 1024);
  const text = preset({ accent: 'blue' });
  assert.deepEqual(parsePreset(text.padEnd(MAX_PRESET_BYTES, ' ')), { accent: 'blue' });
  assert.throws(() => parsePreset(text.padEnd(MAX_PRESET_BYTES + 1, ' ')), /too large/i);
  assert.throws(() => parsePreset('é'.repeat(MAX_PRESET_BYTES / 2 + 1)), /too large/i);
});

test('export excludes sensitive fields and does not mutate settings', () => {
  const settings = Object.freeze({ accent: 'red', accounts: ['private'], activeAccount: 'private', token: 'secret',
    accessToken: 'secret', discordAppId: 'private', root: 'C:/private', javaPath: 'C:/private/java', arbitrary: 'secret' });
  const text = serializePreset(settings);
  assert.doesNotMatch(text, /private|secret|accounts|token|discordAppId|javaPath|root/);
  assert.deepEqual(Object.keys(parsePreset(text)).sort(), Object.keys(APPEARANCE_DEFAULTS).sort());
  assert.equal(settings.accent, 'red');
  assert.doesNotThrow(() => parsePreset(serializePreset()));
});

test('accepts BOM and valid boundary values for every appearance key', () => {
  const appearance = { ...APPEARANCE_DEFAULTS, uiStyle: 'system', accent: 'custom', font: 'pixel',
    uiScale: 80, textSize: 120, sidebarWidth: 190, sidebarMode: 'expanded', density: 'compact', gradientAngle: 360 };
  assert.deepEqual(parsePreset('\uFEFF' + preset(appearance)), appearance);
  assert.deepEqual(parsePreset(preset({ uiScale: 130, textSize: 90, sidebarWidth: 300, gradientAngle: 0 })),
    { uiScale: 130, textSize: 90, sidebarWidth: 300, gradientAngle: 0 });
});

test('module import and conversion need no filesystem or store service', () => {
  const { execFileSync } = require('node:child_process');
  const modulePath = require.resolve('../src/main/appearance-presets');
  const result = execFileSync(process.execPath, ['-e', `
    const Module = require('node:module');
    const load = Module._load;
    Module._load = function(id, ...args) {
      if (/^(node:)?fs(\\/promises)?$/.test(id) || /store/.test(id)) throw new Error('Disk service requested');
      return load.call(this, id, ...args);
    };
    const api = require(${JSON.stringify(modulePath)});
    const patch = api.parsePreset(api.serializePreset({ accent: 'blue' }));
    if (patch.accent !== 'blue') throw new Error('Conversion failed');
    process.stdout.write('pure');
  `], { encoding: 'utf8' });
  assert.equal(result, 'pure');
});

test('appearance preset APIs round-trip only known appearance settings', () => {
  const { parsePreset, serializePreset } = require('../src/main/appearance-presets');
  const { normalizeAppearance } = require('../src/main/appearance-settings');
  const settings = { accent: 'custom', customA1: '#AbCdEf', gradient: false, uiScale: 110 };
  const text = serializePreset(settings);
  assert.deepEqual(JSON.parse(text), {
    schema: 'pimpin-appearance', version: 1, appearance: normalizeAppearance(settings),
  });
  assert.deepEqual(parsePreset(text), normalizeAppearance(settings));
});
