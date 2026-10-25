'use strict';
// Non-living item art the tool/food modules don't cover: buckets (and the
// water-living mob buckets), the book family, pearl/eye, hand tools (shears,
// flint and steel, fishing rod, spyglass, brush, the on-a-sticks), the boat
// and minecart families, totem, name tag, saddle, every spawn egg, the
// chicken eggs, and the compass / clock / recovery compass dial files (the
// game reads dial frames compass_00..31 etc. directly - there is no single
// compass texture to paint, and a missing frame renders magenta).
// Same rules as everywhere else: geometry authored in 16-unit space, one
// outline colour, top-left light, hand-picked palettes. No vanilla pixels.
const { Px, ramp, rgba, mixc, palette, rng } = require('./lib');
const { item, OUTLINE, STICK } = require('./items');
const { WOOD } = require('./blocks');

// ------------------------------------------------------------- coordinates --
/** Rounded-rect test in 16-unit space. */
const box = (x, y, x0, y0, x1, y1, r = 0) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  if (r <= 0) return true;
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  return Math.hypot(x - cx, y - cy) <= r;
};
const pill = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
/** Capsule: distance from (x,y) to segment ab <= w. */
const dash = (x, y, ax, ay, bx, by, w) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) <= w;
};
/** Rotate (x,y) around (ox,oy) by deg clockwise. */
const rot = (x, y, ox, oy, deg) => {
  const a = deg * Math.PI / 180;
  const dx = x - ox;
  const dy = y - oy;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
};
const p2 = (n) => String(n).padStart(2, '0');
const h2c = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const c2h = (c) => '#' + c.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => c2h(mixc(h2c(a), h2c(b), t));
const IRON = '#c9cbd1';
const STEEL = '#8a8e96';
const DARK = mixHex(IRON, OUTLINE, 0.62);

const I = {};

// ----------------------------------------------------------------- buckets --
// Tapered pail: bail handle arcs above the rim, the opening is either a dark
// ellipse (empty) or the liquid + a little fish arcing over the rim, and the
// rim ring is drawn last so everything reads through it.
const OPENING = (x, y) => pill(x, y, 8, 4.85, 2.55, 0.95);
const bucketPainter = (fill) => (S) => {
  const regs = [
    { color: IRON, n: 5, shape: (x, y) => { // bail handle above the rim
      if (y > 4.35) return false;
      const d = Math.hypot(x - 8, y - 4.45);
      return d >= 2.55 && d <= 3.3;
    } },
    { color: IRON, n: 5, shape: (x, y) => { // tapered body with a round base
      if (y >= 4.35 && y <= 12.4 && Math.abs(x - 8) <= 3.25 - (y - 4.35) * 0.115) return true;
      return pill(x, y, 8, 12.1, 2.2, 0.9);
    } },
  ];
  regs.push({ color: DARK, n: 3, shape: OPENING }); // dark mouth behind whatever the bucket holds
  if (fill) {
    regs.push({ ...fill, shape: (x, y) => pill(x, y, 8, 4.78, 2.15, 0.68) }); // liquid floats inside the mouth
  }
  regs.push({ color: IRON, n: 5, shape: (x, y) => { // rim over the liquid, like the vanilla setup
    const d = Math.hypot((x - 8) / 3.3, (y - 4.35) / 1.15);
    return d >= 0.72 && d <= 1.06;
  } });
  const rimAt = regs.length - 1;
  if (fill && fill.creature) { // the swimmer goes over the rim so its back reads
    const c = fill.creature;
    regs.push({ color: c.fins, n: 3, shape: (x, y) => { // tail fin, up and left
      const [u, v] = rot(x, y, c.x, c.y, c.rot || 0);
      return u < -1.4 && u > -2.7 && Math.abs(v) <= (u + 2.7) * 0.9;
    } });
    regs.push({ color: c.color, n: 4, shape: (x, y) => { // chubby body, back arcing over the rim
      const [u, v] = rot(x, y, c.x, c.y, c.rot || 0);
      return Math.abs(u) <= 1.95 && Math.abs(v) <= 1.1 - Math.max(0, Math.abs(u) - 0.9) * 0.9;
    } });
    regs.push({ color: c.fins, n: 2, shape: (x, y) => { // top fin breaks above the rim
      const [u, v] = rot(x, y, c.x, c.y, c.rot || 0);
      return u > -0.8 && u < 0.8 && v < -0.9 && v > -1.6;
    } });
    for (const [ex, ey] of c.eyes) {
      regs.push({ color: mixHex(OUTLINE, '#ffffff', 0.3), n: 2, shape: (x, y) => Math.hypot(x - ex, y - ey) <= 0.42 });
    }
  }
  return item(S, regs, { extra: [
    (px, regs, k) => {
      const rim = regs[rimAt];
      for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
        if (rim.has(x, y) && rim.has(x, y + 1) && !rim.has(x, y - 1)) px.set(x, y, rim.m.at(rim.m.n - 1)); // lit upper rim
      }
    } ]});
};

const LOOK = {
  water: '#3d57d6',
  lava: '#db6a1e',
  powder: '#eef2f5',
};
I.bucket = bucketPainter(null);
I.water_bucket = bucketPainter({ color: LOOK.water, n: 4 });
I.lava_bucket = bucketPainter({ color: LOOK.lava, n: 4 });
I.powder_snow_bucket = bucketPainter({ color: LOOK.powder, n: 4 });

const swim = (color, fins, opt = {}) => ({
  creature: {
    x: opt.x ?? 8.2, y: opt.y ?? 4.15, rot: opt.rot ?? 0,
    color, fins, eyes: [[(opt.x ?? 8.2) + 1.35, (opt.y ?? 4.15) - 0.35]],
  },
});
I.cod_bucket = bucketPainter({ color: '#4e6f9e', n: 4, ...swim('#a88c5e', '#7e6543') });
I.salmon_bucket = bucketPainter({ color: '#3e6f8e', n: 4, ...swim('#c45e4a', '#8a3e32', { rot: -12 }) });
I.pufferfish_bucket = bucketPainter({ color: '#3aa3b8', n: 4, ...swim('#b8a84e', '#8a7c3a') });
I.tropical_fish_bucket = bucketPainter({ color: '#2e8ea8', n: 4, ...swim('#e8942e', '#3ac4c4') });
I.axolotl_bucket = bucketPainter({ color: '#7fa8b8', n: 4, ...swim('#f5a8c4', '#d67aa8', { rot: -14 }) });
I.tadpole_bucket = bucketPainter({ color: '#7f9e8a', n: 4, ...swim('#3c352c', '#2e2922', { rot: -22 }) });

