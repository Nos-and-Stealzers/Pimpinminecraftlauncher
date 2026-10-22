// Launcher settings. Instances can override memory, Java and window size.
import { el, icon, errorToast, toast, switchEl, seg } from '../dom.js';
import { THEMES, ACCENTS, themeName, accentName } from '../appearance.js';
import { updateModal, onboarding } from '../qol.js';
import { api, state, updateSettings } from '../state.js';

// sidebar, content and text colour for the little theme previews
const THEME_SWATCH = { modern: ['#111214', '#1e2024', '#e9e9eb'], midnight: ['#000', '#111114', '#e9e9eb'], light: ['#e9ebee', '#fff', '#17191d'], system: ['#17181b', '#f5f6f8', '#71747c'] };

const row = (title, desc, control) => el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, title), desc ? el('span', {}, desc) : null), control);
const section = (title, ...rows) => el('section', { class: `set-section${title === 'Appearance' ? ' appearance-section' : ''}` }, el('h2', {}, title), el('div', { class: 'set-list' }, rows));
const gb = (mb) => `${(mb / 1024).toFixed(1)} GB`;

export function render(page, _params, navigate) {
  const s = state.settings;
  const save = (patch, msg) => updateSettings(patch).then(() => msg && toast(msg)).catch(errorToast);
  const pick = (key, options, fallback = options[0][0]) => seg(options.map(([value, label]) => ({ value, label })), state.settings[key] ?? fallback, (v) => save({ [key]: v }));

  const themes = el('div', { class: 'theme-pick' });
  const drawThemes = () => themes.replaceChildren(...THEMES.map(([k, label]) => {
    const [side, panel, ink] = THEME_SWATCH[k];
    return el('button', { type: 'button', 'aria-label': `${label} theme`, 'aria-pressed': String(themeName() === k), class: themeName() === k ? 'on' : '', onclick: () => save({ uiStyle: k }).then(() => { drawThemes(); themes.querySelector(`[aria-label="${label} theme"]`)?.focus(); }) },
      el('div', { class: 'sw', style: { color: ink } }, el('i', { style: { background: side } }), el('i', { style: { background: panel } }, el('b', { class: 'a' }), el('b'), el('b', { style: { width: '70%' } }))),
      el('span', {}, label));
  }));
  drawThemes();

  const accents = el('div', { class: 'accent-pick', role: 'group', 'aria-label': 'Accent presets' });
  const custom = el('input', { type: 'color', value: s.customA1 || '#8f5cf7', 'aria-label': 'Custom accent colour', title: 'Custom accent colour' });
  const hex = el('input', { class: 'input accent-hex', value: s.customA1 || '#8f5cf7', 'aria-label': 'Custom accent hex', 'aria-describedby': 'accent-error', maxLength: 7, spellcheck: 'false', placeholder: '#8f5cf7' });
  const hexError = el('span', { id: 'accent-error', class: 'appearance-error', role: 'status', 'aria-live': 'polite' });
  const saveCustom = async (value) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) {
      hex.setAttribute('aria-invalid', 'true');
      hexError.textContent = 'Enter # followed by six hex digits.';
      return;
    }
    hex.removeAttribute('aria-invalid'); hexError.textContent = '';
    await save({ accent: 'custom', customA1: value });
    custom.value = state.settings.customA1; hex.value = state.settings.customA1; drawAccents();
  };
  custom.addEventListener('change', () => saveCustom(custom.value));
  hex.addEventListener('change', () => saveCustom(hex.value));
  hex.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); saveCustom(hex.value); } });
  const drawAccents = () => accents.replaceChildren(
    ...Object.entries(ACCENTS).map(([k, colour]) => el('button', { type: 'button', 'aria-label': `${k} accent`, 'aria-pressed': String(accentName() === k), class: accentName() === k ? 'on' : '', title: k, style: { background: colour }, onclick: () => save({ accent: k }).then(() => { drawAccents(); accents.querySelector(`[aria-label="${k} accent"]`)?.focus(); }) }, accentName() === k ? icon('check') : null)));
  drawAccents();
  const select = (key, label, options, fallback) => {
    const input = el('select', { class: 'input appearance-select', 'aria-label': label }, options.map(([value, text]) => el('option', { value }, text)));
    input.value = s[key] ?? fallback;
    input.addEventListener('change', () => save({ [key]: typeof fallback === 'number' ? Number(input.value) : input.value }));
    return input;
  };
  const motion = switchEl(s.animations === false, (v) => save({ animations: !v }));
  motion.setAttribute('aria-label', 'Reduce motion');
  const font = pick('font', [['default', 'System'], ['pixel', 'Pixel']]);
  font.querySelectorAll('button').forEach(button => button.setAttribute('aria-label', `${button.textContent} heading font`));
  const reset = el('button', { class: 'btn sm', 'aria-label': 'Reset appearance', onclick: async () => {
    await save({ appearanceReset: true }, 'Appearance reset');
    page.replaceChildren(); render(page, _params, navigate);
    page.querySelector('[aria-label="Reset appearance"]')?.focus();
  } }, 'Reset appearance');

  const scale = el('input', { type: 'range', 'aria-label': 'Interface size', min: 80, max: 130, step: 5, value: s.uiScale || 100, style: { width: '180px' } });
  const scaleVal = el('span', { class: 'mem-val' }, `${s.uiScale || 100}%`);
  scale.addEventListener('input', () => (scaleVal.textContent = `${scale.value}%`));
  scale.addEventListener('change', () => save({ uiScale: Number(scale.value) }));

  const total = s.totalMemory;
  const mem = el('input', { type: 'range', min: 1024, max: Math.max(2048, total - 1024), step: 256, value: s.memoryMax });
  const memVal = el('span', { class: 'mem-val' }, gb(s.memoryMax));
  mem.addEventListener('input', () => (memVal.textContent = gb(mem.value)));
  mem.addEventListener('change', () => save({ memoryMax: Number(mem.value) }));
  const jvm = el('textarea', { class: 'input', rows: 2 }, s.jvmArgs);
  jvm.addEventListener('change', () => save({ jvmArgs: jvm.value.trim() }, 'JVM arguments saved'));
  const java = el('input', { class: 'input', placeholder: 'Automatic: the right Java is downloaded for each version', value: s.javaPath });
  java.addEventListener('change', () => save({ javaPath: java.value.trim() }));
  const browseJava = el('button', { class: 'btn', onclick: async () => { const p = await api.call('dialog:pickJava'); if (p) { java.value = p; save({ javaPath: p }, 'Java path saved'); } } }, 'Browse');
  const width = el('input', { class: 'input', type: 'number', value: s.width, style: { width: '100px' } });
  const height = el('input', { class: 'input', type: 'number', value: s.height, style: { width: '100px' } });
  width.addEventListener('change', () => save({ width: Number(width.value) || 1280 }));
  height.addEventListener('change', () => save({ height: Number(height.value) || 720 }));

  page.append(el('div', { class: 'settings' },
    el('div', { class: 'page-head' }, el('div', {}, el('h1', { class: 'page-title' }, 'Settings'), el('p', { class: 'page-sub' }, 'Defaults for every instance. Each instance can override memory, Java and window size.'))),

    section('Appearance',
      el('div', { class: 'set-block' }, el('b', {}, 'Theme'), themes),
      row('Accent colour', 'Used for Play and selection. Button text adapts for contrast.', accents),
      row('Custom colour', 'Choose a colour or enter its six-digit hex code.', el('div', { class: 'custom-accent' }, el('div', { class: 'row' }, custom, hex), hexError)),
      row('Heading font', 'Pixel uses Pixelify Sans for page and instance titles.', font),
      row('Interface size', 'Scales the whole interface, including controls.', el('div', { class: 'row' }, scale, scaleVal)),
      row('Text size', 'Adjusts text without zooming the whole window.', select('textSize', 'Text size', [90, 95, 100, 105, 110, 115, 120].map(n => [n, `${n}%`]), 100)),
      row('Layout density', 'Compact reduces space between rows and cards.', select('density', 'Layout density', [['comfortable', 'Comfortable'], ['compact', 'Compact']], 'comfortable')),
      row('Sidebar layout', 'Automatic uses icons in narrower windows. Labels remain available on hover.', select('sidebarMode', 'Sidebar layout', [['auto', 'Automatic'], ['expanded', 'Expanded'], ['compact', 'Icons only']], 'auto')),
      row('Sidebar width', 'Used when the sidebar is expanded.', select('sidebarWidth', 'Sidebar width', [190, 210, 232, 250, 270, 300].map(n => [n, `${n} px`]), 232)),
      row('Reduce motion', 'Turns off transitions and skin animation. System reduced motion is always respected.', motion),
      row('Reset appearance', 'Restores these appearance choices only. Game settings and accounts are kept.', reset)),

    section('Home',
      row('Skin', 'Drag the 3D model to turn it, click to wave.', pick('skinMode', [['3d', '3D'], ['2d', 'Picture'], ['off', 'Hidden']])),
      row('Client features', 'One-click mod toggles for the selected instance.', switchEl(s.showFeatures !== false, (v) => save({ showFeatures: v }))),
      row('Minecraft news', null, switchEl(s.showNews !== false, (v) => save({ showNews: v }))),
      row('Open on', 'The page shown when the launcher starts.', pick('startPage', [['home', 'Home'], ['library', 'Library'], ['instances', 'Instances'], ['servers', 'Servers']]))),

    section('Java and memory',
      el('div', { class: 'set-block' },
        el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Maximum memory'), el('span', {}, `This PC has ${gb(total)}. 4 to 6 GB is enough for most modded play.`)), memVal),
        mem),
      el('div', { class: 'set-block' }, el('label', { class: 'field' }, 'JVM arguments', jvm)),
      el('div', { class: 'set-block' }, el('label', { class: 'field' }, el('span', {}, 'Java executable ', el('span', { class: 'hint' }, 'leave empty for automatic')), el('div', { class: 'row' }, java, browseJava)))),

    section('Game window',
      row('Window size', 'Width and height in pixels.', el('div', { class: 'row' }, width, el('span', { class: 'dim' }, '×'), height)),
      row('Start in fullscreen', null, switchEl(s.fullscreen, (v) => save({ fullscreen: v })))),

    section('Launcher',
      row('Hide while playing', 'The launcher comes back when the game closes.', switchEl(s.closeOnLaunch, (v) => save({ closeOnLaunch: v }))),
      row('Keep running in the tray', 'Closing the window leaves Pimpin in the system tray.', switchEl(Boolean(s.minimizeToTray), (v) => save({ minimizeToTray: v }))),
      state.info?.platform !== 'linux' ? row(state.info.platform === 'darwin' ? 'Open at login' : 'Start with Windows', 'Opens in the tray when you sign in.', switchEl(Boolean(s.launchOnStartup), (v) => save({ launchOnStartup: v }))) : null,
      row('Desktop notifications', 'Server online, game crashed, update ready. Only while the launcher is in the background.', switchEl(s.notifications !== false, (v) => save({ notifications: v }))),
      row('First-run setup', null, el('button', { class: 'btn sm', onclick: async () => { await save({ onboarded: false }); onboarding(navigate); } }, 'Run again')),
      row('Data folder', s.root, el('button', { class: 'btn sm', onclick: () => api.call('shell:openRoot') }, icon('folder'), 'Open'))),

    section('Updates',
      row('Install updates automatically', 'Downloads in the background and installs when you close the launcher.', switchEl(s.autoUpdate !== false, (v) => save({ autoUpdate: v }))),
      row('Update channel', 'Beta builds come first and can be less stable.', pick('updateChannel', [['stable', 'Stable'], ['beta', 'Beta']])),
      row(`Version ${state.info?.version || ''}`, null, el('button', { class: 'btn sm', onclick: () => updateModal() }, icon('refresh'), 'Check for updates'))),

    section('About',
      el('div', { class: 'set-block muted', style: { lineHeight: 1.6 } },
        `Pimpin Launcher ${state.info?.version || ''} on ${state.info?.platform} ${state.info?.arch}.`,
        el('span', {}, 'Mods, packs and plugins come from Modrinth. Paper servers by PaperMC, Purpur by PurpurMC. Not affiliated with Mojang or Microsoft.'))),
  ));
}
