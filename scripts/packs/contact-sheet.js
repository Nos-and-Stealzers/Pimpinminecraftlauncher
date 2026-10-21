// Contact sheets of what a built pack actually ships, for eyeballing art:
//   node scripts/packs/contact-sheet.js <outDir> [version] [tile=3]
// Blocks are tiled 3x3 (seams and repeating patterns show up), biome-tinted
// like the game does in a plains biome; grass side gets its overlay. Items,
// entities and GUI sprites are drawn at their real proportions.
const fs = require('fs');
const path = require('path');
const packs = require('../../src/main/packs');
const { Image } = require('../../src/main/png');
const { decode } = require('./png-decode');

const outDir = path.resolve(process.argv[2] || 'contact-sheets');
const version = process.argv[3] || '1.21.4';
const REP = Number(process.argv[4] || 3);
fs.mkdirSync(outDir, { recursive: true });

// 3x5 font for labels
const F = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110', e: '111100110100111', f: '111100110100100',
  g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010', k: '101101110101101', l: '100100100100111',
  m: '101111111101101', n: '110101101101101', o: '010101101101010', p: '110101110100100', q: '010101101110011', r: '110101110101101',
  s: '011100010001110', t: '111010010010010', u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101',
  y: '101101010010010', z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  _: '000000000000111', '/': '001001010100100', '-': '000000111000000', '.': '000000000000010',
};
function text(img, x, y, s, col = [230, 230, 235, 255]) {
  [...s.toLowerCase()].forEach((ch, i) => {
    const g = F[ch];
    if (!g) return;
    for (let j = 0; j < 5; j++) for (let k = 0; k < 3; k++) if (g[j * 3 + k] === '1') img.set(x + i * 4 + k, y + j, col);
  });
}

const GRASS = [124, 189, 74];
const FOLIAGE = [89, 174, 48];
const TINT = {
  grass_block_top: GRASS, grass_block_side_overlay: GRASS, short_grass: GRASS, grass: GRASS, tall_grass_top: GRASS, tall_grass_bottom: GRASS, fern: GRASS, large_fern_top: GRASS, large_fern_bottom: GRASS, sugar_cane: GRASS,
  oak_leaves: FOLIAGE, jungle_leaves: FOLIAGE, acacia_leaves: FOLIAGE, dark_oak_leaves: FOLIAGE, mangrove_leaves: [141, 180, 60], vine: FOLIAGE,
  spruce_leaves: [97, 153, 97], birch_leaves: [128, 167, 85], water_still: [63, 118, 228], water_flow: [63, 118, 228], lily_pad: [32, 128, 48],
};
const BG = [46, 46, 54, 255];

function tinted(img, t) {
  if (!t) return img;
  const o = new Image(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const [r, g, b, a] = img.get(x, y);
    o.set(x, y, [Math.round((r * t[0]) / 255), Math.round((g * t[1]) / 255), Math.round((b * t[2]) / 255), a]);
  }
  return o;
}

/** img scaled by integer k, drawn onto dst at (dx,dy) over a checker */
function put(dst, img, dx, dy, k, checker = true) {
  for (let y = 0; y < img.h * k; y++) for (let x = 0; x < img.w * k; x++) {
    const [r, g, b, a] = img.get(Math.floor(x / k), Math.floor(y / k));
    const c = checker ? (((x >> 3) + (y >> 3)) % 2 ? 72 : 60) : BG[0];
    const al = a / 255;
    dst.set(dx + x, dy + y, [Math.round(r * al + c * (1 - al)), Math.round(g * al + c * (1 - al)), Math.round(b * al + c * (1 - al)), 255]);
  }
}

function grid(cells, cellW, cellH, cols) {
  const rows = Math.ceil(cells.length / cols);
  const pad = 6;
  const img = new Image(cols * (cellW + pad) + pad, rows * (cellH + 10 + pad) + pad).fill(() => BG);
  cells.forEach((c, i) => {
    const x = pad + (i % cols) * (cellW + pad);
    const y = pad + Math.floor(i / cols) * (cellH + 10 + pad);
    c.draw(img, x, y);
    text(img, x, y + cellH + 3, c.label.slice(0, Math.floor(cellW / 4)));
  });
  return img;
}

for (const id of Object.keys(packs.PACKS)) {
  const files = packs.files(id, version);
  const map = new Map(files);
  const blocks = [];
  const items = [];
  const ents = [];
  const gui = [];
  for (const [p, data] of files) {
    if (!p.endsWith('.png') || !Buffer.isBuffer(data)) continue;
    const m = /textures\/(blocks?|items?|entity|gui\/sprites|environment|misc)\/(.+)\.png$/.exec(p);
    if (!m) continue;
    const name = m[2];
    let img = decode(data);
    if (/^blocks?$/.test(m[1])) {
      if (name.endsWith('_e') || name === 'grass_block_side_overlay') continue;
      if (img.h > img.w) img = img.crop(0, 0, img.w, img.w);
      let base = tinted(img, TINT[name]);
      if (name === 'grass_block_side' || name === 'grass_side') {
        const ov = map.get(p.replace(/\.png$/, '_overlay.png'));
        if (ov) {
          const o = tinted(decode(ov), GRASS);
          base = new Image(img.w, img.h).fill((x, y) => (o.get(x, y)[3] ? o.get(x, y) : img.get(x, y)));
        }
      }
      blocks.push({ name, img: base });
    } else if (/^items?$/.test(m[1])) items.push({ name, img });
    else if (m[1] === 'entity') ents.push({ name, img });
    else gui.push({ name: `${m[1].replace('gui/sprites', '')}${name}`.replace(/^\//, ''), img });
  }
  const tag = `${id}-${version}`;
  // blocks: 3x3 tiles at a fixed on-screen size
  const S = blocks[0].img.w;
  const k = Math.max(1, Math.round(32 / S));
  const cell = S * k * REP;
  const bcells = blocks.map(({ name, img }) => ({
    label: name,
    draw: (dst, x, y) => {
      for (let j = 0; j < REP; j++) for (let i = 0; i < REP; i++) put(dst, img, x + i * S * k, y + j * S * k, k);
    },
  }));
  const perSheet = 8 * 7;
  for (let s = 0; s * perSheet < bcells.length; s++) {
    const f = path.join(outDir, `${tag}-blocks-${s + 1}.png`);
    fs.writeFileSync(f, grid(bcells.slice(s * perSheet, (s + 1) * perSheet), cell, cell, 8).toPNG());
    console.log(f);
  }
  const small = (list, size, cols, file) => {
    const cells = list.map(({ name, img }) => {
      const kk = Math.max(1, Math.floor(size / Math.max(img.w, img.h)));
      return { label: name, draw: (dst, x, y) => put(dst, img, x, y, kk) };
    });
    const f = path.join(outDir, `${tag}-${file}.png`);
    fs.writeFileSync(f, grid(cells, size, size, cols).toPNG());
    console.log(f);
  };
  small(items, 96, 10, 'items');
  small(ents.filter((e) => !e.name.startsWith('player/')), 256, 6, 'entities');
  small(gui, 96, 10, 'gui');
}
