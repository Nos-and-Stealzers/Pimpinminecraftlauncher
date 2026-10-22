// App shell: title bar, sidebar (pages, recent instances, task progress,
// play), routing and the backend event wiring.
import { el, icon, clear, fmtBytes, toast, errorToast, modal } from './dom.js';
import { api, state, notify, subscribe, refreshSettings, refreshAccounts, refreshInstances, refreshServers, selectedInstance, selectInstance } from './state.js';
import { accountButton, instIcon, instSubtitle, playInstance, stopInstance, newInstanceModal } from './components.js';
import { applyAppearance } from './appearance.js';
import { installShortcuts, commandPalette, updateModal, installUpdate, whatsNew, onboarding, notifyDesktop, importInstance } from './qol.js';
import { installNotifications } from './notifications.js';
import * as home from './pages/home.js';
import * as library from './pages/library.js';
import * as instances from './pages/instances.js';
import * as servers from './pages/servers.js';
import * as settings from './pages/settings.js';
import * as wardrobe from './pages/wardrobe.js';

const PAGES = {
  home: { mod: home, label: 'Home', icon: 'home' },
  library: { mod: library, label: 'Library', icon: 'library' },
  instances: { mod: instances, label: 'Instances', icon: 'layers' },
  servers: { mod: servers, label: 'Servers', icon: 'server' },
  wardrobe: { mod: wardrobe, label: 'Wardrobe', icon: 'user' },
  settings: { mod: settings, label: 'Settings', icon: 'settings' },
};
const RECENT_MAX = 8;

let current = { page: 'home', params: {} };
let cleanup = null;

export function navigate(page, params = {}) {
  current = { page, params };
  render();
}
window.pimpinNavigate = navigate;

function render() {
  cleanup?.();
  cleanup = null;
  renderSidebar();
  const view = document.getElementById('view');
  const page = el('section', { class: 'page' });
  clear(view, page);
  cleanup = PAGES[current.page].mod.render(page, current.params, navigate) || null;
}

// --------------------------------------------------------------- sidebar --
const taskSlot = el('div', { class: 'side-task hidden' });
const updateCard = el('div', { class: 'update-card hidden' });

function playToggle(inst, cls) {
  const g = state.game[inst.id]?.state;
  const running = g === 'running';
  return el('button', {
    class: `${cls}${running ? ' running' : ''}`,
    title: running ? `Stop ${inst.name}` : g === 'preparing' ? 'Launching' : `Play ${inst.name}`,
    disabled: g === 'preparing',
    onclick: (e) => {
      e.stopPropagation();
      if (running) stopInstance(inst.id);
      else selectInstance(inst.id).then(() => playInstance(inst.id));
    },
  }, g === 'preparing' ? el('span', { class: 'spin xs' }) : icon(running ? 'stop' : 'play'));
}

function renderSidebar() {
  const sel = selectedInstance();
  const viewingId = current.page === 'instances' ? current.params.id : null;
  const recent = state.instances.slice(0, RECENT_MAX);

  const footPlay = sel
    ? el('div', { class: 'side-play' },
        instIcon(sel, 'sm'),
        el('div', { class: 'grow', title: 'Open instance', onclick: () => navigate('instances', { id: sel.id }) }, el('b', {}, sel.name), el('span', {}, instSubtitle(sel))),
        playToggle(sel, 'mini-play'))
    : null;

  clear(
    document.getElementById('sidebar'),
    Object.entries(PAGES).map(([key, p]) =>
      el('button', { class: `side-item${current.page === key && !viewingId ? ' active' : ''}`, title: p.label, 'aria-label': p.label, 'aria-current': current.page === key ? 'page' : null, onclick: () => navigate(key) },
        icon(p.icon), el('span', { class: 'side-text' }, p.label),
        key === 'instances' && state.instances.length ? el('span', { class: 'count' }, String(state.instances.length)) : null),
    ),
    el('div', { class: 'side-label' }, 'Recent', el('button', { title: 'New instance', onclick: () => newInstanceModal() }, icon('plus'))),
    el('div', { class: 'side-recent' },
      recent.length
        ? recent.map((i) =>
            el('div', { class: `recent-item${i.id === viewingId ? ' active' : ''}`, onclick: () => navigate('instances', { id: i.id }) },
              instIcon(i, 'xs'),
              el('div', { class: 'grow' }, el('b', {}, i.name), el('span', {}, instSubtitle(i))),
              playToggle(i, 'mini-play')))
        : el('div', { class: 'side-empty' }, 'No instances yet.')),
    el('div', { class: 'side-foot' }, updateCard, taskSlot, footPlay),
  );
}

