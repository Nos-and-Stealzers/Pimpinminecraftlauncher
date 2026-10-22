// Terrain textures, second generation: built from tileable fractal noise
// that is quantised into a few hand-picked shades (like an indexed-palette
// painting) with checker dithering only where two shades meet. This keeps
// large calm shapes, no lone-pixel noise and, because the shapes are soft
// and irregular, no obvious 3×3 repetition when blocks sit side by side.
// Light still comes from the top-left: chips get a lit top-left edge and a
// shaded bottom-right edge, cracks get a lit lip below them.
const { Px, ramp, rng, noise, despeckle, blob, lump, layer, Image, rgba, mixc } = require('./lib');
const base = require('./blocks');

// New definitions go into X; they are also written into blocks.T so ores and
// other textures that build on stone/deepslate/dirt pick up the new art.
const X = {};
const T = new Proxy(X, { set(o, k, v) { o[k] = v; base.T[k] = v; return true; }, get(o, k) { return k in o ? o[k] : base.T[k]; } });
const isP = (st) => st === 'looks';

/** Tileable gradient (Perlin) noise in about [-1,1] with cx × cy cells per tile. */
function perlin(S, cx, cy, seed) {
  const r = rng(seed);
  const g = Array.from({ length: cx * cy }, () => {
    const a = r.f() * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  });
  const G = (i, j) => g[(((j % cy) + cy) % cy) * cx + (((i % cx) + cx) % cx)];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  // shift the lattice off the tile edges (lattice points are always 0)
  const sx = 0.2 + r.f() * 0.6;
  const sy = 0.2 + r.f() * 0.6;
  return (x, y) => {
    const fx = ((x + 0.5) / S) * cx + sx;
    const fy = ((y + 0.5) / S) * cy + sy;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const dot = (i, j) => {
      const [gx, gy] = G(x0 + i, y0 + j);
      return gx * (tx - i) + gy * (ty - j);
    };
    const u = fade(tx);
    const v = fade(ty);
    const a = dot(0, 0) + (dot(1, 0) - dot(0, 0)) * u;
    const b = dot(0, 1) + (dot(1, 1) - dot(0, 1)) * u;
    return (a + (b - a) * v) * 1.4;
  };
}

/**
 * Tileable fractal noise in [0,1]; octaves are [cellsX, cellsY, weight].
 * `warp` bends the sample position by another noise so shapes look organic
 * instead of following the lattice.
 */
function fbm(S, seed, octaves, { warp = 0 } = {}) {
  const fns = octaves.map(([cx, cy, w], i) => [perlin(S, cx, cy, seed * 31 + i * 977), w]);
  const wx = warp ? perlin(S, 3, 3, seed * 7 + 5) : null;
  const wy = warp ? perlin(S, 3, 3, seed * 7 + 9) : null;
  const raw = new Float32Array(S * S);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // warp offsets are whole multiples of nothing: keep them small so tiling holds
    const ox = warp ? wx(x, y) * warp * S : 0;
    const oy = warp ? wy(x, y) * warp * S : 0;
    let v = 0;
    for (const [f, w] of fns) v += f(x + ox, y + oy) * w;
    raw[y * S + x] = v;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return (x, y) => (raw[(((y % S) + S) % S) * S + (((x % S) + S) % S)] - lo) / (hi - lo || 1);
}

/**
 * Quantise a field into levels base..base+fractions.length-1 so each level
 * covers the given share of the tile. Pixels close to a threshold are
 * checker-dithered between the two neighbouring levels (rough materials).
 */
function bands(S, field, fractions, { base = 0, dither = 0.025, wrap = true } = {}) {
  const vals = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) vals.push(field(x, y));
  const sorted = [...vals].sort((a, b) => a - b);
  const th = [];
  let acc = 0;
  for (let i = 0; i < fractions.length - 1; i++) {
    acc += fractions[i];
    th.push(sorted[Math.min(sorted.length - 1, Math.floor(acc * sorted.length))]);
  }
  const px = new Px(S, S, wrap);
  px.fill((x, y) => {
    const v = vals[y * S + x];
    let l = 0;
    while (l < th.length && v >= th[l]) l++;
    if (dither) {
      // just below the next threshold: every other pixel steps up
      if (l < th.length && th[l] - v < dither && (x + y) % 2 === 0) l++;
      else if (l > 0 && v - th[l - 1] < dither && (x + y) % 2 === 1) l--;
    }
    return base + l;
  });
  return px;
}


/**
 * Two-scale shading that hides the tile grid: a soft macro field moves a
 * minority of the tile one shade up or down, a fine field adds small
 * one-shade clusters on top. Nothing large and contrasty enough to repeat
 * visibly, nothing as small as a lone pixel (despeckled afterwards).
 */
