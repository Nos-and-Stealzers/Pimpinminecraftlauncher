'use strict';
// Original Pimpin food sprites. Designed in 16-unit space, rasterised directly
// at the requested resolution; Pretty32 adds native-pixel crumb, scale, flesh
// and glass detail rather than magnifying a 16px bitmap. No source art is used.
const { Image, ramp } = require('./lib');
const OUT = '#30202a';
const C = { leaf: '#55863a', stem: '#795036', cream: '#efdbad', bone: '#e9dfc8', wood: '#936039', gold: '#edb832', glass: '#bdd8d9' };
const el = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const box = (a, b, c, d) => (x, y) => x >= a && x <= c && y >= b && y <= d;
const poly = (pts) => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [a, b] = pts[i], [c, d] = pts[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
  }
  return inside;
};
const union = (...masks) => (x, y) => masks.some((m) => m(x, y));
const seg = (ax, ay, bx, by, w = 0.5) => (x, y) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= w;
};
function sprite(S, layers) {
  if (S !== 16 && S !== 32) throw new RangeError('Food art supports native 16 or 32 pixels');
  const img = new Image(S), k = S / 16;
  for (const { shape, color, detail, flat = false, outline = true } of layers) {
    const pal = ramp(color, 5, { contrast: 0.42, hue: 12, mid: 2 });
    const has = (x, y) => x >= 2 && y >= 2 && x < S - 2 && y < S - 2 && shape((x + 0.5) / k, (y + 0.5) / k);
    // A one-native-pixel outline, not a scaled two-pixel border on Pretty32.
    if (outline) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!has(x, y) && (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1))) img.set(x, y, OUT);
    }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!has(x, y)) continue;
      const u = (x + 0.5) / k, v = (y + 0.5) / k;
      const lit = !has(x - 1, y) || !has(x, y - 1);
      const dark = !has(x + 1, y) || !has(x, y + 1);
      let shade = flat ? 2 : lit && !dark ? 4 : dark && !lit ? 0 : u + v < 14 ? 3 : 2;
      const d = detail && detail(u, v, S, x, y);
      if (typeof d === 'string' || Array.isArray(d)) img.set(x, y, d);
      else img.set(x, y, pal[d == null ? shade : Math.max(0, Math.min(4, d))]);
    }
  }
  return img;
}
const L = (shape, color, detail, opts = {}) => ({ shape, color, detail, ...opts });
const I = {};