let taskTimer;
function showProgress(p) {
  const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  const detail = p.bytes ? `${fmtBytes(p.done)} / ${fmtBytes(p.total)}` : p.total > 1 ? `${p.done}/${p.total}` : '';
  clear(taskSlot,
    el('div', { class: 'row' }, el('span', { class: 'spin xs' }), el('span', { class: 'grow', title: p.stage }, p.stage), detail ? el('span', { class: 'dim' }, detail) : null),
    el('div', { class: 'progress' }, el('i', { style: { width: `${pct}%` } })));
  taskSlot.classList.remove('hidden');
  clearTimeout(taskTimer);
  taskTimer = setTimeout(() => taskSlot.classList.add('hidden'), 2500);
}

// ------------------------------------------------------------ drop import --
const IMPORTABLE = /\.(mrpack|zip)$/i;

function installDropImport() {
  let depth = 0;
  const outside = (e) => e.dataTransfer?.types.includes('Files') && !e.target.closest?.('.file-browser');
  document.addEventListener('dragenter', (e) => {
    if (!outside(e)) return;
    depth++;
    document.body.classList.add('dropping');
  });
  document.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      document.body.classList.remove('dropping');
    }
  });
  document.addEventListener('dragover', (e) => outside(e) && e.preventDefault());
  document.addEventListener('drop', async (e) => {
    depth = 0;
    document.body.classList.remove('dropping');
    if (!outside(e)) return;
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter((f) => IMPORTABLE.test(f.name));
    if (!files.length) {
      toast('Only .mrpack modpacks and Pimpin .zip exports can be imported here.', 'info');
      return;
    }
    for (const f of files) {
      toast(`Importing ${f.name}`, 'info');
      await importInstance(navigate, api.pathForFile(f));
    }
  });
}

// --------------------------------------------------------------- events --
function wireEvents() {
  document.querySelectorAll('[data-win]').forEach((b) => b.addEventListener('click', () => api.call(`window:${b.dataset.win}`)));

  api.on('game:progress', (p) => {
    const wasPreparing = state.game[p.id]?.state === 'preparing';
    state.game[p.id] = { ...(state.game[p.id] || {}), state: 'preparing', progress: p };
    showProgress(p);
    notify(wasPreparing ? 'game-progress' : 'game');
  });
  api.on('task:progress', showProgress);
  api.on('server:progress', showProgress);
  api.on('game:state', async (s) => {
    state.game[s.id] = { state: s.state };
    if (s.state === 'stopped') {
      taskSlot.classList.add('hidden');
      if (s.crashed) showCrash(s.id);
    }
    await refreshInstances();
    notify('game');
  });
  api.on('server:state', async (s) => {
    state.server[s.id] = { state: s.state, ready: s.ready };
    if (s.ready) notifyDesktop('Server is online', `${state.servers.find((x) => x.id === s.id)?.name || 'Your server'} is ready to join.`);
    if (s.error) toast(s.error, 'err');
    await refreshServers();
  });
  api.on('server:players', (p) => {
    const s = state.servers.find((x) => x.id === p.id);
    if (s) s.online = p.online;
    notify('server-players');
  });
  api.on('instances:changed', async () => {
    await refreshInstances();
    notify('instances-content');
  });
  api.on('toast', (t) => toast(t.text, t.kind));
  api.on('update:state', renderUpdate);
  api.on('window:state', (w) => document.body.classList.toggle('maximized', w.maximized));

  subscribe((topic) => {
    if (topic === 'accounts' || topic === 'settings') clear(document.getElementById('account-slot'), accountButton());
    if (topic === 'instances' || topic === 'game' || topic === 'settings') renderSidebar();
    if (topic === 'settings') applyAppearance();
  });
}

// ------------------------------------------------------------- updates --
let lastUpdateState = null;
function renderUpdate(u) {
  const slot = document.getElementById('update-slot');
  if (u.state === 'ready' && lastUpdateState !== 'ready') notifyDesktop('Pimpin update ready', `Restart the launcher to install ${u.version}.`);
  lastUpdateState = u.state;
  if (u.state === 'downloading') {
    clear(slot, el('button', { class: 'update-pill dl', title: `Downloading Pimpin ${u.version}`, onclick: () => updateModal() }, icon('download'), `Updating ${u.percent || 0}%`));
  } else if (u.state === 'ready') {
    clear(slot, el('button', { class: 'update-pill', title: `Restart to install Pimpin ${u.version}`, onclick: installUpdate }, icon('refresh'), 'Restart to update'));
  } else if (u.state === 'available' || u.state === 'manual') {
    clear(slot, el('button', { class: 'update-pill', title: `Pimpin ${u.version} is available`, onclick: () => updateModal() }, icon('download'), `Update to ${u.version}`));
  } else {
    slot.replaceChildren();
  }
  renderUpdateCard(u);
}

