// The Pimpin resource packs: "Pimpin Performance" (calm 16× textures, no
// animated textures, low fire, clear overlays) and "Pimpin Pretty" (rich 32×
// textures, smooth animated water & lava, custom sun, moon and crosshair).
// Built on demand for the instance's Minecraft version and switched on in
// options.txt. Also one-click FPS / Pretty game-settings presets.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const { T, ORES, MOBS, SKINS, HUD } = require('./pack-art');
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
      'Clean hand-pixelled 16× blocks with calm palettes and outlined, easy-to-spot ores',
      'Matching mobs, default player skins, hotbar, hearts and buttons',
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
      'Hand-pixelled 32× blocks: stones, soils, three woods, leaves, bricks, sandstone and more',
      'Outlined gem ores with highlights (stone and deepslate)',
      'HD mobs, nine original default player skins, a violet-and-gold hotbar and HUD',
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
  andesite: 'stone_andesite',
  diorite: 'stone_diorite',
  granite: 'stone_granite',
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
  spruce_log: 'log_spruce',
  spruce_log_top: 'log_spruce_top',
  spruce_planks: 'planks_spruce',
  spruce_leaves: 'leaves_spruce',
  birch_log: 'log_birch',
  birch_log_top: 'log_birch_top',
  birch_planks: 'planks_birch',
  birch_leaves: 'leaves_birch',
  glass: 'glass',
  glass_pane_top: 'glass_pane_top',
  bricks: 'brick',
  snow: 'snow',
  sandstone: 'sandstone_normal',
  sandstone_top: 'sandstone_top',
  sandstone_bottom: 'sandstone_bottom',
  netherrack: 'netherrack',
  obsidian: 'obsidian',
  white_wool: 'wool_colored_white',
  crafting_table_top: 'crafting_table_top',
  crafting_table_front: 'crafting_table_front',
  crafting_table_side: 'crafting_table_side',
  furnace_front: 'furnace_front_off',
  furnace_front_on: 'furnace_front_on',
  furnace_side: 'furnace_side',
  furnace_top: 'furnace_top',
  torch: 'torch_on',
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

// Modern file names that differ from our texture names.
const MODERN = { magma_block: 'magma' };

// First version a texture exists in (older versions skip it).
const SINCE = {
  magma_block: [1, 10],
  campfire_fire: [1, 14],
  soul_fire_0: [1, 16],
  soul_fire_1: [1, 16],
  deepslate: [1, 17],
  copper_ore: [1, 17],
};