function layered(S, seed, { base, macro = [4, 0.25, 0.2], micro = [12, 0.2, 0.2], max = 99, warp = 0.06, stretch = 1 } = {}) {
  const M = fbm(S, seed, [[macro[0], Math.max(1, Math.round(macro[0] / stretch)), 1], [macro[0] * 2, Math.max(1, Math.round((macro[0] * 2) / stretch)), 0.4]], { warp });
  const m = fbm(S, seed + 50, [[micro[0], Math.max(1, Math.round(micro[0] / stretch)), 1], [micro[0] * 2, Math.max(1, Math.round((micro[0] * 2) / stretch)), 0.5]]);
  const q = (f, lo, hi) => {
    const vals = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) vals.push(f(x, y));
    vals.sort((a, b) => a - b);
    return [vals[Math.floor(lo * (vals.length - 1))], vals[Math.floor((1 - hi) * (vals.length - 1))]];
  };
  const [Ml, Mh] = q(M, macro[2], macro[1]);
  const [ml, mh] = q(m, micro[2], micro[1]);
  const px = new Px(S).fill((x, y) => {
    let v = base;
    const a = M(x, y);
    if (a >= Mh) v++;
    else if (a <= Ml) v--;
    const b = m(x, y);
    if (b >= mh) v++;
    else if (b <= ml) v--;
    return Math.max(0, Math.min(max, v));
  });
  despeckle(px);
  return px;
}

/** Small bevelled chips: lit top-left, shaded bottom-right; never lone pixels. */
function chips(px, r, S, count, { v, hi, lo, size = [1.2, 2.4], k = 1, max = 99 }) {
  for (let i = 0; i < count; i++) {
    const rx = (size[0] + r.f() * (size[1] - size[0])) * k;
    const ry = rx * (0.55 + r.f() * 0.35);
    const pts = blob(r, r.i(S), r.i(S), rx, ry, 0.45);
    if (pts.length < 3) continue;
    lump(px, pts, v, { hi, lo, max });
  }
}

/** A thin wandering crack: dark line with a lit lip under it. */
function crack(px, r, x, y, len, dark, lit, dir = 1) {
  for (let i = 0; i < len; i++) {
    px.set(x, y, dark);
    if (lit != null && px.get(x, y + 1) !== dark) px.set(x, y + 1, lit);
    if (r.chance(0.65)) x += dir;
    else y += r.chance(0.5) ? 1 : -1;
  }
}

// ------------------------------------------------------------------ stone --
function stoneLike(S, st, seed, color, o = {}) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 7 : 5;
  const pal = o.pal || ramp(color, n, { contrast: P ? 0.3 : 0.22, hue: 14, tint: 0.035, ...(o.ramp || {}) });
  const mid = Math.floor((n - 1) / 2);
  const px = layered(S, seed, { base: mid, max: n - 1, macro: o.macro || (P ? [4, 0.22, 0.22] : [2, 0.14, 0.14]), micro: o.micro || (P ? [12, 0.18, 0.2] : [8, 0.14, 0.14]), stretch: o.stretch ?? 0.75 });
  // chips: light flakes on the light areas, dark pits on the dark areas
  chips(px, r, S, Math.round((P ? 4 : 2) * (o.chips ?? 1)), { v: mid, hi: 1, lo: 1, size: [1.3, 2.4], k, max: n - 1 });
  if (o.cracks !== 0) {
    for (let c = 0; c < (o.cracks ?? 0); c++) crack(px, r, r.i(S), r.i(S), r.range(3, 6) * k, 0, P ? mid + 1 : null, r.pick([1, -1]));
  }
  despeckle(px);
  return { px, pal, n, mid };
}

