// More blocks you meet in a normal world: polished/chiseled stone, colored
// glass, terracotta and concrete, stripped logs, nether and end basics,
// farm blocks, raw-ore blocks, flowers, saplings and crops. Same rules as the
// other art files: top-left light, hue-shifted ramps, few shades, no lone
// pixels, everything original and procedural.
const { Px, ramp, rng, blob, lump, despeckle, layer, strip, Image, rgba, mixc, cells } = require('./lib');
const B = require('./blocks');
const B2 = require('./blocks2');
const TR = require('./terrain');

const { fbm, bands, chips, crack } = TR;
const T = {};
const isP = (st) => st === 'looks';
const kOf = (S) => S / 16;
const BT = (name) => (S, st) => (TR.X[name] || B2.T[name] || B.T[name])(S, st);

/** A calm noise material: n shades, a few chips. */
function field(S, st, seed, color, o = {}) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(seed);
  const n = o.n || (P ? 6 : 4);
  const pal = o.pal || ramp(color, n, { contrast: (P ? 0.3 : 0.2) * (o.contrast ?? 1), hue: o.hue ?? 14, tint: o.tint ?? 0.03 });
  const mid = Math.floor((n - 1) / 2);
  const f = fbm(S, seed, o.oct || (P ? [[6, 6, 1], [12, 12, 0.6], [24, 24, 0.3]] : [[5, 5, 1], [10, 10, 0.6]]), { warp: o.warp ?? 0.06 });
  const fr = o.fractions || (P ? [0.15, 0.35, 0.35, 0.15] : [0.25, 0.5, 0.25]);
  const px = bands(S, f, fr, { base: Math.max(0, mid - Math.floor(fr.length / 2)), dither: P && o.dither !== false ? 0.03 : 0 });
  if (o.chips) chips(px, r, S, Math.round((P ? 6 : 3) * o.chips), { v: mid, hi: 1, lo: 1, size: [1, 2], k, max: n - 1 });
  despeckle(px);
  return { px, pal, n, mid, r, k, P };
}
const flat = (S, st, seed, color, o) => {
  const { px, pal } = field(S, st, seed, color, o);
  return px.toImage(pal);
};

/** Bevelled frame (lit top/left, shaded bottom/right) drawn into an index map. */
function bevel(px, x, y, w, h, hi, lo, inner = false) {
  px.hline(x, y, w, inner ? lo : hi).vline(x, y, h, inner ? lo : hi);
  px.hline(x, y + h - 1, w, inner ? hi : lo).vline(x + w - 1, y, h, inner ? hi : lo);
}

function polished(S, st, seed, color, o = {}) {
  const { px, pal, n, P, k } = field(S, st, seed, color, { contrast: 0.6, fractions: P_FR(st), ...o });
  bevel(px, 0, 0, S, S, n - 1, 0);
  if (P) bevel(px, 1, 1, S - 2, S - 2, n - 2, 1);
  return { px, pal, n, P, k };
}
const P_FR = (st) => (isP(st) ? [0.25, 0.5, 0.25] : [0.5, 0.5]);

/** Darken a crack path into an existing RGBA image (with a lit lip). */
function crackImage(img, seed, count = 3) {
  const S = img.w;
  const r = rng(seed);
  const k = kOf(S);
  const out = new Image(S).blit(img, 0, 0);
  const shade = (x, y, f) => {
    x = ((x % S) + S) % S;
    y = ((y % S) + S) % S;
    const [R, G, Bc, A] = out.get(x, y);
    out.set(x, y, [Math.min(255, R * f), Math.min(255, G * f), Math.min(255, Bc * f), A].map(Math.round));
  };
  for (let c = 0; c < count; c++) {
    let x = r.i(S);
    let y = r.i(S);
    for (let i = 0; i < r.range(6, 10) * k; i++) {
      shade(x, y, 0.5);
      if (k > 1) shade(x + 1, y, 1.12);
      if (r.chance(0.55)) y++;
      else x += r.pick([-1, 1]);
    }
  }
  return out;
}

