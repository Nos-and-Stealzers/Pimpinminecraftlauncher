const test = require('node:test');
const assert = require('node:assert/strict');
const packs = require('../../src/main/packs');
const food = require('../../src/main/pack-art/food-art');
const gear = require('../../src/main/pack-art/gear-art');
const equipment = require('../../src/main/pack-art/equipment-art');
const { X: ores } = require('../../src/main/pack-art/ore-art');
const cache = new Map();
function built(id, version) {
  const key = id + '/' + version;
  if (!cache.has(key)) {
    const rows = packs.files(id, version);
    const map = new Map(rows);
    assert.equal(rows.length, map.size, 'Duplicate pack paths: ' + key);
    cache.set(key, map);
  }
  return cache.get(key);
}
const edibleTextures = ['apple','golden_apple','baked_potato','beef','beetroot','beetroot_soup','bread','carrot','chicken','chorus_fruit','cod','cooked_beef','cooked_chicken','cooked_cod','cooked_mutton','cooked_porkchop','cooked_rabbit','cooked_salmon','cookie','dried_kelp','golden_carrot','honey_bottle','melon_slice','mushroom_stew','mutton','poisonous_potato','porkchop','potato','pufferfish','pumpkin_pie','rabbit','rabbit_stew','rotten_flesh','salmon','spider_eye','suspicious_stew','sweet_berries','glow_berries','tropical_fish'];
for (const id of ['performance', 'pretty']) {
  test(`${id}: complete food/equipment art actually ships, rather than only existing in a painter registry`, () => {
    const map = built(id, '26.3');
    const { size, style } = packs.PACKS[id];
    for (const name of edibleTextures) assert(map.has(`assets/minecraft/textures/item/${name}.png`), name);
    assert.equal(edibleTextures.length, 39); // Forty edible IDs: enchanted apple shares golden_apple + glint.
    for (const registry of [food, gear]) for (const spec of registry.ITEM_SPECS) {
      if (spec.name === 'broken_elytra') continue;
      const data = map.get(`assets/minecraft/textures/item/${spec.name}.png`);
      assert(data, `Painter omitted from the assembled pack: ${spec.name}`);
      assert(data.equals(registry.I[spec.name](size, style).toPNG()), `Wrong painter shipped: ${spec.name}`);
    }
    for (const [path, image] of equipment.files('26.3', id === 'pretty' ? 'looks' : 'fast')) {
      assert(map.get('assets/minecraft/textures/' + path)?.equals(image.toPNG()), path);
    }
    for (const name of Object.keys(ores)) {
      const path = `assets/minecraft/textures/block/${name}.png`;
      assert(map.get(path)?.equals(ores[name](size, style).toPNG()), name);
      if (map.get(path).readUInt32BE(20) > size) assert(map.has(path + '.mcmeta'), 'Animated ore needs metadata');
    }
  });
  test(`${id}: legacy names, retired elytra alias and worn-armor path migration are respected`, () => {
    const legacy = built(id, '1.8.9');
    assert(legacy.has('assets/minecraft/textures/items/apple_golden.png'));
    assert(legacy.has('assets/minecraft/textures/items/beef_cooked.png'));
    assert(legacy.has('assets/minecraft/textures/models/armor/iron_layer_1.png'));
    assert(![...legacy.keys()].some(p => /\/item\/|copper_(?:sword|helmet)|netherite|elytra|beetroot/.test(p)));
    const old = built(id, '1.21.1');
    assert(old.has('assets/minecraft/textures/item/broken_elytra.png'));
    assert(!old.has('assets/minecraft/textures/item/elytra_broken.png'));
    assert(old.has('assets/minecraft/textures/models/armor/iron_layer_1.png'));
    const current = built(id, '1.21.4');
    assert(current.has('assets/minecraft/textures/item/elytra_broken.png'));
    assert(!current.has('assets/minecraft/textures/item/broken_elytra.png'));
    assert(current.has('assets/minecraft/textures/entity/equipment/humanoid/iron.png'));
    assert(![...current.keys()].some(p => p.includes('/models/armor/')));
    assert(!current.has('assets/minecraft/textures/item/copper_helmet.png'));
    assert(built(id, '26.3').has('assets/minecraft/textures/entity/equipment/humanoid_baby/copper.png'));
  });
}
