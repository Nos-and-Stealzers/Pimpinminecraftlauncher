// 3D effects without WebGL: a CSS-3D player model built from the real skin
// texture (drag to spin, head follows the mouse), floating 3D blocks and a
// perspective tilt for cards.
import { el } from './dom.js';
import { api, state } from './state.js';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const effectsOn = () => state.settings?.effects3d !== false;

// ------------------------------------------------------------ skin model --
// UV origins in the 64×64 skin texture: [u, v, w, h, d] for base and overlay.
const PARTS = {
  head: { box: [8, 8, 8], base: [0, 0], over: [32, 0], pos: [4, 0], pivot: '50% 100%', inflate: 1 },
  body: { box: [8, 12, 4], base: [16, 16], over: [16, 32], pos: [4, 8], pivot: '50% 50%', inflate: 0.5 },
  rarm: { box: [4, 12, 4], base: [40, 16], over: [40, 32], pos: [0, 8], pivot: '50% 2px', inflate: 0.5 },
  larm: { box: [4, 12, 4], base: [32, 48], over: [48, 48], pos: [12, 8], pivot: '50% 2px', inflate: 0.5 },
  rleg: { box: [4, 12, 4], base: [0, 16], over: [0, 32], pos: [4, 20], pivot: '50% 0', inflate: 0.5 },
  lleg: { box: [4, 12, 4], base: [16, 48], over: [0, 48], pos: [8, 20], pivot: '50% 0', inflate: 0.5 },
};

/** Inspect the texture: legacy 64×32 skins and slim (Alex) arms. */
function analyse(img) {
  const legacy = img.naturalHeight === 32;
  let slim = false;
  if (!legacy) {
    try {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(54, 20, 2, 12).data;
      slim = [...px].filter((_, i) => i % 4 === 3).every((a) => a === 0);
    } catch {
      /* tainted / unreadable: assume classic */
    }
  }
  return { legacy, slim };
}

function cuboid(src, S, texH, [w, h, d], [u, v], mirror) {
  const W = w * S;
  const H = h * S;
  const D = d * S;
  const face = (cls, fw, fh, fu, fv, transform) =>
    el('div', {
      class: `face ${cls}`,
      style: {
        width: `${fw * S}px`,
        height: `${fh * S}px`,
        left: `${(W - fw * S) / 2}px`,
        top: `${(H - fh * S) / 2}px`,
        backgroundImage: `url("${src}")`,
        backgroundSize: `${64 * S}px ${texH * S}px`,
        backgroundPosition: `${-fu * S}px ${-fv * S}px`,
        transform,
      },
    });
  return el('div', { class: 'cuboid', style: { width: `${W}px`, height: `${H}px`, transform: mirror ? 'scaleX(-1)' : null } },
    face('front', w, h, u + d, v + d, `translateZ(${D / 2}px)`),
    face('back', w, h, u + 2 * d + w, v + d, `rotateY(180deg) translateZ(${D / 2}px)`),
    face('right', d, h, u, v + d, `rotateY(-90deg) translateZ(${W / 2}px)`),
    face('left', d, h, u + d + w, v + d, `rotateY(90deg) translateZ(${W / 2}px)`),
    face('top', w, d, u + d, v, `rotateX(90deg) translateZ(${H / 2}px)`),
    face('bottom', w, d, u + d + w, v, `rotateX(-90deg) translateZ(${H / 2}px) scaleY(-1)`),
  );
}

function buildModel(src, S, { legacy, slim }) {
  const texH = legacy ? 32 : 64;
  const model = el('div', { class: 'mc-model', style: { width: `${16 * S}px`, height: `${32 * S}px` } });
  for (const [name, p] of Object.entries(PARTS)) {
    let [w, h, d] = p.box;
    let base = p.base;
    let over = legacy && name !== 'head' ? null : p.over;
    let mirror = false;
    let left = p.pos[0];
    if (slim && (name === 'rarm' || name === 'larm')) {
      w = 3;
      if (name === 'rarm') left += 1;
    }
    if (legacy && (name === 'larm' || name === 'lleg')) {
      base = PARTS[name === 'larm' ? 'rarm' : 'rleg'].base; // old skins mirror the right limbs
      mirror = true;
    }
    const part = el('div', { class: `part ${name}`, style: { left: `${left * S}px`, top: `${p.pos[1] * S}px`, width: `${w * S}px`, height: `${h * S}px`, transformOrigin: p.pivot.replace('2px', `${2 * S}px`) } },
      cuboid(src, S, texH, [w, h, d], base, mirror));
    if (over) {
      const layer = cuboid(src, S, texH, [w, h, d], over, mirror);
      const k = p.inflate;
      layer.classList.add('overlay');
      layer.style.transform = `${mirror ? 'scaleX(-1) ' : ''}scale3d(${(w + k) / w}, ${(h + k) / h}, ${(d + k) / d})`;
      part.append(layer);
    }
    model.append(part);
  }
  return model;
}

