// Round-2 polish: redraws of the textures that looked weakest in game
// (liquids, Nether blocks, leaves, planks, big terrain walls). Same rules as
// terrain.js: tileable noise quantised into a few hand-picked shades, no lone
// pixels, nothing distinctive enough to show the 1-block grid from a distance.
// Definitions are also written into blocks.T so textures built on top of them
// (nether ores, nylium sides, slabs) pick up the new art.
const { Px, ramp, rng, despeckle, Image, rgba, mixc, strip } = require('./lib');
const base = require('./blocks');
const terrain = require('./terrain');

const X = {};
const T = new Proxy(X, {
  set(o, k, v) {
    o[k] = v;
    base.T[k] = v;
    // terrain's ore painters and blocks3's BT() prefer terrain.X to base.T;
    // keep that registry in sync too so ore host rock matches bare rock.
    if (k in terrain.X) terrain.X[k] = v;
    return true;
  },
  get(o, k) { return k in o ? o[k] : base.T[k]; },
});
const isP = (st) => st === 'looks';

/** Tileable gradient noise in about [-1,1], cx × cy cells across a period of S pixels. */
function perlin(S, cx, cy, seed) {
  const r = rng(seed);
  const g = Array.from({ length: cx * cy }, () => {
    const a = r.f() * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  });
  const G = (i, j) => g[(((j % cy) + cy) % cy) * cx + (((i % cx) + cx) % cx)];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const ox = r.f();
  const oy = r.f();
  return (x, y) => {
    const fx = ((x + 0.5) / S) * cx + ox;
    const fy = ((y + 0.5) / S) * cy + oy;
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

/** Value at percentile p of a list of numbers. */
const pct = (vals, p) => {
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.floor(p * (s.length - 1))))];
};

// ----------------------------------------------------------------- liquids --
/**
 * Tileable, exactly looping Voronoi cells. Points circle slowly (still) or
 * drift a whole tile down per loop (flow); the sample position is warped by
 * a periodic noise so the cell walls wobble. Returns (x, y, t) -> [F1, F2].
 */
function cellField(S, n, seed, { flow = false, warp = 0.08, sway = 0.12 } = {}) {
  const r = rng(seed);
  const pts = [];
  // jittered grid keeps cells evenly sized (no big blob that marks the tile)
  const g = Math.round(Math.sqrt(n));
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) pts.push({ x: ((i + 0.2 + r.f() * 0.6 + (j % 2) * 0.5) * S) / g, y: ((j + 0.2 + r.f() * 0.6) * S) / g, ph: r.f(), dir: r.chance(0.5) ? 1 : -1 });
  const wx = perlin(S, 2, 2, seed * 3 + 1);
  const wy = perlin(S, 2, 2, seed * 3 + 2);
  const rad = (S / g) * sway;
  return (x, y, t) => {
    const qx = x + wx(x, y - (flow ? t * S : 0)) * warp * S;
    const qy = y + wy(x, y - (flow ? t * S : 0)) * warp * S;
    let f1 = Infinity;
    let f2 = Infinity;
    let id = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const a = (t * p.dir + p.ph) * Math.PI * 2;
      const px = p.x + Math.cos(a) * rad;
      const py = p.y + Math.sin(a) * rad + (flow ? t * S : 0);
      let dx = Math.abs(qx - px) % S;
      let dy = Math.abs(qy - py) % S;
      dx = Math.min(dx, S - dx);
      dy = Math.min(dy, S - dy);
      const d = Math.sqrt(dx * dx + dy * dy * (flow ? 0.45 : 1));
      if (d < f1) { f2 = f1; f1 = d; id = i; } else if (d < f2) f2 = d;
    }
    return [f1, f2, id];
  };
}

