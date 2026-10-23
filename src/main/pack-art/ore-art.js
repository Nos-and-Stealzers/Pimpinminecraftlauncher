// Original mineral studies: touching, irregular chips rather than isolated
// bright dots or concentric outlines. Coordinates are authored on a 16px tile;
// the 32px edition adds narrow crystal faces and fractures inside those veins.
const { Image, rgba, mixc, strip } = require('./lib');
const terrain = require('./terrain');
const polish = require('./polish');
const blocks = require('./blocks');

const STUDIES = {
  coal: { colors: ['#25262a', '#35363a', '#4c4e51', '#686a6a'] },
  iron: { colors: ['#826557', '#a57e64', '#c89e7b', '#dfbe9c'] },
  copper: { colors: ['#805145', '#a76549', '#c88b5c', '#deb48a'], accent: ['#426e63', '#679480'] },
  gold: { colors: ['#8f6d29', '#bc922f', '#ddbb53', '#f1d786'] },
  redstone: { colors: ['#782f32', '#a43835', '#c95145', '#e3826b'] },
  lapis: { colors: ['#303d68', '#3c568e', '#5476ac', '#8eabc8'] },
  diamond: { colors: ['#366a70', '#4a959b', '#72c3c5', '#b5e3dc'] },
  emerald: { colors: ['#2f6047', '#38885d', '#5caf79', '#a2d3a5'] },
  nether_gold: { colors: ['#90652c', '#b58a38', '#d7b356', '#ead08a'] },
  nether_quartz: { colors: ['#8f7470', '#b39e93', '#d4c5b1', '#ece2cd'] },
};
// Unequal, branching outcrops. Several cross a tile boundary: a wall reads as
// broken mineral seams instead of an evenly spaced wallpaper of round dots.
const LOW_VEINS = {
  coal: [[-2, 1, ['..hh..', 'hhbb..', 'bbddhb', '...bbd', '....dd']], [6, 9, ['.hbb', 'hbbd', 'bbd.', 'dd..']], [11, 5, ['hb', 'bd']]],
  iron: [[1, 2, ['.hh..', 'hbbhb', 'bddbd', '...dd']], [10, 11, ['hhb..', '.bbhb', '..bdd', '...dd']], [15, 7, ['hb', 'bd']]],
  copper: [[-1, 10, ['.hbb..', 'hbbdhb', '.ddbbd', '....dd']], [7, 2, ['hhb..', '.bbh.', '..bbd', '...dd']], [12, 8, ['hb', 'bd']]],
  gold: [[12, 0, ['.hh..', 'hbbhb', 'bddbd', '...dd']], [3, 8, ['hhb..', '.bbh.', '..bbd', '...dd']], [9, 14, ['hb', 'bd']]],
  redstone: [[1, 3, ['hhb...', '.bbhh.', '..bbbd', '...dd.']], [11, 11, ['..hb', '.hbd', 'hbd.', 'dd..']], [8, 0, ['hb', 'bd']]],
  lapis: [[-1, 7, ['.hhb..', 'hbbdd.', '.ddhbb', '...bdd']], [8, 0, ['.hhb', 'hbbd', 'bbd.', '.d..']], [9, 13, ['hhb', '.bd']]],
  diamond: [[2, 11, ['..h.', '..bb', 'hhbd', 'bdd.', 'd...']], [10, 3, ['hbb..', '.bbh.', '..bbd', '...dd']], [15, 9, ['hb', 'bd']]],
  emerald: [[13, 11, ['..h', '.hb', '.bd', 'hbd', 'bd.', 'd..']], [4, 2, ['h...', 'bb..', 'bdh.', '.bb.', '.bdh', '..bd']], [9, 9, ['hb', 'bd']]],
  nether_gold: [[-1, 1, ['hhb...', '.bbhh.', '..bbbd', '...dd.']], [7, 10, ['.hh..', 'hbbhb', '.ddbd', '...dd']], [13, 7, ['hb', 'bd']]],
  nether_quartz: [[12, 0, ['..h.', '.hb.', '.bdh', 'hbdd', 'bd..', 'd...']], [2, 8, ['...h', '..hb', '.hbd', '.bd.', 'hb..', 'd...']], [9, 13, ['hb', 'bd']]],
};
// Independently authored 32px veins, with splintered terminal chips and narrow
// facets. These are NOT enlarged low-res stamps with glitter sprinkled on top.
const HIGH_VEINS = {
  coal: [[28, 2, ['...hhb...', '.hhbbb...', 'hbbdddhb.', 'bbdd.hbbd', '.dd...bdd', '.......dd']], [9, 20, ['..hhbb..', '.hbbbbd.', 'hbbdddhb', 'bdd..bbd', '.dd...dd']], [21, 12, ['hbb', 'bbd', '.dd']]],
  iron: [[1, 5, ['..hhh...', '.hbbbhb.', 'hbbddbbd', '.bdd.bbd', '..d...dd']], [23, 25, ['hhh.....', 'hbbhh...', '.bbbbhh.', '..bddbbd', '...d..dd']], [17, 15, ['.hb', 'hbd', 'bd.']]],
  copper: [[28, 20, ['..hhb...', '.hbbbhh.', 'hbbddbbd', '.bddbbdd', '...bdd..', '....d...']], [13, 3, ['hhb.....', 'hbbhh...', '.bddbhb.', '...bbbd.', '....bdd.', '.....dd.']], [21, 15, ['.hh', 'hbd', '.dd']]],
  gold: [[25, 30, ['..hhh...', '.hbbbhb.', 'hbbddbbd', '.bdd.bbd', '..d...dd']], [5, 17, ['hhh.....', 'hbbhh...', '.bbbhb..', '..bddbbd', '...d.bdd', '......dd']], [17, 9, ['hhb', '.bd', '..d']]],
  redstone: [[2, 6, ['hhb.....', '.bbhhh..', '..bbbbhb', '...bddbd', '....dd..']], [23, 22, ['....hhb', '...hbbd', '.hhbbd.', 'hbbdd..', 'bdd....', 'dd.....']], [16, 30, ['hbb', '.bd']]],
  lapis: [[29, 14, ['..hhbb..', '.hbbbbd.', 'hbbdddhb', '.bddhbbd', '..ddbdd.', '.....dd.']], [16, 30, ['...hhb..', '.hhbbbd.', 'hbbbbdd.', '.bbdd...', '..dd....']], [17, 25, ['hhb', 'bbd', '.dd']]],
  diamond: [[3, 23, ['....h...', '...hbb..', '...bbd..', '.hhbbd..', 'hbbdd...', 'bdd.....', 'dd......']], [20, 5, ['hhb.....', 'hbbh....', '.bbbh...', '..bbbd..', '...bbbh.', '....bbbd', '.....dd.']], [30, 17, ['.hb', 'hbd', 'bd.', 'd..']]],
  emerald: [[27, 22, ['.....h', '....hb', '....bd', '..hhbd', '..bbdd', '.hbd..', '.bbd..', 'hbd...', 'bd....']], [8, 4, ['h......', 'bb.....', 'bdh....', '.bb....', '.bdhh..', '..bbd..', '..bddh.', '....bb.', '....bd.']], [18, 18, ['hb', 'bb', 'bd']]],
  nether_gold: [[29, 2, ['hhh.....', '.bbhh...', '..bbbhh.', '...bbhbd', '....bdd.', '.....dd.']], [14, 20, ['...hhh..', '.hhbbbh.', 'hbbddbbd', '.bdd.bdd', '..dd..dd']], [25, 14, ['hhb', '.bd', '..d']]],
  nether_quartz: [[24, 30, ['.....h..', '....hb..', '....bd..', '...hbdh.', '..hbdbd.', '..bbdd..', '.hbd....', '.bbd....', 'hbd.....', 'dd......']], [4, 16, ['......h', '.....hb', '....hbd', '...hbd.', '...bbd.', '..hbd..', '.hbd...', '.bbd...', 'hbd....']], [18, 26, ['.hb', 'hbd', 'bd.', 'd..']]],
};
const wrap = (n, S) => ((n % S) + S) % S;

