// More block textures in the same art direction as blocks.js: top-left light,
// hue-shifted ramps, 3-4 shades per material at 16x and 5-6 at 32x, 1px
// mortar/outlines, no lone pixels. Every texture is original.
const { Px, ramp, rng, blob, lump, cells, noise, despeckle, dither, layer, strip, Image, rgba, mixc } = require('./lib');
const { T: B, rock, cat, isP } = require('./blocks');

const T = {};
const kOf = (S) => S / 16;

// ----------------------------------------------------------- stone family --
/** Bricks laid in courses; every brick is a bevelled slab with a rock fill. */
function brickWall(S, st, seed, { color, mortar, rows = 2, cols = 1, offset = 0.5, rough = true, crack = false, moss = false, density = 0.7 }) {
  const P = isP(st);
  const r = rng(seed);
  const n = P ? 6 : 4;
  const fill = rough ? rock(S, st, seed, color, { density, flat: !P, cracks: 0, dither: false }) : null;
  const pal = fill ? fill.pal : ramp(color, n, { contrast: P ? 0.45 : 0.3, hue: 16, tint: 0.04 });
  const mor = pal.length;
  pal.push(...ramp(mortar, 2, { contrast: 0.3, hue: 14 }));
  const px = fill ? fill.px : new Px(S).fill(P ? 3 : 2);
  const rh = S / rows;
  const bw = S / cols;
  for (let row = 0; row < rows; row++) {
    const xo = row % 2 ? Math.round(bw * offset) : 0;
    const y0 = row * rh;
    for (let c = 0; c <= cols; c++) {
      const x0 = xo + c * bw;
      const tilt = r.pick([0, 0, 1, -1]) * (P ? 1 : 0);
      for (let j = 0; j < rh - 1; j++) for (let i = 0; i < bw - 1; i++) {
        const v = px.get(x0 + i, y0 + j);
        if (tilt && i > 1 && j > 1) px.set(x0 + i, y0 + j, Math.max(0, Math.min(n - 1, v + tilt)));
      }
      // bevel: lit top and left, shaded bottom and right
      px.hline(x0, y0, bw - 1, n - 1);
      px.vline(x0, y0, rh - 1, P ? n - 2 : n - 1);
      px.hline(x0 + 1, y0 + rh - 2, bw - 2, 1);
      px.vline(x0 + bw - 2, y0 + 1, rh - 2, 1);
      // mortar
      px.hline(x0, y0 + rh - 1, bw, mor);
      px.vline(x0 + bw - 1, y0, rh, mor);
      if (P) px.set(x0 + bw - 1, y0 + rh - 1, mor + 1);
    }
  }
  if (crack) {
    for (let c = 0; c < (P ? 3 : 2); c++) {
      let x = r.i(S);
      let y = r.i(S);
      for (let i = 0; i < (P ? 10 : 6); i++) {
        px.set(x, y, mor);
        if (P) px.bump(x + 1, y, 1, 0, n - 1);
        if (r.chance(0.55)) y++;
        else x += r.pick([-1, 1]);
      }
    }
  }
  if (moss) addMoss(px, pal, S, st, seed + 7, moss);
  return px.toImage(pal);
}

/** Moss clumps that hang from mortar lines and gaps. */
function addMoss(px, pal, S, st, seed, amount = 1) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(seed);
  const mo = pal.length;
  pal.push(...ramp('#5f8a35', P ? 4 : 3, { contrast: 0.45, hue: 20 }));
  const top = mo + (P ? 3 : 2);
  for (let i = 0; i < Math.round((P ? 7 : 5) * amount); i++) {
    const pts = blob(r, r.i(S), r.i(S), (1.2 + r.f() * 1.8) * k, (0.8 + r.f() * 1.1) * k, 0.6);
    lump(px, pts, mo + 1, { hi: 1, lo: 1, max: top, min: mo });
    // a drip or two
    const [x, y] = pts[r.i(pts.length)];
    for (let d = 0; d < r.range(1, 2) * k; d++) px.set(x, y + d + 1, mo);
  }
  return px;
}

T.stone_bricks = (S, st) => brickWall(S, st, 201, { color: '#7d7f84', mortar: '#4a4a52' });
T.mossy_stone_bricks = (S, st) => brickWall(S, st, 201, { color: '#7d7f84', mortar: '#4a4a52', moss: 1 });
T.cracked_stone_bricks = (S, st) => brickWall(S, st, 201, { color: '#7d7f84', mortar: '#4a4a52', crack: true });
T.chiseled_stone_bricks = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const { px, pal } = rock(S, st, 205, '#7d7f84', { density: 0.6, flat: !P, cracks: 0, dither: false });
  const n = pal.length;
  const bev = (x, y, w, h, inset) => {
    px.hline(x, y, w, inset ? 1 : n - 1);
    px.vline(x, y, h, inset ? 1 : n - 1);
    px.hline(x, y + h - 1, w, inset ? n - 1 : 0);
    px.vline(x + w - 1, y, h, inset ? n - 1 : 0);
  };
  bev(0, 0, S, S, false);
  bev(2 * k, 2 * k, S - 4 * k, S - 4 * k, true);
  // a carved ring with a lit lower edge
  const c = S / 2 - 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - c, y - c);
    if (d > 3.2 * k && d < 4.2 * k) px.set(x, y, y + x > S ? n - 1 : 1);
  }
  px.rect(Math.floor(c), Math.floor(c), k, k, 1);
  return px.toImage(pal);
};

