// Title-screen style backdrop for the optional Minecraft style: a floating
// voxel island drawn on a plain 2D canvas (no WebGL). Orthographic camera,
// so every block face is a parallelogram and an affine drawImage maps the
// 16x16 texture onto it exactly, nearest-neighbour, in back-to-front order.
import { shaded, faceName } from './textures.js';
import { normalizeOptions, mobPositions, drawMob } from './mobs.js';
import { sceneLayout, drawParadeGround, drawSatellite, drawBlockDetail } from './scene.js';
export { selectMob, mobPositions, isSceneValid, normalizeOptions } from './mobs.js';
export { sceneLayout } from './scene.js';

const W = 22; // island footprint in blocks
const MIN_Y = -11;
const MAX_Y = 13;
const H = MAX_Y - MIN_Y;
const SEA = 1;

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ------------------------------------------------------------ worldgen --
const BIOMES = {
  overworld: { top: 'grass', fill: 'dirt', deep: 'stone', ores: ['coal_ore', 'iron_ore'], shore: 'sand', liquid: 'water', peak: 'grass' },
  nether: { top: 'nylium', fill: 'netherrack', deep: 'netherrack', ores: ['glowstone', 'basalt'], shore: 'basalt', liquid: 'lava', peak: 'netherrack' },
  end: { top: 'endstone', fill: 'endstone', deep: 'endstone', ores: ['obsidian'], shore: 'endstone', liquid: null, peak: 'endstone' },
};