function liquid(S, st, { kind, flow, phase = 0, frameCount }) {
  const P = isP(st);
  const frames = frameCount ?? (P ? 32 : 1);
  const lava = kind === 'lava';
  const k = S / 16;
  const sd = (lava ? 142 : 140) + (flow ? 1 : 0);
  const cells = cellField(S, 9, sd, { flow, warp: lava ? 0.09 : 0.07 });
  let pal;
  let pick;
  const fine = perlin(S, 4, 4, sd + 91);
  if (lava) {
    // Toroidal blurred-white-noise fields have no lattice or cell outlines:
    // flowing orange body, bright molten pools and sparse darker cooling skin.
    const make = (seed, radius) => {
      const rr = rng(seed);
      const raw = Float32Array.from({ length: S * S }, () => rr.f());
      const arr = boxBlur(S, raw, radius, radius, 2);
      const lo = pct(arr, 0.02), hi = pct(arr, 0.98);
      const at = (x, y) => arr[(((y % S) + S) % S) * S + (((x % S) + S) % S)];
      return (x, y) => {
        const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
        const a = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
        const b = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
        return (a * (1 - ty) + b * ty - lo) / (hi - lo);
      };
    };
    const broad = make(sd + 30, flow ? 1 : P ? 2 : 1);
    const small = make(sd + 50, flow && !P ? 0 : 1);
    const wx = perlin(S, 3, 3, sd + 80), wy = perlin(S, 3, 3, sd + 81);
    const val = (x, y, t) => {
      const xx = x + wx(x, y) * S * 0.06;
      const yy = y + wy(x, y) * S * 0.06;
      return broad(xx + (flow ? 0 : t * S), yy - t * S * (flow ? 2 : 1)) * 0.8 + small(xx - (flow ? 0 : t * S), yy - t * S * 2) * 0.2;
    };
    const vals = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) vals.push(val(x, y, 0));
    const th = (flow ? (P ? [0.12, 0.32, 0.68, 0.88] : [0.24, 0.76]) : P ? [0.09, 0.22, 0.42, 0.66, 0.84, 0.95] : [0.14, 0.4, 0.74]).map((v) => pct(vals, v));
    // Different flow angles meet on sloped fluid faces. Strong motifs print
    // triangular facets there even if the texture tiles perfectly in UV
    // space, so flowing lava uses fine, close-value turbulence, not pools.
    pal = (flow
      ? (P ? ['#d75b16', '#e7721a', '#f18a20', '#fba22a', '#ffba3d'] : ['#df6b19', '#f48b22', '#ffad32'])
      : (P ? ['#a12c0d', '#ca4812', '#e96718', '#f68a20', '#ffab30', '#ffd456', '#ffe999'] : ['#c14312', '#e9751c', '#ff9f29', '#ffd157'])).map(rgba);
    pick = (x, y, t) => {
      const v = val(x, y, t);
      let l = 0;
      while (l < th.length && v >= th[l]) l++;
      return l;
    };
  } else {
    // grey (biome tinted): calm body, broken light caustic lines where
    // cells meet (a noise mask breaks them so they never form a net)
    const C = P ? ['#9a9a9a', '#a8a8a8', '#b6b6b6', '#c8c8c8', '#dcdcdc'] : ['#a6a6a6', '#b6b6b6', '#cacaca'];
    pal = C.map((c, i, a) => [...rgba(c).slice(0, 3), i === a.length - 1 ? (P ? 200 : 185) : P ? 175 : 170]);
    const mask = perlin(S, 3, 3, sd + 55);
    pick = (x, y, t) => {
      const [f1, f2] = cells(x, y, t);
      const e = (f2 - f1) / k;
      const c = f1 / (f1 + f2) + fine(x, y) * 0.04;
      const on = mask(x - t * S, y) > -0.25;
      if (P) {
        if (on && e < 0.6) return 4;
        if (on && e < 1.4) return 3;
        return c < 0.2 ? 0 : c < 0.33 ? 1 : 2;
      }
      if (on && e < 0.8) return 2;
      return c < 0.24 ? 0 : 1;
    };
  }
  const out = [];
  for (let f = 0; f < frames; f++) {
    // Canonical phase prevents round-off at an exact period from crossing
    // a palette threshold (e.g. x + S versus x in bilinear sampling).
    const t = ((phase + f / frames) % 1 + 1) % 1;
    const px = new Px(S).fill((x, y) => pick(x, y, t));
    despeckle(px);
    let img = px.toImage(pal);
    if (flow) {
      const b2 = new Image(S * 2);
      for (let y = 0; y < S * 2; y++) for (let x = 0; x < S * 2; x++) b2.set(x, y, img.get(x % S, y % S));
      img = b2;
    }
    out.push(img);
  }
  const img = out.length > 1 ? strip(out) : out[0];
  if (out.length > 1) img.meta = { animation: { frametime: lava ? 3 : 2, interpolate: true } };
  return img;
}
T.water_still = (S, st) => liquid(S, st, { kind: 'water', flow: false });
T.water_flow = (S, st) => liquid(S, st, { kind: 'water', flow: true });
T.lava_still = (S, st) => liquid(S, st, { kind: 'lava', flow: false });
T.lava_flow = (S, st) => liquid(S, st, { kind: 'lava', flow: true });