T.mossy_cobblestone = (S, st) => {
  const img = B.cobblestone(S, st);
  const P = isP(st);
  const px = new Px(S, S, true, -1);
  const pal = [];
  addMoss(px, pal, S, st, 211, P ? 1.3 : 1.1);
  return layer(img, px.toImage(pal));
};

/** Smooth stone: soft mottling only, inside a bevelled frame. */
function smoothPanel(S, st, rows = 1) {
  const P = isP(st);
  const n = P ? 5 : 4;
  const pal = ramp('#a3a5a8', n, { contrast: P ? 0.3 : 0.22, hue: 14, tint: 0.03 });
  const mot = noise(S, P ? 5 : 4, 212);
  const px = new Px(S).fill((x, y) => (mot(x, y) > 0.68 ? 3 : mot(x, y) < 0.3 ? 1 : 2));
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

T.bedrock = (S, st) => {
  const P = isP(st);
  const pal = ['#1c1a20', '#36343c', '#57565e', '#7c7c84', '#a3a3aa', '#c6c6cc'].map(rgba).slice(P ? 0 : 1, P ? 6 : 5);
  const { px } = rock(S, st, 213, '#555', { pal, density: 1.6, scale: 0.9, cracks: P ? 3 : 0, ramp: {} });
  return px.toImage(pal);
};

// deepslate family
const DEEP = '#4f4f58';
T.deepslate_top = (S, st) => {
  // end grain of the layers: the same slate, with short flakes in every direction
  const P = isP(st);
  const { px, pal } = rock(S, st, 220, DEEP, { density: 1.5, scale: 0.75, cracks: 0, ramp: { contrast: P ? 0.5 : 0.3, hue: 16, tint: 0.05 } });
  return px.toImage(pal);
};
T.cobbled_deepslate = (S, st) => cobbleLike(S, st, 221, DEEP, isP(st) ? 15 : 8);
T.deepslate_bricks = (S, st) => brickWall(S, st, 222, { color: '#55555e', mortar: '#26262c', rows: 4, cols: 2, rough: false });
T.deepslate_tiles = (S, st) => brickWall(S, st, 223, { color: '#3f3f47', mortar: '#1f1f25', rows: 4, cols: 4, offset: 0, rough: false });

/** Rounded stones packed together (cobblestone-like). */
function cobbleLike(S, st, seed, color, count) {
  const P = isP(st);
  const r = rng(seed);
  const n = P ? 7 : 5;
  const pal = ramp(color, n, { contrast: P ? 0.6 : 0.48, hue: 18, tint: 0.05 });
  const { lab } = cells(r, S, count, { minDist: S / (P ? 5.8 : 4.4) });
  const shadeOf = Array.from({ length: 64 }, () => r.pick(P ? [2, 3, 3, 4] : [2, 2, 3]));
  const px = new Px(S).fill((x, y) => {
    const id = lab.get(x, y);
    if (lab.get(x + 1, y) !== id || lab.get(x, y + 1) !== id) return 0;
    const Lf = lab.get(x - 1, y) !== id;
    const U = lab.get(x, y - 1) !== id;
    if (Lf && U) return 1;
    const v = shadeOf[id];
    if (Lf || U) return Math.min(n - 1, v + (P ? 2 : 1));
    if (lab.get(x + 2, y) !== id || lab.get(x, y + 2) !== id) return v - 1;
    return v;
  });
  return px.toImage(pal);
}

T.tuff = (S, st) => {
  const P = isP(st);
  const { px, pal } = rock(S, st, 230, '#6c6d66', { density: 1.5, scale: 0.7, ramp: { hue: 10 } });
  const r = rng(231);
  const fl = pal.length;
  pal.push(...ramp('#a9aa9c', 2, { contrast: 0.2 }));
  for (let i = 0; i < (P ? 14 : 7); i++) {
    const x = r.i(S);
    const y = r.i(S);
    px.set(x, y, fl + 1);
    if (P) px.set(x + 1, y, fl);
  }
  return px.toImage(pal);
};
T.calcite = (S, st) => {
  const P = isP(st);
  const { px, pal } = rock(S, st, 232, '#dcdbd6', { density: 0.9, scale: 1.3, flat: false, cracks: 1, ramp: { contrast: P ? 0.22 : 0.14 } });
  return px.toImage(pal);
};

T.end_stone = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const { px, pal } = rock(S, st, 240, '#dcdc9e', { density: 0.8, scale: 1.2, cracks: 0, ramp: { contrast: P ? 0.3 : 0.2, hue: 20 } });
  const r = rng(241);
  // little craters: dark rim on top-left, lit on bottom-right
  for (let i = 0; i < (P ? 7 : 4); i++) {
    const cx = r.i(S);
    const cy = r.i(S);
    const rad = (P ? 1.2 + r.f() : 1) * k;
    for (let y = -2 * k; y <= 2 * k; y++) for (let x = -2 * k; x <= 2 * k; x++) {
      const d = Math.hypot(x, y);
      if (d > rad + 0.6) continue;
      px.set(cx + x, cy + y, d > rad - 0.4 ? (x + y < 0 ? 0 : pal.length - 1) : 1);
    }
  }
  return px.toImage(pal);
};
T.end_stone_bricks = (S, st) => brickWall(S, st, 242, { color: '#dcdba0', mortar: '#9a9466', rows: 4, cols: 2, density: 0.5 });

