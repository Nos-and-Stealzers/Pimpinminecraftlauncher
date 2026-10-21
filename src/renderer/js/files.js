// In-app file browser for an instance or server folder: browse, edit configs,
// rename, delete, make folders and drag files in from the PC.
import { el, icon, clear, modal, errorToast, toast, confirmModal, fmtBytes, timeAgo } from './dom.js';
import { api } from './state.js';
import { lightbox } from './pages/library.js';

const OPENABLE = /\.(txt|log|json|json5|properties|toml|ya?ml|cfg|conf|ini|md|csv|mcmeta|png|jpe?g|gif|webp|zip|mrpack|pdf)$/i;
const ARCHIVE = new Set(['zip', 'jar', 'mrpack', 'gz', 'tar']);

function fileIcon(e) {
  if (e.dir) return icon('folder');
  if (e.image) return icon('image');
  if (e.text) return icon('fileText');
  if (ARCHIVE.has(e.ext)) return icon('archive');
  return icon('file');
}

/** Short hint for well-known folders, shown under their name. */
const HINTS = {
  mods: 'Fabric / Quilt mods',
  shaderpacks: 'Shader packs',
  resourcepacks: 'Resource packs',
  saves: 'Single-player worlds',
  screenshots: 'F2 screenshots',
  config: 'Mod settings',
  logs: 'Game logs',
  'crash-reports': 'Crash reports',
  plugins: 'Server plugins',
  world: 'Server world',
  world_nether: 'The Nether',
  world_the_end: 'The End',
  backups: 'World backups',
  'server.properties': 'Server settings',
  'options.txt': 'Video, controls & sound settings',
};

