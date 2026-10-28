// Quality-of-life: command palette (Ctrl+K), keyboard shortcuts, desktop
// notifications, the update window, "What's new" and the first-run setup.
import { el, icon, clear, modal, toast, errorToast, markdown, confirmModal } from './dom.js';
import { api, state, updateSettings, refreshAccounts, refreshInstances, selectedInstance, getVersions } from './state.js';
import { playInstance, newInstanceModal } from './components.js';
import { THEMES, ACCENTS, themeName, accentName } from './appearance.js';

const openLink = (u) => api.call('shell:openExternal', u);

// --------------------------------------------------------- notifications --
/** System notification, only when the launcher isn't the window you're looking at. */
export function notifyDesktop(title, body) {
  if (state.settings?.notifications === false || document.hasFocus()) return;
  try {
    const n = new Notification(title, { body, silent: true });
    n.onclick = () => window.focus();
  } catch {
    /* notifications blocked */
  }
}

// --------------------------------------------------------------- updates --
/** Installs a downloaded update, after a warning if a game or server would be closed. */
export async function installUpdate() {
  const busy = await api.call('update:busy');
  if (busy.games || busy.servers) {
    const what = [busy.games && 'Minecraft', busy.servers && 'your local servers'].filter(Boolean).join(' and ');
    if (!(await confirmModal('Restart and update?', `This closes ${what}. Save your game first.`, { confirm: 'Restart and update' }))) return;
  }
  api.call('update:install').catch(errorToast);
}

export function updateModal() {
  const body = el('div', { class: 'update-body' });
  const actions = el('div', { class: 'row' });
  const m = modal({ title: 'Launcher updates', wide: true, body, actions: [actions] });
  const draw = (u) => {
    const status = {
      idle: 'Not checked yet.',
      checking: 'Checking for updates',
      'up-to-date': "You're on the latest version.",
      available: `Pimpin ${u.version} is available.`,
      downloading: `Downloading Pimpin ${u.version}: ${u.percent || 0}%`,
      ready: `Pimpin ${u.version} is downloaded. Restart to install it.`,
      manual: `Pimpin ${u.version} is available. This copy can't update itself, so download the new version.`,
      error: `Couldn't check for updates: ${u.error}`,
    }[u.state] || '';
    clear(body,
      el('div', { class: 'update-head' },
        icon(u.state === 'up-to-date' ? 'check' : 'download'),
        el('div', { class: 'grow' },
          el('b', {}, `You have Pimpin ${u.current || state.info?.version}`),
          el('div', { class: 'muted' }, status),
          u.state === 'downloading' ? el('div', { class: 'progress' }, el('i', { style: { width: `${u.percent || 0}%` } })) : null)),
      u.notes ? [el('h3', { class: 'notes-title' }, `What's new in ${u.version}`), el('div', { class: 'notes' }, markdown(u.notes, openLink))] : null);
    clear(actions,
      el('button', { class: 'btn ghost', onclick: () => api.call('shell:openExternal', 'https://github.com/Nos-and-Stealzers/pimpin-launcher-releases/releases') }, icon('external'), 'All releases'),
      el('span', { class: 'grow' }),
      u.state === 'ready' ? el('button', { class: 'btn primary', onclick: installUpdate }, icon('refresh'), 'Restart and update')
        : u.state === 'available' ? el('button', { class: 'btn primary', onclick: () => api.call('update:download') }, icon('download'), 'Download update')
          : u.state === 'manual' ? el('button', { class: 'btn primary', onclick: () => api.call('update:download') }, icon('download'), `Download ${u.version}`)
            : el('button', { class: 'btn', disabled: u.state === 'checking' || u.state === 'downloading', onclick: () => api.call('update:check').then(draw).catch(errorToast) }, icon('refresh'), 'Check now'));
  };
  const off = api.on('update:state', (u) => (document.body.contains(body) ? draw(u) : off()));
  api.call('update:get').then(draw);
  return m;
}

