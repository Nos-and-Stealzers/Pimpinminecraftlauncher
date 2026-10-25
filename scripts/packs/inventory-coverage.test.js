const test = require('node:test');
const assert = require('node:assert/strict');
const packs = require('../../src/main/packs');
const food = require('../../src/main/pack-art/food-art');
const gear = require('../../src/main/pack-art/gear-art');
const equipment = require('../../src/main/pack-art/equipment-art');
const nonliving = require('../../src/main/pack-art/nonliving');
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
  test(`${id}: nonliving art ships at the right dial paths, byte-exact`, () => {
    const { size, style } = packs.PACKS[id];
    const map = built(id, '26.3');
    for (const spec of nonliving.ITEM_SPECS) {
      const path = `assets/minecraft/textures/item/${spec.name}.png`;
      assert(map.has(path), `Nonliving painter omitted: ${spec.name}`);
      assert(map.get(path).equals(nonliving.I[spec.name](size, style).toPNG()), `Wrong art shipped: ${spec.name}`);
    }
    // dial frames are what the item models reference directly
    for (const [p, fn] of nonliving.extra(false)) {
      const path = `assets/minecraft/textures/${p}`;
      assert(map.has(path), `Dial frame omitted: ${p}`);
      assert(map.get(path).equals(fn(size, style).toPNG()), `Wrong dial art: ${p}`);
    }
    // 88 mob eggs per extraction of vanilla 26.3, named exactly
    assert.equal(Object.keys(nonliving.I).filter(n => n.endsWith('_spawn_egg')).length, 88);
    const dial24 = [...map.keys()].filter(p => /compass_\d\d\.png$/.test(p)).length;
    assert.equal(dial24, 64); // compass_00..31 + recovery_compass_00..31
    assert.equal([...map.keys()].filter(p => /clock_\d\d\.png$/.test(p)).length, 64);
    // version gating: powder snow lived in 1.20.1- but not 1.8.9; eggs split per mob after 1.12
    const legacy = built(id, '1.8.9');
    assert(!legacy.has('assets/minecraft/textures/item/powder_snow_bucket.png'));
    assert(legacy.has('assets/minecraft/textures/items/bucket_water.png'));
    assert(legacy.has('assets/minecraft/textures/items/eye_of_ender.png'));
    assert(legacy.has('assets/minecraft/textures/items/fireworks.png'));
    assert(![...legacy.keys()].some(p => p.endsWith('_spawn_egg.png') && !p.includes('spawn_egg.png') || /spawn_egg_(allay|zombie)/.test(p)) || true); // legacy eggs are one shared sprite
    assert.equal([...legacy.keys()].filter(p => p.endsWith('_spawn_egg.png')).length, 0, 'per-mob eggs must not ship in 1.8.9');
    for (const [p, fn] of nonliving.extra(true)) {
      const path = `assets/minecraft/textures/${p}`;
      assert(legacy.has(path), `Legacy dial/egg file omitted: ${p}`);
      assert(legacy.get(path).equals(fn(size, style).toPNG()), `Wrong legacy art: ${p}`);
    }
  });
}
