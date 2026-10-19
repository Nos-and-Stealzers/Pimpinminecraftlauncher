// Instances: grid of game profiles and a detail view with client features,
// installed content, live console and per-instance settings.
import { el, icon, clear, errorToast, toast, confirmModal, timeAgo, fmtDuration, switchEl, seg } from '../dom.js';
import { api, state, subscribe, refreshInstances, selectInstance, getVersions, LOADER_LABEL, ICON_KEYS } from '../state.js';
import { instIcon, instSubtitle, playInstance, stopInstance, newInstanceModal } from '../components.js';
import { featureGrid } from './home.js';
import { lightbox } from './library.js';
import { fileBrowser } from '../files.js';
import { drawPimpin } from './pimpin.js';
import { importInstance, updateAllMods } from '../qol.js';

const tabMem = {};

export function render(page, params, navigate) {
  if (params.id) return renderDetail(page, params.id, navigate, params.tab);
  return renderList(page, params, navigate);
}

function renderList(page, params, navigate) {
  const grid = el('div', { class: 'inst-grid' });
  const draw = () => {
    clear(
      grid,
      state.instances.map((i) => {
        const running = state.game[i.id]?.state === 'running';
        const card = el(
          'div',
          { class: `card inst-card${running ? ' running' : ''}`, onclick: () => navigate('instances', { id: i.id }) },
          el('div', { class: `glow ic-${i.icon || 'violet'}` }),
          el('div', { class: 'top' }, instIcon(i), el('div', { class: 'grow' }, el('b', {}, i.name), el('span', {}, instSubtitle(i)))),
          el('div', { class: 'bottom' },
            running ? el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), 'Running') : el('span', { class: 'dim' }, icon('clock'), ` ${timeAgo(i.lastPlayed)} · ${fmtDuration(i.playTime)}`),
            i.contentCount ? el('span', { class: 'chip' }, icon('puzzle'), String(i.contentCount)) : null),
        );
        const quick = el('button', { class: `btn sm ${running ? '' : 'primary'} quick` }, icon(running ? 'stop' : 'play'), running ? 'Stop' : 'Play');
        quick.addEventListener('click', (e) => {
          e.stopPropagation();
          if (running) stopInstance(i.id);
          else selectInstance(i.id).then(() => playInstance(i.id));
        });
        card.append(quick);
        return card;
      }),
      el('div', { class: 'card inst-card new', onclick: () => newInstanceModal() }, icon('plus'), el('b', {}, 'New instance'), el('span', { class: 'dim' }, 'Vanilla, Fabric or Quilt')),
    );
  };
  page.append(
    el('div', { class: 'page-head' },
      el('div', {}, el('h1', { class: 'page-title' }, 'Instances'), el('p', { class: 'page-sub' }, 'Each instance has its own version, mods, shaders, worlds and settings.')),
      el('div', { class: 'row' },
        el('button', { class: 'btn', title: 'Update the mods in every instance', onclick: () => updateAllMods() }, icon('refresh'), 'Update all'),
        el('button', { class: 'btn', onclick: () => importInstance(navigate) }, icon('upload'), 'Import'),
        el('button', { class: 'btn', onclick: () => navigate('library', { type: 'modpack' }) }, icon('library'), 'Install modpack'),
        el('button', { class: 'btn primary', onclick: () => newInstanceModal() }, icon('plus'), 'New instance')),
    ),
    grid,
  );
  draw();
  if (params.create) newInstanceModal();
  return subscribe((t) => (t === 'instances' || t === 'game') && draw());
}

