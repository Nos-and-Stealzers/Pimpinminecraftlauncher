// Optional Minecraft style for Pimpin Launcher. Self-contained: the launcher
// imports this folder only while settings.mcStyle is on (and to show its
// settings block). Delete src/renderer/themes/minecraft/ and the launcher
// keeps working; the import fails quietly and the settings block disappears.
import { el, icon } from '../../js/dom.js';
import { texUrl, blockIconUrl } from './textures.js';
import { createPanorama } from './panorama.js';
import { enableBlocks, disableBlocks, setTilt } from './blocks.js';
import { updateSkin, removeSkin } from './skin.js';

const CSS_URL = new URL('./theme.css', import.meta.url).href;
const TILES = { overworld: 'dirt', nether: 'netherrack', end: 'endstone' };
const TEXTURE_VARS = {
  '--mc-stone-btn': 'stone_btn', '--mc-stone-btn-hi': 'stone_btn_hi',
  '--mc-wood-btn': 'wood_btn', '--mc-wood-btn-hi': 'wood_btn_hi',
  '--mc-grain': 'grain', '--mc-stone': 'stone',
};
const ATTRS = ['mc', 'mcPreset', 'mcBg', 'mcButtons', 'mcCorners', 'mcFont', 'mcIcons', 'mcHome'];

let enabled = false;
let cssReady = null;
let link = null;
let backdrop = null;
let pano = null;
let viewObserver = null;
let cfg = null;

const reducedMotion = () => document.body.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const onHome = () => Boolean(document.querySelector('#view .home-top, #view .home-welcome'));

function loadCss() {
  if (cssReady) return cssReady;
  link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_URL;
  link.dataset.theme = 'minecraft';
  cssReady = new Promise((resolve) => {
    link.addEventListener('load', () => resolve(true), { once: true });
    link.addEventListener('error', () => resolve(false), { once: true });
  });
  document.head.append(link);
  return cssReady;
}

function syncScene() {
  if (!enabled || !cfg) return;
  const b = document.body;
  const home = onHome();
  if (home) b.dataset.mcHome = ''; else delete b.dataset.mcHome;
  const wantPano = cfg.mcBackground === 'panorama' && home;
  if (wantPano && !pano) pano = createPanorama(backdrop, { preset: cfg.mcPreset });
  if (pano) {
    pano.setPreset(cfg.mcPreset);
    pano.setOptions({ scene: cfg.mcScene, mobs: cfg.mcMobs, mobCount: cfg.mcMobCount, speed: cfg.mcSceneSpeed });
    // Animate only on Home, in a visible window, without reduced motion.
    pano.setRunning(wantPano && !document.hidden && !reducedMotion());
    if (wantPano && !pano.running) pano.redraw();
  }
}

function onVisibility() { syncScene(); }

function enable() {
  enabled = true;
  const b = document.body;
  for (const [name, key] of Object.entries(TEXTURE_VARS)) b.style.setProperty(name, `url("${texUrl(key)}")`);
  backdrop = document.createElement('div');
  backdrop.className = 'mc-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  b.append(backdrop);
  const view = document.getElementById('view');
  if (view) {
    viewObserver = new MutationObserver(syncScene);
    viewObserver.observe(view, { childList: true });
  }
  document.addEventListener('visibilitychange', onVisibility);
}

/** Apply (or remove) the style for the current settings. Safe to call often. */
export async function apply(s) {
  if (!s || s.mcStyle !== true) { disable(); return; }
  cfg = { ...s };
  await loadCss();
  if (!cfg || cfg.mcStyle !== true) return;
  if (!enabled) enable();
  const b = document.body;
  b.dataset.mc = '';
  b.dataset.mcPreset = cfg.mcPreset;
  b.dataset.mcBg = cfg.mcBackground;
  b.dataset.mcButtons = cfg.mcButtons;
  b.dataset.mcCorners = cfg.mcCorners;
  b.dataset.mcFont = cfg.mcFont;
  b.style.setProperty('--mc-tile', `url("${texUrl(TILES[cfg.mcPreset] || 'dirt')}")`);
  if (cfg.mcBlockIcons) { b.dataset.mcIcons = ''; enableBlocks(cfg.mcPreset); } else { delete b.dataset.mcIcons; disableBlocks(); }
  setTilt(Boolean(cfg.mcTilt));
  updateSkin({ pose: cfg.mcSkinPose, turn: cfg.mcSkinTurn, pedestal: cfg.mcSkinPedestal, reduced: reducedMotion() });
  syncScene();
}

export function disable() {
  cfg = null;
  if (!enabled && !link) return;
  enabled = false;
  const b = document.body;
  for (const key of ATTRS) delete b.dataset[key];
  for (const name of [...Object.keys(TEXTURE_VARS), '--mc-tile']) b.style.removeProperty(name);
  disableBlocks();
  setTilt(false);
  removeSkin();
  viewObserver?.disconnect();
  viewObserver = null;
  document.removeEventListener('visibilitychange', onVisibility);
  pano?.destroy();
  pano = null;
  backdrop?.remove();
  backdrop = null;
  link?.remove();
  link = null;
  cssReady = null;
}

/** Test/diagnostic view of the live state. */
export function status() {
  return { enabled, panorama: Boolean(pano), running: Boolean(pano?.running), home: onHome(), drawMs: pano ? Math.round(pano.drawMs * 10) / 10 : null, scene: pano?.diagnostics || null };
}