// ------------------------------------------------------------- the nether --
T.soul_sand = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(250);
  const n = P ? 5 : 4;
  const pal = ramp('#5b4535', n, { contrast: P ? 0.5 : 0.38, hue: 16 });
  const b = 2;
  const px = new Px(S).fill(b);
  for (let i = 0; i < (P ? 14 : 8); i++) lump(px, blob(r, r.i(S), r.i(S), (0.9 + r.f()) * k, (0.7 + r.f() * 0.6) * k, 0.4), b, { hi: 1, lo: 1, drop: 1, max: n - 1 });
  despeckle(px);
  // wailing faces pressed into the sand
  const FACE = P ? ['.aa.aa.', 'a00a00a', '.aa.aa.', '..a0a..', '.a000a.', '..aaa..'] : ['a0a0a', '..0..', '.000.'];
  for (const [x, y] of P ? [[3, 4], [19, 18], [6, 22]] : [[2, 3], [9, 10]]) px.stamp(x, y, FACE, { a: b - 1, 0: 0 });
  return px.toImage(pal);
};
T.glowstone = (S, st) => {
  const P = isP(st);
  const r = rng(251);
  const pal = (P ? ['#6b4a22', '#a7712e', '#d9a44a', '#f4cf6e', '#ffe9a6', '#fffbe0'] : ['#8a5d28', '#d9a44a', '#f4cf6e', '#fff0b0']).map(rgba);
  const n = pal.length;
  const { lab } = cells(r, S, P ? 14 : 8, { minDist: S / (P ? 5.5 : 4.4) });
  const lv = Array.from({ length: 32 }, () => r.pick(P ? [2, 3, 3, 4] : [1, 2, 2]));
  const px = new Px(S).fill((x, y) => {
    const id = lab.get(x, y);
    if (lab.get(x + 1, y) !== id || lab.get(x, y + 1) !== id) return 0;
    if (lab.get(x - 1, y) !== id || lab.get(x, y - 1) !== id) return Math.min(n - 1, lv[id] + 1);
    return lv[id];
  });
  for (let i = 0; i < (P ? 10 : 5); i++) px.set(r.i(S), r.i(S), n - 1);
  return px.toImage(pal);
};

// ------------------------------------------------------------------ soils --
T.coarse_dirt = (S, st) => {
  const img = B.dirt(S, st, 260);
  const P = isP(st);
  const r = rng(261);
  const px = new Px(S, S, true, -1);
  const pal = ramp('#8b8580', 3, { contrast: 0.35, hue: 14 });
  pal.unshift(rgba('#3f2c1e'));
  for (let i = 0; i < (P ? 14 : 8); i++) {
    const x = r.i(S);
    const y = r.i(S);
    px.stamp(x, y, P ? r.pick([['.ab', 'abc', '.c.'], ['ab', 'bc'], ['abb', 'bcc']]) : r.pick([['ab', 'bc'], ['ab'], ['a', 'c']]), { a: 3, b: 2, c: 1 });
    px.set(x + (P ? 3 : 2), y + (P ? 2 : 1), 0);
  }
  return layer(img, px.toImage(pal));
};

T.podzol_top = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(262);
  const { pal, off } = cat(ramp('#6a4a2a', P ? 5 : 4, { contrast: 0.45, hue: 16 }), ramp('#8a6a3c', 3, { contrast: 0.35, hue: 18 }));
  const b = P ? 2 : 1;
  const px = new Px(S).fill(b);
  for (let i = 0; i < (P ? 8 : 4); i++) for (const [x, y] of blob(r, r.i(S), r.i(S), 2 * k, 1.4 * k, 0.6)) px.set(x, y, b - 1);
  // fallen needles: short diagonal strokes
  for (let i = 0; i < (P ? 40 : 16); i++) {
    const x = r.i(S);
    const y = r.i(S);
    const d = r.pick([1, -1]);
    const len = P ? r.range(2, 4) : 2;
    for (let j = 0; j < len; j++) px.set(x + j * d, y + j, off[1] + (j === 0 ? 2 : 1));
    px.set(x + len * d, y + len, off[1]);
  }
  return px.toImage(pal);
};
T.podzol_side = (S, st) => {
  const img = B.dirt(S, st, 263);
  const top = T.podzol_top(S, st);
  const P = isP(st);
  const k = kOf(S);
  const r = rng(264);
  for (let x = 0; x < S; x++) {
    const h = Math.round((3 + r.pick([0, 0, 1, 1, 2])) * k);
    for (let y = 0; y < h; y++) img.set(x, y, top.get(x, y + 5));
    img.set(x, h, mixc(top.get(x, 0), [20, 12, 8, 255], 0.45));
  }
  if (P) for (let x = 0; x < S; x++) img.set(x, 0, mixc(img.get(x, 0), [255, 230, 190, 255], 0.15));
  return img;
};

function farmland(S, st, wet) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(wet ? 271 : 270);
  // tilled soil: the same dirt, darker when wet, with soft furrows
  const img = B.dirt(S, st, wet ? 275 : 274);
  const shade = (x, y, c, t) => img.set(x, y, mixc(img.get(x, y), c, t));
  if (wet) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) shade(x, y, [40, 22, 14, 255], 0.38);
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4 * k;
    for (let x = 0; x < S; x++) {
      if (r.chance(0.12)) continue; // broken ridge here and there
      shade(x, y0 + k, [255, 228, 180, 255], P ? 0.16 : 0.12);
      shade(x, y0 + 3 * k, [20, 10, 8, 255], 0.3);
      if (P) shade(x, y0 + 3 * k - 1, [20, 10, 8, 255], 0.14);
    }
  }
  // sunk edge so the tilled tile reads as lower than its neighbours
  for (let i = 0; i < S; i++) {
    shade(i, 0, [20, 10, 8, 255], 0.35);
    shade(0, i, [20, 10, 8, 255], 0.35);
    shade(i, S - 1, [255, 228, 180, 255], 0.1);
    shade(S - 1, i, [255, 228, 180, 255], 0.1);
  }
  return img;
}
T.farmland = (S, st) => farmland(S, st, false);
T.farmland_moist = (S, st) => farmland(S, st, true);

