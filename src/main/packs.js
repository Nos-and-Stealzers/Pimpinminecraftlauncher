// The Pimpin resource packs: "Pimpin Performance" (calm 16× textures, no
// animated textures, low fire, clear overlays) and "Pimpin Pretty" (rich 32×
// textures, animated liquids, fire and ores, OptiFine/Continuity extras,
// custom sun, moon and crosshair). Both cover blocks, items, mobs and HUD.
// Built on demand for the instance's Minecraft version and switched on in
// options.txt. Also one-click FPS / Pretty game-settings presets.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const { T, ORES, MOBS, SKINS, HUD, ENT, I, LEGACY_ITEMS, BABY } = require('./pack-art');
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
      'About 370 calm 16× blocks (on 1.20+): terrain that tiles without a visible grid, ten woods incl. stripped logs and nether stems, glass, wool, terracotta and concrete in all 16 colours, nether and end basics, flowers, saplings and crops',
      'Every ore (stone, deepslate and nether) drawn as clustered veins you can spot from across a cave',
      'Swords, tools, food, ingots, bow and arrow drawn as one matching set',
      'Matching mobs (incl. villager, husk, drowned), chests, default player skins, hotbar, hearts and buttons; baby mobs on 26.1+',
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
    tagline: 'Rich 32× textures with soft shading and living animations.',
    features: [
      'About 370 hand-shaded 32× blocks (on 1.20+): low-noise terrain that tiles without a visible grid, ten woods incl. stripped logs and nether stems, glass and stained glass, wool, terracotta and concrete in all 16 colours, nether and end basics, flowers, saplings and crops',
      'Ores as clustered veins that twinkle now and then (glow in the dark with OptiFine or Continuity)',
      'Connected glass with OptiFine or Continuity',
      'Smooth water and lava, living fire, swirling portals, breathing magma and pulsing sea lanterns',
      'HD tools, weapons, food and materials; HD mobs (incl. villager, husk, drowned), chests and baby mobs on 26.1+',
      'Nine original default player skins, a violet-and-gold hotbar and HUD',
      'Pimpin sun, moon phases, crosshair and splash texts',
    ],
    description: '§dPimpin §fPretty §7— 32× original textures',
  },
};