function apple(gold) {
  return (S, style) => sprite(S, [
    L((x, y) => (el(5.6, 8.7, 3.5, 4.6)(x, y) || el(10, 8.7, 3.7, 4.6)(x, y)) && !(y > 12.3 && Math.abs(x - 7.7) < 0.7), gold ? C.gold : '#ce3b36', (x, y, s) => {
      if (el(4.9, 6.7, 0.75, 1.45)(x, y)) return gold ? '#fff0ae' : '#ffb68a';
      if (s === 32 && el(10.2, 11.4, 1.1, 0.55)(x, y)) return 1;
      if (gold && Math.abs(x + y - 17.2) < 0.3 && y < 9) return 4;
    }),
    L(seg(8, 4.8, 8.8, 2.1, 0.55), C.stem),
    L(poly([[9, 3.8], [10.4, 2.2], [13, 2.2], [11.8, 4.2]]), gold ? '#d8a333' : C.leaf),
  ]);
}
I.apple = apple(false); I.golden_apple = apple(true);
function carrot(gold) {
  return (S, style) => sprite(S, [
    L(poly([[2.3, 13.8], [4.8, 6.2], [8.2, 4.4], [11.5, 7.4], [9.5, 10.2]]), gold ? C.gold : '#e67d2d', (x, y, s) => {
      if (Math.abs(x + y - 13) < 0.5 && x < 6 || Math.abs(x + y - 17) < 0.5 && x > 7) return 1;
      if (s === 32 && Math.abs(x + y - 14.6) < 0.22 && y < 10) return 4;
    }),
    L(union(seg(9.1, 5.9, 9.3, 2.1, 0.6), seg(10, 6.1, 13.6, 2.5, 0.75), seg(10.2, 6.5, 14, 6.1, 0.6)), gold ? '#b99a33' : C.leaf),
  ]);
}
I.carrot = carrot(false); I.golden_carrot = carrot(true);
I.beetroot = (S, style) => sprite(S, [
  L(seg(6.6, 11, 5.6, 14, 0.6), '#b15467'),
  L(poly([[3.3, 7.2], [5.6, 5.1], [10.5, 5.6], [12.3, 8], [10, 11.9], [6, 12.7], [3.2, 10.3]]), '#a93658', (x, y, s) => s === 32 && Math.abs(x - 5.3 + (y - 7) * 0.3) < 0.3 ? 4 : undefined),
  L(union(seg(7.4, 6, 5, 2.2, 0.65), seg(8.3, 6, 9, 1.7, 0.6), seg(9, 6.2, 12.3, 3, 0.7)), C.leaf),
]);
function potato(kind) {
  const baked = kind === 'baked', poison = kind === 'poison';
  return (S, style) => sprite(S, [
    L(poly([[2.2, 9], [4, 5.2], [8.8, 3.4], [12.6, 5.7], [13.1, 9.1], [10.2, 12.3], [5.1, 13.1], [2.4, 11.4]]), baked ? '#a56c36' : '#c3a462', (x, y, s) => {
      if (poison && (el(9.8, 5.6, 2.5, 1.8)(x, y) || el(4.3, 10.4, 1.5, 1.5)(x, y))) return '#739447';
      if ((el(5, 8, 0.55, 0.5)(x, y) || el(10.5, 9.8, 0.5, 0.55)(x, y)) && !baked) return 0;
      if (s === 32 && (Math.floor(x * 3) + Math.floor(y * 4) * 7) % 37 === 0) return 1;
    }),
    ...(baked ? [L(poly([[4.1, 8.6], [7, 5.9], [11.6, 6], [10, 9.6], [6, 10.7]]), C.cream, (x, y, s) => Math.abs(x + y - 15) < 0.55 ? 1 : s === 32 && Math.abs(x - y - 1) < 0.3 ? 4 : undefined)] : []),
  ]);
}
I.potato = potato('raw'); I.baked_potato = potato('baked'); I.poisonous_potato = potato('poison');
function melon(gold) {
  return (S, style) => sprite(S, [
    L(poly([[1.5, 5.3], [14, 3.2], [13.8, 8.6], [11.5, 11.8], [7.9, 13.2], [4.4, 11.7], [2.4, 8.9]]), gold ? '#ad7929' : '#3b7c3a'),
    L(poly([[2.2, 5.4], [13.1, 3.9], [12.7, 8.1], [10.5, 10.6], [7.6, 11.7], [4.7, 10.3]]), gold ? '#f5cf53' : '#a4c56b', undefined, { outline: false }),
    L(poly([[2.6, 5.5], [12.6, 4.3], [11.7, 8.3], [9.5, 10], [6.9, 10.5], [4.9, 8.9]]), gold ? '#e5a044' : '#e45555', (x, y, s) => {
      if ([[5.4, 7.1], [8.2, 8.6], [10.6, 6.2]].some(([a, b]) => el(a, b, s === 32 ? 0.38 : 0.55, 0.75)(x, y))) return gold ? '#fff1ac' : '#5d303b';
      if (s === 32 && Math.abs(y - 5.7 + x * 0.12) < 0.22) return 4;
    }, { outline: false }),
  ]);
}
I.melon_slice = melon(false); I.glistering_melon_slice = melon(true);
I.chorus_fruit = (S, style) => sprite(S, [
  L(poly([[4.2, 3.3], [7.5, 2.6], [9, 4], [12.8, 4.6], [13.2, 8.7], [11.1, 11.9], [7, 13.5], [3.1, 10.7], [2.8, 6]]), '#986092', (x, y, s) => {
    if (Math.abs(x - 7.3 + (y - 6) * 0.16) < (s === 32 ? 0.35 : 0.5) && y > 4) return 0;
    if (Math.abs(x + y - 13) < 0.5 && x < 6) return 4;
    if (s === 32 && el(10, 7, 0.6, 1.5)(x, y)) return 3;
  }), L(box(6.7, 1.8, 8.5, 4.2), '#ddd3b9'),
]);
function berries(glow) {
  const centers = glow ? [[5.3, 8.1, 2.1], [10, 10.7, 2.6]] : [[5, 7.4, 2], [10.3, 7.2, 2.2], [7.5, 11.2, 2.4]];
  return (S, style) => sprite(S, [
    L(union(seg(7.5, 3.2, 7.6, 9, 0.55), seg(5.4, 5.5, 7.5, 4.6, 0.6), seg(8, 4, 11.7, 3.1, 0.6)), C.stem),
    L(poly(glow ? [[3.2, 3.9], [4.2, 2.1], [7.5, 3.5], [6.2, 5.2]] : [[4, 3.9], [5.4, 2.3], [8.5, 4], [11.8, 2.6], [11.2, 5], [7, 5.6]]), C.leaf),
    ...centers.map(([a, b, r]) => L(el(a, b, r, r), glow ? '#efa82f' : '#bc3c53', (x, y, s) => el(a - 0.65, b - 0.7, s === 32 ? 0.5 : 0.65, 0.65)(x, y) ? (glow ? '#fff3a0' : '#ff9d8c') : s === 32 && y > b + 0.7 && x > a ? 1 : undefined)),
  ]);
}
I.sweet_berries = berries(false); I.glow_berries = berries(true);
I.dried_kelp = (S, style) => sprite(S, [
  L(poly([[3, 3.1], [6, 2.7], [7.5, 3.4], [12.7, 3], [12.1, 8], [13, 12.4], [8.9, 13.1], [6.5, 12.5], [2.6, 13], [3.5, 8.6]]), '#46604a', (x, y, s) => {
    if (Math.abs(x - 7 + 0.35 * Math.sin(y)) < 0.6 || y > 10.5 && x > 8) return 1;
    if (s === 32 && (Math.abs(y - 6.2) < 0.25 || Math.abs(y - 9) < 0.25) && x < 10) return 3;
  }),
]);
I.bread = (S, style) => sprite(S, [
  L((x, y) => ((x - y) / 8.2) ** 2 + ((x + y - 16) / 5.5) ** 2 < 1, '#c99547', (x, y, s) => {
    const a = (x - y) * 0.71, b = (x + y - 16) * 0.71;
    if ([-3, 0, 3].some((v) => Math.abs(a - v - b * 0.35) < 0.5) && Math.abs(b) < 1.5) return '#f4d497';
    if (s === 32 && (Math.floor(x * 2) * 5 + Math.floor(y * 2) * 3) % 31 === 0) return 1;
  }),
]);
I.cookie = (S, style) => sprite(S, [
  L(el(8, 8.3, 6.1, 5.4), '#d6a45f', (x, y, s) => {
    if ([[5, 5.6], [9, 5.1], [11, 8.5], [6.3, 10.4], [4, 8.5], [9.2, 11.4]].some(([a, b]) => Math.abs(x - a) < 0.7 && Math.abs(y - b) < 0.7)) return '#5b3634';
    if (s === 32 && (Math.floor(x * 2) * 3 + Math.floor(y * 2) * 7) % 29 === 0) return 4;
  }),
]);
I.pumpkin_pie = (S, style) => sprite(S, [
  L(poly([[2.1, 8.9], [6.3, 3.9], [13.4, 6.9], [12.5, 11.8], [5.2, 13]]), '#c28a4c'),
  L(poly([[2.9, 8], [6.3, 3.8], [13.4, 6.9], [8.1, 10.7]]), '#dd8535', (x, y, s) => s === 32 && Math.abs(x + 1.8 * y - 20) < 0.3 ? 4 : undefined),
  L(seg(6.3, 4.1, 13, 7, 0.65), '#e0b675', (x, y) => Math.floor(x * 1.2) % 3 === 0 ? 1 : undefined),
]);
I.cake = (S, style) => sprite(S, [
  L(poly([[2, 7], [8, 4], [14, 7], [14, 11.4], [8, 14], [2, 11.4]]), '#b67d47', (x, y, s) => y > 10.4 && y < 11.1 && x < 8 ? '#e8bf84' : s === 32 && Math.floor(x * 2 + y * 3) % 23 === 0 ? 1 : undefined),
  L(poly([[2, 6.3], [8, 3.3], [14, 6.3], [14, 8.1], [12, 8.9], [11, 8.1], [8, 10], [6.5, 8.9], [4, 8.6], [2, 9]]), '#f4e8d5', (x, y) => [[5, 6], [8.5, 4.9], [11.1, 6.7], [8, 7.8]].some(([a, b]) => el(a, b, 0.65, 0.5)(x, y)) ? '#c1454c' : undefined),
]);

