// Copper builds (grates, bulbs, chains, lanterns, bars, torches), trial
// chambers (spawners, vault, heavy core) and the Winter Drop (pale moss,
// creaking heart, resin). Same rules as the other art files: limited
// hue-shifted palettes, top-left light, no lone pixels, original procedural
// art. Waxed blocks are not shipped: the game's modern models already point
// them at the unwaxed texture. Bulb "powered" faces reuse the unlit texture
// the way vanilla models do, so no duplicate art is generated.
const { Px, ramp, rng, Image, despeckle } = require('./lib');

const T = {};
const I = {};
const ITEM_SPECS = [];
const isP = (st) => st === 'looks';
const kOf = (S) => S / 16;

// Oxidation ladder: copper -> exposed (brown) -> weathered -> oxidized
// (green). Each step keeps the same value curve, only the hue drifts.
const OX = [
  ['', '#c26b4a'],
  ['exposed_', '#ad7a5f'],
  ['weathered_', '#7d9d78'],
  ['oxidized_', '#4f9a6f'],
];

// ------------------------------------------------------------ copper bits --
/** Diagonal lattice: clear holes, lit struts above a hole, shaded below. */
function lattice(S, st, color) {
  const k = kOf(S);
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = ramp(color, n, { contrast: 0.34, hue: 12 });
  const mid = n - 2;
  const px = new Px(S, S, true, 0);
  const hole = (x, y) => ((((x - y) % (2 * k)) + 2 * k) % (2 * k)) < k;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px.set(x, y, hole(x, y) ? -1 : mid);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (px.get(x, y) < 0) continue;
    if (px.get(x - 1, y) < 0 || px.get(x, y - 1) < 0) px.set(x, y, n - 1);
    else if (px.get(x + 1, y) < 0 || px.get(x, y + 1) < 0) px.set(x, y, Math.max(0, mid - 1));
  }
  return { px, pal };
}
for (const [pre, color] of OX) {
  T[`${pre}copper_grate`] = (S, st) => {
    const { px, pal } = lattice(S, st, color);
    return px.toImage(pal);
  };
}

/** Copper bulb: a lattice frame around a core that is dark or glowing. */
function bulb(S, st, color, lit) {
  const k = kOf(S);
  const P = isP(st);
  const n = P ? 6 : 4;
  const c0 = 4 * k;
  const w = 8 * k;
  const pal = ramp(color, n, { contrast: 0.34, hue: 12 });
  const glow = ramp('#ffe08a', P ? 5 : 3, { contrast: 0.3, hue: 6 });
  const px = new Px(S, S, true, 0);
  const hole = (x, y) => ((((x - y) % (2 * k)) + 2 * k) % (2 * k)) < k;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px.set(x, y, hole(x, y) ? -1 : n - 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (px.get(x, y) < 0) continue;
    if (px.get(x - 1, y) < 0 || px.get(x, y - 1) < 0) px.set(x, y, n - 1);
    else if (px.get(x + 1, y) < 0 || px.get(x, y + 1) < 0) px.set(x, y, Math.max(0, n - 3));
  }
  if (lit) {
    for (let y = c0; y < c0 + w; y++) for (let x = c0; x < c0 + w; x++) {
      const d = Math.max(Math.abs(x - 8 * k) / (4 * k), Math.abs(y - 8 * k) / (4 * k));
      px.set(x, y, d < 0.32 ? glow.length - 1 : d < 0.62 ? glow.length - 2 : glow.length - 3);
    }
  } else {
    for (let y = c0; y < c0 + w; y++) for (let x = c0; x < c0 + w; x++) {
      px.set(x, y, ((x + y) % (4 * k)) < 2 * k ? n - 2 : Math.max(0, n - 4));
    }
  }
  for (let i = c0 - 1; i <= c0 + w; i++) {
    px.set(i, c0 - 1, n - 1);
    px.set(c0 - 1, i, n - 1);
  }
  // bulbs are full opaque cubes: darken the lattice holes instead of leaving
  // transparent pixels (a hole would show as a see-through spot in game)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (px.get(x, y) < 0) px.set(x, y, 0);
  const img = px.toImage(lit ? [...pal, ...glow] : pal);
  if (lit) {
    img.emissive = () => new Image(S).fill((x, y) =>
      (x >= c0 && x < c0 + w && y >= c0 && y < c0 + w) ? [255, 224, 138, 255] : [0, 0, 0, 0]);
  }
  return img;
}
for (const [pre, color] of OX) {
  const off = (S, st) => bulb(S, st, color, false);
  const on = (S, st) => bulb(S, st, color, true);
  T[`${pre}copper_bulb`] = off;
  T[`${pre}copper_bulb_powered`] = off;
  T[`${pre}copper_bulb_lit`] = on;
  T[`${pre}copper_bulb_lit_powered`] = on;
}