// ------------------------------------------------------------------- books --
const bookPainter = (cover, opt = {}) => {
  const edge = mixHex(cover, '#ffffff', 0.28);
  const dark = mixHex(cover, OUTLINE, 0.45);
  const band = opt.band || mixHex(cover, '#ffffff', 0.2);
  const page = opt.page || '#e6ddc9';
  const speckle = opt.speckle;
  const specks = speckle ? (() => { // a few magic glints on the cover leather
    const r = rng(917);
    return Array.from({ length: 7 }, () => ({
      x: 5.6 + r.f() * 5.6, y: 4.6 + r.f() * 7.4, s: r.range(0.35, 0.55),
      c: r.f() > 0.5 ? opt.speckle : mixHex(opt.speckle, '#ffffff', 0.5),
    }));
  })() : null;
  return (S) => item(S, [
    { color: page, n: 4, shape: (x, y) => box(x, y, 4.4, 3.4, 13, 13.1, 0.6) }, // page block
    { color: cover, n: 5, shape: (x, y) => box(x, y, 3, 2.8, 12.6, 13.4, 1) }, // cover
    { color: dark, n: 3, shape: (x, y) => (x >= 3 && x <= 4.6 && y >= 2.8 && y <= 13.4) }, // spine
    { color: edge, n: 3, shape: (x, y) => (y >= 2.9 && y <= 13.1 && x >= 4.9 && x <= 5.35) }, // cover fold light
    { color: band, n: 3, shape: (x, y) => (y >= 7.1 && y <= 9.6 && x >= 4.9 && x <= 12.6) }, // title band
    { color: dark, n: 3, shape: (x, y) => (x >= 10.7 && x <= 11.6 && y >= 6.7 && y <= 10) }, // clasp
    ...(specks ? specks.map((s) => ({ color: s.c, n: 2, shape: (x, y) => Math.hypot(x - s.x, y - s.y) <= s.s }))
      : []),
  ], { extra: [
    (px, regs, k) => {
      const cov = regs[1];
      for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
        if (!cov.has(x, y)) continue;
        if (cov.has(x, y + 1) && !cov.has(x, y - 1) && (x - 0.5) / k > 3.1) px.set(x, y, cov.m.at(cov.m.n - 1)); // lit top edge
        if (cov.has(x - 1, y) && cov.has(x + 1, y) && cov.has(x, y - 1) && cov.has(x, y + 1)) { // inner part
          const ux = (x + 0.5) / k;
          const uy = (y + 0.5) / k;
          if (ux > 6 && ux < 12.2 && uy > 3.4 && uy < 6.8 && (ux * 7 + uy * 13) % 11 < 1.1) px.set(x, y, mixHex(cover, OUTLINE, 0.22)); // grain
        }
      }
    } ]});
};
I.book = bookPainter('#8a5c36');
I.enchanted_book = bookPainter('#6b4b8e', { speckle: '#e8c8ff', page: '#ded4ee' });
I.writable_book = bookPainter('#b1874a');
I.written_book = bookPainter('#7a4432', { band: '#e0b43a', page: '#e6ddc9' });
I.knowledge_book = bookPainter('#5e7a72', { band: '#c6d8c2', page: '#dfe6d8' });

// ------------------------------------------------------- pearls, eye, guns --
I.ender_pearl = (S) => item(S, [
  { color: '#1f6e58', n: 5, shape: (x, y) => pill(x, y, 8, 8, 5.4, 5.4) }, // dark base sphere
  { color: '#2ea37c', n: 5, shape: (x, y) => pill(x, y, 7.1, 7.1, 3.6, 3.6) }, // lit hemisphere
  { color: '#8ef2c8', n: 3, shape: (x, y) => pill(x, y, 6.2, 6.2, 1.5, 1.5) }, // near highlight
  { color: '#3f8a68', n: 3, shape: (x, y) => dash(x, y, 5.4, 10.8, 11, 5.6, 0.9) && pill(x, y, 8, 8, 5, 5) }, // swirl band
]);
I.ender_eye = (S) => item(S, [
  { color: '#1f6e58', n: 5, shape: (x, y) => pill(x, y, 8, 8, 5.6, 5.6) }, // shell
  { color: '#8ef2c8', n: 4, shape: (x, y) => pill(x, y, 8, 8, 3.4, 3.4) }, // iris ring
  { color: '#f0fff5', n: 3, shape: (x, y) => pill(x, y, 8, 8, 1.9, 1.9) }, // bright heart
  { color: '#1c4a3a', n: 3, shape: (x, y) => pill(x, y, 8, 8, 0.85, 2.6) && true }, // slit pupil
], { extra: [
  (px, regs, k) => { // green sheen across the shell
    const sh = regs[0];
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      if (sh.has(x, y) && (y + 0.5) / k < 5 && sh.has(x, y + 1)) px.set(x, y, '#5fbb96');
    }
  } ]});

I.shears = (S) => item(S, [
  { color: mixHex('#4a4446', '#ffffff', 0.14), n: 4, shape: (x, y) => { // grip loops hang below the shanks
    const d1 = Math.hypot(x - 5.9, y - 12.2);
    const d2 = Math.hypot(x - 10.1, y - 12.2);
    return (d1 >= 1 && d1 <= 1.85) || (d2 >= 1 && d2 <= 1.85);
  } },
  { color: mixHex('#4a4446', '#ffffff', 0.28), n: 4, shape: (x, y) => ( // shanks run from the pivot to the loops
    dash(x, y, 7.7, 9.2, 6.1, 11.6, 0.55) || dash(x, y, 8.3, 9.2, 9.9, 11.6, 0.55)
  ) },
  { color: IRON, n: 5, shape: (x, y) => ( // two blades cross in a narrow X above the pivot
    dash(x, y, 7.9, 8.6, 4.6, 2.3, 0.85) ||
    dash(x, y, 7.9, 8.6, 4.9, 1.9, 0.45) || // tapered tip
    dash(x, y, 8.1, 8.6, 11.4, 2.3, 0.85) ||
    dash(x, y, 11.1, 1.9, 8.1, 8.6, 0.45)
  ) },
  { color: STEEL, n: 4, shape: (x, y) => Math.hypot(x - 8, y - 8.7) <= 0.95 }, // pivot screw
]);
I.flint_and_steel = (S) => item(S, [
  { color: '#2e2a2c', n: 4, shape: (x, y) => { // flint shard, a fat dark wedge bottom-left
    const [u, v] = rot(x, y, 4.6, 10.6, 42);
    return u > -2.4 && u < 2.4 && Math.abs(v) <= 1.7 - Math.max(0, Math.abs(u) - 0.9) * 1.0;
  } },
  { color: STEEL, n: 5, shape: (x, y) => { // steel C-arc, thick ring with the gap toward the flint
    const d = Math.hypot(x - 10.1, y - 6.2);
    if (d < 1.45 || d > 2.75) return false;
    const a = Math.atan2(y - 6.2, x - 10.1) * 180 / Math.PI; // 0 = right, +90 = down
    return Math.abs(a - 140) > 58; // open face points at the lower-left flint
  } },
], { extra: [
  (px, regs, k) => {
    const fl = regs[0];
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      if (fl.has(x, y) && (x * 5 + y * 11) % 17 < 3) px.set(x, y, mixHex('#2e2a2c', '#8a8e96', 0.5)); // grain flecks
    }
  } ]});