// ------------------------------------------------------------------ blocks --
// name -> { legacy: pre-1.13 file name (null = didn't exist), since: [a, b, c], file: modern file name }
const W = (legacy, since) => ({ legacy, since });
const BLOCKS = {
  stone: W('stone'), andesite: W('stone_andesite'), diorite: W('stone_diorite'), granite: W('stone_granite'),
  cobblestone: W('cobblestone'), mossy_cobblestone: W('cobblestone_mossy'),
  stone_bricks: W('stonebrick'), mossy_stone_bricks: W('stonebrick_mossy'), cracked_stone_bricks: W('stonebrick_cracked'), chiseled_stone_bricks: W('stonebrick_carved'),
  smooth_stone: W('stone_slab_top'), smooth_stone_slab_side: W('stone_slab_side'), bedrock: W('bedrock'),
  dirt: W('dirt'), coarse_dirt: W('coarse_dirt'), podzol_top: W('dirt_podzol_top'), podzol_side: W('dirt_podzol_side'),
  grass_block_top: W('grass_top'), grass_block_side: W('grass_side'), grass_block_side_overlay: W('grass_side_overlay'), grass_block_snow: W('grass_side_snowed'),
  farmland: W('farmland_dry'), farmland_moist: W('farmland_wet'),
  sand: W('sand'), red_sand: W('red_sand'), gravel: W('gravel'), clay: W('clay'), terracotta: W('hardened_clay'), snow: W('snow'),
  sandstone: W('sandstone_normal'), sandstone_top: W('sandstone_top'), sandstone_bottom: W('sandstone_bottom'),
  red_sandstone: W('red_sandstone_normal'), red_sandstone_top: W('red_sandstone_top'), red_sandstone_bottom: W('red_sandstone_bottom'),
  glass: W('glass'), glass_pane_top: W('glass_pane_top'), bricks: W('brick'), bookshelf: W('bookshelf'),
  tnt_side: W('tnt_side'), tnt_top: W('tnt_top'), tnt_bottom: W('tnt_bottom'),
  netherrack: W('netherrack'), soul_sand: W('soul_sand'), glowstone: W('glowstone'), obsidian: W('obsidian'),
  end_stone: W('end_stone'), end_stone_bricks: W('end_bricks', [1, 9]),
  crafting_table_top: W('crafting_table_top'), crafting_table_front: W('crafting_table_front'), crafting_table_side: W('crafting_table_side'),
  furnace_front: W('furnace_front_off'), furnace_front_on: W('furnace_front_on'), furnace_side: W('furnace_side'), furnace_top: W('furnace_top'),
  torch: W('torch_on'), lantern: W(null, [1, 14]), ladder: W('ladder'),
  oak_door_top: W('door_wood_upper'), oak_door_bottom: W('door_wood_lower'), oak_trapdoor: W('trapdoor'),
  deepslate: W(null, [1, 17]), deepslate_top: W(null, [1, 17]), cobbled_deepslate: W(null, [1, 17]), deepslate_bricks: W(null, [1, 17]), deepslate_tiles: W(null, [1, 17]),
  tuff: W(null, [1, 17]), calcite: W(null, [1, 17]),
  coal_block: W('coal_block'), iron_block: W('iron_block'), gold_block: W('gold_block'), diamond_block: W('diamond_block'),
  emerald_block: W('emerald_block'), lapis_block: W('lapis_block'), redstone_block: W('redstone_block'),
  // plants (grass/fern/sugar cane are tinted by the game)
  fern: W('fern'), dandelion: W('flower_dandelion'), poppy: W('flower_rose'), sugar_cane: W('reeds'),
  // liquids and effects
  water_still: W('water_still'), water_flow: W('water_flow'), lava_still: W('lava_still'), lava_flow: W('lava_flow'),
  fire_0: W('fire_layer_0'), fire_1: W('fire_layer_1'), soul_fire_0: W(null, [1, 16]), soul_fire_1: W(null, [1, 16]), campfire_fire: W(null, [1, 14]),
  nether_portal: W('portal'), magma_block: { legacy: 'magma', since: [1, 10], file: 'magma' }, sea_lantern: W('sea_lantern'), prismarine: W('prismarine_rough'),
};
for (let s = 0; s < 8; s++) BLOCKS[`wheat_stage${s}`] = W(`wheat_stage_${s}`);
const DYE_LEGACY = { light_gray: 'silver' };
const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
for (const c of DYES) {
  BLOCKS[`${c}_wool`] = W(`wool_colored_${DYE_LEGACY[c] || c}`);
}
const WOOD_LEGACY = { oak: 'oak', spruce: 'spruce', birch: 'birch', jungle: 'jungle', acacia: 'acacia', dark_oak: 'big_oak' };
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry']) {
  const l = WOOD_LEGACY[w];
  const since = w === 'mangrove' ? [1, 19] : w === 'cherry' ? [1, 20] : undefined;
  BLOCKS[`${w}_log`] = W(l && `log_${l}`, since);
  BLOCKS[`${w}_log_top`] = W(l && `log_${l}_top`, since);
  BLOCKS[`${w}_planks`] = W(l && `planks_${l}`, since);
  BLOCKS[`${w}_leaves`] = W(l && `leaves_${l}`, since);
}
// Later woods/foliage use the same clean board and leaf-cluster art.
Object.assign(BLOCKS, {
  pale_oak_planks: W(null, [1, 21, 4]), pale_oak_leaves: W(null, [1, 21, 4]),
  bamboo_planks: W(null, [1, 20]),
  azalea_leaves: W(null, [1, 17]), flowering_azalea_leaves: W(null, [1, 17]),
});
for (const o of Object.keys(ORES)) {
  BLOCKS[o] = W(o === 'copper_ore' ? null : o, o === 'copper_ore' ? [1, 17] : undefined);
  BLOCKS[`deepslate_${o}`] = W(null, [1, 17]);
}
BLOCKS.nether_gold_ore = W(null, [1, 16]);
BLOCKS.nether_quartz_ore = W('quartz_ore');

