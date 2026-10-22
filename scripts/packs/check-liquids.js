// Regression tests for the liquid grid bug, every frame in both packs.
// A flow texture is 2S wide but the renderer uses a one-block (S) window;
// its four S-square quadrants must be identical, not just its outer edges.
// The periodic painters must also return exactly the same art at t=0 and 1.
// Spatial seam energy must be comparable to adjacent interior-pixel energy;
// forcing equal first/last columns is NOT a valid seamless texture test.
const assert = require('node:assert/strict');
const { T } = require('../../src/main/pack-art');
const { liquid } = require('../../src/main/pack-art/polish');
let frames = 0;
let quadrants = 0;
let loops = 0;
for (const [st, S] of [['perf', 16], ['looks', 32]]) {
  for (const kind of ['lava', 'water']) for (const flow of [false, true]) {
    const name = `${kind}_${flow ? 'flow' : 'still'}`;
    const img = T[name](S, st);
    const W = flow ? S * 2 : S;
    const nf = st === 'looks' ? 32 : 1;
    assert.equal(img.w, W, `${st} ${name} width`);
    assert.equal(img.h, W * nf, `${st} ${name} frame strip`);
    assert.equal(Boolean(img.meta), nf > 1, `${st} ${name} animation metadata`);
    const a = liquid(S, st, { kind, flow, phase: 0, frameCount: 1 });
    const b = liquid(S, st, { kind, flow, phase: 1, frameCount: 1 });
    assert.deepEqual(a.data, b.data, `${st} ${name} temporal seam`);
    loops++;
    let border = 0, interior = 0, nb = 0, ni = 0;
    for (let f = 0; f < nf; f++) {
      const at = (x, y) => img.get(x, f * W + y);
      const delta = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / 4;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (flow) for (const [dx, dy] of [[S, 0], [0, S], [S, S]]) {
          assert.deepEqual(at(x, y), at(x + dx, y + dy), `${st} ${name} frame ${f} quadrant ${dx},${dy}`);
          quadrants++;
        }
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const edge = x + dx === S || y + dy === S;
          const e = delta(at(x, y), at((x + dx) % S, (y + dy) % S));
          if (edge) { border += e; nb++; } else { interior += e; ni++; }
        }
      }
      frames++;
    }
    if (nf > 1) {
      // Last -> first must move like an ordinary frame, not jump on restart.
      const energy = [];
      for (let f = 0; f < nf; f++) {
        let e = 0;
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          const a = img.get(x, f * W + y);
          const b = img.get(x, ((f + 1) % nf) * W + y);
          for (let c = 0; c < 4; c++) e += Math.abs(a[c] - b[c]);
        }
        energy.push(e / (W * W * 4));
      }
      const avg = energy.slice(0, -1).reduce((s, v) => s + v, 0) / (nf - 1);
      assert.ok(energy[nf - 1] < avg * 2, `${st} ${name} last/first animation jump ${energy[nf - 1] / avg}x average`);
    }
    const ratio = (border / nb) / (interior / ni);
    // A hard seam prints an entire row of jumps; allow ordinary noise
    // variation at tile edges, but reject twice the interior average energy.
    assert.ok(ratio < 2, `${st} ${name} boundary energy ${ratio.toFixed(2)}x interior`);
    console.log(`${st} ${name}: ${nf} frames, boundary/interior ${ratio.toFixed(2)}, exact loop and flow period OK`);
  }
}
console.log(`liquids OK (${frames} frames, ${quadrants} flow-quadrant pixels, ${loops} exact loops)`);
