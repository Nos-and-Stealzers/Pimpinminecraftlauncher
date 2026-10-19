// Hotbar, HUD icons, buttons and the legacy widgets.png atlas. GUI art stays
// at 1× in both packs (crisp next to the game font); 'perf' is flat and calm,
// 'looks' adds bevels, a violet tint and gold trim.
const { Image, rgba, mixc, ramp } = require('./lib');

const isP = (st) => st === 'looks';
const C = (h, a = 255) => [...rgba(h).slice(0, 3), a];

function theme(st) {
  return isP(st)
    ? {
      outline: C('#0c0812'), slot: C('#2a2138', 215), slotHi: C('#4a3c62', 230), slotLo: C('#150f1e', 230), frameHi: C('#6c5890'), trim: C('#f2c14e'), trimLo: C('#a8761e'), trimHi: C('#fff1b8'),
      sel: C('#ffe08a'), selLo: C('#c48a24'), selHi: C('#fffbe6'),
      btn: ramp('#4e4466', 5, { contrast: 0.5, hue: 16 }), btnHover: ramp('#6a5a92', 5, { contrast: 0.5, hue: 16 }), btnOff: ramp('#3a3742', 5, { contrast: 0.35 }),
    }
    : {
      outline: C('#0e0f12'), slot: C('#2b2e36', 200), slotHi: C('#41454f', 215), slotLo: C('#17191e', 215), frameHi: C('#555a66'), trim: C('#7a808c'), trimLo: C('#4a4f59'), trimHi: C('#a6acb8'),
      sel: C('#f2f4f8'), selLo: C('#9aa0ac'), selHi: C('#ffffff'),
      btn: ramp('#4a4f5c', 5, { contrast: 0.45, hue: 10 }), btnHover: ramp('#5c6578', 5, { contrast: 0.45, hue: 10 }), btnOff: ramp('#34363c', 5, { contrast: 0.3 }),
    };
}

const rect = (img, x, y, w, h, c) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) img.set(x + i, y + j, c);
};

/** One recessed 20×20 slot cell drawn at (x, y). */
function slot(img, x, y, t, P) {
  rect(img, x, y, 20, 20, t.slot);
  rect(img, x, y, 20, 1, t.slotLo);
  rect(img, x, y, 1, 20, t.slotLo);
  rect(img, x, y + 19, 20, 1, t.slotHi);
  rect(img, x + 19, y, 1, 20, t.slotHi);
  if (P) {
    img.set(x + 1, y + 1, t.slotLo);
    img.set(x + 18, y + 18, t.frameHi);
  }
}

function hotbar(st, img = new Image(182, 22), ox = 0, oy = 0) {
  const P = isP(st);
  const t = theme(st);
  rect(img, ox, oy, 182, 22, t.outline);
  for (let i = 0; i < 9; i++) slot(img, ox + 1 + i * 20, oy + 1, t, P);
  if (P) {
    // gold studs between slots and on the ends
    for (let i = 0; i <= 9; i++) {
      const x = ox + i * 20 + (i === 9 ? 1 : 0);
      img.set(x, oy, t.trim);
      img.set(x, oy + 21, t.trimLo);
    }
    img.set(ox, oy + 10, t.trim);
    img.set(ox, oy + 11, t.trimLo);
    img.set(ox + 181, oy + 10, t.trim);
    img.set(ox + 181, oy + 11, t.trimLo);
  }
  return img;
}

/** Selection frame: 24 wide, frame bottom on row h-1 (h=23 modern, 22 legacy). */
function selection(st, h = 23, img = new Image(24, h), ox = 0, oy = 0) {
  const P = isP(st);
  const t = theme(st);
  const box = (x0, y0, w, hh, c) => {
    rect(img, ox + x0, oy + y0, w, 1, c);
    rect(img, ox + x0, oy + y0 + hh - 1, w, 1, c);
    rect(img, ox + x0, oy + y0, 1, hh, c);
    rect(img, ox + x0 + w - 1, oy + y0, 1, hh, c);
  };
  box(0, 0, 24, h, t.outline);
  box(1, 1, 22, h - 2, t.sel);
  box(2, 2, 20, h - 4, P ? t.selLo : t.sel);
  // round the corners and light the top-left
  for (const [x, y] of [[0, 0], [23, 0], [0, h - 1], [23, h - 1]]) img.set(ox + x, oy + y, [0, 0, 0, 0]);
  for (const [x, y] of [[1, 1], [22, 1], [1, h - 2], [22, h - 2]]) img.set(ox + x, oy + y, t.outline);
  rect(img, ox + 2, oy + 1, 6, 1, t.selHi);
  rect(img, ox + 1, oy + 2, 1, 5, t.selHi);
  if (P) {
    // a little gem on top
    rect(img, ox + 10, oy, 4, 1, C('#ff5fb6'));
    img.set(ox + 11, oy, C('#ffd0ea'));
  }
  return img;
}

