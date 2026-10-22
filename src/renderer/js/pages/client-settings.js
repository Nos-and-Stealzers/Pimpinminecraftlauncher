import { el, clear, confirmModal } from '../dom.js';
import { api, state } from '../state.js';

// The main-process schema is authoritative; never round-trip opaque config data.
export async function drawClientSettings(root, inst) {
  const panel = el('section', { class: 'card', 'aria-label': 'Pimpin Client settings', style: { padding: '20px', marginBottom: '24px' } });
  const status = el('p', { class: 'muted', role: 'status', 'aria-live': 'polite', style: { margin: '12px 0', whiteSpace: 'pre-wrap' } }, 'Loading client settings…');
  const tabs = el('div', { class: 'row wrap', role: 'group', 'aria-label': 'Client settings groups' });
  const content = el('div');
  const save = el('button', { class: 'btn primary', type: 'submit', disabled: true, id: 'client-settings-save' }, 'Save client settings');
  const reload = el('button', { class: 'btn', type: 'button', id: 'client-settings-reload' }, 'Reload');
  const form = el('form', {}, tabs, content, el('div', { class: 'row wrap', style: { marginTop: '16px' } }, save, reload));
  panel.append(el('h3', {}, 'Pimpin Client'),
    el('p', { class: 'muted' }, `HUD, minimap and quality of life for ${inst.name}. Applies on the next Minecraft launch.`),
    el('p', { class: 'hint' }, 'Requires Pimpin Client on Fabric or Quilt. This editor does not install mods. HUD positions and scales stay in the in-game mouse editor; layouts, waypoints and other saved data are preserved.'), status, form);
  root.append(panel);
  let snapshot = null;
  let dirty = {};
  let saving = false;
  let selected = 'HUD';
  let selectGroup = () => {};
  const controls = new Map();
  form.addEventListener('invalid', event => {
    const field = snapshot?.schema.find(f => f.key === event.target.name);
    if (field) selectGroup(field.group); // reveal invalid fields before native focus
  }, true);
  function message(text, error = false) { status.textContent = text; status.style.color = error ? 'var(--bad)' : ''; status.setAttribute('role', error ? 'alert' : 'status'); }
  function updateSave() { save.disabled = saving || !snapshot || !Object.keys(dirty).length; }
  function draw() {
    controls.clear(); clear(tabs); clear(content);
    const groups = [...new Set(snapshot.schema.map(f => f.group))];
    const sections = new Map();
    const tabButtons = new Map();
    const choose = name => {
      selected = name;
      for (const [key, section] of sections) section.hidden = key !== name;
      for (const [key, button] of tabButtons) { button.className = `btn sm ${key === name ? 'primary' : ''}`; button.setAttribute('aria-pressed', String(key === name)); }
    };
    selectGroup = choose;
    for (const group of groups) {
      const section = el('section', { style: { marginTop: '16px' } });
      const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: '12px 24px' } });
      section.append(el('h4', { style: { margin: '0 0 12px' } }, group), grid);
      sections.set(group, section); content.append(section);
      const button = el('button', { type: 'button', onclick: () => choose(group) }, group);
      tabButtons.set(group, button); tabs.append(button);
      for (const f of snapshot.schema.filter(f => f.group === group)) {
        const id = `client-setting-${f.key}`;
        const input = f.type === 'choice'
          ? el('select', { id, name: f.key, class: 'select', 'aria-describedby': f.help ? `${id}-help` : null, style: { maxWidth: '160px' } },
            f.choices.map(c => el('option', { value: String(c.value) }, c.label)))
          : el('input', { id, name: f.key, type: f.type === 'boolean' ? 'checkbox' : f.type === 'color' ? 'color' : 'number', class: f.type === 'boolean' ? '' : 'input', 'aria-describedby': f.help ? `${id}-help` : null,
            min: f.min, max: f.max, step: f.step,
            style: f.type === 'boolean' ? { width: '16px', height: '16px', accentColor: 'var(--accent)', flexShrink: '0' } : { maxWidth: '160px' },
          });
        const value = snapshot.values[f.key];
        if (f.type === 'boolean') input.checked = value;
        else if (f.type === 'choice') input.value = String(value);
        else input.value = f.type === 'color' ? '#' + (value >>> 0).toString(16).padStart(8, '0').slice(2) : value;
        const field = el('div', { style: { borderBottom: '1px solid var(--line)', padding: '8px 0 12px', minWidth: '0' } },
          el('label', { for: id, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' } }, el('span', {}, f.label), input),
          f.help ? el('p', { class: 'hint', id: `${id}-help`, style: { margin: '6px 0 0', fontSize: '12px' } }, f.help) : null);
        input.addEventListener(f.type === 'choice' ? 'change' : 'input', () => {
          const next = f.type === 'boolean' ? input.checked : f.type === 'choice' ? Number(input.value) : f.type === 'color' ? (parseInt(input.value.slice(1), 16) | 0xff000000) : input.value === '' ? NaN : Number(input.value);
          if (next === snapshot.values[f.key]) delete dirty[f.key]; else dirty[f.key] = next;
          message(Object.keys(dirty).length ? 'Unsaved changes. Save while this instance is stopped.' : 'No unsaved changes.');
          updateSave();
        });
        controls.set(f.key, input); grid.append(field);
      }
    }
    choose(groups.includes(selected) ? selected : groups[0]); updateSave();
  }
  async function load() {
    saving = true; updateSave(); reload.disabled = true;
    try {
      const next = await api.call('client-settings:get', inst.id);
      snapshot = next; dirty = {}; draw();
      message([next.exists ? 'Saved settings loaded. Only changed controls are written.' : 'No config yet. Showing Pimpin Client defaults; a file is created only when you save.', ...next.warnings].join('\n'));
    } catch (err) {
      snapshot = null;
      for (const input of controls.values()) input.disabled = true;
      message(err.message || String(err), true);
    } finally { saving = false; reload.disabled = false; updateSave(); }
  }
  reload.addEventListener('click', async () => {
    if (Object.keys(dirty).length && !await confirmModal('Discard unsaved changes?', 'Reload the client settings from disk?', { confirm: 'Reload' })) return;
    await load();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !snapshot || !Object.keys(dirty).length) return;
    if (['preparing', 'running'].includes(state.game[inst.id]?.state)) { message('Stop Minecraft and wait for launch preparation to finish before saving.', true); return; }
    if (!form.reportValidity()) return;
    saving = true; updateSave(); reload.disabled = true;
    for (const input of controls.values()) input.disabled = true;
    try {
      const next = await api.call('client-settings:update', inst.id, { ...dirty }, snapshot.revision);
      snapshot = next; dirty = {}; draw();
      message(`Saved for ${inst.name}. Applies next launch.${next.backup ? ' Previous config kept as a safety copy in config/.' : ''}`);
    } catch (err) { message(err.message || String(err), true); }
    finally { saving = false; reload.disabled = false; for (const input of controls.values()) input.disabled = false; updateSave(); }
  });
  await load();
}