T.stone = (S, st) => {
  const { px, pal } = stoneLike(S, st, 1, '#7f8084');
  return px.toImage(pal);
};
T.andesite = (S, st) => {
  const P = isP(st);
  const { px, pal, mid } = stoneLike(S, st, 15, '#88898a', { micro: [P ? 16 : 8, 0.25, 0.25], chips: 1.8, cracks: 0, stretch: 1, ramp: { contrast: P ? 0.38 : 0.28 } });
  return px.toImage(pal);
};
T.granite = (S, st) => {
  const P = isP(st);
  const { px, pal, n } = stoneLike(S, st, 16, '#9a6a56', { micro: [P ? 16 : 8, 0.25, 0.25], chips: 1.4, cracks: 0, stretch: 1, ramp: { contrast: P ? 0.36 : 0.26, hue: 10 } });
  const fl = pal.length;
  pal.push(...ramp('#d9b8a6', 2, { contrast: 0.18, hue: 8 }), rgba('#4c3029'));
  const r = rng(160);
  for (let i = 0; i < (P ? 12 : 6); i++) {
    const x = r.i(S);
    const y = r.i(S);
    px.stamp(x, y, P ? r.pick([['ab', 'bc'], ['ab.', '.bc'], ['a', 'b', 'c']]) : r.pick([['ab'], ['a', 'b']]), { a: fl + 1, b: fl, c: P ? fl + 2 : fl });
  }
  return px.toImage(pal);
};
T.diorite = (S, st) => {
  const P = isP(st);
  const pal = ramp('#d2d0cc', P ? 6 : 4, { contrast: P ? 0.22 : 0.14, hue: 16, tint: 0.02 });
  const field = fbm(S, 17, [[4, 4, 1], [8, 8, 0.6]], { warp: 0.08 });
  const px = bands(S, field, P ? [0.2, 0.45, 0.35] : [0.3, 0.7], { base: P ? 2 : 1, dither: P ? 0.03 : 0 });
  const dk = pal.length;
  pal.push(...ramp('#5a5961', 3, { contrast: 0.35, hue: 14 }));
  const r = rng(171);
  // dark hornblende clusters: a few bigger ones and some small pairs
  for (let i = 0; i < (P ? 13 : 7); i++) {
    const x = r.i(S);
    const y = r.i(S);
    const big = P && i < 5;
    px.stamp(x, y, big ? r.pick([['.ab', 'abc', 'bc.'], ['ab.', 'bbc', '.cc'], ['.a.', 'abb', '.bc']]) : r.pick([['ab'], ['a', 'c'], ['ab', '.c']]), { a: dk + 2, b: dk + 1, c: dk });
  }
  despeckle(px, (v) => v >= dk);
  return px.toImage(pal);
};
T.tuff = (S, st) => {
  const P = isP(st);
  const { px, pal } = stoneLike(S, st, 19, '#6c6d66', { micro: [P ? 16 : 8, 0.25, 0.25], chips: 1.6, cracks: 0, stretch: 1, ramp: { contrast: P ? 0.34 : 0.24, hue: 20 } });
  const pb = pal.length;
  pal.push(...ramp('#9a9888', 2, { contrast: 0.2 }));
  const r = rng(191);
  for (let i = 0; i < (P ? 10 : 5); i++) px.stamp(r.i(S), r.i(S), P ? r.pick([['ab'], ['a', 'b'], ['ab', 'b.']]) : [['a']][0], { a: pb + 1, b: pb });
  return px.toImage(pal);
};
T.calcite = (S, st) => {
  const P = isP(st);
  const pal = ramp('#dfe0dc', P ? 5 : 4, { contrast: P ? 0.16 : 0.1, hue: 20, mid: P ? 3 : 2 });
  const field = fbm(S, 21, [[4, 4, 1], [8, 8, 0.5]], { warp: 0.1 });
  const px = bands(S, field, P ? [0.15, 0.35, 0.35, 0.15] : [0.3, 0.45, 0.25], { base: 0, dither: P ? 0.03 : 0 });
  return px.toImage(pal);
};

// -------------------------------------------------------------- deepslate --
function deepslateLike(S, st, seed, o = {}) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 7 : 5;
  const pal = ramp(o.color || '#4f4f57', n, { contrast: P ? 0.38 : 0.28, hue: 14, tint: 0.05 });
  const mid = Math.floor((n - 1) / 2);
  // strongly horizontal strata
  const px = layered(S, seed, { base: mid, max: n - 1, macro: P ? [2, 0.18, 0.22] : [2, 0.12, 0.14], micro: P ? [6, 0.16, 0.18] : [4, 0.12, 0.12], stretch: 0.25, warp: 0.03 });
  // horizontal cleavage seams with a lit lip below
  const seams = P ? 4 : 0;
  for (let i = 0; i < seams; i++) {
    let x = r.i(S);
    let y = Math.floor(((i + r.f() * 0.6) * S) / seams);
    const len = r.range(4, 8) * k;
    for (let j = 0; j < len; j++) {
      px.set(x, y, mid - 2);
      if (P) px.set(x, y + 1, mid + 1);
      x++;
      if (r.chance(0.12)) y += r.pick([-1, 1]);
    }
  }
  despeckle(px);
  return { px, pal, n, mid };
}
T.deepslate = (S, st) => {
  const { px, pal } = deepslateLike(S, st, 2);
  return px.toImage(pal);
};
T.deepslate_top = (S, st) => {
  const P = isP(st);
  const r = rng(24);
  const n = P ? 7 : 5;
  const pal = ramp('#4f4f57', n, { contrast: P ? 0.46 : 0.32, hue: 14, tint: 0.05 });
  const mid = Math.floor((n - 1) / 2);
  const field = fbm(S, 24, [[4, 4, 1], [8, 8, 0.5], [16, 16, 0.25]], { warp: 0.08 });
  const px = bands(S, field, P ? [0.12, 0.33, 0.37, 0.18] : [0.25, 0.5, 0.25], { base: mid - (P ? 2 : 1), dither: P ? 0.02 : 0 });
  // end grain: a few concentric-ish ridge arcs
  chips(px, r, S, P ? 6 : 3, { v: mid, hi: 1, lo: 1, size: [1.4, 2.6], k: S / 16, max: n - 1 });
  despeckle(px);
  return px.toImage(pal);
};