T.grass_block_snow = (S, st) => {
  const img = B.dirt(S, st, 106);
  const snow = B.snow(S, st);
  const P = isP(st);
  const k = kOf(S);
  const r = rng(272);
  for (let x = 0; x < S;) {
    const w = r.range(2, 4) * k;
    const h = Math.round((4 + r.pick([0, 0, 1, 2])) * k);
    for (let i = 0; i < w && x < S; i++, x++) {
      for (let y = 0; y < h; y++) img.set(x, y, snow.get(x, y));
      img.set(x, h - 1, mixc(snow.get(x, h - 1), [120, 140, 170, 255], P ? 0.25 : 0.2));
      img.set(x, h, mixc(img.get(x, h), [10, 10, 30, 255], 0.35));
    }
  }
  return img;
};

T.clay = (S, st) => {
  const P = isP(st);
  const { px, pal } = rock(S, st, 273, '#a2a6b2', { density: 0.7, scale: 1.4, flat: !P, cracks: 0, ramp: { contrast: P ? 0.24 : 0.16, hue: 10 } });
  return px.toImage(pal);
};
T.terracotta = (S, st) => {
  const P = isP(st);
  const { px, pal } = rock(S, st, 274, '#985e43', { density: 0.6, scale: 1.6, flat: !P, cracks: 0, ramp: { contrast: P ? 0.2 : 0.12, hue: 12 } });
  return px.toImage(pal);
};

// -------------------------------------------------------- storage blocks --
/**
 * Storage blocks share one build: a bevelled outer frame, a sunken border and
 * a raised inner panel, then a motif for the material (rivets, sheen, cut gem,
 * tiles, mosaic, wiring, lumps).
 */
function storage(S, st, seed, color, motif) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp(color, n, { contrast: P ? 0.55 : 0.45, hue: 20, tint: 0.04 });
  const hl = pal.length;
  pal.push(mixc(pal[n - 1], [255, 255, 245, 255], 0.6));
  const b = P ? 3 : 2;
  const px = new Px(S).fill(b);
  const box = (x, y, w, h, raised) => {
    px.hline(x, y, w, raised ? n - 1 : 0).vline(x, y, h, raised ? n - 1 : 0);
    px.hline(x, y + h - 1, w, raised ? 0 : n - 1).vline(x + w - 1, y, h, raised ? 0 : n - 1);
  };
  const framed = () => {
    box(0, 0, S, S, true);
    box(k, k, S - 2 * k, S - 2 * k, false);
    if (P) box(2 * k, 2 * k, S - 4 * k, S - 4 * k, true);
    px.set(0, 0, hl);
  };
  const gem = (inside, cx, cy) => {
    // faceted: upper-left lit, lower-right shaded, a dark rim, one glint
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!inside(x, y)) continue;
      const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const dx = x - cx;
      const dy = y - cy;
      px.set(x, y, rim ? (dx + dy < 0 ? n - 1 : 0) : dx <= 0 && dy <= 0 ? n - 2 : dx > 0 && dy > 0 ? 1 : b);
    }
  };
  if (motif === 'plates') {
    for (const [x, y] of [[0, 0], [S / 2, 0], [0, S / 2], [S / 2, S / 2]]) {
      box(x, y, S / 2, S / 2, true);
      for (const [rx, ry] of [[2 * k, 2 * k], [S / 2 - 3 * k, S / 2 - 3 * k]]) {
        px.set(x + rx, y + ry, hl);
        px.set(x + rx + 1, y + ry + 1, 0);
      }
    }
    if (P) for (let i = 0; i < 8; i++) px.hline(r.i(S), r.i(S), r.range(3, 7), b + 1);
  } else if (motif === 'shine') {
    framed();
    for (let y = 2 * k + 1; y < S - 2 * k - 1; y++) for (let x = 2 * k + 1; x < S - 2 * k - 1; x++) {
      const d = x + y;
      if (d >= 7 * k && d < 9 * k) px.set(x, y, n - 2);
      if (d >= 9 * k && d < 9 * k + Math.max(1, k - 1) + 1) px.set(x, y, n - 1);
      if (d >= 13 * k && d < 14 * k) px.set(x, y, n - 2);
    }
    px.set(3 * k, 3 * k, hl);
  } else if (motif === 'facets') {
    framed();
    const c = S / 2 - 0.5;
    gem((x, y) => Math.abs(x - c) + Math.abs(y - c) <= 5 * k, c, c);
    px.set(Math.round(c - 2 * k), Math.round(c - k), hl);
  } else if (motif === 'hexgem') {
    framed();
    const c = S / 2 - 0.5;
    gem((x, y) => Math.abs(x - c) <= 3 * k && Math.abs(y - c) <= 5 * k - Math.max(0, Math.abs(x - c) - k), c, c);
    px.set(Math.round(c - 2 * k), Math.round(c - 3 * k), hl);
  } else if (motif === 'mosaic') {
    const { lab } = cells(r, S, P ? 16 : 9, { minDist: S / 5.5 });
    const lv = Array.from({ length: 32 }, () => r.pick([b - 1, b, b, b + 1]));
    px.fill((x, y) => {
      const id = lab.get(x, y);
      if (lab.get(x + 1, y) !== id || lab.get(x, y + 1) !== id) return 0;
      if (lab.get(x - 1, y) !== id || lab.get(x, y - 1) !== id) return Math.min(n - 1, lv[id] + 1);
      return lv[id];
    });
    pal.push(rgba('#e8c45a'));
    for (let i = 0; i < (P ? 8 : 4); i++) px.set(r.i(S), r.i(S), pal.length - 1);
  } else if (motif === 'wires') {
    framed();
    // a glowing junction in the middle with traces to each side
    const c = S / 2 - (P ? 1 : 1);
    for (let i = 2 * k; i < S - 2 * k; i++) {
      px.set(i, c, n - 2);
      px.set(c, i, n - 2);
      if (P) {
        px.set(i, c + 1, 1);
        px.set(c + 1, i, 1);
      }
    }
    px.rect(c - k, c - k, 2 * k + (P ? 2 : 1), 2 * k + (P ? 2 : 1), n - 1);
    px.set(c, c, hl);
    for (const [x, y] of [[4 * k, 4 * k], [S - 5 * k, 4 * k], [4 * k, S - 5 * k], [S - 5 * k, S - 5 * k]]) {
      px.rect(x, y, k, k, 0);
      px.set(x, y, n - 1);
    }
  } else if (motif === 'lumps') {
    for (let i = 0; i < (P ? 12 : 7); i++) lump(px, blob(r, r.i(S), r.i(S), (1.4 + r.f() * 1.4) * k, (1 + r.f()) * k, 0.5), b + r.pick([-1, 0, 1]), { hi: 1, lo: 1, drop: 1, max: n - 1 });
    for (let i = 0; i < (P ? 6 : 3); i++) px.set(r.i(S), r.i(S), hl);
  }
  despeckle(px, (v) => v === hl || v >= pal.length - 1);
  return px.toImage(pal);
}
T.coal_block = (S, st) => storage(S, st, 280, '#2d2c31', 'lumps');
T.iron_block = (S, st) => storage(S, st, 281, '#d4d6d9', 'plates');
T.gold_block = (S, st) => storage(S, st, 282, '#f2c63a', 'shine');
T.diamond_block = (S, st) => storage(S, st, 283, '#5fdbe0', 'facets');
T.emerald_block = (S, st) => storage(S, st, 284, '#33c46a', 'hexgem');
T.lapis_block = (S, st) => storage(S, st, 285, '#2b54b8', 'mosaic');
T.redstone_block = (S, st) => storage(S, st, 286, '#b8201b', 'wires');