/** Loose chain: a centre rod with two oval link rings. */
function chain(S, st) {
  const k = kOf(S);
  const P = isP(st);
  const pal = ramp('#b3714d', P ? 5 : 4, { contrast: 0.4, hue: 10 });
  const hi = pal.length - 1;
  const px = new Px(S, S, false, -1);
  for (let y = 0; y < S; y++) for (let x = 7 * k; x < 9 * k; x++) px.set(x, y, x < 8 * k ? hi : 1);
  for (const cy of [4.5 * k, 11.5 * k]) {
    const rx = 3 * k;
    const ry = 3.4 * k;
    for (let y = -4 * k; y < 4 * k; y++) for (let x = -3.4 * k; x < 3.4 * k; x++) {
      const d = (x / rx) ** 2 + (y / ry) ** 2;
      if (d > 1) continue;
      if ((x / (rx - k)) ** 2 + (y / (ry - k)) ** 2 <= 1) continue;
      px.set(Math.round(8 * k - k / 2 + x), Math.round(cy + y), x + y < 0 ? hi : 2);
    }
  }
  return px.toImage(pal);
}
for (const [pre] of OX) {
  T[`${pre}copper_chain`] = chain;
  const name = `${pre}copper_chain`;
  I[name] = chain;
  ITEM_SPECS.push({ name, legacy: null, since: [1, 21, 9] });
}

/** Lantern: a handle, a caged body and a warm glow box with slats. */
function lantern(S, st) {
  const k = kOf(S);
  const P = isP(st);
  const pal = ramp('#b3714d', P ? 5 : 4, { contrast: 0.42, hue: 10 });
  const hi = pal.length - 1;
  const glow = ramp('#f8d271', 2, { contrast: 0.25, hue: 8 });
  const n = pal.length;
  const px = new Px(S, S, false, -1);
  for (let x = 6 * k; x < 10 * k; x++) { px.set(x, k, 1); px.set(x, 2 * k, 0); } // handle
  px.rect(5 * k, 5 * k, 6 * k, 10 * k, n - 2); // body frame
  px.rect(6 * k, 6 * k, 4 * k, 8 * k, glow[0]); // glass box
  for (let y = 8 * k; y < 13 * k; y += 3 * k) for (let x = 6 * k; x < 10 * k; x++) px.set(x, y, 1); // slats
  for (let y = 6 * k; y < 14 * k; y++) px.set(8 * k, y, 1); // spine
  for (let x = 5 * k; x < 11 * k; x++) { px.set(x, 5 * k, hi); px.set(x, 14 * k, 0); } // rims
  const img = px.toImage([...pal, ...glow]);
  img.emissive = () => new Image(S).fill((x, y) => (x >= 6 * k && x < 10 * k && y >= 6 * k && y < 14 * k) ? [248, 210, 113, 255] : [0, 0, 0, 0]);
  return img;
}
for (const [pre] of OX) {
  T[`${pre}copper_lantern`] = lantern;
  const name = `${pre}copper_lantern`;
  I[name] = lantern;
  ITEM_SPECS.push({ name, legacy: null, since: [1, 21, 9] });
}

/** Bars: two vertical rods and one horizontal tie across them. */
function bars(S, st) {
  const k = kOf(S);
  const P = isP(st);
  const pal = ramp('#b3714d', P ? 5 : 4, { contrast: 0.4, hue: 10 });
  const hi = pal.length - 1;
  const px = new Px(S, S, false, -1);
  for (const x0 of [2 * k, 10 * k]) {
    for (let y = 0; y < S; y++) for (let x = x0; x < x0 + 3 * k; x++) px.set(x, y, x < x0 + k ? hi : 2);
  }
  px.rect(2 * k, 7 * k, 11 * k, 2 * k, 1);
  for (let x = 2 * k; x < 13 * k; x++) px.set(x, 7 * k, 0);
  return px.toImage(pal);
}
for (const [pre] of OX) T[`${pre}copper_bars`] = bars;

