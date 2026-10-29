// Library: browse and install mods, shaders, resource packs, modpacks and
// server plugins from Modrinth.
import { el, icon, clear, modal, errorToast, toast, fmtNum, seg, safeUrl, markdown, switchEl } from '../dom.js';
import { api, state, refreshInstances, selectedInstance, LOADER_LABEL, SERVER_LABEL } from '../state.js';
import { installReview } from '../install-review.js';

installReview();

const CALLS = { search: 'library:search', project: 'library:project', versions: 'library:versions' };

const TYPES = [
  { value: 'mod', label: 'Mods', icon: 'puzzle' },
  { value: 'shader', label: 'Shaders', icon: 'sun' },
  { value: 'resourcepack', label: 'Resource packs', icon: 'palette' },
  { value: 'modpack', label: 'Modpacks', icon: 'library' },
  { value: 'plugin', label: 'Plugins', icon: 'server' },
];
const SORTS = [
  ['relevance', 'Relevance'],
  ['downloads', 'Most downloaded'],
  ['follows', 'Most followed'],
  ['newest', 'Newest'],
  ['updated', 'Recently updated'],
];
const PAGE = 24;
const CATEGORIES = {
  mod: ['optimization', 'utility', 'adventure', 'decoration', 'magic', 'technology', 'storage', 'worldgen', 'food', 'mobs'],
  shader: ['realistic', 'semi-realistic', 'fantasy', 'cartoon', 'vanilla-like', 'potato', 'low', 'high'],
  resourcepack: ['16x', '32x', 'realistic', 'simplistic', 'themed', 'vanilla-like', 'combat', 'gui'],
  modpack: ['optimization', 'adventure', 'technology', 'magic', 'quests', 'lightweight', 'multiplayer', 'challenging'],
  plugin: ['utility', 'economy', 'management', 'minigame', 'social', 'game-mechanics', 'adventure', 'worldgen'],
};

// Remember the browsing state between visits.
const mem = { type: 'mod', query: '', sort: 'relevance', offset: 0, compatible: true, instanceId: null, serverId: null, category: null };

