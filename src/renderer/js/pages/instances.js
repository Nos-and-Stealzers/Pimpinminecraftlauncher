// Instances: the list (search, sort, group, grid or table) and the detail
// view with features, Pimpin Specials, content, worlds, screenshots, files,
// logs and per-instance settings.
import { el, icon, clear, errorToast, toast, confirmModal, modal, timeAgo, fmtDuration, switchEl, seg } from '../dom.js';
import { api, state, subscribe, refreshInstances, selectInstance, getVersions, LOADER_LABEL, ICON_KEYS } from '../state.js';
import { instIcon, instSubtitle, playInstance, stopInstance, newInstanceModal } from '../components.js';
import { featureGrid } from './home.js';
import { renderScreenshots } from '../screenshots.js';
import { fileBrowser } from '../files.js';
import { drawPimpin } from './pimpin.js';
import { importInstance, updateAllMods } from '../qol.js';
import { openWorldBackups } from '../world-backups.js';
import '../install-review.js'; // live popup for installs started from this page

const tabMem = {};
const PREFS_KEY = 'pimpin.instanceList';
const prefs = { sort: 'played', group: 'none', view: 'grid', closed: [], ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
const savePrefs = () => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

export function render(page, params, navigate) {
  if (params.id) return renderDetail(page, params.id, navigate, params.tab);
  return renderList(page, params, navigate);
}

// "1.21.4" > "1.9" > "24w14a"; snapshots sort below releases
function versionKey(v) {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(v || '');
  return m ? Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3] || 0) : 0;
}

const SORTS = {
  played: ['Last played', (a, b) => (b.lastPlayed || b.created || 0) - (a.lastPlayed || a.created || 0)],
  name: ['Name', (a, b) => a.name.localeCompare(b.name)],
  time: ['Play time', (a, b) => (b.playTime || 0) - (a.playTime || 0)],
  version: ['Game version', (a, b) => versionKey(b.mcVersion) - versionKey(a.mcVersion) || a.name.localeCompare(b.name)],
  created: ['Date created', (a, b) => (b.created || 0) - (a.created || 0)],
};
const GROUPS = {
  none: ['No groups', () => ''],
  loader: ['Loader', (i) => LOADER_LABEL[i.loader] || i.loader],
  version: ['Game version', (i) => /^\d+\.\d+/.exec(i.mcVersion)?.[0] || 'Snapshots'],
  source: ['Source', (i) => (i.modpack ? 'Modpacks' : 'Made here')],
};

function quickPlay(i) {
  const running = state.game[i.id]?.state === 'running';
  const preparing = state.game[i.id]?.state === 'preparing';
  return el('button', {
    class: `mini-play quick${running ? ' running' : ''}`,
    title: running ? 'Stop' : preparing ? 'Launching' : 'Play',
    disabled: preparing,
    onclick: (e) => {
      e.stopPropagation();
      if (running) stopInstance(i.id);
      else selectInstance(i.id).then(() => playInstance(i.id));
    },
  }, preparing ? el('span', { class: 'spin xs' }) : icon(running ? 'stop' : 'play'));
}

function instCard(i, navigate) {
  const running = state.game[i.id]?.state === 'running';
  return el('div', { class: `card inst-card${running ? ' running' : ''}`, onclick: () => navigate('instances', { id: i.id }) },
    el('div', { class: 'top' }, instIcon(i), el('div', { class: 'grow' }, el('b', {}, i.name), el('span', {}, instSubtitle(i)))),
    el('div', { class: 'bottom' },
      running ? el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), 'Running') : el('span', {}, i.lastPlayed ? `${timeAgo(i.lastPlayed)} · ${fmtDuration(i.playTime)}` : 'Never played'),
      i.contentCount ? el('span', { title: 'Mods and packs' }, icon('puzzle'), ` ${i.contentCount}`) : null,
      quickPlay(i)));
}

function instTable(list, navigate) {
  return el('table', { class: 'inst-table' },
    el('thead', {}, el('tr', {}, ['Name', 'Version', 'Loader', 'Mods', 'Play time', 'Last played', ''].map((h) => el('th', {}, h)))),
    el('tbody', {}, list.map((i) =>
      el('tr', { onclick: () => navigate('instances', { id: i.id }) },
        el('td', { class: 'name' }, el('div', { class: 'row' }, instIcon(i, 'xs'), i.name, state.game[i.id]?.state === 'running' ? el('span', { class: 'dot', title: 'Running' }) : null)),
        el('td', {}, i.mcVersion),
        el('td', {}, LOADER_LABEL[i.loader] || i.loader),
        el('td', {}, String(i.contentCount || 0)),
        el('td', {}, fmtDuration(i.playTime)),
        el('td', {}, timeAgo(i.lastPlayed)),
        el('td', {}, quickPlay(i))))));
}