// ------------------------------------------------------------------ nether --
/** Contour lines of a field: pixels just under `lv` whose upper/left neighbour is over it. */
function contour(px, f, S, lv, v, mask = () => true) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (f(x, y) < lv && (f(x, y - 1) >= lv || f(x - 1, y) >= lv) && mask(x, y)) px.set(x, y, v);
  }
}

/**
 * Netherrack: soft fleshy rock in broad two-scale shading, cut by a few
 * wandering low-contrast crevices (dark line, lit lip under it). No pellets,
 * so a wall of it reads as one surface instead of red speckle.
 */
T.netherrack = (S, st) => {
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = ramp('#6c2a2a', n, { contrast: P ? 0.36 : 0.28, hue: 12, satDark: 0.04 });
  const mid = Math.floor((n - 1) / 2);
  const { px } = rock(S, st, 621, '#6c2a2a', { pal, passes: 1 });
  // crevices: contours of a warped field, broken up by a mask
  const f = terrain.fbm(S, 622, [[5, 5, 1], [10, 10, 0.3]], { warp: 0.06 });
  const m = perlin(S, 3, 3, 623);
  const CR = -5; // marker, resolved below
  if (P) contour(px, f, S, 0.5, CR, (x, y) => m(x, y) > 0.1);
  const src = px.clone();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (src.get(x, y) !== CR) continue;
    px.set(x, y, Math.max(0, mid - 1));
    if (src.get(x, y + 1) !== CR) px.set(x, y + 1, Math.min(n - 1, mid + 1));
  }
  despeckle(px);
  return px.toImage(pal);
};

/** Magma: dark cooled plates (Voronoi) with glowing seams; the pretty pack's seams breathe. */
T.magma_block = (S, st) => {
  const P = isP(st);
  const k = S / 16;
  const cells = cellField(S, P ? 9 : 4, 711, { warp: 0.08, sway: 0 });
  const tone = perlin(S, 3, 3, 712);
  const pal = ['#2e110d', '#4a1c14', '#66281a', '#a8401a', '#f07a1e', '#ffc04a'].map(rgba);
  const px = new Px(S).fill((x, y) => {
    const [f1, f2, id] = cells(x, y, 0);
    const e = (f2 - f1) / k;
    if (e < 0.7) return 5;
    if (e < 1.5) return 4;
    if (e < 2.2) return 3;
    const v = tone(x, y) + (id % 3) * 0.25;
    return v > 0.35 ? 2 : v > -0.2 ? 1 : 0;
  });
  despeckle(px);
  if (!P) return px.toImage(pal);
  const dim = pal.map((c, i) => (i >= 3 ? mixc(c, pal[2], 0.4) : c));
  const img = strip([px.toImage(dim), px.toImage(pal), px.toImage(dim)]);
  img.meta = { animation: { frametime: 14, interpolate: true } };
  return img;
};

