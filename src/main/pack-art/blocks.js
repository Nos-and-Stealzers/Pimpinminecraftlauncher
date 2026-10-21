// Block textures, drawn like a pixel artist would: flat fills, deliberate
// clusters, bevelled shapes lit from the top-left, hue-shifted ramps.
// 'perf' = calm 16× (3-4 shades, few details); 'looks' = rich 32× (5-7
// shades, more shapes, highlights). Every texture is original.
const { Px, ramp, rng, blob, lump, cells, noise, despeckle, dither, shadeRegions, layer, strip, Image, rgba, hex, mixc } = require('./lib');

const T = {};
const isP = (st) => st === 'looks';
const cat = (...ramps) => {
  const pal = [];
  const off = [];
  for (const r of ramps) {
    off.push(pal.length);
    pal.push(...r);
  }
  return { pal, off };
};

// ------------------------------------------------------------ stone-likes --
/** Shared "rock" painter: flat base + bevelled lumps + optional cracks. */
function rock(S, st, seed, color, o = {}) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = o.pal || ramp(color, n, { contrast: P ? 0.42 : 0.24, hue: 16, tint: 0.04, ...(o.ramp || {}) });
  const b = o.base ?? (P ? 3 : 2);
  // soft mottling first so no area is one flat colour
  const mot = noise(S, P ? 6 : 4, seed + 900);
  const hiT = o.flat ? 2 : P ? 0.66 : 0.72;
  const loT = P ? 0.3 : 0.24;
  const px = new Px(S).fill((x, y) => {
    const m = mot(x, y);
    return m > hiT ? b + 1 : m < loT ? b - 1 : b;
  });
  const count = Math.round((P ? 12 : 7) * (o.density ?? 1));
  for (let i = 0; i < count; i++) {
    const rx = (1.3 + r.f() * 2.4) * k * (o.scale ?? 1) * (o.stretch ?? 1);
    const ry = (0.9 + r.f() * 1.2) * k * (o.scale ?? 1);
    const v = b + (P ? r.pick([-1, 0, 0, 1]) : r.pick([0, 0, 1, -1])) * (o.flat ? 0 : 1);
    lump(px, blob(r, r.i(S), r.i(S), rx, ry, 0.55), v, { hi: 1, lo: 1, drop: 1, max: pal.length - 1 });
  }
  if (P && o.cracks !== 0) {
    for (let c = 0; c < (o.cracks ?? 2); c++) {
      let x = r.i(S);
      let y = r.i(S);
      const len = r.range(5, 9);
      for (let i = 0; i < len; i++) {
        px.set(x, y, 1);
        px.bump(x + 1, y + 1, 1, 0, pal.length - 1);
        if (r.chance(0.6)) x++;
        else y += r.chance(0.5) ? 1 : -1;
      }
    }
  }
  despeckle(px);
  if (P && o.dither !== false) dither(px);
  return { px, pal, n: pal.length };
}

T.stone = (S, st, seed = 1) => {
  const { px, pal } = rock(S, st, seed, '#7e8184');
  return px.toImage(pal);
};

T.andesite = (S, st, seed = 15) => {
  const P = isP(st);
  const { px, pal } = rock(S, st, seed, '#8a8b8c', { density: 1.6, scale: 0.75, ramp: { contrast: P ? 0.5 : 0.32 } });
  return px.toImage(pal);
};

T.granite = (S, st, seed = 16) => {
  const P = isP(st);
  const k = S / 16;
  const { pal } = cat(ramp('#9b6b58', P ? 6 : 4, { contrast: P ? 0.45 : 0.3, hue: 10 }));
  const { px } = rock(S, st, seed, '#9b6b58', { pal, density: 1.4, scale: 0.8 });
  const r = rng(seed + 5);
  // pale quartz flecks
  const fl = pal.length;
  pal.push(...ramp('#d7b7a4', 2, { contrast: 0.2, hue: 8 }));
  for (let i = 0; i < (P ? 14 : 7); i++) {
    const x = r.i(S);
    const y = r.i(S);
    px.set(x, y, fl + 1);
    if (r.chance(0.6)) px.set(x + 1, y, fl);
    if (P && r.chance(0.5)) px.set(x, y + 1, fl);
    if (k > 1 && r.chance(0.5)) px.set(x + 1, y + 1, fl);
  }
  return px.toImage(pal);
};

T.diorite = (S, st, seed = 17) => {
  const P = isP(st);
  const { pal } = cat(ramp('#cfcdca', P ? 5 : 4, { contrast: P ? 0.22 : 0.14, hue: 14 }));
  const { px } = rock(S, st, seed, '#cfcdca', { pal, base: P ? 3 : 2, density: 1, flat: true });
  const dk = pal.length;
  pal.push(...ramp('#5d5c63', 3, { contrast: 0.4, hue: 14 }));
  const r = rng(seed + 9);
  // dark mineral specks in little clusters
  for (let i = 0; i < (P ? 16 : 8); i++) {
    const x = r.i(S);
    const y = r.i(S);
    const shapes = P ? [['##', '#.'], ['.#', '##', '#.'], ['##'], ['#', '#'], ['.#.', '###']] : [['##'], ['#', '#'], ['##', '#.']];
    px.stamp(x, y, r.pick(shapes), { '#': dk + r.i(2) });
    px.set(x - 1, y - 1, P ? pal.length - 4 : null);
  }
  return px.toImage(pal);
};

T.deepslate = (S, st, seed = 2) => {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp('#505059', n, { contrast: P ? 0.5 : 0.3, hue: 16, tint: 0.05 });
  const b = P ? 3 : 2;
  const px = new Px(S).fill(b);
  // layered: long flat slabs
  for (let i = 0; i < (P ? 14 : 8); i++) {
    const pts = blob(r, r.i(S), r.i(S), (3 + r.f() * 4) * k, (0.7 + r.f() * 0.8) * k, 0.4);
    lump(px, pts, b + r.pick([-1, 0, 1]), { hi: 1, lo: 1, drop: 1, max: n - 1 });
  }
  despeckle(px);
  return px.toImage(pal);
};

T.cobblestone = (S, st, seed = 3) => {
  const P = isP(st);
  const r = rng(seed);
  const n = P ? 7 : 5;
  const pal = ramp('#7c7f83', n, { contrast: P ? 0.6 : 0.48, hue: 18, tint: 0.05 });
  const { lab } = cells(r, S, P ? 13 : 7, { minDist: S / (P ? 5.6 : 4.4) });
  const shadeOf = Array.from({ length: 64 }, () => r.pick(P ? [2, 3, 3, 4] : [2, 2, 3]));
  const px = new Px(S).fill((x, y) => {
    const id = lab.get(x, y);
    const R = lab.get(x + 1, y) !== id;
    const D = lab.get(x, y + 1) !== id;
    const Lf = lab.get(x - 1, y) !== id;
    const U = lab.get(x, y - 1) !== id;
    if (R || D) return 0;
    if (Lf && U) return 1; // rounded top-left corner
    if (lab.get(x + 1, y + 1) !== id && (lab.get(x + 2, y) !== id || lab.get(x, y + 2) !== id)) return 1; // rounded bottom-right
    const v = shadeOf[id];
    if (Lf || U) return Math.min(n - 1, v + (P ? 2 : 1));
    if (P && (lab.get(x - 2, y) !== id || lab.get(x, y - 2) !== id)) return v + 1;
    if (lab.get(x + 2, y) !== id || lab.get(x, y + 2) !== id) return v - 1;
    return v;
  });
  if (P) {
    // a few pits on the stones
    for (let i = 0; i < 10; i++) {
      const x = r.i(S);
      const y = r.i(S);
      if (px.get(x, y) >= 2 && px.get(x + 1, y) >= 2) {
        px.set(x, y, px.get(x, y) - 1);
        px.set(x + 1, y, px.get(x + 1, y) - 1);
      }
    }
  }
  return px.toImage(pal);
};