function renderList(page, params, navigate) {
  const body = el('div');
  const search = el('input', { class: 'input', placeholder: 'Search instances' });
  const pickSel = (opts, key) => {
    const s = el('select', { class: 'select auto' }, Object.entries(opts).map(([k, [label]]) => el('option', { value: k }, label)));
    s.value = opts[prefs[key]] ? prefs[key] : Object.keys(opts)[0];
    s.addEventListener('change', () => { prefs[key] = s.value; savePrefs(); draw(); });
    return s;
  };

  const draw = () => {
    if (!state.instances.length) {
      clear(body, el('div', { class: 'card empty' }, icon('layers'), el('h3', {}, 'No instances'),
        el('div', {}, 'Create one, install a modpack from the library, or drop a .mrpack file onto this window.'),
        el('button', { class: 'btn primary', onclick: () => newInstanceModal() }, icon('plus'), 'New instance')));
      return;
    }
    const q = search.value.trim().toLowerCase();
    const list = state.instances
      .filter((i) => !q || `${i.name} ${i.mcVersion} ${i.loader}`.toLowerCase().includes(q))
      .sort((SORTS[prefs.sort] || SORTS.played)[1]);
    if (!list.length) {
      clear(body, el('div', { class: 'card empty' }, icon('search'), el('h3', {}, 'No matches'), el('div', {}, `Nothing called "${search.value.trim()}".`)));
      return;
    }
    const groupOf = (GROUPS[prefs.group] || GROUPS.none)[1];
    const groups = new Map();
    for (const i of list) {
      const g = groupOf(i);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(i);
    }
    const keys = [...groups.keys()];
    if (prefs.group === 'version') keys.sort((a, b) => versionKey(b) - versionKey(a));
    else keys.sort();
    const block = (items) => (prefs.view === 'table' ? instTable(items, navigate) : el('div', { class: 'inst-grid' }, items.map((i) => instCard(i, navigate))));
    if (keys.length === 1 && !keys[0]) return clear(body, block(list));
    clear(body, keys.map((k) => {
      const closed = prefs.closed.includes(`${prefs.group}:${k}`);
      const head = el('button', { class: `group-head${closed ? ' closed' : ''}`, onclick: () => {
        const id = `${prefs.group}:${k}`;
        prefs.closed = closed ? prefs.closed.filter((x) => x !== id) : [...prefs.closed, id];
        savePrefs();
        draw();
      } }, icon('chevron'), k, el('span', { class: 'count' }, String(groups.get(k).length)));
      return [head, closed ? null : block(groups.get(k))];
    }));
  };
  search.addEventListener('input', draw);

  page.append(
    el('div', { class: 'page-head' },
      el('div', {}, el('h1', { class: 'page-title' }, 'Instances'), el('p', { class: 'page-sub' }, 'Each instance keeps its own version, mods, worlds and settings.')),
      el('div', { class: 'row' },
        el('button', { class: 'btn', title: 'Update the mods in every instance', onclick: () => updateAllMods() }, icon('refresh'), 'Update all'),
        el('button', { class: 'btn', title: 'Import a .mrpack modpack or a Pimpin .zip export', onclick: () => importInstance(navigate) }, icon('upload'), 'Import'),
        el('button', { class: 'btn primary', onclick: () => newInstanceModal() }, icon('plus'), 'New instance'))),
    el('div', { class: 'toolbar' },
      el('div', { class: 'search' }, icon('search'), search),
      el('span', { class: 'label' }, 'Sort'), pickSel(SORTS, 'sort'),
      el('span', { class: 'label' }, 'Group'), pickSel(GROUPS, 'group'),
      el('span', { class: 'grow' }),
      seg([{ value: 'grid', label: 'Grid', icon: 'grid' }, { value: 'table', label: 'List', icon: 'menu' }], prefs.view, (v) => { prefs.view = v; savePrefs(); draw(); })),
    body,
  );
  draw();
  if (params.create) newInstanceModal();
  return subscribe((t) => (t === 'instances' || t === 'game') && draw());
}