/** Glowstone: warm crystal cells, each lit from its own centre; soft amber seams instead of black outlines. */
T.glowstone = (S, st) => {
  const P = isP(st);
  const k = S / 16;
  const cells = cellField(S, P ? 16 : 9, 251, { warp: 0.1, sway: 0 });
  const pal = (P ? ['#7a5226', '#a8742e', '#d7a046', '#efc463', '#fde08e', '#fff6cc'] : ['#93652b', '#d7a046', '#f4cc6c', '#fff0b4']).map(rgba);
  const px = new Px(S).fill((x, y) => {
    const [f1, f2, id] = cells(x, y, 0);
    const e = (f2 - f1) / k;
    const c = f1 / (f1 + f2);
    if (P) {
      if (e < 0.7) return 0;
      if (e < 1.6) return 1;
      return c < 0.14 ? 5 : c < 0.26 ? 4 : c < 0.36 || id % 3 === 0 ? 3 : 2;
    }
    if (e < 1) return 0;
    return c < 0.2 ? 3 : c < 0.34 ? 2 : 1;
  });
  despeckle(px);
  return px.toImage(pal);
};

/** Soul sand: soft dunes with a few faint, half-buried faces (no hard stamps). */
T.soul_sand = (S, st) => {
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = ramp('#5a4334', n, { contrast: P ? 0.4 : 0.22, hue: 16 });
  const mid = Math.floor((n - 1) / 2);
  const { px } = terrain.stoneLike(S, st, 252, '#5a4334', { pal, chips: P ? 1.2 : 0.6, cracks: 0, stretch: 1.4, macro: P ? [3, 0.24, 0.24] : [2, 0.14, 0.14], micro: P ? [10, 0.18, 0.18] : [8, 0.12, 0.12] });
  const FACE = P ? ['b..b', 'b..b', '....', '.bb.', 'b..b'] : ['b.b', '...', '.b.'];
  for (const [x, y] of P ? [[5, 6], [21, 20], [13, 25]] : [[3, 4], [10, 11]]) px.stamp(x, y, FACE, { a: mid - 1, b: 0, c: 0 });
  despeckle(px, (v) => v === 0);
  return px.toImage(pal);
};

// ------------------------------------------------------------------ leaves --
/**
 * Leaves as readable clusters: rounded clumps with a leafy scalloped edge,
 * painted back to front (lower clumps overlap upper ones), each lit from the
 * top-left with a dark rim where it overlaps the clump behind it. Deep shade
 * fills the gaps and only the darkest gaps are see-through. Grey for the
 * biome foliage tint (cherry keeps its own pink).
 */