// ------------------------------------------------------------- stone kin --
T.polished_andesite = (S, st) => { const { px, pal } = polished(S, st, 401, '#8d8f90'); return px.toImage(pal); };
T.polished_diorite = (S, st) => { const { px, pal } = polished(S, st, 402, '#cfcdca', { contrast: 0.4 }); return px.toImage(pal); };
T.polished_granite = (S, st) => { const { px, pal } = polished(S, st, 403, '#a06f5b'); return px.toImage(pal); };
T.polished_deepslate = (S, st) => {
  const { px, pal, n, k, P } = polished(S, st, 404, '#4b4b53', { contrast: 0.8 });
  // two-by-two slabs
  const h = S / 2;
  bevel(px, 0, h, S, h, n - 1, 0);
  if (P) px.hline(1, h - 1, S - 2, 1);
  return px.toImage(pal);
};
T.chiseled_deepslate = (S, st) => {
  const { px, pal, n, k } = polished(S, st, 405, '#4b4b53', { contrast: 0.8 });
  for (const m of [3, 6]) bevel(px, m * k, m * k, S - 2 * m * k, S - 2 * m * k, n - 1, 0, true);
  px.rect(7 * k, 7 * k, 2 * k, 2 * k, 0);
  return px.toImage(pal);
};
T.cracked_deepslate_bricks = (S, st) => crackImage(BT('deepslate_bricks')(S, st), 406);
T.cracked_deepslate_tiles = (S, st) => crackImage(BT('deepslate_tiles')(S, st), 407);
T.cut_sandstone = (S, st) => {
  const { px, pal, n, k } = polished(S, st, 408, '#d9cb92', { contrast: 0.7 });
  bevel(px, 0, 0, S, S / 2, n - 1, 0);
  return px.toImage(pal);
};
T.chiseled_sandstone = (S, st) => {
  const { px, pal, n, k, P } = polished(S, st, 409, '#d9cb92', { contrast: 0.7 });
  bevel(px, 0, 0, S, 3 * k, n - 1, 0);
  bevel(px, 0, S - 3 * k, S, 3 * k, n - 1, 0);
  // a carved sun motif in the middle band
  const c = S / 2 - 0.5;
  for (let y = 4 * k; y < S - 4 * k; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - c, y - c);
    if (Math.abs(d - 3 * k) < 0.6 * k) px.set(x, y, x + y < 2 * c ? 0 : n - 1);
    if (d < 1.2 * k) px.set(x, y, 1);
  }
  for (const dx of [-6, 6]) px.rect(Math.round(c + dx * k) - (k - 1), Math.round(c) - (k - 1), k, k, 0);
  return px.toImage(pal);
};
T.cut_red_sandstone = (S, st) => {
  const { px, pal, n } = polished(S, st, 410, '#b8622d', { contrast: 0.7 });
  bevel(px, 0, 0, S, S / 2, n - 1, 0);
  return px.toImage(pal);
};
T.quartz_block_side = (S, st) => { const { px, pal } = polished(S, st, 411, '#ebe5dc', { contrast: 0.35 }); return px.toImage(pal); };
T.quartz_block_top = T.quartz_block_side;
T.quartz_block_bottom = (S, st) => flat(S, st, 412, '#e6e0d6', { contrast: 0.35 });
T.smooth_basalt = (S, st) => flat(S, st, 413, '#4a4a50', { contrast: 0.7, chips: 0.6 });
T.blackstone = (S, st) => {
  const { px, pal, n, r, k, P } = field(S, st, 414, '#2e2a31', { contrast: 1.2, chips: 1.4 });
  for (let i = 0; i < (P ? 3 : 2); i++) crack(px, r, r.i(S), r.i(S), r.range(3, 6) * k, 0, null, r.pick([1, -1]));
  return px.toImage(pal);
};
T.blackstone_top = (S, st) => {
  const { px, pal, n, k } = field(S, st, 415, '#2e2a31', { contrast: 1.1 });
  const c = S / 2 - 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.abs(Math.max(Math.abs(x - c), Math.abs(y - c)) - 4.5 * k) < 0.5) px.set(x, y, x < c && y < c ? n - 1 : 0);
  return px.toImage(pal);
};
T.polished_blackstone = (S, st) => { const { px, pal } = polished(S, st, 416, '#36313a', { contrast: 1 }); return px.toImage(pal); };
T.basalt_side = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const n = P ? 6 : 4;
  const pal = ramp('#55545c', n, { contrast: P ? 0.45 : 0.32, hue: 14, tint: 0.04 });
  const f = fbm(S, 417, [[2, 8, 1], [4, 16, 0.5]]);
  // vertical columns with dark joints
  const px = bands(S, (x, y) => f(y, x), P ? [0.2, 0.5, 0.3] : [0.3, 0.7], { base: 1 });
  for (const x0 of [0, 5 * k, 11 * k]) {
    px.vline(x0, 0, S, 0);
    px.vline(x0 + 1, 0, S, n - 1);
  }
  return px.toImage(pal);
};
T.basalt_top = (S, st) => {
  const { px, pal, n, k } = field(S, st, 418, '#55545c', { contrast: 1.1 });
  bevel(px, 0, 0, S, S, n - 1, 0);
  const c = S / 2 - 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.abs(x - c) * 0.87 + Math.abs(y - c) * 0.5;
    if (Math.abs(d - 4 * k) < 0.5 || Math.abs(Math.abs(x - c) - 4.6 * k) < 0.5 && Math.abs(y - c) < 2.3 * k) px.set(x, y, 0);
  }
  return px.toImage(pal);
};
T.nether_bricks = (S, st) => B2.brickWall(S, st, 420, { color: '#341619', mortar: '#140709', rows: 4, cols: 2, rough: false });
T.red_nether_bricks = (S, st) => B2.brickWall(S, st, 421, { color: '#5a0f13', mortar: '#260507', rows: 4, cols: 2, rough: false });
T.mud_bricks = (S, st) => B2.brickWall(S, st, 422, { color: '#8b6b52', mortar: '#5a4433', rows: 4, cols: 2, rough: false });
T.purpur_block = (S, st) => B2.brickWall(S, st, 423, { color: '#a77ba7', mortar: '#6a4a6c', rows: 2, cols: 2, offset: 0, rough: false });
T.end_stone = (S, st) => flat(S, st, 424, '#dedca0', { contrast: 0.9, chips: 1.2 });