// --------------------------------------------------------------- detail --
function renderDetail(page, id, navigate, initialTab) {
  let inst = state.instances.find((i) => i.id === id);
  if (!inst) {
    page.append(el('div', { class: 'card empty' }, el('h3', {}, 'Instance not found'), el('button', { class: 'btn', onclick: () => navigate('instances') }, 'All instances')));
    return null;
  }
  let tab = initialTab || tabMem[id] || 'features';
  const head = el('div');
  const tabs = el('div', { class: 'tabs' });
  const body = el('div');
  let offTab = null;

  const remove = async () => {
    if (!(await confirmModal('Delete instance?', `"${inst.name}" and all of its worlds, mods and settings will be deleted.`, { confirm: 'Delete', danger: true }))) return;
    try {
      await api.call('instances:delete', id);
      await refreshInstances();
      navigate('instances');
      toast('Instance deleted');
    } catch (err) {
      errorToast(err);
    }
  };

  // get the game files checked now so Play starts right away
  api.call('instances:warm', id).catch(() => {});

  const duplicate = async () => {
    try {
      const copy = await api.call('instances:duplicate', id);
      await refreshInstances();
      toast(`Created ${copy.name}`);
      navigate('instances', { id: copy.id });
    } catch (err) {
      errorToast(err);
    }
  };

  const drawHead = () => {
    inst = state.instances.find((i) => i.id === id) || inst;
    const g = state.game[id]?.state;
    clear(head,
      el('button', { class: 'back', onclick: () => navigate('instances') }, icon('back'), 'Instances'),
      el('div', { class: 'detail-head' },
        instIcon(inst, 'lg'),
        el('div', { class: 'grow' },
          el('h1', {}, inst.name),
          el('div', { class: 'chips' },
            el('span', { class: 'chip' }, `Minecraft ${inst.mcVersion}`),
            el('span', { class: 'chip' }, `${LOADER_LABEL[inst.loader]}${inst.loaderVersion ? ` ${inst.loaderVersion}` : ''}`),
            el('span', { class: 'chip', title: 'Play time' }, icon('clock'), fmtDuration(inst.playTime)),
            g === 'running' ? el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), 'Running') : null)),
        el('div', { class: 'row' },
          el('button', { class: 'btn icon ghost', title: 'Open folder', onclick: () => api.call('instances:open', id) }, icon('folder')),
          el('button', { class: 'btn icon ghost', title: 'Export as .zip', onclick: () => api.call('instances:export', id).then((f) => f && toast('Instance exported')).catch(errorToast) }, icon('archive')),
          el('button', { class: 'btn icon ghost', title: 'Duplicate', onclick: duplicate }, icon('copy')),
          el('button', { class: 'btn icon ghost danger', title: 'Delete', onclick: remove }, icon('trash')),
          g === 'running'
            ? el('button', { class: 'play-btn running', onclick: () => stopInstance(id) }, icon('stop'), 'Stop')
            : el('button', { class: `play-btn${g === 'preparing' ? ' busy' : ''}`, disabled: g === 'preparing', onclick: () => selectInstance(id).then(() => playInstance(id)) },
                g === 'preparing' ? el('span', { class: 'spin xs' }) : icon('play'), g === 'preparing' ? 'Launching' : 'Play'))));
  };

  const drawTabs = () => {
    const defs = [
      ['features', 'Features', 'wand'],
      ['pimpin', 'Pimpin Specials', 'sparkle'],
      ['content', 'Content', 'puzzle'],
      ['worlds', 'Worlds', 'globe'],
      ['screenshots', 'Screenshots', 'image'],
      ['files', 'Files', 'folder'],
      ['console', 'Logs', 'terminal'],
      ['settings', 'Settings', 'settings'],
    ];
    clear(tabs, defs.map(([k, l, ic]) => el('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; tabMem[id] = k; drawTabs(); drawBody(); } }, icon(ic), l,
      k === 'content' && inst.contentCount ? el('span', { class: 'count' }, String(inst.contentCount)) : null)));
  };

  const drawBody = () => {
    offTab?.();
    offTab = null;
    clear(body);
    if (tab === 'features') drawFeatures(body, inst, navigate);
    if (tab === 'content') drawContent(body, inst, navigate);
    if (tab === 'worlds') drawWorlds(body, inst);
    if (tab === 'screenshots') offTab = renderScreenshots(body, inst);
    if (tab === 'pimpin') drawPimpin(body, inst);
    if (tab === 'files') fileBrowser(body, { kind: 'instance', id: inst.id }, { rootLabel: inst.name });
    if (tab === 'console') offTab = drawLogs(body, inst);
    if (tab === 'settings') drawSettings(body, inst, drawHead);
  };

  page.append(head, tabs, body);
  drawHead();
  drawTabs();
  drawBody();
  const unsub = subscribe((t) => (t === 'instances' || t === 'game') && drawHead());
  return () => {
    unsub();
    offTab?.();
  };
}

async function drawFeatures(root, inst, navigate) {
  if (inst.loader === 'vanilla') {
    root.append(el('div', { class: 'card empty' }, icon('puzzle'), el('h3', {}, 'Features need Fabric or Quilt'), el('div', {}, 'Change the loader in the Settings tab.')));
    return;
  }
  root.append(el('div', { class: 'row muted' }, el('span', { class: 'spin xs' }), 'Loading'));
  try {
    const list = await api.call('features:list', { kind: 'instance', id: inst.id });
    clear(root,
      el('div', { class: 'filter-row' },
        el('span', { class: 'muted grow' }, `Each switch installs the right mods and their dependencies for Minecraft ${inst.mcVersion}.`),
        el('button', { class: 'btn sm', onclick: () => navigate('library', { type: 'mod', instanceId: inst.id }) }, icon('library'), 'Browse all mods')),
      featureGrid(inst, list));
  } catch (err) {
    clear(root, el('div', { class: 'card empty' }, err.message));
  }
}

const TYPE_LABEL = { mod: 'Mod', shader: 'Shader', resourcepack: 'Resource pack' };
const TYPE_FOLDER = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' };