const LEAF = {
  // g: clumps per row (16x, 32x); rf: clump radius as a share of the cell
  oak: { g: [3, 4], rf: 0.66, holes: 0.10, base: 0.6 },
  jungle: { g: [3, 3], rf: 0.68, holes: 0.08, base: 0.58 },
  dark_oak: { g: [3, 4], rf: 0.7, holes: 0.05, base: 0.52 },
  mangrove: { g: [3, 4], rf: 0.64, holes: 0.10, base: 0.6 },
  birch: { g: [4, 5], rf: 0.64, holes: 0.12, base: 0.66 },
  acacia: { g: [3, 5], rf: 0.66, flat: 0.7, holes: 0.14, base: 0.62 },
  spruce: { g: [4, 5], rf: 0.7, flat: 0.6, holes: 0.06, base: 0.6, needles: true },
  cherry: { g: [3, 4], rf: 0.66, holes: 0.1, pink: true },
  pale_oak: { g: [3, 4], rf: 0.66, holes: 0.1, color: '#9fa99d' },
  azalea: { g: [3, 4], rf: 0.66, holes: 0.1, color: '#638b39' },
};
function leafClumps(S, st, kind, seed) {
  const P = isP(st);
  const k = S / 16;
  const L = LEAF[kind];
  const r = rng(seed);
  const g = L.g[P ? 1 : 0];
  const pts = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    pts.push({ x: ((i + 0.1 + r.f() * 0.8 + (j % 2) * 0.5) * S) / g, y: ((j + 0.15 + r.f() * 0.7) * S) / g, rad: ((L.rf * S) / g) * (0.85 + r.f() * 0.3), ph: r.f() * 6.28, lobes: r.range(5, 8), dv: r.pick([0, 0, 0, -0.25, 0.15]) });
  }
  pts.sort((a, b) => a.y - b.y); // back to front
  const own = new Px(S, S, true, -1);
  const light = new Float32Array(S * S);
  pts.forEach((p, id) => {
    const R = p.rad + 1;
    for (let dy = -Math.ceil(R) - 1; dy <= R + 1; dy++) for (let dx = -Math.ceil(R) - 1; dx <= R + 1; dx++) {
      const x = Math.round(p.x + dx);
      const y = Math.round(p.y + dy);
      const ex = x + 0.5 - p.x;
      const ey = (y + 0.5 - p.y) / (L.flat || 1);
      const a = Math.atan2(ey, ex);
      const edge = p.rad * (0.8 + 0.2 * Math.max(Math.cos(a * p.lobes + p.ph), -0.3));
      const d = Math.hypot(ex, ey);
      if (d > edge) continue;
      own.set(x, y, id);
      const xx = ((x % S) + S) % S;
      const yy = ((y % S) + S) % S;
      light[yy * S + xx] = (-(ex + ey) / (edge * 1.414)) * 0.9 + (1 - d / edge) * 0.35 + p.dv;
    }
  });
  return { own, light, pts };
}
function leavesTex(S, st, kind, seed) {
  const P = isP(st);
  const L = LEAF[kind];
  if (L.needles) return spruceTex(S, st, seed);
  const n = P ? 6 : 4;
  const pal = L.pink ? ramp('#e7a4c2', n, { contrast: P ? 0.46 : 0.38, hue: 12, mid: P ? 3 : 2 }) : ramp(L.color || rgbHex(L.base), n, { contrast: P ? 0.55 : 0.46, hue: L.color ? 10 : 0, tint: 0, mid: P ? 3 : 2 });
  const { own, light } = leafClumps(S, st, kind, seed);
  const fine = perlin(S, P ? 10 : 4, P ? 10 : 4, seed + 5);
  const gapN = perlin(S, 4, 4, seed + 9);
  const px = new Px(S).fill((x, y) => {
    const id = own.get(x, y);
    if (id < 0) return gapN(x, y) < -1 + L.holes * 6 ? -1 : 0;
    // rim: overlapping an earlier (higher) clump below/right edge -> dark
    const below = own.get(x, y + 1);
    const right = own.get(x + 1, y);
    if (below !== id || right !== id) return 1;
    const above = own.get(x, y - 1);
    const left = own.get(x - 1, y);
    let v = light[y * S + x];
    v += fine(x, y) * 0.22;
    let l = v > 0.55 ? 4 : v > 0.2 ? 3 : v > -0.2 ? 2 : 1;
    if ((above !== id || left !== id) && l >= 2) l = Math.min(n - 1, l + 1);
    return Math.min(n - 1, P ? l + (l >= 4 && v > 0.8 ? 1 : 0) : Math.min(l, 3));
  });
  despeckle(px, (v) => v === -1);
  // holes: clean single see-through pixels away
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (px.get(x, y) !== -1) continue;
    const nb = [px.get(x - 1, y), px.get(x + 1, y), px.get(x, y - 1), px.get(x, y + 1)].filter((v) => v === -1).length;
    if (nb === 0) px.set(x, y, 0);
  }
  if (L.pink) {
    // blossoms: tiny five-pixel flowers with a darker heart on lit clumps
    const bl = pal.length;
    pal.push(...['#fbe3ee', '#fff8fb', '#c2577f'].map(rgba));
    const r = rng(seed + 11);
    for (let i = 0; i < (P ? 12 : 5); i++) {
      const x = r.i(S);
      const y = r.i(S);
      if (px.get(x, y) < 2) continue;
      px.stamp(x - 1, y - 1, P ? ['.a.', 'aca', '.b.'] : ['ab'], { a: bl, b: bl + 1, c: bl + 2 });
    }
  }
  const c = pal[0];
  return px.toImage(pal, [c[0], c[1], c[2]]);
}
/**
 * Spruce: drooping sprigs. Each sprig is a short twig line with needles
 * slanting down and out on both sides (a chevron), lit on the upper needles;
 * sprigs overlap like the layered boughs of a conifer.
 */
