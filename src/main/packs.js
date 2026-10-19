// The Pimpin resource packs: "Pimpin Performance" (calm 16× textures, no
// animated textures, low fire, clear overlays) and "Pimpin Pretty" (rich 32×
// textures, smooth animated water & lava, custom sun, moon and crosshair).
// Built on demand for the instance's Minecraft version and switched on in
// options.txt. Also one-click FPS / Pretty game-settings presets.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const { T, ORES } = require('./pack-art');
const { Image } = require('./png');

const PACKS = {
  performance: {
    id: 'performance',
    name: 'Pimpin Performance',
    file: 'Pimpin Performance.zip',
    style: 'perf',
    size: 16,
    tagline: 'Calm, clean textures built for FPS and clear PvP.',
    features: [
      'Every animated texture made static (water, lava, fire, portals, magma, sea lanterns, prismarine)',
      'Low fire: flames cover far less of your screen',
      'Clear pumpkin, vignette and underwater overlays',
      'Clean 16× blocks with less visual noise, easier ores to spot',
      'Minimal crosshair',
    ],
    description: '§aPimpin §fPerformance §7— static, clean, low fire',
  },
  pretty: {
    id: 'pretty',
    name: 'Pimpin Pretty',
    file: 'Pimpin Pretty.zip',
    style: 'looks',
    size: 32,
    tagline: 'Rich 32× textures with soft shading and smooth liquids.',
    features: [
      'Original 32× stone, dirt, grass, sand, gravel, wood, leaves, bricks and snow',
      'Shiny gem ores with highlights (stone and deepslate)',
      'Smooth animated water and glowing lava',
      'Clear glass with a shine, rounded cobblestone',
      'Pimpin sun, moon phases, crosshair and splash texts',
    ],
    description: '§dPimpin §fPretty §7— 32× original textures',
  },
};

// name -> legacy (pre-1.13) texture name, or null when the block didn't exist yet.
const LEGACY = {
  stone: 'stone',
  cobblestone: 'cobblestone',
  dirt: 'dirt',
  grass_block_top: 'grass_top',
  grass_block_side: 'grass_side',
  grass_block_side_overlay: 'grass_side_overlay',
  sand: 'sand',
  gravel: 'gravel',
  oak_log: 'log_oak',
  oak_log_top: 'log_oak_top',
  oak_planks: 'planks_oak',
  oak_leaves: 'leaves_oak',
  glass: 'glass',
  bricks: 'brick',
  snow: 'snow',
  deepslate: null,
  water_still: 'water_still',
  water_flow: 'water_flow',
  lava_still: 'lava_still',
  lava_flow: 'lava_flow',
  fire_0: 'fire_layer_0',
  fire_1: 'fire_layer_1',
  soul_fire_0: null,
  soul_fire_1: null,
  campfire_fire: null,
  nether_portal: 'portal',
  magma_block: 'magma',
  sea_lantern: 'sea_lantern',
  prismarine: 'prismarine_rough',
  coal_ore: 'coal_ore',
  iron_ore: 'iron_ore',
  gold_ore: 'gold_ore',
  diamond_ore: 'diamond_ore',
  emerald_ore: 'emerald_ore',
  redstone_ore: 'redstone_ore',
  lapis_ore: 'lapis_ore',
  copper_ore: null,
};

const COMMON = ['stone', 'cobblestone', 'dirt', 'grass_block_top', 'grass_block_side', 'grass_block_side_overlay', 'sand', 'gravel', 'oak_log', 'oak_log_top', 'oak_planks', 'oak_leaves', 'glass', 'bricks', 'snow', 'deepslate', 'water_still', 'water_flow', 'lava_still', 'lava_flow',
  ...Object.keys(ORES), ...Object.keys(ORES).map((o) => `deepslate_${o}`)];
const PERF_ONLY = ['fire_0', 'fire_1', 'soul_fire_0', 'soul_fire_1', 'campfire_fire', 'nether_portal', 'magma_block', 'sea_lantern', 'prismarine'];