const COMMON = ['stone', 'andesite', 'diorite', 'granite', 'cobblestone', 'dirt', 'grass_block_top', 'grass_block_side', 'grass_block_side_overlay', 'sand', 'gravel',
  'oak_log', 'oak_log_top', 'oak_planks', 'oak_leaves', 'spruce_log', 'spruce_log_top', 'spruce_planks', 'spruce_leaves', 'birch_log', 'birch_log_top', 'birch_planks', 'birch_leaves',
  'glass', 'glass_pane_top', 'bricks', 'snow', 'sandstone', 'sandstone_top', 'sandstone_bottom', 'netherrack', 'obsidian', 'white_wool',
  'crafting_table_top', 'crafting_table_front', 'crafting_table_side', 'furnace_front', 'furnace_front_on', 'furnace_side', 'furnace_top', 'torch',
  'deepslate', 'water_still', 'water_flow', 'lava_still', 'lava_flow',
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
    ['26.3', 97], ['26.1', 84], ['1.21.11', 75], ['1.21.9', 69], ['1.21.7', 64], ['1.21.6', 63], ['1.21.5', 55], ['1.21.4', 46], ['1.21.2', 42], ['1.21', 34], ['1.20.5', 32], ['1.20.3', 22], ['1.20.2', 18],
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

/** Is this texture part of version v? */
function exists(name, v) {
  const since = SINCE[name] || (name.startsWith('deepslate') ? [1, 17] : null);
  if (since && !atLeast(v, ...since)) return false;
  return !isLegacy(v) || !!LEGACY[name];
}

/** Entity texture paths (relative to textures/entity/) per version, with the painter for each. */
function entityFiles(v, st) {
  const out = [];
  const add = (p, fn) => out.push([`entity/${p}.png`, fn]);
  const variants = ['temperate', 'warm', 'cold'];
  const v215 = atLeast(v, 1, 21, 5);
  const v26 = atLeast(v, 26, 1);
  add('zombie/zombie', () => MOBS.zombie(st));
  add('skeleton/skeleton', () => MOBS.skeleton(st));
  add('creeper/creeper', () => MOBS.creeper(st));
  add('spider/spider', () => MOBS.spider(st));
  add(v26 ? 'spider/spider_eyes' : 'spider_eyes', () => MOBS.spider_eyes(st));
  add('enderman/enderman', () => MOBS.enderman(st));
  add('enderman/enderman_eyes', () => MOBS.enderman_eyes(st));
  add('sheep/sheep', () => MOBS.sheep(st));
  if (v215) {
    add('sheep/sheep_wool', () => MOBS.sheep_fur(st));
    add('sheep/sheep_wool_undercoat', () => MOBS.sheep_undercoat(st));
  } else add('sheep/sheep_fur', () => MOBS.sheep_fur(st));
  if (!v215) {
    add('cow/cow', () => MOBS.cow(st));
    add('pig/pig', () => MOBS.pig(st));
    add('chicken', () => MOBS.chicken(st));
  } else {
    // 1.21.5 added climate variants; 26.1 renamed them (cow_warm instead of warm_cow).
    for (const c of variants) {
      const name = (mob) => (v26 ? `${mob}/${mob}_${c}` : `${mob}/${c}_${mob}`);
      add(name('cow'), () => MOBS.cow(st, c, true));
      add(name('pig'), () => MOBS.pig(st, c, true));
      add(name('chicken'), () => MOBS.chicken(st, c));
    }
  }
  // default player skins
  if (atLeast(v, 1, 19, 3)) {
    for (const n of SKINS.SKIN_NAMES) {
      add(`player/wide/${n}`, () => SKINS.skin(n, false));
      add(`player/slim/${n}`, () => SKINS.skin(n, true));
    }
  } else {
    add('steve', () => SKINS.skin('steve', false));
    if (atLeast(v, 1, 8)) add('alex', () => SKINS.skin('alex', true));
  }
  return out;
}

/** Every file of a pack for a Minecraft version, as [path, Buffer|string] pairs. */
function files(id, mcVersion = '1.21.4') {
  const pack = PACKS[id];
  if (!pack) throw new Error('Unknown pack');
  const v = mcVersion;
  const legacy = isLegacy(v);
  const S = pack.size;
  const st = pack.style;
  const out = [];
  const add = (p, data) => out.push([p, data]);
  const tex = 'assets/minecraft/textures';
  add('pack.mcmeta', mcmeta(pack, v));
  add('pack.png', T.pack_icon(st).toPNG());
  add('assets/minecraft/texts/splashes.txt', SPLASHES.join('\n'));
  add('README.txt', `${pack.name}\n\nOriginal textures drawn by the Pimpin Launcher (pixel art painted in code, no Mojang art).\n\n- ${pack.features.join('\n- ')}\n`);

  // blocks
  const names = st === 'perf' ? [...COMMON, ...PERF_ONLY] : COMMON;
  for (const name of names) {
    if (!exists(name, v)) continue;
    const file = legacy ? LEGACY[name] : MODERN[name] || name;
    const img = T[name](S, st);
    const base = `${tex}/${legacy ? 'blocks' : 'block'}/${file}.png`;
    add(base, img.toPNG());
    const tile = name.endsWith('_flow') ? S * 2 : S;
    if (frames(img, tile) > 1) {
      add(`${base}.mcmeta`, JSON.stringify({ animation: { frametime: name.startsWith('lava') ? 3 : 2, interpolate: true } }));
    }
  }

  // mobs and player skins
  for (const [p, fn] of entityFiles(v, st)) add(`${tex}/${p}`, fn().toPNG());

  // hotbar, HUD and buttons
  if (atLeast(v, 1, 20, 2)) {
    for (const s of HUD.sprites(st)) {
      if (s.path === 'hud/air_empty' && !atLeast(v, 1, 21, 2)) continue;
      add(`${tex}/gui/sprites/${s.path}.png`, s.img.toPNG());
      if (s.meta) add(`${tex}/gui/sprites/${s.path}.png.mcmeta`, JSON.stringify(s.meta));
    }
    add(`${tex}/gui/sprites/hud/crosshair.png`, T.crosshair(S, st).toPNG());
  } else {
    add(`${tex}/gui/widgets.png`, HUD.widgetsAtlas(st).toPNG());
  }

  // sky and overlays
  const env = `${tex}/environment`;
  if (st === 'looks') {
    // 1.21.11 moved the sky textures to celestial/ (one file per moon phase).
    if (atLeast(v, 1, 21, 11)) {
      add(`${env}/celestial/sun.png`, T.sun(S, st).toPNG());
      const phases = ['full_moon', 'waning_gibbous', 'third_quarter', 'waning_crescent', 'new_moon', 'waxing_crescent', 'first_quarter', 'waxing_gibbous'];
      const sheet = T.moon_phases();
      phases.forEach((p, i) => add(`${env}/celestial/moon/${p}.png`, sheet.crop((i % 4) * 32, Math.floor(i / 4) * 32, 32, 32).toPNG()));
    } else {
      add(`${env}/sun.png`, T.sun(S, st).toPNG());
      add(`${env}/moon_phases.png`, T.moon_phases().toPNG());
    }
  } else {
    const clear = new Image(64).toPNG();
    add(`${tex}/misc/pumpkinblur.png`, clear);
    add(`${tex}/misc/vignette.png`, clear);
    add(`${tex}/misc/underwater.png`, clear);
  }
  return out;
}

/** Build the pack zip for a Minecraft version. Returns a Buffer. */
function build(id, mcVersion = '1.21.4') {
  const zip = new AdmZip();
  for (const [p, data] of files(id, mcVersion)) zip.addFile(p, Buffer.isBuffer(data) ? data : Buffer.from(data));
  return zip.toBuffer();
}

/** A few textures as data URLs so the UI can show what the pack looks like (two rows of 9). */
function preview(id) {
  const pack = PACKS[id];
  const S = pack.size;
  const st = pack.style;
  const tint = (img, [r, g, b]) => {
    const out = new Image(img.w, Math.min(img.h, img.w));
    out.fill((x, y) => {
      const [pr, pg, pb, pa] = img.get(x, y);
      return [Math.round((pr * r) / 255), Math.round((pg * g) / 255), Math.round((pb * b) / 255), pa];
    });
    return out;
  };
  const first = (img) => (img.h > img.w ? new Image(img.w).blit(img, 0, 0) : img);
  // square crop of a texture region, scaled up (nearest) to `size`
  const crop = (img, x, y, w, size = 32) => {
    const k = size / w;
    return new Image(size).fill((px, py) => img.get(x + Math.floor(px / k), y + Math.floor(py / k)));
  };
  const side = T.grass_block_side(S, st);
  const overlay = tint(T.grass_block_side_overlay(S, st), [124, 189, 74]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (overlay.get(x, y)[3]) side.set(x, y, overlay.get(x, y));
  const k = st === 'looks' ? 2 : 1;
  const face = (img, x, y, w = 8) => crop(img, x * k, y * k, w * k, 32);
  const skinFace = (img) => {
    const out = crop(img, 8, 8, 8, 32);
    const hat = crop(img, 40, 8, 8, 32);
    for (let yy = 0; yy < 32; yy++) for (let xx = 0; xx < 32; xx++) if (hat.get(xx, yy)[3]) out.set(xx, yy, hat.get(xx, yy));
    return out;
  };
  const slot = new Image(24).fill(() => [0, 0, 0, 0]);
  const bar = HUD.hotbar(st);
  for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) slot.set(x + 1, y + 1, bar.get(x, y));
  const sel = HUD.selection(st, 23);
  for (let y = 0; y < 23; y++) for (let x = 0; x < 24; x++) if (sel.get(x, y)[3]) slot.set(x, y, sel.get(x, y));
  const heart = HUD.icon(HUD.HEART, { part: 'container', st });
  const fill = HUD.icon(HUD.HEART, { fill: ['#8e1220', '#d8283a', '#ff6670', '#ffd6d8'], st });
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (fill.get(x, y)[3]) heart.set(x, y, fill.get(x, y));
  const imgs = [
    ['Grass', side],
    ['Stone', T.stone(S, st)],
    ['Cobblestone', T.cobblestone(S, st)],
    ['Planks', T.oak_planks(S, st)],
    ['Diamond ore', T.diamond_ore(S, st)],
    ['Oak log', T.oak_log(S, st)],
    ['Leaves', tint(T.oak_leaves(S, st), [72, 181, 24])],
    ['Water', tint(first(T.water_still(S, st)), [63, 118, 228])],
    ['Lava', first(T.lava_still(S, st))],
    ['Creeper', face(MOBS.creeper(st), 8, 8)],
    ['Zombie', face(MOBS.zombie(st), 8, 8)],
    ['Skeleton', face(MOBS.skeleton(st), 8, 8)],
    ['Pig', face(MOBS.pig(st), 8, 8)],
    ['Enderman', face(MOBS.enderman(st), 8, 8)],
    ['Steve', skinFace(SKINS.skin('steve'))],
    ['Alex', skinFace(SKINS.skin('alex', true))],
    ['Hotbar', crop(slot, 0, 0, 24, 48)],
    ['Hearts', crop(heart, 0, 0, 9, 36)],
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

module.exports = { PACKS, build, files, preview, status, install, remove, setActive, applyPreset, presetInfo, packFormat, isLegacy };