const rodPainter = (cast) => (S) => item(S, [
  { color: mixHex(STICK, OUTLINE, 0.4), n: 3, shape: (x, y) => dash(x, y, 2.9, 12.9, 5.4, 10.4, 1.25) }, // grip wrap
  { color: STICK, n: 4, shape: (x, y) => dash(x, y, 2.9, 12.9, 12.6, 3.3, 0.72) }, // rod shaft
  { color: mixHex(STICK, OUTLINE, 0.35), n: 3, shape: (x, y) => box(x, y, 5.2, 9.2, 7.2, 11.2, 0.6) }, // reel block
  ...(cast ? [
    { color: '#e8e8e8', n: 3, shape: (x, y) => dash(x, y, 12.6, 3.3, 13.7, 13.6, 0.34) }, // line
    { color: '#d8483a', n: 3, shape: (x, y) => (Math.hypot(x - 13.35, y - 14.05) <= 1.15 && y < 14.05) }, // bobber top
    { color: '#f0ede6', n: 3, shape: (x, y) => (Math.hypot(x - 13.35, y - 14.05) <= 1.15 && y >= 14.05) }, // bobber bottom
  ] : []),
]);
I.fishing_rod = rodPainter(false);
I.fishing_rod_cast = rodPainter(true);

I.spyglass = (S) => item(S, [
  { color: '#8a5e42', n: 5, shape: (x, y) => box(x, y, 2.6, 5.9, 6.9, 10.1, 1.1) }, // front barrel
  { color: '#4a3a30', n: 3, shape: (x, y) => (x >= 3.4 && x <= 4.3 && y >= 5.9 && y <= 10.1) }, // front ring
  { color: '#1c2226', n: 3, shape: (x, y) => pill(x, y, 3.35, 8, 1.35, 1.9) }, // lens
  { color: '#b4855e', n: 5, shape: (x, y) => box(x, y, 6.5, 6.6, 13.3, 9.4, 1.2) }, // rear barrel
  { color: '#4a3a30', n: 3, shape: (x, y) => (x >= 12.4 && x <= 13.3 && y >= 6.6 && y <= 9.4) }, // rear ring
], { extra: [
  (px, regs, k) => {
    const lens = regs[2];
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      if (lens.has(x, y) && (y + 0.5) / k < 7.4) px.set(x, y, mixHex('#1c2226', '#9ec8e0', 0.55)); // glass glint
    }
  } ]});

I.brush = (S) => item(S, [
  { color: '#b3874e', n: 4, shape: (x, y) => box(x, y, 6.9, 1.8, 9.3, 8.6, 1) }, // handle
  { color: mixHex('#b3874e', OUTLINE, 0.4), n: 3, shape: (x, y) => (box(x, y, 8.05, 2.2, 8.6, 8.2, 0.4)) }, // handle groove
  { color: IRON, n: 4, shape: (x, y) => box(x, y, 6.5, 8.2, 9.7, 10, 0.7) }, // ferrule
  { color: '#d8c8b4', n: 3, shape: (x, y) => ( // splayed bristles
    (dash(x, y, 6.9, 9.9, 5.5, 13.7, 0.55)) ||
    (dash(x, y, 8.1, 9.9, 7.9, 13.9, 0.55)) ||
    (dash(x, y, 9.3, 9.9, 10.5, 13.7, 0.55)) ||
    (dash(x, y, 9.9, 9.9, 12.6, 13.4, 0.55))
  ) },
]);

const stickPainter = (head, opt = {}) => (S) => item(S, [
  { color: STICK, n: 4, shape: (x, y) => dash(x, y, 2.7, 13.3, 9.6, 6.2, 0.8) }, // pole
  ...head,
], { extra: opt.extra });

const carrotPack = [
  { color: '#4e9e42', n: 3, shape: (x, y) => pill(x, y, 12.6, 2.9, 0.5, 1.5) && y <= 3.4 }, // fronds
  { color: '#6bc45e', n: 3, shape: (x, y) => (box(x, y, 12.2, 3.2, 13, 4.2, 0.4)) },
  { color: '#e08a3a', n: 5, shape: (x, y) => { // carrot down toward the pole
    const [u, v] = rot(x, y, 11.3, 3.6, 45);
    return u > -1.4 && u < 3.4 && Math.abs(v) <= 1.05 - Math.max(0, u - 1) * 0.55;
  } },
  { color: '#f2b46a', n: 3, shape: (x, y) => dash(x, y, 10.1, 5.9, 12.1, 3.4, 0.5) }, // carrot sheen
];
I.carrot_on_a_stick = stickPainter(carrotPack);
I.warped_fungus_on_a_stick = stickPainter([
  { color: '#3aa38a', n: 4, shape: (x, y) => dash(x, y, 9.6, 6.4, 11.4, 4.1, 0.75) }, // stem
  { color: '#a83a8e', n: 4, shape: (x, y) => pill(x, y, 11.7, 3.1, 2.5, 1.75) }, // magenta cap
  { color: '#e0b4d0', n: 2, shape: (x, y) => pill(x, y, 10.7, 2.5, 0.55, 0.45) }, // cap dots
  { color: '#e0b4d0', n: 2, shape: (x, y) => pill(x, y, 12.7, 2.2, 0.55, 0.45) },
]);