const SPLASHES = [
  "Pimpin' ain't easy!",
  'Now with 100% more pimp!',
  'Drippin\' in diamonds!',
  'Blocky and proud!',
  'FPS go brrr!',
  'Made in the Pimpin Launcher!',
  'Shaders? We got shaders!',
  'Low fire, high style!',
  'Touch grass (block)!',
  'Creeper, aw man... not today!',
  'Smooth like lava!',
  'Respawn and keep pimpin\'!',
  'Certified fresh textures!',
  'Mine responsibly!',
  'Now in 32 pixels of glory!',
];

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(v || '');
  if (!m) return [99, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
}

const atLeast = (v, a, b, c = 0) => {
  const [x, y, z] = parseVersion(v);
  return x !== a ? x > a : y !== b ? y > b : z >= c;
};

const isLegacy = (v) => !atLeast(v, 1, 13);

/** pack_format for a Minecraft version (newer unknown versions get the newest we know). */
function packFormat(v) {
  const table = [
    ['1.21.9', 69], ['1.21.7', 64], ['1.21.6', 63], ['1.21.5', 55], ['1.21.4', 46], ['1.21.2', 42], ['1.21', 34], ['1.20.5', 32], ['1.20.3', 22], ['1.20.2', 18],
    ['1.20', 15], ['1.19.4', 13], ['1.19.3', 12], ['1.19', 9], ['1.18', 8], ['1.17', 7], ['1.16.2', 6], ['1.15', 5], ['1.13', 4], ['1.11', 3], ['1.9', 2],
  ];
  for (const [min, f] of table) {
    const [a, b, c] = parseVersion(min);
    if (atLeast(v, a, b, c)) return f;
  }
  return 1;
}

function mcmeta(pack, v) {
  const f = packFormat(v);
  const meta = { pack_format: f, description: pack.description };
  // Newer games read a supported range; older ones ignore the extra fields.
  if (f >= 18) meta.supported_formats = { min_inclusive: 18, max_inclusive: 999 };
  if (f >= 64) Object.assign(meta, { min_format: 18, max_format: 999 });
  return JSON.stringify({ pack: meta }, null, 2);
}

const frames = (img, size) => img.h / size;

/** Build the pack zip for a Minecraft version. Returns a Buffer. */
function build(id, mcVersion = '1.21.4') {
  const pack = PACKS[id];
  if (!pack) throw new Error('Unknown pack');
  const legacy = isLegacy(mcVersion);
  const S = pack.size;
  const zip = new AdmZip();
  const add = (p, data) => zip.addFile(p, Buffer.isBuffer(data) ? data : Buffer.from(data));
  add('pack.mcmeta', mcmeta(pack, mcVersion));
  add('pack.png', T.pack_icon(pack.style).toPNG());
  add('assets/minecraft/texts/splashes.txt', SPLASHES.join('\n'));
  add('README.txt', `${pack.name}\n\nOriginal textures drawn by the Pimpin Launcher (procedural, no Mojang art).\n\n- ${pack.features.join('\n- ')}\n`);

  const names = pack.style === 'perf' ? [...COMMON, ...PERF_ONLY] : COMMON;
  for (const name of names) {
    const file = legacy ? LEGACY[name] : name;
    if (legacy && !file) continue;
    const img = T[name](S, pack.style);
    const base = `assets/minecraft/textures/${legacy ? 'blocks' : 'block'}/${file}.png`;
    add(base, img.toPNG());
    const tile = name.endsWith('_flow') ? S * 2 : S;
    if (frames(img, tile) > 1) {
      add(`${base}.mcmeta`, JSON.stringify({ animation: { frametime: name.startsWith('lava') ? 3 : 2, interpolate: true } }));
    }
  }

  const env = 'assets/minecraft/textures/environment';
  if (pack.style === 'looks') {
    add(`${env}/sun.png`, T.sun(S, pack.style).toPNG());
    add(`${env}/moon_phases.png`, T.moon_phases().toPNG());
    // 1.21.9+ keeps the sky textures under celestial/.
    add(`${env}/celestial/sun.png`, T.sun(S, pack.style).toPNG());
  } else {
    const clear = new Image(64).toPNG();
    add('assets/minecraft/textures/misc/pumpkinblur.png', clear);
    add('assets/minecraft/textures/misc/vignette.png', clear);
    add('assets/minecraft/textures/misc/underwater.png', clear);
  }
  if (!legacy) add('assets/minecraft/textures/gui/sprites/hud/crosshair.png', T.crosshair(S, pack.style).toPNG());
  return zip.toBuffer();
}