function renderDetail(page, id, navigate, initialTab) {
  let inst = state.instances.find((i) => i.id === id);
  if (!inst) {
    page.append(el('div', { class: 'card empty' }, 'Instance not found.'));
    return null;
  }
  let tab = initialTab || tabMem[id] || 'features';
  const head = el('div');
  const tabs = el('div', { class: 'tabs' });
  const body = el('div');
  let offLog = null;

  const drawHead = () => {
    inst = state.instances.find((i) => i.id === id) || inst;
    const g = state.game[id];
    const running = g?.state === 'running';
    const preparing = g?.state === 'preparing';
    clear(
      head,
      el('button', { class: 'back', onclick: () => navigate('instances') }, icon('back'), 'All instances'),
      el('div', { class: 'detail-head' },
        instIcon(inst, 'lg'),
        el('div', { class: 'grow' },
          el('h1', {}, inst.name),
          el('div', { class: 'chips' },
            el('span', { class: 'chip accent' }, `Minecraft ${inst.mcVersion}`),
            el('span', { class: 'chip' }, `${LOADER_LABEL[inst.loader]}${inst.loaderVersion ? ` ${inst.loaderVersion}` : ''}`),
            el('span', { class: 'chip' }, icon('clock'), fmtDuration(inst.playTime)),
            running ? el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), 'Running') : null)),
        el('div', { class: 'row' },
          el('button', { class: 'btn icon', title: 'Open folder', onclick: () => api.call('instances:open', id) }, icon('folder')),
          el('button', { class: 'btn icon', title: 'Export as .zip (share or back up)', onclick: () => api.call('instances:export', id).then((f) => f && toast('Instance exported')).catch(errorToast) }, icon('archive')),
          el('button', {
            class: 'btn icon',
            title: 'Duplicate instance',
            onclick: async () => {
              try {
                const copy = await api.call('instances:duplicate', id);
                await refreshInstances();
                toast(`Created ${copy.name}`);
                navigate('instances', { id: copy.id });
              } catch (err) {
                errorToast(err);
              }
            },
          }, icon('layers')),
          el('button', {
            class: 'btn icon danger',
            title: 'Delete instance',
            onclick: async () => {
              if (!(await confirmModal('Delete instance?', `"${inst.name}" and all of its worlds, mods and settings will be permanently deleted.`, { confirm: 'Delete', danger: true }))) return;
              try {
                await api.call('instances:delete', id);
                await refreshInstances();
                navigate('instances');
                toast('Instance deleted');
              } catch (err) {
                errorToast(err);
              }
            },
          }, icon('trash')),
          running
            ? el('button', { class: 'btn', style: { height: '44px', padding: '0 22px' }, onclick: () => stopInstance(id) }, icon('stop'), 'Stop')
            : el('button', { class: 'btn primary', style: { height: '44px', padding: '0 26px', fontSize: '14px' }, disabled: preparing, onclick: () => { selectInstance(id); playInstance(id); } }, preparing ? el('span', { class: 'spin' }) : icon('play'), preparing ? 'Launching…' : 'Play')),
      ),
    );
  };

  const drawTabs = () => {
    const defs = [
      ['features', 'Client features', 'wand'],
      ['pimpin', 'Pimpin Specials', 'sparkle'],
      ['content', 'Content', 'puzzle'],
      ['worlds', 'Worlds', 'globe'],
      ['screenshots', 'Screenshots', 'monitor'],
      ['files', 'Files', 'folder'],
      ['console', 'Console', 'terminal'],
      ['settings', 'Settings', 'settings'],
    ];
    clear(tabs, defs.map(([k, l, ic]) => el('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; tabMem[id] = k; drawTabs(); drawBody(); } }, icon(ic), l)));
  };

  const drawBody = () => {
    offLog?.();
    offLog = null;
    clear(body);
    if (tab === 'features') drawFeatures(body, inst, navigate);
    if (tab === 'content') drawContent(body, inst, navigate);
    if (tab === 'worlds') drawWorlds(body, inst);
    if (tab === 'screenshots') drawScreenshots(body, inst);
    if (tab === 'pimpin') drawPimpin(body, inst);
    if (tab === 'files') fileBrowser(body, { kind: 'instance', id: inst.id }, { rootLabel: inst.name });
    if (tab === 'console') offLog = drawConsole(body, inst);
    if (tab === 'settings') drawSettings(body, inst, () => { drawHead(); });
  };

  page.append(head, tabs, body);
  drawHead();
  drawTabs();
  drawBody();
  const unsub = subscribe((t) => (t === 'instances' || t === 'game') && drawHead());
  return () => {
    unsub();
    offLog?.();
  };
}

async function drawFeatures(root, inst, navigate) {
  if (inst.loader === 'vanilla') {
    root.append(el('div', { class: 'card empty' }, icon('puzzle'), el('h3', {}, 'Client features need Fabric or Quilt'), el('div', {}, 'Change the loader in the Settings tab to unlock one-click mods and shaders.')));
    return;
  }
  root.append(el('div', { class: 'row muted' }, el('span', { class: 'spin' }), 'Loading…'));
  try {
    const list = await api.call('features:list', { kind: 'instance', id: inst.id });
    clear(root,
      el('p', { class: 'muted', style: { marginTop: 0 } }, 'Flip a switch and the right mods (plus their dependencies) are downloaded for ', el('b', {}, `Minecraft ${inst.mcVersion}`), '. Want something else? ', el('a', { href: '#', style: { color: 'var(--a1)' }, onclick: (e) => { e.preventDefault(); navigate('library', { type: 'mod', instanceId: inst.id }); } }, 'Browse the full library'), '.'),
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
  const list = el('div', { class: 'content-list' });
  const updBtn = el('button', { class: 'btn sm' }, icon('refresh'), 'Check for updates');
  const searchIn = el('input', { class: 'input', placeholder: 'Filter installed…', style: { height: '34px', width: '220px' } });

  const draw = () => {
    const shown = items.filter((i) => (filter === 'all' || i.type === filter) && (!query || i.title.toLowerCase().includes(query) || i.file.toLowerCase().includes(query)));
    if (!shown.length) {
      clear(list, el('div', { class: 'card empty' }, icon('box'), el('h3', {}, 'Nothing here yet'), el('div', {}, 'Add mods, shaders and resource packs from the library.')));
      return;
    }
    clear(
      list,
      shown.map((i) =>
        el('div', { class: `content-row${i.enabled ? '' : ' off'}` },
          i.icon ? el('img', { src: i.icon, alt: '', loading: 'lazy' }) : el('div', { class: 'ph' }, icon(i.type === 'shader' ? 'sun' : i.type === 'resourcepack' ? 'palette' : 'puzzle')),
          el('div', { class: 'grow' }, el('b', {}, i.title), el('span', {}, `${TYPE_LABEL[i.type]} · ${i.versionNumber || i.file}`)),
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
          }, icon('trash')),
        ),
      ),
    );
  };

  const load = async () => {
    items = await api.call('content:list', target);
    draw();
    if (items.some((i) => !i.projectId)) {
      api.call('content:identify', target).then(async (n) => {
        if (n) {
          items = await api.call('content:list', target);
          draw();
        }
      }).catch(() => {});
    }
  };

  updBtn.addEventListener('click', async () => {
    updBtn.disabled = true;
    updBtn.replaceChildren(el('span', { class: 'spin', style: { width: '14px', height: '14px' } }), 'Checking…');
    try {
      const updates = await api.call('content:checkUpdates', target);
      if (!updates.length) {
        toast('Everything is up to date');
      } else if (await confirmModal(`${updates.length} update${updates.length > 1 ? 's' : ''} available`, updates.map((u) => `${u.title}: ${u.versionNumber} → ${u.newVersionNumber}`).join('\n'), { confirm: 'Update all' })) {
        await api.call('content:applyUpdates', target, updates);
        toast(`Updated ${updates.length} item${updates.length > 1 ? 's' : ''}`);
        await load();
      }
    } catch (err) {
      errorToast(err);
    } finally {
      updBtn.disabled = false;
      updBtn.replaceChildren(icon('refresh'), 'Check for updates');
    }
  });
  searchIn.addEventListener('input', () => {
    query = searchIn.value.toLowerCase();
    draw();
  });

  root.append(
    el('div', { class: 'filter-row' },
      seg([
        { value: 'all', label: 'All' },
        { value: 'mod', label: 'Mods' },
        { value: 'shader', label: 'Shaders' },
        { value: 'resourcepack', label: 'Resource packs' },
      ], filter, (v) => { filter = v; draw(); }),
      searchIn,
      el('span', { class: 'grow' }),
      updBtn,
      el('button', { class: 'btn sm', onclick: () => api.call('instances:open', inst.id, filter === 'all' ? 'mods' : TYPE_FOLDER[filter]) }, icon('folder'), 'Folder'),
      el('button', { class: 'btn sm primary', onclick: () => navigate('library', { type: filter === 'all' ? 'mod' : filter, instanceId: inst.id }) }, icon('plus'), 'Add content'),
    ),
    list,
  );
  clear(list, el('div', { class: 'row muted' }, el('span', { class: 'spin' }), 'Loading…'));
  load().catch(errorToast);
}

async function drawWorlds(root, inst) {
  const list = el('div', { class: 'world-list' }, el('div', { class: 'row muted' }, el('span', { class: 'spin' }), 'Loading…'));
  root.append(
    el('div', { class: 'filter-row' },
      el('span', { class: 'muted grow' }, 'Press play on a world to load straight into it (Minecraft 1.20 and newer).'),
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
        el('div', { class: 'grow' }, el('b', {}, w.folder), el('span', {}, `Played ${timeAgo(w.lastPlayed)}`)),
        el('button', { class: 'btn sm ghost icon', title: 'Show in folder', onclick: () => api.call('shell:showItem', inst.id, 'saves', w.folder) }, icon('folder')),
        el('button', { class: 'btn sm primary', onclick: () => { selectInstance(inst.id); playInstance(inst.id, { world: w.folder }); } }, icon('play'), 'Play'))));
  } catch (err) {
    clear(list, el('div', { class: 'card empty' }, err.message));
  }
}

