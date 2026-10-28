// Theme, accent colour, heading font, motion and UI scale from settings.
// Theme lives in the old `uiStyle` key so existing settings files keep working.
import { api, state } from './state.js';

export const THEMES = [
  ['modern', 'Dark'],
  ['midnight', 'Midnight'],
  ['light', 'Light'],
  ['system', 'System'],
];
export const ACCENTS = {
  violet: '#8f5cf7',
  blue: '#3b82f6',
  green: '#22a55b',
  orange: '#e5762b',
  red: '#dc4545',
  pink: '#d9469b',
};
// accents from the old theme picker
const OLD_ACCENTS = { crimson: 'red', redstone: 'red', emerald: 'green', grass: 'green', ocean: 'blue', diamond: 'blue', gold: 'orange', amethyst: 'violet', netherite: 'violet' };

export const themeName = (s = state.settings) => (THEMES.some(([k]) => k === s?.uiStyle) ? s.uiStyle : 'modern');
export const accentName = (s = state.settings) => (s?.accent === 'custom' ? 'custom' : ACCENTS[s?.accent] ? s.accent : OLD_ACCENTS[s?.accent] || 'violet');

// Optional Minecraft style lives in ../themes/minecraft/. It is imported only
// when switched on (or when Settings asks whether it is installed). If the
// folder was removed the import fails, nothing is applied and its settings
// block is hidden: the launcher itself never depends on it.
let minecraft = null;
let minecraftLoad = null;
export function minecraftTheme() {
  minecraftLoad ||= import('../themes/minecraft/index.js')
    .then((mod) => (typeof mod?.apply === 'function' ? (minecraft = mod) : null))
    .catch(() => null);
  return minecraftLoad;
}
function applyMinecraft(s) {
  const b = document.body;
  if (s.mcStyle !== true) {
    delete b.dataset.mcPending;
    minecraft?.disable();
    return;
  }
  // First load only: hide the shell for the few ms the theme takes to load,
  // so it does not flash the default look. Never longer than 1.5 s.
  if (!minecraft) {
    b.dataset.mcPending = '';
    setTimeout(() => delete b.dataset.mcPending, 1500);
  }
  minecraftTheme()
    .then((mod) => mod?.apply(state.settings || s))
    .catch(() => {})
    .finally(() => delete b.dataset.mcPending);
}

const bounded = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
let lastScale = null;
let media;
function accentInk(hex) {
  const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  // Select contrasting ink for every preset and arbitrary pale/dark custom hex.
  return (luminance + .05) / .05 > 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}

export function applyAppearance(s = state.settings) {
  if (!s) return;
  if (!media) {
    media = { dark: matchMedia('(prefers-color-scheme: dark)'), motion: matchMedia('(prefers-reduced-motion: reduce)') };
    media.dark.addEventListener('change', () => applyAppearance());
    media.motion.addEventListener('change', () => applyAppearance());
  }
  const b = document.body;
  const theme = themeName(s);
  b.dataset.theme = theme === 'system' ? media.dark.matches ? 'dark' : 'light' : theme === 'modern' ? 'dark' : theme;
  b.dataset.accent = accentName(s);
  b.dataset.font = s.font === 'pixel' ? 'pixel' : 'default';
  b.dataset.density = s.density === 'compact' ? 'compact' : 'comfortable';
  b.dataset.sidebar = ['compact', 'expanded'].includes(s.sidebarMode) ? s.sidebarMode : 'auto';
  b.classList.toggle('reduce-motion', s.animations === false || media.motion.matches);
  const hex = accentName(s) === 'custom' && /^#[0-9a-f]{6}$/i.test(s.customA1 || '') ? s.customA1 : ACCENTS[accentName(s)] || ACCENTS.violet;
  b.style.setProperty('--accent', hex);
  // Gradient theming: a second colour the accent can blend into. Falls back to
  // a darker shade of the accent when the saved colour is invalid.
  const g2 = /^#[0-9a-f]{6}$/i.test(s.customA2 || '') ? s.customA2 : '';
  const fill = /^\d+$/.test(String(s.gradientAngle)) ? `${String(s.gradientAngle).slice(0, 4)}deg` : '135deg';
  b.dataset.gradient = s.gradient && g2 ? 'on' : 'off';
  b.style.setProperty('--g2', g2);
  b.style.setProperty('--g-angle', fill);
  b.style.setProperty('--accent-hi', hex);
  b.style.setProperty('--accent-ink', accentInk(hex));
  b.style.setProperty('--sidebar-width', `${bounded(s.sidebarWidth, 190, 300, 232)}px`);
  b.style.setProperty('--text-scale', String(bounded(s.textSize, 90, 120, 100) / 100));
  applyMinecraft(s);
  const scale = bounded(s.uiScale, 80, 130, 100);
  if (scale !== lastScale) {
    lastScale = scale;
    api.call('window:zoom', scale / 100).catch(() => {});
  }
}
