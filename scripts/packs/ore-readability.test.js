const test = require('node:test');
const assert = require('node:assert/strict');
const { X } = require('../../src/main/pack-art/ore-art');
const polish = require('../../src/main/pack-art/polish');
const terrain = require('../../src/main/pack-art/terrain');
const blocks = require('../../src/main/pack-art/blocks');
// In-game review exposed 32px deposits occupying less than half the 16px area.
// Keep distinct geometry, but not a resolution-induced loss of visibility.
test('Pretty ore deposits retain comparable visible mineral area to Performance', () => {
  for (const [name, paint] of Object.entries(X)) {
    const rock = name.startsWith('nether_') ? 'netherrack' : name.startsWith('deepslate_') ? 'deepslate' : 'stone';
    const host = polish.X[rock] || terrain.X[rock] || blocks.T[rock];
    const coverage = size => {
      const a = paint(size, 'looks'), b = host(size, 'looks');
      let changed = 0;
      for (let i = 0; i < size * size; i++) if (a.data.subarray(i*4,i*4+3).some((v,c) => v !== b.data[i*4+c])) changed++;
      return changed / (size * size);
    };
    const lo=coverage(16), hi=coverage(32);
    assert(hi >= lo * .75, `${name}: 32px mineral area ${hi} is too faint vs 16px ${lo}`);
    assert(hi < .4, `${name}: keep the majority of host rock visible`);
  }
});