// More of a normal world: polished/chiseled stone, nether and end basics,
// farm blocks, colored glass/terracotta/concrete, stripped logs, plants.
Object.assign(BLOCKS, {
  polished_andesite: W('stone_andesite_smooth'), polished_diorite: W('stone_diorite_smooth'), polished_granite: W('stone_granite_smooth'),
  polished_deepslate: W(null, [1, 17]), chiseled_deepslate: W(null, [1, 17]), cracked_deepslate_bricks: W(null, [1, 17]), cracked_deepslate_tiles: W(null, [1, 17]),
  cut_sandstone: W('sandstone_smooth'), chiseled_sandstone: W('sandstone_carved'), cut_red_sandstone: W('red_sandstone_smooth'),
  quartz_block_side: W('quartz_block_side'), quartz_block_top: W('quartz_block_top'), quartz_block_bottom: W('quartz_block_bottom'),
  smooth_basalt: W(null, [1, 17]), blackstone: W(null, [1, 16]), blackstone_top: W(null, [1, 16]), polished_blackstone: W(null, [1, 16]),
  basalt_side: W(null, [1, 16]), basalt_top: W(null, [1, 16]),
  nether_bricks: W('nether_brick'), red_nether_bricks: W('red_nether_brick', [1, 10]), mud_bricks: W(null, [1, 19]), purpur_block: W('purpur_block', [1, 9]),
  mud: W(null, [1, 19]), packed_mud: W(null, [1, 19]), moss_block: W(null, [1, 17]), rooted_dirt: W(null, [1, 17]),
  mycelium_top: W('mycelium_top'), mycelium_side: W('mycelium_side'),
  dirt_path_top: { legacy: 'grass_path_top', since: [1, 9], file: (v) => (atLeast(v, 1, 17) ? 'dirt_path_top' : 'grass_path_top') },
  dirt_path_side: { legacy: 'grass_path_side', since: [1, 9], file: (v) => (atLeast(v, 1, 17) ? 'dirt_path_side' : 'grass_path_side') },
  soul_soil: W(null, [1, 16]), ice: W('ice'), packed_ice: W('ice_packed'), blue_ice: W(null, [1, 13]),
  crimson_stem: W(null, [1, 16]), crimson_stem_top: W(null, [1, 16]), warped_stem: W(null, [1, 16]), warped_stem_top: W(null, [1, 16]),
  crimson_planks: W(null, [1, 16]), warped_planks: W(null, [1, 16]),
  crimson_nylium: W(null, [1, 16]), crimson_nylium_side: W(null, [1, 16]), warped_nylium: W(null, [1, 16]), warped_nylium_side: W(null, [1, 16]),
  nether_wart_block: W('nether_wart_block', [1, 10]), warped_wart_block: W(null, [1, 16]), shroomlight: W(null, [1, 16]), crying_obsidian: W(null, [1, 16]),
  cactus_side: W('cactus_side'), cactus_top: W('cactus_top'), cactus_bottom: W('cactus_bottom'),
  pumpkin_side: W('pumpkin_side'), pumpkin_top: W('pumpkin_top'), melon_side: W('melon_side'), melon_top: W('melon_top'),
  hay_block_side: W('hay_block_side'), hay_block_top: W('hay_block_top'), bone_block_side: W('bone_block_side', [1, 10]), bone_block_top: W('bone_block_top', [1, 10]),
  raw_iron_block: W(null, [1, 17]), raw_gold_block: W(null, [1, 17]), raw_copper_block: W(null, [1, 17]), copper_block: W(null, [1, 17]),
  netherite_block: W(null, [1, 16]), amethyst_block: W(null, [1, 17]),
  azure_bluet: W('flower_houstonia'), allium: W('flower_allium'), blue_orchid: W('flower_blue_orchid'), oxeye_daisy: W('flower_oxeye_daisy'),
  red_tulip: W('flower_tulip_red'), orange_tulip: W('flower_tulip_orange'), white_tulip: W('flower_tulip_white'), pink_tulip: W('flower_tulip_pink'),
  cornflower: W(null, [1, 14]), lily_of_the_valley: W(null, [1, 14]),
  dead_bush: W('deadbush'), red_mushroom: W('mushroom_red'), brown_mushroom: W('mushroom_brown'),
  oak_sapling: W('sapling_oak'), spruce_sapling: W('sapling_spruce'), birch_sapling: W('sapling_birch'), jungle_sapling: W('sapling_jungle'),
  acacia_sapling: W('sapling_acacia'), dark_oak_sapling: W('sapling_roofed_oak'), cherry_sapling: W(null, [1, 20]),
  tall_grass_bottom: W('double_plant_grass_bottom'), tall_grass_top: W('double_plant_grass_top'), large_fern_bottom: W('double_plant_fern_bottom'), large_fern_top: W('double_plant_fern_top'),
  vine: W('vine'), lily_pad: W('waterlily'),
});
for (let s = 0; s < 4; s++) {
  BLOCKS[`carrots_stage${s}`] = W(`carrots_stage_${s}`);
  BLOCKS[`potatoes_stage${s}`] = W(`potatoes_stage_${s}`);
  BLOCKS[`beetroots_stage${s}`] = W(`beetroots_stage_${s}`, [1, 9]);
}
for (const c of DYES) {
  const l = DYE_LEGACY[c] || c;
  BLOCKS[`${c}_stained_glass`] = W(`glass_${l}`);
  BLOCKS[`${c}_stained_glass_pane_top`] = W(`glass_pane_top_${l}`);
  BLOCKS[`${c}_terracotta`] = W(`hardened_clay_stained_${l}`);
  BLOCKS[`${c}_concrete`] = W(`concrete_${l}`, [1, 12]);
  BLOCKS[`${c}_concrete_powder`] = W(`concrete_powder_${l}`, [1, 12]);
}
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry']) {
  const since = w === 'mangrove' ? [1, 19] : w === 'cherry' ? [1, 20] : [1, 13];
  BLOCKS[`stripped_${w}_log`] = W(null, since);
  BLOCKS[`stripped_${w}_log_top`] = W(null, since);
}
for (const w of ['crimson', 'warped']) {
  BLOCKS[`stripped_${w}_stem`] = W(null, [1, 16]);
  BLOCKS[`stripped_${w}_stem_top`] = W(null, [1, 16]);
}

