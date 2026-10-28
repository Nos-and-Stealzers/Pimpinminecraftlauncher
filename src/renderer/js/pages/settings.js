// Launcher settings. Instances can override memory, Java and window size.
// Layout: a sticky section list on the left, one scrolling column of
// sections on the right. Section ids (#set-appearance, #set-launcher...) are
// deep-link targets for params.section and must stay stable.
import { el, icon, errorToast, toast, switchEl, seg } from '../dom.js';
import { THEMES, ACCENTS, themeName, accentName, minecraftTheme } from '../appearance.js';
import { updateModal, onboarding } from '../qol.js';
import { api, state, updateSettings, refreshSettings } from '../state.js';

// sidebar, content and text colour for the little theme previews
const THEME_SWATCH = { modern: ['#111214', '#1e2024', '#e9e9eb'], midnight: ['#000', '#111114', '#e9e9eb'], light: ['#e9ebee', '#fff', '#17191d'], system: ['#17181b', '#f5f6f8', '#71747c'] };

/** One settings row: title and description on the left, control on the right. */
const row = (title, desc, control, extra = '') => el('div', { class: `set-row${extra ? ` ${extra}` : ''}` }, el('div', { class: 'grow' }, el('b', {}, title), desc ? el('span', {}, desc) : null), control ? el('div', { class: 'set-control' }, control) : null);
/** Rows whose control needs the full width (paths, JVM arguments). */
const wideRow = (title, desc, control) => row(title, desc, control, 'wide');
const slug = (title) => title.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '');
/** A titled group of rows inside a section. */
const group = (title, ...rows) => el('div', { class: 'set-group', id: title ? `set-group-${slug(title)}` : null }, title ? el('h3', {}, title) : null, el('div', { class: 'set-list' }, rows));
/** A top-level section with optional groups. Its id is the deep-link target. */
const section = (title, ...groups) => el('section', { class: `set-section${title === 'Appearance' ? ' appearance-section' : ''}`, id: `set-${slug(title)}`, 'aria-labelledby': `set-${slug(title)}-title` },
  el('h2', { id: `set-${slug(title)}-title` }, title),
  groups);
const gb = (mb) => `${(mb / 1024).toFixed(1)} GB`;
// One-tap gradient blends: [name, accent key, second colour]
const GRADIENT_PRESETS = [
  ['Pimpin', 'violet', '#ff4fb8'],
  ['Sunset', 'orange', '#ff4d8d'],
  ['Ocean', 'blue', '#22d3ee'],
  ['Forest', 'green', '#a3e635'],
  ['Candy', 'pink', '#8b5cf6'],
];