/** After an update, show what changed once. */
export async function whatsNew() {
  const v = state.info?.version;
  const seen = state.settings.lastSeenVersion;
  if (!v || seen === v) return;
  await updateSettings({ lastSeenVersion: v });
  if (!seen) return; // first install: onboarding covers it
  try {
    const rel = await api.call('update:notes', v);
    modal({
      title: `Welcome to Pimpin ${v}`,
      wide: true,
      body: [el('p', { class: 'muted', style: { marginTop: 0 } }, 'Changes in this version:'), el('div', { class: 'notes' }, markdown(rel.notes || 'Bug fixes.', openLink))],
    });
  } catch {
    toast(`Updated to Pimpin ${v}`);
  }
}

// ------------------------------------------------------------ onboarding --
export async function onboarding(navigate) {
  if (state.settings.onboarded) return;
  if (state.instances.length) {
    await updateSettings({ onboarded: true }); // existing users skip the tour
    return;
  }
  let step = 0;
  let setup = 'fps';
  const body = el('div', { class: 'onboard' });
  const foot = el('div', { class: 'row', style: { width: '100%' } });
  const finish = async () => {
    await updateSettings({ onboarded: true });
    m.close();
  };
  const m = modal({ title: 'Set up Pimpin Launcher', wide: true, body, actions: [foot], onClose: () => updateSettings({ onboarded: true }).catch(() => {}) });
  const dots = () => el('div', { class: 'steps' }, [0, 1, 2, 3].map((i) => el('i', { class: i === step ? 'on' : i < step ? 'done' : '' })));
  const nav = (next, label = 'Next') => clear(foot, dots(), el('span', { class: 'grow' }), el('button', { class: 'btn ghost', onclick: finish }, 'Skip'),
    step ? el('button', { class: 'btn', onclick: () => { step--; draw(); } }, 'Back') : null,
    el('button', { class: 'btn primary', onclick: next }, label, icon('chevronRight')));

  const draw = async () => {
    if (step === 0) {
      clear(body, el('div', { class: 'onboard-hero' },
        el('img', { src: 'img/logo.svg', alt: '' }),
        el('div', {},
          el('h2', {}, 'Welcome to Pimpin Launcher'),
          el('p', { class: 'muted' }, 'Three quick steps: add an account, pick a theme, and create your first instance. Everything here can be changed later.'))));
      nav(() => { step = 1; draw(); }, 'Start');
    } else if (step === 1) {
      const name = el('input', { class: 'input', placeholder: 'Player name for offline play', maxlength: 16 });
      const accounts = state.accounts.accounts;
      clear(body,
        el('h3', {}, 'Who is playing?'),
        accounts.length ? el('p', { class: 'muted' }, `Signed in as ${accounts.map((a) => a.name).join(', ')}. More accounts can be added from the menu in the top right.`) : el('p', { class: 'muted' }, 'A Microsoft account is needed for online servers. Offline accounts work for single-player and LAN.'),
        el('div', { class: 'onboard-choices' },
          el('button', {
            class: 'choice',
            onclick: async () => {
              try {
                await api.call('accounts:addMicrosoft');
                await refreshAccounts();
                step = 2;
                draw();
              } catch (err) {
                errorToast(err);
              }
            },
          }, icon('user'), el('b', {}, 'Microsoft account'), el('span', {}, 'Online servers and Realms')),
          el('div', { class: 'choice' }, icon('globe'), el('b', {}, 'Offline'), el('span', {}, 'Single-player and LAN'), name,
            el('button', {
              class: 'btn sm',
              onclick: async () => {
                if (!name.value.trim()) return name.focus();
                try {
                  await api.call('accounts:addOffline', name.value.trim());
                  await refreshAccounts();
                  step = 2;
                  draw();
                } catch (err) {
                  errorToast(err);
                }
              },
            }, 'Use this name'))));
      nav(() => { step = 2; draw(); }, accounts.length ? 'Next' : 'Skip for now');
    } else if (step === 2) {
      const THEME_NOTE = { modern: 'Dark grey, easy on the eyes', midnight: 'True black, for OLED screens', light: 'Light grey and white' };
      clear(body, el('h3', {}, 'Theme'), el('p', { class: 'muted' }, 'Settings has more options.'),
        el('div', { class: 'onboard-choices' }, THEMES.map(([k, label]) =>
          el('button', { class: `choice${themeName() === k ? ' on' : ''}`, onclick: async () => { await updateSettings({ uiStyle: k }); draw(); } },
            el('b', {}, label), el('span', {}, THEME_NOTE[k])))),
        el('div', { class: 'field', style: { marginTop: '16px' } }, 'Accent colour',
          el('div', { class: 'accent-pick' }, Object.entries(ACCENTS).map(([k, hex]) =>
            el('button', { class: accentName() === k ? 'on' : '', title: k, style: { background: hex }, onclick: async () => { await updateSettings({ accent: k }); draw(); } })))));
      nav(() => { step = 3; draw(); });
    } else {
      const version = el('select', { class: 'select' }, el('option', {}, 'Loading'));
      getVersions().then(({ latest, versions }) => {
        const releases = versions.filter((v) => v.type === 'release').map((v) => v.id);
        clear(version, releases.map((v) => el('option', { value: v }, v === '1.21.4' ? `${v} (Pimpin Client)` : v === latest.release ? `${v} (latest)` : v)));
        version.value = releases.includes('1.21.4') ? '1.21.4' : latest.release;
      }).catch(() => {});
      const setups = [
        ['fps', 'bolt', 'Max FPS', 'Sodium and other FPS mods, Pimpin Client, the Performance pack and FPS settings'],
        ['pretty', 'sparkle', 'Max Pretty', 'Shaders, Pimpin Client, the Pretty pack and 3D skin layers'],
        ['vanilla', 'box', 'Vanilla', 'No mods'],
      ];
      clear(body, el('h3', {}, 'First instance'),
        el('div', { class: 'onboard-choices' }, setups.map(([k, ic, label, desc]) =>
          el('button', { class: `choice${setup === k ? ' on' : ''}`, onclick: () => { setup = k; draw(); } }, icon(ic), el('b', {}, label), el('span', {}, desc)))),
        el('label', { class: 'field', style: { marginTop: '14px', maxWidth: '320px' } }, 'Minecraft version', version));
      nav(async () => {
        const btn = foot.querySelector('.btn.primary');
        btn.disabled = true;
        btn.replaceChildren(el('span', { class: 'spin xs' }), 'Setting up');
        try {
          const inst = await api.call('instances:create', {
            name: setup === 'vanilla' ? `Vanilla ${version.value}` : `Pimpin ${version.value}`,
            mcVersion: version.value,
            loader: setup === 'vanilla' ? 'vanilla' : 'fabric',
            icon: setup === 'pretty' ? 'ocean' : setup === 'fps' ? 'emerald' : 'grass',
          });
          await updateSettings({ lastInstance: inst.id });
          if (setup !== 'vanilla') {
            const res = await api.call('packs:combo', inst.id, setup);
            if (res.failed.length) toast(`Set up, but some parts aren't available for ${version.value}: ${res.failed.join('; ')}`, 'err', 9000);
          }
          await refreshInstances();
          await finish();
          navigate('home');
          toast('Ready. Press Play.');
        } catch (err) {
          errorToast(err);
          btn.disabled = false;
          btn.replaceChildren('Create and finish');
        }
      }, 'Create and finish');
    }
  };
  draw();
}

