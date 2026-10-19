// Procedural 16×16 block textures in the Minecraft style, drawn on a canvas
// once at startup. Used by the 3D blocks, the panorama and the classic theme.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function paint(seed, draw) {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  const r = rng(seed);
  const px = (x, y, color) => {
    if (!color) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };
  const pick = (pal) => pal[Math.floor(r() * pal.length)];
  draw({ px, pick, r, ctx });
  return c.toDataURL();
}

const noise = (pal) => ({ px, pick }) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, pick(pal));
};

const P = {
  dirt: ['#866043', '#866043', '#79553a', '#966c4a', '#593d29', '#9b7653'],
  grass: ['#5d9e34', '#6aad3d', '#4f8a2b', '#7cbd4a', '#59953a', '#62a336'],
  stone: ['#7f7f7f', '#7f7f7f', '#747474', '#8a8a8a', '#686868', '#959595'],
  sand: ['#dbcf8e', '#d6c886', '#e3d89b', '#cdbf7c', '#d9cd8b'],
  water: ['#3f76e4cc', '#3a6fd8cc', '#4a80eccc', '#3568d0cc'],
  leaves: ['#3e7a1f', '#4a8f26', '#2f6417', '#55a02c', null, '#3e7a1f'],
  obsidian: ['#14101f', '#1d1730', '#2a2140', '#0f0c17', '#3b2c5c'],
  amethyst: ['#8d5fd3', '#a374e8', '#7a4fc0', '#c9a1ff', '#6a3fae'],
  redstone: ['#b0170c', '#c71f12', '#8f1209', '#e0301f', '#a3150b'],
  emerald: ['#17dd62', '#2fe57a', '#0fb04c', '#7ef7ab', '#0c8a3b'],
  diamond: ['#62e8e0', '#7af0ea', '#4dd0c8', '#c8fffb', '#38b3ad'],
  gold: ['#f8d33a', '#fbe36b', '#e7b622', '#fff6a8', '#d29c13'],
  lapis: ['#1f4bb0', '#2a5cc9', '#173b8f', '#4a7be0'],
  cobble: ['#7a7a7a', '#5f5f5f', '#8f8f8f', '#4d4d4d', '#a0a0a0'],
  plank: ['#a2824e', '#9a7a48', '#b08f57', '#8f7041'],
  log: ['#6b5130', '#5a4428', '#7a5d38', '#4d3a22'],
  netherrack: ['#6f2a2a', '#7d3333', '#5e2222', '#8f3d3d', '#4a1a1a'],
  purpur: ['#a97ba9', '#b48ab4', '#9b6b9b', '#c09cc0'],
  snow: ['#f4fbff', '#eaf4fb', '#ffffff', '#dfeef7'],
  quartz: ['#ebe5de', '#e0d9d0', '#f5f1ec', '#d6cec4'],
};

/** Metal / gem blocks: noise with a light top-left edge and dark bottom-right. */
const block = (pal) => (t) => {
  noise(pal)(t);
  for (let i = 0; i < 16; i++) {
    t.px(i, 0, pal[3]);
    t.px(0, i, pal[3]);
    t.px(i, 15, pal[pal.length - 1]);
    t.px(15, i, pal[pal.length - 1]);
  }
};

const planks = ({ px, pick, r }) => {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) px(x, y, y % 4 === 3 ? '#6e5530' : pick(P.plank));
  }
  for (let row = 0; row < 4; row++) px(Math.floor(r() * 16), row * 4 + 1, '#6e5530');
};