export function render(page, params, navigate) {
  if (params.type) mem.type = params.type;
  if (params.instanceId) mem.instanceId = params.instanceId;
  if (params.serverId) mem.serverId = params.serverId;
  if (params.type || params.instanceId || params.serverId) mem.offset = 0;

  const results = el('div');
  const targetBar = el('div');
  const catRow = el('div', { class: 'cat-row' });
  const drawCats = () =>
    clear(
      catRow,
      el('button', { class: mem.category ? '' : 'on', onclick: () => { mem.category = null; mem.offset = 0; drawCats(); runSearch(); } }, 'All'),
      (CATEGORIES[mem.type] || []).map((c) =>
        el('button', { class: mem.category === c ? 'on' : '', onclick: () => { mem.category = mem.category === c ? null : c; mem.offset = 0; drawCats(); runSearch(); } }, c.replace(/-/g, ' '))),
    );
  const search = el('input', { class: 'input', placeholder: 'Search Modrinth', value: mem.query });
  const sortSel = el('select', { class: 'select', style: { width: '190px' } }, SORTS.map(([v, l]) => el('option', { value: v }, l)));
  sortSel.value = mem.sort;
  let installed = new Set();
  let seq = 0;

  const target = () => {
    if (mem.type === 'plugin') return state.servers.find((s) => s.id === mem.serverId) || state.servers[0] || null;
    if (mem.type === 'modpack') return null;
    return state.instances.find((i) => i.id === mem.instanceId) || selectedInstance();
  };
  const targetRef = () => {
    const t = target();
    if (!t) return null;
    return { kind: mem.type === 'plugin' ? 'server' : 'instance', id: t.id };
  };

  const loadInstalled = async () => {
    const ref = targetRef();
    installed = new Set();
    if (!ref) return;
    try {
      const items = await api.call('content:list', ref);
      installed = new Set(items.map((i) => i.projectId).filter(Boolean));
    } catch {
      /* ignore */
    }
  };

  const drawTarget = () => {
    const t = target();
    if (mem.type === 'modpack') {
      clear(targetBar, el('div', { class: 'target-bar' }, icon('info'), el('span', { class: 'grow' }, 'A modpack installs as a new instance. Fabric and Quilt packs are supported. You can also drop a .mrpack file onto the window.')));
      return;
    }
    const isPlugin = mem.type === 'plugin';
    const list = isPlugin ? state.servers : state.instances;
    if (!list.length) {
      clear(
        targetBar,
        el('div', { class: 'target-bar' }, icon('info'),
          el('span', { class: 'grow' }, isPlugin ? 'Plugins install onto a local server. Create one in the Servers tab first.' : 'Create an instance first to install content.'),
          el('button', { class: 'btn sm primary', onclick: () => navigate(isPlugin ? 'servers' : 'instances', { create: true }) }, icon('plus'), isPlugin ? 'New server' : 'New instance')),
      );
      return;
    }
    const sel = el('select', { class: 'select' }, list.map((x) => el('option', { value: x.id }, `${x.name} (${x.mcVersion}${isPlugin ? ` ${SERVER_LABEL[x.software] || 'Paper'}` : ` ${LOADER_LABEL[x.loader] || ''}`})`)));
    sel.value = t?.id;
    sel.addEventListener('change', async () => {
      if (isPlugin) mem.serverId = sel.value;
      else mem.instanceId = sel.value;
      mem.offset = 0;
      await runSearch();
    });
    const warn = !isPlugin && t && t.loader === 'vanilla' && (mem.type === 'mod' || mem.type === 'shader')
      ? el('span', { class: 'chip warn' }, icon('alert'), 'Vanilla instance. Switch it to Fabric to use this.')
      : isPlugin && t?.software === 'vanilla'
        ? el('span', { class: 'chip warn' }, icon('alert'), 'Vanilla server. Switch it to Paper or Purpur for plugins.')
        : null;
    clear(
      targetBar,
      el('div', { class: 'target-bar' },
        el('span', { class: 'muted' }, 'Installing into'),
        sel,
        warn,
        el('span', { class: 'grow' }),
        el('label', { class: 'row muted', style: { gap: '8px', fontSize: '12.5px' } }, 'Only compatible', switchEl(mem.compatible, (v) => { mem.compatible = v; mem.offset = 0; runSearch(); })),
      ),
      mem.type === 'resourcepack' && t
        ? el('div', { class: 'pimpin-promo', onclick: () => navigate('instances', { id: t.id, tab: 'pimpin' }) },
            icon('sparkle'),
            el('div', { class: 'grow' }, el('b', {}, 'Pimpin packs'), el('span', {}, 'The launcher has two packs of its own: Performance for FPS and Pretty for looks.')),
            el('span', { class: 'btn sm primary' }, 'Open', icon('chevronRight')))
        : null,
    );
  };

  const runSearch = async () => {
    const my = ++seq;
    drawTarget();
    clear(results, el('div', { class: 'lib-grid' }, Array.from({ length: 9 }, () => el('div', { class: 'sk-card skeleton' }))));
    const t = target();
    const opts = { type: mem.type, query: mem.query, sort: mem.sort, offset: mem.offset, limit: PAGE, category: mem.category || undefined };
    if (mem.compatible && t) {
      opts.mcVersion = t.mcVersion;
      if (mem.type === 'mod') opts.loader = t.loader === 'vanilla' ? 'fabric' : t.loader;
    }
    try {
      const [res] = await Promise.all([api.call(CALLS.search, opts), loadInstalled()]);
      if (my !== seq) return;
      drawResults(res);
    } catch (err) {
      if (my !== seq) return;
      clear(results, el('div', { class: 'card empty' }, icon('alert'), el('h3', {}, 'Modrinth unavailable'), el('div', {}, err.message)));
    }
  };

  const drawResults = (res) => {
    if (!res.hits.length) {
      clear(results, el('div', { class: 'card empty' }, icon('search'), el('h3', {}, 'Nothing found'), el('div', {}, 'Try another search or turn off "Only compatible".')));
      return;
    }
    const pages = Math.ceil(res.total_hits / PAGE);
    const cur = Math.floor(mem.offset / PAGE) + 1;
    clear(
      results,
      el('div', { class: 'lib-grid' }, res.hits.map((h) => projectCard(h))),
      el('div', { class: 'pager' },
        el('button', { class: 'btn sm', disabled: cur <= 1, onclick: () => { mem.offset -= PAGE; runSearch(); page.scrollTop = 0; } }, 'Previous'),
        el('span', {}, `Page ${cur} of ${fmtNum(pages)}`),
        el('button', { class: 'btn sm', disabled: cur >= pages, onclick: () => { mem.offset += PAGE; runSearch(); page.scrollTop = 0; } }, 'Next'),
      ),
    );
  };

  const install = async (projectId, btn, versionId) => {
    btn.disabled = true;
    const label = btn.textContent;
    btn.replaceChildren(el('span', { class: 'spin xs' }), 'Installing');
    try {
      if (mem.type === 'modpack') {
        const inst = await api.call('modpack:install', { projectId, versionId });
        await refreshInstances();
        toast(`${inst.name} is installed`);
        btn.replaceChildren(icon('check'), 'Installed');
        btn.classList.add('ok');
        return true;
      }
      const ref = targetRef();
      if (!ref) throw new Error(mem.type === 'plugin' ? 'Create a server first.' : 'Create an instance first.');
      const res = await api.call('content:install', ref, { projectId, type: mem.type, versionId });
      installed.add(projectId);
      btn.replaceChildren(icon('check'), 'Installed');
      btn.classList.add('ok');
      if (res.cancelled) toast('Install cancelled', 'info');
      // the install popup lists dependencies and failures; nothing new to say when nothing ran
      else if (!res.taskId) toast('Already installed');
      return true;
    } catch (err) {
      btn.disabled = false;
      btn.replaceChildren(icon('download'), label || 'Install');
      errorToast(err);
      return false;
    }
  };

  const installBtn = (projectId, size = 'sm') => {
    const done = installed.has(projectId);
    const b = el('button', { class: `btn ${size} ${done ? 'ok' : 'primary'}`, disabled: done }, icon(done ? 'check' : 'download'), done ? 'Installed' : mem.type === 'modpack' ? 'Install pack' : 'Install');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      install(projectId, b);
    });
    return b;
  };

  const projectCard = (h) =>
    el(
      'div',
      { class: `card proj ${mem.type}`, onclick: () => openProject(h.project_id) },
      safeUrl(h.icon_url) ? el('img', { class: 'proj-icon', src: h.icon_url, alt: '', loading: 'lazy' }) : el('div', { class: 'proj-icon ph' }, icon('box')),
      el(
        'div',
        { class: 'body' },
        el('div', { class: 'title' }, h.title),
        el('div', { class: 'author' }, `by ${h.author}`),
        el('div', { class: 'desc' }, h.description),
        el('div', { class: 'foot' }, el('span', {}, icon('download'), fmtNum(h.downloads)), el('span', { title: 'Followers' }, icon('heart'), fmtNum(h.follows)), installBtn(h.project_id, 'sm')),
      ),
    );

  const openProject = async (id) => {
    const body = el('div', { class: 'row muted', style: { padding: '40px', justifyContent: 'center' } }, el('span', { class: 'spin' }), 'Loading');
    const m = modal({ wide: true, title: '', body, header: el('div') });
    try {
      const calls = CALLS;
      const p = await api.call(calls.project, id);
      const t = target();
      const verSel = el('select', { class: 'select', style: { width: '260px' } }, el('option', { value: '' }, 'Best match (recommended)'));
      const versionsOpts = {};
      if (t && mem.type !== 'modpack') {
        versionsOpts.gameVersions = mem.compatible ? [t.mcVersion] : undefined;
        if (mem.type === 'mod') versionsOpts.loaders = t.loader === 'quilt' ? ['quilt', 'fabric'] : [t.loader];
      }
      if (mem.type === 'modpack') versionsOpts.loaders = ['fabric', 'quilt'];
      api.call(calls.versions, id, versionsOpts).then((vs) => {
        for (const v of vs.slice(0, 50)) verSel.append(el('option', { value: v.id }, `${v.version_number} · ${v.game_versions.slice(-2).join(', ')}${v.version_type !== 'release' ? ` (${v.version_type})` : ''}`));
      }).catch(() => {});
      const done = installed.has(p.id);
      const ib = el('button', { class: `btn ${done ? 'ok' : 'primary'}`, disabled: done }, icon(done ? 'check' : 'download'), done ? 'Installed' : 'Install');
      ib.addEventListener('click', async () => {
        if (await install(p.id, ib, verSel.value || undefined)) runSearch();
      });
      const header = el(
        'div',
        { class: 'proj-detail-head' },
        safeUrl(p.icon_url) ? el('img', { class: 'proj-icon', src: p.icon_url, alt: '' }) : el('div', { class: 'proj-icon ph' }, icon('box')),
        el(
          'div',
          { class: 'grow' },
          el('h2', {}, p.title),
          el('p', {}, p.description),
          el('div', { class: 'row', style: { flexWrap: 'wrap' } },
            el('span', { class: 'chip' }, icon('download'), fmtNum(p.downloads)),
            el('span', { class: 'chip' }, icon('heart'), fmtNum(p.followers)),
            (p.categories || []).slice(0, 4).map((c) => el('span', { class: 'chip' }, c)),
            el('span', { class: 'chip', style: { cursor: 'pointer' }, onclick: () => api.call('shell:openExternal', `https://modrinth.com/${p.project_type}/${p.slug}`) }, icon('external'), 'Modrinth'),
          ),
        ),
        el('button', { class: 'btn ghost icon sm', onclick: () => m.close() }, icon('x')),
      );
      m.box.firstChild.replaceWith(header);
      const openLink = (u) => api.call('shell:openExternal', u);
      clear(
        body,
        el('div', { class: 'row', style: { justifyContent: 'flex-end' } }, mem.type !== 'modpack' && t ? el('span', { class: 'muted grow' }, `Into ${t.name} (${t.mcVersion})`) : el('span', { class: 'grow' }), verSel, ib),
        p.gallery?.length
          ? el('div', { class: 'gallery' }, p.gallery.filter((g) => safeUrl(g.url)).map((g) => el('img', { src: g.url, alt: g.title || '', loading: 'lazy', onclick: () => lightbox(g.url) })))
          : null,
        markdown(p.body, openLink),
      );
      body.className = '';
      body.style.cssText = 'display:flex;flex-direction:column;gap:16px';
    } catch (err) {
      clear(body, el('div', { class: 'empty' }, err.message));
    }
  };

  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      mem.query = search.value.trim();
      mem.offset = 0;
      runSearch();
    }, 300);
  });
  sortSel.addEventListener('change', () => {
    mem.sort = sortSel.value;
    mem.offset = 0;
    runSearch();
  });

  const sub = el('p', { class: 'page-sub' }, 'Mods, shaders, resource packs, modpacks and server plugins from Modrinth.');

  page.append(
    el('div', { class: 'page-head' }, el('div', { class: 'grow' }, el('h1', { class: 'page-title' }, 'Library'), sub)),
    el('div', { class: 'lib-toolbar' },
      seg(TYPES, mem.type, (v) => { mem.type = v; mem.offset = 0; mem.category = null; drawCats(); runSearch(); }),
      el('div', { class: 'lib-search-row' }, el('div', { class: 'search' }, icon('search'), search), sortSel),
    ),
    catRow,
    targetBar,
    results,
  );
  drawCats();
  runSearch();
  setTimeout(() => search.focus(), 50);
}

export function lightbox(url) {
  const box = el('div', { class: 'lightbox', onclick: () => box.remove() }, el('img', { src: url, alt: '' }));
  document.body.append(box);
}