// ----------------------------------------------------------------- soils --
T.mud = (S, st) => flat(S, st, 430, '#3c3638', { contrast: 0.8, chips: 0.8 });
T.packed_mud = (S, st) => flat(S, st, 431, '#8e6b50', { contrast: 0.7, chips: 1 });
T.moss_block = (S, st) => {
  const { px, pal, n, r, k, P } = field(S, st, 432, '#5b7a2e', { contrast: 1.2, hue: 18 });
  // soft tufts
  chips(px, r, S, P ? 10 : 5, { v: n - 3, hi: 1, lo: 1, size: [1, 1.8], k, max: n - 1 });
  return px.toImage(pal);
};
T.rooted_dirt = (S, st) => {
  const img = BT('dirt')(S, st);
  const r = rng(433);
  const k = kOf(S);
  const roots = [mixc(rgba('#9a7a52'), [0, 0, 0, 255], 0), rgba('#6e5233')];
  for (let i = 0; i < (isP(st) ? 5 : 3); i++) {
    let x = r.i(S);
    let y = r.i(S);
    for (let j = 0; j < r.range(4, 8) * k; j++) {
      img.set(((x % S) + S) % S, ((y % S) + S) % S, roots[0]);
      if (k > 1) img.set(((x + 1) % S + S) % S, ((y % S) + S) % S, roots[1]);
      y++;
      if (r.chance(0.4)) x += r.pick([-1, 1]);
    }
  }
  return img;
};
T.mycelium_top = (S, st) => {
  const { px, pal, n, r, P } = field(S, st, 434, '#6e6168', { contrast: 1.1, hue: 20 });
  const sp = pal.length;
  pal.push(...ramp('#a99aa6', 2, { contrast: 0.2 }));
  for (let i = 0; i < (P ? 12 : 6); i++) px.stamp(r.i(S), r.i(S), P ? r.pick([['ab'], ['a', 'b'], ['.a', 'ab']]) : ['a'], { a: sp + 1, b: sp });
  return px.toImage(pal);
};
/** Side of a block whose top hangs over a dirt face (mycelium, nylium, path). */
function overhang(S, st, top, under, seed, depth = 3) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(seed);
  const out = new Image(S).blit(under, 0, 0);
  for (let x = 0; x < S;) {
    const w = r.range(1, 2) * k;
    const h = Math.round((depth + r.pick([0, 0, 1, -1, 1])) * k);
    for (let i = 0; i < w && x < S; i++, x++) {
      for (let y = 0; y < h; y++) out.set(x, y, top.get(x, (S - h + y) % S));
      const [R, G, Bc] = top.get(x, S - 1);
      out.set(x, h, [R * 0.62, G * 0.62, Bc * 0.62, 255].map(Math.round));
    }
  }
  return out;
}
T.mycelium_side = (S, st) => overhang(S, st, T.mycelium_top(S, st), BT('dirt')(S, st), 435, isP(st) ? 3 : 3);
T.dirt_path_top = (S, st) => flat(S, st, 436, '#94743f', { contrast: 0.7, chips: 1.2 });
T.dirt_path_side = (S, st) => {
  // the path is 15/16 tall: the top pixel row of the face is never shown
  const out = overhang(S, st, T.dirt_path_top(S, st), BT('dirt')(S, st), 437, 2);
  return out;
};
T.soul_soil = (S, st) => flat(S, st, 438, '#4c3a2e', { contrast: 1, chips: 1.4 });

// ---------------------------------------------------------- ice and snow --
T.ice = (S, st) => {
  const P = isP(st);
  const { px, pal, r, k } = field(S, st, 440, '#8db4f2', { contrast: 0.7, hue: 10 });
  const img = px.toImage(pal);
  // translucent like vanilla ice, with white fracture lines
  for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = 200;
  for (let c = 0; c < (P ? 4 : 3); c++) {
    let x = r.i(S);
    let y = r.i(S);
    const dx = r.pick([1, -1]);
    for (let j = 0; j < r.range(4, 8) * k; j++) {
      img.set(((x % S) + S) % S, ((y % S) + S) % S, [236, 246, 255, 230]);
      x += dx;
      if (r.chance(0.5)) y++;
    }
  }
  return img;
};
T.packed_ice = (S, st) => {
  const { px, pal, r, k, P, n } = field(S, st, 441, '#8bb0ea', { contrast: 0.7, hue: 10 });
  for (let c = 0; c < (P ? 4 : 2); c++) crack(px, r, r.i(S), r.i(S), r.range(4, 7) * k, n - 1, null, r.pick([1, -1]));
  return px.toImage(pal);
};
T.blue_ice = (S, st) => {
  const { px, pal, r, k, P, n } = field(S, st, 442, '#6f9fe8', { contrast: 0.8, hue: 10 });
  for (let c = 0; c < (P ? 5 : 3); c++) crack(px, r, r.i(S), r.i(S), r.range(3, 6) * k, n - 1, null, r.pick([1, -1]));
  return px.toImage(pal);
};

// ----------------------------------------------------- colored materials --
const TERRACOTTA = {
  white: '#cfb2a2', orange: '#a3562a', magenta: '#965a6d', light_blue: '#716d89', yellow: '#b98428', lime: '#687535', pink: '#a24e4f', gray: '#3b2b25',
  light_gray: '#87695f', cyan: '#575b5b', purple: '#764656', blue: '#4b3b5c', brown: '#4e3424', green: '#4c532a', red: '#8f3d2f', black: '#261812',
};
const DYES = B2.DYES;
const COLORS = Object.keys(DYES);
COLORS.forEach((c, i) => {
  T[`${c}_terracotta`] = (S, st) => flat(S, st, 450 + i, TERRACOTTA[c], { contrast: 0.55, chips: 0.5 });
  T[`${c}_concrete`] = (S, st) => flat(S, st, 470 + i, DYES[c], { contrast: 0.22, fractions: isP(st) ? [0.2, 0.6, 0.2] : [0.5, 0.5], dither: false });
  T[`${c}_concrete_powder`] = (S, st) => {
    const { px, pal, n, r, P } = field(S, st, 490 + i, DYES[c], { contrast: 0.5, oct: isP(st) ? [[8, 8, 1], [16, 16, 0.7], [32, 32, 0.5]] : [[8, 8, 1], [16, 16, 0.7]] });
    for (let g = 0; g < (P ? 30 : 14); g++) px.set(r.i(S), r.i(S), r.pick([0, n - 1]));
    return px.toImage(pal);
  };
  T[`${c}_stained_glass`] = (S, st) => stainedGlass(S, st, DYES[c], 510 + i);
  T[`${c}_stained_glass_pane_top`] = (S, st) => {
    const col = rgba(DYES[c]);
    return new Image(S).fill(() => [...mixc(col, [255, 255, 255, 255], 0.25).slice(0, 3), 230]);
  };
});
T.terracotta = (S, st) => flat(S, st, 449, '#98603f', { contrast: 0.55, chips: 0.5 });
T.clay = (S, st) => flat(S, st, 448, '#a0a6b3', { contrast: 0.5, chips: 0.6, hue: 10 });
function stainedGlass(S, st, color, seed) {
  const P = isP(st);
  const k = kOf(S);
  const c = rgba(color);
  const light = mixc(c, [255, 255, 255, 255], 0.45);
  const dark = mixc(c, [0, 0, 0, 255], 0.3);
  const img = new Image(S).fill(() => [c[0], c[1], c[2], P ? 110 : 120]);
  for (let i = 0; i < S; i++) {
    img.set(i, 0, [...light.slice(0, 3), 230]);
    img.set(0, i, [...light.slice(0, 3), 230]);
    img.set(i, S - 1, [...dark.slice(0, 3), 230]);
    img.set(S - 1, i, [...dark.slice(0, 3), 230]);
  }
  // diagonal glints
  for (const [d, a] of [[6 * k, 150], [6 * k + 1, P ? 120 : 0], [9 * k, 110]]) for (let x = 2 * k; x <= 4 * k; x++) if (a) img.set(x, d - x, [...light.slice(0, 3), a]);
  return img;
}