// ------------------------------------------------------- command palette --
function commands(navigate) {
  const cmds = [
    { label: 'Home', hint: 'Ctrl+1', icon: 'home', run: () => navigate('home') },
    { label: 'Library', hint: 'Ctrl+2', icon: 'library', run: () => navigate('library') },
    { label: 'Instances', hint: 'Ctrl+3', icon: 'layers', run: () => navigate('instances') },
    { label: 'Servers', hint: 'Ctrl+4', icon: 'server', run: () => navigate('servers') },
    { label: 'Wardrobe', sub: 'Original characters and skin import/export', icon: 'user', run: () => navigate('wardrobe') },
    { label: 'Settings', hint: 'Ctrl+,', icon: 'settings', run: () => navigate('settings') },
    { label: 'New instance', hint: 'Ctrl+N', icon: 'plus', run: () => newInstanceModal() },
    { label: 'New server', icon: 'plus', run: () => navigate('servers', { create: true }) },
    { label: 'Import a modpack or instance', sub: '.mrpack or Pimpin .zip', icon: 'upload', run: () => importInstance(navigate) },
    { label: 'Update all mods in every instance', icon: 'refresh', run: () => updateAllMods() },
    { label: 'Check for launcher updates', icon: 'download', run: () => updateModal() },
    { label: 'Keep window on top', sub: 'Toggle always-on-top', icon: 'pin', run: () => api.call('window:top') },
    { label: 'Browse mods', icon: 'puzzle', run: () => navigate('library', { type: 'mod' }) },
    { label: 'Browse shaders', icon: 'sun', run: () => navigate('library', { type: 'shader' }) },
    { label: 'Browse resource packs', icon: 'palette', run: () => navigate('library', { type: 'resourcepack' }) },
    { label: 'Open the data folder', icon: 'folder', run: () => api.call('shell:openRoot') },
    { label: 'Keyboard shortcuts', hint: 'F1', icon: 'info', run: () => shortcutsHelp() },
    ...THEMES.map(([k, n]) => ({ label: `Theme: ${n}`, icon: 'palette', run: () => updateSettings({ uiStyle: k }) })),
    { label: state.settings.gradient ? 'Turn gradient off' : 'Turn gradient on', sub: 'Blend the accent into a second colour', icon: 'palette', run: () => toast(state.settings.gradient ? 'Gradient off' : 'Gradient on. Pick colours in Settings → Appearance.', 'info') || updateSettings({ gradient: !state.settings.gradient }) },
  ];
  for (const i of state.instances) {
    cmds.push({ label: `Play ${i.name}`, sub: `${i.mcVersion} · ${i.loader}`, icon: 'play', run: () => updateSettings({ lastInstance: i.id }).then(() => playInstance(i.id)) });
    cmds.push({ label: `Open ${i.name}`, sub: 'Instance', icon: 'layers', run: () => navigate('instances', { id: i.id }) });
    cmds.push({ label: `Pimpin Specials for ${i.name}`, sub: 'Packs, shaders and game settings', icon: 'sparkle', run: () => navigate('instances', { id: i.id, tab: 'pimpin' }) });
    cmds.push({ label: `Logs for ${i.name}`, sub: 'Instance', icon: 'terminal', run: () => navigate('instances', { id: i.id, tab: 'console' }) });
  }
  for (const s of state.servers) cmds.push({ label: `Open server ${s.name}`, sub: `${s.software || 'paper'} ${s.mcVersion}`, icon: 'server', run: () => navigate('servers', { id: s.id }) });
  return cmds;
}