// The sidebar card stays put until the update is installed, so it can't be missed.
function renderUpdateCard(u) {
  const notes = el('button', { class: 'link', onclick: () => updateModal() }, "What's new");
  if (u.state === 'available' || u.state === 'manual') {
    clear(updateCard,
      el('div', { class: 'update-card-head' }, icon('download'), el('b', { class: 'grow' }, 'Update available'), notes),
      el('span', { class: 'muted' }, `Pimpin ${u.version} is out. You have ${u.current}.`),
      el('button', { class: 'btn primary sm', onclick: () => api.call('update:download').catch(errorToast) },
        u.state === 'manual' ? 'Download Pimpin Launcher' : 'Update Pimpin Launcher'));
  } else if (u.state === 'downloading') {
    clear(updateCard,
      el('div', { class: 'update-card-head' }, el('span', { class: 'spin xs' }), el('b', { class: 'grow' }, `Downloading ${u.version || 'update'}`), el('span', { class: 'dim' }, `${u.percent || 0}%`)),
      el('div', { class: 'progress' }, el('i', { style: { width: `${u.percent || 0}%` } })));
  } else if (u.state === 'ready') {
    clear(updateCard,
      el('div', { class: 'update-card-head' }, icon('refresh'), el('b', { class: 'grow' }, 'Update ready'), notes),
      el('span', { class: 'muted' }, `Pimpin ${u.version} is downloaded.`),
      el('button', { class: 'btn primary sm', onclick: installUpdate }, 'Restart and update'));
  } else {
    updateCard.replaceChildren();
  }
  updateCard.classList.toggle('hidden', !updateCard.childElementCount);
}

// --------------------------------------------------------------- crashes --
async function showCrash(id) {
  const inst = state.instances.find((i) => i.id === id);
  notifyDesktop(`${inst?.name || 'Minecraft'} crashed`, 'Open the launcher to see what went wrong.');
  let info;
  try {
    info = await api.call('instances:crashInfo', id);
  } catch {
    toast('Minecraft closed unexpectedly. The Logs tab of the instance has the details.', 'err', 8000);
    return;
  }
  const log = el('div', { class: 'console small' }, info.tail.map((l) => el('div', { class: /ERROR|Exception|FATAL/.test(l) ? 'l-err' : /WARN/.test(l) ? 'l-warn' : '' }, l)));
  const share = el('button', { class: 'btn ghost' }, icon('upload'), 'Upload log');
  share.addEventListener('click', async () => {
    share.disabled = true;
    try {
      const { url } = await api.call('logs:upload', info.tail);
      navigator.clipboard.writeText(url);
      toast(`Uploaded to ${url} (link copied)`, 'ok', 8000);
    } catch (err) {
      errorToast(err);
    } finally {
      share.disabled = false;
    }
  });
  const m = modal({
    title: `${inst?.name || 'Minecraft'} crashed`,
    wide: true,
    body: [
      el('p', { class: 'muted', style: { margin: 0 } }, info.report?.description ? `Minecraft reported: ${info.report.description}` : `The game exited with code ${info.code}.`),
      info.hints.map((h) => el('div', { class: 'crash-hint' }, el('b', {}, icon('alert'), h.title), h.text ? el('pre', {}, h.text) : null)),
      log,
    ],
    actions: [
      el('button', { class: 'btn ghost', onclick: () => { navigator.clipboard.writeText(info.tail.join('\n')); toast('Log copied'); } }, icon('copy'), 'Copy log'),
      share,
      info.report ? el('button', { class: 'btn', onclick: () => api.call('shell:showItem', id, 'crash-reports', info.report.file) }, icon('folder'), 'Crash report') : null,
      el('button', { class: 'btn primary', onclick: () => { m.close(); navigate('instances', { id, tab: 'content' }); } }, icon('puzzle'), 'Manage mods'),
    ].filter(Boolean),
  });
  requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
}

async function boot() {
  wireEvents();
  installShortcuts(navigate, () => current);
  installDropImport();
  // pause the spinner/skin animations while the window is hidden (e.g. while playing)
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('app-hidden', document.hidden));
  document.getElementById('search-slot').append(
    el('button', { class: 'palette-btn', title: 'Search (Ctrl+K)', onclick: () => commandPalette(navigate) }, icon('search'), el('span', { class: 'grow' }, 'Search'), el('span', { class: 'kbd' }, 'Ctrl K')));
  await refreshSettings();
  applyAppearance();
  document.body.removeAttribute('data-appearance-pending');
  state.info = await api.call('app:info');
  document.body.classList.add(`os-${state.info.platform}`);
  await Promise.all([refreshAccounts(), refreshInstances(), refreshServers()]);
  if (PAGES[state.settings.startPage]) current = { page: state.settings.startPage, params: {} };
  for (const i of state.instances) if (i.running) state.game[i.id] = { state: 'running' };
  clear(document.getElementById('account-slot'), accountButton());
  render();
  renderUpdate(await api.call('update:get'));
  installNotifications(document.getElementById('notif-slot'), navigate).catch((err) => console.error(err));
  await whatsNew();
  onboarding(navigate);
}

boot().catch((err) => {
  document.body.removeAttribute('data-appearance-pending');
  console.error(err);
  toast(`Failed to start: ${err.message}`, 'err', 10000);
});