/** Calmer wool: a soft field plus short diagonal fibres (no knit grid). */
COLORS.forEach((c, i) => {
  T[`${c}_wool`] = (S, st) => {
    const { px, pal, n, r, P } = field(S, st, 530 + i, DYES[c], { contrast: 0.42, hue: 16, fractions: isP(st) ? [0.2, 0.55, 0.25] : [0.3, 0.7], oct: isP(st) ? [[4, 4, 1], [8, 8, 0.5]] : [[4, 4, 1], [8, 8, 0.4]] });
    const mid = Math.floor((n - 1) / 2);
    // short soft fibres, all leaning the same way
    for (let f = 0; f < (P ? 26 : 10); f++) {
      const x = r.i(S);
      const y = r.i(S);
      const len = P ? r.range(2, 3) : 2;
      const v = r.chance(0.5) ? mid - 1 : mid + 1;
      for (let j = 0; j < len; j++) px.set(x + j, y + j, v);
    }
    return px.toImage(pal);
  };
});

// ------------------------------------------------------------ wood kin --
const STRIPPED = {
  oak: '#b3895a', spruce: '#80603d', birch: '#cbb47a', jungle: '#ae7d55', acacia: '#b0603a', dark_oak: '#5a4027', mangrove: '#7b3a34', cherry: '#d9a69c',
  crimson: '#8a3a5a', warped: '#3a8e8a',
};
for (const [w, col] of Object.entries(STRIPPED)) {
  const stem = w === 'crimson' || w === 'warped';
  const side = (S, st) => {
    const P = isP(st);
    const n = P ? 6 : 4;
    const pal = ramp(col, n, { contrast: P ? 0.38 : 0.26, hue: 14 });
    const f = fbm(S, 540 + col.length * 7 + w.length, [[1, 6, 1], [2, 12, 0.5], [4, 24, 0.3]]);
    // long vertical fibres: sample the field rotated so streaks run up the log
    const px = bands(S, (x, y) => f(y, x), P ? [0.15, 0.4, 0.3, 0.15] : [0.3, 0.45, 0.25], { base: Math.floor((n - 1) / 2) - 1 });
    return px.toImage(pal);
  };
  const top = (S, st) => {
    const P = isP(st);
    const k = kOf(S);
    const n = P ? 6 : 4;
    const pal = ramp(col, n, { contrast: P ? 0.32 : 0.22, hue: 14 });
    const c = S / 2 - 0.5;
    const nz = fbm(S, 560 + w.length, [[4, 4, 1]]);
    const px = new Px(S).fill((x, y) => {
      const d = Math.max(Math.abs(x - c), Math.abs(y - c)) * 0.55 + Math.hypot(x - c, y - c) * 0.45 + (nz(x, y) - 0.5) * 1.2;
      const ring = Math.floor(d / (P ? 2.4 : 2));
      return Math.floor((n - 1) / 2) + (ring % 2 ? 0 : 1);
    });
    bevel(px, 0, 0, S, S, n - 1, 0);
    px.rect(Math.floor(c), Math.floor(c), k, k, 0);
    return px.toImage(pal);
  };
  T[`stripped_${w}_${stem ? 'stem' : 'log'}`] = side;
  T[`stripped_${w}_${stem ? 'stem' : 'log'}_top`] = top;
}
/** Nether stems: bark-like plates in fungus colours with glowing veins. */
function stemSide(S, st, seed, bark, vein) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp(bark, n, { contrast: P ? 0.5 : 0.36, hue: 14 });
  const f = fbm(S, seed, [[2, 6, 1], [4, 12, 0.5]]);
  const px = bands(S, (x, y) => f(y, x), P ? [0.2, 0.35, 0.3, 0.15] : [0.3, 0.45, 0.25], { base: 1 });
  const vp = pal.length;
  pal.push(...ramp(vein, 2, { contrast: 0.3, hue: 10 }));
  for (let i = 0; i < (P ? 4 : 2); i++) {
    let x = r.i(S);
    for (let y = 0; y < S; y++) {
      px.set(x, y, vp + (y % 3 ? 0 : 1));
      if (r.chance(0.18)) x += r.pick([-1, 1]);
    }
  }
  return px.toImage(pal);
}
function stemTop(S, st, seed, bark, flesh) {
  const P = isP(st);
  const k = kOf(S);
  const n = P ? 5 : 4;
  const pal = [...ramp(bark, 3, { contrast: 0.4 }), ...ramp(flesh, n, { contrast: P ? 0.3 : 0.2, hue: 12 })];
  const c = S / 2 - 0.5;
  const nz = fbm(S, seed, [[4, 4, 1]]);
  const px = new Px(S).fill((x, y) => {
    const m = Math.max(Math.abs(x - c), Math.abs(y - c));
    if (m > c - k) return 1;
    const d = m * 0.6 + Math.hypot(x - c, y - c) * 0.4 + (nz(x, y) - 0.5);
    return 3 + 1 + (Math.floor(d / 2.2) % 2);
  });
  return px.toImage(pal);
}
T.crimson_stem = (S, st) => stemSide(S, st, 570, '#5c1a2c', '#e0503a');
T.crimson_stem_top = (S, st) => stemTop(S, st, 571, '#5c1a2c', '#8f3e5a');
T.warped_stem = (S, st) => stemSide(S, st, 572, '#3a2b45', '#1fc4a8');
T.warped_stem_top = (S, st) => stemTop(S, st, 573, '#3a2b45', '#3a8e8a');
T.crimson_planks = (S, st) => B.planks(S, st, 574, 'crimson');
T.warped_planks = (S, st) => B.planks(S, st, 575, 'warped');
B.WOOD.crimson = { bark: '#5c1a2c', top: '#8f3e5a', plank: '#7a3450' };
B.WOOD.warped = { bark: '#3a2b45', top: '#3a8e8a', plank: '#2f7a72' };