let paletteOpen = false;
export function commandPalette(navigate) {
  if (paletteOpen) return;
  paletteOpen = true;
  const all = commands(navigate);
  let sel = 0;
  let shown = all;
  const input = el('input', { class: 'input palette-input', placeholder: 'Search commands, instances and servers' });
  const list = el('div', { class: 'palette-list' });
  const score = (c, q) => {
    const t = `${c.label} ${c.sub || ''}`.toLowerCase();
    if (!q) return 1;
    if (t.startsWith(q)) return 3;
    if (t.includes(q)) return 2;
    // every letter in order ("pfab" → "Play Fabric")
    let i = 0;
    for (const ch of t) if (ch === q[i]) i++;
    return i === q.length ? 1 : 0;
  };
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    shown = all.map((c) => [c, score(c, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 40);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    clear(list, shown.length ? shown.map((c, i) => el('div', { class: `palette-item${i === sel ? ' on' : ''}`, onmousemove: () => { if (sel !== i) { sel = i; draw(); } }, onclick: () => run(c) },
      icon(c.icon), el('div', { class: 'grow' }, el('b', {}, c.label), c.sub ? el('span', {}, c.sub) : null), c.hint ? el('span', { class: 'kbd' }, c.hint) : null))
      : el('div', { class: 'muted', style: { padding: '14px' } }, 'Nothing matches.'));
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const wrap = el('div', { class: 'palette-wrap', onmousedown: (e) => e.target === wrap && close() }, el('div', { class: 'palette' }, el('div', { class: 'search' }, icon('search'), input), list));
  const close = () => {
    paletteOpen = false;
    wrap.remove();
  };
  const run = (c) => {
    close();
    try {
      c.run();
    } catch (err) {
      errorToast(err);
    }
  };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && shown[sel]) run(shown[sel]);
    if (e.key === 'Escape') close();
  });
  document.getElementById('modal-root').append(wrap);
  draw();
  input.focus();
}