export function buildWorld(preset = 'overworld', seed = 7) {
  const biome = BIOMES[preset] || BIOMES.overworld;
  const r = rand(seed * 977 + preset.length);
  const grid = new Array(W * W * H).fill(null);
  const idx = (x, y, z) => (y - MIN_Y) * W * W + z * W + x;
  const set = (x, y, z, b) => { if (x >= 0 && z >= 0 && x < W && z < W && y >= MIN_Y && y < MAX_Y) grid[idx(x, y, z)] = b; };
  const get = (x, y, z) => (x < 0 || z < 0 || x >= W || z >= W || y < MIN_Y || y >= MAX_Y ? null : grid[idx(x, y, z)]);
  const c = (W - 1) / 2;
  const waves = Array.from({ length: 4 }, () => [r() * 6.28, 0.25 + r() * 0.35, 0.25 + r() * 0.35, 0.6 + r() * 0.8]);
  const shape = Array.from({ length: 6 }, () => r() * 6.28);

  const heights = [];
  for (let z = 0; z < W; z++) {
    heights[z] = [];
    for (let x = 0; x < W; x++) {
      const dx = (x - c) / (W / 2);
      const dz = (z - c) / (W / 2);
      const ang = Math.atan2(dz, dx);
      // ragged coastline: radius varies with angle
      const radius = 0.86 + 0.09 * Math.sin(ang * 3 + shape[0]) + 0.06 * Math.sin(ang * 5 + shape[1]);
      const d = Math.hypot(dx, dz) / radius;
      if (d > 1) { heights[z][x] = null; continue; }
      let h = 0;
      for (const [p, fx, fz, a] of waves) h += Math.sin(x * fx + p) * Math.cos(z * fz - p) * a;
      h = 2.2 + h + (1 - d) * (preset === 'end' ? 2.2 : 4.2);
      if (d > 0.82) h = Math.min(h, 1 + (1 - d) * 8);
      heights[z][x] = { top: Math.max(0, Math.min(8, Math.round(h))), d };
    }
  }
  // a pond/lava pool scooped out on one side
  const pond = [c + (r() - 0.5) * 6, c + 3 + r() * 2];
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const col = heights[z][x];
      if (!col) continue;
      const pd = Math.hypot(x - pond[0], z - pond[1]);
      if (biome.liquid && pd < 3.1) col.top = pd < 2 ? SEA - 2 : Math.min(col.top, SEA - 1);
      const bottom = Math.round(-1 - (1 - col.d * col.d) * 9.5 + (r() - 0.5) * 2);
      for (let y = bottom; y <= col.top; y++) {
        const depth = col.top - y;
        let b = depth === 0 ? (col.top <= SEA && biome.liquid && pd < 4.3 ? biome.shore : col.top >= 7 ? biome.peak : biome.top) : depth < 3 ? biome.fill : biome.deep;
        if (depth >= 3 && r() < 0.07) b = biome.ores[Math.floor(r() * biome.ores.length)];
        set(x, y, z, b);
      }
      if (biome.liquid) for (let y = col.top + 1; y <= SEA - 1; y++) set(x, y, z, biome.liquid);
    }
  }

  const surface = (x, z) => { for (let y = MAX_Y - 1; y >= MIN_Y; y--) { const b = get(x, y, z); if (b) return [y, b]; } return [null, null]; };
  const placed = [];
  const far = (x, z, min) => placed.every(([px, pz]) => Math.hypot(px - x, pz - z) >= min);
  const spots = [];
  for (let z = 2; z < W - 2; z++) for (let x = 2; x < W - 2; x++) spots.push([x, z, r()]);
  spots.sort((a, b) => a[2] - b[2]);

  if (preset === 'overworld') {
    for (const [x, z] of spots) {
      if (placed.length >= 5) break;
      const [y, b] = surface(x, z);
      if (b !== 'grass' || !far(x, z, 5)) continue;
      const t = 4 + Math.floor(r() * 2);
      for (let i = 1; i <= t; i++) set(x, y + i, z, 'log');
      for (let ly = y + t - 1; ly <= y + t + 1; ly++) {
        const rad = ly === y + t + 1 ? 1 : 2;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (rad === 1 || r() < 0.6)) continue;
          if (!get(x + dx, ly, z + dz)) set(x + dx, ly, z + dz, 'leaves');
        }
      }
      set(x, y + t + 2, z, 'leaves');
      placed.push([x, z]);
    }
  } else if (preset === 'nether') {
    for (const [x, z] of spots) {
      if (placed.length >= 5) break;
      const [y, b] = surface(x, z);
      if (b !== 'nylium' || !far(x, z, 5)) continue;
      const t = 4 + Math.floor(r() * 3);
      for (let i = 1; i <= t; i++) set(x, y + i, z, 'stem');
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        set(x + dx, y + t + 1, z + dz, 'wart');
        if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && r() < 0.55) set(x + dx, y + t, z + dz, r() < 0.15 ? 'glowstone' : 'wart');
      }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + t + 2, z + dz, 'wart');
      placed.push([x, z]);
    }
  } else {
    // End: two obsidian pillars and branching chorus plants
    for (const [x, z] of spots) {
      if (placed.length >= 2) break;
      const [y, b] = surface(x, z);
      if (b !== 'endstone' || !far(x, z, 7) || x < 4 || z < 4 || x > W - 5 || z > W - 5) continue;
      const t = 7 + Math.floor(r() * 4);
      for (let i = 1; i <= t; i++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + i, z + dz, 'obsidian');
      placed.push([x, z]);
    }
    let plants = 0;
    for (const [x, z] of spots) {
      if (plants >= 6) break;
      const [y, b] = surface(x, z);
      if (b !== 'endstone' || !far(x, z, 3)) continue;
      const t = 3 + Math.floor(r() * 3);
      for (let i = 1; i <= t; i++) set(x, y + i, z, 'chorus');
      set(x, y + t + 1, z, 'chorus_flower');
      // one or two side branches that turn upwards and end in a flower
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 2));
      for (const [dx, dz] of dirs) {
        const h = 2 + Math.floor(r() * (t - 2));
        set(x + dx, y + h, z + dz, 'chorus');
        set(x + dx, y + h + 1, z + dz, 'chorus');
        set(x + dx, y + h + 2, z + dz, 'chorus_flower');
      }
      placed.push([x, z]);
      plants++;
    }
  }
  return { get, preset };
}

// -------------------------------------------------------------- render --
const TRANSPARENT = new Set(['water', 'leaves', 'chorus', 'chorus_flower']);
const LIQUID = new Set(['water', 'lava']);
const EMISSIVE = new Set(['lava', 'glowstone']);
const SKY = {
  overworld: { stops: ['#5f93dc', '#8db8ec', '#c3dcf5'], glow: null },
  nether: { stops: ['#1a0507', '#3a0c0e', '#5e1913'], glow: 'rgba(255, 96, 40, .12)' },
  end: { stops: ['#07050d', '#120c20', '#21173a'], glow: null },
};