// ------------------------------------------------------------------- wool --
const DYES = {
  white: '#e9ecec', orange: '#ef7a1d', magenta: '#bd48b4', light_blue: '#3db2db', yellow: '#f6c62e', lime: '#73ba1e', pink: '#ee90ad', gray: '#41464a',
  light_gray: '#8f908a', cyan: '#168c92', purple: '#7a2fac', blue: '#3a3ea0', brown: '#744a2a', green: '#56701e', red: '#a42a24', black: '#1d1d22',
};
function wool(S, st, color, seed) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(seed);
  const n = P ? 5 : 4;
  const dark = color === DYES.black || color === DYES.gray;
  const pal = ramp(color, n, { contrast: P ? 0.34 : 0.24, hue: 18, mid: dark ? 1 : n - 2 });
  const b = dark ? 1 : n - 2;
  const px = new Px(S).fill(b);
  if (!P) {
    // calm knit: short dashes offset every other row
    for (let y = 1; y < S; y += 3) for (let x = (y % 2) * 2; x < S; x += 4) px.hline(x, y, 2, b - 1 < 0 ? b + 1 : b - 1);
    for (let i = 0; i < 3; i++) lump(px, blob(r, r.i(S), r.i(S), 1.5, 1, 0.4), b, { hi: 1, lo: 0, max: n - 1 });
    return px.toImage(pal);
  }
  const cw = 4 * k;
  for (let y = 0; y < S; y += 2 * k) {
    const xo = (y / (2 * k)) % 2 ? cw / 2 : 0;
    for (let x = xo; x < S + cw; x += cw) {
      px.set(x, y, b - 1);
      px.set(x + cw - 1, y, b - 1);
      px.set(x + 1, y + 1, b - 1);
      px.set(x + cw - 2, y + 1, b - 1);
      px.hline(x + 2, y, cw - 4, b + 1);
    }
  }
  for (let i = 0; i < 5; i++) lump(px, blob(r, r.i(S), r.i(S), 1.4 * k, k, 0.4), b, { hi: 1, lo: 1, max: n - 1 });
  return px.toImage(pal);
}
Object.entries(DYES).forEach(([c, hex], i) => {
  T[`${c}_wool`] = (S, st) => wool(S, st, hex, 290 + i);
});

// ------------------------------------------------------------ built stuff --
T.bookshelf = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(300);
  const img = B.oak_planks(S, st);
  const px = new Px(S, S, false, -1);
  const books = ['#8d2a2a', '#2f4f8f', '#3f7a3a', '#8a6a2a', '#5a3a7a', '#a35a2a', '#2f6f74', '#6b2f2f'];
  const pal = [];
  const mats = books.map((c) => {
    const o = pal.length;
    pal.push(...ramp(c, 3, { contrast: 0.45, hue: 16 }));
    return o;
  });
  const dk = pal.length;
  pal.push(rgba('#24180f'), rgba('#4a3420'), rgba('#e8d9a8'));
  for (const y0 of [k, S / 2 + k]) {
    const h = S / 2 - 2 * k;
    px.rect(0, y0, S, h, dk);
    let x = k;
    while (x < S - k) {
      const w = r.pick(P ? [2, 2, 3, 3, 4] : [1, 2, 2]);
      if (x + w > S - k) break;
      const bh = h - r.pick([0, 0, 1, 2]) * (P ? 1 : 1);
      const m = r.pick(mats);
      const lean = r.chance(0.08);
      for (let i = 0; i < w; i++) {
        for (let y = h - bh; y < h; y++) px.set(x + i, y0 + y, m + (i === 0 ? 2 : i === w - 1 ? 0 : 1));
      }
      // a pale label band on wider spines
      if (w >= 2 && !lean) px.hline(x + (P ? 1 : 0), y0 + h - bh + Math.floor(bh / 3), Math.max(1, w - (P ? 2 : 0)), dk + 2);
      x += w;
      if (r.chance(0.12)) x += 1;
    }
    px.hline(0, y0 - 1 + h + k, S, dk + 1);
  }
  return layer(img, px.toImage(pal));
};