// ---------------------------------------------------------- nether basics --
function nylium(S, st, seed, color) {
  const { px, pal, n, r, k, P } = field(S, st, seed, color, { contrast: 1.1, hue: 16 });
  chips(px, r, S, P ? 9 : 4, { v: Math.floor((n - 1) / 2), hi: 1, lo: 1, size: [1, 1.8], k, max: n - 1 });
  return px.toImage(pal);
}
T.crimson_nylium = (S, st) => nylium(S, st, 580, '#8a1f22');
T.warped_nylium = (S, st) => nylium(S, st, 581, '#17736b');
T.crimson_nylium_side = (S, st) => overhang(S, st, T.crimson_nylium(S, st), BT('netherrack')(S, st), 582, 4);
T.warped_nylium_side = (S, st) => overhang(S, st, T.warped_nylium(S, st), BT('netherrack')(S, st), 583, 4);
T.nether_wart_block = (S, st) => flat(S, st, 584, '#76100f', { contrast: 1.2, chips: 1.6, hue: 10 });
T.warped_wart_block = (S, st) => flat(S, st, 585, '#167a75', { contrast: 1.1, chips: 1.6, hue: 10 });
T.shroomlight = (S, st) => {
  const { px, pal, n, r, k, P } = field(S, st, 586, '#f2a548', { contrast: 1, hue: 16 });
  const hot = pal.length;
  pal.push(rgba('#ffe8a8'));
  for (let i = 0; i < (P ? 10 : 5); i++) px.stamp(r.i(S), r.i(S), P ? ['aa', 'a.'] : ['a'], { a: hot });
  return px.toImage(pal);
};
T.crying_obsidian = (S, st) => {
  const img = BT('obsidian')(S, st);
  const r = rng(587);
  const k = kOf(S);
  for (let i = 0; i < (isP(st) ? 7 : 4); i++) {
    const x = r.i(S);
    const y = r.i(S);
    for (let j = 0; j < r.range(1, 3) * k; j++) img.set(x, (y + j) % S, j === 0 ? [214, 120, 255, 255] : [140, 40, 210, 255]);
  }
  return img;
};

// --------------------------------------------------------- farm and misc --
T.cactus_side = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const n = P ? 6 : 4;
  const pal = ramp('#4f8a2c', n, { contrast: 0.45, hue: 16 });
  const sp = pal.length;
  pal.push(rgba('#e8e2b0'), rgba('#2b1d10'));
  const px = new Px(S).fill((x) => {
    const rib = (x / k) % 4;
    return Math.floor((n - 1) / 2) + (rib < 1 ? 1 : rib >= 3 ? -1 : 0);
  });
  // the cactus model is inset 1px: keep the outer column as the dark skin edge
  px.vline(k - 1, 0, S, 0).vline(S - k, 0, S, 0);
  const r = rng(590);
  for (let y = 2 * k; y < S; y += 4 * k) for (let x = 2 * k + ((y / (4 * k)) % 2) * 2 * k; x < S - k; x += 4 * k) px.stamp(x, y, P ? ['a.', '.b'] : ['a'], { a: sp, b: sp + 1 });
  return px.toImage(pal);
};
T.cactus_top = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const n = P ? 5 : 4;
  const pal = ramp('#5c9a34', n, { contrast: 0.45, hue: 16 });
  const c = S / 2 - 0.5;
  const px = new Px(S, S, false, -1).fill((x, y) => {
    const m = Math.max(Math.abs(x - c), Math.abs(y - c));
    if (m > c - k + 1) return -1;
    return m > c - 2 * k ? 0 : Math.floor(Math.hypot(x - c, y - c) / (2 * k)) % 2 ? 2 : 3;
  });
  return px.toImage(pal);
};
T.cactus_bottom = T.cactus_top;
T.pumpkin_side = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const n = P ? 6 : 4;
  const pal = ramp('#d9821f', n, { contrast: 0.45, hue: 16 });
  const f = fbm(S, 591, [[2, 6, 1]]);
  const px = new Px(S).fill((x, y) => {
    const rib = (x / k + 1) % 5;
    let v = Math.floor((n - 1) / 2) + (rib < 1 ? -2 : rib < 2 ? 1 : rib >= 4 ? -1 : 0);
    if (P && f(x, y) > 0.7) v += 1;
    return Math.max(0, Math.min(n - 1, v));
  });
  return px.toImage(pal);
};
T.pumpkin_top = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const n = P ? 6 : 4;
  const pal = ramp('#d9821f', n, { contrast: 0.45, hue: 16 });
  const st0 = pal.length;
  pal.push(...ramp('#6b5a2a', 3, { contrast: 0.4 }));
  const c = S / 2 - 0.5;
  const px = new Px(S).fill((x, y) => {
    const a = Math.atan2(y - c, x - c);
    const rib = Math.cos(a * 5);
    return Math.floor((n - 1) / 2) + (rib > 0.7 ? 1 : rib < -0.7 ? -1 : 0);
  });
  px.rect(c - k + 1, c - k + 1, 2 * k, 2 * k, st0 + 1);
  px.hline(c - k + 1, c - k + 1, 2 * k, st0 + 2);
  return px.toImage(pal);
};
T.melon_side = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const n = P ? 6 : 4;
  const pal = ramp('#7cae2a', n, { contrast: 0.5, hue: 16 });
  const f = fbm(S, 592, [[2, 8, 1], [4, 16, 0.4]]);
  const px = new Px(S).fill((x, y) => {
    const band = Math.floor((x / k + f(x, y) * 2.2) / 3) % 2;
    return band ? 1 : Math.floor((n - 1) / 2) + 1;
  });
  return px.toImage(pal);
};
T.melon_top = (S, st) => {
  const { px, pal, n, k } = field(S, st, 593, '#7cae2a', { contrast: 1.1 });
  const c = S / 2 - 0.5;
  px.rect(c - k + 1, c - k + 1, 2 * k, 2 * k, 0);
  return px.toImage(pal);
};
T.hay_block_side = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const n = P ? 6 : 4;
  const pal = ramp('#c9a52e', n, { contrast: 0.42, hue: 16 });
  const tie = pal.length;
  pal.push(...ramp('#7a3a1a', 2, { contrast: 0.3 }));
  const f = fbm(S, 594, [[1, 8, 1], [2, 16, 0.5]]);
  const px = bands(S, (x, y) => f(y, x), P ? [0.15, 0.35, 0.35, 0.15] : [0.3, 0.45, 0.25], { base: 1 });
  for (const y0 of [3 * k, 12 * k]) {
    px.hline(0, y0, S, tie + 1);
    px.hline(0, y0 + k, S, tie);
  }
  return px.toImage(pal);
};
T.hay_block_top = (S, st) => {
  const { px, pal, n, r, P } = field(S, st, 595, '#c9a52e', { contrast: 1, oct: [[8, 8, 1], [16, 16, 0.6]] });
  for (let i = 0; i < (P ? 40 : 18); i++) px.set(r.i(S), r.i(S), r.pick([0, 1]));
  return px.toImage(pal);
};
T.bone_block_side = (S, st) => {
  const { px, pal, n, P, k } = field(S, st, 596, '#e2dcc6', { contrast: 0.5 });
  const f = fbm(S, 597, [[1, 8, 1]]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (f(y, x) < 0.18) px.set(x, y, 1);
  return px.toImage(pal);
};
T.bone_block_top = (S, st) => {
  const { px, pal, n, k } = field(S, st, 598, '#e2dcc6', { contrast: 0.5 });
  const c = S / 2 - 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot(x - c, y - c) < 3 * k) px.set(x, y, Math.hypot(x - c, y - c) < 1.5 * k ? 0 : 1);
  return px.toImage(pal);
};

