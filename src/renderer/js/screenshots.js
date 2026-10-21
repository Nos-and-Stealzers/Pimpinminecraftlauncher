import { el, clear, modal, fmtBytes } from './dom.js';
import { api } from './state.js';

// RPC arguments are positional. Export takes (id, name), never a destination.
export function renderScreenshots(root, inst) {
  let shots = [], visible = [], selected = null, skipped = 0;
  let pending = false, disposed = false, loaded = false;
  let full = null, confirmation = null;
  const oldTabIndex = root.getAttribute('tabindex');
  root.tabIndex = 0;
  root.classList.add('screenshots-manager');
  const search = el('input', { type: 'search', placeholder: 'Search filenames', 'aria-label': 'Search screenshot filenames', class: 'input', oninput: draw });
  const order = el('select', { class: 'input', 'aria-label': 'Screenshot order', onchange: draw },
    el('option', { value: 'newest' }, 'Newest first'), el('option', { value: 'oldest' }, 'Oldest first'));
  const onlyFavorites = el('input', { type: 'checkbox', onchange: draw });
  const status = el('p', { class: 'muted shots-status', role: 'status', 'aria-live': 'polite' });
  const failure = el('p', { class: 'shots-error', role: 'alert', hidden: true });
  const gallery = el('div', { class: 'shots-gallery', 'aria-label': 'Screenshots' });
  const preview = el('section', { class: 'shots-preview', 'aria-label': 'Selected screenshot' });
  const refresh = el('button', { type: 'button', class: 'btn sm', onclick: () => run(load) }, 'Refresh');
  const count = el('span', { class: 'muted shots-count' });
  clear(root,
    el('div', { class: 'shots-toolbar' }, search, order,
      el('label', { class: 'shots-filter' }, onlyFavorites, 'Favorites only'), refresh),
    el('div', { class: 'shots-summary' }, count, el('span', { class: 'muted' }, 'Press F2 in Minecraft to take a screenshot.')),
    status, failure, el('div', { class: 'shots-layout' }, gallery, preview));

  async function run(action) {
    if (pending || disposed) return;
    const restoreFocus = root.contains(document.activeElement);
    pending = true;
    failure.hidden = true;
    refresh.disabled = true;
    draw();
    try { await action(); }
    catch (error) { if (!disposed) { failure.textContent = error?.message || String(error); failure.hidden = false; } }
    finally {
      pending = false;
      if (!disposed) {
        refresh.disabled = false;
        draw();
        if (restoreFocus && !confirmation) {
          if (full?.open) full.querySelector('.shots-full-scroll').focus();
          else root.focus({ preventScroll: true });
        }
      }
    }
  }
  async function load() {
    const listing = await api.call('screenshots:list', inst.id);
    if (disposed) return;
    shots = listing.screenshots;
    skipped = listing.skipped;
    loaded = true;
  }
  function move(direction) {
    if (pending || confirmation || !visible.length) return;
    const index = visible.findIndex((shot) => shot.name === selected);
    const next = Math.min(visible.length - 1, Math.max(0, index + direction));
    selected = visible[next].name;
    draw();
    if (full) full.querySelector('.shots-full-scroll').focus(); else root.focus({ preventScroll: true });
  }
  function action(label, onclick, extra = {}) {
    return el('button', { type: 'button', class: 'btn sm', disabled: pending, onclick, ...extra }, label);
  }
  function askDelete(shot) {
    if (full) full.close();
    return new Promise((resolve) => {
      let accepted = false;
      confirmation = modal({
        title: 'Delete screenshot?',
        body: el('p', {}, `Delete ${shot.name}? This permanently removes the original screenshot. This cannot be undone.`),
        actions: [action('Cancel', () => confirmation.close(), { disabled: false }),
          action('Delete screenshot', () => { accepted = true; confirmation.close(); }, { disabled: false, class: 'btn danger' })],
        onClose: () => { confirmation = null; resolve(accepted); },
      });
      confirmation.box.querySelector('button')?.focus();
    });
  }
  function controls(shot) {
    const index = visible.findIndex((entry) => entry.name === shot.name);
    return el('div', { class: 'shots-actions' },
      action('Previous', () => move(-1), { disabled: pending || index <= 0, 'aria-label': 'Previous screenshot' }),
      action('Next', () => move(1), { disabled: pending || index >= visible.length - 1, 'aria-label': 'Next screenshot' }),
      action(shot.favorite ? 'Unfavorite' : 'Favorite', () => run(async () => {
        await api.call('screenshots:favorite', inst.id, shot.name, !shot.favorite);
        await load();
      }), { 'aria-pressed': String(shot.favorite), 'data-action': 'favorite' }),
      action('Copy image', () => run(async () => {
        await api.call('screenshots:copy', inst.id, shot.name);
        if (!disposed) status.textContent = 'Image copied to clipboard.';
      }), { 'data-action': 'copy' }),
      action('Export PNG', () => run(async () => {
        const outcome = await api.call('screenshots:export', inst.id, shot.name);
        if (!disposed) status.textContent = outcome?.exported ? 'Screenshot exported.' : 'Export canceled.';
      }), { 'data-action': 'export' }),
      action('Delete', () => run(async () => {
        if (!await askDelete(shot) || disposed) return;
        await api.call('screenshots:delete', inst.id, shot.name);
        await load();
        if (!disposed) status.textContent = 'Screenshot deleted.';
      }), { class: 'btn sm danger', 'data-action': 'delete' }));
  }
  function details(shot) {
    return el('div', { class: 'shots-details' },
      el('strong', {}, shot.name),
      el('span', { class: 'muted' }, `${new Date(shot.time).toLocaleString()} | PNG | ${shot.width} x ${shot.height} | ${fmtBytes(shot.size)}`));
  }
  function updateFull(shot) {
    if (!full) return;
    if (!shot) { full.close(); return; }
    const region = full.querySelector('.shots-full-scroll');
    const image = region.querySelector('img');
    image.src = shot.url; image.alt = shot.name;
    clear(full.querySelector('.shots-full-details'), details(shot), controls(shot));
  }
  function openFull(shot) {
    if (full || disposed) return;
    const close = action('Close preview', () => full.close(), { disabled: false });
    full = el('dialog', { class: 'shots-full', 'aria-label': 'Full-size screenshot preview' },
      el('div', { class: 'shots-full-head' }, el('strong', {}, 'Full-size preview'), close),
      el('div', { class: 'shots-full-scroll', tabindex: '0' }, el('img', { src: shot.url, alt: shot.name, draggable: 'false' })),
      el('div', { class: 'shots-full-details' }, details(shot), controls(shot)));
    const dialog = full;
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (full === dialog) full = null;
      if (!disposed && !confirmation) preview.querySelector('[data-action="full"]')?.focus();
    }, { once: true });
    root.append(full);
    full.showModal();
    close.focus();
  }
  function draw() {
    if (disposed) return;
    const needle = search.value.toLocaleLowerCase();
    visible = shots.filter((shot) => shot.name.toLocaleLowerCase().includes(needle) && (!onlyFavorites.checked || shot.favorite));
    visible.sort((a, b) => (order.value === 'oldest' ? a.time - b.time : b.time - a.time) || a.name.localeCompare(b.name));
    if (!visible.some((shot) => shot.name === selected)) selected = visible[0]?.name || null;
    count.textContent = `${visible.length} of ${shots.length} screenshots${skipped ? ` | ${skipped} invalid or unsafe PNG files skipped` : ''}`;
    clear(gallery);
    if (!loaded) gallery.append(el('p', { class: 'muted' }, 'Loading screenshots...'));
    else if (!shots.length) gallery.append(el('div', { class: 'shots-empty' }, el('h3', {}, 'No screenshots yet'), el('p', { class: 'muted' }, 'Your in-game PNG screenshots will appear here.')));
    else if (!visible.length) gallery.append(el('p', { class: 'muted shots-empty' }, 'No screenshots match these filters.'));
    for (const shot of visible) {
      gallery.append(el('button', {
        type: 'button', class: `shots-card${shot.name === selected ? ' selected' : ''}`,
        'aria-pressed': String(shot.name === selected), title: shot.name,
        onclick: () => { selected = shot.name; draw(); root.focus({ preventScroll: true }); },
      }, el('img', { src: shot.url, alt: '', loading: 'lazy', draggable: 'false' }),
      el('span', { class: 'shots-card-name' }, shot.name),
      el('span', { class: 'muted shots-card-meta' }, `${shot.favorite ? 'Favorite | ' : ''}${shot.width} x ${shot.height}`)));
    }
    const shot = visible.find((entry) => entry.name === selected);
    clear(preview);
    if (shot) preview.append(
      el('button', { type: 'button', class: 'shots-image', 'aria-label': 'Open full-size screenshot', 'data-action': 'full', onclick: () => openFull(shot) }, el('img', { src: shot.url, alt: shot.name, draggable: 'false' })),
      details(shot), controls(shot),
      el('p', { class: 'muted shots-hint' }, 'Click the image for full size. Use Left and Right to browse.'));
    else preview.append(el('p', { class: 'muted shots-empty' }, 'Select a screenshot to preview it.'));
    updateFull(shot);
  }
  function onKey(event) {
    if (disposed || confirmation || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }
  root.addEventListener('keydown', onKey);
  run(load);
  return () => {
    disposed = true;
    confirmation?.close();
    if (full) { full.close(); full?.remove(); full = null; }
    root.removeEventListener('keydown', onKey);
    root.classList.remove('screenshots-manager');
    if (oldTabIndex === null) root.removeAttribute('tabindex'); else root.setAttribute('tabindex', oldTabIndex);
    clear(root);
  };
}