// Animated in the Pretty pack only; Performance keeps one calm frame of each.
const ANIMATED = ['water_still', 'water_flow', 'lava_still', 'lava_flow', 'fire_0', 'fire_1', 'soul_fire_0', 'soul_fire_1', 'campfire_fire', 'nether_portal', 'magma_block', 'sea_lantern', 'prismarine'];

/** File name of a block texture in version v, or null when that version doesn't have it. */
function blockFile(name, v) {
  const b = BLOCKS[name];
  if (!b) return null;
  if (b.since && !atLeast(v, ...b.since)) return null;
  if (isLegacy(v)) return b.legacy || null;
  if (name === 'short_grass') return atLeast(v, 1, 20, 3) ? 'short_grass' : 'grass';
  if (typeof b.file === 'function') return b.file(v);
  return b.file || name;
}
// "short_grass" was "grass" in 1.13-1.20.2 and "tallgrass" before 1.13
BLOCKS.short_grass = W('tallgrass');

// ------------------------------------------------------------------- items --
const ITEMS = [
  ...['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite'].flatMap((m) => ['sword', 'pickaxe', 'axe', 'shovel'].map((t) => `${m}_${t}`)),
  'stick', 'apple', 'bread', 'cooked_beef', 'coal', 'diamond', 'emerald', 'iron_ingot', 'gold_ingot', 'arrow', 'bow', 'bow_pulling_0', 'bow_pulling_1', 'bow_pulling_2',
];
function itemFile(name, v) {
  if (name.startsWith('netherite') && !atLeast(v, 1, 16)) return null;
  return isLegacy(v) ? LEGACY_ITEMS[name] || name : name;
}