// -------------------------------------------------------------------- soil --
T.dirt = (S, st) => {
  const P = isP(st);
  const k = S / 16;
  const r = rng(4);
  const n = P ? 6 : 4;
  const pal = ramp('#86603f', n, { contrast: P ? 0.36 : 0.24, hue: 16, satDark: 0.06 });
  const mid = Math.floor((n - 1) / 2);
  const px = layered(S, 4, { base: mid, max: n - 1, macro: [P ? 4 : 2, P ? 0.2 : 0.15, P ? 0.25 : 0.15], micro: [P ? 14 : 8, P ? 0.22 : 0.16, P ? 0.22 : 0.16] });
  // clods: lit top-left, shaded bottom-right
  chips(px, r, S, P ? 9 : 5, { v: mid, hi: 1, lo: 1, size: [0.9, 1.8], k, max: n - 1 });
  despeckle(px);
  if (P) {
    const pb = pal.length;
    pal.push(...ramp('#8e8983', 3, { contrast: 0.3 }));
    for (let i = 0; i < 4; i++) px.stamp(r.i(S), r.i(S), r.pick([['ab', 'bc'], ['ab']]), { a: pb + 2, b: pb + 1, c: pb });
  }
  return px.toImage(pal);
};

/** Grayscale grass (tinted by the biome colour in game). */
function grassField(S, st, seed) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp('#a2a2a2', n, { contrast: P ? 0.28 : 0.2, hue: 0, tint: 0 });
  const mid = Math.floor((n - 1) / 2);
  const px = layered(S, seed, { base: mid, max: n - 1, macro: [P ? 4 : 2, P ? 0.18 : 0.1, P ? 0.2 : 0.1], micro: [P ? 14 : 8, P ? 0.2 : 0.1, P ? 0.22 : 0.12] });
  // blade tufts: short strokes, lit tip, shaded root, in loose clumps
  const clumps = P ? 14 : 5;
  for (let c = 0; c < clumps; c++) {
    const cx = r.i(S);
    const cy = r.i(S);
    for (let b = 0; b < (P ? 4 : 2); b++) {
      const x = cx + r.range(-2, 2) * (P ? 1 : 1);
      const y = cy + r.range(-2, 2);
      const len = P ? r.range(2, 3) : 2;
      px.set(x, y, Math.min(n - 1, mid + 2));
      for (let j = 1; j < len; j++) px.set(x, y + j, mid + 1);
      px.set(x, y + len, mid - 1);
    }
  }
  despeckle(px);
  return { px, pal, n, mid };
}
T.grass_block_top = (S, st) => {
  const { px, pal } = grassField(S, st, 5);
  return px.toImage(pal);
};

/** Grass hanging over the side: ragged blade tips, darker underside. */
function sideFringe(S, st, seed) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const h = [];
  for (let x = 0; x < S;) {
    const w = r.range(1, 2) * (P ? 1 : 1);
    const base = Math.round((P ? 5 : 3) + r.pick([0, 0, 1, 1, 2, -1]) * k);
    for (let i = 0; i < w && x < S; i++, x++) h.push(base);
  }
  // a few blades hang lower
  for (let d = 0; d < (P ? 5 : 3); d++) {
    const x = r.i(S);
    const len = P ? r.range(2, 3) : r.range(1, 2);
    h[x] += len;
    if (P && r.chance(0.5)) h[(x + 1) % S] += len - 1;
  }
  return h;
}
function grassSide(S, st, seed, overlayOnly) {
  const P = isP(st);
  const n = P ? 6 : 4;
  const mid = Math.floor((n - 1) / 2);
  const pal = overlayOnly ? ramp('#a2a2a2', n, { contrast: P ? 0.34 : 0.22, hue: 0, tint: 0 }) : ramp('#6c9e44', n, { contrast: P ? 0.34 : 0.22, hue: 14 });
  const h = sideFringe(S, st, seed);
  const top = grassField(S, st, 5).px; // continue the top texture's pattern over the edge
  const px = new Px(S, S, true, -1);
  for (let x = 0; x < S; x++) {
    for (let y = 0; y < h[x]; y++) {
      let v = top.get(x, S - 1 - y) ;
      v = Math.max(0, Math.min(n - 1, v));
      if (y === h[x] - 1) v = mid - 1; // shaded tip
      else if (y === h[x] - 2 && P) v = Math.min(v, mid);
      px.set(x, y, v);
    }
  }
  const img = px.toImage(pal);
  if (overlayOnly) return img;
  return layer(T.dirt(S, st), img);
}
T.grass_block_side_overlay = (S, st) => grassSide(S, st, 6, true);
T.grass_block_side = (S, st) => grassSide(S, st, 6, false);

function sandLike(S, st, seed, color) {
  const P = isP(st);
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp(color, n, { contrast: P ? 0.22 : 0.14, hue: 12 });
  const mid = Math.floor((n - 1) / 2);
  const px = layered(S, seed, { base: mid, max: n - 1, macro: [P ? 4 : 2, P ? 0.18 : 0.12, P ? 0.18 : 0.12], micro: [P ? 16 : 8, P ? 0.2 : 0.08, P ? 0.2 : 0.08] });
  // sparse grains: a light grain with a dark one under it
  // a few loose grains, light and dark, never paired into dashes
  for (let i = 0; i < (P ? 10 : 3); i++) px.set(r.i(S), r.i(S), r.chance(P ? 0.6 : 1) ? Math.min(n - 1, mid + 2) : Math.max(0, mid - 2));
  return px.toImage(pal);
}
T.sand = (S, st) => sandLike(S, st, 7, '#dbcf95');
T.red_sand = (S, st) => sandLike(S, st, 107, '#b9652f');