/** Offhand slot: 29×24 with the 22×22 slot on the left (or right). */
function offhand(st, side, img = new Image(29, 24), ox = 0, oy = 0) {
  const P = isP(st);
  const t = theme(st);
  const x0 = ox + (side === 'left' ? 0 : 7);
  rect(img, x0, oy + 1, 22, 22, t.outline);
  slot(img, x0 + 1, oy + 2, t, P);
  for (const [x, y] of [[0, 0], [21, 0], [0, 21], [21, 21]]) img.set(x0 + x, oy + 1 + y, [0, 0, 0, 0]);
  if (P) img.set(x0 + 11, oy + 1, t.trim);
  return img;
}

/** 200×20 button; uniform rows so both 9-slice and legacy half-stitching work. */
function button(st, state = 'normal', img = new Image(200, 20), ox = 0, oy = 0) {
  const P = isP(st);
  const t = theme(st);
  const r = state === 'hover' ? t.btnHover : state === 'disabled' ? t.btnOff : t.btn;
  const w = 200;
  const outline = state === 'hover' ? (P ? t.trim : C('#f2f4f8')) : t.outline;
  for (let y = 0; y < 20; y++) {
    const c = y < 9 ? r[2] : r[1];
    rect(img, ox, oy + y, w, 1, c);
  }
  if (P && state !== 'disabled') rect(img, ox + 2, oy + 2, w - 4, 1, r[3]);
  // bevel
  rect(img, ox + 1, oy + 1, w - 2, 1, r[state === 'disabled' ? 2 : 4]);
  rect(img, ox + 1, oy + 1, 1, 18, r[state === 'disabled' ? 2 : 3]);
  rect(img, ox + 1, oy + 17, w - 2, 2, r[0]);
  rect(img, ox + w - 2, oy + 1, 1, 18, r[0]);
  // outline with rounded corners
  rect(img, ox, oy, w, 1, outline);
  rect(img, ox, oy + 19, w, 1, outline);
  rect(img, ox, oy, 1, 20, outline);
  rect(img, ox + w - 1, oy, 1, 20, outline);
  if (P) for (const [x, y] of [[0, 0], [w - 1, 0], [0, 19], [w - 1, 19]]) img.set(ox + x, oy + y, [0, 0, 0, 0]);
  return img;
}

// ------------------------------------------------------------ 9×9 icons --
const HEART = ['.OOO.OOO.', 'OIIIOIIIO', 'OIIIIIIIO', 'OIIIIIIIO', '.OIIIIIO.', '..OIIIO..', '...OIO...', '....O....', '.........'];
const HEART_HC = ['O.O...O.O', 'OOOO.OOOO', 'OIIIOIIIO', 'OIIIIIIIO', '.OIIIIIO.', '..OIIIO..', '...OIO...', '....O....', '.........'];
const FOOD = ['.OOOO....', 'OIIIIO...', 'OIIIIIO..', 'OIIIIIO..', '.OIIIIO..', '..OOIIO..', '....OBBO.', '.....OBBO', '......OO.'];
const ARMOR = ['.OO...OO.', 'OIIO.OIIO', 'OIIIOIIIO', 'OIIIIIIIO', '.OIIIIIO.', '.OIIIIIO.', '.OIIIIIO.', '.OIIIIIO.', '..OOOOO..'];
const BUBBLE = ['..OOOOO..', '.OIIIIIO.', 'OIHHIIIIO', 'OIHIIIIIO', 'OIIIIIIIO', 'OIIIIIIIO', 'OIIIIIIIO', '.OIIIIIO.', '..OOOOO..'];

/**
 * Draw a 9×9 icon from a mask. parts: 'outline' | 'fill' | 'container'
 * fill colours: [shadow, base, light, shine]; half: 'left' | 'right' | null.
 */