T.gravel = (S, st, seed = 8) => {
  const P = isP(st);
  const r = rng(seed);
  const m = P ? 4 : 3;
  const { pal, off } = cat([hex('#3e3a3c')], ramp('#8a8584', m, { contrast: 0.35 }), ramp('#7b6a5f', m, { contrast: 0.35 }), ramp('#5f5d63', m, { contrast: 0.35 }), ramp('#a39c94', m, { contrast: 0.3 }));
  const { lab } = cells(r, S, P ? 22 : 11, { minDist: S / (P ? 7 : 5.4) });
  const blk = Array.from({ length: 64 }, () => r.pick([1, 1, 2, 3, 4]));
  const px = new Px(S).fill((x, y) => {
    const id = lab.get(x, y);
    if (lab.get(x + 1, y) !== id || lab.get(x, y + 1) !== id) return 0;
    const o = off[blk[id]];
    const Lf = lab.get(x - 1, y) !== id;
    const U = lab.get(x, y - 1) !== id;
    if (Lf && U) return 0;
    if (Lf || U) return o + m - 1;
    if (lab.get(x + 2, y) !== id || lab.get(x, y + 2) !== id) return o;
    return o + Math.floor((m - 1) / 2) + (P ? 1 : 0);
  });
  return px.toImage(pal);
};

// -------------------------------------------------------------------- soil --
T.dirt = (S, st, seed = 4) => {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp('#87613f', n, { contrast: P ? 0.45 : 0.3, hue: 18 });
  const b = P ? 3 : 2;
  const px = new Px(S).fill(b);
  // soft dark hollows
  for (let i = 0; i < (P ? 9 : 4); i++) {
    for (const [x, y] of blob(r, r.i(S), r.i(S), (P ? 1 + r.f() * 1.6 : 1.8 + r.f()) * k, (P ? 0.8 + r.f() : 1.3 + r.f() * 0.6) * k, P ? 0.6 : 0.3)) px.set(x, y, b - 1);
  }
  // little lit clods
  for (let i = 0; i < (P ? 16 : 8); i++) {
    lump(px, blob(r, r.i(S), r.i(S), (0.8 + r.f() * 0.9) * k, (0.6 + r.f() * 0.6) * k, 0.4), b, { hi: 1, lo: 1, drop: 1, max: n - 1 });
  }
  despeckle(px);
  if (P) {
    // a handful of tiny pebbles
    const pb = pal.length;
    pal.push(...ramp('#8f8a84', 3, { contrast: 0.3 }));
    for (let i = 0; i < 5; i++) {
      const x = r.i(S);
      const y = r.i(S);
      px.stamp(x, y, ['ab', 'bc'], { a: pb + 2, b: pb + 1, c: pb });
    }
  }
  return px.toImage(pal);
};

/** Column heights of the grass fringe (hand-shaped drips). */
function fringe(S, seed) {
  const k = S / 16;
  const r = rng(seed);
  const h = [];
  for (let x = 0; x < S;) {
    const w = r.range(1, 3) * k;
    const base = Math.round((3 + r.pick([0, 0, 1, 1, 2])) * k);
    for (let i = 0; i < w && x < S; i++, x++) h.push(base);
  }
  // a few long drips
  for (let d = 0; d < 3; d++) {
    const x = r.i(S);
    const len = r.range(2, 4) * k;
    for (let i = 0; i < k; i++) h[(x + i) % S] += len;
  }
  return h;
}

function grassFringe(px, S, st, seed, b, n) {
  const P = isP(st);
  const f = fringe(S, seed);
  const r = rng(seed + 3);
  for (let x = 0; x < S; x++) {
    for (let y = 0; y < f[x]; y++) {
      let v = b;
      if (y === f[x] - 1) v = b - 1; // shaded tip
      else if (y < (P ? 2 : 1) && r.chance(0.5)) v = b + 1;
      px.set(x, y, v);
    }
    if (P && f[x] > 2 && r.chance(0.4)) px.set(x, f[x] - 2, b - 1);
  }
  return f;
}

T.grass_block_top = (S, st, seed = 5) => {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp('#9c9c9c', n, { contrast: P ? 0.36 : 0.22, hue: 0, tint: 0 });
  const b = P ? 3 : 2;
  const px = new Px(S).fill(b);
  for (let i = 0; i < (P ? 6 : 4); i++) for (const [x, y] of blob(r, r.i(S), r.i(S), (1.5 + r.f() * 2) * k, (1.2 + r.f() * 1.5) * k, 0.6)) px.set(x, y, b - 1);
  // blades: light tip, body, dark root
  for (let i = 0; i < (P ? 70 : 26); i++) {
    const x = r.i(S);
    const y = r.i(S);
    const len = P ? r.range(2, 4) : 2;
    px.set(x, y, Math.min(n - 1, b + (P ? 2 : 1)));
    for (let j = 1; j < len; j++) px.set(x, y + j, b + 1);
    px.set(x, y + len, b - 1);
  }
  return px.toImage(pal);
};

T.grass_block_side_overlay = (S, st, seed = 6) => {
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = ramp('#9c9c9c', n, { contrast: P ? 0.36 : 0.22, hue: 0, tint: 0 });
  const px = new Px(S, S, true, -1);
  grassFringe(px, S, st, seed, P ? 3 : 2, n);
  return px.toImage(pal);
};

T.grass_block_side = (S, st, seed = 6) => {
  const P = isP(st);
  const img = T.dirt(S, st, seed + 100);
  const n = P ? 6 : 4;
  const pal = ramp('#6e9f45', n, { contrast: P ? 0.36 : 0.22, hue: 16 });
  const px = new Px(S, S, true, -1);
  grassFringe(px, S, st, seed, P ? 3 : 2, n);
  const top = px.toImage(pal);
  for (let i = 0; i < top.data.length; i += 4) if (top.data[i + 3]) img.data.set(top.data.slice(i, i + 4), i);
  return img;
};