// -------------------------------------------------- OptiFine / Continuity --
// Edge layout of the 47 tiles of the standard "ctm" method (layout data only):
// T/B/L/R = framed edge, a/b/c/d = inner corner pixel (top-left, top-right,
// bottom-left, bottom-right).
const CTM47 = ['TBLR', 'TBL', 'TB', 'TBR', 'TLd', 'TRc', 'Lbd', 'Tcd', 'acd', 'abc', 'bd', 'cd', 'TLR', 'TL', 'T', 'TR', 'BLb', 'BRa', 'Bab', 'Rac', 'bcd', 'abd', 'ab', 'ac',
  'LR', 'L', '', 'R', 'Lb', 'Td', 'Ld', 'Tc', 'd', 'c', 'ad', 'bc', 'BLR', 'BL', 'B', 'BR', 'Ba', 'Rc', 'Bb', 'Ra', 'b', 'a', 'abcd'];

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

/** Entity texture paths (relative to textures/entity/) per version, with the painter for each. */
function entityFiles(v, st) {
  const out = [];
  const add = (p, fn) => out.push([`entity/${p}.png`, fn]);
  const variants = ['temperate', 'warm', 'cold'];
  const v215 = atLeast(v, 1, 21, 5);
  const v26 = atLeast(v, 26, 1);
  add('zombie/zombie', () => MOBS.zombie(st));
  if (atLeast(v, 1, 10)) add('zombie/husk', () => ENT.husk(st));
  if (atLeast(v, 1, 13)) {
    add('zombie/drowned', () => ENT.drowned(st));
    add('zombie/drowned_outer_layer', () => ENT.drowned_outer(st));
  }
  add('villager/villager', () => ENT.villager(st));
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
      // 26.1 gave babies their own models and textures
      if (v26) {
        add(`cow/cow_${c}_baby`, () => BABY.cowBaby(st, c));
        add(`pig/pig_${c}_baby`, () => BABY.pigBaby(st, c));
        add(`chicken/chicken_${c}_baby`, () => BABY.chickenBaby(st, c));
      }
    }
  }
  if (v26) {
    add('zombie/zombie_baby', () => BABY.zombieBaby(st, 'zombie'));
    add('zombie/husk_baby', () => BABY.zombieBaby(st, 'husk'));
    add('zombie/drowned_baby', () => BABY.zombieBaby(st, 'drowned'));
    add('zombie/drowned_outer_layer_baby', () => BABY.drownedOuterBaby(st));
    add('villager/villager_baby', () => BABY.villagerBaby(st));
    add('sheep/sheep_baby', () => BABY.sheepBaby(st));
    add('sheep/sheep_wool_baby', () => BABY.sheepWoolBaby(st));
  }
  // chests: one sheet before 1.15, then separate left/right halves for doubles
  add('chest/normal', () => ENT.chest(st, 'single'));
  if (atLeast(v, 1, 15)) {
    add('chest/normal_left', () => ENT.chest(st, 'left'));
    add('chest/normal_right', () => ENT.chest(st, 'right'));
  } else add('chest/normal_double', () => ENT.chest(st, 'double'));
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

/** Glass tile for one connected-texture case: frame only where the edge is open. */
function glassTile(S, st, code) {
  const img = T.glass(S, st);
  const k = S / 16;
  // clear the default frame, then redraw the edges this case keeps
  for (let i = 0; i < S; i++) for (const [x, y] of [[i, 0], [0, i], [i, S - 1], [S - 1, i], [i, 1], [1, i], [i, S - 2], [S - 2, i]]) {
    if (x > 1 && y > 1 && x < S - 2 && y < S - 2) continue;
    img.set(x, y, [0, 0, 0, 0]);
  }
  const lit = [214, 236, 244, 235];
  const dark = [150, 184, 204, 235];
  const shine = [235, 248, 252, 90];
  const has = (ch) => code.includes(ch);
  for (let i = 0; i < S; i++) {
    if (has('T')) { img.set(i, 0, lit); if (k > 1) img.set(i, 1, shine); }
    if (has('L')) { img.set(0, i, lit); if (k > 1) img.set(1, i, shine); }
    if (has('B')) img.set(i, S - 1, dark);
    if (has('R')) img.set(S - 1, i, dark);
  }
  if (has('a')) img.set(0, 0, lit);
  if (has('b')) img.set(S - 1, 0, dark);
  if (has('c')) img.set(0, S - 1, dark);
  if (has('d')) img.set(S - 1, S - 1, dark);
  return img;
}