function icon(mask, { part = 'fill', fill, outline = '#160b10', empty = '#3a1a20', half = null, bone = '#efe6cf', st } = {}) {
  const P = isP(st);
  const img = new Image(9, 9);
  const [sh, base, light, shine] = fill ? fill.map((c) => C(c)) : [];
  mask.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    if (ch === 'O') {
      if (part !== 'fill') img.set(x, y, C(outline));
      return;
    }
    if (part === 'outline') return;
    if (part === 'container') return img.set(x, y, C(empty));
    if (half === 'left' && x > 4) return;
    if (half === 'right' && x < 4) return;
    if (ch === 'B') return img.set(x, y, C(bone));
    // shading: shine top-left, shadow along the bottom-right edge
    const below = mask[y + 1] ? mask[y + 1][x] : 'O';
    const right = row[x + 1] || 'O';
    let c = base;
    if (ch === 'H') c = shine;
    else if (below === 'O' || below === '.' || (P && (right === 'O' || right === '.'))) c = sh;
    else if (y <= 2 && x <= 3) c = light;
    img.set(x, y, c);
  }));
  if (part === 'fill' && shine && (mask === HEART || mask === HEART_HC) && half !== 'right') {
    img.set(2, 2, shine);
    if (P) img.set(1, 2, light);
  }
  return img;
}

const HEARTS = {
  normal: ['#8e1220', '#d8283a', '#ff6670', '#ffd6d8'],
  poisoned: ['#3e5a10', '#7aa21e', '#a8d23c', '#e6ffb0'],
  withered: ['#141214', '#2e2a2e', '#4a444c', '#8a8290'],
  frozen: ['#2a6e96', '#56b6dc', '#9ee4f6', '#eafcff'],
  absorbing: ['#a4741a', '#e8b42c', '#ffd862', '#fff6cc'],
  vehicle: ['#9a4c14', '#e0822a', '#ffb05a', '#ffe6c8'],
};

const blinkify = (cols) => cols.map((c) => `#${mixc(rgba(c), [255, 255, 255, 255], 0.45).slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`);

/** All the modern GUI sprites, as { path (under textures/gui/sprites/), image, mcmeta? }. */
function sprites(st) {
  const out = [];
  const add = (p, img, meta) => out.push({ path: p, img, meta });
  add('hud/hotbar', hotbar(st));
  add('hud/hotbar_selection', selection(st, 23));
  add('hud/hotbar_offhand_left', offhand(st, 'left'));
  add('hud/hotbar_offhand_right', offhand(st, 'right'));
  // hearts
  for (const hc of [false, true]) {
    const mask = hc ? HEART_HC : HEART;
    const pre = hc ? 'hardcore_' : '';
    add(`hud/heart/container${hc ? '_hardcore' : ''}`, icon(mask, { part: 'container', st }));
    add(`hud/heart/container${hc ? '_hardcore' : ''}_blinking`, icon(mask, { part: 'container', outline: '#f4f0f0', st }));
    for (const [kind, cols] of Object.entries(HEARTS)) {
      if (kind === 'vehicle') continue;
      const k = kind === 'normal' ? '' : `${kind}_`;
      for (const h of ['full', 'half']) {
        add(`hud/heart/${k}${pre}${h}`, icon(mask, { fill: cols, half: h === 'half' ? 'left' : null, st }));
        add(`hud/heart/${k}${pre}${h}_blinking`, icon(mask, { fill: blinkify(cols), half: h === 'half' ? 'left' : null, st }));
      }
    }
  }
  add('hud/heart/vehicle_container', icon(HEART, { part: 'container', st }));
  add('hud/heart/vehicle_full', icon(HEART, { fill: HEARTS.vehicle, st }));
  add('hud/heart/vehicle_half', icon(HEART, { fill: HEARTS.vehicle, half: 'left', st }));
  // food
  const meat = ['#7a3a14', '#c46a2a', '#e8984a', '#ffe0b0'];
  const rotten = ['#4a5a1a', '#7c8e2c', '#a6b84a', '#e0f0a0'];
  add('hud/food_empty', icon(FOOD, { part: 'container', empty: '#2c1a12', st }));
  add('hud/food_empty_hunger', icon(FOOD, { part: 'container', empty: '#22280e', outline: '#141a06', st }));
  add('hud/food_full', icon(FOOD, { fill: meat, st }));
  add('hud/food_half', icon(FOOD, { fill: meat, half: 'right', st }));
  add('hud/food_full_hunger', icon(FOOD, { fill: rotten, bone: '#d6dcb0', st }));
  add('hud/food_half_hunger', icon(FOOD, { fill: rotten, bone: '#d6dcb0', half: 'right', st }));
  // armor: complete icons
  const steel = ['#7c8494', '#bcc4d0', '#e2e8f0', '#ffffff'];
  const armor = (half) => {
    const img = icon(ARMOR, { part: 'container', outline: '#14161c', empty: '#2a2d36', st });
    const f = icon(ARMOR, { fill: steel, half: half ? 'left' : null, st });
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (f.get(x, y)[3]) img.set(x, y, f.get(x, y));
    return img;
  };
  add('hud/armor_empty', icon(ARMOR, { part: 'container', outline: '#14161c', empty: '#2a2d36', st }));
  add('hud/armor_half', armor(true));
  add('hud/armor_full', armor(false));
  // air bubbles
  const water = ['#2a6ec8', '#4a9ce8', '#8ccaf8', '#ffffff'];
  add('hud/air', icon(BUBBLE, { fill: water, outline: '#0e2a5a', st }));
  const burst = icon(BUBBLE, { fill: water, outline: '#0e2a5a', st });
  for (const [x, y] of [[4, 0], [0, 4], [8, 4], [4, 8], [3, 3], [4, 4], [5, 5]]) burst.set(x, y, [0, 0, 0, 0]);
  add('hud/air_bursting', burst);
  add('hud/air_empty', icon(BUBBLE, { part: 'outline', outline: '#2a4a7a', st }));
  // experience bar
  add('hud/experience_bar_background', xpBar(st, false));
  add('hud/experience_bar_progress', xpBar(st, true));
  // buttons (nine-slice like vanilla: 200×20 with a 3 px border)
  const nine = { gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 3 } } };
  add('widget/button', button(st, 'normal'), nine);
  add('widget/button_highlighted', button(st, 'hover'), nine);
  add('widget/button_disabled', button(st, 'disabled'), nine);
  return out;
}

