const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'pimpin-appearance-test-'));
process.env.PIMPIN_ROOT = root;
const store = require('../src/main/store');
test('appearance defaults are safe and layout settings persist across store reopen', async () => {
  const initial = store.getSettings();
  assert.equal(initial.density, 'comfortable');
  assert.equal(initial.textSize, 100);
  assert.equal(initial.sidebarWidth, 232);
  assert.equal(initial.sidebarMode, 'auto');
  await store.updateSettings({ uiStyle: 'system', accent: 'custom', customA1: '#12AbEF', density: 'compact', textSize: 115, sidebarWidth: 270, sidebarMode: 'compact' });
  delete require.cache[require.resolve('../src/main/store')];
  const reopened = require('../src/main/store').getSettings();
  assert.equal(reopened.uiStyle, 'system');
  assert.equal(reopened.customA1, '#12abef');
  assert.equal(reopened.density, 'compact');
  assert.equal(reopened.textSize, 115);
  assert.equal(reopened.sidebarWidth, 270);
  assert.equal(reopened.sidebarMode, 'compact');
});
test('invalid appearance data cannot inject CSS; numbers clamp, invalid types fall back', async () => {
  const { normalizeAppearance, APPEARANCE_DEFAULTS } = require('../src/main/appearance-settings');
  const invalid = normalizeAppearance({ uiStyle: 'url(evil)', accent: '__proto__', customA1: '#fff; background:url(evil)', font: {}, animations: 'false', density: [], sidebarMode: 'hidden', uiScale: Infinity, textSize: '120', sidebarWidth: NaN });
  assert.deepEqual(invalid, APPEARANCE_DEFAULTS);
  assert.deepEqual(normalizeAppearance(null), APPEARANCE_DEFAULTS);
  const limits = normalizeAppearance({ uiScale: -100, textSize: 999, sidebarWidth: 9999, accent: 'ocean' });
  assert.equal(limits.uiScale, 80);
  assert.equal(limits.textSize, 120);
  assert.equal(limits.sidebarWidth, 300);
  assert.equal(limits.accent, 'blue');
  const grads = normalizeAppearance({ gradient: 'yes', customA2: '#ABCDEF', gradientAngle: 999 });
  assert.equal(grads.gradient, APPEARANCE_DEFAULTS.gradient);
  assert.equal(grads.customA2, '#abcdef');
  assert.equal(grads.gradientAngle, 360);
  assert.equal(normalizeAppearance({ gradientAngle: -5 }).gradientAngle, 0);
  assert.equal(normalizeAppearance({ customA2: 'url(evil)' }).customA2, APPEARANCE_DEFAULTS.customA2);
  await store.updateSettings({ customA1: 'red;display:none', density: 'oops', sidebarWidth: -100, unknownCss: 'body{}' });
  assert.equal(store.getSettings().customA1, APPEARANCE_DEFAULTS.customA1);
  assert.equal(store.getSettings().sidebarWidth, 190);
  assert.equal(store.getSettings().unknownCss, undefined);
});
test('reset restores only appearance, preserving game and account preferences', async () => {
  const { APPEARANCE_DEFAULTS } = require('../src/main/appearance-settings');
  await store.updateSettings({ memoryMax: 4096, activeAccount: 'fixture', uiStyle: 'light', textSize: 120, accent: 'red' });
  await store.updateSettings({ appearanceReset: true });
  for (const [key, value] of Object.entries(APPEARANCE_DEFAULTS)) assert.equal(store.getSettings()[key], value);
  assert.equal(store.getSettings().memoryMax, 4096);
  assert.equal(store.getSettings().activeAccount, 'fixture');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'settings.json'))).appearanceReset, undefined);
});
test('invalid persisted appearance is normalized on startup', () => {
  fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ uiStyle: 'css-injection', customA1: 'url(foo)', textSize: 999, sidebarMode: 'hidden' }));
  delete require.cache[require.resolve('../src/main/store')];
  const loaded = require('../src/main/store').getSettings();
  assert.equal(loaded.uiStyle, 'modern');
  assert.equal(loaded.customA1, '#8f5cf7');
  assert.equal(loaded.textSize, 120);
  assert.equal(loaded.sidebarMode, 'auto');
});
test('Minecraft style is off by default and legacy pre-v3 keys never switch it on', () => {
  const { normalizeAppearance, APPEARANCE_DEFAULTS, MINECRAFT_KEYS } = require('../src/main/appearance-settings');
  assert.equal(APPEARANCE_DEFAULTS.mcStyle, false);
  assert.deepEqual(MINECRAFT_KEYS, Object.keys(APPEARANCE_DEFAULTS).filter(k => k.startsWith('mc')));
  const legacy = normalizeAppearance({ background: 'panorama', blockIcons: true, effects3d: true, uiStyle: 'classic', corners: 'sharp', skinPose: 'dance', skinSpin: 'spin', skinPedestal: 'block', mcStyle: 'true', mcPreset: 'og' });
  for (const key of MINECRAFT_KEYS) assert.equal(legacy[key], APPEARANCE_DEFAULTS[key], key);
  assert.equal(legacy.uiStyle, 'modern');
  for (const key of ['background', 'blockIcons', 'effects3d', 'skinPose']) assert.equal(Object.hasOwn(legacy, key), false);
});