const sandLike = (S, st, seed, color) => {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 5 : 4;
  const pal = ramp(color, n, { contrast: P ? 0.24 : 0.16, hue: 14 });
  const b = 2;
  const px = new Px(S).fill(b);
  if (P) {
    // wind ripples: a light crest with its shadow below
    for (let row = 0; row < 5; row++) {
      const y0 = Math.round(row * (S / 5) + r.i(3));
      let y = y0;
      for (let x = 0; x < S; x++) {
        if (r.chance(0.18)) y += r.pick([-1, 1]);
        if (Math.abs(y - y0) > 1) y = y0;
        if ((x + row * 7) % 13 < 9) {
          px.set(x, y, b + 1);
          px.set(x, y + 1, b - 1);
        }
      }
    }
  }
  for (let i = 0; i < (P ? 22 : 12); i++) {
    const x = r.i(S);
    const y = r.i(S);
    const v = r.pick([b - 1, b + 1, b + 1]);
    px.set(x, y, v);
    px.set(x + 1, y, v);
    if (k > 1 && r.chance(0.4)) px.set(x, y + 1, v === b + 1 ? n - 1 : 0);
  }
  return px.toImage(pal);
};

T.sand = (S, st) => sandLike(S, st, 7, '#dccf91');
T.red_sand = (S, st) => sandLike(S, st, 107, '#b7622c');

T.snow = (S, st, seed = 14) => {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 5 : 3;
  const pal = ramp('#eaf1f8', n, { contrast: P ? 0.16 : 0.08, hue: 30, mid: n - 2 });
  const b = n - 2;
  const px = new Px(S).fill(b);
  for (let i = 0; i < (P ? 8 : 5); i++) {
    const pts = blob(r, r.i(S), r.i(S), (1.5 + r.f() * 2) * k, (0.8 + r.f()) * k, 0.5);
    lump(px, pts, b, { hi: 1, lo: 1, max: n - 1 });
  }
  if (P) for (let i = 0; i < 10; i++) px.set(r.i(S), r.i(S), n - 1);
  return px.toImage(pal);
};

// -------------------------------------------------------------------- wood --
// Shared wood colours: bark, inner rings (log top) and planks. Plank colours
// sit close to the log-top rings so a cut log and its planks look related.
const WOOD = {
  oak: { bark: '#6a4f31', top: '#b38c58', plank: '#ad8550' },
  spruce: { bark: '#4b3522', top: '#7f5d38', plank: '#77562f' },
  birch: { bark: '#dcd8cb', top: '#d6c391', plank: '#cdb67a' },
  jungle: { bark: '#5b4527', top: '#b88a56', plank: '#a8784f' },
  acacia: { bark: '#6a655c', top: '#b9663a', plank: '#ad5d32' },
  dark_oak: { bark: '#3d2b19', top: '#5e4226', plank: '#4d341c' },
  mangrove: { bark: '#55443a', top: '#7a3a34', plank: '#773632' },
  cherry: { bark: '#3b2533', top: '#e2b0a8', plank: '#e0b1a8' },
};

function barkSide(S, st, seed, wood) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 6 : 4;
  if (wood === 'birch') {
    const { pal, off } = cat(ramp(WOOD.birch.bark, P ? 4 : 3, { contrast: 0.18, hue: 20, mid: P ? 2 : 1 }), ramp('#3a3330', 3, { contrast: 0.45, hue: 12 }));
    const b = P ? 2 : 1;
    const px = new Px(S).fill(b);
    // faint vertical streaks
    for (let i = 0; i < (P ? 6 : 3); i++) px.vline(r.i(S), r.i(S), r.range(3, 7) * k, b - 1);
    // dark lenticels: horizontal dashes with a lighter cap
    for (let i = 0; i < (P ? 9 : 6); i++) {
      const x = r.i(S);
      const y = r.i(S);
      const len = r.range(2, 4) * k;
      px.hline(x, y, len, off[1] + (P ? 1 : 0));
      if (P) {
        px.hline(x + 1, y + 1, len - 2, off[1]);
        px.hline(x, y - 1, len, P ? 3 : 2);
      }
      if (r.chance(0.4)) px.set(x - 1, y + (k > 1 ? 1 : 0), off[1] + 1);
    }
    return px.toImage(pal);
  }
  const pal = ramp(WOOD[wood].bark, n, { contrast: P ? 0.55 : 0.38, hue: 16 });
  const px = new Px(S).fill(0);
  // vertical bark plates separated by wandering crevices
  const cols = [];
  for (let x = 0; x < S;) {
    const w = r.range(2, 3) * k;
    cols.push([x, w, r.pick(P ? [2, 3, 3, 4] : [1, 2, 2])]);
    x += w + 1;
  }
  const shift = [];
  let s = 0;
  for (let y = 0; y < S; y++) {
    if (r.chance(0.12)) s = Math.max(-1, Math.min(1, s + r.pick([-1, 1])));
    shift.push(s);
  }
  for (const [x0, w, v] of cols) {
    for (let y = 0; y < S; y++) {
      const xs = x0 + shift[(y + x0 * 3) % S];
      for (let i = 0; i < w; i++) px.set(xs + i, y, i === 0 ? Math.min(n - 1, v + 1) : i === w - 1 && w > 2 ? v - 1 : v);
    }
  }
  if (wood === 'cherry') {
    // cherry bark: dark with pale horizontal lenticel bands
    for (let y = r.i(3); y < S; y += r.range(3, 4) * k) px.hline(0, y, S, (x) => ((x + y) % 5 === 0 ? 1 : Math.min(n - 1, (P ? 4 : 3))));
  }
  if (wood === 'jungle') {
    // a few moss patches in the crevices
    const moss = pal.length;
    pal.push(...ramp('#5d7a2e', 2, { contrast: 0.3, hue: 14 }));
    for (let i = 0; i < (P ? 6 : 3); i++) {
      const x = r.i(S);
      const y = r.i(S);
      px.stamp(x, y, P ? ['.a', 'ab', 'b.'] : ['a', 'b'], { a: moss + 1, b: moss });
    }
  }
  // horizontal nicks in the plates
  for (let i = 0; i < (P ? 8 : 4); i++) {
    const x = r.i(S);
    const y = r.i(S);
    if (px.get(x, y) > 0 && px.get(x + 1, y) > 0) {
      px.hline(x, y, 2, 0);
      px.set(x, y + 1, Math.min(n - 1, px.get(x, y + 1) + 1));
    }
  }
  return px.toImage(pal);
}

function logTop(S, st, seed, wood) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const rn = P ? 5 : 3;
  const { pal, off } = cat(ramp(WOOD[wood].bark, P ? 4 : 3, { contrast: 0.4, hue: 14 }), ramp(WOOD[wood].top, rn, { contrast: P ? 0.3 : 0.2, hue: 14 }));
  const c = S / 2 - 0.5;
  const nz = noise(S, 4, seed);
  const ringW = P ? 2.6 : 2;
  const px = new Px(S).fill((x, y) => {
    const dx = x - c;
    const dy = y - c;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > c - k) return wood === 'birch' ? off[0] + (P ? 3 : 2) : off[0] + 1; // bark rim
    if (Math.max(Math.abs(dx), Math.abs(dy)) > c - k - 1) return off[1] + (P ? 1 : 0);
    const d = Math.max(Math.abs(dx), Math.abs(dy)) * 0.55 + Math.hypot(dx, dy) * 0.45 + (nz(x, y) - 0.5) * (P ? 1.4 : 0.9);
    const ring = Math.floor(d / ringW);
    if (P) return off[1] + [3, 2, 3, 1][ring % 4] + (ring === 0 ? 1 : 0);
    return off[1] + (ring % 2 ? 1 : 2);
  });
  // pith
  px.rect(Math.floor(c), Math.floor(c), 2, 2, off[1]);
  if (P) {
    // a radial check (crack) from the middle towards one edge
    let x = Math.floor(c) + 1;
    let y = Math.floor(c) + 2;
    for (let i = 0; i < S / 3; i++) {
      px.set(x, y, off[1]);
      y++;
      if (r.chance(0.4)) x += r.pick([-1, 1]);
    }
    // bark rim highlight on the top-left
    for (let i = 0; i < S; i++) {
      px.set(i, 0, wood === 'birch' ? off[0] + 3 : off[0] + 2);
      px.set(0, i, wood === 'birch' ? off[0] + 3 : off[0] + 2);
      px.set(i, S - 1, off[0]);
      px.set(S - 1, i, off[0]);
    }
  }
  return px.toImage(pal);
}