// --------------------------------------------------------------- settings --
const PRESETS = [
  ['overworld', 'Overworld', 'Grass, oak and a blue sky', 'grass'],
  ['nether', 'Nether', 'Netherrack, crimson and lava', 'nylium'],
  ['end', 'End', 'End stone and a starry void', 'endstone'],
];
const CHOICES = {
  mcBackground: ['Background', 'Panorama turns slowly on Home. Other pages use block tiles.', [['panorama', 'Panorama'], ['tiles', 'Block tiles'], ['plain', 'None']]],
  mcScene: ['Sky scene', 'Choose a floating sky island or a single block suspended in the sky.', [['island', 'Floating island'], ['oneblock', 'One block']]],
  mcMobCount: ['Mob count', 'Keep the scene quiet or let a few visitors wander through.', [[1, 'One'], [2, 'Two'], [3, 'Three']]],
  mcSceneSpeed: ['Scene speed', 'Controls island rotation, clouds and mob walking speed. Reduced motion keeps the entire scene still.', [[0.5, 'Slow'], [1, 'Normal'], [1.5, 'Lively']]],
  mcButtons: ['Buttons', 'Texture for regular buttons. Play keeps your accent colour.', [['stone', 'Stone'], ['wood', 'Dark oak']]],
  mcCorners: ['Corners', null, [['blocky', 'Blocky'], ['rounded', 'Rounded']]],
  mcFont: ['Pixel font', 'Applies to headings and buttons, or to all text.', [['headings', 'Headings and buttons'], ['all', 'All text'], ['system', 'Off']]],
  mcSkinPose: ['Skin pose', 'Your 3D skin on Home.', [['idle', 'Idle'], ['walk', 'Walk'], ['run', 'Run'], ['zombie', 'Zombie'], ['sit', 'Sit'], ['dance', 'Dance']]],
  mcSkinTurn: ['Skin turning', 'Drag the model to turn it yourself at any time.', [['sway', 'Sway'], ['spin', 'Spin'], ['still', 'Still']]],
  mcSkinPedestal: ['Skin stand', null, [['grass', 'Grass block'], ['none', 'None']]],
};

/**
 * Rows for Settings > Appearance > Minecraft style. `ctx` supplies the
 * settings page's own helpers so rows match the rest of the page.
 */
export function settingsRows({ settings: s, save, row, toggle, redraw, resetKeys }) {
  const master = toggle(s.mcStyle === true, 'Minecraft style', async (on) => { await save({ mcStyle: on }, on ? 'Minecraft style on' : 'Minecraft style off'); redraw(); });
  const rows = [row('Minecraft style', 'Pixel textures, blocky buttons and a floating island on Home. Turn it off here at any time.', master)];
  if (s.mcStyle !== true) return rows;

  const presets = el('div', { class: 'mc-preset-pick', role: 'group', 'aria-label': 'Minecraft presets' }, PRESETS.map(([key, name, desc, block]) => {
    const on = s.mcPreset === key;
    return el('button', {
      type: 'button', class: on ? 'on' : '', 'aria-pressed': String(on), 'aria-label': `${name} preset`,
      onclick: async () => { await save({ mcPreset: key }); redraw(`[aria-label="${name} preset"]`); },
    }, el('img', { src: blockIconUrl(block, 96), alt: '' }), el('span', {}, el('b', {}, name), el('small', {}, desc)));
  }));
  const presetRow = row('Preset', 'Sets the panorama, background tiles and the Home icon.', presets);
  presetRow.classList.add('wide');
  rows.push(presetRow);

  const select = (key) => {
    const [label, desc, options] = CHOICES[key];
    const input = el('select', { class: 'input appearance-select', 'aria-label': label }, options.map(([value, text]) => el('option', { value }, text)));
    input.value = s[key];
    input.addEventListener('change', () => save({ [key]: ['mcMobCount', 'mcSceneSpeed'].includes(key) ? Number(input.value) : input.value }));
    return row(label, desc, input);
  };
  rows.push(select('mcBackground'), select('mcScene'));
  rows.push(row('Wandering mobs', 'Sheep in the Overworld, pigmen in the Nether and Endermen in the End. Only on the Home panorama, never over your controls.', toggle(s.mcMobs !== false, 'Wandering mobs', (on) => save({ mcMobs: on }))));
  rows.push(select('mcMobCount'), select('mcSceneSpeed'), select('mcButtons'), select('mcCorners'), select('mcFont'));
  rows.push(row('Block icons', 'Blocks for sidebar and instance icons. Custom instance images are kept.', toggle(s.mcBlockIcons === true, 'Block icons', (on) => save({ mcBlockIcons: on }))));
  rows.push(row('Card tilt', 'Cards lean slightly towards the pointer. Off with reduced motion.', toggle(s.mcTilt === true, 'Card tilt', (on) => save({ mcTilt: on }))));
  rows.push(select('mcSkinPose'), select('mcSkinTurn'), select('mcSkinPedestal'));
  rows.push(row('Turn off and reset', 'Switches the Minecraft style off and restores its choices. Other appearance settings are kept.',
    el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Turn off and reset Minecraft style', onclick: async () => {
      await save(Object.fromEntries(resetKeys.map(k => [k, null])), 'Minecraft style turned off and reset');
      redraw('[aria-label="Minecraft style"]');
    } }, icon('refresh'), 'Turn off and reset')));
  return rows;
}