async function drawContent(root, inst, navigate) {
  const target = { kind: 'instance', id: inst.id };
  let filter = 'all';
  let query = '';
  let items = [];
  let updates = new Map(); // projectId -> update
  let checking = false;
  const list = el('div', { class: 'content-list' });
  const updSlot = el('span', { class: 'row' });
  const searchIn = el('input', { class: 'input', placeholder: 'Filter installed', style: { width: '220px' } });

  const applyUpdates = async (picked, btn) => {
    btn.disabled = true;
    btn.replaceChildren(el('span', { class: 'spin xs' }), 'Updating');
    try {
      const res = await api.call('content:applyUpdates', target, picked);
      for (const u of picked) updates.delete(u.projectId);
      if (!res?.failed?.length) toast(picked.length === 1 ? `Updated ${picked[0].title} to ${picked[0].newVersionNumber}` : `Updated ${picked.length} mods`);
      await load(false);
    } catch (err) {
      errorToast(err);
      btn.disabled = false;
    }
  };

  const drawUpdateSlot = () => {
    if (checking) return clear(updSlot, el('span', { class: 'dim row' }, el('span', { class: 'spin xs' }), 'Checking for updates'));
    if (!updates.size) {
      return clear(updSlot, el('button', { class: 'btn sm', onclick: () => check(true) }, icon('refresh'), 'Check for updates'));
    }
    const all = el('button', { class: 'btn sm primary' }, icon('download'), `Update all (${updates.size})`);
    all.addEventListener('click', () => applyUpdates([...updates.values()], all));
    clear(updSlot, all);
  };

  const draw = () => {
    const shown = items.filter((i) => (filter === 'all' || i.type === filter) && (!query || i.title.toLowerCase().includes(query) || i.file.toLowerCase().includes(query)));
    if (!shown.length) {
      clear(list, el('div', { class: 'card empty' }, icon('box'), el('h3', {}, items.length ? 'No matches' : 'Nothing installed'),
        el('div', {}, items.length ? 'Try another filter.' : 'Add mods, shaders and resource packs from the library, or drop jar files right here to install them.')));
      return;
    }
    clear(list, shown.map((i) => {
      const upd = i.projectId && updates.get(i.projectId);
      let updBtn = null;
      if (upd) {
        updBtn = el('button', { class: 'chip accent click', title: `${upd.versionNumber || 'installed'} → ${upd.newVersionNumber}` }, icon('download'), upd.newVersionNumber);
        updBtn.addEventListener('click', () => applyUpdates([upd], updBtn));
      }
      // Mods/plugins tracked in Modrinth can be pinned and offered other versions.
      const tracked = i.projectId && (i.type === 'mod' || i.type === 'plugin');
      const pinBtn = tracked ? el('button', {
        class: `btn ghost icon sm${i.pinned ? ' active' : ''}`,
        title: i.pinned ? 'Pinned: update checks skip this mod. Click to unpin.' : 'Pin: keep this version, update checks stop bothering it',
      }, icon('pin')) : null;
      if (pinBtn) pinBtn.addEventListener('click', () => togglePin(i));
      const verBtn = tracked ? el('button', { class: 'btn ghost icon sm', title: 'Other versions / downgrade' }, icon('history')) : null;
      if (verBtn) verBtn.addEventListener('click', () => pickVersion(i));
      return el('div', { class: `content-row${i.enabled ? '' : ' off'}` },
        i.icon ? el('img', { src: i.icon, alt: '', loading: 'lazy' }) : el('div', { class: 'ph' }, icon(i.type === 'shader' ? 'sun' : i.type === 'resourcepack' ? 'palette' : 'puzzle')),
        el('div', { class: 'grow' }, el('b', { class: i.pinned ? 'pinned' : undefined }, i.title), el('span', {}, `${TYPE_LABEL[i.type]} · ${i.file}`)),
        updBtn,
        el('span', { class: 'ver', title: i.versionNumber || '' }, i.versionNumber || ''),
        pinBtn,
        verBtn,
        switchEl(i.enabled, async (on) => {
          try {
            await api.call('content:toggle', target, { type: i.type, file: i.file, enabled: on });
            i.enabled = on;
            draw();
          } catch (err) {
            errorToast(err);
          }
        }),
        el('button', {
          class: 'btn ghost icon sm danger',
          title: 'Remove',
          onclick: async () => {
            try {
              await api.call('content:remove', target, { type: i.type, file: i.file });
              items = items.filter((x) => x !== i);
              draw();
              toast(`Removed ${i.title}`);
            } catch (err) {
              errorToast(err);
            }
          },
        }, icon('trash')));
    }));
  };

  /** Show the library version list for an installed item; picking one installs it (downgrades included). */
  const pickVersion = async (item) => {
    const body = el('div', { class: 'row muted', style: { padding: '30px', justifyContent: 'center' } }, el('span', { class: 'spin' }), 'Loading versions');
    const m = modal({ title: item.title, body });
    try {
      const opts = {};
      if (item.type === 'mod') {
        opts.gameVersions = [inst.mcVersion];
        opts.loaders = inst.loader === 'quilt' ? ['quilt', 'fabric'] : [inst.loader];
      }
      const versions = await api.call('library:versions', item.projectId, opts);
      const rows = versions.slice(0, 50).map((v) => {
        const current = v.version_number === item.versionNumber;
        const b = el(
          'button',
          { class: `version-row${current ? ' current' : ''}` },
          el('span', { class: 'grow' }, v.version_number, el('span', { class: 'muted' }, ` · ${v.game_versions.slice(-2).join(', ')}${v.version_type !== 'release' ? ` (${v.version_type})` : ''}`)),
          current ? el('span', { class: 'chip ok' }, icon('check'), 'Installed') : el('span', { class: 'chip' }, icon('download'), 'Switch'),
        );
        b.addEventListener('click', async () => {
          if (current) return;
          b.disabled = true;
          b.lastChild.replaceChildren(el('span', { class: 'spin xs' }), 'Switching');
          try {
            await api.call('content:install', target, { projectId: item.projectId, type: item.type, versionId: v.id });
            toast(`Switched ${item.title} to ${v.version_number}`);
            m.close();
            await load(false);
          } catch (err) {
            errorToast(err);
            b.disabled = false;
            b.lastChild.replaceChildren(icon('download'), 'Switch');
          }
        });
        return b;
      });
      clear(body, el('div', { class: 'version-list' }, rows.length ? rows : el('div', { class: 'card empty' }, 'No compatible versions for this toggle.')));
    } catch (err) {
      clear(body, el('div', { class: 'empty' }, err.message));
    }
  };

  const togglePin = async (item) => {
    try {
      const pinned = await api.call('content:setPinned', target, { type: item.type, file: item.file, pinned: !item.pinned });
      item.pinned = pinned;
      if (pinned) updates.delete(item.projectId);
      toast(pinned ? `Pinned ${item.title} — update checks skip it now` : `Unpinned ${item.title} — update checks resume`);
      drawUpdateSlot();
      draw();
    } catch (err) {
      errorToast(err);
    }
  };

  const check = async (loud) => {    if (!items.some((i) => i.projectId && i.type === 'mod')) {
      if (loud) toast('No library mods to check');
      return;
    }
    checking = true;
    drawUpdateSlot();
    try {
      const found = await api.call('content:checkUpdates', target);
      updates = new Map(found.map((u) => [u.projectId, u]));
      if (loud && !found.length) toast('Everything is up to date');
    } catch (err) {
      if (loud) errorToast(err);
    } finally {
      checking = false;
      drawUpdateSlot();
      draw();
    }
  };

  const load = async (withCheck = true) => {
    items = await api.call('content:list', target);
    draw();
    if (items.some((i) => !i.projectId)) {
      const n = await api.call('content:identify', target).catch(() => 0);
      if (n) {
        items = await api.call('content:list', target);
        draw();
      }
    }
    if (withCheck) check(false);
  };

  searchIn.addEventListener('input', () => {
    query = searchIn.value.toLowerCase();
    draw();
  });

  // Drag & drop: jars land in mods; with the Shaders / Resource packs filter
  // active, .zip packs go straight into their folder (same machinery as the Files tab).
  const hintTitle = el('b', {}, 'Drop jar files to install');
  const hintSub = el('span', { class: 'muted' }, 'They land in the mods folder');
  const hint = el('div', { class: 'file-drop' }, icon('upload'), hintTitle, hintSub);
  const dropHint = () => {
    if (filter === 'shader') {
      hintTitle.textContent = 'Drop shader packs to install';
      hintSub.textContent = '.zip files land in the shaderpacks folder — jars still go to mods';
    } else if (filter === 'resourcepack') {
      hintTitle.textContent = 'Drop resource packs to install';
      hintSub.textContent = '.zip files land in the resourcepacks folder — jars still go to mods';
    } else {
      hintTitle.textContent = 'Drop jar files to install';
      hintSub.textContent = 'They land in the mods folder';
    }
  };
  dropHint();
  const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
  let depth = 0;
  const browser = el('div', { class: 'content-browser' },
    el('div', { class: 'filter-row' },
      seg([
        { value: 'all', label: 'All' },
        { value: 'mod', label: 'Mods' },
        { value: 'shader', label: 'Shaders' },
        { value: 'resourcepack', label: 'Resource packs' },
      ], filter, (v) => { filter = v; dropHint(); draw(); }),
      el('div', { class: 'search' }, icon('search'), searchIn),
      el('span', { class: 'grow' }),
      updSlot,
      el('button', { class: 'btn sm', onclick: () => api.call('instances:open', inst.id, filter === 'all' ? 'mods' : TYPE_FOLDER[filter]) }, icon('folder'), 'Folder'),
      el('button', { class: 'btn sm primary', onclick: () => navigate('library', { type: filter === 'all' ? 'mod' : filter, instanceId: inst.id }) }, icon('plus'), 'Add content')),
    list,
    hint,
  );
  browser.addEventListener('dragenter', (ev) => {
    if (!hasFiles(ev)) return;
    ev.preventDefault();
    depth++;
    browser.classList.add('dragging');
  });
  browser.addEventListener('dragover', (ev) => hasFiles(ev) && ev.preventDefault());
  browser.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      browser.classList.remove('dragging');
    }
  });
  browser.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    depth = 0;
    browser.classList.remove('dragging');
    const paths = [...(ev.dataTransfer?.files || [])].map((f) => api.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    const zipTarget = filter === 'shader' ? 'shaderpacks' : filter === 'resourcepack' ? 'resourcepacks' : null;
    const jars = paths.filter((p) => /\.jar$/i.test(p));
    const packs = zipTarget ? paths.filter((p) => /\.zip$/i.test(p)) : [];
    if (!jars.length && !packs.length) {
      toast(zipTarget
        ? 'Only .zip files can be dropped here.'
        : 'Only .jar mod files can be dropped here. Pick the Shaders or Resource packs filter to drop .zip packs.', 'info');
      return;
    }
    try {
      const done = [];
      if (jars.length) {
        await api.call('files:import', target, 'mods', jars);
        done.push(`${jars.length} mod file${jars.length === 1 ? '' : 's'}`);
      }
      if (packs.length) {
        await api.call('files:import', target, zipTarget, packs);
        done.push(`${packs.length} ${zipTarget === 'shaderpacks' ? 'shader pack' : 'resource pack'}${packs.length === 1 ? '' : 's'}`);
      }
      toast(`Installed ${done.join(' and ')}`);
      await load(false);
    } catch (err) {
      errorToast(err);
    }
  });
  root.append(browser);
  drawUpdateSlot();
  clear(list, el('div', { class: 'row muted' }, el('span', { class: 'spin xs' }), 'Loading'));
  load().catch(errorToast);
}