function planks(S, st, seed, wood) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp(WOOD[wood].plank, n, { contrast: P ? 0.48 : 0.36, hue: 16 });
  const b = P ? 3 : 2;
  const px = new Px(S).fill(b);
  const bh = S / 4;
  const joints = [5, 13, 1, 9].map((j) => (j * k + r.i(2)) % S);
  for (let row = 0; row < 4; row++) {
    const y0 = row * bh;
    const v = b + (row % 2 && P ? 0 : r.pick([0, 0, -1, P ? 1 : 0]));
    px.rect(0, y0, S, bh, v);
    px.hline(0, y0, S, Math.min(n - 1, v + 1)); // lit top edge
    px.hline(0, y0 + bh - 1, S, 0); // gap between boards
    if (P) px.hline(0, y0 + bh - 2, S, v - 1);
    // grain streaks
    for (let g = 0; g < (P ? 4 : 2); g++) {
      const gy = y0 + 1 + r.i(bh - (P ? 3 : 2));
      const gx = r.i(S);
      const len = r.range(3, 7) * k;
      px.hline(gx, gy, len, v - 1);
      if (P && r.chance(0.5)) px.hline(gx + len, gy + (r.chance(0.5) ? 1 : -1) * (gy > y0 + 1 ? 1 : 0), 2 * k, v - 1);
    }
    if (P && r.chance(0.5)) {
      // knot
      const kx = r.i(S);
      const ky = y0 + 2 + r.i(bh - 5);
      px.stamp(kx, ky, ['.aa.', 'abba', '.aa.'], { a: v - 1, b: 0 });
    }
    // butt joint with nail holes either side
    const jx = joints[row];
    px.vline(jx, y0, bh - 1, 0);
    px.vline(jx + 1, y0 + 1, bh - 2, Math.min(n - 1, v + 1));
    const ny = y0 + Math.floor(bh / 2) - (P ? 1 : 0);
    if (P) {
      for (const nx of [jx - 3, jx + 3]) px.stamp(nx, ny, ['ab', 'bc'], { a: 0, b: 1, c: n - 1 });
    } else {
      px.set(jx - 2, ny, 0);
      px.set(jx + 3, ny, 0);
    }
  }
  return px.toImage(pal);
}

function leaves(S, st, seed, kind) {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 6 : 4;
  const base = { birch: '#a8a8a8', spruce: '#a2a2a2', cherry: '#e6a0c0', dark_oak: '#8e8e8e' }[kind] || '#9a9a9a';
  const pal = kind === 'cherry'
    ? ramp(base, n, { contrast: P ? 0.5 : 0.4, hue: 12 })
    : ramp(base, n, { contrast: P ? 0.58 : kind === 'spruce' ? 0.34 : 0.42, hue: 0, tint: 0 });
  const stampKind = { jungle: 'oak', dark_oak: 'oak', mangrove: 'oak', cherry: 'oak', acacia: 'birch' }[kind] || kind;
  const px = new Px(S).fill(0);
  // hand-drawn leaf stamps: a = lit edge, b = body, c = shaded edge
  const STAMPS = {
    oak: P
      ? [['..ab.', '.abbc', 'abbc.', 'bbcc.', '.c...'], ['.ab..', 'abbb.', 'bbbcc', '.bcc.', '..c..'], ['.aab', 'abbc', 'bbcc', '.cc.']]
      : [['.aa.', 'abbc', '.bcc'], ['aa.', 'abc', '.cc'], ['.ab', 'abc', 'bc.']],
    birch: P
      ? [['.ab.', 'abbc', 'bbcc', '.cc.'], ['ab.', 'bbc', '.cc'], ['.a.', 'abc', '.c.']]
      : [['ab', 'bc'], ['.a.', 'abc', '.c.'], ['ab.', '.bc']],
    spruce: P
      ? [['a.a.a.a', 'bcbcbcb', '.b.b.b.'], ['.a.a.a', 'abcbcb', 'b.b.b.'], ['a.a.a', 'bcbcb', '.b.b.']]
      : [['a.a.a', 'bcbcb'], ['.a.a', 'abcb'], ['a.a', 'bcb']],
  }[stampKind];
  const step = (stampKind === 'spruce' ? 3 : stampKind === 'birch' ? 2.6 : kind === 'jungle' ? 3.8 : 3.2) * (P ? 1.25 : 1);
  const spots = [];
  for (let gy = 0; gy < S; gy += step) for (let gx = 0; gx < S; gx += step) spots.push([Math.round(gx + r.f() * step), Math.round(gy + r.f() * step)]);
  // shuffle so overlaps vary
  for (let i = spots.length - 1; i > 0; i--) {
    const j = r.i(i + 1);
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const [x, y] of spots) {
    if (r.chance(0.1)) continue;
    let rows = r.pick(STAMPS);
    if (r.chance(0.5)) rows = rows.map((row) => [...row].reverse().join(''));
    const v = r.pick(P ? [2, 3, 3, 4] : [2, 2, 2, 1]);
    px.stamp(x, y, rows, { a: Math.min(n - 1, v + 1), b: v, c: Math.max(1, v - 1) });
  }
  // punch clustered holes (never lone pixels) where nothing grows
  const holes = new Px(S).fill(0);
  for (let i = 0; i < (kind === 'spruce' ? 0.5 : kind === 'dark_oak' ? 0.6 : 1) * (P ? 16 : 9); i++) for (const [x, y] of blob(r, r.i(S), r.i(S), (1 + r.f() * 1.6) * k, (1 + r.f()) * k, 0.5)) holes.set(x, y, 1);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (px.get(x, y) === 0 && holes.get(x, y)) px.set(x, y, -1);
  despeckle(px);
  if (kind === 'cherry') {
    // blossoms: small white-pink flowers with a darker heart
    const bl = pal.length;
    pal.push(...['#f7d9e6', '#fff4f8', '#c25a86'].map(rgba));
    for (let i = 0; i < (P ? 14 : 7); i++) {
      const x = r.i(S);
      const y = r.i(S);
      if (px.get(x, y) < 0) continue;
      px.stamp(x - 1, y - 1, P ? ['.a.', 'aca', '.a.'] : ['ab', 'a.'], { a: bl, b: bl + 1, c: bl + 2 });
    }
  }
  const c = pal[0];
  return px.toImage(pal, [c[0], c[1], c[2]]);
}

