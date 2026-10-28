// Original 16x16 pixel textures for the optional Minecraft style, painted
// procedurally at runtime. One art direction for every material: tileable
// two-octave value noise quantised onto short hue-shifted ramps (cool
// shadows, warm highlights), clustered rather than per-pixel static, plus a
// little structure per material. Nothing here is copied from Mojang assets.

const N = 16;

// --------------------------------------------------------------- helpers --
function hash(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
/** Value noise that wraps every 16 px so textures tile without seams. */
function vnoise(x, y, cell, seed) {
  const period = N / cell;
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smooth(gx - x0);
  const ty = smooth(gy - y0);
  const w = (v) => ((v % period) + period) % period;
  const v = (i, j) => hash(w(i), w(j), seed);
  return lerp(lerp(v(x0, y0), v(x0 + 1, y0), tx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), tx), ty);
}
/** Clustered noise in 0..1: broad blotches plus fine grain. */
function field(x, y, seed, grain = 0.35) {
  return vnoise(x, y, 8, seed) * 0.4 + vnoise(x, y, 4, seed + 7) * (0.6 - grain) + hash(x, y, seed + 13) * grain;
}
const pick = (ramp, t) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];

function canvas(w = N, h = N) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function paint(draw) {
  const c = canvas();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const px = (x, y, hex, a = 255) => {
    if (x < 0 || y < 0 || x >= N || y >= N || !hex) return;
    const i = (y * N + x) * 4;
    const n = parseInt(hex.slice(1, 7), 16);
    img.data[i] = n >> 16;
    img.data[i + 1] = (n >> 8) & 255;
    img.data[i + 2] = n & 255;
    img.data[i + 3] = a;
  };
  draw(px);
  ctx.putImageData(img, 0, 0);
  return c;
}

const fill = (px, ramp, seed, grain = 0.35, bias = 0) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) px(x, y, pick(ramp, field(x, y, seed, grain) + bias));
};

// ----------------------------------------------------------------- ramps --
// dark -> light, hue shifted towards blue/purple in the shadows
export const RAMPS = {
  dirt: ['#3f2a22', '#55372a', '#6c4631', '#82573a', '#966945'],
  grass: ['#2e5a2c', '#3c7330', '#4c8a33', '#5ea13a', '#79b947'],
  stone: ['#4a4a52', '#58585f', '#66666b', '#727277', '#808084'],
  // darker stone for buttons keeps white text above 4.5:1 on every pixel
  stoneBtn: ['#38383f', '#414148', '#4a4a50', '#525258', '#5b5b60'],
  stoneBtnHi: ['#43434b', '#4d4d55', '#56565d', '#5f5f66', '#68686d'],
  oak: ['#5b3d24', '#6f4c2b', '#845c33', '#99703e', '#ad834b'],
  darkOak: ['#251812', '#2e1f16', '#38261a', '#422e1f', '#4c3624'],
  darkOakHi: ['#2e1f16', '#38271b', '#433020', '#4d3825', '#58412b'],
  bark: ['#2f2219', '#3d2b1d', '#4c3724', '#5c432c', '#6d5236'],
  ring: ['#8a6a3e', '#a07c49', '#b48f58', '#c7a268'],
  leaves: ['#1d4620', '#285a28', '#336e2f', '#408438', '#549a45'],
  water: ['#1f3f9a', '#2850b0', '#3263c6', '#4278d6', '#5f93e6'],
  sand: ['#b59c68', '#c6ae77', '#d4bd86', '#e0cb95', '#ead8a6'],
  snow: ['#cdd8e6', '#dde6f0', '#ebf1f8', '#f7fafd'],
  netherrack: ['#3d1016', '#511519', '#661d1f', '#7c2826', '#923632'],
  nylium: ['#5c0b1a', '#7a1020', '#951a25', '#b0282c', '#c93b35'],
  wart: ['#4f0911', '#690e16', '#83141b', '#9c1d21', '#b42b2a'],
  stem: ['#3a1730', '#4a1e3b', '#5c2747', '#6e3153', '#813d60'],
  lava: ['#b23305', '#d24e0a', '#ea6c12', '#f8901f', '#ffbd45', '#ffe08a'],
  glow: ['#7a5a26', '#a87a33', '#d29f45', '#efc461', '#ffe596'],
  basalt: ['#1d1b22', '#26232b', '#302c36', '#3a3541', '#46404d'],
  endstone: ['#a39e6b', '#b7b27c', '#c9c48c', '#d9d59d', '#e6e3ae'],
  obsidian: ['#0b0814', '#130d22', '#1b1330', '#251a42', '#35265c'],
  purpur: ['#6f4579', '#82548d', '#9466a0', '#a679b2', '#b98dc3'],
  chorus: ['#3e2449', '#50305c', '#653f72', '#7b5089', '#9466a3'],
  bloom: ['#8c6c9e', '#a586b6', '#bfa1cd', '#d7bfe2'],
  amethyst: ['#3b2268', '#4f2f88', '#6743a6', '#8460c4', '#a684de'],
  redstone: ['#5a0d0b', '#7c140f', '#9e1d14', '#c02a1c', '#de4a33'],
  emerald: ['#0c4f2c', '#13703c', '#1b914c', '#2cb262', '#5ad388'],
  diamond: ['#1b5a63', '#24808a', '#33a6ad', '#56c9cb', '#9be8e3'],
  gold: ['#7a5410', '#a37214', '#c99320', '#e6b53a', '#f8d871'],
  night: ['#1a1b33', '#23254a', '#2e3260', '#3b4176', '#4b538c'],
  copper: ['#6e3a24', '#8c4a2c', '#a95d36', '#c27144', '#d88a59'],
};