// ------------------------------------------------------- metal and gems --
function nuggetPile(S, st, seed, color) {
  const P = isP(st);
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp(color, n, { contrast: P ? 0.55 : 0.42, hue: 18 });
  const { lab } = cells(r, S, P ? 14 : 8, { minDist: S / (P ? 5.6 : 4.4) });
  const shade = Array.from({ length: 64 }, () => r.pick(P ? [2, 3, 3] : [1, 2, 2]));
  const px = new Px(S).fill((x, y) => {
    const id = lab.get(x, y);
    if (lab.get(x + 1, y) !== id || lab.get(x, y + 1) !== id) return 0;
    if (lab.get(x - 1, y) !== id || lab.get(x, y - 1) !== id) return Math.min(n - 1, shade[id] + 2);
    return shade[id];
  });
  return px.toImage(pal);
}
T.raw_iron_block = (S, st) => nuggetPile(S, st, 600, '#c49a7c');
T.raw_gold_block = (S, st) => nuggetPile(S, st, 601, '#e2ad2a');
T.raw_copper_block = (S, st) => nuggetPile(S, st, 602, '#c06c45');
function plates(S, st, seed, color, o = {}) {
  const { px, pal, n, k, P } = field(S, st, seed, color, { contrast: 0.6, ...o });
  const h = S / 2;
  for (const [x, y] of [[0, 0], [h, 0], [0, h], [h, h]]) {
    bevel(px, x, y, h, h, n - 1, 0);
    if (o.rivets) px.set(x + k + 1, y + k + 1, 0);
  }
  return px.toImage(pal);
}
T.copper_block = (S, st) => plates(S, st, 603, '#c26b4a', { rivets: true });
T.netherite_block = (S, st) => plates(S, st, 604, '#3b3537', { contrast: 0.8 });
T.amethyst_block = (S, st) => {
  const P = isP(st);
  const r = rng(605);
  const n = P ? 6 : 4;
  const pal = ramp('#8a62c8', n, { contrast: 0.5, hue: 16 });
  const { lab } = cells(r, S, P ? 10 : 6, { minDist: S / 4.6 });
  const shade = Array.from({ length: 64 }, () => r.pick([1, 2, 2, 3]));
  const px = new Px(S).fill((x, y) => {
    const id = lab.get(x, y);
    if (lab.get(x + 1, y) !== id || lab.get(x, y + 1) !== id) return 0;
    if (lab.get(x - 1, y) !== id || lab.get(x, y - 1) !== id) return n - 1;
    return shade[id];
  });
  return px.toImage(pal);
};