for (const w of Object.keys(WOOD)) {
  const s = Object.keys(WOOD).indexOf(w) * 50;
  T[`${w}_log`] = (S, st) => barkSide(S, st, 9 + s, w);
  T[`${w}_log_top`] = (S, st) => logTop(S, st, 10 + s, w);
  T[`${w}_planks`] = (S, st) => planks(S, st, 11 + s, w);
  T[`${w}_leaves`] = (S, st) => leaves(S, st, 12 + s, w);
}

// ------------------------------------------------------------ built stuff --
T.glass = (S, st) => {
  const P = isP(st);
  const k = S / 16;
  const img = new Image(S);
  const frame = [214, 236, 244, P ? 235 : 200];
  const frameDk = [150, 184, 204, P ? 235 : 200];
  for (let i = 0; i < S; i++) {
    img.set(i, 0, frame);
    img.set(0, i, frame);
    img.set(i, S - 1, frameDk);
    img.set(S - 1, i, frameDk);
  }
  if (P) {
    for (let i = 1; i < S - 1; i++) {
      img.set(i, 1, [235, 248, 252, 90]);
      img.set(1, i, [235, 248, 252, 90]);
    }
  }
  // two short diagonal glints in the top-left
  const glint = (d, from, to, a) => {
    for (let x = from; x <= to; x++) img.set(x, d - x, [255, 255, 255, a]);
  };
  glint(Math.round(6 * k), Math.round(2 * k), Math.round(4 * k), P ? 150 : 110);
  glint(Math.round(6 * k) + 1, Math.round(2 * k), Math.round(4 * k), P ? 110 : 0);
  glint(Math.round(9 * k), Math.round(3 * k), Math.round(4 * k), P ? 110 : 80);
  if (P) glint(Math.round(25 * k), Math.round(12 * k), Math.round(14 * k), 70);
  return img;
};

T.glass_pane_top = (S, st) => new Image(S).fill(() => (isP(st) ? [196, 224, 236, 235] : [204, 228, 238, 200]));

T.bricks = (S, st, seed = 13) => {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 6 : 4;
  const { pal, off } = cat(ramp('#995040', n, { contrast: P ? 0.45 : 0.3, hue: 14 }), ramp('#b9b0a6', 3, { contrast: 0.25, hue: 14 }));
  const b = P ? 3 : 2;
  const rh = S / 4;
  const bw = S / 2;
  const px = new Px(S).fill(off[1] + 1);
  for (let row = 0; row < 4; row++) {
    const xo = row % 2 ? bw / 2 : 0;
    for (let col = 0; col < 2; col++) {
      const x0 = xo + col * bw;
      const v = b + r.pick(P ? [-1, 0, 0, 1] : [0, 0, -1]);
      const y0 = row * rh;
      px.rect(x0 + 1, y0, bw - 1, rh - 1, v);
      px.hline(x0 + 1, y0, bw - 1, Math.min(n - 1, v + 1));
      px.vline(x0 + 1, y0, rh - 1, Math.min(n - 1, v + 1));
      px.hline(x0 + 2, y0 + rh - 2, bw - 2, v - 1);
      if (P) {
        px.vline(x0 + bw - 1, y0 + 1, rh - 2, v - 1);
        // chips and specks
        for (let c = 0; c < 2; c++) {
          const cx = x0 + 3 + r.i(bw - 6);
          const cy = y0 + 2 + r.i(rh - 4);
          px.set(cx, cy, v - 1);
          px.set(cx + 1, cy, v - 2 < 0 ? 0 : v - 2);
        }
      }
      // mortar: lit below the brick, shaded at the joint
      px.hline(x0, y0 + rh - 1, bw, off[1] + 1);
      px.vline(x0, y0, rh - 1, off[1]);
    }
  }
  if (P) for (let row = 0; row < 4; row++) px.hline(0, row * rh + rh - 1, S, (x) => (x % 5 === 0 ? off[1] + 2 : off[1] + 1));
  return px.toImage(pal);
};

function sandstoneSide(S, st, seed = 18, color = '#d8c98f') {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 5 : 4;
  const pal = ramp(color, n, { contrast: P ? 0.3 : 0.2, hue: 16 });
  const b = 2;
  const px = new Px(S).fill(b);
  // carved top band, layered middle, heavy bottom band
  px.rect(0, 0, S, 4 * k, b + 1);
  px.hline(0, 0, S, n - 1);
  px.hline(0, 4 * k - 1, S, 0);
  px.hline(0, 4 * k, S, b - 1);
  for (let y = 6 * k; y < 12 * k; y += 2 * k) {
    let x = r.i(S);
    for (let s = 0; s < 3; s++) {
      const len = r.range(3, 6) * k;
      px.hline(x, y, len, b - 1);
      if (P) px.hline(x, y - 1, len, b + 1);
      x += len + r.range(2, 4) * k;
    }
  }
  px.hline(0, 12 * k, S, b + 1);
  px.hline(0, S - 1, S, 0);
  if (P) px.hline(0, 12 * k + 1, S, n - 1);
  return px.toImage(pal);
}

function sandstoneFlat(S, st, seed, cracked, color = '#dccd94') {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 5 : 4;
  const pal = ramp(color, n, { contrast: P ? 0.28 : 0.18, hue: 16 });
  const b = 2;
  const px = new Px(S).fill(b);
  for (let i = 0; i < (P ? 7 : 4); i++) lump(px, blob(r, r.i(S), r.i(S), (1.5 + r.f() * 2) * k, (1 + r.f()) * k, 0.5), b, { hi: 1, lo: 1, max: n - 1 });
  if (cracked) {
    let x = r.i(S);
    let y = 0;
    while (y < S) {
      px.set(x, y, 0);
      if (P) px.set(x + 1, y, b + 1);
      y++;
      if (r.chance(0.35)) x += r.pick([-1, 1]);
    }
  }
  return px.toImage(pal);
}
T.sandstone = (S, st) => sandstoneSide(S, st, 18);
T.sandstone_top = (S, st) => sandstoneFlat(S, st, 19, false);
T.sandstone_bottom = (S, st) => sandstoneFlat(S, st, 20, true);
T.red_sandstone = (S, st) => sandstoneSide(S, st, 118, '#b5612c');
T.red_sandstone_top = (S, st) => sandstoneFlat(S, st, 119, false, '#b8632e');
T.red_sandstone_bottom = (S, st) => sandstoneFlat(S, st, 120, true, '#b8632e');

T.netherrack = (S, st, seed = 21) => {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp('#6f2b2b', n, { contrast: P ? 0.55 : 0.4, hue: 14 });
  const b = P ? 2 : 1;
  const px = new Px(S).fill(b);
  for (let i = 0; i < (P ? 26 : 12); i++) {
    lump(px, blob(r, r.i(S), r.i(S), (0.9 + r.f() * 1.3) * k, (0.8 + r.f()) * k, 0.5), b + r.pick([0, 1, 1, P ? 2 : 1]), { hi: 1, lo: 1, drop: 1, max: n - 1 });
  }
  return px.toImage(pal);
};