// ------------------------------------------------------------- painters --
const P = {};

P.dirt = (px) => {
  fill(px, RAMPS.dirt, 11, 0.4);
  // a few pebbles: light pixel with a dark shadow underneath
  for (const [x, y] of [[3, 4], [11, 2], [7, 10], [13, 12], [1, 13]]) { px(x, y, RAMPS.dirt[4]); px(x, y + 1, RAMPS.dirt[0]); }
};

P.grass_top = (px) => {
  fill(px, RAMPS.grass, 21, 0.45);
  for (const [x, y] of [[2, 3], [9, 1], [13, 7], [5, 11], [10, 13], [1, 9], [14, 14]]) { px(x, y, RAMPS.grass[4]); px(x, y + 1, RAMPS.grass[3]); }
};

P.grass_side = (px) => {
  P.dirt(px);
  for (let x = 0; x < N; x++) {
    const depth = 3 + Math.floor(hash(x, 0, 31) * 2.2) + (hash(x, 1, 32) > 0.82 ? 2 : 0);
    for (let y = 0; y < depth; y++) px(x, y, pick(RAMPS.grass, field(x, y, 21, 0.4) * 0.85 + (y === 0 ? 0.2 : 0)));
    px(x, depth, RAMPS.grass[0]); // shadowed lip where grass meets dirt
  }
};

P.stone = (px, ramp = RAMPS.stone, seed = 41) => {
  fill(px, ramp, seed, 0.3);
  // short hairline cracks
  for (const [x, y, dx, dy, n] of [[2, 3, 1, 1, 3], [10, 6, 1, -1, 3], [5, 12, 1, 0, 3], [13, 11, 0, 1, 2]]) {
    for (let i = 0; i < n; i++) px(x + dx * i, y + dy * i, ramp[0]);
  }
};
P.stone_btn = (px) => P.stone(px, RAMPS.stoneBtn, 43);
P.stone_btn_hi = (px) => P.stone(px, RAMPS.stoneBtnHi, 43);

function planks(px, ramp, seed) {
  for (let y = 0; y < N; y++) {
    const board = y >> 2;
    for (let x = 0; x < N; x++) {
      // grain: noise stretched along the board
      const g = vnoise(x * 0.25 + board * 3, y * 2, 4, seed) * 0.6 + hash(x, y, seed + 3) * 0.25 + 0.12;
      px(x, y, (y & 3) === 3 ? ramp[0] : pick(ramp, g));
    }
    // butt joints, staggered per board
    if ((y & 3) !== 3) px((board * 7 + 3) % N, y, ramp[0]);
  }
  for (let b = 0; b < 4; b++) px((b * 7 + 4) % N, b * 4, ramp[4]);
}
P.planks = (px) => planks(px, RAMPS.oak, 51);
P.wood_btn = (px) => planks(px, RAMPS.darkOak, 53);
P.wood_btn_hi = (px) => planks(px, RAMPS.darkOakHi, 53);