// -------------------------------------------------------------------- ores --
// Ores as a few chunky veins instead of evenly sprinkled pellets: each vein
// is a cluster of 3-5 touching nuggets (or crystals) sharing one dark
// outline, each nugget bevelled towards the top-left light.
const ORE_LOOK = {
  coal_ore: { c: '#38373d', shape: 'lump', light: '#77757f', outline: '#18161b', veins: [3, 3], size: 1.0 },
  iron_ore: { c: '#d6a07e', shape: 'nugget', veins: [3, 2], size: 0.9 },
  copper_ore: { c: '#d0794a', shape: 'nugget', extra: '#58c39b', veins: [3, 2], size: 0.95 },
  gold_ore: { c: '#f2c838', shape: 'nugget', veins: [3, 2], size: 0.85 },
  redstone_ore: { c: '#d42a1e', shape: 'dust', veins: [4, 3], size: 0.7 },
  lapis_ore: { c: '#2f58cc', shape: 'flake', veins: [3, 2], size: 0.95 },
  diamond_ore: { c: '#4bd9df', shape: 'crystal', veins: [3, 2], size: 1 },
  emerald_ore: { c: '#2ec463', shape: 'prism', veins: [2, 2], size: 1 },
  nether_gold_ore: { c: '#f2c838', shape: 'dust', veins: [5, 4], size: 0.7, outline: '#3a1414' },
  nether_quartz_ore: { c: '#ece2d6', shape: 'shard', veins: [4, 3], size: 0.9, outline: '#3d1616' },
};

/** Index map (wrap) of an ore's veins: 0 outline, 1..4 shades, 5 glint, 6 accent. */
// 16× nuggets are too small for noise blobs: use tiny hand-drawn stamps
// (a = lit face, b = body, c = shaded face, h = glint).
const SMALL = {
  lump: [['hb', 'bc'], ['ab.', 'bbc'], ['.a', 'bc']],
  nugget: [['ha', 'bc'], ['ab', 'c.'], ['hb.', '.bc']],
  dust: [['h'], ['a', 'c'], ['ab']],
  flake: [['hab'], ['ab', '.c'], ['ab.', '.bc']],
  crystal: [['.h.', 'abc', '.c.'], ['hb', 'bc']],
  prism: [['h', 'b', 'c'], ['ha', 'bc', 'c.']],
  shard: [['h.', '.b', '.c'], ['hb', '.c']],
};
function smallVeins(name, S, seed) {
  const L = ORE_LOOK[name];
  const r = rng(seed);
  const px = new Px(S, S, true, -1);
  const MAP = { c: 1, b: 3, a: 4, h: 5 };
  const glints = [];
  const nV = L.veins[1] + 1;
  const centres = [];
  const tdist = (a, b) => Math.hypot(Math.min(Math.abs(a[0] - b[0]), S - Math.abs(a[0] - b[0])), Math.min(Math.abs(a[1] - b[1]), S - Math.abs(a[1] - b[1])));
  for (let v = 0; v < nV; v++) {
    let best = null;
    for (let t = 0; t < 60; t++) {
      const p = [r.i(S), r.i(S)];
      const d = Math.min(S, ...centres.map((q) => tdist(p, q)));
      if (!best || d > best[1]) best = [p, d];
    }
    centres.push(best[0]);
    const stamps = SMALL[L.shape];
    const count = L.shape === 'dust' ? 3 : 2;
    const offs = [[0, 0], [2, 1], [-1, 2], [1, -2]];
    for (let j = 0; j < count; j++) {
      const rows = r.pick(stamps);
      const [ox, oy] = offs[j];
      const x0 = best[0][0] + ox;
      const y0 = best[0][1] + oy;
      rows.forEach((row, yy) => [...row].forEach((ch, xx) => {
        if (!(ch in MAP)) return;
        px.set(x0 + xx, y0 + yy, MAP[ch]);
        if (ch === 'h') glints.push([((x0 + xx) % S + S) % S, ((y0 + yy) % S + S) % S]);
      }));
    }
  }
  // outline only where it touches stone below/right (keeps 16× gems chunky, not hollow)
  const src = px.clone();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (src.get(x, y) >= 0) continue;
    if (src.get(x - 1, y) >= 0 || src.get(x, y - 1) >= 0 || src.get(x - 1, y - 1) >= 0) px.set(x, y, 0);
  }
  return { px, glints };
}