export function render(page, params, navigate) {
  page.__settingsCleanup?.();
  const s = state.settings;
  // Redraw in place (after reset/import) without losing the scroll position.
  const rerender = (focus) => {
    const top = page.scrollTop;
    page.replaceChildren();
    render(page, { ...params, section: null }, navigate);
    page.scrollTop = top;
    if (focus) page.querySelector(focus)?.focus();
  };
  const save = (patch, msg) => updateSettings(patch).then(() => { if (msg) toast(msg); if (Object.keys(patch).some(k => k.startsWith('discord'))) void refreshPresence(); }).catch(errorToast);
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

  // Gradient theming: blend the accent into a second colour.
  const gradToggle = switchEl(Boolean(s.gradient), (v) => save({ gradient: v }));
  gradToggle.querySelector('input').setAttribute('aria-label', 'Gradient accent');
  const gradHexError = el('span', { id: 'gradient-error', class: 'appearance-error', role: 'status', 'aria-live': 'polite' });
  const validHex = (v) => /^#[0-9a-f]{6}$/i.test(v);
  const G2_DEFAULT = '#3b82f6';
  const gradColor = el('input', { type: 'color', value: validHex(s.customA2 || '') ? s.customA2 : G2_DEFAULT, 'aria-label': 'Gradient second colour', title: 'Gradient second colour' });
  const gradHex = el('input', { class: 'input accent-hex', value: validHex(s.customA2 || '') ? s.customA2 : G2_DEFAULT, 'aria-label': 'Gradient second hex', 'aria-describedby': 'gradient-error', maxLength: 7, spellcheck: 'false', placeholder: G2_DEFAULT });
  const saveGradCustom = async (value) => {
    if (!validHex(value)) {
      gradHex.setAttribute('aria-invalid', 'true');
      gradHexError.textContent = 'Enter # followed by six hex digits.';
      return;
    }
    gradHex.removeAttribute('aria-invalid');
    gradHexError.textContent = '';
    await save({ customA2: value });
    drawGradientPreview();
  };
  const gradAngle = el('input', { type: 'range', min: 0, max: 360, step: 5, value: s.gradientAngle ?? 135, 'aria-label': 'Gradient angle', style: { width: '180px' } });
  const gradAngleVal = el('span', { class: 'mem-val' }, `${s.gradientAngle ?? 135}°`);
  gradColor.addEventListener('change', () => { gradHex.value = gradColor.value; saveGradCustom(gradColor.value); });
  gradHex.addEventListener('change', () => saveGradCustom(gradHex.value));
  gradHex.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); saveGradCustom(gradHex.value); } });
  gradAngle.addEventListener('input', () => {
    gradAngleVal.textContent = `${gradAngle.value}°`;
    // Preview while dragging; persist only when the slider is released.
    preview.style.setProperty('--g-angle', `${gradAngle.value}deg`);
  });
  gradAngle.addEventListener('change', () => save({ gradientAngle: Number(gradAngle.value) }));
  const preview = el('div', { class: 'g-grad-preview', role: 'img', 'aria-label': 'Gradient preview' });
  preview.style.setProperty('--g2', validHex(s.customA2 || '') ? s.customA2 : G2_DEFAULT);
  const gradPresets = el('div', { class: 'grad-pick', role: 'group', 'aria-label': 'Gradient presets' });
  for (const [name, accent, g2] of GRADIENT_PRESETS) {
    const btn = el('button', {
      type: 'button', title: `${name} gradient`, 'aria-label': `${name} gradient`,
      style: { background: `linear-gradient(135deg, ${ACCENTS[accent]}, ${g2})` },
      onclick: async () => { await save({ gradient: true, accent, customA2: g2 }); drawGradientPreview(); drawAccents(); },
    }, accentName() === accent ? icon('check') : null);
    if (accentName() === accent) btn.classList.add('on');
    gradPresets.appendChild(btn);
  }
  function drawGradientPreview() {
    preview.style.setProperty('--g2', state.settings.customA2 || G2_DEFAULT);
    gradToggle.querySelector('input').checked = Boolean(state.settings.gradient);
    gradColor.value = state.settings.customA2 || G2_DEFAULT;
    gradHex.value = gradColor.value;
  }
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
    rerender('[aria-label="Reset appearance"]');
  } }, 'Reset appearance');

  const scale = el('input', { type: 'range', 'aria-label': 'Interface size', min: 80, max: 130, step: 5, value: s.uiScale || 100, style: { width: '180px' } });
  const scaleVal = el('span', { class: 'mem-val' }, `${s.uiScale || 100}%`);
  scale.addEventListener('input', () => (scaleVal.textContent = `${scale.value}%`));
  scale.addEventListener('change', () => save({ uiScale: Number(scale.value) }));

  const presenceStatus = el('span', { role: 'status', 'aria-live': 'polite' }, 'Checking status...');
  async function refreshPresence(reconnect = false) {
    try {
      const status = await api.call(reconnect ? 'presence:refresh' : 'presence:status');
      presenceStatus.textContent = status.message;
    } catch { presenceStatus.textContent = 'Status unavailable. Reopen settings to retry.'; }
  }
  void refreshPresence();
  const discordSwitch = (key, label) => {
    const control = switchEl(s[key] !== false, v => save({ [key]: v }));
    control.querySelector('input').setAttribute('aria-label', label);
    return control;
  };
  const discordIdError = el('span', { class: 'appearance-error', role: 'status', id: 'discord-id-error' });
  const discordId = el('input', {
    class: 'input', value: s.discordAppId || '', placeholder: '17 to 20 digit application ID',
    'aria-label': 'Discord application ID', 'aria-describedby': 'discord-id-error',
    maxLength: 20, inputmode: 'numeric', style: { maxWidth: '240px' },
    onchange: () => {
      const id = discordId.value.trim();
      if (id && !/^[0-9]{17,20}$/.test(id)) {
        discordId.setAttribute('aria-invalid', 'true');
        discordIdError.textContent = 'Use the numeric application ID, not a token or client secret.';
        return;
      }
      discordId.removeAttribute('aria-invalid'); discordIdError.textContent = '';
      save({ discordAppId: id || null }, id ? 'Discord application ID saved' : 'Discord application ID cleared');
    },
  });
  const exportAppearance = el('button', { class: 'btn sm', 'aria-label': 'Export appearance preset', onclick: async () => {
    try { const result = await api.call('settings:exportAppearance'); if (!result.canceled) toast('Appearance preset exported'); } catch (e) { errorToast(e); }
  } }, icon('download'), 'Export');
  const importAppearance = el('button', { class: 'btn sm', 'aria-label': 'Import appearance preset', onclick: async () => {
    try {
      const next = await api.call('settings:importAppearance');
      if (!next) return;
      await refreshSettings();
      rerender(); toast('Appearance preset imported');
    } catch (e) { errorToast(e); }
  } }, icon('upload'), 'Import');

  const total = s.totalMemory;
  const mem = el('input', { type: 'range', 'aria-label': 'Maximum memory', min: 1024, max: Math.max(2048, total - 1024), step: 256, value: s.memoryMax });
  const memVal = el('span', { class: 'mem-val' }, gb(s.memoryMax));
  mem.addEventListener('input', () => (memVal.textContent = gb(mem.value)));
  mem.addEventListener('change', () => save({ memoryMax: Number(mem.value) }));
  const jvm = el('textarea', { class: 'input', rows: 2, 'aria-label': 'JVM arguments', spellcheck: 'false' }, s.jvmArgs);
  jvm.addEventListener('change', () => save({ jvmArgs: jvm.value.trim() }, 'JVM arguments saved'));
  const java = el('input', { class: 'input', 'aria-label': 'Java executable', placeholder: 'Automatic', value: s.javaPath, spellcheck: 'false' });
  java.addEventListener('change', () => save({ javaPath: java.value.trim() }));
  const browseJava = el('button', { class: 'btn', onclick: async () => { const p = await api.call('dialog:pickJava'); if (p) { java.value = p; save({ javaPath: p }, 'Java path saved'); } } }, 'Browse');
  const width = el('input', { class: 'input', type: 'number', 'aria-label': 'Window width', value: s.width, style: { width: '96px' } });
  const height = el('input', { class: 'input', type: 'number', 'aria-label': 'Window height', value: s.height, style: { width: '96px' } });
  width.addEventListener('change', () => save({ width: Number(width.value) || 1280 }));
  height.addEventListener('change', () => save({ height: Number(height.value) || 720 }));

  // Minecraft style block: rows come from the removable theme folder. If the
  // folder is missing the import fails and this group is removed.
  const minecraftGroup = group('Minecraft style');
  minecraftGroup.hidden = true;
  const mcList = minecraftGroup.querySelector('.set-list');
  const mcToggle = (checked, label, onchange) => {
    const control = switchEl(checked, onchange);
    control.querySelector('input').setAttribute('aria-label', label);
    return control;
  };
  const drawMinecraft = (focus) => minecraftTheme().then((mod) => {
    if (typeof mod?.settingsRows !== 'function') { minecraftGroup.remove(); return; }
    mcList.replaceChildren(...mod.settingsRows({
      settings: state.settings, save, row, toggle: mcToggle, redraw: drawMinecraft,
      resetKeys: Object.keys(state.settings).filter(k => /^mc[A-Z]/.test(k)),
    }));
    minecraftGroup.hidden = false;
    // The optional module may arrive (or redraw) after a search was entered.
    // Recompute the entire result, including section links and the empty state.
    filter(search.value);
    if (typeof focus === 'string') mcList.querySelector(focus)?.focus();
  }).catch(() => minecraftGroup.remove());
  void drawMinecraft();

  // ---------------------------------------------------------- layout --
  const appearanceGroups = [
    group('Theme and colour',
      row('Theme', null, themes),
      row('Accent colour', 'Used for Play and selection. Button text adapts for contrast.', accents),
      row('Custom colour', 'Choose a colour or enter its six-digit hex code.', el('div', { class: 'custom-accent' }, el('div', { class: 'row' }, custom, hex), hexError))),
    group('Gradient',
      row('Gradient', 'Blend the accent into a second colour. Switch off for a flat accent.', gradToggle),
      row('Second colour', 'Used when Gradient is on.', el('div', { class: 'custom-accent' }, el('div', { class: 'row' }, gradColor, gradHex), gradHexError)),
      row('Angle', 'Preview while dragging, saved when released.', el('div', { class: 'row grad-angle' }, preview, gradAngle, gradAngleVal)),
      row('Gradient presets', 'A starting point. Every colour is editable.', gradPresets)),
    group('Layout and text',
      row('Heading font', 'Pixel uses Pixelify Sans for page and instance titles.', font),
      row('Interface size', 'Scales the whole interface, including controls.', el('div', { class: 'row' }, scale, scaleVal)),
      row('Text size', 'Adjusts text without zooming the whole window.', select('textSize', 'Text size', [90, 95, 100, 105, 110, 115, 120].map(n => [n, `${n}%`]), 100)),
      row('Layout density', 'Compact reduces space between rows and cards.', select('density', 'Layout density', [['comfortable', 'Comfortable'], ['compact', 'Compact']], 'comfortable')),
      row('Sidebar layout', 'Automatic uses icons in narrower windows. Labels remain available on hover.', select('sidebarMode', 'Sidebar layout', [['auto', 'Automatic'], ['expanded', 'Expanded'], ['compact', 'Icons only']], 'auto')),
      row('Sidebar width', 'Used when the sidebar is expanded.', select('sidebarWidth', 'Sidebar width', [190, 210, 232, 250, 270, 300].map(n => [n, `${n} px`]), 232)),
      row('Reduce motion', 'Turns off transitions and skin animation. System reduced motion is always respected.', motion)),
    minecraftGroup,
    group('Presets and reset',
      row('Appearance presets', 'Share a small JSON file with colours, sizing and layout only. No accounts or game settings.', el('div', { class: 'row' }, importAppearance, exportAppearance)),
      row('Reset appearance', 'Restores these appearance choices only. Game settings and accounts are kept.', reset)),
  ];

  // ----- Discord (kept together as one block; presence code owns these rows) -----
  const discordGroup = group('Discord',
    row('Discord Rich Presence', 'Shows what you are playing in your Discord status automatically while a game runs. Needs the Discord desktop app.', discordSwitch('discordRich', 'Discord Rich Presence')),
    row('Own application ID', 'Optional. Leave empty to use Pimpin Launcher. Paste your own application ID only to show a different app name. Never a token or secret.', el('div', { class: 'custom-accent' }, discordId, discordIdError)),
    row('Discord status', null, el('div', { class: 'row' }, presenceStatus, el('button', { class: 'btn sm', onclick: () => refreshPresence(true) }, 'Refresh'))),
    row('Show instance name', 'Turn off to show only Playing Minecraft. Server addresses and account names are never sent.', discordSwitch('discordShowInstance', 'Show instance name')),
    row('Show game version', 'Include the Minecraft version and loader in your status.', discordSwitch('discordShowVersion', 'Show game version')),
    row('Show elapsed time', 'Include the time since you launched the game.', discordSwitch('discordShowElapsed', 'Show elapsed time')));
  // ----- end Discord -----

  // CurseForge needs an API key. Builds can ship one; a key here overrides it.
  const cfStatus = el('span', { role: 'status', 'aria-live': 'polite' }, 'Checking...');
  const drawCfStatus = () => api.call('curseforge:status').then((st) => {
    cfStatus.textContent = st.configured ? (st.source === 'settings' ? 'Using your key.' : 'Ready.') : 'No key yet. Mods from Modrinth still work.';
  }).catch(() => { cfStatus.textContent = 'Status unavailable.'; });
  void drawCfStatus();
  const cfKey = el('input', {
    class: 'input', type: 'password', value: s.curseforgeApiKey || '', placeholder: 'Leave empty to use the built-in key',
    'aria-label': 'CurseForge API key', autocomplete: 'off', spellcheck: 'false', maxLength: 200, style: { maxWidth: '260px' },
    onchange: () => updateSettings({ curseforgeApiKey: cfKey.value.trim() || null })
      .then(() => { toast(cfKey.value.trim() ? 'CurseForge key saved' : 'CurseForge key cleared'); return drawCfStatus(); })
      .catch(errorToast),
  });
  const curseforgeGroup = group('CurseForge',
    row('CurseForge status', 'Search and install mods, resource packs, shaders and modpacks from CurseForge in the Library.', cfStatus),
    row('CurseForge API key', 'Optional. Only needed if this build has no key. Get one from the CurseForge for Studios console.', cfKey));

  const sections = [
    section('Appearance', ...appearanceGroups),
    section('Home', group(null,
      row('Skin', 'Drag the 3D model to turn it, click to wave.', pick('skinMode', [['3d', '3D'], ['2d', 'Picture'], ['off', 'Hidden']])),
      row('Client features', 'One-click mod toggles for the selected instance.', switchEl(s.showFeatures !== false, (v) => save({ showFeatures: v }))),
      row('Minecraft news', null, switchEl(s.showNews !== false, (v) => save({ showNews: v }))),
      row('Open on', 'The page shown when the launcher starts.', pick('startPage', [['home', 'Home'], ['library', 'Library'], ['instances', 'Instances'], ['servers', 'Servers']])))),
    section('Java and memory', group(null,
      row('Maximum memory', `This PC has ${gb(total)}. 4 to 6 GB is enough for most modded play.`, el('div', { class: 'row mem-control' }, mem, memVal)),
      wideRow('JVM arguments', 'Passed to Java for every instance without its own arguments.', jvm),
      wideRow('Java executable', 'Leave empty to download the right Java for each version automatically.', el('div', { class: 'row' }, java, browseJava)))),
    section('Game window', group(null,
      row('Window size', 'Width and height in pixels.', el('div', { class: 'row' }, width, el('span', { class: 'dim' }, '×'), height)),
      row('Start in fullscreen', null, switchEl(s.fullscreen, (v) => save({ fullscreen: v }))))),
    section('Launcher',
      group('General',
        row('Hide while playing', 'The launcher comes back when the game closes.', switchEl(s.closeOnLaunch, (v) => save({ closeOnLaunch: v }))),
        row('Keep running in the tray', 'Closing the window leaves Pimpin in the system tray.', switchEl(Boolean(s.minimizeToTray), (v) => save({ minimizeToTray: v }))),
        state.info?.platform !== 'linux' ? row(state.info?.platform === 'darwin' ? 'Open at login' : 'Start with Windows', 'Opens in the tray when you sign in.', switchEl(Boolean(s.launchOnStartup), (v) => save({ launchOnStartup: v }))) : null,
        row('First-run setup', null, el('button', { class: 'btn sm', onclick: async () => { await save({ onboarded: false }); onboarding(navigate); } }, 'Run again')),
        row('Data folder', s.root, el('button', { class: 'btn sm', onclick: () => api.call('shell:openRoot') }, icon('folder'), 'Open')),
        row('Editable settings file', 'Reveal settings.json. Quit the launcher before editing it by hand; never share accounts.json.', el('button', { class: 'btn sm', onclick: () => api.call('settings:showFile') }, icon('folder'), 'Show file'))),
      discordGroup,
      curseforgeGroup),
    section('Notifications', group(null,
      row('Launcher updates', 'A notice when a new Pimpin version is available or ready to install.', switchEl(s.notifyLauncherUpdates !== false, (v) => save({ notifyLauncherUpdates: v }))),
      row('Mod updates', 'Checks your instances every few hours and lists mods with newer versions. Nothing is updated without you.', switchEl(s.notifyModUpdates !== false, (v) => save({ notifyModUpdates: v }))),
      row('Announcements', 'Short notes from the Pimpin team. Critical notices, like a broken build, are always shown.', switchEl(s.notifyAnnouncements !== false, (v) => save({ notifyAnnouncements: v }))),
      row('Show in game', 'The Pimpin Client shows new update notices once, silently, in the corner of the screen.', switchEl(s.inGameNotices !== false, (v) => save({ inGameNotices: v }))),
      row('Desktop notifications', 'Server online, game crashed, update ready. Only while the launcher is in the background.', switchEl(s.notifications !== false, (v) => save({ notifications: v }))))),
    section('Updates', group(null,
      row('Install updates automatically', 'Downloads in the background and installs when you close the launcher.', switchEl(s.autoUpdate !== false, (v) => save({ autoUpdate: v }))),
      row('Update channel', 'Beta builds come first and can be less stable.', pick('updateChannel', [['stable', 'Stable'], ['beta', 'Beta']])),
      row(`Version ${state.info?.version || ''}`, null, el('button', { class: 'btn sm', onclick: () => updateModal() }, icon('refresh'), 'Check for updates')))),
    section('About', group(null,
      el('div', { class: 'set-block muted', style: { lineHeight: 1.6 } },
        `Pimpin Launcher ${state.info?.version || ''} on ${state.info?.platform} ${state.info?.arch}.`,
        el('span', {}, ' Mods, packs and plugins come from Modrinth. Paper servers by PaperMC, Purpur by PurpurMC. Not affiliated with Mojang or Microsoft.')))),
  ];

  // Section list with search. Links scroll inside the page; the active one
  // follows scrolling.
  const navLinks = sections.map((sec) => el('a', { href: `#${sec.id}`, 'data-target': sec.id, onclick: (e) => { e.preventDefault(); revealSection(sec); } }, sec.querySelector('h2').textContent));
  const empty = el('div', { class: 'set-empty muted', hidden: true, role: 'status' }, 'No settings match your search.');
  const search = el('input', { class: 'input', type: 'search', placeholder: 'Search settings', 'aria-label': 'Search settings', spellcheck: 'false' });
  search.addEventListener('input', () => filter(search.value));
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.preventDefault(); search.value = ''; filter(''); } });
  const nav = el('nav', { class: 'set-nav', 'aria-label': 'Settings sections' }, el('div', { class: 'search' }, icon('search'), search), el('div', { class: 'set-nav-links' }, navLinks));
  function revealSection(sec) {
    sec.scrollIntoView({ block: 'start' });
    // In narrow windows navigation sits above the content, not beside it.
    // Use its actual themed/scaled height rather than a fixed pixel offset.
    if (getComputedStyle(nav).flexDirection === 'row') {
      const overlap = nav.getBoundingClientRect().bottom + 8 - sec.getBoundingClientRect().top;
      if (overlap > 0) page.scrollTop -= overlap;
    }
    setActive(sec.id);
  }
  function setActive(id) { for (const a of navLinks) a.classList.toggle('on', a.dataset.target === id); }
  function filter(text) {
    const q = text.trim().toLowerCase();
    let any = false;
    for (const sec of sections) {
      let secHit = false;
      for (const g of sec.querySelectorAll('.set-group')) {
        let groupHit = false;
        const groupTitle = g.querySelector('h3')?.textContent.toLowerCase() || '';
        for (const r of g.querySelectorAll('.set-list > .set-row, .set-list > .set-block')) {
          const hit = !q || r.textContent.toLowerCase().includes(q) || groupTitle.includes(q) || sec.querySelector('h2').textContent.toLowerCase().includes(q);
          r.hidden = !hit;
          groupHit ||= hit;
        }
        g.hidden = !groupHit;
        secHit ||= groupHit;
      }
      sec.hidden = !secHit;
      navLinks.find(a => a.dataset.target === sec.id).hidden = !secHit;
      any ||= secHit;
    }
    empty.hidden = any;
    syncActive();
  }

  const content = el('div', { class: 'set-content' },
    el('div', { class: 'page-head' }, el('div', {}, el('h1', { class: 'page-title' }, 'Settings'), el('p', { class: 'page-sub' }, 'Defaults for every instance. Each instance can override memory, Java and window size.'))),
    empty, sections);
  page.append(el('div', { class: 'settings' }, nav, content));

  // Observe all headings together: IntersectionObserver entries are only the
  // changed subset and could select the previous section hidden behind the nav.
  function syncActive() {
    const top = getComputedStyle(nav).flexDirection === 'row'
      ? nav.getBoundingClientRect().bottom + 16
      : page.getBoundingClientRect().top + 16;
    const shown = sections.filter(sec => !sec.hidden);
    const current = shown.filter(sec => sec.getBoundingClientRect().top <= top).at(-1) || shown[0];
    setActive(current?.id);
  }
  let scrollFrame = null;
  const onScroll = () => {
    if (scrollFrame !== null) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = null; syncActive(); });
  };
  page.addEventListener('scroll', onScroll, { passive: true });
  page.__settingsCleanup = () => {
    page.removeEventListener('scroll', onScroll);
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    page.__settingsCleanup = null;
  };
  setActive(params?.section && page.querySelector(`#set-${params.section}`) ? `set-${params.section}` : sections[0].id);
  if (params?.section) requestAnimationFrame(() => {
    const target = page.querySelector(`#set-${params.section}`);
    if (target) revealSection(target);
  });
  return () => page.__settingsCleanup?.();
}