P.log_side = (px) => {
  for (let x = 0; x < N; x++) {
    const col = hash(x, 0, 61);
    for (let y = 0; y < N; y++) {
      const v = vnoise(x * 3, y * 0.5, 4, 62) * 0.5 + col * 0.35 + hash(x, y, 63) * 0.15;
      px(x, y, pick(RAMPS.bark, x % 4 === 0 ? v * 0.4 : v));
    }
  }
  px(5, 7, RAMPS.bark[0]); px(6, 7, RAMPS.bark[0]); px(5, 8, RAMPS.bark[4]);
};

P.log_top = (px) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) px(x, y, pick(RAMPS.bark, hash(x, y, 71) * 0.7 + 0.2));
    else px(x, y, RAMPS.ring[Math.floor(d) % 2 ? 1 : 2 + (hash(x, y, 72) > 0.8 ? 1 : 0)]);
  }
};

P.leaves = (px) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = field(x, y, 81, 0.55);
    px(x, y, v < 0.12 ? '#132f19' : pick(RAMPS.leaves, v * 0.9 + 0.1));
  }
};

P.water = (px) => {
  fill(px, RAMPS.water, 91, 0.15);
  for (const [x, y, n] of [[1, 3, 4], [9, 6, 5], [4, 11, 4], [11, 13, 3]]) for (let i = 0; i < n; i++) px((x + i) % N, y, RAMPS.water[4]);
};

P.sand = (px) => {
  fill(px, RAMPS.sand, 101, 0.5);
  for (const [x, y] of [[4, 2], [12, 5], [2, 10], [9, 12], [14, 9]]) px(x, y, RAMPS.sand[0]);
};

P.snow = (px) => fill(px, RAMPS.snow, 111, 0.3, 0.1);

P.netherrack = (px) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const vein = Math.abs(Math.sin((x + vnoise(x, y, 4, 121) * 6) * 0.9 + y * 0.45));
    px(x, y, vein < 0.16 ? RAMPS.netherrack[0] : pick(RAMPS.netherrack, field(x, y, 122, 0.45)));
  }
};

P.nylium_top = (px) => {
  fill(px, RAMPS.nylium, 131, 0.5);
  for (const [x, y] of [[3, 3], [11, 4], [7, 9], [2, 12], [13, 13]]) px(x, y, RAMPS.nylium[4]);
};

P.nylium_side = (px) => {
  P.netherrack(px);
  for (let x = 0; x < N; x++) {
    const depth = 2 + Math.floor(hash(x, 0, 133) * 3);
    for (let y = 0; y < depth; y++) px(x, y, pick(RAMPS.nylium, field(x, y, 131, 0.4)));
  }
};

P.wart = (px) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = field(x, y, 141, 0.5);
    px(x, y, pick(RAMPS.wart, v));
  }
  for (const [x, y] of [[4, 4], [11, 3], [7, 11], [13, 10], [2, 13]]) { px(x, y, RAMPS.wart[4]); px(x + 1, y, RAMPS.wart[3]); }
};

P.stem = (px) => {
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    const v = vnoise(x * 3, y * 0.5, 4, 151) * 0.65 + hash(x, y, 152) * 0.3;
    px(x, y, pick(RAMPS.stem, v));
  }
  for (const [x, y] of [[3, 4], [10, 9], [6, 13]]) { px(x, y, '#ff7a3a'); px(x, y + 1, '#c84a2a'); } // glowing spores
};

P.lava = (px) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) px(x, y, pick(RAMPS.lava, vnoise(x, y, 4, 161) * 0.75 + vnoise(x, y, 8, 162) * 0.25));
};

P.glowstone = (px) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = vnoise(x, y, 4, 171) * 0.7 + hash(x, y, 172) * 0.3;
    px(x, y, pick(RAMPS.glow, v));
  }
};

P.basalt = (px) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) px(x, y, pick(RAMPS.basalt, vnoise(x * 2, y * 0.5, 4, 181) * 0.6 + hash(x, y, 182) * 0.35));
};