/**
 * Mount a 3D player into `root`. Resolves to a cleanup function. Falls back to
 * a floating block when the skin can't be loaded (offline).
 */
export async function mountSkin(root, player, { scale = 8 } = {}) {
  let src;
  try {
    src = await api.call('skin:get', player);
  } catch {
    root.append(blockScene());
    return () => {};
  }
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => {});
  const stage = el('div', { class: 'mc-stage', title: 'Drag to spin · click to wave' });
  const spin = el('div', { class: 'mc-spin' });
  const model = buildModel(src, scale, analyse(img));
  spin.append(model);
  stage.append(spin);
  root.append(stage);

  const head = model.querySelector('.part.head');
  let yaw = -28;
  let pitch = -8;
  let vel = 0;
  let dragging = false;
  let lastX = 0;
  let idle = 0;
  let raf = 0;
  let look = { x: 0, y: 0 };
  const still = reduced();

  const apply = () => {
    spin.style.transform = `rotateX(${pitch}deg) rotateY(${yaw}deg)`;
    head.style.transform = `rotateY(${look.x}deg) rotateX(${look.y}deg)`;
  };
  const tick = (t) => {
    if (!stage.isConnected) return;
    if (!dragging) {
      yaw += vel;
      vel *= 0.94;
      if (Math.abs(vel) < 0.02 && !still) {
        idle += 1;
        // Ease back into a gentle sway after the user lets go.
        const target = -28 + Math.sin(t / 2600) * 22;
        yaw += (target - yaw) * Math.min(0.02, idle / 6000);
      }
    }
    apply();
    raf = requestAnimationFrame(tick);
  };
  stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    vel = 0;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('grab');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    yaw += dx * 0.6;
    vel = dx * 0.6;
    idle = 0;
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('grab');
    if (Math.abs(vel) < 0.5 && e.type === 'pointerup') {
      model.classList.remove('wave');
      void model.offsetWidth;
      model.classList.add('wave');
    }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  model.addEventListener('animationend', (e) => e.animationName === 'mc-wave' && model.classList.remove('wave'));

  // Head turns towards the mouse, like the title-screen panorama characters.
  const onMove = (e) => {
    if (!stage.isConnected) return window.removeEventListener('pointermove', onMove);
    const r = stage.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
    const dy = (e.clientY - (r.top + r.height * 0.2)) / window.innerHeight;
    look = { x: Math.max(-40, Math.min(40, dx * 90)), y: Math.max(-25, Math.min(25, -dy * 60)) };
  };
  window.addEventListener('pointermove', onMove);
  apply();
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
  };
}

// ---------------------------------------------------------------- blocks --
/** A 3D block with six faces; `kind` picks the look (grass, diamond, …). */
export function cube3d(kind = 'grass', size = 80) {
  const h = size / 2;
  const faces = [
    ['front', `translateZ(${h}px)`],
    ['back', `rotateY(180deg) translateZ(${h}px)`],
    ['right', `rotateY(90deg) translateZ(${h}px)`],
    ['left', `rotateY(-90deg) translateZ(${h}px)`],
    ['top', `rotateX(90deg) translateZ(${h}px)`],
    ['bottom', `rotateX(-90deg) translateZ(${h}px)`],
  ];
  return el('div', { class: `cube3d b-${kind}`, style: { width: `${size}px`, height: `${size}px` } },
    faces.map(([f, t]) => el('div', { class: `cf ${f}`, style: { transform: t } })));
}

/** Floating blocks for the hero when there's no skin to show. */
export function blockScene() {
  const kinds = [['grass', 110], ['diamond', 54], ['gold', 64], ['emerald', 36], ['tnt', 46]];
  return el('div', { class: 'block-scene' }, kinds.map(([k, s], i) => el('div', { class: `float f${i}` }, cube3d(k, s))));
}

// ------------------------------------------------------------------ tilt --
const TILT = '.inst-card:not(.new), .feature, .card.news, .card.proj, .world-row, .srv-stat';

/** Cards lean towards the cursor with a soft glare. Installed once. */
export function installTilt() {
  let current = null;
  const reset = (card) => {
    card.style.transform = '';
    card.classList.remove('tilting');
  };
  document.addEventListener('pointermove', (e) => {
    if (!effectsOn() || reduced()) return;
    const card = e.target.closest?.(TILT);
    if (current && current !== card) reset(current);
    current = card;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const max = r.width > 360 ? 3 : 7;
    card.classList.add('tilting');
    card.style.setProperty('--gx', `${x * 100}%`);
    card.style.setProperty('--gy', `${y * 100}%`);
    card.style.transform = `perspective(800px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) translateY(-3px)`;
  });
  document.addEventListener('pointerleave', () => current && reset(current));
}