async function drawWorlds(root, inst) {
  const list = el('div', { class: 'world-list' }, el('div', { class: 'row muted' }, el('span', { class: 'spin xs' }), 'Loading'));
  root.append(
    el('div', { class: 'filter-row' },
      el('span', { class: 'muted grow' }, 'Play loads straight into the world (Minecraft 1.20 and newer).'),
      el('button', { class: 'btn sm', onclick: () => api.call('instances:open', inst.id, 'saves') }, icon('folder'), 'Saves folder')),
    list,
  );
  try {
    const worlds = await api.call('instances:worlds', inst.id);
    if (!worlds.length) {
      clear(list, el('div', { class: 'card empty', style: { gridColumn: '1 / -1' } }, icon('globe'), el('h3', {}, 'No worlds yet'), el('div', {}, 'Worlds you create in-game show up here.')));
      return;
    }
    clear(list, worlds.map((w) =>
      el('div', { class: 'card world-row' },
        w.icon ? el('img', { class: 'world-ico', src: w.icon, alt: '' }) : el('div', { class: 'world-ico' }, icon('globe')),
        el('div', { class: 'grow' }, el('b', {}, w.folder), el('span', {}, `Played ${timeAgo(w.lastPlayed).toLowerCase()}`)),
        el('button', { class: 'btn sm ghost', onclick: () => openWorldBackups(inst, w) }, 'Backups'),
        el('button', { class: 'btn sm ghost icon', title: 'Show in folder', onclick: () => api.call('shell:showItem', inst.id, 'saves', w.folder) }, icon('folder')),
        el('button', { class: 'btn sm primary', onclick: () => selectInstance(inst.id).then(() => playInstance(inst.id, { world: w.folder })) }, icon('play'), 'Play'))));
  } catch (err) {
    clear(list, el('div', { class: 'card empty' }, err.message));
  }
}