function mineral(S, name) {
  const study = STUDIES[name];
  const detail = S >= 32;
  const k = S / (detail ? 32 : 16);
  const mask = new Int8Array(S * S).fill(-1);
  const color = { d: 0, b: 1, h: 2 };
  const chips = (detail ? HIGH_VEINS : LOW_VEINS)[name];
  chips.forEach(([ox, oy, rows], cluster) => rows.forEach((row, yy) => [...row].forEach((ch, xx) => {
    if (!(ch in color)) return;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const x = wrap((ox + xx) * k + dx, S), y = wrap((oy + yy) * k + dy, S);
      let value = color[ch];
      // Selected terminal faces, never a white dot on every chip.
      if (detail && ch === 'h' && (xx + yy + cluster * 2) % 5 === 0) value = 3;
      if (study.accent && ((xx + yy * 2 + cluster * 3) % 7 < 2)) value = 4 + (ch === 'h' ? 1 : 0);
      mask[y * S + x] = value;
    }
  })));
  if (detail) {
    // The 32px sketches must occupy a similar fraction of a block as the 16px
    // deposits. Broaden their authored faces by one native pixel instead of doubling a
    // low-resolution bitmap or scattering extra isolated bright dots.
    const faces = mask.slice();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (mask[y * S + x] >= 0) continue;
      const left = faces[y * S + wrap(x - 1, S)];
      const right = faces[y * S + wrap(x + 1, S)];
      const upper = faces[wrap(y - 1, S) * S + x];
      const lower = faces[wrap(y + 1, S) * S + x];
      if (left >= 0) mask[y * S + x] = left;
      else if (right >= 0) mask[y * S + x] = right;
      else if (upper >= 0) mask[y * S + x] = upper;
      else if (lower >= 0) mask[y * S + x] = lower;
      else {
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const face = faces[wrap(y + dy, S) * S + wrap(x + dx, S)];
          if (face >= 0) { mask[y * S + x] = face; break; }
        }
      }
    }
  }
  return { mask, pal: [...study.colors, ...(study.accent || [])].map(rgba) };
}

