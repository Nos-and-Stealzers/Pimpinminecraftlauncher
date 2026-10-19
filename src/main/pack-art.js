// Original textures for the Pimpin resource packs, drawn in code like a pixel
// artist would (limited hue-shifted palettes, deliberate clusters, top-left
// light). Nothing here is copied from Mojang; only the file layouts (UV maps,
// atlas regions) follow the game's formats so the art lands in the right place.
//   pack-art/blocks.js - block textures      pack-art/fx.js    - liquids, fire, sky, icon
//   pack-art/mobs.js   - mob entity textures pack-art/skins.js - default player skins
//   pack-art/hud.js    - hotbar, HUD icons, buttons and the legacy widgets atlas
const blocks = require('./pack-art/blocks');
const fx = require('./pack-art/fx');
const MOBS = require('./pack-art/mobs');
const SKINS = require('./pack-art/skins');
const HUD = require('./pack-art/hud');

const T = { ...blocks.T, ...fx.T };

module.exports = { T, ORES: blocks.ORES, MOBS, SKINS, HUD };