// ----------------------------------------------------------------- logs --
const levelOf = (line) => (/ERROR|Exception|FATAL|SEVERE|\tat /.test(line) ? 'err' : /WARN/.test(line) ? 'warn' : '');
const MAX_SHOWN = 3000;

/** A scrolling log box. `add` appends and keeps the view pinned to the bottom. Used by the server console too. */
export function consoleView(lines) {
  const box = el('div', { class: 'console' });
  const add = (line) => {
    const lvl = /\[Pimpin\]/.test(line) ? 'pimpin' : levelOf(line);
    const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    box.append(el('div', { class: lvl ? `l-${lvl}` : '' }, line));
    while (box.childElementCount > MAX_SHOWN) box.firstChild.remove();
    if (stick) box.scrollTop = box.scrollHeight;
  };
  for (const l of lines) add(l);
  requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
  return { box, add };
}

function drawLogs(root, inst) {
  let source = 'live';
  let level = 'all';
  let query = '';
  let lines = [];
  const box = el('div', { class: 'console' });
  const stats = el('span', { class: 'log-stats' });
  const sourceSel = el('select', { class: 'select auto' }, el('option', { value: 'live' }, 'This session'));
  const searchIn = el('input', { class: 'input', placeholder: 'Find in log', style: { width: '200px' } });

  const passes = (line) => (level === 'all' || (level === 'warn' ? levelOf(line) !== '' : levelOf(line) === 'err')) && (!query || line.toLowerCase().includes(query));
  const row = (line) => {
    const lvl = /\[Pimpin\]/.test(line) ? 'pimpin' : levelOf(line);
    const div = el('div', { class: lvl ? `l-${lvl}` : '' });
    if (!query) div.textContent = line;
    else {
      // highlight every match, case-insensitive
      const low = line.toLowerCase();
      let at = 0;
      for (let i = low.indexOf(query); i !== -1; i = low.indexOf(query, at)) {
        div.append(line.slice(at, i), el('mark', {}, line.slice(i, i + query.length)));
        at = i + query.length;
      }
      div.append(line.slice(at));
    }
    return div;
  };
  const drawStats = () => {
    const warn = lines.filter((l) => levelOf(l) === 'warn').length;
    const err = lines.filter((l) => levelOf(l) === 'err').length;
    stats.textContent = `${lines.length} lines · ${warn} warnings · ${err} errors`;
  };
  const draw = () => {
    const shown = lines.filter(passes);
    box.replaceChildren(...shown.slice(-MAX_SHOWN).map(row));
    if (!shown.length) box.append(el('div', { class: 'dim' }, lines.length ? 'No lines match.' : source === 'live' ? 'No output yet. Press Play to start the game.' : 'This log is empty.'));
    drawStats();
    requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
  };
  const loadSource = async () => {
    try {
      lines = source === 'live' ? await api.call('instances:logs', inst.id) : await api.call('logs:read', inst.id, source);
    } catch (err) {
      lines = [];
      errorToast(err);
    }
    draw();
  };

  api.call('logs:list', inst.id).then((files) => {
    for (const f of files) sourceSel.append(el('option', { value: f.name }, f.name === 'latest.log' ? 'latest.log (last run)' : f.name));
  }).catch(() => {});
  sourceSel.addEventListener('change', () => { source = sourceSel.value; loadSource(); });
  let t;
  searchIn.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { query = searchIn.value.trim().toLowerCase(); draw(); }, 150);
  });

  const upload = el('button', { class: 'btn sm', title: 'Upload to mclo.gs and copy the link' }, icon('upload'), 'Upload');
  upload.addEventListener('click', async () => {
    upload.disabled = true;
    try {
      const { url } = await api.call('logs:upload', lines);
      navigator.clipboard.writeText(url);
      toast(`Uploaded to ${url} (link copied)`, 'ok', 8000);
    } catch (err) {
      errorToast(err);
    } finally {
      upload.disabled = false;
    }
  });

  root.append(
    el('div', { class: 'filter-row' },
      sourceSel,
      seg([{ value: 'all', label: 'All' }, { value: 'warn', label: 'Warnings' }, { value: 'err', label: 'Errors' }], level, (v) => { level = v; draw(); }),
      el('div', { class: 'search' }, icon('search'), searchIn),
      el('span', { class: 'grow' }),
      el('button', { class: 'btn sm', onclick: () => { navigator.clipboard.writeText(lines.filter(passes).join('\n')); toast('Copied'); } }, icon('copy'), 'Copy'),
      upload,
      el('button', { class: 'btn sm ghost icon', title: 'Logs folder', onclick: () => api.call('instances:open', inst.id, 'logs').catch(() => {}) }, icon('folder'))),
    box,
    el('div', { class: 'filter-row', style: { marginTop: '8px' } }, stats, el('span', { class: 'grow' }),
      el('button', { class: 'btn sm ghost', onclick: () => api.call('instances:open', inst.id, 'crash-reports').catch(() => api.call('instances:open', inst.id)) }, icon('folder'), 'Crash reports')),
  );
  loadSource();
  return api.on('game:log', (e) => {
    if (e.id !== inst.id || source !== 'live') return;
    lines.push(e.line);
    if (!passes(e.line)) return drawStats();
    if (box.firstChild?.classList?.contains('dim')) box.replaceChildren();
    const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    box.append(row(e.line));
    while (box.childElementCount > MAX_SHOWN) box.firstChild.remove();
    if (stick) box.scrollTop = box.scrollHeight;
    drawStats();
  });
}