I.wind_charge = (S) => item(S, [
  { color: '#cfd8e0', n: 4, shape: (x, y) => pill(x, y, 8, 8, 5.2, 5.2) }, // outer swirl
  { color: '#eef2f6', n: 4, shape: (x, y) => pill(x, y, 7.6, 7.6, 3.4, 3.4) }, // bright inner
  { color: '#7fa3d0', n: 3, shape: (x, y) => { // wind ring, upper-left arc
    const [u, v] = rot(x, y, 8, 8, -50);
    return Math.hypot(u, v - 2.2) <= 1 && pill(x, y, 8, 8, 4.6, 4.6);
  } },
  { color: '#7fa3d0', n: 3, shape: (x, y) => { // second arc, lower-right
    const [u, v] = rot(x, y, 8, 8, 140);
    return Math.hypot(u, v - 3) <= 0.85 && pill(x, y, 8, 8, 4.6, 4.6);
  } },
  { color: '#ffffff', n: 2, shape: (x, y) => pill(x, y, 7.2, 7.2, 1.3, 1.3) }, // eye
]);

I.firework_rocket = (S) => item(S, [
  { color: mixHex(STICK, OUTLINE, 0.3), n: 3, shape: (x, y) => box(x, y, 7.1, 9.4, 8.9, 13.9, 0.6) }, // stick
  { color: '#e5dcc2', n: 5, shape: (x, y) => box(x, y, 5.2, 4.2, 10.8, 10.4, 0.8) }, // paper body
  { color: mixHex('#e5dcc2', OUTLINE, 0.35), n: 3, shape: (x, y) => { // cone tip
    if (y < 2.4 || y > 4.2) return false;
    return Math.abs(x - 8) <= (y - 2.2) * 1.5;
  } },
  { color: '#d8483a', n: 4, shape: (x, y) => (y >= 8.6 && y <= 10.4 && x >= 5.2 && x <= 10.8) }, // red band
  { color: '#e8b43a', n: 3, shape: (x, y) => (y >= 5.6 && y <= 6.5 && x >= 5.2 && x <= 10.8) }, // gold band
  { color: '#c98a2a', n: 3, shape: (x, y) => (x >= 6.9 && x <= 9.1 && y >= 6.9 && y <= 8.3) }, // star emblem box
]);
I.firework_star = (S) => item(S, [
  { color: '#c98a2a', n: 4, shape: (x, y) => { // five points
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      if (dash(x, y, 8 + Math.cos(a) * 0.4, 8 + Math.sin(a) * 0.4, 8 + Math.cos(a) * 5.4, 8 + Math.sin(a) * 5.4, 1.02)) return true;
    }
    return false;
  } },
  { color: '#f2c53a', n: 5, shape: (x, y) => { // bright core
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      if (dash(x, y, 8, 8, 8 + Math.cos(a) * 2.9, 8 + Math.sin(a) * 2.9, 0.85)) return true;
    }
    return false;
  } },
  { color: '#ffe89a', n: 3, shape: (x, y) => pill(x, y, 8, 8, 1.35, 1.35) }, // hot center
]);

// ------------------------------------------------------------------- boats --
const WOODS = {
  ...WOOD,
  pale_oak: { bark: '#b8b2a2', top: '#d5d1c3', plank: '#d5d1c3' },
  bamboo: { bark: '#8a7c26', top: '#c9b73e', plank: '#c9b73e' },
};
const boatPainter = (woodKey, chest, raft) => {
  const w = WOODS[woodKey];
  const plank = w.plank;
  const plankDark = mixHex(plank, OUTLINE, 0.42);
  const interior = mixHex(plank, OUTLINE, 0.18);
  const rim = mixHex(plank, '#ffffff', 0.3);
  return (S) => item(S, [
    ...(raft ? [
      { color: plank, n: 5, shape: (x, y) => box(x, y, 1.6, 8.9, 14.4, 12.9, 1.9) }, // flat slab hull
    ] : [
      { color: plank, n: 5, shape: (x, y) => { // curved hull profile
        const dx = Math.abs(x - 8);
        if (dx > 5.6) return false;
        const t = dx / 5.6;
        const top = 8.1 - 2.0 * Math.pow(t, 1.55);
        const bot = 12.7 - 4.35 * Math.pow(t, 1.6);
        return y > top && y < bot;
      } },
      { color: interior, n: 4, shape: (x, y) => { // inside the boat
        const dx = Math.abs(x - 8);
        const t = dx / 5.6;
        return dx < 3.9 && y > 8.1 - 2.0 * Math.pow(t, 1.55) + 1.45 && y < 11.55 - 1.05 * t;
      } },
      { color: rim, n: 3, shape: (x, y) => { // gunwale edge
        const dx = Math.abs(x - 8);
        if (dx > 5.75) return false;
        const t = dx / 5.75;
        return y > 7.9 - 2.05 * Math.pow(t, 1.55) && y < 8.85 - 1.7 * Math.pow(t, 1.55);
      } },
    ]),
    ...(chest ? [
      { color: '#8a5e34', n: 5, shape: (x, y) => box(x, y, 5.1, 4.4, 10.9, 7.9, 1) }, // cargo chest
      { color: mixHex('#8a5e34', OUTLINE, 0.42), n: 3, shape: (x, y) => (y >= 5.9 && y <= 6.25 && x >= 5.1 && x <= 10.9) }, // lid seam
      { color: '#e0b43a', n: 3, shape: (x, y) => box(x, y, 7.6, 6.25, 8.4, 7.5, 0.35) }, // latch
    ] : []),
  ], { extra: [
    (px, regs, k) => {
      const hull = regs[0];
      for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
        if (!hull.has(x, y)) continue;
        const u = (raft ? (x + 0.5) : (y + 0.5)) / k; // rafts show log ends (vertical), boats run planks fore-and-aft
        const scale = raft ? 2.15 : 1.65;
        if (Math.abs(((u * scale) % 2) - 1) < (k > 1 ? 0.32 : 0.58)) px.set(x, y, plankDark);
      }
    } ]});
};
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak']) {
  I[`${w}_boat`] = boatPainter(w, false, false);
  I[`${w}_chest_boat`] = boatPainter(w, true, false);
}
I.bamboo_raft = boatPainter('bamboo', false, true);
I.bamboo_chest_raft = boatPainter('bamboo', true, true);