// ------------------------------------------------------------- shortcuts --
const SHORTCUTS = [
  ['Ctrl + K', 'Search commands, instances and servers'],
  ['Ctrl + Enter / F5', 'Play the selected instance'],
  ['Ctrl + 1 to 4', 'Home, Library, Instances, Servers'],
  ['Ctrl + ,', 'Settings'],
  ['Ctrl + N', 'New instance'],
  ['Ctrl + F', 'Search the library'],
  ['Esc', 'Close a window / go back'],
  ['F1', 'This list'],
];

export function shortcutsHelp() {
  modal({ title: 'Keyboard shortcuts', body: el('div', { class: 'shortcut-list' }, SHORTCUTS.map(([k, d]) => el('div', {}, el('span', { class: 'kbd' }, k), el('span', {}, d)))) });
}

export function installShortcuts(navigate, current) {
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      commandPalette(navigate);
      return;
    }
    if (mod && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      navigate(['home', 'library', 'instances', 'servers'][Number(e.key) - 1]);
    } else if (mod && e.key === ',') {
      e.preventDefault();
      navigate('settings');
    } else if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      newInstanceModal();
    } else if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (current().page !== 'library') navigate('library');
      requestAnimationFrame(() => document.querySelector('.lib-search-row input, .search input')?.focus());
    } else if ((mod && e.key === 'Enter') || (e.key === 'F5' && !typing)) {
      e.preventDefault();
      const sel = selectedInstance();
      if (sel && !state.game[sel.id]?.state) playInstance(sel.id);
    } else if (e.key === 'F1') {
      e.preventDefault();
      shortcutsHelp();
    } else if (e.key === 'Escape' && !typing && !document.querySelector('.modal-wrap, .palette-wrap')) {
      document.querySelector('.page .back')?.click();
    }
  });
}

// --------------------------------------------------------------- helpers --
/** Pick a file, or pass a path (drag and drop). Takes .mrpack and Pimpin .zip exports. */
export async function importInstance(navigate, file) {
  try {
    const inst = await api.call('instances:import', file);
    if (!inst) return;
    await refreshInstances();
    toast(`Imported ${inst.name}`);
    navigate('instances', { id: inst.id });
  } catch (err) {
    errorToast(err);
  }
}

export async function updateAllMods() {
  toast('Checking every instance for mod updates', 'info');
  try {
    const r = await api.call('content:updateAll');
    const msg = r.updated ? `Updated ${r.updated} mod${r.updated > 1 ? 's' : ''} in ${r.instances} instance${r.instances > 1 ? 's' : ''}` : 'Everything is already up to date';
    toast(r.skipped.length ? `${msg}. Skipped: ${r.skipped.join(', ')}` : msg, r.skipped.length ? 'info' : 'ok', 7000);
    notifyDesktop('Mods updated', msg);
  } catch (err) {
    errorToast(err);
  }
}