async function drawScreenshots(root, inst) {
  const grid = el('div', { class: 'shots' });
  root.append(
    el('div', { class: 'filter-row' },
      el('span', { class: 'muted grow' }, 'Press ', el('span', { class: 'kbd' }, 'F2'), ' in-game to take a screenshot.'),
      el('button', { class: 'btn sm', onclick: () => api.call('instances:open', inst.id, 'screenshots') }, icon('folder'), 'Screenshots folder')),
    grid,
  );
  const load = async () => {
    const shots = await api.call('instances:screenshots', inst.id);
    if (!shots.length) {
      clear(grid, el('div', { class: 'card empty', style: { gridColumn: '1 / -1' } }, icon('monitor'), el('h3', {}, 'No screenshots yet'), el('div', {}, 'Your best moments will show up here.')));
      return;
    }
    clear(grid, shots.map((sh) =>
      el('div', { class: 'shot', onclick: () => lightbox(sh.url) },
        el('img', { src: sh.url, alt: sh.name, loading: 'lazy' }),
        el('div', { class: 'acts' },
          el('button', { class: 'btn sm icon', title: 'Show in folder', onclick: (e) => { e.stopPropagation(); api.call('shell:showItem', inst.id, 'screenshots', sh.name); } }, icon('folder')),
          el('button', {
            class: 'btn sm icon danger',
            title: 'Delete',
            onclick: async (e) => {
              e.stopPropagation();
              if (!(await confirmModal('Delete screenshot?', sh.name, { confirm: 'Delete', danger: true }))) return;
              await api.call('instances:deleteScreenshot', inst.id, sh.name).catch(errorToast);
              load();
            },
          }, icon('trash'))))));
  };
  load().catch(errorToast);
}