function spruceTex(S, st, seed) {
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = ramp('#999999', n, { contrast: P ? 0.6 : 0.5, hue: 0, tint: 0, mid: P ? 3 : 2 });
  const r = rng(seed);
  const px = new Px(S).fill(0);
  const gx = P ? 5 : 3;
  const gy = P ? 6 : 4;
  const sprigs = [];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) sprigs.push([((i + 0.5 * (j % 2) + r.f() * 0.4) * S) / gx, ((j + r.f() * 0.4) * S) / gy, r.f()]);
  sprigs.sort((a, b) => a[1] - b[1]);
  const len = P ? 5 : 3;
  for (const [sx, sy, q] of sprigs) {
    const x0 = Math.round(sx);
    const y0 = Math.round(sy);
    const top = P ? (q > 0.7 ? 5 : 4) : 3;
    if (!P) {
      // 16x: a small drooping bough, lit on its upper slope
      px.stamp(x0 - 2, y0, ['..a..', '.aab.', 'abbcc', 'b...c'], { a: 3, b: 2, c: 1 });
      continue;
    }
    // twig down the middle
    for (let t = 0; t < len; t++) px.set(x0, y0 + t, 1);
    // needles: rows of down-slanting pairs, shorter towards the tip
    for (let t = 0; t < len; t++) {
      const w = P ? Math.max(1, Math.round(((len - t) / len) * 3)) : t === 0 ? 2 : 1;
      for (let u = 1; u <= w; u++) {
        const yy = y0 + t + Math.floor(u / 2);
        px.set(x0 - u, yy, u === w ? top - 1 : top - (t > len / 2 ? 1 : 0));
        px.set(x0 + u, yy, u === w ? 2 : top - 1 - (t > len / 2 ? 1 : 0));
      }
    }
    px.set(x0, y0 - 1, top);
  }
  // a few see-through gaps in the darkest shade
  const gap = perlin(S, 4, 4, seed + 9);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (px.get(x, y) === 0 && gap(x, y) < -0.55) px.set(x, y, -1);
  despeckle(px, (v) => v === -1);
  const c = pal[0];
  return px.toImage(pal, [c[0], c[1], c[2]]);
}
function rgbHex(v) {
  const h = Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}
const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak', 'azalea'];
WOODS.forEach((w, i) => {
  T[`${w}_leaves`] = (S, st) => leavesTex(S, st, w, 900 + i * 13);
});

T.flowering_azalea_leaves = (S, st) => {
  const img = leavesTex(S, st, 'azalea', 1031);
  const P = isP(st), r = rng(1037);
  const col = ['#a652a0', '#ce80bb', '#f1bad9'].map(rgba);
  for (let i = 0; i < (P ? 10 : 4); i++) {
    const x = r.i(S), y = r.i(S);
    if (!img.get(x, y)[3]) continue;
    for (const [dx, dy, c] of [[0, 0, 0], [-1, 0, 1], [1, 0, 1], [0, -1, 2], [0, 1, 1]]) img.set((x + dx + S) % S, (y + dy + S) % S, col[c]);
  }
  return img;
};
// ------------------------------------------------------------------ planks --
/**
 * Planks: four long boards per block, each with its own tone, a lit top
 * edge, one clean dark gap under it and soft long grain streaks (stretched
 * noise quantised to one shade either way). Only two boards have a butt
 * joint and there are no nails, so a floor reads as boards, not bricks.
 */
