// Title-screen style backdrop: a floating voxel island (grass, sand, water,
// trees) drawn with CSS 3D and slowly turning, under a blocky sky.
import { el } from './dom.js';
import { faceTex, tex } from './textures.js';

const N = 12; // island is N×N columns
const S = 46; // block size in px
const SEA = 2;

function heights(seed) {
  const r = (i, j) => {
    const v = Math.sin(i * 12.9898 + j * 78.233 + seed) * 43758.5453;
    return v - Math.floor(v);
  };
  const grid = [];
  for (let i = 0; i < N; i++) {
    grid[i] = [];
    for (let j = 0; j < N; j++) {
      const d = Math.hypot(i - (N - 1) / 2, j - (N - 1) / 2) / (N / 2);
      const h = 2.2 + 1.3 * Math.sin(i * 0.55 + seed) + 1.1 * Math.cos(j * 0.7 + i * 0.25) + r(i, j) * 0.8 + (1 - d) * 2.2;
      grid[i][j] = Math.max(1, Math.min(7, Math.round(h)));
    }
  }
  return grid;
}

function face(kind, which, w, h, transform, extra = {}) {
  return el('div', {
    class: `pf ${which}`,
    style: {
      width: `${w}px`,
      height: `${h}px`,
      left: `${-w / 2}px`,
      top: `${-h / 2}px`,
      transform,
      backgroundImage: faceTex(kind, which === 'top' ? 'top' : which === 'bottom' ? 'bottom' : 'side'),
      backgroundSize: `${S}px ${S}px`,
      ...extra,
    },
  });
}

/** Faces of one cuboid in island space (x/z = column centre, y0..y1 = bottom/top heights in blocks). */
function cuboid(kind, cx, cz, y0, y1, w = 1, d = 1, out = []) {
  const W = w * S;
  const D = d * S;
  const H = (y1 - y0) * S;
  const cy = -((y0 + y1) / 2) * S;
  out.push(face(kind, 'top', W, D, `translate3d(${cx}px, ${-y1 * S}px, ${cz}px) rotateX(90deg)`));
  out.push(face(kind, 'bottom', W, D, `translate3d(${cx}px, ${-y0 * S}px, ${cz}px) rotateX(-90deg)`));
  out.push(face(kind, 'side s', W, H, `translate3d(${cx}px, ${cy}px, ${cz + D / 2}px)`));
  out.push(face(kind, 'side n', W, H, `translate3d(${cx}px, ${cy}px, ${cz - D / 2}px) rotateY(180deg)`));
  out.push(face(kind, 'side e', D, H, `translate3d(${cx + W / 2}px, ${cy}px, ${cz}px) rotateY(90deg)`));
  out.push(face(kind, 'side w', D, H, `translate3d(${cx - W / 2}px, ${cy}px, ${cz}px) rotateY(-90deg)`));
  return out;
}

function buildIsland(seed = 3.1) {
  const hm = heights(seed);
  const level = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? -1 : Math.max(hm[i][j], SEA));
  const isWater = (i, j) => hm[i][j] < SEA;
  const nearWater = (i, j) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => hm[i + a]?.[j + b] !== undefined && isWater(i + a, j + b));
  const faces = [];
  const xy = (i) => (i - (N - 1) / 2) * S;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const h = level(i, j);
      const water = isWater(i, j);
      const kind = water ? 'water' : h <= SEA && nearWater(i, j) ? 'sand' : h >= 6 ? 'snow' : 'grass';
      const cx = xy(i);
      const cz = xy(j);
      faces.push(face(kind === 'water' ? 'water' : kind, 'top', S, S, `translate3d(${cx}px, ${-h * S}px, ${cz}px) rotateX(90deg)`, water ? { opacity: 0.85 } : {}));
      // Side faces only where they are exposed above the neighbour.
      for (const [di, dj, side, rot] of [[0, 1, 's', ''], [0, -1, 'n', 'rotateY(180deg)'], [1, 0, 'e', 'rotateY(90deg)'], [-1, 0, 'w', 'rotateY(-90deg)']]) {
        const nh = level(i + di, j + dj);
        if (nh >= h) continue;
        const bottom = nh < 0 ? -1.4 : nh;
        const top = h;
        const H = (top - bottom) * S;
        const x = cx + di * (S / 2);
        const z = cz + dj * (S / 2);
        const sideKind = water ? 'sand' : kind === 'sand' ? 'sand' : kind === 'snow' ? 'snow' : 'grass';
        const f = face(sideKind, `side ${side}`, S, H, `translate3d(${x}px, ${-((top + bottom) / 2) * S}px, ${z}px) ${rot}`);
        // Grass only on the top block; dirt then stone further down.
        if (sideKind === 'grass' || sideKind === 'snow') {
          const dirt = `url("${tex('dirt')}")`;
          f.style.backgroundImage = `url("${tex(sideKind === 'snow' ? 'snow' : 'grass_side')}"), ${dirt}, ${dirt}, url("${tex('stone')}")`;
          f.style.backgroundSize = Array(4).fill(`${S}px ${S}px`).join(', ');
          f.style.backgroundRepeat = 'no-repeat, repeat-x, repeat-x, repeat';
          f.style.backgroundPosition = `0 0, 0 ${S}px, 0 ${S * 2}px, 0 0`;
        }
        faces.push(f);
      }
      // Trees on some higher grass columns.
      const t = Math.sin(i * 91.7 + j * 47.3 + seed) * 1000;
      if (kind === 'grass' && h >= 3 && t - Math.floor(t) > 0.86 && i > 0 && j > 0 && i < N - 1 && j < N - 1) {
        cuboid('log', cx, cz, h, h + 3, 1, 1, faces);
        cuboid('leaves', cx, cz, h + 2.5, h + 4.5, 3, 3, faces);
      }
    }
  }
  // Rough underside so the island looks like it floats.
  faces.push(el('div', {
    class: 'pf bottom',
    style: { width: `${N * S}px`, height: `${N * S}px`, left: `${(-N * S) / 2}px`, top: `${(-N * S) / 2}px`, transform: `translate3d(0, ${1.4 * S}px, 0) rotateX(-90deg)`, backgroundImage: `url("${tex('stone')}")`, backgroundSize: `${S}px ${S}px` },
  }));
  return faces;
}

export function panorama() {
  const clouds = el('div', { class: 'pano-clouds' }, Array.from({ length: 6 }, (_, i) => el('i', { style: { top: `${6 + ((i * 37) % 30)}%`, animationDelay: `${-i * 23}s`, width: `${120 + ((i * 53) % 140)}px` } })));
  return el('div', { class: 'panorama' },
    el('div', { class: 'pano-sky' }),
    el('div', { class: 'pano-sun' }),
    clouds,
    el('div', { class: 'pano-stage' }, el('div', { class: 'pano-tilt' }, el('div', { class: 'pano-island' }, buildIsland()))),
    el('div', { class: 'pano-fog' }));
}