/** Torch: a wooden body, a copper head and a bright tip. */
function torch(S, st) {
  const k = kOf(S);
  const P = isP(st);
  const wood = ramp('#8f6a45', P ? 5 : 3, { contrast: 0.4, hue: 10 });
  const cop = ramp('#c26b4a', P ? 5 : 4, { contrast: 0.4, hue: 10 });
  const glow = ramp('#ffe7a1', P ? 4 : 3, { contrast: 0.3, hue: 10 });
  const wOff = 0;
  const cOff = wood.length;
  const gOff = wood.length + cop.length;
  const px = new Px(S, S, false, -1);
  for (let y = 8 * k; y < S; y++) { px.set(7 * k, y, wOff + 1); px.set(8 * k, y, wOff + 2); } // stick
  px.rect(6 * k, 5 * k, 3 * k, 3 * k, cOff + (P ? 3 : 1)); // copper head
  px.rect(6 * k, 5 * k, 1, 3 * k, cOff + cop.length - 1); // lit left edge
  px.rect(7 * k, 6 * k, 1.6 * k | 0, 1.4 * k | 0, gOff + glow.length - 1); // bright tip
  const img = px.toImage([...wood, ...cop, ...glow]);
  img.emissive = () => new Image(S).fill((x, y) =>
    (x >= 7 * k && x < 9 * k && y >= 6 * k && y < 8 * k) ? [255, 231, 161, 255] : [0, 0, 0, 0]);
  return img;
}

T.copper_torch = torch;
I.copper_torch = torch;
ITEM_SPECS.push({ name: 'copper_torch', legacy: null, since: [1, 21, 9] });

// ---------------------------------------------------------- trial chamber --
// Spawner states and their glow colours (shared by the ominous twins).
const SPOUT = new Map([
  ['_inactive', null],
  ['_active', '#d9642b'],
  ['_ejecting', '#f2a83d'],
]);

/** Pocked stone shell reused by every spawner face. */
function spawnerShell(S, st) {
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = ramp('#75736e', n, { contrast: 0.3, hue: 8 });
  const r = rng(730);
  const px = new Px(S, S, true, 0);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px.set(x, y, r.pick(P ? [1, 2, 2, 3] : [1, 2, 1]));
  despeckle(px);
  const m = pal.length;
  for (let i = 0; i < S; i++) { px.set(i, 0, m - 1); px.set(0, i, m - 1); px.set(i, S - 1, 0); px.set(S - 1, i, 0); }
  return { px, pal };
}
function spawnerWindow(S, st, px, pal, glowCol, sparkles) {
  const k = kOf(S);
  const P = isP(st);
  const c0 = 4 * k;
  const w = 8 * k;
  const eye = glowCol ? ramp(glowCol, P ? 5 : 3, { contrast: 0.35, hue: 10 }) : ramp('#2c2b30', 3, { contrast: 0.3, hue: 8 });
  px.rect(c0, c0, w, w, glowCol ? (x, y) => {
    const d = Math.max(Math.abs(x - 8 * k) / (4 * k), Math.abs(y - 8 * k) / (4 * k));
    return d < 0.35 ? eye.length - 1 : d < 0.7 ? eye.length - 2 : eye.length - 3;
  } : 2);
  if (sparkles) { // ejecting: four sparks flying out
    const g = eye.length - 1;
    for (const [sx, sy] of [[c0, c0 - 2 * k], [c0 + w - k, c0 - 2 * k], [c0, c0 + w + k], [c0 + w - k, c0 + w + k]]) px.rect(Math.round(sx), Math.round(sy), k, k, g);
  }
  const img = px.toImage(glowCol ? [...pal, ...eye] : pal);
  if (glowCol) {
    const g = glowCol === '#d9642b' ? [217, 100, 43, 255] : [242, 168, 61, 255];
    img.emissive = () => new Image(S).fill((x, y) => (x >= c0 && x < c0 + w && y >= c0 && y < c0 + w) ? g : [0, 0, 0, 0]);
  }
  return img;
}