function veins(name, S, st, seed) {
  const L = ORE_LOOK[name];
  const P = isP(st);
  if (!P) {
    const { px, glints } = smallVeins(name, S, seed);
    const gp = ramp(L.c, 4, { contrast: 0.44, hue: 20, mid: 2 });
    const outline = L.outline ? rgba(L.outline) : mixc(gp[0], [24, 18, 30, 255], 0.62);
    const hl = L.light ? rgba(L.light) : mixc(gp[3], [255, 255, 238, 255], 0.6);
    return { px, pal: [outline, gp[0], gp[1], gp[2], gp[3], hl, L.extra ? rgba(L.extra) : gp[2]], glints };
  }
  const k = S / 16;
  const r = rng(seed);
  const own = new Px(S, S, true, -1); // which nugget owns a pixel (for per-nugget bevels)
  const px = new Px(S, S, true, -1);
  const nV = P ? L.veins[0] : L.veins[1];
  const centres = [];
  const tdist = (a, b) => Math.hypot(Math.min(Math.abs(a[0] - b[0]), S - Math.abs(a[0] - b[0])), Math.min(Math.abs(a[1] - b[1]), S - Math.abs(a[1] - b[1])));
  let id = 0;
  const glints = [];
  for (let v = 0; v < nV; v++) {
    let best = null;
    for (let t = 0; t < 60; t++) {
      const p = [r.i(S), r.i(S)];
      const d = Math.min(S, ...centres.map((q) => tdist(p, q)));
      if (!best || d > best[1]) best = [p, d];
    }
    const [cx, cy] = best[0];
    centres.push(best[0]);
    const count = L.shape === 'dust' ? r.range(4, 6) : r.range(3, P ? 5 : 3);
    for (let j = 0; j < count; j++) {
      // nuggets huddle together so a vein reads as one cluster
      const spread = (L.shape === 'dust' ? 3.4 : L.shape === 'crystal' ? 2.6 : 2.2) * k * L.size;
      const ang = (j / count) * Math.PI * 2 + r.f() * 1.2;
      const rad = j === 0 ? 0 : spread * (0.6 + r.f() * 0.4);
      const ox = cx + Math.round(Math.cos(ang) * rad);
      const oy = cy + Math.round(Math.sin(ang) * rad * 0.8);
      let pts;
      const sz = L.size * k;
      if (L.shape === 'crystal') {
        // diamond rhombus
        const h = Math.max(1, Math.round((P ? r.range(2, 3) : r.range(1, 2)) * (P ? 1 : 1) * (k > 1 ? 1 : 1)));
        pts = [];
        for (let yy = -h; yy <= h; yy++) for (let xx = -h; xx <= h; xx++) if (Math.abs(xx) + Math.abs(yy) <= h) pts.push([ox + xx, oy + yy]);
      } else if (L.shape === 'prism' || L.shape === 'shard') {
        const w = L.shape === 'prism' ? (P ? 2 : 1) : 1;
        const h = (P ? r.range(3, 5) : r.range(2, 3));
        pts = [];
        const lean = L.shape === 'shard' ? r.pick([-1, 1]) : 0;
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) pts.push([ox + xx + Math.round((lean * yy) / 2), oy + yy]);
        if (L.shape === 'prism' && P) { pts.push([ox, oy - 1]); pts.push([ox + 1, oy + h]); }
      } else {
        const rx = Math.max(P ? 0 : 1.1, (L.shape === 'dust' ? 0.7 + r.f() * 0.5 : L.shape === 'flake' ? 1.3 + r.f() * 0.8 : 1.1 + r.f() * 0.7) * sz);
        const ry = rx * (L.shape === 'flake' ? 0.6 : 0.8 + r.f() * 0.25);
        pts = blob(r, ox, oy, Math.max(0.6, rx), Math.max(0.6, ry), L.shape === 'lump' ? 0.55 : 0.3);
        if (!pts.length) pts = [[ox, oy]];
      }
      id++;
      for (const [x, y] of pts) own.set(x, y, id);
    }
  }
  // shade: per nugget, lit top-left edge, dark bottom-right edge
  const has = (x, y) => own.get(x, y) >= 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = own.get(x, y);
    if (o < 0) {
      if (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1)) px.set(x, y, 0);
      continue;
    }
    // 16x: shade the whole vein as one lump (per-nugget bevels get too busy)
    const same = (dx, dy) => (P ? own.get(x + dx, y + dy) === o : own.get(x + dx, y + dy) >= 0);
    const tl = !same(-1, 0) || !same(0, -1);
    const br = !same(1, 0) || !same(0, 1);
    let v = 3;
    if (tl && !br) v = 4;
    else if (br && !tl) v = 1;
    else if (P && (!same(1, 1) || !same(2, 0) || !same(0, 2))) v = 2;
    px.set(x, y, v);
  }
  // one glint per nugget near its top-left
  const seen = new Set();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = own.get(x, y);
    if (o < 0 || seen.has(o)) continue;
    seen.add(o);
    const gx = x + (P ? 1 : 0);
    const gy = y + 1;
    if (own.get(gx, gy) === o && L.shape !== 'dust') {
      px.set(gx, gy, 5);
      glints.push([((gx % S) + S) % S, ((gy % S) + S) % S]);
    }
    if (L.extra && r.chance(0.6)) {
      const ex = x + r.range(0, 2);
      const ey = y + r.range(1, 3);
      if (own.get(ex, ey) === o) px.set(ex, ey, 6);
    }
  }
  if (L.shape === 'dust') for (let i = 0; i < (P ? 6 : 3); i++) {
    const x = r.i(S); const y = r.i(S);
    if (px.get(x, y) >= 3) { px.set(x, y, 5); glints.push([x, y]); }
  }
  const gp = ramp(L.c, 4, { contrast: P ? 0.5 : 0.44, hue: 20, mid: 2 });
  const outline = L.outline ? rgba(L.outline) : mixc(gp[0], [24, 18, 30, 255], 0.62);
  const hl = L.light ? rgba(L.light) : mixc(gp[3], [255, 255, 238, 255], 0.6);
  const pal = [outline, gp[0], gp[1], gp[2], gp[3], hl, L.extra ? rgba(L.extra) : gp[2]];
  return { px, pal, glints };
}

