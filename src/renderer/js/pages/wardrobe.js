import { el, icon, errorToast, toast, confirmModal } from '../dom.js';
import { api, activeAccount } from '../state.js';
import { mountSkinTexture } from '../skin3d.js';

const panelStyle = { background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: '8px', padding: '20px' };
const rowStyle = { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' };

export function render(page, _params = {}, _navigate) {
  let disposed = false, revision = 0, wardrobe = null, previewCleanup = null, busy = false;
  let modelCleanups = [];
  const status = el('p', { class: 'muted wardrobe-status', role: 'status', 'aria-live': 'polite' }, 'Loading wardrobe...');
  const gallery = el('div', { class: 'wardrobe-gallery', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: '12px', alignContent: 'start' } });
  const details = el('aside', { class: 'wardrobe-details', style: { ...panelStyle, minWidth: '280px' } });
  const root = el('section', { class: 'wardrobe-page' },
    el('header', { class: 'page-head' }, el('div', {}, el('h1', {}, 'Wardrobe'), el('p', { class: 'muted' }, 'Original characters and your own skins.'))),
    el('p', { class: 'wardrobe-notice', style: { ...panelStyle, marginBottom: '20px', padding: '12px 16px' } }, icon('info'), ' Preview and export only. Selecting a skin here does not change your in-game or online skin.'),
    el('div', { class: 'wardrobe-toolbar', style: { ...rowStyle, justifyContent: 'space-between', marginBottom: '16px' } },
      el('div', {}, el('b', {}, 'Your collection'), el('p', { class: 'muted', style: { margin: '4px 0 0' } }, '64 x 64 or legacy 64 x 32 PNG. Up to 256 KB.')),
      el('button', { class: 'btn', onclick: () => fileInput.click() }, icon('upload'), 'Import PNG')),
    status,
    el('div', { class: 'wardrobe-layout', style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 340px)', gap: '24px', alignItems: 'start' } }, gallery, details));
  const fileInput = el('input', { type: 'file', accept: '.png,image/png', hidden: true, 'aria-label': 'Import a Minecraft skin' });
  root.append(fileInput);
  page.replaceChildren(root);

  function releaseModels() {
    previewCleanup?.(); previewCleanup = null;
    for (const cleanup of modelCleanups) cleanup();
    modelCleanups = [];
  }
  async function mount(host, entry, scale, interactive, version) {
    const cleanup = await mountSkinTexture(host, entry.dataUrl, { scale, model: entry.model, interactive });
    if (disposed || revision !== version) { cleanup?.(); return; }
    if (interactive) previewCleanup = cleanup;
    else if (cleanup) modelCleanups.push(cleanup);
    if (!cleanup) host.replaceChildren(el('span', { class: 'muted' }, 'Preview unavailable'));
  }
  async function action(fn) {
    if (busy || disposed) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    root.querySelectorAll('button, select').forEach((control) => control.disabled = true);
    try { await fn(); }
    catch (error) { if (!disposed) errorToast(error); }
    finally {
      busy = false;
      root.removeAttribute('aria-busy');
      if (!disposed && wardrobe) draw();
      else if (!disposed) root.querySelectorAll('button, select').forEach((control) => control.disabled = false);
    }
  }
  const update = (snapshot) => { if (!disposed) wardrobe = snapshot; };
  function draw() {
    if (disposed || !wardrobe) return;
    releaseModels();
    const version = ++revision;
    gallery.replaceChildren();
    status.textContent = `${wardrobe.skins.filter((entry) => !entry.imported).length} original characters · ${wardrobe.skins.filter((entry) => entry.imported).length} imported`;
    const selected = wardrobe.skins.find((entry) => entry.id === wardrobe.selected.id);
    for (const entry of wardrobe.skins) {
      const chosen = entry.id === selected.id;
      const host = el('div', { class: 'wardrobe-card-model', style: { height: '146px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' } });
      const card = el('button', {
        class: `wardrobe-card${chosen ? ' selected' : ''}`, type: 'button', 'aria-pressed': String(chosen),
        style: { ...panelStyle, padding: '8px 10px 12px', textAlign: 'left', color: 'inherit', cursor: 'pointer', borderColor: chosen ? 'var(--accent)' : 'var(--line)' },
        onclick: () => action(async () => update(await api.call('wardrobe:select', { id: entry.id, model: entry.model }))),
      }, host, el('b', { style: { display: 'block', fontSize: '13px' } }, entry.name),
      el('span', { class: 'muted', style: { fontSize: '12px' } }, entry.imported ? 'Imported' : entry.outfit),
      chosen ? el('span', { class: 'wardrobe-selected', style: { display: 'block', marginTop: '4px', color: 'var(--accent)', fontSize: '12px' } }, 'Selected preview') : null);
      gallery.append(card);
      void mount(host, entry, 3.25, false, version);
    }
    const modelHost = el('div', { class: 'wardrobe-preview', style: { height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' } });
    const armSelect = el('select', { id: 'wardrobe-model', 'aria-label': 'Preview arm model', onchange: () => action(async () => update(await api.call('wardrobe:select', { id: selected.id, model: armSelect.value }))) },
      el('option', { value: 'classic' }, 'Classic (4 px arms)'), el('option', { value: 'slim' }, 'Slim (3 px arms)'));
    armSelect.value = wardrobe.selected.model;
    armSelect.disabled = selected.height === 32;
    const rotation = el('div', { class: 'wardrobe-rotation', style: { ...rowStyle, justifyContent: 'center' } },
      el('button', { class: 'btn sm', 'aria-label': 'Rotate preview left', onclick: () => previewCleanup?.rotateBy(-45) }, 'Turn left'),
      el('button', { class: 'btn sm ghost', onclick: () => previewCleanup?.rotateTo(-25) }, 'Reset'),
      el('button', { class: 'btn sm', 'aria-label': 'Rotate preview right', onclick: () => previewCleanup?.rotateBy(45) }, 'Turn right'));
    const exportButton = el('button', { class: 'btn primary', onclick: () => action(async () => {
      const exported = await api.call('wardrobe:export', { id: selected.id });
      const link = el('a', { href: exported.dataUrl, download: exported.name });
      root.append(link); link.click(); link.remove();
      toast('PNG download requested. Your online skin is unchanged.', 'info');
    }) }, icon('download'), 'Export PNG');
    const deleteButton = selected.imported ? el('button', { class: 'btn ghost', onclick: () => action(async () => {
      if (await confirmModal('Delete imported skin?', `Remove ${selected.name} from this wardrobe? Your original PNG and online skin are not affected.`, { confirm: 'Delete', danger: true })) update(await api.call('wardrobe:delete', { id: selected.id }));
    }) }, icon('trash'), 'Delete import') : null;
    const online = activeAccount()?.type === 'msa' ? el('button', { class: 'btn ghost', onclick: () => api.call('shell:openExternal', 'https://www.minecraft.net/msaprofile/mygames/editskin').catch(errorToast) }, icon('external'), 'Use on Minecraft.net') : null;
    details.replaceChildren(el('h2', { style: { fontSize: '18px', margin: '0 0 8px' } }, selected.name),
      el('p', { class: 'muted', style: { lineHeight: '1.5', minHeight: '40px', margin: 0 } }, selected.description),
      modelHost, rotation,
      el('p', { class: 'muted', style: { textAlign: 'center', fontSize: '12px', margin: '10px 0 20px' } }, 'Drag to turn. Click the character to wave.'),
      el('label', { for: 'wardrobe-model', style: { display: 'block', marginBottom: '8px' } }, 'Preview arm model'), armSelect,
      el('p', { class: 'muted', style: { fontSize: '12px', lineHeight: '1.5', margin: '8px 0 18px' } }, selected.height === 32 ? 'Legacy skins use classic arms.' : `Designed for ${selected.model} arms. This setting changes only the preview, not the PNG.`),
      el('div', { class: 'wardrobe-actions', style: rowStyle }, exportButton, deleteButton, online),
      el('p', { class: 'muted', style: { fontSize: '12px', lineHeight: '1.5', marginBottom: 0 } }, online ? 'Export the PNG, then choose its arm model and upload it yourself on Minecraft.net. No account tokens are uploaded here.' : 'To use a skin online, export it and upload it through your official Minecraft profile. Offline selection here is a preview only.'));
    void mount(modelHost, { ...selected, model: wardrobe.selected.model }, 7, true, version);
  }
  fileInput.addEventListener('change', () => action(async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 256 * 1024) throw new Error('Choose a PNG skin up to 256 KB.');
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read this file.'));
      reader.readAsDataURL(file);
    });
    update(await api.call('wardrobe:import', { name: file.name, dataUrl: url, model: 'classic' }));
    if (!disposed) toast('Skin imported for preview and export.', 'info');
  }));
  api.call('wardrobe:list').then((snapshot) => { update(snapshot); draw(); }).catch((error) => {
    if (disposed) return;
    status.textContent = 'Could not load the wardrobe.';
    errorToast(error);
    status.append(el('button', { class: 'btn sm', onclick: () => action(async () => update(await api.call('wardrobe:list'))) }, 'Retry'));
  });
  return () => { disposed = true; revision++; releaseModels(); };
}