P.endstone = (px) => {
  fill(px, RAMPS.endstone, 191, 0.4);
  for (const [x, y] of [[3, 3], [12, 2], [8, 8], [2, 11], [13, 12], [6, 14]]) { px(x, y, '#7f7a50'); px(x + 1, y, RAMPS.endstone[0]); px(x, y - 1, RAMPS.endstone[4]); }
};

P.obsidian = (px) => {
  fill(px, RAMPS.obsidian, 201, 0.3);
  for (const [x, y] of [[4, 3], [11, 6], [6, 11], [13, 13]]) { px(x, y, '#5a3f8f'); px(x + 1, y + 1, '#3c2a66'); }
};

P.purpur = (px) => {
  fill(px, RAMPS.purpur, 211, 0.35);
  for (let i = 0; i < N; i++) {
    for (const o of [0, 8]) {
      px(i, o, RAMPS.purpur[4]);
      px(o, i, RAMPS.purpur[4]);
      px(i, o + 7, RAMPS.purpur[0]);
      px(o + 7, i, RAMPS.purpur[0]);
    }
  }
};

P.chorus = (px) => {
  fill(px, RAMPS.chorus, 221, 0.4);
  for (const [x, y] of [[3, 3], [11, 5], [6, 10], [13, 12]]) { px(x, y, RAMPS.chorus[0]); px(x + 1, y, RAMPS.chorus[4]); }
};
P.chorus_flower = (px) => {
  fill(px, RAMPS.bloom, 231, 0.4);
  for (let i = 0; i < N; i++) { px(i, 0, RAMPS.bloom[0]); px(0, i, RAMPS.bloom[0]); }
  for (const [x, y] of [[5, 5], [10, 6], [7, 10]]) px(x, y, '#f3e6fa');
};

/** Storage-block style: bevelled frame and faceted centre. */
function gem(ramp, seed) {
  return (px) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const facet = ((x + y) >> 2) % 2;
      px(x, y, pick(ramp, 0.25 + facet * 0.25 + hash(x, y, seed) * 0.3));
    }
    for (let i = 0; i < N; i++) {
      px(i, 0, ramp[4]); px(0, i, ramp[4]);
      px(i, 15, ramp[0]); px(15, i, ramp[0]);
      px(i, 1, ramp[3]); px(1, i, ramp[3]);
      px(i, 14, ramp[1]); px(14, i, ramp[1]);
    }
    for (const [x, y] of [[4, 4], [5, 4], [4, 5], [10, 9], [9, 10]]) px(x, y, ramp[4]);
  };
}
P.amethyst = gem(RAMPS.amethyst, 241);
P.redstone = gem(RAMPS.redstone, 242);
P.emerald = gem(RAMPS.emerald, 243);
P.diamond = gem(RAMPS.diamond, 244);
P.gold = gem(RAMPS.gold, 245);
P.night = gem(RAMPS.night, 246);
P.copper = gem(RAMPS.copper, 247);

function ore(color, light, seed) {
  return (px) => {
    P.stone(px);
    const spots = [[3, 3], [10, 4], [5, 10], [12, 11], [8, 7]];
    spots.forEach(([x, y], i) => {
      if (hash(i, 0, seed) < 0.15) return;
      px(x, y, color); px(x + 1, y, color); px(x, y + 1, color); px(x + 1, y + 1, RAMPS.stone[0]);
      px(x, y, light);
    });
  };
}
P.coal_ore = ore('#24242a', '#3a3a42', 251);
P.iron_ore = ore('#b48a6a', '#dcbca0', 252);
P.diamond_ore = ore('#3fb8b8', '#a4f0ea', 253);

P.bookshelf = (px) => {
  P.planks(px);
  const books = ['#7a2a2a', '#2a4a7a', '#3a6a2a', '#7a6a2a', '#5a2a7a', '#2a6a6a', '#8a4a24'];
  for (const top of [1, 9]) {
    for (let x = 1; x < 15; x++) {
      const c = books[Math.floor(hash(x, top, 261) * books.length)];
      const h = 5 + (hash(x, top, 262) > 0.6 ? 1 : 0);
      for (let y = top + 6 - h; y < top + 6; y++) px(x, y, c);
      px(x, top + 6 - h, '#d8cfb8');
      if (hash(x, top, 263) > 0.7) px(x, top + 3, '#e8c86a'); // spine band
    }
    for (let x = 0; x < N; x++) px(x, top + 6, RAMPS.oak[0]);
  }
};