// ------------------------------------------------------------- settings --
async function drawSettings(root, inst, onSaved) {
  const name = el('input', { class: 'input', value: inst.name, maxlength: 40 });
  let iconKey = inst.icon;
  const iconRow = el('div', { class: 'icon-pick' });
  const drawIcons = () => clear(iconRow, ICON_KEYS.map((k) => el('div', { class: `inst-icon sm ic-${k}${k === iconKey ? ' on' : ''}`, onclick: () => { iconKey = k; drawIcons(); } }, inst.name.charAt(0).toUpperCase())));
  drawIcons();
  let loader = inst.loader;
  const version = el('select', { class: 'select' }, el('option', { value: inst.mcVersion }, inst.mcVersion));
  getVersions().then(({ versions }) => {
    clear(version, versions.filter((v) => v.type === 'release' || v.id === inst.mcVersion).map((v) => el('option', { value: v.id }, v.id)));
    version.value = inst.mcVersion;
  }).catch(() => {});

  const total = state.settings.totalMemory;
  const useCustomMem = el('input', { type: 'checkbox', checked: Boolean(inst.memoryMax) });
  const mem = el('input', { type: 'range', min: 1024, max: Math.max(2048, total - 1024), step: 256, value: inst.memoryMax || state.settings.memoryMax });
  const memVal = el('span', { class: 'mem-val' });
  const syncMem = () => {
    memVal.textContent = `${(mem.value / 1024).toFixed(1)} GB`;
    mem.disabled = !useCustomMem.checked;
    memVal.style.opacity = useCustomMem.checked ? 1 : 0.4;
  };
  mem.addEventListener('input', syncMem);
  useCustomMem.addEventListener('change', syncMem);
  syncMem();
  const jvm = el('textarea', { class: 'input', rows: 2, placeholder: `Default: ${state.settings.jvmArgs}` }, inst.jvmArgs || '');
  const java = el('input', { class: 'input', placeholder: 'Automatic (recommended)', value: inst.javaPath || '' });
  const width = el('input', { class: 'input', type: 'number', placeholder: String(state.settings.width), value: inst.width || '' });
  const height = el('input', { class: 'input', type: 'number', placeholder: String(state.settings.height), value: inst.height || '' });
  const notes = el('textarea', { class: 'input prose', rows: 4, placeholder: 'Server addresses, seeds, which mods need configuring, anything.' }, inst.notes || '');

  const repair = el('button', { class: 'btn' }, 'Repair game files');
  repair.addEventListener('click', async () => {
    repair.disabled = true;
    repair.textContent = 'Checking files...';
    try {
      await api.call('instances:repair', inst.id);
      toast('Game files checked');
    } catch (err) {
      errorToast(err);
    } finally {
      repair.disabled = false;
      repair.textContent = 'Repair game files';
    }
  });

  const save = el('button', { class: 'btn primary' }, icon('check'), 'Save');
  save.addEventListener('click', async () => {
    try {
      const changedGame = version.value !== inst.mcVersion || loader !== inst.loader;
      if (changedGame && inst.loader !== 'vanilla' && !(await confirmModal('Change version or loader?', 'Installed mods may not work with the new version. Check for updates in the Content tab afterwards, or remove mods that break.', { confirm: 'Change it' }))) return;
      const updated = await api.call('instances:update', inst.id, {
        name: name.value.trim() || inst.name,
        icon: iconKey,
        mcVersion: version.value,
        loader,
        memoryMax: useCustomMem.checked ? Number(mem.value) : null,
        jvmArgs: jvm.value.trim() || null,
        javaPath: java.value.trim() || null,
        width: Number(width.value) || null,
        height: Number(height.value) || null,
        notes: notes.value.trim() || null,
      });
      Object.assign(inst, updated);
      await refreshInstances();
      onSaved();
      toast('Saved');
    } catch (err) {
      errorToast(err);
    }
  });

  root.append(
    el('div', { class: 'card settings-card' },
      el('h3', {}, 'General'),
      el('div', { class: 'form-grid' }, el('label', { class: 'field' }, 'Name', name), el('div', { class: 'field' }, 'Icon', iconRow)),
      el('label', { class: 'field' }, 'Notes', notes)),
    el('div', { class: 'card settings-card' },
      el('h3', {}, 'Game'),
      el('div', { class: 'form-grid' },
        el('label', { class: 'field' }, 'Minecraft version', version),
        el('div', { class: 'field' }, 'Mod loader', seg([{ value: 'fabric', label: 'Fabric' }, { value: 'quilt', label: 'Quilt' }, { value: 'vanilla', label: 'Vanilla' }], loader, (v) => (loader = v))))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, 'Java and memory'),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Custom memory'), el('span', {}, `Instead of the global ${(state.settings.memoryMax / 1024).toFixed(1)} GB`)), el('label', { class: 'switch' }, useCustomMem, el('span'))),
      el('div', { class: 'set-row' }, mem, memVal),
      el('label', { class: 'field' }, 'JVM arguments', jvm),
      el('label', { class: 'field' }, 'Java executable', el('div', { class: 'row' }, java, el('button', { class: 'btn', onclick: async () => { const p = await api.call('dialog:pickJava'); if (p) java.value = p; } }, 'Browse'))),
      el('div', { class: 'form-grid', style: { gridTemplateColumns: '1fr 1fr' } }, el('label', { class: 'field' }, 'Window width', width), el('label', { class: 'field' }, 'Window height', height))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, 'Troubleshooting'),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Repair game files'), el('span', {}, 'Checks the game, libraries and assets and downloads anything missing or broken.')), repair)),
    el('div', { class: 'row', style: { justifyContent: 'flex-end' } }, save),
  );
}