function oreTex(name, baseFn, seed) {
  const fn = (S, st) => {
    const { px, pal, glints } = veins(name, S, st, seed);
    const still = layer(baseFn(S, st), px.toImage(pal));
    if (!isP(st) || !glints.length) return still;
    const g = glints[seed % glints.length];
    const frame = (size) => {
      const f = new Image(S).blit(still, 0, 0);
      f.set(g[0], g[1], [255, 255, 250, 255]);
      const soft = mixc(pal[5], [255, 255, 255, 255], 0.5);
      if (size > 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (px.get(g[0] + dx, g[1] + dy) > 0) f.set((g[0] + dx + S) % S, (g[1] + dy + S) % S, soft);
      return f;
    };
    const img = require('./lib').strip([still, frame(1), frame(2)]);
    img.meta = { animation: { frametime: 2, frames: [{ index: 0, time: 90 + (seed % 7) * 12 }, 1, 2, 2, 1] } };
    return img;
  };
  fn.emissive = (S, st) => {
    const { px, pal } = veins(name, S, st, seed);
    const img = new Image(S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = px.get(x, y);
      if (v === 5 || v === 4) img.set(x, y, pal[v]);
    }
    return img;
  };
  return fn;
}
Object.keys(ORE_LOOK).forEach((name, i) => {
  if (name.startsWith('nether_')) {
    T[name] = oreTex(name, (S, st) => base.T.netherrack(S, st), 500 + i * 17);
    return;
  }
  T[name] = oreTex(name, (S, st) => T.stone(S, st), 100 + i * 17);
  T[`deepslate_${name}`] = oreTex(name, (S, st) => T.deepslate(S, st), 300 + i * 17);
});

// --------------------------------------------------------------- log tops --
// Round growth rings (not squares), a 1-2px bark rim, a soft pith and one
// radial drying crack; the rings wobble with noise so no two look alike.
function logTop(S, st, seed, wood) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const W = base.WOOD[wood];
  const barkN = P ? 4 : 3;
  const ringN = P ? 5 : 4;
  const pal = [...ramp(W.bark, barkN, { contrast: 0.42, hue: 14 }), ...ramp(W.top, ringN, { contrast: P ? 0.28 : 0.2, hue: 14 })];
  const RB = barkN;
  const c = S / 2 - 0.5 + (r.f() - 0.5) * k;
  const cy = S / 2 - 0.5 + (r.f() - 0.5) * k;
  const wob = fbm(S, seed + 3, [[3, 3, 1], [6, 6, 0.4]]);
  const ringW = P ? 2.2 : 1.9;
  const rim = P ? 2 : 1;
  const px = new Px(S, S, false).fill((x, y) => {
    const e = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (e < rim) {
      // bark rim: lit on the top/left edges
      const lit = (x < rim || y < rim) && !(x >= S - rim || y >= S - rim);
      if (wood === 'birch') return e === 0 ? 1 : 2;
      return e === 0 ? (lit ? 1 : 0) : lit ? 2 : 1;
    }
    if (e === rim) return RB + 0; // dark cambium line
    const d = Math.hypot(x - c, (y - cy) * 1.05) + (wob(x, y) - 0.5) * (P ? 2.4 : 1.6);
    const ring = Math.floor(d / ringW);
    if (d < 1.2 * k) return RB + 1; // pith
    const within = d / ringW - ring;
    // dark late-wood line at the end of each ring, light early wood
    if (within > 0.72) return RB + 1;
    return RB + (P ? (ring % 3 === 0 ? 3 : 2) + (within < 0.25 ? 1 : 0) : 2 + (ring % 2));
  });
  // a radial drying crack
  const ang = r.f() * Math.PI * 2;
  for (let t = 1.5 * k; t < S / 2 - rim - 1; t += 0.5) {
    const x = Math.round(c + Math.cos(ang) * t);
    const y = Math.round(cy + Math.sin(ang) * t);
    if (t < S / 3) px.set(x, y, RB);
  }
  return px.toImage(pal);
}
for (const w of Object.keys(base.WOOD)) {
  const s = Object.keys(base.WOOD).indexOf(w) * 50;
  T[`${w}_log_top`] = (S, st) => logTop(S, st, 10 + s, w);
}

