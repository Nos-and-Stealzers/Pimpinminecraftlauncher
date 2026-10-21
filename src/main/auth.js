// Accounts: Microsoft (via msmc, opens the official Microsoft login window)
// and offline accounts. Refresh tokens are encrypted with the OS keychain when
// Electron's safeStorage is available.
const path = require('path');
const crypto = require('crypto');
const { safeStorage } = require('electron');
const { dirs, readJson, writeJson, getSettings, updateSettings } = require('./store');

const FILE = path.join(dirs.root, 'accounts.json');
// Minecraft access tokens live 24h, refresh a bit before that
const TOKEN_TTL = 23 * 3600e3;
const sessionCache = new Map(); // id -> { accessToken, xuid, exp }

function seal(text) {
  if (safeStorage.isEncryptionAvailable()) return { enc: safeStorage.encryptString(text).toString('base64') };
  return { raw: text };
}

function unseal(box) {
  if (!box) return null;
  if (box.enc) return safeStorage.decryptString(Buffer.from(box.enc, 'base64'));
  return box.raw;
}

async function load() {
  return readJson(FILE, []);
}

async function save(accounts) {
  await writeJson(FILE, accounts);
}

function publicView(acc) {
  return { id: acc.id, name: acc.name, type: acc.type };
}

async function listAccounts() {
  const accounts = await load();
  return { accounts: accounts.map(publicView), active: getSettings().activeAccount };
}

// Same v3 UUID the vanilla server gives offline players
// (UUID.nameUUIDFromBytes("OfflinePlayer:" + name)), so worlds keep their data.
function offlineUuid(name) {
  const md5 = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const h = md5.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function cacheSession(id, user) {
  sessionCache.set(id, { accessToken: user.access_token, xuid: user.meta?.xuid, exp: Date.now() + TOKEN_TTL });
}

async function upsert(acc) {
  const accounts = (await load()).filter((a) => a.id !== acc.id);
  accounts.push(acc);
  await save(accounts);
  await updateSettings({ activeAccount: acc.id });
  return publicView(acc);
}

async function addOffline(name) {
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new Error('Offline names must be 3-16 characters: letters, numbers and underscores.');
  }
  return upsert({ id: offlineUuid(name), name, type: 'offline' });
}

async function addMicrosoft() {
  const { Auth } = require('msmc');
  const auth = new Auth('select_account');
  const xbox = await auth.launch('electron', {
    width: 520,
    height: 680,
    resizable: false,
    title: 'Sign in with Microsoft',
    backgroundColor: '#0f0c1d',
  });
  const mc = await xbox.getMinecraft();
  if (!mc.profile) throw new Error('This Microsoft account does not own Minecraft: Java Edition.');
  const user = mc.mclc();
  cacheSession(user.uuid, user);
  return upsert({ id: user.uuid, name: user.name, type: 'msa', xuid: user.meta?.xuid, refresh: seal(xbox.save()) });
}

async function removeAccount(id) {
  const accounts = (await load()).filter((a) => a.id !== id);
  await save(accounts);
  sessionCache.delete(id);
  if (getSettings().activeAccount === id) await updateSettings({ activeAccount: accounts[0]?.id || null });
  return listAccounts();
}

async function setActive(id) {
  await updateSettings({ activeAccount: id });
  return listAccounts();
}

/** Resolve the account into the values the game needs, refreshing if required. */
async function getLaunchAccount(id) {
  const accounts = await load();
  const acc = accounts.find((a) => a.id === (id || getSettings().activeAccount)) || accounts[0];
  if (!acc) throw new Error('Add an account first (top-right corner).');
  if (acc.type === 'offline') {
    return { name: acc.name, uuid: acc.id, accessToken: '0', type: 'offline' };
  }
  const cached = sessionCache.get(acc.id);
  if (cached && cached.exp > Date.now()) {
    return { name: acc.name, uuid: acc.id, accessToken: cached.accessToken, xuid: cached.xuid, type: 'msa' };
  }
  const { Auth } = require('msmc');
  let xbox;
  try {
    xbox = await new Auth('select_account').refresh(unseal(acc.refresh));
  } catch {
    // revoked/expired token, or safeStorage can't decrypt the old one anymore
    throw new Error(`Your Microsoft login for ${acc.name} expired. Remove the account and sign in again.`);
  }
  const user = (await xbox.getMinecraft()).mclc();
  acc.name = user.name; // picks up name changes
  acc.refresh = seal(xbox.save());
  await save(accounts);
  cacheSession(acc.id, user);
  return { name: user.name, uuid: acc.id, accessToken: user.access_token, xuid: user.meta?.xuid, type: 'msa' };
}

module.exports = { listAccounts, addOffline, addMicrosoft, removeAccount, setActive, getLaunchAccount };