/** A few textures as data URLs so the UI can show what the pack looks like. */
function preview(id) {
  const pack = PACKS[id];
  const S = pack.size;
  const tint = (img, [r, g, b]) => {
    const out = new Image(img.w, Math.min(img.h, img.w));
    out.fill((x, y) => {
      const [pr, pg, pb, pa] = img.get(x, y);
      return [Math.round((pr * r) / 255), Math.round((pg * g) / 255), Math.round((pb * b) / 255), pa];
    });
    return out;
  };
  const first = (img) => (img.h > img.w ? new Image(img.w).blit(img, 0, 0) : img);
  const side = T.grass_block_side(S, pack.style);
  const overlay = tint(T.grass_block_side_overlay(S, pack.style), [124, 189, 74]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (overlay.get(x, y)[3]) side.set(x, y, overlay.get(x, y));
  const imgs = [
    ['Grass', side],
    ['Stone', T.stone(S, pack.style)],
    ['Cobblestone', T.cobblestone(S, pack.style)],
    ['Planks', T.oak_planks(S, pack.style)],
    ['Diamond ore', T.diamond_ore(S, pack.style)],
    ['Oak log', T.oak_log(S, pack.style)],
    ['Leaves', tint(T.oak_leaves(S, pack.style), [72, 181, 24])],
    ['Water', tint(first(T.water_still(S, pack.style)), [63, 118, 228])],
    ['Lava', first(T.lava_still(S, pack.style))],
  ];
  return imgs.map(([label, img]) => ({ label, url: `data:image/png;base64,${img.toPNG().toString('base64')}` }));
}

// --------------------------------------------------------------- options --
async function readOptions(gameDir) {
  try {
    return (await fsp.readFile(path.join(gameDir, 'options.txt'), 'utf8')).split(/\r?\n/);
  } catch {
    return [];
  }
}

async function writeOptions(gameDir, patch) {
  const lines = (await readOptions(gameDir)).filter(Boolean);
  for (const [key, value] of Object.entries(patch)) {
    const i = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (i >= 0) lines[i] = `${key}:${value}`;
    else lines.push(`${key}:${value}`);
  }
  await fsp.mkdir(gameDir, { recursive: true });
  await fsp.writeFile(path.join(gameDir, 'options.txt'), `${lines.join('\n')}\n`);
}

function packList(lines, key) {
  const line = lines.find((l) => l.startsWith(`${key}:`));
  try {
    return line ? JSON.parse(line.slice(key.length + 1)) : null;
  } catch {
    return null;
  }
}

const packEntry = (file, mcVersion) => (isLegacy(mcVersion) ? file : `file/${file}`);

/** Turn a pack in resourcepacks/ on or off in options.txt. */
async function setActive(gameDir, file, mcVersion, on) {
  const lines = await readOptions(gameDir);
  const entry = packEntry(file, mcVersion);
  let list = packList(lines, 'resourcePacks') || (isLegacy(mcVersion) ? [] : ['vanilla']);
  list = list.filter((p) => p !== entry);
  // Modern lists go bottom → top; legacy lists go top → bottom.
  if (on) list = isLegacy(mcVersion) ? [entry, ...list] : [...list, entry];
  const patch = { resourcePacks: JSON.stringify(list) };
  if (!isLegacy(mcVersion)) {
    // Don't ask "made for a different version?" for our own packs.
    let inc = (packList(lines, 'incompatibleResourcePacks') || []).filter((p) => p !== entry);
    if (on) inc = [...inc, entry];
    patch.incompatibleResourcePacks = JSON.stringify(inc);
  }
  await writeOptions(gameDir, patch);
}

async function status(gameDir, mcVersion) {
  const lines = await readOptions(gameDir);
  const active = packList(lines, 'resourcePacks') || [];
  return Object.values(PACKS).map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    features: p.features,
    size: p.size,
    installed: fs.existsSync(path.join(gameDir, 'resourcepacks', p.file)),
    active: active.includes(packEntry(p.file, mcVersion)),
  }));
}