// ------------------------------------------------------------ smooth stone --
// Calm, slightly lighter stone with a bevelled rim (slabs show two rims).
function smoothPanel(S, st, rows) {
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = ramp('#a2a4a7', n, { contrast: P ? 0.24 : 0.18, hue: 14, tint: 0.03 });
  const mid = Math.floor((n - 1) / 2);
  const px = layered(S, 212, { base: mid, max: n - 1, macro: [P ? 4 : 2, 0.15, 0.15], micro: [P ? 12 : 8, P ? 0.12 : 0.1, P ? 0.12 : 0.1] });
  const h = S / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * h;
    px.hline(0, y0, S, n - 1).vline(0, y0, h, n - 1).hline(0, y0 + h - 1, S, 0).vline(S - 1, y0, h, 0);
    if (P) px.hline(1, y0 + h - 2, S - 2, 1).vline(S - 2, y0 + 1, h - 2, 1);
  }
  return px.toImage(pal);
}
T.smooth_stone = (S, st) => smoothPanel(S, st, 1);
T.smooth_stone_slab_side = (S, st) => smoothPanel(S, st, 2);

// ------------------------------------------------------------- log sides --
// Bark as long vertical ridges from stretched noise, with deep dark furrows,
// a lit left lip on every ridge and a few knots. Birch and cherry keep their
// own horizontal lenticel marks on top.
function bark(S, st, seed, wood) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const W = base.WOOD[wood];
  const n = P ? 6 : 4;
  if (wood === 'birch') {
    const pal = [...ramp(W.bark, P ? 4 : 3, { contrast: 0.16, hue: 20, mid: P ? 2 : 1 }), ...ramp('#3a3330', 3, { contrast: 0.45, hue: 12 })];
    const D = P ? 4 : 3;
    const px = layered(S, seed, { base: P ? 2 : 1, max: P ? 3 : 2, macro: [P ? 4 : 2, 0.06, 0.1], micro: [P ? 12 : 8, 0.1, 0.12], stretch: 0.4 });
    for (let i = 0; i < (P ? 8 : 5); i++) {
      const x = r.i(S);
      const y = r.i(S);
      const len = r.range(2, 4) * k;
      px.hline(x, y, len, D + 1);
      if (P) px.hline(x + 1, y + 1, Math.max(1, len - 2), D);
      if (P && r.chance(0.5)) px.hline(x, y - 1, len, 3);
    }
    return px.toImage(pal);
  }
  const pal = ramp(W.bark, n, { contrast: P ? 0.5 : 0.36, hue: 16 });
  const mid = Math.floor((n - 1) / 2);
  // ridges: noise stretched 1:6 vertically
  const f = fbm(S, seed, [[P ? 6 : 5, 1, 1], [P ? 12 : 8, 2, 0.5], [P ? 24 : 16, 3, 0.25]], { warp: 0.04 });
  const px = new Px(S).fill((x, y) => {
    const v = f(x, y);
    return v < 0.3 ? 0 : v < 0.45 ? mid - 1 : v < 0.75 ? mid : mid + 1;
  });
  // lit lip on the left side of each ridge, shade on the right
  const src = px.clone();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = src.get(x, y);
    if (v > 0 && src.get(x - 1, y) === 0) px.set(x, y, Math.min(n - 1, v + 1));
    else if (v > 0 && src.get(x + 1, y) === 0 && P) px.set(x, y, Math.max(1, v - 1));
  }
  // horizontal nicks
  for (let i = 0; i < (P ? 6 : 3); i++) {
    const x = r.i(S);
    const y = r.i(S);
    if (px.get(x, y) > 1 && px.get(x + 1, y) > 1) {
      px.hline(x, y, 2, 0);
      px.set(x, y + 1, Math.min(n - 1, px.get(x, y + 1) + 1));
    }
  }
  if (wood === 'cherry') {
    // cherry bark: short pale horizontal lenticels
    for (let i = 0; i < (P ? 12 : 6); i++) {
      const x = r.i(S);
      const y = r.i(S);
      const len = r.range(2, 4) * k;
      px.hline(x, y, len, Math.min(n - 1, mid + 2));
      if (P) px.hline(x, y + 1, len, 0);
    }
  }
  if (wood === 'jungle') {
    const moss = pal.length;
    pal.push(...ramp('#5d7a2e', 2, { contrast: 0.3, hue: 14 }));
    for (let i = 0; i < (P ? 5 : 3); i++) px.stamp(r.i(S), r.i(S), P ? ['.a', 'ab', 'b.'] : ['a', 'b'], { a: moss + 1, b: moss });
  }
  despeckle(px);
  return px.toImage(pal);
}
for (const w of Object.keys(base.WOOD)) {
  const s = Object.keys(base.WOOD).indexOf(w) * 50;
  T[`${w}_log`] = (S, st) => bark(S, st, 9 + s, w);
}

module.exports = { X, ORE_LOOK, logTop, bark, veins, fbm, bands, chips, crack, stoneLike, deepslateLike, grassField, sandLike };
