import { el, clear, modal, confirmModal, toast } from './dom.js';
import { api, state, subscribe } from './state.js';

function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes < 1024 ** 2 ? 'KB' : bytes < 1024 ** 3 ? 'MB' : 'GB';
  const divisor = unit === 'KB' ? 1024 : unit === 'MB' ? 1024 ** 2 : 1024 ** 3;
  return `${(bytes / divisor).toFixed(1)} ${unit}`;
}

// Add a Backups button beside a world row; pass its unchanged folder name.
export function openWorldBackups(instance, world, { onRestored } = {}) {
  const folder = typeof world === 'string' ? world : world.folder;
  let records = [];
  let pending = false;
  let loaded = false;
  let failure = '';
  let closed = false;
  const body = el('div');
  const stopped = () => {
    const game = state.game[instance.id]?.state;
    return game ? !['running', 'preparing'].includes(game) : !instance.running;
  };

  async function run(task) {
    if (pending) return;
    pending = true;
    failure = '';
    draw();
    try { await task(); } catch (err) { failure = err?.message || String(err); }
    finally {
      pending = false;
      if (!closed) draw();
    }
  }

  async function refresh() {
    records = await api.call('worldBackups:list', instance.id, folder);
    loaded = true;
  }

  function button(label, action, { mutation = true, danger = false } = {}) {
    return el('button', {
      class: `btn sm ${danger ? 'danger' : 'ghost'}`,
      disabled: pending || (mutation && !stopped()),
      onclick: () => run(action),
    }, label);
  }

  function draw() {
    clear(body,
      el('p', { class: 'muted', style: { marginTop: 0 } }, `World: ${folder}`),
      el('p', { class: 'muted' }, 'Backups are stored outside your saves. Stop Minecraft and wait for launch preparation to finish before making changes.'),
      !stopped() ? el('p', { role: 'status', class: 'muted' }, 'Minecraft is running or preparing. Stop it to manage backups.') : null,
      el('div', { style: { display: 'flex', gap: '8px', marginBottom: '16px' } },
        button(pending ? 'Working…' : 'Create backup', async () => {
          await api.call('worldBackups:create', instance.id, folder);
          await refresh();
          toast('World backup created.');
        }),
        button('Refresh', refresh, { mutation: false }),
      ),
      failure ? el('p', { role: 'alert', style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, failure) : null,
      !loaded ? el('p', { class: 'muted', role: 'status' }, 'Loading backups…') : null,
      loaded && !records.length ? el('p', { class: 'muted' }, 'No backups yet. Create one to keep a copy of this world.') : null,
      el('div', { style: { display: 'grid', gap: '8px' } }, records.map((backup) => el('div', {
        style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' },
      },
      el('div', { style: { flex: '1', minWidth: '180px', overflowWrap: 'anywhere' } },
        el('strong', {}, backup.safety ? 'Automatic safety backup' : 'World backup'),
        el('div', { class: 'muted', style: { marginTop: '4px' } }, `${new Date(backup.created).toLocaleString()} · ${sizeLabel(backup.size)}`),
        el('div', { class: 'muted', style: { marginTop: '4px', fontSize: '11px' } }, backup.name),
      ),
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        button('Restore', async () => {
          const confirmed = await confirmModal('Restore world backup?',
            `Minecraft must be stopped. Restore the backup from ${new Date(backup.created).toLocaleString()} for “${folder}”?\n\nYour current world will first be saved as an automatic safety backup. The launcher checks and stages the replacement before swapping folders. The original folder is also retained for recovery.`,
            { confirm: 'Restore backup', danger: true });
          if (!confirmed) return;
          if (!stopped()) throw new Error('Stop Minecraft before restoring a backup.');
          const result = await api.call('worldBackups:restore', instance.id, folder, backup.name);
          await refresh();
          toast(`World restored. Safety backup: ${result.safetyBackup.name}`, 'ok', 8000);
          if (onRestored) await onRestored(result);
        }),
        button('Export', async () => {
          const result = await api.call('worldBackups:export', instance.id, folder, backup.name);
          if (result?.exported) toast('World backup exported.');
        }),
        button('Delete', async () => {
          if (!await confirmModal('Delete world backup?', `Delete ${backup.name}? This removes only this backup, not your world.`, { confirm: 'Delete backup', danger: true })) return;
          await api.call('worldBackups:delete', instance.id, folder, backup.name);
          await refresh();
        }, { danger: true }),
      ),
      ))),
    );
  }

  const unsubscribe = subscribe(() => { if (!closed) draw(); });
  const dialog = modal({ title: 'World backups', wide: true, body, onClose: () => { closed = true; unsubscribe(); } });
  run(refresh);
  return dialog;
}
