// Original miniature voxel characters. No external skins, sprites, or assets.
export const MOB_TYPES = Object.freeze({ overworld: 'sheep', nether: 'pigman', end: 'enderman' });
export function selectMob(preset) { return Object.hasOwn(MOB_TYPES, preset) ? MOB_TYPES[preset] : MOB_TYPES.overworld; }
const clamp = (n, lo, hi, fallback) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
export function normalizeOptions(options = {}) {
  return {
    scene: options.scene === 'oneblock' ? 'oneblock' : 'island',
    mobs: options.mobs !== false,
    mobCount: Math.round(clamp(Number(options.mobCount ?? 2), 0, 3, 2)),
    speed: clamp(Number(options.speed ?? 1), 0, 3, 1),
  };
}
export function isSceneValid(scene) { return scene === 'island' || scene === 'oneblock'; }
/** Deterministic ping-pong path, no teleports at screen edges. t is seconds.
 * The route is in CSS/device pixels chosen by the caller; y is the sole plane.
 * Bounds include the sword, articulated limbs, ears and cube extrusion.
 */
export function mobPositions({ preset = 'overworld', count = 2, time = 0, speed = 1, left = 0, right = 600, ground = 180, scale = 1 } = {}) {
  count = normalizeOptions({ mobCount: count }).mobCount;
  time = Number.isFinite(time) ? time : 0;
  speed = normalizeOptions({ speed }).speed;
  const type = selectMob(preset);
  const span = Math.max(0, right - left);
  return Array.from({ length: count }, (_, i) => {
    const start = count === 1 ? .5 : .12 + i * .76 / (count - 1);
    const offset = i % 2 ? 2 - start : start;
    const p = ((offset + time * speed * 19 / Math.max(1, span)) % 2 + 2) % 2;
    const direction = p < 1 ? 1 : -1;
    const x = left + (p < 1 ? p : 2 - p) * span;
    const phase = time * speed * 5.4 + i * 2.1;
    return { type, x, y: ground, direction, phase, scale,
      bounds: { left: x - 33 * scale, right: x + 33 * scale, top: ground - 68 * scale, bottom: ground + 3 * scale } };
  });
}

function tint(hex, factor) {
  const v = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round((v >> 16) * factor)},${Math.round((v >> 8 & 255) * factor)},${Math.round((v & 255) * factor)})`;
}
/** Coordinates use a common 64px-high model space, feet at y=0. */
export function drawMob(ctx, mob) {
  const { type, x, y, scale, direction, phase } = mob;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // Contact shadow remains horizontal and does not bob with the body.
  ctx.fillStyle = type === 'enderman' ? 'rgba(24,10,38,.35)' : 'rgba(20,15,17,.26)';
  ctx.beginPath(); ctx.ellipse(0, 1, type === 'sheep' ? 23 : 14, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(direction, 1);
  const stride = Math.sin(phase) * 0.32;
  const bob = Math.abs(Math.sin(phase)) * 0.9;
  ctx.translate(0, -bob);
  const pixel = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const poly = (points, color) => { ctx.fillStyle = color; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); };
  function box(x, y, w, h, d, color) {
    pixel(x, y, w, h, color);
    poly([[x, y], [x + d, y - d * .6], [x + w + d, y - d * .6], [x + w, y]], tint(color, 1.12));
    poly([[x + w, y], [x + w + d, y - d * .6], [x + w + d, y + h - d * .6], [x + w, y + h]], tint(color, .73));
  }
  function limb(x, y, w, h, angle, color, hoof) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    box(-w / 2, 0, w, h, 2, color);
    if (hoof) box(-w / 2, h - 4, w, 4, 2, hoof);
    ctx.restore();
  }
  if (type === 'sheep') {
    // Rear legs first; thick fleece, lean bare shins, protruding pink muzzle.
    limb(-14, -17, 5, 17, -stride, '#857461', '#47413e');
    limb(12, -17, 5, 17, stride, '#857461', '#47413e');
    box(-24, -39, 39, 25, 9, '#e0e1d6');
    [[-21,-35,6,5],[-9,-38,8,4],[4,-29,8,6],[-19,-19,9,4],[-7,-25,5,5]].forEach(([x,y,w,h]) => pixel(x,y,w,h,'#c9ccbf'));
    pixel(-17,-36,4,3,'#f5f2e6'); pixel(-3,-31,5,4,'#eeeede');
    limb(-17, -15, 6, 15, stride, '#b7a38d', '#4e4945');
    limb(10, -15, 6, 15, -stride, '#b7a38d', '#4e4945');
    box(10, -44, 15, 18, 6, '#edeadf');
    box(21, -37, 8, 12, 3, '#baa58d');
    pixel(25,-31,5,4,'#d29b98'); pixel(27,-30,2,1,'#805f63');
    pixel(22,-39,3,3,'#302b31'); pixel(22,-39,1,1,'#faf2dc');
    box(9,-37,5,6,2,'#bda88c');
    box(-27,-31,4,9,3,'#e1e1d5');
  } else if (type === 'pigman') {
    limb(-6,-25,6,25,-stride,'#8eae83','#78654f');
    limb(-10,-43,5,23,stride,'#809b73');
    box(-10,-46,18,23,6,'#c08c82');
    pixel(-9,-43,7,9,'#7e9d70'); pixel(-3,-35,7,7,'#8aa276');
    pixel(-8,-29,16,5,'#695140'); pixel(-2,-27,5,4,'#d5b87a');
    limb(5,-25,6,25,stride,'#b68a7d','#78654f');
    box(-10,-62,19,17,6,'#c49888');
    pixel(-10,-61,8,8,'#8ba97b'); pixel(-8,-53,4,6,'#d9cfaa');
    box(-12,-61,4,7,2,'#c99b89'); box(7,-61,4,7,2,'#c99b89');
    box(7,-55,8,6,3,'#d2a08c'); pixel(12,-53,2,2,'#77514d');
    pixel(3,-58,3,3,'#302c2d'); pixel(-6,-57,3,3,'#e9dfb4');
    // A proper crossguard, grip and bevelled golden blade carried forward.
    ctx.save(); ctx.translate(12,-32); ctx.rotate(-.28 + stride*.2);
    box(-1,-23,4,24,2,'#e5b844'); pixel(-1,-23,1,21,'#fff0a4');
    box(-6,0,14,3,2,'#c89229'); box(0,3,3,8,1,'#66503b');
    ctx.restore();
    limb(8,-43,6,21,-stride*.6,'#c69985'); pixel(6,-35,4,6,'#8ca47c');
  } else {
    // Very long limbs and a compact square skull distinguish End silhouettes.
    limb(-5,-32,4,32,-stride*.65,'#242031');
    limb(-10,-49,3,38,stride*.6,'#272136');
    box(-8,-50,14,19,4,'#211e2c'); pixel(-6,-48,2,14,'#30293d');
    limb(4,-32,4,32,stride*.65,'#302a3e');
    limb(7,-49,3,38,-stride*.6,'#332a44');
    box(-10,-63,19,14,4,'#211d2e');
    pixel(-7,-57,6,2,'#d69eff'); pixel(3,-57,6,2,'#d69eff');
    pixel(-5,-57,2,2,'#fcdbff'); pixel(5,-57,2,2,'#fcdbff');
    ctx.globalAlpha = .65;
    for (let i=0;i<4;i++) { const px = -23 + i*14; const py = -15 - ((i*17 + phase*3)%43+43)%43; pixel(px,py,2,2,'#b47ce5'); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