T.obsidian = (S, st, seed = 22) => {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const { pal, off } = cat(ramp('#191424', P ? 4 : 3, { contrast: 0.5, hue: 10, mid: P ? 2 : 1 }), ramp('#4d2f78', P ? 3 : 2, { contrast: 0.35, hue: 20 }));
  const b = P ? 2 : 1;
  const px = new Px(S).fill(b);
  for (let i = 0; i < (P ? 8 : 5); i++) for (const [x, y] of blob(r, r.i(S), r.i(S), (1.5 + r.f() * 2) * k, (1 + r.f()) * k, 0.6)) px.set(x, y, b - 1);
  // glassy shards: diagonal strokes with a bright tip
  for (let i = 0; i < (P ? 9 : 5); i++) {
    const x = r.i(S);
    const y = r.i(S);
    const len = r.range(2, 4) * k;
    const dir = r.pick([1, -1]);
    for (let j = 0; j < len; j++) px.set(x + j * dir, y + j, off[1] + (P && j < 2 ? 1 : 0));
    px.set(x, y, off[1] + (P ? 2 : 1));
  }
  return px.toImage(pal);
};

T.white_wool = (S, st, seed = 23) => {
  const P = isP(st);
  const k = S / 16;
  const r = rng(seed);
  const n = P ? 5 : 4;
  const pal = ramp('#e6e9ea', n, { contrast: P ? 0.3 : 0.2, hue: 24, mid: n - 2 });
  const b = n - 2;
  const px = new Px(S).fill(b);
  if (!P) {
    // calm knit: short dashed rows, offset every other row
    for (let y = 1; y < S; y += 3) for (let x = (y % 2) * 2; x < S; x += 4) px.hline(x, y, 2, b - 1);
    const r2 = rng(seed + 1);
    for (let i = 0; i < 3; i++) lump(px, blob(r2, r2.i(S), r2.i(S), 1.5, 1, 0.4), b, { hi: 1, lo: 0, max: n - 1 });
    return px.toImage(pal);
  }
  // knitted rows: little V stitches, alternating
  const cw = 4 * k;
  for (let y = 0; y < S; y += 2 * k) {
    const xo = (y / (2 * k)) % 2 ? cw / 2 : 0;
    for (let x = xo; x < S + cw; x += cw) {
      px.set(x, y, b - 1);
      px.set(x + cw - 1, y, b - 1);
      px.set(x + 1, y + 1, b - 1);
      px.set(x + cw - 2, y + 1, b - 1);
      if (P) px.hline(x + 2, y, cw - 4, b + 1);
    }
  }
  // a few soft fuzz tufts
  for (let i = 0; i < (P ? 5 : 3); i++) lump(px, blob(r, r.i(S), r.i(S), 1.4 * k, k, 0.4), b, { hi: 1, lo: 1, max: n - 1 });
  return px.toImage(pal);
};

// crafting table & furnace ---------------------------------------------------
function woodFrame(S, st, seed) {
  // planks base + darker frame, returned as index map + palette
  const P = isP(st);
  const k = S / 16;
  const n = P ? 6 : 4;
  const { pal, off } = cat(ramp(WOOD.oak.plank, n, { contrast: P ? 0.48 : 0.36, hue: 16 }), ramp('#5d4027', 3, { contrast: 0.4, hue: 14 }), ramp('#9da3a8', 3, { contrast: 0.45, hue: 18 }));
  return { P, k, n, pal, off, r: rng(seed) };
}

T.crafting_table_top = (S, st, seed = 24) => {
  const { P, k, pal, off } = woodFrame(S, st, seed);
  const img = planks(S, st, seed, 'oak');
  const px = new Px(S, S, false, -1);
  const f = k * (P ? 1.5 : 1);
  // dark frame
  px.rect(0, 0, S, Math.ceil(f), off[1] + 1).rect(0, 0, Math.ceil(f), S, off[1] + 1);
  px.rect(0, S - Math.ceil(f), S, Math.ceil(f), off[1]).rect(S - Math.ceil(f), 0, Math.ceil(f), S, off[1]);
  // carved 3x3 crafting grid in the middle
  const g0 = 3 * k;
  const g1 = S - 3 * k - 1;
  for (let i = 0; i <= 3; i++) {
    const p = Math.round(g0 + ((g1 - g0) * i) / 3);
    px.hline(g0, p, g1 - g0 + 1, off[1]);
    px.vline(p, g0, g1 - g0 + 1, off[1]);
    if (P) {
      px.hline(g0 + 1, p + 1, g1 - g0 - 1, 4);
      px.vline(p + 1, g0 + 1, g1 - g0 - 1, 4);
    }
  }
  // iron corner brackets
  for (const [cx, cy] of [[0, 0], [S - 2 * k, 0], [0, S - 2 * k], [S - 2 * k, S - 2 * k]]) {
    px.rect(cx, cy, 2 * k, 2 * k, off[2] + 1);
    px.set(cx, cy, off[2] + 2);
    px.set(cx + 2 * k - 1, cy + 2 * k - 1, off[2]);
  }
  const top = px.toImage(pal);
  for (let i = 0; i < top.data.length; i += 4) if (top.data[i + 3]) img.data.set(top.data.slice(i, i + 4), i);
  return img;
};

// Tools hanging on the table sides, drawn as shapes in 16× units and shaded
// with the same light + 1px outline rule as the item textures.
const TOOLS = {
  hammer: ['mmmmm', 'mmmmm', '..w..', '..w..', '..w..', '..w..', '..w..'],
  saw: ['ww.....', 'w.w....', 'wwmmmmm', '..mmmmm', '..mmmmm', '..m.m.m'],
  pickaxe: ['.mmmmm.', 'm..w..m', '...w...', '...w...', '...w...', '...w...'],
  shovel: ['.w.', '.w.', '.w.', '.w.', 'mmm', 'mmm', '.m.'],
};

function tableSide(S, st, seed, tools) {
  const { P, k, pal, off } = woodFrame(S, st, seed);
  const img = planks(S, st, seed + 1, 'oak');
  const px = new Px(S, S, false, -1);
  // top rim and corner posts
  px.rect(0, 0, S, 3 * k, off[1] + 1);
  px.hline(0, 0, S, off[1] + 2);
  px.hline(0, 3 * k - 1, S, off[1]);
  px.rect(0, 3 * k, k, S - 3 * k, off[1] + 1).rect(S - k, 3 * k, k, S - 3 * k, off[1]);
  const metal = { at: (l) => off[2] + Math.max(0, Math.min(2, l)), mid: 1 };
  const wood = { at: (l) => off[1] + Math.max(0, Math.min(2, l)), mid: 1 };
  const regions = [];
  const place = (rows, ux, uy) => {
    const has = (ch) => (x, y) => {
      const u = Math.floor(x / k) - ux;
      const v = Math.floor(y / k) - uy;
      return v >= 0 && v < rows.length && u >= 0 && u < rows[v].length && rows[v][u] === ch;
    };
    regions.push({ has: has('w'), m: wood, base: 2 }, { has: has('m'), m: metal });
  };
  if (tools === 'saw') {
    place(TOOLS.saw, 2, 5);
    place(TOOLS.hammer, 10, 5);
  } else {
    place(TOOLS.pickaxe, 2, 5);
    place(TOOLS.shovel, 11, 5);
  }
  shadeRegions(px, regions, off[1]);
  // pegs the tools hang from
  for (const x of tools === 'saw' ? [3, 12] : [5, 12]) px.rect(x * k, 4 * k, k, k, off[1] + 2);
  const top = px.toImage(pal);
  for (let i = 0; i < top.data.length; i += 4) if (top.data[i + 3]) img.data.set(top.data.slice(i, i + 4), i);
  return img;
}
T.crafting_table_front = (S, st) => tableSide(S, st, 25, 'saw');
T.crafting_table_side = (S, st) => tableSide(S, st, 26, 'pick');