const PLANK = { oak: '#ad8550', spruce: '#77562f', birch: '#cdb67a', jungle: '#a8784f', acacia: '#ad5d32', dark_oak: '#4d341c', mangrove: '#773632', cherry: '#e0b1a8', crimson: '#6a3448', warped: '#2b6963', pale_oak: '#d2c9b7', bamboo: '#c5b45e' };
function planksTex(S, st, wood, seed) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 7 : 5;
  const pal = ramp(PLANK[wood], n, { contrast: P ? 0.42 : 0.34, hue: 16, satDark: 0.06 });
  const mid = Math.floor((n - 1) / 2);
  const grain = terrain.fbm(S, seed, P ? [[2, 12, 1], [4, 24, 0.45]] : [[2, 8, 1], [4, 16, 0.4]], { warp: 0.015 });
  const bh = S / 4;
  const tones = [0, -0.5, 0, 0.5];
  for (let i = tones.length - 1; i > 0; i--) { const j = r.i(i + 1); [tones[i], tones[j]] = [tones[j], tones[i]]; }
  const joints = [[0, 0.3 + r.f() * 0.15], [2, 0.75 + r.f() * 0.15]].map(([row, f]) => [row + (seed % 2), Math.round(f * S)]);
  const px = new Px(S).fill((x, y) => {
    const row = Math.floor(y / bh);
    const yy = y - row * bh;
    if (yy === bh - 1) return 0; // gap
    const g = grain(x + row * 7, y);
    let v = mid + (g > 0.7 ? 1 : g < 0.3 ? -1 : 0);
    if (tones[row] > 0 && g > 0.55 && v === mid) v += 1;
    if (tones[row] < 0 && g < 0.45 && v === mid) v -= 1;
    if (yy === 0) v = Math.max(v, mid + 1) + (P ? 1 : 0); // lit top edge
    if (P && yy === bh - 2) v = Math.min(v, mid - 1); // shaded underside
    return Math.max(1, Math.min(n - 1, v));
  });
  for (const [row, jx] of joints) {
    const y0 = (row % 4) * bh;
    px.vline(jx, y0, bh - 1, 0);
    px.vline(jx + 1, y0 + 1, bh - 2, Math.min(n - 1, mid + 1));
  }
  despeckle(px, (v) => v === 0);
  return px.toImage(pal);
}
Object.keys(PLANK).forEach((w, i) => {
  T[`${w}_planks`] = (S, st) => planksTex(S, st, w, 950 + i * 7);
});

// ------------------------------------------------------- big-wall terrain --
// What repeats on a big wall is anything regular or tile-sized: a lighter
// half, a blob, a chip, or the lattice of a high-frequency gradient noise
// (it is zero at every lattice point, so at 2px cells it prints a grid).
// These use blurred white noise instead (no lattice), plus a weak macro
// field, quantised by percentiles so every tile has the same average.

/** Wrapped box blur of an S×S float array. */
function boxBlur(S, a, rx, ry, passes) {
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let sum = 0;
      let cnt = 0;
      for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
        sum += a[(((y + dy) % S + S) % S) * S + (((x + dx) % S + S) % S)];
        cnt++;
      }
      b[y * S + x] = sum / cnt;
    }
    a = b;
  }
  return a;
}
/**
 * Tileable band-pass white noise: blurred by rx × ry, minus a wide blur so
 * nothing tile-sized (a lighter half, a dark column) survives to repeat.
 */