function tnt(S, st, face) {
  const P = isP(st);
  const k = kOf(S);
  const n = P ? 5 : 4;
  const { pal, off } = cat(ramp('#c23a2a', n, { contrast: P ? 0.45 : 0.35, hue: 14 }), ramp('#e6e2d6', 3, { contrast: 0.3, hue: 14 }), [rgba('#1d1a1e'), rgba('#6a6264')]);
  const px = new Px(S).fill(P ? 2 : 1);
  if (face === 'side') {
    // vertical paper tubes
    for (let x = 0; x < S; x += 4 * k) {
      px.vline(x, 0, S, P ? 4 : 3);
      if (P) px.vline(x + 1, 0, S, 3);
      px.vline(x + 4 * k - 1, 0, S, 0);
    }
    // the label band with "TNT"
    const y0 = 5 * k;
    px.rect(0, y0, S, 6 * k, off[1] + 1);
    px.hline(0, y0, S, off[1] + 2).hline(0, y0 + 6 * k - 1, S, off[1]);
    const L = ['###.#..#.###', '.#..##.#..#.', '.#..#.##..#.', '.#..#..#..#.'];
    L.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '#') px.rect(2 * k + i * k, y0 + k + j * k, k, k, off[2]);
    }));
  } else {
    // tube ends: rings
    for (let y = 0; y < S; y += 8 * k) for (let x = 0; x < S; x += 8 * k) {
      const c = 4 * k - 0.5;
      for (let j = 0; j < 8 * k; j++) for (let i = 0; i < 8 * k; i++) {
        const d = Math.hypot(i - c, j - c);
        px.set(x + i, y + j, d > 3.6 * k ? 0 : d > 3 * k ? (i + j < 8 * k ? n - 1 : 1) : P ? 2 : 1);
      }
    }
    if (face === 'top') {
      // fuse in the middle
      const c = S / 2;
      px.rect(c - k, c - k, 2 * k, 2 * k, off[2]);
      px.rect(c - k, c - 3 * k, k, 2 * k, off[2] + 1);
      px.set(c - k, c - 3 * k, off[1] + 2);
    }
  }
  return px.toImage(pal);
}
T.tnt_side = (S, st) => tnt(S, st, 'side');
T.tnt_top = (S, st) => tnt(S, st, 'top');
T.tnt_bottom = (S, st) => tnt(S, st, 'bottom');

/** Shaded wooden pieces (rails, boards) on a transparent canvas. */
function woodParts(S, st, rects, seed = 1, plank = '#ad8550') {
  const P = isP(st);
  const pal = ramp(plank, P ? 5 : 4, { contrast: 0.5, hue: 16 });
  pal.unshift(mixc(pal[0], [26, 16, 20, 255], 0.5));
  const px = new Px(S, S, false, -1);
  const r = rng(seed);
  const mid = P ? 3 : 2;
  for (const [x, y, w, h] of rects) {
    px.rect(x, y, w, h, mid);
    px.hline(x, y, w, mid + 1).vline(x, y, h, mid + 1);
    px.hline(x, y + h - 1, w, mid - 1).vline(x + w - 1, y, h, mid - 1);
    if (P) for (let g = 0; g < Math.max(1, (w * h) / 40); g++) {
      const gx = x + 1 + r.i(Math.max(1, w - 2));
      const gy = y + 1 + r.i(Math.max(1, h - 2));
      if (w > h) px.hline(gx, gy, Math.min(4, x + w - 1 - gx), mid - 1);
      else px.vline(gx, gy, Math.min(4, y + h - 1 - gy), mid - 1);
    }
  }
  return { px, pal };
}

T.ladder = (S, st) => {
  const k = kOf(S);
  const rects = [[2 * k, 0, 2 * k, S], [12 * k, 0, 2 * k, S]];
  for (let y = k; y < S; y += 4 * k) rects.push([4 * k, y, 8 * k, 2 * k]);
  const { px, pal } = woodParts(S, st, rects, 310);
  // nails where rungs meet rails
  for (let y = k; y < S; y += 4 * k) {
    px.set(3 * k, y + Math.floor(k / 2), 0);
    px.set(13 * k, y + Math.floor(k / 2), 0);
  }
  return px.toImage(pal);
};