/** Every file of a pack for a Minecraft version, as [path, Buffer|string] pairs. */
function files(id, mcVersion = '1.21.4') {
  const pack = PACKS[id];
  if (!pack) throw new Error('Unknown pack');
  const v = mcVersion;
  const legacy = isLegacy(v);
  const S = pack.size;
  const st = pack.style;
  const pretty = st === 'looks';
  const out = [];
  const add = (p, data) => out.push([p, data]);
  const tex = 'assets/minecraft/textures';
  const blockDir = `${tex}/${legacy ? 'blocks' : 'block'}`;
  add('pack.mcmeta', mcmeta(pack, v));
  add('pack.png', T.pack_icon(st).toPNG());
  add('assets/minecraft/texts/splashes.txt', SPLASHES.join('\n'));
  add('README.txt', `${pack.name}\n\nOriginal textures drawn by the Pimpin Launcher (pixel art painted in code, no Mojang art).\n\n- ${pack.features.join('\n- ')}\n`);

  // blocks
  const emissive = [];
  for (const name of Object.keys(BLOCKS)) {
    const file = blockFile(name, v);
    if (!file) continue;
    const img = T[name](S, st);
    const p = `${blockDir}/${file}.png`;
    add(p, img.toPNG());
    if (img.h > img.w) {
      const flow = name.endsWith('_flow');
      const meta = img.meta || { animation: { frametime: name.startsWith('lava') ? 3 : 2, interpolate: true } };
      if (flow || ANIMATED.includes(name) || img.meta) add(`${p}.mcmeta`, JSON.stringify(meta));
    }
    if (pretty && T[name].emissive) {
      add(`${blockDir}/${file}_e.png`, T[name].emissive(S, st).toPNG());
      emissive.push(file);
    }
  }

  // items
  for (const name of ITEMS) {
    const file = itemFile(name, v);
    if (file) add(`${tex}/${legacy ? 'items' : 'item'}/${file}.png`, I[name](S, st).toPNG());
  }

  // mobs, chests and player skins
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
  if (pretty) {
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

  // OptiFine / Continuity extras (ignored by the plain game): emissive ore
  // glints and connected glass, Pretty only.
  if (pretty) {
    const of = 'assets/minecraft/optifine';
    if (emissive.length) add(`${of}/emissive.properties`, 'suffix.emissive=_e\n');
    CTM47.forEach((code, i) => add(`${of}/ctm/glass/${i}.png`, glassTile(S, st, code).toPNG()));
    add(`${of}/ctm/glass/glass.properties`, 'method=ctm\nmatchBlocks=glass\ntiles=0-46\nconnect=block\n');
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
    ['Bookshelf', T.bookshelf(S, st)],
    ['Leaves', tint(T.oak_leaves(S, st), [72, 181, 24])],
    ['Water', tint(first(T.water_still(S, st)), [63, 118, 228])],
    ['Lava', first(T.lava_still(S, st))],
    ['Creeper', face(MOBS.creeper(st), 8, 8)],
    ['Zombie', face(MOBS.zombie(st), 8, 8)],
    ['Skeleton', face(MOBS.skeleton(st), 8, 8)],
    ['Villager', face(ENT.villager(st), 8, 8)],
    ['Diamond sword', I.diamond_sword(S, st)],
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
    // Our packs are built for this exact version, so keep them off the
    // incompatible list: the game skips a listed pack for that launch when
    // it turns out to be compatible ("removed from incompatibility list").
    const inc = (packList(lines, 'incompatibleResourcePacks') || []).filter((p) => p !== entry);
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
