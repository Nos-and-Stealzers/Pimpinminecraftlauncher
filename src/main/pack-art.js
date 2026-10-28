// Original textures for the Pimpin resource packs, drawn in code like a pixel
// artist would (limited hue-shifted palettes, deliberate clusters, top-left
// light). Nothing here is copied from Mojang; only the file layouts (UV maps,
// atlas regions) follow the game's formats so the art lands in the right place.
//   pack-art/blocks.js - core block textures pack-art/blocks2.js - more blocks, plants
//   pack-art/fx.js    - liquids, fire, sky, icon
//   pack-art/mobs.js   - mob entity textures pack-art/skins.js - default player skins
//   pack-art/hud.js    - hotbar, HUD icons, buttons and the legacy widgets atlas
//   pack-art/items.js  - tools, food, materials   pack-art/entities.js - chests, villager, husk, drowned
const blocks = require('./pack-art/blocks');
const blocks2 = require('./pack-art/blocks2');
const fx = require('./pack-art/fx');
const MOBS = require('./pack-art/mobs');
const SKINS = require('./pack-art/skins');
const HUD = require('./pack-art/hud');
const ENT = require('./pack-art/entities');
const { I: baseItems, LEGACY_ITEMS } = require('./pack-art/items');
const terrain = require('./pack-art/terrain');
const blocks3 = require('./pack-art/blocks3');
const BABY = require('./pack-art/babies');
const polish = require('./pack-art/polish');
const foodArt = require('./pack-art/food-art');
const gearArt = require('./pack-art/gear-art');
const nonliving = require('./pack-art/nonliving');
const oreArt = require('./pack-art/ore-art');
const equipmentArt = require('./pack-art/equipment-art');
const trialArt = require('./pack-art/trial');

// terrain.js redraws the most common terrain (noise-quantised, low repetition)
const T = { ...blocks.T, ...blocks2.T, ...fx.T, ...terrain.X, ...blocks3.T, ...polish.X, ...oreArt.X, ...trialArt.T };
const I = { ...baseItems, ...gearArt.I, ...foodArt.I, ...nonliving.I, ...trialArt.I };
const ITEM_SPECS = [...gearArt.ITEM_SPECS, ...foodArt.ITEM_SPECS, ...nonliving.ITEM_SPECS, ...trialArt.ITEM_SPECS];

module.exports = { T, ORES: blocks.ORES, MOBS, SKINS, HUD, ENT, I, LEGACY_ITEMS, BABY, ITEM_SPECS, equipmentArt, nonliving };