// --------------------------------------------------------------- minecarts --
const cartPainter = (cargo) => {
  const CARGO = '#8a5e34';
  const cargoBox = (fill, lidSeam) => [
    { color: CARGO, n: 5, shape: (x, y) => box(x, y, 4.5, 2.9, 11.5, 7.3, 0.8) }, // payload box rides above the rim
    { color: lidSeam ?? mixHex(CARGO, OUTLINE, 0.42), n: 3, shape: (x, y) => (y >= 4.4 && y <= 4.75 && x >= 4.5 && x <= 11.5) },
    ...fill,
  ];
  return (S) => item(S, [
    { color: IRON, n: 5, shape: (x, y) => { // cart shell trapezoid
      if (y < 5 || y > 12.9) return false;
      const half = y < 10 ? 5.6 : 5.6 - (y - 10) * 0.36;
      if (Math.abs(x - 8) > half) return false;
      return pill(x, y, 8, 11.1, 5.4, 1.7) || y <= 11.1;
    } },
    { color: mixHex(IRON, OUTLINE, 0.8), n: 3, shape: (x, y) => ( // open cargo hold, tapering to the base
      y >= 6.4 && y <= 10.6 && Math.abs(x - 8) <= 3.6 - (y - 6.4) * 0.3
    ) }, // dark hold
    ...(cargo === 'chest' ? cargoBox([]) : []),
    ...(cargo === 'tnt' ? cargoBox([
      { color: '#c4402a', n: 4, shape: (x, y) => box(x, y, 4.7, 3.9, 11.3, 6.9, 0.7) },
      { color: '#efeae2', n: 3, shape: (x, y) => (y >= 5.1 && y <= 5.7 && x >= 4.7 && x <= 11.3) }, // white band row
      { color: '#4a4038', n: 2, shape: (x, y) => ((Math.abs(x - 5.9) <= 0.28 || Math.abs(x - 8) <= 0.28 || Math.abs(x - 10.1) <= 0.28) && y >= 5.05 && y <= 5.75) }, // letter posts
    ], mixHex('#c4402a', OUTLINE, 0.4)) : []),
    ...(cargo === 'command' ? cargoBox([
      { color: '#c88a4e', n: 4, shape: (x, y) => box(x, y, 4.7, 3.9, 11.3, 6.9, 0.7) },
      { color: '#e8b06a', n: 3, shape: (x, y) => ((x * 3 + y * 5) % 7 < 2 && box(x, y, 5.2, 4.2, 10.8, 6.5, 0)) }, // speckles
    ]) : []),
    ...(cargo === 'hopper' ? [
      { color: STEEL, n: 4, shape: (x, y) => (y >= 3.6 && y <= 4.4 && x >= 3.8 && x <= 12.2) }, // hopper cap
      { color: STEEL, n: 4, shape: (x, y) => (y > 4.4 && y < 7.4 && Math.abs(x - 8) <= 4.2 - (y - 4.4) * 0.8) }, // funnel
      { color: DARK, n: 3, shape: (x, y) => box(x, y, 6.9, 6.4, 9.1, 7.2, 0.3) }, // grate mouth
    ] : []),
    ...(cargo === 'furnace' ? cargoBox([
      { color: '#8a8682', n: 5, shape: (x, y) => box(x, y, 4.7, 3.9, 11.3, 6.9, 0.7) },
      { color: '#1d1a16', n: 3, shape: (x, y) => box(x, y, 6.5, 4.4, 9.5, 6.3, 0.5) }, // firebox mouth
      { color: '#f2a83a', n: 3, shape: (x, y) => (y >= 5.6 && y <= 6.2 && x >= 7.1 && x <= 8.9 && (x + y) % 2 < 1.4) }, // burning coals
      { color: '#e06a2e', n: 3, shape: (x, y) => (y >= 5 && y <= 5.5 && x >= 7.4 && x <= 8.6) }, // flame base
    ]) : []),
  ], { extra: [
    (px, regs, k) => { // wheels under the shell
      for (const [wx, wy] of [[4.4, 12.6], [11.6, 12.6]]) {
        for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
          if (Math.hypot((x + 0.5) / k - wx, (y + 0.5) / k - wy) <= 0.85) px.set(x, y, OUTLINE);
        }
      }
    } ]});
};
I.minecart = cartPainter(null);
I.chest_minecart = cartPainter('chest');
I.hopper_minecart = cartPainter('hopper');
I.tnt_minecart = cartPainter('tnt');
I.furnace_minecart = cartPainter('furnace');
I.command_block_minecart = cartPainter('command');

// ------------------------------------------------------------ small pieces --
I.totem_of_undying = (S) => item(S, [
  { color: '#3aa37c', n: 3, shape: (x, y) => pill(x, y, 6.7, 4.9, 0.6, 0.6) }, // left eye
  { color: '#3aa37c', n: 3, shape: (x, y) => pill(x, y, 9.3, 4.9, 0.6, 0.6) }, // right eye
  { color: '#f2c53a', n: 5, shape: (x, y) => box(x, y, 5.4, 2.4, 10.6, 6.9, 0.7) }, // head block
  { color: '#f2c53a', n: 5, shape: (x, y) => { // raised arms flare out to the head
    const [u1, v1] = rot(x, y, 5.9, 7.3, 22);
    const [u2, v2] = rot(x, y, 10.1, 7.3, -22);
    return (u1 < 0.6 && u1 > -3.4 && Math.abs(v1) <= 0.85) || (u2 < 0.6 && u2 > -3.4 && Math.abs(v2) <= 0.85);
  } },
  { color: '#d8a02e', n: 4, shape: (x, y) => (y >= 6.9 && y <= 10.6 && Math.abs(x - 8) <= 2.4 - (y - 6.9) * 0.12) }, // torso
  { color: '#d8a02e', n: 4, shape: (x, y) => (y >= 10.6 && y <= 13.8 && Math.abs(x - 8) <= 2.4 + (y - 10.6) * 0.14) }, // skirt
], { extra: [
  (px, regs, k) => {
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) { // etch lines
      const ux = (x + 0.5) / k;
      const uy = (y + 0.5) / k;
      const here = regs.some((r) => r.has(x, y)) && ux > 5 && ux < 11;
      if (!here) continue;
      const torso = uy > 6.9 && uy < 10.6;
      if ((Math.abs(((ux + uy) * 1.9) % 2) < 0.45) && torso) px.set(x, y, mixHex('#d8a02e', OUTLINE, 0.38));
    }
  } ]});

I.name_tag = (S) => item(S, [
  { color: '#e8e4d8', n: 4, shape: (x, y) => box(x, y, 3.4, 5.9, 12.8, 10.2, 1.2) }, // paper strip
  { color: '#4a4038', n: 3, shape: (x, y) => (y >= 7.4 && y <= 7.9 && x >= 5.2 && x <= 10.6) }, // text line
  { color: '#4a4038', n: 3, shape: (x, y) => (y >= 8.7 && y <= 9.2 && x >= 5.2 && x <= 8.8) }, // second line
  { color: '#b8b2a6', n: 3, shape: (x, y) => ( // string loop through the hole
    y <= 6.4 && Math.abs(Math.hypot(x - 4.5, y - 5.9) - 1.35) < 0.42
  ) },
  { color: '#4a4038', n: 3, shape: (x, y) => pill(x, y, 4.5, 6.5, 0.55, 0.55) }, // punched hole
]);