for (const [tag, glow] of SPOUT) {
  T[`trial_spawner_side${tag}`] = (S, st) => {
    const { px, pal } = spawnerShell(S, st);
    return spawnerWindow(S, st, px, pal, glow, tag === '_ejecting');
  };
  T[`trial_spawner_top${tag}`] = (S, st) => {
    // solid lid with cooling slats and a small glowing vent
    const { px, pal } = spawnerShell(S, st);
    const k = kOf(S);
    const m = pal.length;
    for (let y = 2 * k; y < S - 2 * k; y += 2 * k) for (let x = 2 * k; x < S - 2 * k; x++) px.set(x, y, Math.max(0, m - 2));
    return spawnerWindow(S, st, px, pal, glow && '#6a5747', false); // tops stay dim even when active
  };
  T[`trial_spawner_side${tag}_ominous`] = T[`trial_spawner_side${tag}`];
  T[`trial_spawner_top${tag}_ominous`] = T[`trial_spawner_top${tag}`];
}
T.trial_spawner_bottom = (S, st) => {
  const { px, pal } = spawnerShell(S, st);
  return px.toImage(pal);
};
// the top "ejecting reward" faces simply share the ejecting top
T.trial_spawner_top_ejecting_reward = T.trial_spawner_top_ejecting;
T.trial_spawner_top_ejecting_reward_ominous = T.trial_spawner_top_ejecting;

/** Vault: brass cage with a lock plate on the front faces. */
function vault(S, st, kind) {
  const k = kOf(S);
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = ramp('#8d6d3c', n, { contrast: 0.35, hue: 9 });
  const m = pal.length;
  const px = new Px(S, S, false, -1);
  if (kind === 'top' || kind === 'bottom') {
    px.rect(0, 0, S, S, (x, y) => (x + y) % (4 * k) < 2 * k ? m - 2 : Math.max(0, m - 4));
  } else {
    // vertical cage slats over a dark interior, framed
    px.rect(0, 0, S, S, 0);
    for (let x = k; x < S - k; x += 2 * k) for (let y = k; y < S - k; y++) for (let i = 0; i < k; i++) px.set(x + i, y, m - 2);
    for (let i = 0; i < S; i++) { px.set(i, 0, m - 1); px.set(0, i, m - 1); px.set(i, S - 1, 0); px.set(S - 1, i, 0); }
  }
  if (kind.startsWith('front')) { // lock plate with a glowing keyhole
    const gl = ramp(kind === 'front_ejecting' ? '#ffd66b' : '#f6e2b0', P ? 5 : 3, { contrast: 0.3, hue: 6 });
    const c0 = 5 * k;
    const w = 6 * k;
    px.rect(c0, c0, w, w, gl.length - 1);
    px.rect(c0 + k, c0 + k, w - 2 * k, w - 2 * k, 1);
    px.rect(Math.round(c0 + 2.4 * k), Math.round(c0 + 2.2 * k), Math.round(1.2 * k), Math.round(1.6 * k), gl.length - 1);
    const img = px.toImage([...pal, ...gl]);
    const bright = kind === 'front_ejecting';
    const keyhole = bright ? [255, 255, 255, 255] : [246, 226, 176, 255];
    img.emissive = () => new Image(S).fill((x, y) =>
      (x >= c0 + 2.4 * k && x < c0 + 3.6 * k && y >= c0 + 2.2 * k && y < c0 + 3.8 * k) ? keyhole : [0, 0, 0, 0]);
    return img;
  }
  return px.toImage(pal);
}
T.vault_side_on = (S, st) => vault(S, st, 'side_on');
T.vault_side_off = (S, st) => vault(S, st, 'side_off');
T.vault_front_on = (S, st) => vault(S, st, 'front_on');
T.vault_front_off = (S, st) => vault(S, st, 'front_off');
T.vault_front_ejecting = (S, st) => vault(S, st, 'front_ejecting');
T.vault_top = (S, st) => vault(S, st, 'top');
T.vault_bottom = (S, st) => vault(S, st, 'bottom');
T.vault_side_on_ominous = T.vault_side_on;
T.vault_side_off_ominous = T.vault_side_off;
T.vault_front_on_ominous = T.vault_front_on;
T.vault_front_off_ominous = T.vault_front_off;
T.vault_front_ejecting_ominous = T.vault_front_ejecting;
T.vault_top_ominous = T.vault_top;
T.vault_bottom_ominous = T.vault_bottom;

/** Heavy core: a near-black disc under a gold ring inside a stone plate. */
T.heavy_core = (S, st) => {
  const k = kOf(S);
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = ramp('#4a4652', n, { contrast: 0.45, hue: 8 });
  const gold = ramp('#d9c36a', P ? 4 : 3, { contrast: 0.3, hue: 8 });
  const gMid = pal.length;
  const mid = S / 2;
  const px = new Px(S, S, true, 0);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px.set(x, y, (x + y) % (4 * k) < 2 * k ? 1 : 2);
  despeckle(px);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + .5 - mid, y + .5 - mid);
    if (d < 4.6 * k) px.set(x, y, d > 3.4 * k ? (x + y < mid * 2 ? gMid : gMid + gold.length - 1) : d > 2.6 * k ? n - 1 : 0);
  }
  return px.toImage([...pal, ...gold]);
};

