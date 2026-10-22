const assert = require('node:assert/strict');
const test = require('node:test');
const equipment = require('../src/main/pack-art/equipment-art');
const { X } = require('../src/main/pack-art/ore-art');
const terrain = require('../src/main/pack-art/terrain');
const polish = require('../src/main/pack-art/polish');
const base = require('../src/main/pack-art/blocks');
const { Image } = require('../src/main/pack-art/lib');

const materials = ['coal', 'iron', 'copper', 'gold', 'redstone', 'lapis', 'diamond', 'emerald'];
const expected = [...materials.flatMap((m) => [`${m}_ore`, `deepslate_${m}_ore`]), 'nether_gold_ore', 'nether_quartz_ore'].sort();
test('complete canonical stone, deepslate and Nether ore registry', () => assert.deepEqual(Object.keys(X).sort(), expected));

test('equipment release paths and exact supported material set', () => {
  const paths = (v) => equipment.files(v, 'fast').map(([p]) => p);
  assert.equal(paths('1.8.9').length, 12);
  assert.equal(paths('1.21.1').length, 16);
  assert.equal(paths('1.21.2').length, 16);
  assert(paths('1.21.1').includes('models/armor/iron_layer_1.png'));
  assert(!paths('1.21.2').some((p) => p.startsWith('models/')));
  assert(paths('1.21.2').includes('entity/equipment/humanoid/turtle_scute.png'));
  assert(!paths('1.21.8').some((p) => p.includes('copper')));
  assert.equal(paths('1.21.9').filter((p) => p.includes('copper')).length, 2);
  assert.equal(paths('26.1').filter((p) => p.includes('humanoid_baby')).length, 9);
  assert.equal(paths('26.3').length, 27);
  assert.throws(() => equipment.files(26.3, 'fast'), TypeError);
  assert.throws(() => equipment.files('26.3', 'bad'), TypeError);
});

test('leather dye base is neutral, overlay undyed; looks has real extra detail', () => {
  const fast = new Map(equipment.files('26.3', 'fast'));
  const looks = new Map(equipment.files('26.3', 'looks'));
  let detailed = 0;
  for (const [path, image] of fast) {
    const high = looks.get(path);
    assert.equal(high.w, image.w * 2);
    assert.equal(high.h, image.h * 2);
    assert.deepEqual(image.data, new Map(equipment.files('26.3', 'fast')).get(path).data);
    for (let y = 0; y < high.h; y++) for (let x = 0; x < high.w; x++) {
      const lo = image.get(Math.floor(x / 2), Math.floor(y / 2)), hi = high.get(x, y);
      assert.equal(hi[3], lo[3], `${path} alpha scale`);
      if (hi[3] && hi.some((v, c) => c < 3 && v !== lo[c])) detailed++;
      if (path.includes('leather') && !path.includes('overlay') && hi[3]) assert(hi[0] === hi[1] && hi[1] === hi[2], `${path} dye base`);
    }
  }
  assert(detailed > 500, `32px edition needs authored detail, got ${detailed}`);
});

for (const style of ['fast', 'looks']) for (const S of [16, 32]) {
  test(`ores ${S}px ${style}: opacity, host identity, restrained mineral area, deterministic animation/emissive`, () => {
    for (const [name, painter] of Object.entries(X)) {
      const rock = name.startsWith('nether_') ? 'netherrack' : name.startsWith('deepslate_') ? 'deepslate' : 'stone';
      const host = (polish.X[rock] || terrain.X[rock] || base.T[rock])(S, style);
      const image = painter(S, style), again = painter(S, style);
      assert.equal(image.w, S);
      assert.equal(image.h % S, 0);
      assert.deepEqual(image.data, again.data, name);
      let unchanged = 0, changed = 0;
      for (let i = 0; i < S * S; i++) {
        assert.equal(image.data[i * 4 + 3], 255);
        if (image.data.subarray(i * 4, i * 4 + 4).every((v, c) => v === host.data[i * 4 + c])) unchanged++; else changed++;
      }
      assert(unchanged > S * S * 0.6, `${name} host coverage ${unchanged}`);
      assert(changed > S * S * 0.06 && changed < S * S * 0.4, `${name} mineral coverage ${changed}`);
      const frames = image.h / S;
      if (frames > 1) {
        assert(image.meta?.animation);
        assert(image.meta.animation.frames.every((f) => (typeof f === 'number' ? f : f.index) < frames));
        let differences = 0;
        for (let i = 0; i < S * S * 4; i++) differences += image.data[i] !== image.data[S * S * 4 + i] ? 1 : 0;
        assert(differences > 0 && differences < 20, name);
      }
      const emissive = painter.emissive(S, style);
      assert.equal(emissive.h, S);
      for (let i = 0; i < S * S; i++) if (emissive.data[i * 4 + 3]) {
        assert.equal(style, 'looks');
        assert(!emissive.data.subarray(i * 4, i * 4 + 3).every((v, c) => v === host.data[i * 4 + c]), `${name} glowing host`);
      }
    }
  });
}

test('32px mineral geometry is independently authored, not 2x stamps', () => {
  for (const [name, painter] of Object.entries(X)) {
    const rock = name.startsWith('nether_') ? 'netherrack' : name.startsWith('deepslate_') ? 'deepslate' : 'stone';
    const hostPainter = polish.X[rock] || terrain.X[rock] || base.T[rock];
    const low = painter(16, 'fast'), high = painter(32, 'looks');
    const lowHost = hostPainter(16, 'fast'), highHost = hostPainter(32, 'looks');
    const differs = (image, host, x, y) => image.get(x, y).some((v, c) => v !== host.get(x, y)[c]);
    let different = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (differs(low, lowHost, Math.floor(x / 2), Math.floor(y / 2)) !== differs(high, highHost, x, y)) different++;
    }
    assert(different > 30, `${name}: ${different} independent geometry pixels`);
  }
});

test('host rock is resolved from live polished registry, not captured ore closures', () => {
  const original = polish.X.stone;
  try {
    polish.X.stone = (S) => new Image(S).fill(() => [11, 22, 33, 255]);
    const image = X.iron_ore(16, 'fast');
    let count = 0;
    for (let i = 0; i < image.data.length; i += 4) if (image.data[i] === 11 && image.data[i + 1] === 22 && image.data[i + 2] === 33) count++;
    assert(count > 160, 'ore painter used a stale host');
  } finally { polish.X.stone = original; }
});
