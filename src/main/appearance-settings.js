// Appearance is data, never arbitrary CSS. Shared store-side validation on load/save.
const APPEARANCE_DEFAULTS = Object.freeze({
  uiStyle: 'modern', accent: 'violet', customA1: '#8f5cf7', font: 'default',
  uiScale: 100, animations: true, density: 'comfortable', textSize: 100,
  sidebarWidth: 232, sidebarMode: 'auto',
});
const enums = {
  uiStyle: ['modern', 'midnight', 'light', 'system'],
  accent: ['violet', 'blue', 'green', 'orange', 'red', 'pink', 'custom'],
  font: ['default', 'pixel'], density: ['comfortable', 'compact'], sidebarMode: ['auto', 'expanded', 'compact'],
};
const aliases = { crimson: 'red', redstone: 'red', emerald: 'green', grass: 'green', ocean: 'blue', diamond: 'blue', gold: 'orange', amethyst: 'violet', netherite: 'violet' };
function normalizeAppearance(source) {
  const s = source && typeof source === 'object' ? source : {};
  const result = { ...APPEARANCE_DEFAULTS };
  for (const [key, values] of Object.entries(enums)) {
    const value = key === 'accent' ? aliases[s[key]] || s[key] : s[key];
    if (values.includes(value)) result[key] = value;
  }
  if (typeof s.customA1 === 'string' && /^#[0-9a-f]{6}$/i.test(s.customA1)) result.customA1 = s.customA1.toLowerCase();
  if (typeof s.animations === 'boolean') result.animations = s.animations;
  for (const [key, min, max] of [['uiScale', 80, 130], ['textSize', 90, 120], ['sidebarWidth', 190, 300]]) {
    if (typeof s[key] === 'number' && Number.isFinite(s[key])) result[key] = Math.round(Math.min(max, Math.max(min, s[key])));
  }
  return result;
}
module.exports = { APPEARANCE_DEFAULTS, normalizeAppearance };