I.saddle = (S) => item(S, [
  { color: '#8a542a', n: 4, shape: (x, y) => box(x, y, 4.0, 8.8, 12.0, 13.4, 1.4) }, // skirt hangs as one piece
  { color: mixHex('#8a542a', OUTLINE, 0.42), n: 3, shape: (x, y) => (y >= 10.9 && y <= 11.4 && x >= 4.6 && x <= 11.4) }, // skirt seam
  { color: '#b4763e', n: 5, shape: (x, y) => { // seat: wide leather arch, dipped in the middle
    return box(x, y, 2.8, 4.2, 13.2, 9.9, 2.1) &&
      y >= 4.9 + 1.35 * ((x - 8.6) / 4.7) ** 2 && y <= 9.9;
  } },
  { color: '#b4763e', n: 5, shape: (x, y) => pill(x, y, 4.5, 4.9, 1.35, 1.2) }, // pommel horn, merged into the seat
  { color: mixHex('#b4763e', '#ffffff', 0.3), n: 3, shape: (x, y) => ( // lit seat crest
    y >= 5.1 && y <= 5.75 && x >= 7.2 && x <= 10.4
  ) },
  { color: mixHex('#b4763e', OUTLINE, 0.5), n: 3, shape: (x, y) => ( // girth strap down the middle
    y >= 9.6 && x >= 6.9 && x <= 9.1 && y <= 13.2 && box(x, y, 4.1, 8.9, 11.9, 13.3, 1.4)
  ) },
  { color: IRON, n: 3, shape: (x, y) => ( // stirrup ring hangs off the strap
    Math.hypot(x - 8, y - 12.6) <= 1 && Math.hypot(x - 8, y - 12.6) >= 0.45
  ) },
]);

// -------------------------------------------------------------------- eggs --
// The egg silhouette sits slightly bottom-heavy; spots are seeded blobs so
// every egg reads as a patterned shell rather than flat colour.
const eggShape = (x, y) => {
  if (y < 2.4 || y > 13.8) return false;
  const rw = (y - 9) * 0.045; // wider toward the bottom
  return ((x - 8) / (3.85 + rw)) ** 2 + ((y - 8.3) / 5.75) ** 2 <= 1;
};
const eggPainter = (base, spotC) => {
  const dark = mixHex(base, OUTLINE, 0.4);
  const lit = mixHex(base, '#ffffff', 0.3);
  const r = rng((base.charCodeAt(1) << 8) + (base.charCodeAt(4) || 7));
  const spots = Array.from({ length: 9 }, () => ({
    x: 4.9 + r.f() * 6.2, y: 3.6 + r.f() * 9, s: r.range(0.42, 0.9),
    c: r.f() > 0.55 ? spotC : (r.f() > 0.4 ? dark : lit),
  }));
  return (S) => item(S, [
    { color: base, n: 5, shape: eggShape },
    ...spots.map((s) => ({ color: s.c, n: 2, shape: (x, y) => Math.hypot(x - s.x, y - s.y) <= s.s && eggShape(x, y) })),
  ], { extra: [
    (px, regs, k) => { // lit rim along the shell's top-left
      const shell = regs[0];
      for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
        if (shell.has(x, y) && shell.has(x, y + 1) && !shell.has(x, y - 1)) px.set(x, y, shell.m.at(shell.m.n - 1));
      }
    } ]});
};

// Hand-picked per-mob pairs that evoke the creature: [base, spots].
const EGG_COLORS = {
  allay: ['#5fd4e8', '#2e7f96'], armadillo: ['#a88a60', '#5e4630'], axolotl: ['#f7a8c4', '#5e3d52'],
  bat: ['#6b5547', '#3a2c22'], bee: ['#e8a333', '#5a4426'], blaze: ['#f2b53a', '#b8622e'],
  bogged: ['#9aa88c', '#4c5443'], breeze: ['#bfe4ec', '#3d7f96'], camel_husk: ['#a08f6e', '#5c5340'],
  camel: ['#d8b968', '#8a7443'], cat: ['#d9a356', '#8a5a2a'], cave_spider: ['#2d4a6b', '#101c28'],
  chicken: ['#e8e4e0', '#d06a2a'], cod: ['#a88c5e', '#6b5232'], copper_golem: ['#c9856a', '#7c4c3a'],
  cow: ['#6e4a33', '#e8e2da'], creaking: ['#3a4438', '#e86a2e'], creeper: ['#61a954', '#1c3e1e'],
  dolphin: ['#6b7f99', '#d8dde4'], donkey: ['#8a6a52', '#5c4635'], drowned: ['#4a7a6e', '#223c34'],
  elder_guardian: ['#8fa6a0', '#3e5a55'], ender_dragon: ['#c44a8a', '#4a2438'], enderman: ['#241f30', '#d14ee8'],
  endermite: ['#443448', '#9a7ca6'], evoker: ['#9a9a9e', '#b89a4a'], fox: ['#d87a3a', '#e8e2da'],
  frog: ['#5e8a4e', '#a8d86b'], ghast: ['#e8e4e0', '#b0aca8'], glow_squid: ['#2e5e6b', '#5ee8c4'],
  goat: ['#c4bfb8', '#8a8580'], guardian: ['#6e8a84', '#e86a2e'], happy_ghast: ['#f0c8d8', '#c46a96'],
  hoglin: ['#c46a5e', '#7c3a30'], horse: ['#b87f4a', '#8a5c30'], husk: ['#a89a6e', '#5e5438'],
  iron_golem: ['#d0ccc8', '#e8dcc0'], llama: ['#e0d6c4', '#a09484'], magma_cube: ['#4a1c14', '#f2a83a'],
  mooshroom: ['#c44a3a', '#e8e2da'], mule: ['#5e4a3a', '#383028'], nautilus: ['#6a4e5e', '#3e2e3c'],
  ocelot: ['#d8c05e', '#a07a2a'], panda: ['#e8e4e0', '#26241f'], parched: ['#b8a878', '#7a6e4a'],
  parrot: ['#d8402e', '#2e9a4e'], phantom: ['#5e6b7f', '#32404e'], piglin_brute: ['#d8a06a', '#8a5c38'],
  piglin: ['#e8b88a', '#b97a4e'], pig: ['#f0b4a8', '#c4786e'], pillager: ['#6a7a6e', '#3e4a42'],
  polar_bear: ['#e8e8e6', '#bdbdbb'], pufferfish: ['#b8a84e', '#8a7c3a'], rabbit: ['#b87a5e', '#7e523e'],
  ravager: ['#6a5e52', '#42382e'], salmon: ['#c45e4a', '#7e382e'], sheep: ['#e8e6e3', '#cbb89a'],
  shulker: ['#8a5e8e', '#543a58'], silverfish: ['#8a8a92', '#52525a'], skeleton_horse: ['#d8d4d0', '#9c968e'],
  skeleton: ['#dededb', '#a2a2a0'], slime: ['#7ac45e', '#4a9e42'], sniffer: ['#b3545e', '#783e46'],
  snow_golem: ['#eef0f2', '#8fb8dc'], spider: ['#4e3e34', '#241c16'], squid: ['#3e4a6b', '#242c45'],
  stray: ['#bfd8d4', '#5e7a86'], strider: ['#b84a52', '#78323a'], sulfur_cube: ['#6e6a3e', '#4a482a'],
  tadpole: ['#4e463c', '#302b24'], trader_llama: ['#5ea8dd', '#e8e2da'], tropical_fish: ['#e8942e', '#3ac4c4'],
  turtle: ['#2ea37c', '#e0d6b4'], vex: ['#9aa4b4', '#5e4e6b'], villager: ['#b4906e', '#7a5c44'],
  vindicator: ['#6f7f83', '#454f52'], wandering_trader: ['#3ac4b4', '#e8e2da'], warden: ['#26424e', '#5e8296'],
  witch: ['#4e5e4a', '#b46a9e'], wither_skeleton: ['#4a443e', '#26221e'], wither: ['#3a383c', '#211f23'],
  wolf: ['#c4beb6', '#8a7a70'], zoglin: ['#c46a5e', '#3a5e36'], zombie_horse: ['#4e6b4e', '#2c402c'],
  zombie_nautilus: ['#5e6b4e', '#964e5e'], zombie: ['#59945c', '#2e562e'], zombie_villager: ['#61896a', '#3e2e48'],
  zombified_piglin: ['#e0a08c', '#4a8a3e'],
};
for (const [mob, [base, spot]] of Object.entries(EGG_COLORS)) {
  I[`${mob}_spawn_egg`] = eggPainter(base, spot);
}