P.crafting_top = (px) => {
  P.planks(px);
  for (let i = 1; i < 15; i++) {
    px(i, 1, RAMPS.bark[1]); px(i, 14, RAMPS.bark[1]); px(1, i, RAMPS.bark[1]); px(14, i, RAMPS.bark[1]);
    px(i, 5, RAMPS.oak[0]); px(i, 10, RAMPS.oak[0]); px(5, i, RAMPS.oak[0]); px(10, i, RAMPS.oak[0]);
  }
};
P.crafting_side = (px) => {
  P.planks(px);
  for (let x = 0; x < N; x++) { px(x, 0, RAMPS.bark[1]); px(x, 1, RAMPS.bark[2]); }
  for (let y = 4; y < 12; y++) px(4, y, '#b9b9c0'); // saw
  for (let y = 4; y < 9; y++) px(5, y, '#9a9aa2');
  for (let y = 5; y < 13; y++) px(11, y, RAMPS.bark[3]); // hammer
  for (let x = 9; x < 14; x++) { px(x, 4, '#8a8a92'); px(x, 5, '#6a6a72'); }
};

P.furnace_front = (px) => {
  P.stone(px);
  for (let x = 2; x < 14; x++) { px(x, 2, RAMPS.stone[4]); px(x, 13, RAMPS.stone[0]); }
  for (let y = 7; y < 12; y++) for (let x = 4; x < 12; x++) px(x, y, y > 9 ? (hash(x, y, 271) > 0.4 ? '#ff9a2a' : '#ffd25a') : '#16141a');
  for (let x = 3; x < 13; x++) px(x, 6, RAMPS.stone[0]);
  for (let x = 4; x < 12; x += 2) px(x, 4, RAMPS.stone[0]);
};
P.furnace_side = (px) => {
  P.stone(px);
  for (let x = 0; x < N; x++) { px(x, 0, RAMPS.stone[4]); px(x, 15, RAMPS.stone[0]); }
};

P.chest_front = (px) => {
  planks(px, RAMPS.oak, 281);
  for (let i = 0; i < N; i++) { px(i, 0, RAMPS.bark[1]); px(i, 15, RAMPS.bark[1]); px(0, i, RAMPS.bark[1]); px(15, i, RAMPS.bark[1]); px(i, 6, RAMPS.bark[1]); }
  for (let y = 5; y < 9; y++) for (let x = 7; x < 9; x++) px(x, y, y === 5 ? '#e0e0e6' : '#a8a8b0'); // latch
};
P.chest_top = (px) => {
  planks(px, RAMPS.oak, 282);
  for (let i = 0; i < N; i++) { px(i, 0, RAMPS.bark[1]); px(i, 15, RAMPS.bark[1]); px(0, i, RAMPS.bark[1]); px(15, i, RAMPS.bark[1]); }
};

P.command = (px) => {
  fill(px, RAMPS.copper, 291, 0.3);
  for (let i = 2; i < 14; i++) { px(i, 2, RAMPS.copper[0]); px(i, 13, RAMPS.copper[0]); px(2, i, RAMPS.copper[0]); px(13, i, RAMPS.copper[0]); }
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) px(x, y, (x + y) % 3 ? '#2a3a48' : '#56b8d8');
  px(7, 7, '#c8f2ff'); px(8, 8, '#c8f2ff');
};

/** Faint light/dark specks used to give flat accent surfaces a pixel grain. */
P.grain = (px) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = field(x, y, 301, 0.4);
    if (v > 0.62) px(x, y, '#ffffff', 22);
    else if (v < 0.36) px(x, y, '#000000', 30);
  }
};

// -------------------------------------------------------------- caching --
const cache = new Map();
const urls = new Map();
export function tex(name) {
  if (!cache.has(name)) cache.set(name, paint(P[name] || P.stone));
  return cache.get(name);
}
export function texUrl(name) {
  if (!urls.has(name)) urls.set(name, tex(name).toDataURL());
  return urls.get(name);
}