/**
 * Mounts the panorama into `host`. Returns a controller with
 * setRunning(bool), setPreset(name), setOptions(partial), redraw(), destroy().
 * scene: 'island' | 'oneblock'; mobs: boolean; mobCount: 0..3; speed: 0..3.
 * No animation starts until the caller explicitly enables setRunning(true).
 * diagnostics is a detached snapshot; elapsed is simulation time in seconds.
 */
export function createPanorama(host, { preset = 'overworld', ...initialOptions } = {}) {
  const cv = document.createElement('canvas');
  cv.className = 'mc-pano-canvas';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.pointerEvents = 'none';
  host.append(cv);
  const ctx = cv.getContext('2d');
  preset = Object.hasOwn(BIOMES, preset) ? preset : 'overworld';
  let options = normalizeOptions(initialOptions);
  let world;
  function rebuild() {
    world = options.scene === 'oneblock'
      ? { preset, get: (x, y, z) => x === 10 && y === 0 && z === 10 ? BIOMES[preset].top : null }
      : buildWorld(preset);
  }
  rebuild();
  let angle = 0.65;
  let running = false;
  let raf = 0;
  let last = 0;
  let cloudShift = 0;
  let sizeKey = '';
  let elapsed = 0;
  let destroyed = false;
  let diagnostic = {};
  const r = rand(99);
  const clouds = Array.from({ length: 9 }, () => ({ x: r(), y: 0.05 + r() * 0.32, w: 3 + Math.floor(r() * 5), h: 1 + Math.floor(r() * 2), s: 0.5 + r() * 0.8 }));
  const motes = Array.from({ length: 46 }, () => ({ x: r(), y: r(), s: 1 + Math.floor(r() * 2), v: 0.3 + r() * 0.7, p: r() * 6.28 }));

  function resize() {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = `${rect.width}x${rect.height}@${dpr}`;
    if (key === sizeKey) return;
    sizeKey = key;
    cv.width = Math.max(1, Math.round(rect.width * dpr));
    cv.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function sky(w, h, px) {
    const p = SKY[world.preset] || SKY.overworld;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, p.stops[0]);
    g.addColorStop(0.55, p.stops[1]);
    g.addColorStop(1, p.stops[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const unit = Math.max(4, Math.round(px / 3));
    if (world.preset === 'overworld') {
      // square sun with a stepped halo
      const sx = w * 0.8;
      const sy = h * 0.14;
      for (const [k, a] of [[5, 0.08], [3.6, 0.14]]) { ctx.fillStyle = `rgba(255, 246, 214, ${a})`; ctx.fillRect(sx - unit * k, sy - unit * k, unit * k * 2, unit * k * 2); }
      ctx.fillStyle = '#fff6c9';
      ctx.fillRect(sx - unit * 2.2, sy - unit * 2.2, unit * 4.4, unit * 4.4);
      // flat blocky clouds drifting left
      for (const cl of clouds) {
        const cw = cl.w * unit * 4;
        const x = ((cl.x * (w + cw) - cloudShift * cl.s * unit) % (w + cw) + (w + cw)) % (w + cw) - cw;
        const y = cl.y * h;
        ctx.fillStyle = 'rgba(255, 255, 255, .82)';
        ctx.fillRect(x, y, cw, cl.h * unit * 2);
        ctx.fillRect(x + unit * 4, y - unit * 2, cw - unit * 8, unit * 2);
        ctx.fillStyle = 'rgba(214, 226, 240, .7)';
        ctx.fillRect(x, y + cl.h * unit * 2, cw, unit);
      }
    } else if (world.preset === 'end') {
      for (const m of motes) {
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(m.p + cloudShift * 0.02 * m.v));
        ctx.fillStyle = `rgba(226, 214, 255, ${0.25 + 0.5 * tw})`;
        ctx.fillRect(Math.round(m.x * w), Math.round(m.y * h * 0.8), m.s * unit * 0.5, m.s * unit * 0.5);
      }
    } else {
      ctx.fillStyle = p.glow;
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
    }
  }

  let drawMs = 0;
  function draw() {
    if (destroyed) return;
    const started = performance.now();
    resize();
    const w = cv.width;
    const h = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // Block size scales with the window; the whole island reads as one
    // object in the top band (the page's panorama band, see theme.css).
    // Must match the Home band in theme.css: clamp(180px, 36vh, 300px).
    const dpr = w / Math.max(1, cv.clientWidth || w);
    const layout = sceneLayout(w, h, window.innerHeight, dpr, options.scene);
    const { band } = layout;
    const pitch = 0.45;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    // Fit the whole island (tallest tree ~12 blocks above the grass, the rocky
    // underside ~7 below, half-depth 11) inside the band, so no card covers it.
    const S = layout.scale;
    sky(w, h, Math.min(S, 10 * dpr));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, band); ctx.clip();
    drawSatellite(ctx, w * .17, band * .47, Math.min(1.2 * dpr, w / 700), preset);
    drawSatellite(ctx, w * .83, band * .32, Math.min(.85 * dpr, w / 900), preset);
    const ca = Math.cos(options.scene === 'oneblock' ? .65 : angle);
    const sa = Math.sin(options.scene === 'oneblock' ? .65 : angle);
    const cx = w * 0.5;
    const cy = options.scene === 'oneblock' ? band * .78 : 9 * dpr + (10.5 * cp + 10.5 * sp) * S;
    const half = options.scene === 'oneblock' ? 10 : (W - 1) / 2;
    // world -> screen; positive rz is towards the camera
    const proj = (x, y, z) => {
      const X = x - half - 0.5;
      const Z = z - half - 0.5;
      const rx = X * ca - Z * sa;
      const rz = X * sa + Z * ca;
      return [cx + rx * S, cy - y * S * cp + rz * S * sp];
    };
    const face = (name, k, o, a, b) => {
      // o = origin corner, a = +u corner, b = +v corner (screen space)
      ctx.setTransform((a[0] - o[0]) / 16, (a[1] - o[1]) / 16, (b[0] - o[0]) / 16, (b[1] - o[1]) / 16, o[0], o[1]);
      ctx.drawImage(shaded(name, k), -0.06, -0.06, 16.12, 16.12);
    };

    // Back-to-front: along x and z towards the camera, then bottom to top.
    const xs = sa > 0 ? 1 : -1; // +x face visible when its normal points at the camera
    const zs = ca > 0 ? 1 : -1;
    const xr = xs > 0 ? [0, W, 1] : [W - 1, -1, -1];
    const zr = zs > 0 ? [0, W, 1] : [W - 1, -1, -1];
    const { get } = world;
    const open = (b, self) => !b || (TRANSPARENT.has(b) && b !== self) || (LIQUID.has(b) && !LIQUID.has(self));
    const sideK = (axis, b) => (EMISSIVE.has(b) ? 1 : axis === 'x' ? 0.62 : 0.8);
    for (let x = xr[0]; x !== xr[1]; x += xr[2]) {
      for (let z = zr[0]; z !== zr[1]; z += zr[2]) {
        for (let y = MIN_Y; y < MAX_Y; y++) {
          const b = get(x, y, z);
          if (!b) continue;
          const liquid = LIQUID.has(b);
          const top = liquid ? y + 0.86 : y + 1;
          // x-facing side
          if (!liquid || b === 'lava') {
            const nx = x + xs;
            if (open(get(nx, y, z), b)) {
              const fx = xs > 0 ? x + 1 : x;
              face(faceName(b, 'side'), sideK('x', b), proj(fx, top, z + (xs > 0 ? 1 : 0)), proj(fx, top, z + (xs > 0 ? 0 : 1)), proj(fx, y, z + (xs > 0 ? 1 : 0)));
            }
            const nz = z + zs;
            if (open(get(x, y, nz), b)) {
              const fz = zs > 0 ? z + 1 : z;
              face(faceName(b, 'side'), sideK('z', b), proj(x + (zs > 0 ? 0 : 1), top, fz), proj(x + (zs > 0 ? 1 : 0), top, fz), proj(x + (zs > 0 ? 0 : 1), y, fz));
            }
          }
          if (open(get(x, y + 1, z), b)) {
            ctx.globalAlpha = b === 'water' ? 0.78 : 1;
            face(faceName(b, 'top'), 1, proj(x, top, z), proj(x + 1, top, z), proj(x, top, z + 1));
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (options.scene === 'oneblock') drawBlockDetail(ctx, proj(10.25, 1, 10.2), Math.min(1.3 * dpr, S / 75), preset);
    let positions = [];
    if (options.scene === 'island') {
      drawParadeGround(ctx, layout, preset);
      positions = mobPositions({ preset, count: options.mobs ? options.mobCount : 0, time: elapsed,
        left: 38 * layout.mobScale, right: w - 38 * layout.mobScale, ground: layout.ground, scale: layout.mobScale });
    } else {
      // Pace along a real line on the cube's top face, rather than walking in air.
      const a = proj(10.08, 1, 10.55);
      const b = proj(10.92, 1, 10.55);
      const scale = Math.min(layout.mobScale * (options.mobCount === 3 ? .44 : .66), S / 100);
      positions = mobPositions({ preset, count: options.mobs ? options.mobCount : 0, time: elapsed,
        left: a[0], right: b[0], ground: a[1], scale });
      positions.forEach(m => { m.y = a[1] + (m.x - a[0]) / Math.max(1, b[0] - a[0]) * (b[1] - a[1]);
        m.bounds.top = m.y - 68 * scale; m.bounds.bottom = m.y + 3 * scale; });
    }
    positions.sort((a,b) => a.y - b.y || a.x - b.x).forEach(m => drawMob(ctx, m));
    if (world.preset === 'nether') {
      // drifting ash
      for (const m of motes) {
        const y = ((m.y * h - cloudShift * m.v * 3) % h + h) % h;
        ctx.fillStyle = 'rgba(255, 170, 120, .35)';
        ctx.fillRect(Math.round(m.x * w + Math.sin(m.p + y / 40) * 6), Math.round(y), m.s * 2, m.s * 2);
      }
    }
    ctx.restore();
    diagnostic = { preset, ...options, mobEnabled: options.mobs, elapsed, angle, width: w, height: h, band,
      route: options.scene === 'island' ? 'foreground-cutaway' : 'block-top',
      mobs: positions.map(m => ({ ...m, bounds: { ...m.bounds } })) };
    drawMs = performance.now() - started;
  }

  const tick = (t) => {
    raf = 0;
    if (!running || !cv.isConnected) return;
    const dt = last ? Math.min(100, t - last) : 16;
    // ~30 fps is plenty for a slow turn and halves the cost
    if (t - last >= 32 || !last) {
      angle += dt * 0.000012 * options.speed;
      cloudShift += dt * 0.004 * options.speed;
      elapsed += dt / 1000 * options.speed;
      last = t;
      draw();
    }
    raf = requestAnimationFrame(tick);
  };

  const ro = new ResizeObserver(() => { if (!running) draw(); });
  ro.observe(host);
  draw();
  return {
    canvas: cv,
    setRunning(on) {
      if (destroyed) return;
      running = Boolean(on);
      if (running && !raf) { last = 0; raf = requestAnimationFrame(tick); }
      if (!running && raf) { cancelAnimationFrame(raf); raf = 0; }
    },
    setPreset(name) {
      name = Object.hasOwn(BIOMES, name) ? name : 'overworld';
      if (name === preset || destroyed) return;
      preset = name;
      rebuild();
      draw();
    },
    setOptions(next = {}) {
      if (destroyed) return;
      const previous = options.scene;
      options = normalizeOptions({ ...options, ...next });
      if (previous !== options.scene) rebuild();
      draw();
    },
    get diagnostics() { return { ...diagnostic, running, destroyed, mobs: (diagnostic.mobs || []).map(m => ({ ...m, bounds: { ...m.bounds } })) }; },
    get running() { return running; },
    get drawMs() { return drawMs; },
    redraw: draw,
    destroy() { destroyed = true; running = false; cancelAnimationFrame(raf); raf = 0; ro.disconnect(); cv.remove(); },
  };
}