function door(S, st, half) {
  const P = isP(st);
  const k = kOf(S);
  const img = B.oak_planks(S, st);
  // rotate the plank pattern to vertical boards
  const v = new Image(S).fill((x, y) => img.get(y, x));
  const pal = ramp('#6a4a2a', 4, { contrast: 0.45, hue: 16 });
  const metal = ramp('#8c8f95', 3, { contrast: 0.5, hue: 16 });
  // frame
  for (let i = 0; i < S; i++) {
    for (let t = 0; t < k; t++) {
      v.set(t, i, pal[2]);
      v.set(S - 1 - t, i, pal[0]);
    }
  }
  if (half === 'top') {
    for (let i = 0; i < S; i++) for (let t = 0; t < k; t++) v.set(i, t, pal[3]);
    // two windows
    for (const wx of [3 * k, 9 * k]) {
      for (let y = 3 * k; y < 10 * k; y++) for (let x = wx; x < wx + 4 * k; x++) v.set(x, y, [0, 0, 0, 0]);
      for (let i = 0; i < 4 * k + 2; i++) {
        v.set(wx - 1 + i, 3 * k - 1, pal[0]);
        v.set(wx - 1 + i, 10 * k, pal[3]);
      }
      for (let y = 3 * k; y < 10 * k; y++) {
        v.set(wx - 1, y, pal[0]);
        v.set(wx + 4 * k, y, pal[3]);
      }
    }
    // cross brace below the windows
    for (let x = k; x < S - k; x++) {
      v.set(x, 12 * k, pal[3]);
      v.set(x, 13 * k - 1, pal[1]);
    }
  } else {
    for (let i = 0; i < S; i++) for (let t = 0; t < k; t++) v.set(i, S - 1 - t, pal[0]);
    // diagonal brace
    for (let i = 2 * k; i < S - 2 * k; i++) for (let t = 0; t < 2 * k; t++) v.set(i, Math.min(S - 2 * k, S - 2 * k - (i - 2 * k) + t), t === 0 ? pal[3] : pal[1]);
    // handle
    for (let y = 2 * k; y < 5 * k; y++) for (let x = 11 * k; x < 12 * k + (P ? 1 : 0); x++) v.set(x, y, y === 2 * k ? metal[2] : metal[1]);
    v.set(11 * k, 5 * k - 1, metal[0]);
  }
  return v;
}
T.oak_door_top = (S, st) => door(S, st, 'top');
T.oak_door_bottom = (S, st) => door(S, st, 'bottom');

T.oak_trapdoor = (S, st) => {
  const k = kOf(S);
  const rects = [[0, 0, S, 2 * k], [0, S - 2 * k, S, 2 * k], [0, 0, 2 * k, S], [S - 2 * k, 0, 2 * k, S], [7 * k, 0, 2 * k, S], [0, 7 * k, S, 2 * k]];
  const { px, pal } = woodParts(S, st, rects, 320);
  return px.toImage(pal);
};

T.lantern = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const metal = ramp('#4d4f58', 4, { contrast: 0.55, hue: 16 });
  const glow = P ? ['#c8692a', '#f2a443', '#ffd27a', '#fff3c4'].map(rgba) : ['#e88a35', '#ffcf6e', '#fff1bd'].map(rgba);
  const frame = (fl) => {
    const img = new Image(S);
    const u = (x, y, w, h, c) => {
      for (let j = 0; j < h * k; j++) for (let i = 0; i < w * k; i++) img.set(x * k + i, y * k + j, typeof c === 'function' ? c(i, j) : c);
    };
    // cap (4×2 band) and body side (6×7 with a lit glass window)
    u(1, 0, 4, 2, (i, j) => (j < k ? metal[2] : metal[1]));
    u(0, 2, 6, 7, metal[1]);
    u(1, 3, 4, 5, (i, j) => {
      const t = j / (5 * k);
      const idx = Math.min(glow.length - 1, Math.max(0, Math.round((1 - t) * 1.2 + fl + (glow.length - 3))));
      return glow[Math.max(0, idx - (i === 0 || i === 4 * k - 1 ? 1 : 0))];
    });
    u(0, 2, 6, 1, metal[3]);
    u(0, 8, 6, 1, metal[0]);
    // top and bottom plates (6×6)
    u(0, 9, 6, 6, (i, j) => (i < k || j < k ? metal[2] : i >= 5 * k || j >= 5 * k ? metal[0] : metal[1]));
    u(2, 11, 2, 2, metal[0]);
    // handle loops
    u(11, 1, 3, 1, metal[2]);
    u(11, 2, 1, 2, metal[1]);
    u(13, 2, 1, 2, metal[1]);
    u(11, 4, 3, 1, metal[0]);
    u(11, 6, 1, 1, metal[1]);
    u(13, 6, 1, 1, metal[1]);
    u(11, 7, 3, 1, metal[0]);
    u(11, 10, 3, 1, metal[2]);
    u(11, 11, 1, 1, metal[1]);
    u(13, 11, 1, 1, metal[1]);
    return img;
  };
  if (!P) return frame(0);
  const img = strip([frame(0), frame(-0.6), frame(0.3)]);
  img.meta = { animation: { frametime: 8, interpolate: true } };
  return img;
};

// ------------------------------------------------------------------ plants --
/** Grass-like tufts drawn as tapering blades (grayscale; the game tints them). */
function blades(S, st, seed, { count, fern = false }) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(seed);
  const n = P ? 5 : 4;
  const pal = ramp('#a8a8a8', n, { contrast: 0.5, hue: 0, tint: 0 });
  const px = new Px(S, S, false, -1);
  for (let i = 0; i < count; i++) {
    const x0 = Math.round(((i + 0.5) / count) * S + (r.f() - 0.5) * 2 * k);
    const h = Math.round(S * (fern ? 0.75 + r.f() * 0.2 : 0.45 + r.f() * 0.5));
    const lean = (r.f() - 0.5) * (fern ? 0.7 : 0.9);
    const w = P ? 2 : 1;
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const x = Math.round(x0 + lean * y);
      const shade = t < 0.25 ? 1 : t > 0.8 ? n - 1 : 2 + (r.chance(0.2) ? 1 : 0);
      for (let q = 0; q < (t > 0.86 ? 1 : w); q++) px.set(x + q, S - 1 - y, q ? Math.max(0, shade - 1) : shade);
      if (fern && y > 2 && y % (2 * k) === 0) {
        // little leaflets on both sides
        const len = Math.max(1, Math.round((1 - t) * 3 * k));
        for (let l = 1; l <= len; l++) {
          px.set(x - l, S - 1 - y + Math.floor(l / 2), shade);
          px.set(x + w - 1 + l, S - 1 - y + Math.floor(l / 2), Math.max(0, shade - 1));
        }
      }
    }
  }
  return px.toImage(pal);
}
T.short_grass = (S, st) => blades(S, st, 330, { count: isP(st) ? 13 : 8 });
T.fern = (S, st) => blades(S, st, 331, { count: 3, fern: true });