async function install(gameDir, id, mcVersion, activate = true) {
  const pack = PACKS[id];
  if (!pack) throw new Error('Unknown pack');
  await fsp.mkdir(path.join(gameDir, 'resourcepacks'), { recursive: true });
  await fsp.writeFile(path.join(gameDir, 'resourcepacks', pack.file), build(id, mcVersion));
  if (activate) await setActive(gameDir, pack.file, mcVersion, true);
  return status(gameDir, mcVersion);
}

async function remove(gameDir, id, mcVersion) {
  const pack = PACKS[id];
  await setActive(gameDir, pack.file, mcVersion, false);
  await fsp.rm(path.join(gameDir, 'resourcepacks', pack.file), { force: true });
  return status(gameDir, mcVersion);
}

// ---------------------------------------------------- game-settings presets --
const PRESETS = {
  fps: {
    name: 'FPS settings',
    changes: ['Render distance 8, simulation distance 6', 'Fast graphics, clouds off', 'Minimal particles, no entity shadows', 'Smooth lighting & biome blend off', 'VSync off, unlimited frame rate', 'Entities render a little closer'],
    options: (v) => ({
      renderDistance: 8,
      simulationDistance: atLeast(v, 1, 18) ? 6 : undefined,
      graphicsMode: atLeast(v, 1, 16) ? 0 : undefined,
      fancyGraphics: atLeast(v, 1, 16) ? undefined : false,
      renderClouds: atLeast(v, 1, 13) ? '"false"' : 'false',
      particles: 2,
      entityShadows: false,
      ao: atLeast(v, 1, 19) ? false : 0,
      biomeBlendRadius: atLeast(v, 1, 13) ? 0 : undefined,
      mipmapLevels: 0,
      enableVsync: false,
      maxFps: 260,
      entityDistanceScaling: atLeast(v, 1, 16) ? 0.75 : undefined,
    }),
  },
  balanced: {
    name: 'Balanced settings',
    changes: ['Render distance 12', 'Fancy graphics, fast clouds', 'Decreased particles', 'Smooth lighting on', 'VSync off'],
    options: (v) => ({
      renderDistance: 12,
      simulationDistance: atLeast(v, 1, 18) ? 8 : undefined,
      graphicsMode: atLeast(v, 1, 16) ? 1 : undefined,
      fancyGraphics: atLeast(v, 1, 16) ? undefined : true,
      renderClouds: atLeast(v, 1, 13) ? '"fast"' : 'fast',
      particles: 1,
      entityShadows: true,
      ao: atLeast(v, 1, 19) ? true : 2,
      biomeBlendRadius: atLeast(v, 1, 13) ? 2 : undefined,
      mipmapLevels: 2,
      enableVsync: false,
      maxFps: 260,
    }),
  },
  pretty: {
    name: 'Pretty settings',
    changes: ['Render distance 16', 'Fancy graphics and clouds', 'All particles and entity shadows', 'Smooth lighting, wide biome blending', 'Full mipmaps for clean far-away textures'],
    options: (v) => ({
      renderDistance: 16,
      simulationDistance: atLeast(v, 1, 18) ? 10 : undefined,
      graphicsMode: atLeast(v, 1, 16) ? 1 : undefined,
      fancyGraphics: atLeast(v, 1, 16) ? undefined : true,
      renderClouds: atLeast(v, 1, 13) ? '"true"' : 'true',
      particles: 0,
      entityShadows: true,
      ao: atLeast(v, 1, 19) ? true : 2,
      biomeBlendRadius: atLeast(v, 1, 13) ? 5 : undefined,
      mipmapLevels: 4,
      enableVsync: true,
      entityDistanceScaling: atLeast(v, 1, 16) ? 1.25 : undefined,
    }),
  },
};

async function applyPreset(gameDir, id, mcVersion) {
  const preset = PRESETS[id];
  if (!preset) throw new Error('Unknown preset');
  // Keys this version doesn't use are left out (undefined).
  const patch = Object.fromEntries(Object.entries(preset.options(mcVersion)).filter(([, v]) => v !== undefined));
  await writeOptions(gameDir, patch);
  return { applied: Object.keys(patch).length };
}

const presetInfo = () => Object.entries(PRESETS).map(([id, p]) => ({ id, name: p.name, changes: p.changes }));

module.exports = { PACKS, build, preview, status, install, remove, setActive, applyPreset, presetInfo, packFormat, isLegacy };