export function fileBrowser(root, target, { start = '', rootLabel = 'Folder' } = {}) {
  let sub = start;
  let entries = [];
  let query = '';
  const crumbs = el('div', { class: 'crumbs grow' });
  const list = el('div', { class: 'file-list' });
  const summary = el('div', { class: 'file-summary dim' });
  const filter = el('input', { class: 'input', placeholder: 'Filter', style: { height: '34px', width: '180px' } });
  const drop = el('div', { class: 'file-drop' }, icon('upload'), el('b', {}, 'Drop to copy here'));
  const wrap = el('div', { class: 'file-browser' });

  const join = (name) => (sub ? `${sub}/${name}` : name);
  const go = (p) => {
    sub = p;
    query = '';
    filter.value = '';
    load();
  };

  const drawCrumbs = () => {
    const parts = sub ? sub.split('/') : [];
    clear(
      crumbs,
      el('button', { class: 'crumb', onclick: () => go('') }, icon('folder'), rootLabel),
      parts.map((p, i) => [icon('chevronRight'), el('button', { class: 'crumb', onclick: () => go(parts.slice(0, i + 1).join('/')) }, p)]),
    );
  };

  const draw = () => {
    const shown = entries.filter((e) => !query || e.name.toLowerCase().includes(query));
    if (!shown.length) {
      clear(list, el('div', { class: 'card empty' }, icon('folder'), el('h3', {}, query ? 'No matches' : 'This folder is empty'), el('div', {}, 'Drag files here from your PC, or use "Add files".')));
    } else {
      clear(list, shown.map(row));
    }
    const files = entries.filter((e) => !e.dir);
    summary.textContent = `${entries.filter((e) => e.dir).length} folders · ${files.length} files · ${fmtBytes(files.reduce((n, e) => n + e.size, 0))}`;
  };

  const row = (e) => {
    const open = () => {
      if (e.dir) return go(join(e.name));
      if (e.image) return lightbox(e.url);
      if (e.text) return editFile(e);
      api.call('files:reveal', target, sub, e.name);
    };
    const thumb = e.image ? el('img', { class: 'file-ico thumb', src: e.url, alt: '', loading: 'lazy' }) : el('div', { class: `file-ico${e.dir ? ' dir' : ''}` }, fileIcon(e));
    return el('div', { class: 'file-row', ondblclick: e.dir ? null : open, onclick: e.dir ? open : null },
      thumb,
      el('div', { class: 'grow name' }, el('b', {}, e.name), HINTS[e.name] && !sub ? el('span', {}, HINTS[e.name]) : null),
      el('span', { class: 'dim size' }, e.dir ? '' : fmtBytes(e.size)),
      el('span', { class: 'dim when' }, timeAgo(e.mtime)),
      el('div', { class: 'acts', onclick: (ev) => ev.stopPropagation() },
        e.text ? el('button', { class: 'btn ghost sm icon', title: 'Edit', onclick: () => editFile(e) }, icon('fileText')) : null,
        !e.dir && OPENABLE.test(e.name) ? el('button', { class: 'btn ghost sm icon', title: 'Open with default app', onclick: () => api.call('files:open', target, sub, e.name).catch(errorToast) }, icon('external')) : null,
        el('button', { class: 'btn ghost sm icon', title: 'Show in folder', onclick: () => api.call('files:reveal', target, sub, e.name) }, icon('folder')),
        e.protected ? null : el('button', { class: 'btn ghost sm icon', title: 'Rename', onclick: () => renameEntry(e) }, icon('edit')),
        e.protected ? null : el('button', { class: 'btn ghost sm icon danger', title: 'Delete', onclick: () => deleteEntry(e) }, icon('trash'))),
    );
  };

  const load = async () => {
    drawCrumbs();
    clear(list, el('div', { class: 'row muted' }, el('span', { class: 'spin' }), 'Loading'));
    try {
      entries = (await api.call('files:list', target, sub)).entries;
      draw();
    } catch (err) {
      clear(list, el('div', { class: 'card empty' }, err.message));
    }
  };

  const editFile = async (e) => {
    let text;
    try {
      text = await api.call('files:read', target, sub, e.name);
    } catch (err) {
      return errorToast(err);
    }
    const area = el('textarea', { class: 'input code-edit', spellcheck: 'false' }, text);
    const readOnly = e.protected || /\.log$/i.test(e.name);
    if (readOnly) area.readOnly = true;
    const saveBtn = el('button', { class: 'btn primary', disabled: readOnly }, icon('check'), 'Save');
    const m = modal({
      title: join(e.name),
      wide: true,
      body: [area, readOnly ? el('p', { class: 'dim', style: { margin: 0 } }, e.protected ? 'This file is managed by Pimpin and is shown read-only.' : 'Logs are read-only.') : null],
      actions: [el('button', { class: 'btn ghost', onclick: () => m.close() }, 'Close'), saveBtn],
    });
    area.addEventListener('keydown', (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 's') {
        ev.preventDefault();
        saveBtn.click();
      }
      if (ev.key === 'Tab') {
        ev.preventDefault();
        area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
      }
    });
    saveBtn.addEventListener('click', async () => {
      try {
        await api.call('files:write', target, sub, e.name, area.value);
        toast(`Saved ${e.name}`);
        m.close();
        load();
      } catch (err) {
        errorToast(err);
      }
    });
    requestAnimationFrame(() => area.focus());
  };

  const ask = (title, value, confirm) =>
    new Promise((resolve) => {
      let result = null;
      const input = el('input', { class: 'input', value });
      const ok = el('button', { class: 'btn primary', onclick: () => { result = input.value.trim(); m.close(); } }, confirm);
      const m = modal({ title, body: input, actions: [el('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'), ok], onClose: () => resolve(result) });
      input.addEventListener('keydown', (ev) => ev.key === 'Enter' && ok.click());
      requestAnimationFrame(() => {
        input.focus();
        const dot = value.lastIndexOf('.');
        input.setSelectionRange(0, dot > 0 ? dot : value.length);
      });
    });

  const renameEntry = async (e) => {
    const to = await ask(`Rename ${e.dir ? 'folder' : 'file'}`, e.name, 'Rename');
    if (!to || to === e.name) return;
    await api.call('files:rename', target, sub, e.name, to).then(load).catch(errorToast);
  };

  const deleteEntry = async (e) => {
    if (!(await confirmModal(`Delete ${e.dir ? 'folder' : 'file'}?`, `"${e.name}"${e.dir ? ' and everything inside it' : ''} will be permanently deleted.`, { confirm: 'Delete', danger: true }))) return;
    await api.call('files:delete', target, sub, e.name).then(load).catch(errorToast);
  };

  const newFolder = async () => {
    const name = await ask('New folder', 'New folder', 'Create');
    if (name) await api.call('files:mkdir', target, sub, name).then(load).catch(errorToast);
  };

  const imported = (names) => {
    if (names.length) toast(`Added ${names.length === 1 ? names[0] : `${names.length} items`}`);
    load();
  };

  // Drag & drop from the system file manager.
  let depth = 0;
  wrap.addEventListener('dragenter', (ev) => {
    if (!ev.dataTransfer?.types.includes('Files')) return;
    ev.preventDefault();
    depth++;
    wrap.classList.add('dragging');
  });
  wrap.addEventListener('dragover', (ev) => ev.dataTransfer?.types.includes('Files') && ev.preventDefault());
  wrap.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      wrap.classList.remove('dragging');
    }
  });
  wrap.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    depth = 0;
    wrap.classList.remove('dragging');
    const paths = [...(ev.dataTransfer?.files || [])].map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length) await api.call('files:import', target, sub, paths).then(imported).catch(errorToast);
  });

  filter.addEventListener('input', () => {
    query = filter.value.toLowerCase();
    draw();
  });

  wrap.append(
    el('div', { class: 'filter-row' },
      crumbs,
      filter,
      el('button', { class: 'btn sm icon', title: 'Refresh', onclick: load }, icon('refresh')),
      el('button', { class: 'btn sm', onclick: newFolder }, icon('folderPlus'), 'New folder'),
      el('button', { class: 'btn sm', onclick: () => api.call('files:reveal', target, sub) }, icon('external'), 'Open in file manager'),
      el('button', { class: 'btn sm primary', onclick: () => api.call('files:pickImport', target, sub).then(imported).catch(errorToast) }, icon('upload'), 'Add files')),
    list,
    summary,
    drop,
  );
  root.append(wrap);
  load();
}