const DRAW = {
  dirt: noise(P.dirt),
  grass_top: noise(P.grass),
  grass_side: ({ px, pick, r }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, pick(P.dirt));
    for (let x = 0; x < 16; x++) {
      const depth = 3 + Math.floor(r() * 3);
      for (let y = 0; y < depth; y++) px(x, y, pick(P.grass));
    }
  },
  stone: noise(P.stone),
  cobble: ({ px, pick }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, (x * 7 + y * 3) % 11 === 0 || (x + y * 5) % 13 === 0 ? '#3e3e3e' : pick(P.cobble));
  },
  sand: noise(P.sand),
  water: noise(P.water),
  leaves: noise(P.leaves),
  log_side: ({ px, pick }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, x % 4 === 0 ? '#4d3a22' : pick(P.log));
  },
  log_top: ({ px, pick }) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        px(x, y, d > 6.5 ? pick(P.log) : Math.floor(d) % 2 ? '#b8945f' : '#a07c4a');
      }
    }
  },
  planks,
  bookshelf: (t) => {
    planks(t);
    const books = ['#8f2d2d', '#2d5a8f', '#3c7a2a', '#8f7a2d', '#5a2d8f', '#2d8f86'];
    for (const top of [2, 9]) {
      for (let x = 1; x < 15; x++) {
        const c = t.pick(books);
        const h = 4 + Math.floor(t.r() * 2);
        for (let y = top + 5 - h; y < top + 5; y++) t.px(x, y, c);
      }
    }
  },
  crafting_top: (t) => {
    planks(t);
    for (let i = 1; i < 15; i++) {
      t.px(i, 1, '#4d3a22');
      t.px(i, 14, '#4d3a22');
      t.px(1, i, '#4d3a22');
      t.px(14, i, '#4d3a22');
      t.px(i, 7, '#6e5530');
      t.px(7, i, '#6e5530');
    }
  },
  crafting_side: (t) => {
    planks(t);
    for (let x = 0; x < 16; x++) t.px(x, 0, '#4d3a22');
    // a saw and a hammer hanging on the side
    for (let y = 4; y < 12; y++) t.px(4, y, '#c9c9c9');
    for (let y = 4; y < 8; y++) t.px(5, y, '#c9c9c9');
    for (let y = 5; y < 13; y++) t.px(11, y, '#6b5130');
    for (let x = 9; x < 14; x++) t.px(x, 4, '#8a8a8a');
  },
  furnace_front: (t) => {
    DRAW.cobble(t);
    for (let y = 8; y < 13; y++) for (let x = 4; x < 12; x++) t.px(x, y, y > 10 ? '#ff8a1a' : '#1d1d1d');
    for (let x = 3; x < 13; x++) t.px(x, 6, '#3e3e3e');
  },
  furnace_side: (t) => DRAW.cobble(t),
  tnt_side: ({ px, pick }) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) px(x, y, y >= 5 && y <= 10 ? (y === 5 || y === 10 ? '#bdbdbd' : '#ececec') : pick(['#c8312b', '#b52a24', '#db3a33']));
    }
    // "TNT"
    const glyph = ['111.1..1.111', '.1..11.1..1.', '.1..1.11..1.'];
    glyph.forEach((row, gy) => [...row].forEach((c, gx) => c === '1' && px(gx + 2, gy + 6, '#1c1c1c')));
  },
  tnt_top: ({ px, pick }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, Math.hypot(x - 7.5, y - 7.5) < 2.5 ? '#2a2a2a' : pick(['#c8312b', '#b52a24', '#db3a33']));
  },
  command: (t) => {
    noise(['#b8774a', '#c4835a', '#a8693e', '#cf9268'])(t);
    for (let i = 3; i < 13; i++) {
      t.px(i, 3, '#3a2a1e');
      t.px(i, 12, '#3a2a1e');
      t.px(3, i, '#3a2a1e');
      t.px(12, i, '#3a2a1e');
    }
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) t.px(x, y, (x + y) % 2 ? '#9fe0ff' : '#5fb8e8');
  },
  obsidian: noise(P.obsidian),
  amethyst: block(P.amethyst),
  redstone: block(P.redstone),
  emerald: block(P.emerald),
  diamond: block(P.diamond),
  gold: block(P.gold),
  lapis: block(P.lapis),
  netherrack: noise(P.netherrack),
  purpur: ({ px, pick }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, x % 8 === 0 || y % 8 === 0 ? '#8a5a8a' : pick(P.purpur));
  },
  snow: noise(P.snow),
  quartz: block(P.quartz),
  paper: ({ px }) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, y % 4 === 3 ? '#b9b0e0' : x % 5 === 0 ? '#e7e2fb' : '#f4f1ff');
  },
};

/** Which texture each face of a block uses: [top, side, bottom, front?]. */
export const BLOCKS = {
  grass: ['grass_top', 'grass_side', 'dirt'],
  dirt: ['dirt', 'dirt', 'dirt'],
  stone: ['stone', 'stone', 'stone'],
  cobble: ['cobble', 'cobble', 'cobble'],
  sand: ['sand', 'sand', 'sand'],
  log: ['log_top', 'log_side', 'log_top'],
  leaves: ['leaves', 'leaves', 'leaves'],
  planks: ['planks', 'planks', 'planks'],
  bookshelf: ['planks', 'bookshelf', 'planks'],
  crafting: ['crafting_top', 'crafting_side', 'planks'],
  furnace: ['furnace_side', 'furnace_side', 'furnace_side', 'furnace_front'],
  tnt: ['tnt_top', 'tnt_side', 'tnt_top'],
  command: ['command', 'command', 'command'],
  obsidian: ['obsidian', 'obsidian', 'obsidian'],
  amethyst: ['amethyst', 'amethyst', 'amethyst'],
  redstone: ['redstone', 'redstone', 'redstone'],
  emerald: ['emerald', 'emerald', 'emerald'],
  diamond: ['diamond', 'diamond', 'diamond'],
  gold: ['gold', 'gold', 'gold'],
  lapis: ['lapis', 'lapis', 'lapis'],
  netherrack: ['netherrack', 'netherrack', 'netherrack'],
  purpur: ['purpur', 'purpur', 'purpur'],
  snow: ['snow', 'snow', 'dirt'],
  quartz: ['quartz', 'quartz', 'quartz'],
  paper: ['paper', 'paper', 'paper'],
};

const cache = {};
const hash = (str) => [...str].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
export function tex(name) {
  if (!cache[name]) cache[name] = paint(hash(name), DRAW[name] || DRAW.stone);
  return cache[name];
}

/** Texture URL for one face of a block. */
export function faceTex(kind, face) {
  const [top, side, bottom, front] = BLOCKS[kind] || BLOCKS.stone;
  const name = face === 'top' ? top : face === 'bottom' ? bottom : face === 'front' && front ? front : side;
  return `url("${tex(name)}")`;
}

/** Expose a few textures as CSS variables for backgrounds and the classic theme. */
export function installTextureVars() {
  const root = document.documentElement.style;
  for (const name of ['dirt', 'stone', 'cobble', 'planks', 'obsidian', 'grass_top', 'grass_side', 'netherrack', 'water', 'sand']) {
    root.setProperty(`--tx-${name.replace('_', '-')}`, `url("${tex(name)}")`);
  }
}