// Chicken eggs ride on the same silhouette with their own colours.
I.egg = eggPainter('#e8e2d4', '#c9bfa8');
I.blue_egg = eggPainter('#7f9ec8', '#5e7aa2');
I.brown_egg = eggPainter('#b4763e', '#8a5c30');

// --------------------------------------------------------- compass / clock --
// The item model swaps whole sprites per time/angle tick, so every dial frame
// is its own small file. 0deg points the needle up (north); each frame is
// 11.25deg apart. Predicates pick the frame nearest the data, so per-frame art
// only has to be right to within half a step.
const bezel = { outer: 5.75, inner: 4.7 };
// Needle kite along an axis: direction d = (sin a, -cos a) points up at 0deg
// (north) and swings clockwise. tip part tapers from baseW to a point at the
// sum; the counterweight is slimmer and shorter.
const needlePart = (deg, len, w, forward) => (x, y) => {
  const a = deg * Math.PI / 180;
  const dx = x - 8;
  const dy = y - 8;
  const t = forward ? (dx * Math.sin(a) - dy * Math.cos(a)) : -(dx * Math.sin(a) - dy * Math.cos(a));
  const s = dx * Math.cos(a) + dy * Math.sin(a);
  if (t < 0.12 || t > len) return false;
  return Math.abs(s) <= w * (1 - t / len) + 0.16;
};
const compassFrame = (f, recovery) => {
  const deg = f * (360 / 32);
  return (S) => {
    const ring = recovery ? '#b8a8d8' : '#c98a2a';
    const face = recovery ? mixHex('#2e3050', '#5e4a8e', 0.35) : '#2e3050';
    const tip = recovery ? '#42d0c4' : '#d8483a';
    return item(S, [
      { color: ring, n: 5, shape: (x, y) => { const d = Math.hypot(x - 8, y - 8); return d >= bezel.inner && d <= bezel.outer; } },
      { color: face, n: 4, shape: (x, y) => Math.hypot(x - 8, y - 8) <= bezel.inner },
      { color: tip, n: 4, shape: needlePart(deg, 3.45, 1, true) }, // north end
      { color: '#e8e4dc', n: 3, shape: needlePart(deg, 3, 0.62, false) }, // south end, slimmer
      { color: mixHex(ring, '#ffffff', 0.4), n: 2, shape: (x, y) => Math.hypot(x - 8, y - 8) <= 0.62 }, // pivot pin
    ]);
  };
};

// Clock: golden bezel, sky face; the sun climbs the upper arc by day, the
// moon the lower by night (with a cinematic bite and a handful of stars).
const clockFrame = (f) => (S) => {
  const h = ((f / 64) * 24 + 6) % 24; // frame 0 is 06:00, one frame = 22.5 min
  const day = h >= 5.2 && h <= 18.8;
  const dl = Math.max(0, Math.min(1, (Math.abs(h - 12) - 4) / 6)); // 0 at midday .. 1 deep night
  const sky = day ? mixHex('#7fa3dd', '#4a6cb8', dl) : '#141c34';
  const isSun = day;
  const ang = (isSun ? (h - 6) / 12 : ((h + 24 - 18) % 24) / 12) * Math.PI; // east -> top -> west sweep
  const ox = 8 - 2.75 * Math.cos(ang);
  const oy = 8 - 2.75 * Math.sin(ang);
  const r = rng(77 + f);
  const stars = day ? [] : Array.from({ length: 6 }, () => ({ x: 5 + r.f() * 6, y: 5 + r.f() * 6 }));
  return item(S, [
    { color: '#c98a2a', n: 5, shape: (x, y) => { const d = Math.hypot(x - 8, y - 8); return d >= 4.85 && d <= 5.85; } },
    { color: sky, n: 4, shape: (x, y) => Math.hypot(x - 8, y - 8) <= 4.75 },
    ...(isSun ? [
      { color: '#f5d76e', n: 3, shape: (x, y) => Math.hypot(x - ox, y - oy) <= 1.35 },
      { color: '#fff3c4', n: 2, shape: (x, y) => Math.hypot(x - ox + 0.35, y - oy + 0.35) <= 0.5 },
    ] : [
      { color: '#dcdce8', n: 3, shape: (x, y) => Math.hypot(x - ox, y - oy) <= 1.25 },
      { color: '#141c34', n: 3, shape: (x, y) => Math.hypot(x - ox + 0.95, y - oy - 0.6) <= 1.02 }, // crescent bite
      ...stars.map((s) => ({ color: '#c8d4f0', n: 2, shape: (x, y) => Math.hypot(x - s.x, y - s.y) <= 0.34 })),
    ]),
  ]);
};