function host(name, S, style) {
  // Resolve at paint time: polish can replace terrain AFTER this module loads.
  // Do not capture terrain's old ore closures or a stale blocks.T.stone.
  const painter = polish.X[name] || terrain.X[name] || blocks.T[name];
  if (!painter) throw new Error(`Missing ore host rock: ${name}`);
  return new Image(S).blit(painter(S, style), 0, 0);
}

function ore(name, rock) {
  const paint = (S, style) => {
    const { mask, pal } = mineral(S, name);
    const image = host(rock, S, style);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = mask[y * S + x];
      if (v >= 0) image.set(x, y, pal[v]);
      // Recessed lip on the lower side only: no black ring around deposits.
      else if (mask[wrap(y - 1, S) * S + x] >= 0) image.set(x, y, mixc(image.get(x, y), pal[0], 0.18));
    }
    // Preserve the existing rare, restrained glint animation in the looks
    // edition, but only for gems. Host rock is identical across all frames.
    if (style !== 'looks' || !['diamond', 'emerald', 'redstone', 'lapis', 'nether_quartz', 'gold', 'nether_gold'].includes(name)) return image;
    const i = mask.findIndex((v) => v === 3 || v === 2);
    if (i < 0) return image;
    const lit = new Image(S).blit(image, 0, 0);
    lit.set(i % S, Math.floor(i / S), mixc(pal[3], [243, 240, 221, 255], 0.24));
    const out = strip([image, lit]);
    out.meta = { animation: { frametime: 3, frames: [{ index: 0, time: 140 }, 1, { index: 0, time: 16 }] } };
    return out;
  };
  // Vanilla does not light ore. OptiFine-compatible highlights are limited
  // to crystal facets/redstone, never coal, metals or the surrounding rock.
  paint.emissive = (S, style) => {
    const image = new Image(S);
    if (style !== 'looks' || !['diamond', 'emerald', 'redstone', 'lapis', 'nether_quartz'].includes(name)) return image;
    const { mask, pal } = mineral(S, name);
    for (let i = 0; i < mask.length; i++) if (mask[i] === 3 || (name === 'redstone' && mask[i] === 2)) image.set(i % S, Math.floor(i / S), pal[mask[i]]);
    return image;
  };
  return paint;
}

const X = {};
for (const name of Object.keys(STUDIES)) {
  if (name.startsWith('nether_')) X[`${name}_ore`] = ore(name, 'netherrack');
  else {
    X[`${name}_ore`] = ore(name, 'stone');
    X[`deepslate_${name}_ore`] = ore(name, 'deepslate');
  }
}
// Ancient debris remains the existing pack/vanilla art; this module deliberately
// does not replace it with another repeated ring or an unverified redraw.
module.exports = { X };