// --------------------------------------------------------- the winter drop --
/** Pale moss: cream-green clumps over a stone-grey base. */
function moss(S, st, seed) {
  const P = isP(st);
  const r = rng(seed);
  const n = P ? 6 : 4;
  const pal = ramp('#9fb392', n, { contrast: 0.3, hue: 14 });
  const px = new Px(S, S, true, 0).fill(() => r.pick(P ? [1, 2, 2, 3, 3, 4] : [1, 2, 1, 2]));
  despeckle(px);
  return px.toImage(pal);
}
T.pale_moss_block = (S, st) => moss(S, st, 710);
T.pale_moss_carpet = (S, st) => moss(S, st, 711);
T.pale_moss_carpet_side_small = (S, st) => moss(S, st, 711);
T.pale_moss_carpet_side_tall = (S, st) => moss(S, st, 712);
// hanging moss: a tapering strand that drips from a ceiling; the tip is
// thinner and slightly darker
T.pale_hanging_moss = (S, st) => hangingMoss(S, st, 713, 1);
T.pale_hanging_moss_tip = (S, st) => hangingMoss(S, st, 714, 0.7);

function hangingMoss(S, st, seed, thin) {
  const k = kOf(S);
  const P = isP(st);
  const pal = ramp('#b6c4a4', P ? 6 : 4, { contrast: 0.35, hue: 14 });
  const hi = pal.length - 1;
  const px = new Px(S, S, false, -1);
  // a cushion hugging the ceiling, thin strands dropping to the bottom
  px.rect(4 * k, 0, 8 * k, 5 * k, 1);
  for (let i = 0; i < (thin < 1 ? 3 : 4); i++) {
    const x = Math.round((4 + 1.6 * (i + 1)) * k);
    const len = Math.round((6 + 2 * ((i * 7) % 3)) * k * thin);
    for (let y = 5 * k; y < 5 * k + len; y++) px.set(x, y, 1);
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (px.get(x, y) < 0) continue;
    if (px.get(x, y - 1) < 0) px.set(x, y, hi);
    else if (px.get(x, y + 1) < 0) px.set(x, y, 0);
  }
  return px.toImage(pal);
}

/** Creaking heart: pale bark boards and a carved eye per state. */
function creakingHeart(S, st, state, top) {
  const k = kOf(S);
  const P = isP(st);
  const n = P ? 6 : 4;
  const pal = ramp('#cfc7de', n, { contrast: 0.28, hue: -6 });
  const px = new Px(S, S, true, 0);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    px.set(x, y, top
      ? (Math.hypot(x - S / 2, y - S / 2) < 3.6 * k ? n - 2 : (x + y) % (4 * k) < 2 * k ? 1 : 2)
      : ((y % (4 * k)) < 2 * k ? 1 : 2));
  }
  despeckle(px);
  if (!top) { // the eye lives on the side faces only
    const ex = 8 * k;
    const ey = 8 * k;
    const rx = 4 * k;
    const ry = 3 * k;
    const ink = state === 'awake' ? ramp('#8fe8b7', P ? 4 : 3, { contrast: 0.3, hue: 10 })
      : ramp('#6e6a74', 3, { contrast: 0.25, hue: 4 });
    for (let y = -Math.ceil(ry); y <= ry; y++) for (let x = -Math.ceil(rx); x <= rx; x++) {
      const d = (x / rx) ** 2 + (y / ry) ** 2;
      if (d > 1) continue;
      if ((x / (rx - k)) ** 2 + (y / (ry - k)) ** 2 <= 1) continue;
      px.set(Math.round(ex + x), Math.round(ey + y), ink.length - 1);
    }
    if (state === 'awake' || state === 'base') {
      for (let y = -k; y < k; y++) for (let x = -k; x < k; x++) {
        if (x * x + y * y <= k * k) px.set(Math.round(ex + x), Math.round(ey + y), ink[1]);
      }
    }
  }
  return px.toImage(pal);
}
T.creaking_heart = (S, st) => creakingHeart(S, st, 'base', false);
T.creaking_heart_top = (S, st) => creakingHeart(S, st, 'base', true);
T.creaking_heart_awake = (S, st) => creakingHeart(S, st, 'awake', false);
T.creaking_heart_top_awake = (S, st) => creakingHeart(S, st, 'awake', true);
T.creaking_heart_dormant = (S, st) => creakingHeart(S, st, 'dormant', false);
T.creaking_heart_top_dormant = (S, st) => creakingHeart(S, st, 'dormant', true);