// Dial frame files; dir flips between item/ and the 1.8.9 items/ layout.
function extra(legacy) {
  const dir = legacy ? 'items' : 'item';
  const out = [];
  for (let f = 0; f < 32; f++) out.push([`${dir}/compass_${p2(f)}.png`, compassFrame(f, false)]);
  for (let f = 0; f < 64; f++) out.push([`${dir}/clock_${p2(f)}.png`, clockFrame(f)]);
  if (!legacy) { // recovery compass only exists in the modern range
    for (let f = 0; f < 32; f++) out.push([`item/recovery_compass_${p2(f)}.png`, compassFrame(f, true)]);
  } else {
    // 1.8.9 tinted all spawn eggs from two shared sprites: white shell + spot
    // overlay (drawn without an outline; the tint does the colouring).
    out.push([`${dir}/spawn_egg.png`, (S) => item(S, [{ color: '#e8e4dc', n: 4, shape: eggShape }])]);
    out.push([`${dir}/spawn_egg_overlay.png`, (S) => {
      const pal = palette();
      const m = pal.add(ramp('#9a9a9e', 3, { contrast: 0.3, hue: 14 }));
      const r = rng(4102);
      const spots = Array.from({ length: 14 }, () => ({ x: 4.9 + r.f() * 6.2, y: 3.6 + r.f() * 9.2, s: r.range(0.45, 0.95) }));
      const k = S / 16;
      const px = new Px(S, S, false, -1);
      for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
        const ux = (x + 0.5) / k;
        const uy = (y + 0.5) / k;
        if (!eggShape(ux, uy)) continue;
        for (const s of spots) {
          if (Math.hypot(ux - s.x, uy - s.y) <= s.s) { px.set(x, y, m.at(1 + (x + y) % 2)); break; }
        }
      }
      return px.toImage(pal.c);
    }]);
  }
  return out;
}

// ---------------------------------------------------------------- registry --
const SPECS = [
  { name: 'bucket', legacy: 'bucket' },
  { name: 'water_bucket', legacy: 'bucket_water' },
  { name: 'lava_bucket', legacy: 'bucket_lava' },
  { name: 'powder_snow_bucket', legacy: null, since: [1, 17] },
  { name: 'cod_bucket', legacy: null, since: [1, 13] },
  { name: 'salmon_bucket', legacy: null, since: [1, 13] },
  { name: 'tropical_fish_bucket', legacy: null, since: [1, 13] },
  { name: 'pufferfish_bucket', legacy: null, since: [1, 13] },
  { name: 'axolotl_bucket', legacy: null, since: [1, 17] },
  { name: 'tadpole_bucket', legacy: null, since: [1, 19] },

  { name: 'book', legacy: 'book' },
  { name: 'enchanted_book', legacy: 'book_enchanted' },
  { name: 'writable_book', legacy: 'book_writable' },
  { name: 'written_book', legacy: 'book_written' },
  { name: 'knowledge_book', legacy: null, since: [1, 13] },

  { name: 'ender_pearl', legacy: 'ender_pearl' },
  { name: 'ender_eye', legacy: 'eye_of_ender' },
  { name: 'shears', legacy: 'shears' },
  { name: 'flint_and_steel', legacy: 'flint_and_steel' },
  { name: 'fishing_rod', legacy: 'fishing_rod' },
  { name: 'fishing_rod_cast', legacy: 'fishing_rod_cast' },
  { name: 'carrot_on_a_stick', legacy: 'carrot_on_a_stick' },
  { name: 'warped_fungus_on_a_stick', legacy: null, since: [1, 16] },
  { name: 'spyglass', legacy: null, since: [1, 17] },
  { name: 'brush', legacy: null, since: [1, 20] },
  { name: 'wind_charge', legacy: null, since: [1, 20, 5] },
  { name: 'firework_rocket', legacy: 'fireworks' },
  { name: 'firework_star', legacy: 'firework_charge' },

  { name: 'oak_boat', legacy: 'boat' },
  { name: 'spruce_boat', legacy: 'boat_spruce', since: [1, 9] },
  { name: 'birch_boat', legacy: 'boat_birch', since: [1, 9] },
  { name: 'jungle_boat', legacy: 'boat_jungle', since: [1, 9] },
  { name: 'acacia_boat', legacy: 'boat_acacia', since: [1, 9] },
  { name: 'dark_oak_boat', legacy: 'boat_dark_oak', since: [1, 9] },
  { name: 'mangrove_boat', legacy: null, since: [1, 19] },
  { name: 'cherry_boat', legacy: null, since: [1, 20] },
  { name: 'pale_oak_boat', legacy: null, since: [1, 21, 4] },
  { name: 'bamboo_raft', legacy: null, since: [1, 20] },
  { name: 'oak_chest_boat', legacy: null, since: [1, 13] },
  { name: 'spruce_chest_boat', legacy: null, since: [1, 13] },
  { name: 'birch_chest_boat', legacy: null, since: [1, 13] },
  { name: 'jungle_chest_boat', legacy: null, since: [1, 13] },
  { name: 'acacia_chest_boat', legacy: null, since: [1, 13] },
  { name: 'dark_oak_chest_boat', legacy: null, since: [1, 13] },
  { name: 'mangrove_chest_boat', legacy: null, since: [1, 19] },
  { name: 'cherry_chest_boat', legacy: null, since: [1, 20] },
  { name: 'pale_oak_chest_boat', legacy: null, since: [1, 21, 4] },
  { name: 'bamboo_chest_raft', legacy: null, since: [1, 20] },

  { name: 'minecart', legacy: 'minecart' },
  { name: 'chest_minecart', legacy: 'minecart_chest' },
  { name: 'hopper_minecart', legacy: 'minecart_hopper' },
  { name: 'tnt_minecart', legacy: 'minecart_tnt' },
  { name: 'furnace_minecart', legacy: 'minecart_furnace' },
  { name: 'command_block_minecart', legacy: 'minecart_command_block' },

  { name: 'totem_of_undying', legacy: 'totem', since: [1, 11] },
  { name: 'name_tag', legacy: 'name_tag' },
  { name: 'saddle', legacy: 'saddle' },

  { name: 'egg', legacy: 'egg' },
  { name: 'blue_egg', legacy: null, since: [1, 21, 5] },
  { name: 'brown_egg', legacy: null, since: [1, 21, 5] },
  ...Object.keys(EGG_COLORS).map((m) => ({ name: `${m}_spawn_egg`, legacy: null })),
];

module.exports = { I, ITEM_SPECS: SPECS, extra };