function furnaceBase(S, st, seed) {
  const P = isP(st);
  const k = S / 16;
  const n = P ? 6 : 4;
  const { pal, off } = cat(ramp('#7d8083', n, { contrast: P ? 0.5 : 0.35, hue: 16, tint: 0.04 }), ramp('#2a2428', 2, { contrast: 0.3 }), ramp('#ff9a2a', 3, { contrast: 0.5, hue: 18, mid: 1 }));
  const { px } = rock(S, st, seed, '#7d8083', { pal, density: 0.7, flat: !P, cracks: 0 });
  // bevelled border
  const b = P ? 3 : 2;
  for (let i = 0; i < S; i++) {
    px.set(i, 0, b + 1);
    px.set(0, i, b + 1);
    px.set(i, S - 1, 0);
    px.set(S - 1, i, 0);
    if (P) {
      px.set(i, S - 2, 1);
      px.set(S - 2, i, 1);
    }
  }
  return { P, k, n, pal, off, px, b };
}

function furnaceFront(S, st, lit) {
  const { P, k, pal, off, px, b } = furnaceBase(S, st, 27);
  // smooth stone face with a seam
  px.hline(1, 6 * k, S - 2, 1);
  px.hline(1, 6 * k + 1, S - 2, b + 1);
  // fire mouth
  const x0 = 4 * k;
  const y0 = 8 * k;
  const w = 8 * k;
  const h = 5 * k;
  px.rect(x0, y0, w, h, off[1]);
  px.hline(x0, y0 - 1, w, 0);
  px.vline(x0 - 1, y0, h, 0);
  px.hline(x0, y0 + h, w, b + 1);
  px.vline(x0 + w, y0, h + 1, b + 1);
  if (lit) {
    const fr = rng(31);
    for (let x = x0; x < x0 + w; x++) {
      const fh = Math.max(1, Math.round(h * (0.35 + fr.f() * 0.5)));
      for (let y = 0; y < fh; y++) px.set(x, y0 + h - 1 - y, off[2] + (y < fh / 2 ? 2 : 1));
      px.set(x, y0 + h - fh, off[2]);
    }
  }
  // grate bars
  for (let x = x0 + 2 * k - 1; x < x0 + w; x += 2 * k) px.vline(x, y0, h, 1);
  // little vent slits up top
  for (let i = 0; i < 3; i++) px.hline(5 * k + i * 2 * k, 3 * k, k, off[1]);
  return px.toImage(pal);
}
T.furnace_front = (S, st) => furnaceFront(S, st, false);
T.furnace_front_on = (S, st) => furnaceFront(S, st, true);
T.furnace_side = (S, st) => {
  const { k, pal, px, b } = furnaceBase(S, st, 28);
  px.hline(1, 6 * k, S - 2, 1);
  px.hline(1, 6 * k + 1, S - 2, b + 1);
  return px.toImage(pal);
};
T.furnace_top = (S, st) => {
  const { P, k, pal, px, b } = furnaceBase(S, st, 29);
  px.rect(3 * k, 3 * k, 10 * k, 10 * k, b);
  px.hline(3 * k, 3 * k, 10 * k, 1);
  px.vline(3 * k, 3 * k, 10 * k, 1);
  px.hline(3 * k, 13 * k, 10 * k + 1, b + 1);
  px.vline(13 * k, 3 * k, 10 * k, b + 1);
  if (P) px.rect(6 * k, 6 * k, 4 * k, 4 * k, b - 1);
  return px.toImage(pal);
};

T.torch = (S, st) => {
  const P = isP(st);
  const k = S / 16;
  const { pal, off } = cat(ramp('#6e5233', 4, { contrast: 0.45, hue: 16 }), ramp('#ffc23a', 4, { contrast: 0.7, hue: 30, mid: 1 }));
  const px = new Px(S, S, false, -1);
  const x0 = 7 * k;
  const w = 2 * k;
  // stick: lit left, shaded right, a darker band
  for (let y = 8 * k; y < 16 * k; y++) {
    for (let i = 0; i < w; i++) px.set(x0 + i, y, i < w / 2 ? 2 : 1);
    if (P) px.set(x0, y, 3);
  }
  px.hline(x0, 12 * k, w, 0);
  if (P) px.hline(x0, 12 * k + 1, w, 1);
  // burning head: two rows (k-scaled) of hot colours
  px.rect(x0, 6 * k, w, 2 * k, off[1] + 2);
  px.hline(x0, 6 * k, w, off[1] + 3);
  if (P) {
    px.rect(x0 + 1, 6 * k, w - 2, 2, off[1] + 3);
    px.hline(x0, 8 * k, w, off[1] + 1);
    px.hline(x0, 8 * k + 1, w, off[1]);
  } else px.hline(x0, 8 * k, w, off[1] + 1);
  return px.toImage(pal);
};

// -------------------------------------------------------------------- ores --
// Each ore has a few hand-drawn gem stamps per resolution. Letters: h = glint,
// a = lit face, b = body, c = shaded face, x = accent (copper verdigris).
// Every gem gets a 1px dark outline so ores read from across a cave.
const ORES = {
  coal_ore: { c: '#3b3a40', hl: '#8c8a98', outline: '#1a181e', base: 'stone' },
  iron_ore: { c: '#d8a383', base: 'stone' },
  gold_ore: { c: '#f4c93a', base: 'stone' },
  diamond_ore: { c: '#46d8e0', base: 'stone' },
  emerald_ore: { c: '#2fc663', base: 'stone' },
  redstone_ore: { c: '#d8231e', base: 'stone' },
  lapis_ore: { c: '#2f5bd0', base: 'stone' },
  copper_ore: { c: '#d47a4c', extra: '#5ec7a0', base: 'stone' },
};
const NETHER_ORES = {
  nether_gold_ore: { c: '#f4c93a', base: 'netherrack', stamps: 'nugget_small' },
  nether_quartz_ore: { c: '#e8ddd0', base: 'netherrack', stamps: 'quartz', outline: '#4a1c1c' },
};