// Meats use species-specific cuts: steak, chop, drumstick, whole rabbit,
// and a long rib cut. Cooking adds sear/browning and changes the silhouette.
function meat(kind, cooked) {
  const colors = { beef: '#c55358', porkchop: '#df8e82', chicken: '#e6b8a2', mutton: '#bc5158', rabbit: '#d6a090' };
  const browned = { beef: '#8b4c35', porkchop: '#bf844f', chicken: '#ce914e', mutton: '#a9603a', rabbit: '#bb7c48' };
  return (S, style) => {
    const layers = [];
    if (kind === 'chicken') {
      layers.push(L(union(seg(8.8, 9.5, 12.7, 12.7, 0.75), el(13, 12, 1.1, 1), el(12.1, 13, 1, 1)), C.bone));
      layers.push(L(poly(cooked ? [[2.5, 7], [3.8, 3.5], [7.5, 2.7], [10.5, 5.3], [10.8, 8.7], [8.5, 11], [5, 11]] : [[2.7, 6.7], [3.7, 3.5], [7.2, 3.2], [9.8, 5], [10.3, 9], [7.9, 11.3], [4.5, 10.8]]), cooked ? browned[kind] : colors[kind], (x, y, s) => cooked ? (el(5.5, 5.5, 1.2, 0.6)(x, y) ? 4 : s === 32 && Math.abs(x - y - 1) < 0.3 && y > 6 ? 1 : undefined) : Math.abs(x - y + 0.5) < 0.45 && y > 6 ? '#f3dac3' : undefined));
    } else if (kind === 'rabbit') {
      layers.push(L(union(seg(4.8, 8.3, 2.1, 6.5, 0.85), seg(9.8, 10.6, 11.1, 13.2, 0.9), seg(6.5, 11, 5.5, 13.8, 0.8)), cooked ? '#a46c44' : '#dab3a4'));
      layers.push(L(poly([[4, 6.5], [5.8, 4.2], [8.8, 4.8], [11, 7], [11.2, 10.4], [8.5, 12], [4.5, 10.5]]), cooked ? browned[kind] : colors[kind], (x, y, s) => Math.abs(x - 7.2) < (s === 32 ? 0.35 : 0.5) && y > 7 ? 1 : undefined));
      layers.push(L(union(seg(8.3, 5.3, 10.1, 2, 0.7), seg(8.7, 5.4, 12.6, 3, 0.75)), cooked ? '#b88856' : '#e2bca7'));
    } else {
      const shape = kind === 'beef' ? poly([[2, 7], [4.2, 3.6], [9, 3], [13.3, 5.1], [13, 9], [10.7, 12.7], [6.8, 13.1], [3.4, 11.3]]) : kind === 'porkchop' ? poly([[2.4, 5.5], [4.2, 3.5], [8, 3.5], [10.2, 5], [13.3, 8], [12.2, 11.5], [8.8, 13], [5.4, 11.5], [6, 8], [3.2, 8]]) : poly([[3.3, 11.6], [4.8, 7.8], [9.8, 2.5], [12.3, 3.9], [12.2, 7], [7.8, 13.4], [5.6, 13.2]]);
      layers.push(L(shape, '#e5c2a0'));
      layers.push(L((x, y) => shape(x + (cooked ? 0.8 : 0.7), y + 0.7) && shape(x - 0.5, y - 0.5), cooked ? browned[kind] : colors[kind], (x, y, s) => {
        if (cooked && [-2, 1.5].some((a) => Math.abs(x + y - 15 - a) < (s === 32 ? 0.32 : 0.5)) && x > 4 && x < 11) return 0;
        if (!cooked && Math.abs(x - y * 0.6 - (kind === 'beef' ? 1 : 3)) < (s === 32 ? 0.32 : 0.5)) return '#e8b5a6';
        if (s === 32 && el(5.5, 6, 1, 0.4)(x, y)) return 4;
      }, { outline: false }));
      if (kind === 'mutton') layers.unshift(L(union(seg(3.7, 11.2, 2.4, 13.4, 0.7), el(2.6, 13.2, 1.1, 0.8)), C.bone));
      if (kind === 'beef') layers.push(L(union(seg(9.6, 7.5, 9, 10.2, 0.45), seg(8, 7, 11, 8.1, 0.5)), cooked ? '#ceb58d' : '#f0d4be', undefined, { outline: false }));
    }
    return sprite(S, layers);
  };
}
for (const name of ['beef', 'porkchop', 'chicken', 'mutton', 'rabbit']) { I[name] = meat(name, false); I[`cooked_${name}`] = meat(name, true); }
function fish(kind, cooked) {
  const salmon = kind === 'salmon', tropical = kind === 'tropical';
  return (S, style) => {
    if (kind === 'puffer') return sprite(S, [
      L(union(poly([[2.5, 5.5], [4.9, 5.5], [5.4, 2.5], [7, 4], [10.2, 2.7], [10.9, 5], [13.7, 6], [12, 8.5], [13.3, 11], [10.4, 11.4], [8.2, 13.6], [6.5, 11.6], [3.3, 12.5], [4, 9.7], [2, 8]]), el(8, 8, 4.7, 4.3)), '#d5ac4d', (x, y, s) => y > 9 ? '#e6cf8a' : s === 32 && (Math.floor(x * 2) + Math.floor(y * 2) * 3) % 17 === 0 ? 0 : undefined),
      L(union(el(10.2, 6.8, 0.65, 0.9), el(6.7, 6.8, 0.6, 0.8)), '#332e35', undefined, { outline: false }),
      L(seg(8, 9.4, 9.2, 9.4, 0.45), '#795c39', undefined, { outline: false }),
    ]);
    const body = tropical ? poly([[4.6, 8], [8.3, 3.9], [12.2, 4.7], [13.7, 7], [11.2, 11.2], [7.5, 11.1]]) : salmon ? poly([[3.8, 9.5], [5.5, 6.9], [10.5, 3.1], [13.4, 3.4], [13.2, 6.9], [8.5, 11], [5.6, 11.7]]) : poly([[3.9, 9.1], [6.1, 5.6], [10.7, 3.8], [13.1, 4.3], [13.5, 6.7], [9.6, 10.5], [6.3, 11.4]]);
    const color = cooked ? (salmon ? '#ce805e' : '#bf9c67') : tropical ? '#e08c37' : salmon ? '#ad615c' : '#92a28a';
    const layers = [
      L(poly(tropical ? [[5.7, 8], [2, 5.2], [2.2, 11.9], [5.8, 10]] : [[5.5, 8.8], [1.8, 9.2], [2.5, 13.8], [6.6, 11]]), cooked ? '#9e714b' : tropical ? '#e1bb64' : salmon ? '#5d7970' : '#777e61'),
      L(poly(salmon ? [[7, 7], [7, 3.7], [10.6, 4.7]] : [[6.3, 7.7], [6.8, 3.9], [10, 5.1]]), cooked ? '#af764d' : tropical ? '#d1a63d' : '#697d69'),
      L(body, color, (x, y, s) => {
        if (tropical && (Math.abs(x - 7.3) < 0.7 || Math.abs(x - 11.2) < 0.65)) return '#f5e9c8';
        if (cooked && Math.abs((x + y - 12) % 3) < (s === 32 ? 0.3 : 0.5) && x < 11) return 1;
        if (!cooked && !tropical && x + y > 15.5) return salmon ? '#deb9a0' : '#d1c9a2';
        if (s === 32 && x < 10 && (Math.floor(x * 2) + Math.floor(y * 2) * 2) % 11 === 0) return 3;
      }),
      L(el(tropical ? 12 : 12.1, tropical ? 6.3 : 5.4, 0.65, 0.7), '#292b32', undefined, { outline: false }),
    ];
    if (salmon && !cooked) layers.push(L(seg(6.4, 7.7, 10.1, 4.8, 0.4), '#4d7366', undefined, { outline: false }));
    return sprite(S, layers);
  };
}
I.cod = fish('cod', false); I.cooked_cod = fish('cod', true); I.salmon = fish('salmon', false); I.cooked_salmon = fish('salmon', true); I.tropical_fish = fish('tropical', false); I.pufferfish = fish('puffer', false);
function bowlLayers(kind) {
  const layers = [L(poly([[1.7, 7.3], [14.3, 7.3], [12, 12.1], [9.6, 13.5], [6.1, 13.5], [3.5, 11.7]]), C.wood, (x, y, s) => Math.abs(y - 11) < (s === 32 ? 0.3 : 0.5) && x > 4 && x < 12 ? 1 : undefined), L(el(8, 7.1, 6.2, 2.7), '#b58450')];
  layers.push(L(el(8, 7, 5.1, 1.8), kind === 'empty' ? '#573c2c' : kind === 'beetroot' ? '#a73655' : kind === 'suspicious' ? '#786b3c' : '#b69053', undefined, { outline: false }));
  if (kind !== 'empty') {
    const garnish = kind === 'beetroot' ? [[5.2, 6.6, '#d25368'], [9.3, 7.3, '#e28b86'], [7.1, 6, C.leaf]] : kind === 'rabbit' ? [[4.7, 6.8, '#df8b36'], [8.3, 6.3, '#e7c48a'], [10.7, 7.1, '#91553c'], [6.8, 7.5, C.leaf]] : kind === 'suspicious' ? [[5.2, 6.8, '#dfc16a'], [9.6, 7, '#9b6989'], [7.8, 5.7, '#688345']] : [[5.2, 6.3, '#d4b187'], [9.8, 6.7, '#aa5144'], [7.4, 7.8, '#edd6ab']];
    garnish.forEach(([x, y, c]) => layers.push(L(el(x, y, 0.85, 0.55), c, undefined, { outline: false })));
    // Different food, not just a different soup hue: recognizable toppings
    // break the rim silhouette even at 16px. All retain the same wooden bowl.
    if (kind === 'mushroom') {
      layers.push(L(box(4.7, 5.2, 5.8, 6.8), C.cream, undefined, { outline: false }));
      layers.push(L(el(5.2, 5.2, 1.6, 0.8), '#aa6750', (x, y, s) => s === 32 && x < 5 ? 4 : undefined));
      layers.push(L(el(10.1, 6.4, 1.1, 0.6), '#bd5c4d', undefined, { outline: false }));
    } else if (kind === 'rabbit') {
      layers.push(L(poly([[4.3, 5.6], [6.6, 4.7], [7.5, 6.4], [5.2, 7.3]]), '#e5c58a'));
      layers.push(L(poly([[9.1, 4.7], [11.4, 5.5], [10.6, 7], [8.8, 6.4]]), '#d98436', undefined, { outline: false }));
    } else if (kind === 'suspicious') {
      layers.push(L(seg(7.6, 5.6, 9.5, 6.9, 0.5), '#496644', undefined, { outline: false }));
      layers.push(L(union(el(7.1, 5.1, 0.6, 0.8), el(8.1, 5.1, 0.6, 0.8), el(7.6, 5.9, 1, 0.45)), '#ddc785', undefined, { outline: false }));
      layers.push(L(el(7.6, 5.3, 0.4, 0.4), '#91627b', undefined, { outline: false }));
    }
  }
  return layers;
}
I.bowl = (S, style) => sprite(S, bowlLayers('empty'));
for (const [name, kind] of [['mushroom_stew', 'mushroom'], ['rabbit_stew', 'rabbit'], ['beetroot_soup', 'beetroot'], ['suspicious_stew', 'suspicious']]) I[name] = (S, style) => sprite(S, bowlLayers(kind));
I.rotten_flesh = (S, style) => sprite(S, [
  L(poly([[2.1, 9.1], [4.6, 6.3], [5.5, 2.9], [9.1, 3.5], [9.8, 6.1], [13.3, 7], [12.6, 10], [9.7, 9.7], [8.3, 13.5], [4.8, 12.8], [5, 10.5]]), '#a77350', (x, y, s) => el(7.2, 6, 1.1, 1.5)(x, y) || el(8.1, 11, 1.7, 0.7)(x, y) ? '#657547' : Math.abs(x + y - 14) < 0.55 ? 0 : s === 32 && Math.abs(x - 6) < 0.25 ? 4 : undefined),
]);
I.spider_eye = (S, style) => sprite(S, [
  L(union(seg(5.6, 5.9, 4.1, 3.7, 0.6), seg(10.3, 6.5, 12.2, 4.7, 0.6)), '#703847'),
  L(poly([[3, 8.2], [5.4, 5.4], [8.8, 4.9], [12, 7], [12.8, 10], [9.9, 12.3], [6.2, 12.6], [3.5, 10.8]]), '#9e3347'),
  L(el(8.2, 8.7, 2.6, 2.5), '#dc6b69'),
  L(el(8.7, 9, 1.2, 1.8), '#382737', undefined, { outline: false }),
  L(el(7, 7.3, 0.6, 0.65), '#ffd8bc', undefined, { outline: false }),
]);
I.milk_bucket = (S, style) => sprite(S, [
  L((x, y) => el(8, 5.6, 4.5, 4.1)(x, y) && !el(8, 5.6, 3.5, 3.1)(x, y), '#929ea7'),
  L(poly([[2.5, 6.1], [13.5, 6.1], [12, 12.4], [9.9, 13.5], [6.1, 13.5], [4, 12.4]]), '#aebbc1', (x, y, s) => x < 5.6 ? 4 : x > 10.5 ? 1 : s === 32 && Math.abs(x - 7) < 0.3 ? 3 : undefined),
  L(el(8, 6.2, 5.4, 2), '#6b7f8b'),
  L(el(8, 5.8, 4.4, 1.35), '#f2efdb', undefined, { outline: false }),
]);
function bottleShape(kind) {
  if (kind === 'splash') return union(el(7.5, 10.2, 4.3, 3.6), poly([[6.1, 8.5], [6.3, 4.3], [8.7, 3.1], [11, 4.1], [9.2, 5.7], [9, 8.5]]));
  if (kind === 'lingering') return union(el(8, 9.8, 5, 3.8), box(6.8, 3.4, 9.2, 8));
  if (kind === 'honey') return poly([[5, 4.3], [11, 4.3], [11, 7], [12.5, 8.4], [12.5, 12.3], [10.7, 13.6], [5.3, 13.6], [3.5, 12.3], [3.5, 8.4], [5, 7]]);
  return union(el(8, 10, 4.1, 3.7), box(6.5, 3.2, 9.5, 8));
}
function bottle(kind) {
  return (S, style) => {
    const shape = bottleShape(kind), honey = kind === 'honey', ominous = kind === 'ominous';
    const layers = [L(shape, ominous ? '#638486' : C.glass, (x, y, s) => {
      if (x < 5.3 && y > 8 && y < 11.8 || s === 32 && x < 6 && Math.abs(y - 8.2) < 0.3) return '#eff5dc';
      if (x > 10.5 && y > 9) return 0;
    })];
    if (honey || ominous) layers.push(L((x, y) => shape(x - 0.7, y) && shape(x + 0.7, y + 0.7) && y > 8, honey ? '#dba02e' : '#304b4d', (x, y, s) => honey && x < 6 ? '#ffdc66' : ominous && y > 10.5 ? 0 : undefined, { outline: false }));
    if (ominous) {
      layers.push(L(poly([[6.3, 8.9], [9.7, 8.9], [10.2, 10.7], [8.8, 11.7], [7.2, 11.7], [5.8, 10.7]]), '#c9c7ac', undefined, { outline: false }));
      layers.push(L(union(el(7, 10, 0.45, 0.5), el(9, 10, 0.45, 0.5)), '#34454c', undefined, { outline: false }));
    }
    layers.push(L(kind === 'splash' ? poly([[7, 2.8], [8.4, 1.7], [11.2, 3.3], [9.6, 4.5]]) : box(honey ? 4.9 : 6, honey ? 2.4 : 2.1, honey ? 11.1 : 10, 4), kind === 'glass' ? C.glass : '#ad8054'));
    if (honey) layers.push(L(box(5.1, 6, 10.9, 7.1), '#e3c57e', undefined, { outline: false }));
    const img = sprite(S, layers), k = S / 16;
    // Vanilla draws layer0 (tinted liquid) UNDER layer1 (bottle). These holes
    // are necessary: an opaque glass interior would hide every potion tint.
    if (!honey && !ominous) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / k, v = (y + 0.5) / k;
      if (el(8, 10.3, 3, 2.5)(u, v) && v > 8.4) img.set(x, y, [0, 0, 0, 0]);
    }
    return img;
  };
}
I.honey_bottle = bottle('honey'); I.glass_bottle = bottle('glass'); I.potion = bottle('potion'); I.splash_potion = bottle('splash'); I.lingering_potion = bottle('lingering'); I.ominous_bottle = bottle('ominous');
// Vanilla applies the potion tint to this layer. Keep neutral RGB so every
// effect's in-game tint remains correct, and leave the clear glass readable.
I.potion_overlay = (S, style) => {
  const img = new Image(S), k = S / 16;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / k, v = (y + 0.5) / k;
    if (el(8, 10.3, 3, 2.5)(u, v) && v > 8.4) { const c = u + v < 17 ? 228 : u > 9.5 ? 135 : 186; img.set(x, y, [c, c, c, 255]); }
  }
  return img;
};

