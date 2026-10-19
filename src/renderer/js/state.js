// Shared UI state + backend access. Pages subscribe and re-render on change.
export const api = window.pimpin;

export const state = {
  settings: null,
  accounts: { accounts: [], active: null },
  instances: [],
  servers: [],
  game: {}, // instanceId -> { state, progress }
  server: {}, // serverId -> { state }
  versions: null,
  info: null,
};

const subs = new Set();
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
export function notify(topic) {
  for (const fn of subs) {
    try {
      fn(topic);
    } catch (err) {
      console.error(err);
    }
  }
}

export async function refreshSettings() {
  state.settings = await api.call('settings:get');
  document.body.dataset.accent = state.settings.accent || 'violet';
  notify('settings');
}

export async function updateSettings(patch) {
  state.settings = await api.call('settings:update', patch);
  document.body.dataset.accent = state.settings.accent || 'violet';
  notify('settings');
}

export async function refreshAccounts() {
  state.accounts = await api.call('accounts:list');
  notify('accounts');
}

export async function refreshInstances() {
  state.instances = await api.call('instances:list');
  notify('instances');
}

export async function refreshServers() {
  state.servers = await api.call('servers:list');
  notify('servers');
}

export async function getVersions() {
  if (!state.versions) state.versions = await api.call('versions:list');
  return state.versions;
}

export function activeAccount() {
  const { accounts, active } = state.accounts;
  return accounts.find((a) => a.id === active) || accounts[0] || null;
}

export function selectedInstance() {
  const id = state.settings?.lastInstance;
  return state.instances.find((i) => i.id === id) || state.instances[0] || null;
}

export async function selectInstance(id) {
  await updateSettings({ lastInstance: id });
  notify('instances');
}

export function headUrl(account, size = 64) {
  if (!account) return null;
  const id = account.type === 'offline' ? account.name : account.id.replace(/-/g, '');
  return `https://mc-heads.net/avatar/${encodeURIComponent(id)}/${size}`;
}

export const LOADER_LABEL = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt' };
export const ICON_KEYS = ['violet', 'crimson', 'emerald', 'ocean', 'gold', 'grass', 'night'];
