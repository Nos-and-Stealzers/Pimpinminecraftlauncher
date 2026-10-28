// Discord Rich Presence: advertises the running Minecraft instance/list.
// Needs the user's own Discord application client ID (the games API refuses
// third-party IDs), so it stays off until settings.discordAppId is filled in.
const { getSettings } = require('./store');

let rpc = null; // logged-in client
let clientId = null;
let currentActivity = null;

function active() {
  const s = getSettings();
  return s.discordRich !== false && typeof s.discordAppId === 'string' && s.discordAppId;
}

async function destroy() {
  const c = rpc;
  rpc = null;
  clientId = null;
  currentActivity = null;
  if (!c) return;
  try {
    await c.clearActivity();
  } catch {
    /* socket already gone */
  }
  try {
    await c.destroy();
  } catch {
    /* socket already gone */
  }
}

async function login(id) {
  const RPC = require('discord-rpc');
  if (RPC.register) RPC.register(id); // safe no-op when Discord is already open
  const c = new RPC.Client({ transport: 'ipc' });
  await c.login({ clientId: id });
  c.on('disconnected', () => void destroy().catch(() => {}));
  rpc = c;
  clientId = id;
  return c;
}

/**
 * list: running instances as [{ name, mcVersion, loader, started }]. The most
 * recently started game wins; two games at once show "and N more".
 */
async function setGames(games) {
  const list = games.filter(Boolean);
  if (!active()) return destroy().catch(() => {});
  if (!list.length) {
    currentActivity = null;
    return destroy().catch(() => {});
  }
  const s = getSettings();
  const id = s.discordAppId;
  try {
    if (!rpc || clientId !== id) {
      await destroy().catch(() => {});
      await login(id); // throws when Discord isn't running: stay silent
    }
    const main = [...list].sort((a, b) => (b.started || 0) - (a.started || 0))[0];
    const extra = list.length - 1;
    const details = `Playing ${main.name}`;
    const state = extra > 0 ? `${main.mcVersion} · ${main.loader || 'vanilla'} · ${extra} more game${extra > 1 ? 's' : ''}` : `${main.mcVersion} · ${main.loader || 'vanilla'}`;
    const activity = {
      details,
      state,
      startTimestamp: Math.round((main.started || Date.now()) / 1000),
      instance: false,
    };
    if (currentActivity && currentActivity.details === details && currentActivity.state === state) return;
    currentActivity = { details, state };
    await rpc.setActivity(activity);
  } catch {
    // Discord closed, wrong client ID or not signed in: go dark until the next game launch
    rpc = null;
    clientId = null;
  }
}

/** Kill the socket for app quit. */
async function quit() {
  await destroy();
}

module.exports = { setGames, quit };