function xpBar(st, full) {
  const P = isP(st);
  const img = new Image(182, 5);
  const out = C('#0a0c08');
  const track = full ? (P ? [C('#3c8a12'), C('#7ee23a'), C('#c8ff8a')] : [C('#4a9a1c'), C('#80dc40'), C('#b8f080')]) : [C('#1c2018'), C('#2c3226'), C('#3c4434')];
  rect(img, 0, 0, 182, 5, out);
  rect(img, 1, 1, 180, 3, track[1]);
  rect(img, 1, 1, 180, 1, track[2]);
  rect(img, 1, 3, 180, 1, track[0]);
  for (let x = 20; x < 182; x += 20) rect(img, x, 1, 1, 3, full ? track[0] : out);
  return img;
}

/** Legacy (1.8.9 – 1.20.1) gui/widgets.png: every region the game reads from it. */
function widgetsAtlas(st) {
  const img = new Image(256, 256);
  hotbar(st, img, 0, 0);
  selection(st, 22, img, 0, 22);
  offhand(st, 'left', img, 24, 22);
  offhand(st, 'right', img, 53, 22);
  button(st, 'disabled', img, 0, 46);
  button(st, 'normal', img, 0, 66);
  button(st, 'hover', img, 0, 86);
  // language button (20×20): normal at y=106, hover at y=126, with a globe
  const small = (x, y, state) => {
    const b = button(st, state, new Image(200, 20));
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) img.set(x + i, y + j, b.get(i < 10 ? i : 200 - 20 + i, j));
  };
  const globe = (x, y) => {
    const g = ['..bbbb..', '.bgbbgb.', 'bggbbggb', 'bbgggbbb', 'bbbggbgb', 'bgbbbggb', '.bggbbb.', '..bbbb..'];
    g.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && img.set(x + 6 + i, y + 6 + j, ch === 'b' ? C('#3a8ad8') : C('#5ac85a'))));
  };
  small(0, 106, 'normal');
  globe(0, 106);
  small(0, 126, 'hover');
  globe(0, 126);
  // difficulty lock button: locked / unlocked × normal, hover, disabled
  const lock = (x, y, open, dim) => {
    const body = dim ? C('#8a8a90') : C('#e8c454');
    const dark = dim ? C('#55555c') : C('#9a7420');
    const shackle = dim ? C('#9a9aa2') : C('#d8dce4');
    const sh = open ? ['..sss...', '.s...s..', '.s......', '.s......'] : ['..sss...', '.s...s..', '.s...s..', '.s...s..'];
    sh.forEach((row, j) => [...row].forEach((ch, i) => ch === 's' && img.set(x + 6 + i + (open ? -1 : 0), y + 4 + j, shackle)));
    rect(img, x + 6, y + 8, 7, 6, body);
    rect(img, x + 6, y + 13, 7, 1, dark);
    rect(img, x + 9, y + 10, 1, 2, dark);
  };
  [['normal', 146], ['hover', 166], ['disabled', 186]].forEach(([state, y]) => {
    small(0, y, state);
    small(20, y, state);
    lock(0, y, false, state === 'disabled');
    lock(20, y, true, state === 'disabled');
  });
  return img;
}

module.exports = { sprites, widgetsAtlas, hotbar, selection, button, icon, HEART, theme };