// Every entry is an actual vanilla texture, NOT an item-ID inventory. In
// particular enchanted_golden_apple uses golden_apple.png plus vanilla glint.
// 'legacy' is the exact items/ basename; null means absent before 1.13.
const ITEM_SPECS = [
  { name: 'apple', legacy: 'apple' },
  { name: 'golden_apple', legacy: 'apple_golden' },
  { name: 'carrot', legacy: 'carrot' },
  { name: 'golden_carrot', legacy: 'carrot_golden' },
  { name: 'beetroot', legacy: 'beetroot', since: [1, 9, 0] },
  { name: 'potato', legacy: 'potato' },
  { name: 'baked_potato', legacy: 'potato_baked' },
  { name: 'poisonous_potato', legacy: 'potato_poisonous' },
  { name: 'melon_slice', legacy: 'melon' },
  { name: 'glistering_melon_slice', legacy: 'melon_speckled' },
  { name: 'chorus_fruit', legacy: 'chorus_fruit', since: [1, 9, 0] },
  { name: 'sweet_berries', legacy: null, since: [1, 14, 0] },
  { name: 'glow_berries', legacy: null, since: [1, 17, 0] },
  { name: 'dried_kelp', legacy: null, since: [1, 13, 0] },
  { name: 'bread', legacy: 'bread' },
  { name: 'cookie', legacy: 'cookie' },
  { name: 'pumpkin_pie', legacy: 'pumpkin_pie' },
  { name: 'cake', legacy: 'cake' },
  { name: 'beef', legacy: 'beef_raw' },
  { name: 'cooked_beef', legacy: 'beef_cooked' },
  { name: 'porkchop', legacy: 'porkchop_raw' },
  { name: 'cooked_porkchop', legacy: 'porkchop_cooked' },
  { name: 'chicken', legacy: 'chicken_raw' },
  { name: 'cooked_chicken', legacy: 'chicken_cooked' },
  { name: 'mutton', legacy: 'mutton_raw' },
  { name: 'cooked_mutton', legacy: 'mutton_cooked' },
  { name: 'rabbit', legacy: 'rabbit_raw' },
  { name: 'cooked_rabbit', legacy: 'rabbit_cooked' },
  { name: 'cod', legacy: 'fish_cod_raw' },
  { name: 'cooked_cod', legacy: 'fish_cod_cooked' },
  { name: 'salmon', legacy: 'fish_salmon_raw' },
  { name: 'cooked_salmon', legacy: 'fish_salmon_cooked' },
  { name: 'tropical_fish', legacy: 'fish_clownfish_raw' },
  { name: 'pufferfish', legacy: 'fish_pufferfish_raw' },
  { name: 'bowl', legacy: 'bowl' },
  { name: 'mushroom_stew', legacy: 'mushroom_stew' },
  { name: 'rabbit_stew', legacy: 'rabbit_stew' },
  { name: 'beetroot_soup', legacy: 'beetroot_soup', since: [1, 9, 0] },
  { name: 'suspicious_stew', legacy: null, since: [1, 14, 0] },
  { name: 'rotten_flesh', legacy: 'rotten_flesh' },
  { name: 'spider_eye', legacy: 'spider_eye' },
  { name: 'milk_bucket', legacy: 'bucket_milk' },
  { name: 'honey_bottle', legacy: null, since: [1, 15, 0] },
  { name: 'glass_bottle', legacy: 'potion_bottle_empty' },
  { name: 'potion', legacy: 'potion_bottle_drinkable' },
  { name: 'splash_potion', legacy: 'potion_bottle_splash' },
  { name: 'lingering_potion', legacy: 'potion_bottle_lingering', since: [1, 9, 0] },
  { name: 'potion_overlay', legacy: 'potion_overlay' },
  // Texture shipped with experimental 1.21 content in 1.20.5.
  { name: 'ominous_bottle', legacy: null, since: [1, 20, 5] },
];
module.exports = { I, ITEM_SPECS };