// ---------------------------------------------------------------- plants --
/** Generic flower: stem + leaves + a head made of petal stamps. */
function flower(S, st, spec) {
  const P = isP(st);
  const k = kOf(S);
  const px = new Px(S, S, false, -1);
  const pal = [];
  const add = (c, n, o = {}) => {
    const off = pal.length;
    pal.push(...ramp(c, n, { contrast: 0.5, hue: 18, ...o }));
    return off;
  };
  const stem = add(spec.stem || '#4f8a2c', 3);
  const pet = add(spec.petal, P ? 4 : 3);
  const eye = add(spec.eye || spec.petal, 2);
  const sx = 7 * k;
  const top = (spec.top ?? 6) * k;
  for (let y = top; y < S; y++) for (let q = 0; q < k; q++) px.set(sx + q, y, stem + 1);
  // leaves
  for (let i = 0; i < 3 * k; i++) px.set(sx - 1 - i, 12 * k - Math.floor(i / 2), stem + (i === 0 ? 1 : 2));
  for (let i = 0; i < 2 * k; i++) px.set(sx + k + i, 13 * k - Math.floor(i / 2), stem);
  const heads = spec.heads || [[7.5, spec.top ? spec.top - 1 : 5]];
  for (const [hx, hy] of heads) {
    const cx = hx * k - 0.5;
    const cy = hy * k;
    const R = (spec.r || 2.6) * k;
    for (let y = -Math.ceil(R) - 1; y <= R + 1; y++) for (let x = -Math.ceil(R) - 1; x <= R + 1; x++) {
      const a = Math.atan2(y, x);
      const rr = R * (spec.shape === 'cup' ? (y < 0 ? 1 - (Math.abs(x) < R * 0.3 ? 0.35 : 0) : 0.9) : spec.shape === 'ball' ? 1 : 0.8 + 0.2 * Math.cos(a * (spec.lobes || 5)));
      const d = Math.hypot(x, y * (spec.shape === 'cup' ? 0.9 : 1));
      if (d > rr) continue;
      const lit = x + y < -rr * 0.35;
      const v = spec.eye && d < R * 0.32 ? eye + (x + y < 0 ? 1 : 0) : pet + (lit ? (P ? 3 : 2) : x + y > rr * 0.55 ? 0 : 1);
      px.set(Math.round(cx + x), Math.round(cy + y), v);
    }
  }
  return px.toImage(pal);
}
T.azure_bluet = (S, st) => flower(S, st, { petal: '#eef0f6', eye: '#e8c43a', r: 1.6, heads: [[5.5, 7], [9.5, 6], [7.5, 9]], top: 7 });
T.allium = (S, st) => flower(S, st, { petal: '#b46ad8', r: 3, shape: 'ball', top: 4, heads: [[7.5, 4]] });
T.blue_orchid = (S, st) => flower(S, st, { petal: '#36a8e0', eye: '#2a6a9c', r: 2.4, lobes: 3, heads: [[6, 6], [10, 8]] });
T.oxeye_daisy = (S, st) => flower(S, st, { petal: '#f2f0e8', eye: '#e8b62a', r: 3.2, lobes: 8 });
T.cornflower = (S, st) => flower(S, st, { petal: '#4a6ee0', r: 2.8, lobes: 7 });
T.lily_of_the_valley = (S, st) => flower(S, st, { petal: '#f4f4ee', r: 1.3, shape: 'ball', heads: [[5, 6], [6.5, 8.5], [9.5, 6.5], [10.5, 9]], top: 5 });
for (const [c, col] of [['red', '#d8352c'], ['orange', '#ee8a2a'], ['white', '#eceee4'], ['pink', '#efa2c6']]) {
  T[`${c}_tulip`] = (S, st) => flower(S, st, { petal: col, r: 2.6, shape: 'cup', top: 6 });
}
T.dead_bush = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const pal = ramp('#8a6236', 4, { contrast: 0.5, hue: 16 });
  const px = new Px(S, S, false, -1);
  const r = rng(620);
  const branch = (x, y, dx, len, depth) => {
    for (let i = 0; i < len; i++) {
      px.set(Math.round(x), Math.round(y), depth ? 2 : 1);
      if (P) px.set(Math.round(x) + 1, Math.round(y), 1);
      x += dx;
      y -= 1;
      if (depth < 2 && i === Math.floor(len / 2)) branch(x, y, -dx * 0.8 + (r.f() - 0.5) * 0.3, Math.round(len * 0.6), depth + 1);
    }
  };
  branch(7 * k, S - 1, -0.35, 9 * k, 0);
  branch(8 * k, S - 1, 0.45, 8 * k, 0);
  return px.toImage(pal);
};
function mushroom(S, st, cap, spots) {
  const P = isP(st);
  const k = kOf(S);
  const pal = [...ramp('#d8cdb8', 3, { contrast: 0.4 }), ...ramp(cap, P ? 4 : 3, { contrast: 0.5, hue: 16 })];
  const sp = pal.length;
  pal.push(rgba('#f4efe4'));
  const px = new Px(S, S, false, -1);
  px.rect(7 * k, 9 * k, 2 * k, 4 * k, 1);
  px.vline(7 * k, 9 * k, 4 * k, 2);
  const c = 7.5 * k + (k - 1) / 2;
  for (let y = 5 * k; y < 9 * k; y++) for (let x = 4 * k; x < 12 * k; x++) {
    const dx = (x - c) / (4 * k);
    const dy = (y - 9 * k) / (4 * k);
    if (dx * dx + dy * dy <= 1) px.set(x, y, 3 + (dx + dy < -0.6 ? (P ? 3 : 2) : dy > -0.2 ? 0 : 1));
  }
  if (spots) for (const [x, y] of [[6, 6], [9, 7]]) px.rect(x * k, y * k, k, k, sp);
  return px.toImage(pal);
}
T.red_mushroom = (S, st) => mushroom(S, st, '#c42a24', true);
T.brown_mushroom = (S, st) => mushroom(S, st, '#957055', false);
function sapling(S, st, seed, leaf, bark) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(seed);
  const pal = [...ramp(bark, 3, { contrast: 0.4 }), ...ramp(leaf, P ? 5 : 4, { contrast: 0.55, hue: 18 })];
  const px = new Px(S, S, false, -1);
  px.rect(7 * k, 9 * k, k, 7 * k, 1);
  if (P) px.vline(7 * k + 1, 9 * k, 7 * k, 0);
  for (const [cx, cy, rr] of [[8, 6, 3.6], [5.5, 8, 2.4], [10.5, 8.5, 2.3]]) {
    lump(px, blob(r, cx * k, cy * k, rr * k, rr * k * 0.85, 0.35), 3 + 1, { hi: 1, lo: 1, max: pal.length - 1, min: 3 });
  }
  despeckle(px);
  return px.toImage(pal);
}
const SAPLINGS = { oak: ['#4f8f2a', '#6a4f31'], spruce: ['#3d6a42', '#4b3522'], birch: ['#78a24a', '#d9d4c4'], jungle: ['#3f8a28', '#5b4527'], acacia: ['#6c9a2a', '#6a655c'], dark_oak: ['#2f6a1e', '#3d2b19'], cherry: ['#e6a0c0', '#3b2533'] };
Object.entries(SAPLINGS).forEach(([w, [l, b]], i) => {
  T[`${w}_sapling`] = (S, st) => sapling(S, st, 630 + i, l, b);
});
/** Tall grass and large fern halves (grayscale; tinted by the game). */
function tallHalf(S, st, seed, fern, half) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(seed + (half === 'top' ? 1 : 0));
  const pal = ramp('#a8a8a8', P ? 5 : 4, { contrast: 0.5, hue: 0, tint: 0 });
  const px = new Px(S, S, false, -1);
  const count = fern ? 4 : P ? 10 : 7;
  const r0 = rng(seed);
  for (let i = 0; i < count; i++) {
    const x0 = Math.round(((i + 0.5) / count) * S + (r0.f() - 0.5) * 2 * k);
    const lean = (r0.f() - 0.5) * 0.35;
    const totalH = S * (1.3 + r0.f() * 0.6);
    for (let yy = 0; yy < 2 * S; yy++) {
      if (yy > totalH) break;
      const isTop = yy >= S;
      if ((half === 'top') !== isTop) continue;
      const t = yy / totalH;
      const x = Math.round(x0 + lean * yy);
      const y = isTop ? 2 * S - 1 - yy : S - 1 - yy;
      const shade = t < 0.2 ? 1 : t > 0.85 ? pal.length - 1 : 2 + (yy % 5 === 0 ? 1 : 0);
      const w = t > 0.8 ? 1 : P ? 2 : 1;
      for (let q = 0; q < w; q++) px.set(x + q, y, q ? shade - 1 : shade);
      if (fern && yy > 3 && yy % (2 * k) === 0) {
        const len = Math.max(1, Math.round((1 - t) * 3 * k));
        for (let l = 1; l <= len; l++) {
          px.set(x - l, y + Math.floor(l / 2), shade);
          px.set(x + w - 1 + l, y + Math.floor(l / 2), Math.max(0, shade - 1));
        }
      }
    }
  }
  return px.toImage(pal);
}
T.tall_grass_bottom = (S, st) => tallHalf(S, st, 640, false, 'bottom');
T.tall_grass_top = (S, st) => tallHalf(S, st, 640, false, 'top');
T.large_fern_bottom = (S, st) => tallHalf(S, st, 642, true, 'bottom');
T.large_fern_top = (S, st) => tallHalf(S, st, 642, true, 'top');
T.vine = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(645);
  const pal = ramp('#a2a2a2', P ? 5 : 4, { contrast: 0.55, hue: 0, tint: 0 });
  const px = new Px(S, S, true, -1);
  for (let i = 0; i < 3; i++) {
    let x = r.i(S);
    for (let y = 0; y < S; y++) {
      px.set(x, y, 1);
      if (y % (3 * k) === 0) lump(px, blob(r, x + r.pick([-2, 2]) * k, y, 1.6 * k, 1.2 * k, 0.4), 2, { hi: 1, lo: 1, max: pal.length - 1 });
      if (r.chance(0.25)) x += r.pick([-1, 1]);
    }
  }
  return px.toImage(pal);
};
T.lily_pad = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const pal = ramp('#a8a8a8', P ? 5 : 4, { contrast: 0.5, hue: 0, tint: 0 });
  const c = S / 2 - 0.5;
  const px = new Px(S, S, false, -1).fill((x, y) => {
    const d = Math.hypot(x - c, y - c);
    const a = Math.atan2(y - c, x - c);
    if (d > 6.5 * k || (a > 1.2 && a < 1.75 && d > k)) return -1;
    if (d > 5.8 * k) return 0;
    return Math.round(a * 3 + d) % 4 === 0 ? 1 : 2 + (x + y < 2 * c ? 1 : 0);
  });
  return px.toImage(pal);
};
/** Root crops: leafy tops, the crop showing at the last stage. */
function crop(S, st, stage, leaf, fruit, seed) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(seed + stage);
  const pal = [...ramp(leaf, 4, { contrast: 0.5, hue: 18 }), ...ramp(fruit, 3, { contrast: 0.5, hue: 16 })];
  const px = new Px(S, S, false, -1);
  const h = Math.round(S * (0.22 + stage * 0.16));
  for (let i = 0; i < 4; i++) {
    const x0 = Math.round(((i + 0.5) / 4) * S);
    for (let b = 0; b < 3; b++) {
      const dx = (b - 1) * 0.5;
      const hh = h - r.i(2 * k);
      for (let y = 0; y < hh; y++) {
        const x = Math.round(x0 + dx * y * 0.6);
        px.set(x, S - 1 - y, y > hh - 2 * k ? 3 : y < hh / 3 ? 1 : 2);
        if (P && y > hh / 2) px.set(x + 1, S - 1 - y, 1);
      }
    }
    if (stage === 3) {
      px.rect(x0 - k, S - 2 * k, 2 * k, 2 * k, 4 + 1);
      px.hline(x0 - k, S - 2 * k, 2 * k, 4 + 2);
    }
  }
  return px.toImage(pal);
}
for (let s = 0; s < 4; s++) {
  T[`carrots_stage${s}`] = (S, st) => crop(S, st, s, '#4f9a2a', '#ef8a1e', 650);
  T[`potatoes_stage${s}`] = (S, st) => crop(S, st, s, '#56922e', '#c9a25a', 660);
  T[`beetroots_stage${s}`] = (S, st) => crop(S, st, s, '#4a8a2a', '#a82a3a', 670);
}

module.exports = { T, TERRACOTTA, STRIPPED, SAPLINGS };