/** Resin: amber clumps, brick bonds and a chiseled variant. */
function rect(px, x, y, w, h, v) {
  for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) px.set(i, j, v);
}
function resinBricks(S, st, seed, chiseled) {
  const k = kOf(S);
  const P = isP(st);
  const n = P ? 6 : 4;
  const mort = ramp('#7d3c14', 2, { contrast: 0.25, hue: 6 });
  const pal = ramp('#e0681d', n, { contrast: 0.4, hue: 12 });
  const px = new Px(S, S, true, 0);
  const bonds = [];
  for (let row = 0; row < 4; row++) {
    const y = row * 4 * k;
    for (let x = (row % 2 ? 3 : 0) * k; x < S; x += 6 * k) bonds.push([x, y]);
  }
  for (const [bx, by] of bonds) rect(px, bx, by, 5 * k, 3 * k, mort[0] ? mort[0] : 0);
  for (const [bx, by] of bonds) rect(px, bx, by + .5 * k, 4 * k, 2 * k, P ? 3 : 2); // brick faces
  for (const [bx, by] of bonds) rect(px, bx + k, by + .5 * k, 3 * k, k, P ? 4 : 3); // lit top faces
  if (chiseled) rect(px, 5 * k, 6 * k, 6 * k, k, n - 1); // carved band
  const r = rng(seed);
  for (let i = 0; i < (P ? 14 : 7); i++) {
    const fact = bonds[Math.floor(r.f() * bonds.length)];
    px.bump(Math.round(fact?.[0] ?? 0) + Math.floor(r.f() * 4 * k), Math.round(fact?.[1] ?? 0) + k + Math.floor(r.f() * 2 * k), 1, 0, n - 1);
  }
  despeckle(px);
  return px.toImage([...mort, ...pal]);
}
T.resin_bricks = (S, st) => resinBricks(S, st, 712, false);
T.chiseled_resin_bricks = (S, st) => resinBricks(S, st, 713, true);
T.resin_block = (S, st) => {
  const r = rng(714);
  const n = isP(st) ? 6 : 4;
  const pal = ramp('#e0681d', n, { contrast: 0.4, hue: 12 });
  const px = new Px(S, S, true, 0).fill(() => r.pick(isP(st) ? [1, 2, 2, 3, 3, 4] : [1, 2, 1, 2]));
  despeckle(px);
  return px.toImage(pal);
};
const resinClump = (S, st) => {
  const k = kOf(S);
  const P = isP(st);
  const pal = ramp('#e0681d', P ? 5 : 4, { contrast: 0.42, hue: 12 });
  const px = new Px(S, S, false, -1);
  for (const [cx, cy, r] of [[6, 9, 2.4], [10, 6, 2.8], [4, 5, 2], [11, 11, 2.2]]) {
    for (let y = -Math.ceil(r * k); y < Math.ceil(r * k); y++) for (let x = -Math.ceil(r * k); x < Math.ceil(r * k); x++) {
      if (x * x + y * y >= (r * k) ** 2) continue;
      px.set(Math.round(cx * k + x), Math.round(cy * k + y), x + y < 0 ? pal.length - 1 : x + y < k ? P ? 2 : 1 : 0);
    }
  }
  return px.toImage(pal);
};
T.resin_clump = resinClump;
I.resin_clump = resinClump;
ITEM_SPECS.push({ name: 'resin_clump', legacy: null, since: [1, 21, 4] });
I.resin_brick = (S, st) => {
  const k = kOf(S);
  const P = isP(st);
  const pal = ramp('#e0681d', P ? 5 : 4, { contrast: 0.42, hue: 12 });
  const px = new Px(S, S, false, -1);
  rect(px, 3 * k, 6 * k, 10 * k, 4 * k, P ? 3 : 2);
  rect(px, 3 * k, 6 * k, 10 * k, k, P ? 4 : 3);
  rect(px, 3 * k, 9 * k, 10 * k, k, 0);
  return px.toImage(pal);
};
ITEM_SPECS.push({ name: 'resin_brick', legacy: null, since: [1, 21, 4] });

module.exports = { T, I, ITEM_SPECS };