test('Minecraft style keys are validated and reset through null', async () => {
  const { normalizeAppearance, APPEARANCE_DEFAULTS, MINECRAFT_KEYS } = require('../src/main/appearance-settings');
  const valid = { mcStyle: true, mcPreset: 'end', mcBackground: 'tiles', mcButtons: 'wood', mcCorners: 'rounded', mcFont: 'all', mcBlockIcons: false, mcTilt: true, mcSkinPose: 'zombie', mcSkinTurn: 'spin', mcSkinPedestal: 'none', mcScene: 'oneblock', mcMobs: false, mcMobCount: 3, mcSceneSpeed: 0.5 };
  assert.deepEqual(Object.keys(valid).sort(), [...MINECRAFT_KEYS].sort());
  const ok = normalizeAppearance(valid);
  for (const [k, v] of Object.entries(valid)) assert.equal(ok[k], v, k);
  const bad = normalizeAppearance({ mcStyle: 1, mcPreset: 'url(x)', mcBackground: 'glow', mcButtons: {}, mcCorners: 'sharp', mcFont: 'comic', mcBlockIcons: 'yes', mcTilt: null, mcSkinPose: 'fly', mcSkinTurn: 2, mcSkinPedestal: 'block', mcScene: 'url(x)', mcMobs: 'true', mcMobCount: NaN, mcSceneSpeed: Infinity });
  for (const key of MINECRAFT_KEYS) assert.equal(bad[key], APPEARANCE_DEFAULTS[key], key);
  await store.updateSettings({ ...valid, memoryMax: 3072 });
  assert.equal(store.getSettings().mcPreset, 'end');
  await store.updateSettings(Object.fromEntries(MINECRAFT_KEYS.map(k => [k, null])));
  for (const key of MINECRAFT_KEYS) assert.equal(store.getSettings()[key], APPEARANCE_DEFAULTS[key], key);
  assert.equal(store.getSettings().memoryMax, 3072);
});

test('Minecraft theme folder is removable: only a guarded dynamic import refers to it', () => {
  const renderer = path.join(__dirname, '../src/renderer');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const outside = walk(renderer).filter(f => !f.includes(`${path.sep}themes${path.sep}`) && /\.(js|html|css)$/.test(f));
  const refs = outside.filter(f => fs.readFileSync(f, 'utf8').includes('themes/minecraft'));
  assert.deepEqual(refs.map(f => path.relative(renderer, f).replace(/\\/g, '/')), ['js/appearance.js']);
  const appearance = fs.readFileSync(path.join(renderer, 'js/appearance.js'), 'utf8');
  assert.match(appearance, /import\('\.\.\/themes\/minecraft\/index\.js'\)[\s\S]*?\.catch\(/);
  assert.doesNotMatch(appearance, /^import .*themes/m);
  // The theme only reaches outside its folder for shared DOM and skin helpers.
  const themeDir = path.join(renderer, 'themes/minecraft');
  for (const file of walk(themeDir).filter(f => f.endsWith('.js'))) {
    for (const [, spec] of fs.readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)) {
      assert.ok(spec.startsWith('./') || ['../../js/dom.js', '../../js/skin3d.js'].includes(spec), `${path.basename(file)} imports ${spec}`);
    }
  }
  // Every stylesheet rule is scoped so it cannot leak into the default look.
  const css = fs.readFileSync(path.join(themeDir, 'theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/(^|})\s*([^{}@][^{}]*?)\s*{/g)].map(m => m[2].trim()).filter(sel => !/^(from|to|\d+%|@)/.test(sel));
  assert.ok(selectors.length > 50);
  const split = (text) => { const out = ['']; let depth = 0; for (const ch of text) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) out.push(''); else out[out.length - 1] += ch; } return out; };
  for (const group of selectors) for (const sel of split(group)) {
    assert.match(sel.trim(), /data-mc|\.mc-|^\.pf/, `unscoped selector: ${sel.trim()}`);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(themeDir, 'index.js'), 'utf8') + fs.readFileSync(path.join(themeDir, 'blocks.js'), 'utf8'), /AudioContext|new Audio\(/, 'no sound effects');
});
test('sky scene settings clamp, persist, and round-trip appearance-only presets', async () => {
  const { normalizeAppearance } = require('../src/main/appearance-settings');
  const { parsePreset, serializePreset } = require('../src/main/appearance-presets');
  assert.equal(normalizeAppearance({ mcMobCount: 999 }).mcMobCount, 3);
  assert.equal(normalizeAppearance({ mcMobCount: -1 }).mcMobCount, 1);
  assert.equal(normalizeAppearance({ mcSceneSpeed: 99 }).mcSceneSpeed, 1.5);
  assert.equal(normalizeAppearance({ mcSceneSpeed: -1 }).mcSceneSpeed, 0.5);
  const settings = { mcScene: 'oneblock', mcMobs: false, mcMobCount: 3, mcSceneSpeed: 1.5 };
  await store.updateSettings(settings);
  delete require.cache[require.resolve('../src/main/store')];
  const saved = require('../src/main/store').getSettings();
  const imported = parsePreset(serializePreset(saved));
  for (const [key, value] of Object.entries(settings)) {
    assert.equal(saved[key], value);
    assert.equal(imported[key], value);
  }
  assert.throws(() => parsePreset(JSON.stringify({ schema: 'pimpin-appearance', version: 1, appearance: { mcMobCount: 4 } })), /Invalid appearance value/);
});
process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