function flower(S, st, kind) {
  const P = isP(st);
  const k = kOf(S);
  const p = new Px(S, S, false, -1);
  const pal = [];
  const add = (c, n, o = {}) => {
    const off = pal.length;
    pal.push(...ramp(c, n, { contrast: 0.5, hue: 18, ...o }));
    return off;
  };
  const stem = add('#4f8a2c', 3);
  const petal = add(kind === 'poppy' ? '#d42a24' : '#f2cf2a', P ? 4 : 3);
  const heart = add(kind === 'poppy' ? '#2a1a1e' : '#e08a1a', 2);
  const sx = 7 * k;
  // stem with a leaf
  for (let y = 8 * k; y < S; y++) for (let q = 0; q < k; q++) p.set(sx + q, y, stem + 1);
  for (let i = 0; i < 3 * k; i++) p.set(sx - 1 - i, 12 * k - Math.floor(i / 2), stem + (i === 0 ? 1 : 2));
  for (let i = 0; i < 2 * k; i++) p.set(sx + k + i, 13 * k - Math.floor(i / 2), stem);
  // head
  const cx = sx + k / 2 - 0.5;
  const cy = 5.5 * k;
  const R = kind === 'poppy' ? 3.7 * k : 3.3 * k;
  for (let y = -4 * k; y <= 4 * k; y++) for (let x = -4 * k; x <= 4 * k; x++) {
    const a = Math.atan2(y, x);
    const lobes = kind === 'poppy' ? 4 : 6;
    const rr = R * (0.82 + 0.18 * Math.cos(a * lobes));
    const d = Math.hypot(x, y);
    if (d > rr) continue;
    const lit = x + y < -rr * 0.4;
    const shade = d < R * 0.35 ? -1 : lit ? (P ? 3 : 2) : x + y > rr * 0.6 ? 0 : 1;
    p.set(Math.round(cx + x), Math.round(cy + y), shade < 0 ? heart + (x + y < 0 ? 1 : 0) : petal + shade);
  }
  return p.toImage(pal);
}
T.dandelion = (S, st) => flower(S, st, 'dandelion');
T.poppy = (S, st) => flower(S, st, 'poppy');

T.sugar_cane = (S, st) => {
  const P = isP(st);
  const k = kOf(S);
  const pal = ramp('#9cc46a', P ? 5 : 4, { contrast: 0.45, hue: 18 });
  const px = new Px(S, S, false, -1);
  for (const [x0, off] of [[3 * k, 0], [8 * k, 5 * k], [12 * k, 2 * k]]) {
    for (let y = 0; y < S; y++) {
      const joint = (y + off) % (6 * k) === 0;
      for (let q = 0; q < 2 * k; q++) px.set(x0 + q, y, joint ? 0 : q === 0 ? pal.length - 1 : q === 2 * k - 1 ? 1 : 2);
    }
    // a leaf leaving a joint
    for (let i = 1; i <= 3 * k; i++) px.set(x0 - i, ((off + 6 * k) % S) - Math.floor(i / 2) + 1, 2);
  }
  return px.toImage(pal);
};

function wheat(S, st, stage) {
  const P = isP(st);
  const k = kOf(S);
  const r = rng(340 + stage);
  const ripe = stage / 7;
  const green = ramp('#5f9a32', 3, { contrast: 0.45, hue: 16 });
  const gold = ramp('#d8b44a', P ? 4 : 3, { contrast: 0.5, hue: 18 });
  const px = new Px(S, S, false, -1);
  const pal = [...green, ...gold];
  const G = 0;
  const Y = 3;
  const h = Math.round(S * (0.2 + 0.75 * ripe));
  for (let i = 0; i < 6; i++) {
    const x = Math.round(((i + 0.5) / 6) * S) + r.range(-1, 1);
    const hh = Math.max(2, h - r.i(3 * k));
    for (let y = 0; y < hh; y++) {
      const top = y > hh - (stage >= 5 ? 4 * k : 0);
      const ripeTint = ripe > 0.85 && y > hh * 0.3;
      px.set(x, S - 1 - y, top ? Y + (y % 2 ? 2 : 1) : ripeTint ? Y + 1 : G + 1 + (y % 3 === 0 ? 1 : 0));
      if (P) px.set(x + 1, S - 1 - y, top ? Y + (y % 2 ? 1 : 0) : ripeTint ? Y : G);
    }
    if (stage < 4) for (let l = 1; l < 2 * k; l++) px.set(x + l, S - 1 - Math.round(hh / 2) - l, G + 2);
  }
  return px.toImage(pal);
}
for (let s = 0; s < 8; s++) T[`wheat_stage${s}`] = (S, st) => wheat(S, st, s);

module.exports = { T, DYES };
