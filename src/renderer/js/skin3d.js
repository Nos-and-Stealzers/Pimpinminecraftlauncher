// CSS-3D player model built from the real skin texture. Drag to turn it,
// click to wave, the head follows the mouse.
import { el } from './dom.js';
import { api } from './state.js';

// [w, h, d] box, UV origin of the base and overlay layers, position on the 16×32 body
const PARTS = {
  head: { box: [8, 8, 8], base: [0, 0], over: [32, 0], pos: [4, 0], pivot: '50% 100%', inflate: 1 },
  body: { box: [8, 12, 4], base: [16, 16], over: [16, 32], pos: [4, 8], pivot: '50% 50%', inflate: 0.5 },
  rarm: { box: [4, 12, 4], base: [40, 16], over: [40, 32], pos: [0, 8], pivot: '50% 2px', inflate: 0.5 },
  larm: { box: [4, 12, 4], base: [32, 48], over: [48, 48], pos: [12, 8], pivot: '50% 2px', inflate: 0.5 },
  rleg: { box: [4, 12, 4], base: [0, 16], over: [0, 32], pos: [4, 20], pivot: '50% 0', inflate: 0.5 },
  lleg: { box: [4, 12, 4], base: [16, 48], over: [0, 48], pos: [8, 20], pivot: '50% 0', inflate: 0.5 },
};

// legacy 64×32 skins, and slim (Alex) arms detected by the empty column at x=54
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
      // unreadable canvas, treat it as a classic skin
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
    const over = legacy && name !== 'head' ? null : p.over;
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
      layer.style.transform = `${mirror ? 'scaleX(-1) ' : ''}scale3d(${(w + k) / w}, ${(h + k) / h}, ${(d + k) / d})`;
      part.append(layer);
    }
    model.append(part);
  }
  return model;
}

/** Mounts the model into `root`. Resolves to a cleanup function, or null when the skin can't be loaded. */
export async function mountSkin(root, player, scale = 6) {
  let src;
  try {
    src = await api.call('skin:get', player);
  } catch {
    return null;
  }
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => {});
  if (!root.isConnected) return null;

  const stage = el('div', { class: 'mc-stage', title: 'Drag to turn, click to wave' });
  const spin = el('div', { class: 'mc-spin' });
  const model = buildModel(src, scale, analyse(img));
  spin.append(model);
  stage.append(spin);
  root.replaceChildren(stage);

  const head = model.querySelector('.part.head');
  let yaw = -25;
  let vel = 0;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let raf = 0;
  let look = { x: 0, y: 0 };
  let lastBody = '';
  let lastFace = '';

  const tick = () => {
    if (!stage.isConnected) return;
    if (!dragging && Math.abs(vel) > 0.02) {
      yaw += vel;
      vel *= 0.92;
    }
    const body = `rotateX(-6deg) rotateY(${yaw.toFixed(1)}deg)`;
    const face = `rotateY(${look.x.toFixed(1)}deg) rotateX(${look.y.toFixed(1)}deg)`;
    if (body !== lastBody) spin.style.transform = lastBody = body;
    if (face !== lastFace) head.style.transform = lastFace = face;
    raf = requestAnimationFrame(tick);
  };
  stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    lastX = e.clientX;
    vel = 0;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('grab');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    if (Math.abs(dx) > 1) moved = true;
    yaw += dx * 0.6;
    vel = dx * 0.6;
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('grab');
    if (!moved && e.type === 'pointerup') {
      model.classList.remove('wave');
      void model.offsetWidth;
      model.classList.add('wave');
    }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  model.addEventListener('animationend', (e) => e.animationName === 'mc-wave' && model.classList.remove('wave'));

  const onMove = (e) => {
    const r = stage.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
    const dy = (e.clientY - (r.top + r.height * 0.2)) / window.innerHeight;
    look = { x: Math.max(-40, Math.min(40, dx * 90)), y: Math.max(-25, Math.min(25, -dy * 60)) };
  };
  window.addEventListener('pointermove', onMove);
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
  };
}