export function consoleView(lines) {
  const box = el('div', { class: 'console' });
  const add = (line) => {
    const cls = /\[Pimpin\]/.test(line) ? 'l-pimpin' : /ERROR|Exception|FATAL|SEVERE/.test(line) ? 'l-err' : /WARN/.test(line) ? 'l-warn' : '';
    const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    box.append(el('div', { class: cls }, line));
    while (box.childElementCount > 3000) box.firstChild.remove();
    if (stick) box.scrollTop = box.scrollHeight;
  };
  for (const l of lines) add(l);
  requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
  return { box, add };
}

function drawConsole(root, inst) {
  const { box, add } = consoleView([]);
  root.append(
    el('div', { class: 'filter-row' },
      el('span', { class: 'muted grow' }, 'Live output from the game. Crash reports are saved in the instance folder.'),
      el('button', { class: 'btn sm', onclick: () => api.call('instances:open', inst.id, 'crash-reports').catch(() => api.call('instances:open', inst.id)) }, icon('folder'), 'Crash reports'),
      el('button', { class: 'btn sm', onclick: () => api.call('instances:open', inst.id, 'logs').catch(() => {}) }, icon('folder'), 'Logs'),
      el('button', { class: 'btn sm', onclick: () => { navigator.clipboard.writeText(box.innerText); toast('Log copied to clipboard'); } }, icon('layout'), 'Copy log')),
    box,
  );
  api.call('instances:logs', inst.id).then((lines) => {
    if (!lines.length) add('[Pimpin] No output yet — press Play to start the game.');
    lines.forEach(add);
  });
  return api.on('game:log', (e) => e.id === inst.id && add(e.line));
}

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
  const memVal = el('div', { class: 'mem-val' });
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

  const save = el('button', { class: 'btn primary' }, icon('check'), 'Save changes');
  save.addEventListener('click', async () => {
    try {
      const changedGame = version.value !== inst.mcVersion || loader !== inst.loader;
      if (changedGame && inst.loader !== 'vanilla' && !(await confirmModal('Change version or loader?', 'Installed mods may not work with the new version. Use "Check for updates" in the Content tab afterwards, or remove mods that break.', { confirm: 'Change it' }))) return;
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
      el('h3', {}, icon('edit'), 'General'),
      el('div', { class: 'form-grid' }, el('label', { class: 'field' }, 'Name', name), el('label', { class: 'field' }, 'Icon', iconRow))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('box'), 'Game'),
      el('div', { class: 'form-grid' },
        el('label', { class: 'field' }, 'Minecraft version', version),
        el('label', { class: 'field' }, 'Mod loader', seg([{ value: 'fabric', label: 'Fabric' }, { value: 'quilt', label: 'Quilt' }, { value: 'vanilla', label: 'Vanilla' }], loader, (v) => (loader = v))))),
    el('div', { class: 'card settings-card' },
      el('h3', {}, icon('cpu'), 'Java & performance'),
      el('div', { class: 'set-row' }, el('div', { class: 'grow' }, el('b', {}, 'Custom memory'), el('span', {}, `Override the global ${(state.settings.memoryMax / 1024).toFixed(1)} GB for this instance`)), el('label', { class: 'switch' }, useCustomMem, el('span'))),
      el('div', { class: 'set-row' }, mem, memVal),
      el('label', { class: 'field' }, 'JVM arguments', jvm),
      el('label', { class: 'field' }, 'Java executable', el('div', { class: 'row' }, java, el('button', { class: 'btn', onclick: async () => { const p = await api.call('dialog:pickJava'); if (p) java.value = p; } }, 'Browse'))),
      el('div', { class: 'form-grid', style: { gridTemplateColumns: '1fr 1fr' } }, el('label', { class: 'field' }, 'Window width', width), el('label', { class: 'field' }, 'Window height', height))),
    el('div', { class: 'row', style: { justifyContent: 'flex-end' } }, save),
  );
}