function grain(S, seed, rx = 1, ry = 1, passes = 2) {
  const r = rng(seed);
  const raw = Float32Array.from({ length: S * S }, () => r.f());
  const a = boxBlur(S, raw, rx, ry, passes);
  const wide = boxBlur(S, a, Math.max(2, S >> 3), Math.max(2, S >> 3), 2);
  return (x, y) => {
    const i = (((y % S) + S) % S) * S + (((x % S) + S) % S);
    return a[i] - wide[i];
  };
}
/** Quantise f into levels by cumulative shares; returns Px with base + level. */
function quant(S, f, shares, base = 0) {
  const vs = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) vs.push(f(x, y));
  let acc = 0;
  const th = shares.slice(0, -1).map((sh) => pct(vs, (acc += sh)));
  return new Px(S).fill((x, y) => {
    const v = f(x, y);
    let l = 0;
    while (l < th.length && v >= th[l]) l++;
    return base + l;
  });
}
/**
 * How visibly a tile will repeat: spread of the mean shade over bands and
 * blocks a quarter tile wide (a dark column or a light corner is what the
 * eye picks out on a wall). Lower is calmer.
 */
function repeatScore(px, S) {
  const q = S / 4;
  const m = [];
  for (let i = 0; i < 4; i++) {
    let c = 0;
    let r = 0;
    for (let a = i * q; a < (i + 1) * q; a++) for (let b = 0; b < S; b++) {
      c += px.get(a, b);
      r += px.get(b, a);
    }
    m.push(c / (q * S), r / (q * S));
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    let s = 0;
    for (let y = j * q; y < (j + 1) * q; y++) for (let x = i * q; x < (i + 1) * q; x++) s += px.get(x, y);
    m.push((s / (q * q)) * 0.5 + (m[i * 2] + m[j * 2 + 1]) * 0.25);
  }
  const avg = m.reduce((a, b) => a + b, 0) / m.length;
  // single rows/columns too (a dark line repeats as stripes), weighted less
  let line = 0;
  for (let i = 0; i < S; i++) {
    let c = 0;
    let r = 0;
    for (let b = 0; b < S; b++) { c += px.get(i, b); r += px.get(b, i); }
    line = Math.max(line, Math.abs(c / S - avg), Math.abs(r / S - avg));
  }
  return Math.max(...m.map((v) => Math.abs(v - avg))) + line * 0.35;
}
/** band-pass grain, quantised: a calm, lattice-free rock surface (best of several seeds). */
function rock(S, st, seed, color, o = {}) {
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = o.pal || ramp(color, n, { contrast: P ? (o.contrast ?? 0.3) : (o.contrast ?? 0.3) * 0.7, hue: 14, tint: 0.035, ...(o.ramp || {}) });
  const shares = o.shares || (P ? [0.08, 0.24, 0.36, 0.24, 0.08] : [0.1, 0.3, 0.42, 0.18]);
  let best = null;
  for (let t = 0; t < (P ? 16 : 40); t++) {
    const g = grain(S, seed * 97 + t, o.rx ?? 1, o.ry ?? 1, o.passes ?? (P ? 2 : 1));
    const px = quant(S, g, shares);
    despeckle(px);
    const sc = repeatScore(px, S);
    if (!best || sc < best[0]) best = [sc, px];
  }
  return { px: best[1], pal, n };
}
T.stone = (S, st) => {
  const { px, pal } = rock(S, st, 1, '#7f8084', { contrast: 0.14, passes: 1 });
  return px.toImage(pal);
};
T.deepslate = (S, st) => {
  const P = isP(st);
  const { px, pal } = rock(S, st, 2, '#4f4f57', { contrast: 0.36, rx: P ? 3 : 2, ry: 0, passes: 2, mc: 2, mcy: 4, ramp: { tint: 0.05 } });
  return px.toImage(pal);
};
function sandTex(S, st, seed, color) {
  const P = isP(st);
  const { px, pal } = rock(S, st, seed, color, { contrast: P ? 0.2 : 0.11, ramp: { hue: 12 }, passes: 1, shares: P ? [0.06, 0.24, 0.42, 0.22, 0.06] : [0.08, 0.34, 0.42, 0.16] });
  return px.toImage(pal);
}
T.sand = (S, st) => sandTex(S, st, 7, '#dbcf95');
T.red_sand = (S, st) => sandTex(S, st, 107, '#b9652f');

module.exports = { X, perlin, liquid, cellField };