const STAMPS = {
  coal_ore: {
    16: [['.hb.', 'hbbc', 'bbcc', '.cc.'], ['hb.', 'bbc', '.cc'], ['hb', 'bc']],
    32: [['..hb..', '.hbbc.', 'hbbbcc', 'bbbccc', '.bccc.', '..cc..'], ['.hb.', 'hbbc', 'bbcc', '.cc.']],
  },
  nugget: {
    16: [['hab', 'bbc'], ['.h', 'ab', 'bc'], ['hb', 'bc']],
    32: [['.hab.', 'habbc', 'abbbc', '.bcc.'], ['.hb', 'hbc', 'bcc'], ['hab.', 'abbc', '.bcc']],
  },
  copper_ore: {
    16: [['hxb', 'bbc'], ['hb', 'xc'], ['.h', 'ab', 'xc']],
    32: [['.hab.', 'haxbc', 'abbxc', '.bcc.'], ['hxb', 'abc', '.cc'], ['hab.', 'axbc', '.bcc']],
  },
  diamond_ore: {
    16: [['.h.', 'hbc', '.c.'], ['hb', 'bc'], ['.h.', 'abc', '.c.']],
    32: [['...h...', '..hab..', '.habbc.', 'habbbcc', '.abbcc.', '..bcc..', '...c...'], ['..h..', '.hbc.', 'hbbcc', '.bcc.', '..c..']],
  },
  emerald_ore: {
    16: [['h.', 'ab', 'bc'], ['h', 'b', 'c']],
    32: [['.hb.', 'habc', 'abbc', 'abbc', 'abcc', '.bc.'], ['.h.', 'hbc', 'abc', '.c.']],
  },
  redstone_ore: {
    16: [['hb.', 'bbc', '.c.'], ['hb', 'bc']],
    32: [['.hb.', 'habc', 'bbbc', '.cc.'], ['.hb', 'hbc', 'bc.'], ['hb', 'bc']],
  },
  lapis_ore: {
    16: [['hab', 'bbc'], ['hb.', '.bc'], ['hb', 'bc']],
    32: [['.hab.', 'habbbc', 'abbbc.', '.bcc..'], ['hab', 'bbc', '.c.']],
  },
  quartz: {
    16: [['h.', 'ab', '.c'], ['ha', '.c'], ['hab']],
    32: [['h....', 'hab..', '.abb.', '..bbc', '...c.'], ['.h.', 'hab', 'abc', '.c.']],
  },
  nugget_small: {
    16: [['h'], ['hb'], ['a', 'c']],
    32: [['hb', 'bc'], ['hab', 'bcc'], ['h.', 'ac']],
  },
};

/** Gem layer for an ore: index map + palette + the glint pixels (for sparkles). */
function gemLayer(name, S, st, seed) {
  const def = ORES[name] || NETHER_ORES[name];
  const P = isP(st);
  const res = P ? 32 : 16;
  const stamps = STAMPS[def.stamps || (STAMPS[name] ? name : 'nugget')][res];
  const gp = ramp(def.c, 4, { contrast: P ? 0.55 : 0.48, hue: 22, mid: 2 });
  const outline = def.outline ? rgba(def.outline) : mixc(gp[0], [22, 16, 32, 255], 0.6);
  const hl = def.hl ? rgba(def.hl) : mixc(gp[3], [255, 255, 236, 255], 0.65);
  const pal = [outline, gp[0], gp[1], gp[2], gp[3], hl, def.extra ? rgba(def.extra) : gp[2]];
  const MAP = { c: 1, b: 2, a: 3, h: 5, x: 6 };
  const px = new Px(S, S, true, -1);
  const r = rng(seed);
  const clusters = name === 'nether_gold_ore' ? (P ? 7 : 6) : P ? 4 : 3;
  const per = name === 'nether_gold_ore' ? 2 : P ? 3 : 2;
  const centres = [];
  const glints = [];
  const dist = (a, b) => Math.hypot(Math.min(Math.abs(a[0] - b[0]), S - Math.abs(a[0] - b[0])), Math.min(Math.abs(a[1] - b[1]), S - Math.abs(a[1] - b[1])));
  for (let c = 0; c < clusters; c++) {
    let best = null;
    for (let t = 0; t < 40; t++) {
      const p = [r.i(S), r.i(S)];
      const d = Math.min(S, ...centres.map((q) => dist(p, q)));
      if (!best || d > best[1]) best = [p, d];
    }
    centres.push(best[0]);
    for (let g = 0; g < per; g++) {
      const st0 = stamps[g === 0 ? 0 : r.i(stamps.length)];
      const rows = r.chance(0.5) && g ? st0.map((row) => [...row].reverse().join('')) : st0;
      const [cx, cy] = best[0];
      const ox = cx + (g ? r.pick([-1, 1]) * (P ? r.range(4, 6) : r.range(3, 4)) : 0);
      const oy = cy + (g ? r.pick([-1, 0, 1]) * (P ? 4 : 3) : 0);
      const pts = [];
      rows.forEach((row, j) => [...row].forEach((ch, i) => ch in MAP && pts.push([ox + i, oy + j, MAP[ch]])));
      // gems never touch: keep a free ring for the outline
      const ring = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) ring.push([dx, dy]);
      if (pts.some(([x, y]) => ring.some(([dx, dy]) => px.get(x + dx, y + dy) >= 1))) continue;
      for (const [x, y, v] of pts) {
        px.set(x, y, v);
        if (v === 5) glints.push([(x + S) % S, (y + S) % S]);
      }
      for (const [x, y] of pts) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (px.get(x + dx, y + dy) < 0) px.set(x + dx, y + dy, 0);
    }
  }
  return { px, pal, glints };
}

/** Ore = the exact matching stone + outlined gem clusters. Pretty ores twinkle. */
function ore(name, deep, seed) {
  const def = ORES[name] || NETHER_ORES[name];
  const fn = (S, st) => {
    const base = deep ? T.deepslate(S, st) : T[def.base](S, st);
    const { px, pal, glints } = gemLayer(name, S, st, seed);
    const still = layer(base, px.toImage(pal));
    if (!isP(st) || !glints.length) return still;
    // a slow sparkle: mostly still, then one glint flares and fades
    const g = glints[seed % glints.length];
    const frame = (size) => {
      const f = new Image(S).blit(still, 0, 0);
      f.set(g[0], g[1], [255, 255, 250, 255]);
      const soft = mixc(pal[5], [255, 255, 255, 255], 0.5);
      if (size > 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) f.set((g[0] + dx + S) % S, (g[1] + dy + S) % S, soft);
      return f;
    };
    const img = strip([still, frame(1), frame(2)]);
    img.meta = { animation: { frametime: 2, frames: [{ index: 0, time: 90 + (seed % 7) * 12 }, 1, 2, 2, 1] } };
    return img;
  };
  // emissive overlay (OptiFine / Continuity): only the glint and lit faces glow
  fn.emissive = (S, st) => {
    const { px, pal } = gemLayer(name, S, st, seed);
    const img = new Image(S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = px.get(x, y);
      if (v === 5 || v === 4) img.set(x, y, pal[v]);
    }
    return img;
  };
  return fn;
}
Object.keys(ORES).forEach((name, i) => {
  T[name] = ore(name, false, 100 + i * 17);
  T[`deepslate_${name}`] = ore(name, true, 300 + i * 17);
});
Object.keys(NETHER_ORES).forEach((name, i) => {
  T[name] = ore(name, false, 500 + i * 17);
});

module.exports = { T, ORES, NETHER_ORES, rock, WOOD, planks, leaves, barkSide, logTop, isP, cat };