/** A copy of a texture multiplied by a brightness factor (face shading). */
const shadedCache = new Map();
export function shaded(name, k) {
  const key = `${name}@${k}`;
  if (!shadedCache.has(key)) {
    const c = canvas();
    const ctx = c.getContext('2d');
    ctx.drawImage(tex(name), 0, 0);
    if (k < 1) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(8, 6, 20, ${1 - k})`;
      ctx.fillRect(0, 0, N, N);
    }
    shadedCache.set(key, c);
  }
  return shadedCache.get(key);
}

// -------------------------------------------------------------- blocks --
/** Faces per block: [top, side, bottom, front]. */
export const BLOCKS = {
  grass: ['grass_top', 'grass_side', 'dirt'],
  dirt: ['dirt', 'dirt', 'dirt'],
  stone: ['stone', 'stone', 'stone'],
  coal_ore: ['coal_ore', 'coal_ore', 'coal_ore'],
  iron_ore: ['iron_ore', 'iron_ore', 'iron_ore'],
  sand: ['sand', 'sand', 'sand'],
  snow: ['snow', 'snow', 'dirt'],
  log: ['log_top', 'log_side', 'log_top'],
  leaves: ['leaves', 'leaves', 'leaves'],
  planks: ['planks', 'planks', 'planks'],
  water: ['water', 'water', 'water'],
  netherrack: ['netherrack', 'netherrack', 'netherrack'],
  nylium: ['nylium_top', 'nylium_side', 'netherrack'],
  wart: ['wart', 'wart', 'wart'],
  stem: ['stem', 'stem', 'stem'],
  lava: ['lava', 'lava', 'lava'],
  glowstone: ['glowstone', 'glowstone', 'glowstone'],
  basalt: ['basalt', 'basalt', 'basalt'],
  endstone: ['endstone', 'endstone', 'endstone'],
  obsidian: ['obsidian', 'obsidian', 'obsidian'],
  purpur: ['purpur', 'purpur', 'purpur'],
  chorus: ['chorus', 'chorus', 'chorus'],
  chorus_flower: ['chorus_flower', 'chorus_flower', 'chorus_flower'],
  amethyst: ['amethyst', 'amethyst', 'amethyst'],
  redstone: ['redstone', 'redstone', 'redstone'],
  emerald: ['emerald', 'emerald', 'emerald'],
  diamond: ['diamond', 'diamond', 'diamond'],
  gold: ['gold', 'gold', 'gold'],
  night: ['night', 'night', 'night'],
  bookshelf: ['planks', 'bookshelf', 'planks'],
  crafting: ['crafting_top', 'crafting_side', 'planks', 'crafting_side'],
  furnace: ['furnace_side', 'furnace_side', 'furnace_side', 'furnace_front'],
  chest: ['chest_top', 'chest_top', 'chest_top', 'chest_front'],
  command: ['command', 'command', 'command'],
  diamond_ore: ['diamond_ore', 'diamond_ore', 'diamond_ore'],
};
export function faceName(kind, face) {
  const [top, side, bottom, front] = BLOCKS[kind] || BLOCKS.stone;
  return face === 'top' ? top : face === 'bottom' ? bottom : face === 'front' && front ? front : side;
}

/**
 * Inventory-style isometric block icon as a PNG data URL. The faces are
 * nearest-neighbour upscaled first, then the browser downsamples the image,
 * so pixels stay crisp but the silhouette is clean at 24-64 px.
 */
const iconCache = new Map();
export function blockIconUrl(kind, size = 96) {
  const key = `${kind}:${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = size * 0.92;
  const ox = (size - W) / 2;
  const oy = (size - W) / 2 + W * 0.02;
  const u = W / 2 / N;
  const q = W / 4 / N;
  const v = W / 2 / N;
  const faces = [
    // [face, shade, a, b, c, d, e, f]
    ['top', 1, u, -q, u, q, ox, oy + W / 4],
    ['front', 0.8, u, q, 0, v, ox, oy + W / 4],
    ['side', 0.62, u, -q, 0, v, ox + W / 2, oy + W / 2],
  ];
  for (const [face, k, a, b, cc, d, e, f] of faces) {
    ctx.setTransform(a, b, cc, d, e, f);
    ctx.drawImage(shaded(faceName(kind, face), k), -0.04, -0.04, N + 0.08, N + 0.08);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}
