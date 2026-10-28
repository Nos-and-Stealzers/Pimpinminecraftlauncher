// Thin client for the official CurseForge API (https://docs.curseforge.com/rest-api/).
// Needs a CurseForge API key: from settings (curseforgeApiKey) or a build-time
// file written by CI (src/main/generated/curseforge-key.json, gitignored).
// The key is only ever sent as the x-api-key header and never logged.
// Everything leaving this module is shaped like the Modrinth client's data so
// the library UI and content.js can share one flow. Ids are prefixed with
// "cf:" so they never collide with Modrinth ids.
const fs = require('fs');
const path = require('path');
const { getJson, request } = require('./net');

const API = 'https://api.curseforge.com/v1';
const GAME_ID = 432; // Minecraft
const CLASS_IDS = { mod: 6, resourcepack: 12, shader: 6552, modpack: 4471 };
const LOADER_TYPES = { fabric: 4, quilt: 5 };
const RELATION = { 1: 'embedded', 2: 'optional', 3: 'required', 4: 'tool', 5: 'incompatible', 6: 'include' };
const RELEASE = { 1: 'release', 2: 'beta', 3: 'alpha' };
const SORT_FIELDS = { relevance: null, downloads: 6, follows: 2, newest: 11, updated: 3 };
const APPLY_URL = 'https://forms.monday.com/forms/dce5ccb7afda9a1c21dab1a1aa1d84eb?r=use1';
const KEY_FILE = path.join(__dirname, 'generated', 'curseforge-key.json');
const PREFIX = 'cf:';

const cfId = (n) => `${PREFIX}${n}`;
const isCfId = (id) => typeof id === 'string' && id.startsWith(PREFIX);
function rawId(id) {
  const n = Number(isCfId(id) ? id.slice(PREFIX.length) : id);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Invalid CurseForge id');
  return n;
}

let keyFileCache;
function buildKey() {
  if (keyFileCache === undefined) {
    try {
      const k = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).key;
      keyFileCache = typeof k === 'string' && k.trim() ? k.trim() : null;
    } catch {
      keyFileCache = null;
    }
  }
  return keyFileCache;
}

function settingsKey() {
  try {
    const k = require('./store').getSettings().curseforgeApiKey;
    return typeof k === 'string' && k.trim() ? k.trim() : null;
  } catch {
    return null;
  }
}

function apiKey() {
  return settingsKey() || buildKey();
}

/** {configured, source} for the settings row and the library source switcher. Never returns the key. */
function status() {
  const fromSettings = settingsKey();
  const source = fromSettings ? 'settings' : buildKey() ? 'build' : null;
  return { configured: Boolean(source), source, applyUrl: APPLY_URL };
}

function noKey() {
  return Object.assign(new Error('CurseForge needs an API key'), { code: 'CURSEFORGE_NO_KEY', applyUrl: APPLY_URL });
}

function headers() {
  const key = apiKey();
  if (!key) throw noKey();
  return { 'x-api-key': key, Accept: 'application/json' };
}

function wrap(err) {
  // net.js puts only the URL in its messages, never headers, so the key stays private.
  if (/HTTP 403/.test(err?.message || '')) return Object.assign(new Error('CurseForge refused the API key (HTTP 403). Check it in Settings.'), { code: 'CURSEFORGE_FORBIDDEN' });
  return err;
}

async function get(url) {
  const h = headers();
  try {
    return await getJson(url, { headers: h });
  } catch (err) {
    throw wrap(err);
  }
}

async function post(url, body) {
  const h = headers();
  try {
    const res = await request(url, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await res.json();
  } catch (err) {
    throw wrap(err);
  }
}

// ---------------------------------------------------------------- mapping --

const sha1Of = (file) => (file.hashes || []).find((h) => h.algo === 1)?.value?.toLowerCase() || null;
const mcVersionsOf = (file) => (file.gameVersions || []).filter((v) => /^\d+\.\d+/.test(v));
const loadersOf = (file) => (file.gameVersions || []).map((v) => String(v).toLowerCase()).filter((v) => ['fabric', 'quilt', 'forge', 'neoforge'].includes(v));
const pageUrl = (mod, fileId) => {
  const base = mod?.links?.websiteUrl || (mod?.slug ? `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}` : 'https://www.curseforge.com/minecraft');
  return fileId ? `${base}/files/${fileId}` : base;
};
const typeOfClass = (classId) => Object.entries(CLASS_IDS).find(([, v]) => v === classId)?.[0] || 'mod';

function mapHit(mod) {
  return {
    provider: 'curseforge',
    project_id: cfId(mod.id),
    slug: mod.slug,
    title: mod.name,
    author: mod.authors?.[0]?.name || 'Unknown',
    description: mod.summary || '',
    downloads: mod.downloadCount || 0,
    follows: mod.thumbsUpCount || 0,
    icon_url: mod.logo?.thumbnailUrl || mod.logo?.url || null,
    categories: (mod.categories || []).map((c) => c.name),
    allowModDistribution: mod.allowModDistribution !== false,
    url: pageUrl(mod),
  };
}

/** Strip the HTML project description to plain text: the UI renders it as markdown, never as HTML. */
function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li|tr)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 20000);
}

function mapFile(file, mod) {
  return {
    provider: 'curseforge',
    id: cfId(file.id),
    fileId: file.id,
    modId: file.modId,
    project_id: cfId(file.modId),
    version_number: file.displayName || file.fileName,
    name: file.displayName || file.fileName,
    game_versions: mcVersionsOf(file),
    loaders: loadersOf(file),
    version_type: RELEASE[file.releaseType] || 'release',
    date: file.fileDate,
    available: file.isAvailable !== false,
    downloadable: Boolean(file.downloadUrl) && mod?.allowModDistribution !== false,
    pageUrl: pageUrl(mod, file.id),
    project: mod ? { title: mod.name, icon_url: mod.logo?.thumbnailUrl || mod.logo?.url || null, allowModDistribution: mod.allowModDistribution !== false } : null,
    files: [{ primary: true, filename: file.fileName, url: file.downloadUrl || null, size: file.fileLength || 0, hashes: { sha1: sha1Of(file) } }],
    dependencies: (file.dependencies || []).map((d) => ({ project_id: cfId(d.modId), modId: d.modId, dependency_type: RELATION[d.relationType] || 'other', relationType: d.relationType })),
  };
}

// --------------------------------------------------------------- endpoints --

async function search({ type, query = '', sort = 'relevance', offset = 0, limit = 24, mcVersion, loader }) {
  const classId = CLASS_IDS[type];
  if (!classId) throw new Error(type === 'plugin' ? 'Server plugins come from Modrinth. Switch the source to Modrinth.' : `Unknown content type ${type}`);
  const params = new URLSearchParams({ gameId: String(GAME_ID), classId: String(classId) });
  if (query) params.set('searchFilter', query);
  const field = SORT_FIELDS[sort] ?? (query ? null : 2);
  if (field) params.set('sortField', String(field));
  params.set('sortOrder', 'desc');
  if (mcVersion) params.set('gameVersion', mcVersion);
  // modLoaderType must be coupled with gameVersion. Quilt loads Fabric mods, so it browses Fabric.
  if (type === 'mod' && mcVersion) params.set('modLoaderType', String(LOADER_TYPES.fabric));
  if (type === 'modpack' && mcVersion) params.set('modLoaderType', String(LOADER_TYPES.fabric));
  const size = Math.min(Number(limit) || 24, 50);
  const index = Math.min(Math.max(Number(offset) || 0, 0), 10000 - size);
  params.set('index', String(index));
  params.set('pageSize', String(size));
  const res = await get(`${API}/mods/search?${params}`);
  return {
    provider: 'curseforge',
    hits: (res.data || []).map(mapHit),
    offset: res.pagination?.index ?? index,
    limit: size,
    // the API stops at index + pageSize = 10,000
    total_hits: Math.min(res.pagination?.totalCount ?? 0, 10000),
  };
}

async function getModRaw(id) {
  return (await get(`${API}/mods/${rawId(id)}`)).data;
}

async function getProject(id) {
  const mod = await getModRaw(id);
  let body = mod.summary || '';
  try {
    body = htmlToText((await get(`${API}/mods/${mod.id}/description`)).data) || body;
  } catch {
    /* the summary will do */
  }
  return {
    ...mapHit(mod),
    id: cfId(mod.id),
    modId: mod.id,
    project_type: typeOfClass(mod.classId),
    followers: mod.thumbsUpCount || 0,
    body,
    gallery: (mod.screenshots || []).map((s) => ({ url: s.url, title: s.title })),
  };
}

async function getMods(ids) {
  if (!ids.length) return [];
  return (await post(`${API}/mods`, { modIds: ids.map(rawId) })).data || [];
}

/** All files of a mod (newest first), optionally narrowed by game version / loader. */
async function getFilesRaw(id, { gameVersion, modLoaderType } = {}) {
  const params = new URLSearchParams({ pageSize: '50', index: '0' });
  if (gameVersion) params.set('gameVersion', gameVersion);
  if (modLoaderType) params.set('modLoaderType', String(modLoaderType));
  return (await get(`${API}/mods/${rawId(id)}/files?${params}`)).data || [];
}

function fileMatches(file, { loaders, gameVersions }) {
  if (file.isAvailable === false) return false;
  if (gameVersions?.length && !gameVersions.some((v) => mcVersionsOf(file).includes(v))) return false;
  if (loaders?.length) {
    const have = loadersOf(file);
    if (!loaders.some((l) => have.includes(l))) return false;
  }
  return true;
}

function sortFiles(files) {
  return [...files].sort((a, b) => (a.releaseType || 1) - (b.releaseType || 1) || Date.parse(b.fileDate || 0) - Date.parse(a.fileDate || 0) || b.id - a.id);
}

/** Versions in the Modrinth shape, filtered like Modrinth's loaders/game_versions query. */
async function getVersions(id, { loaders, gameVersions } = {}) {
  const [mod, raw] = await Promise.all([
    getModRaw(id),
    getFilesRaw(id, { gameVersion: gameVersions?.length === 1 ? gameVersions[0] : undefined, modLoaderType: loaders?.length === 1 ? LOADER_TYPES[loaders[0]] : undefined }),
  ]);
  const files = raw.filter((f) => fileMatches(f, { loaders, gameVersions }));
  return sortFiles(files).map((f) => mapFile(f, mod));
}

/**
 * Best file for an install: matching Minecraft version + loader, releases first,
 * then newest. Shaders and resource packs fall back to any version.
 */
async function pickVersion(id, { loaders, gameVersions, anyVersionFallback = false } = {}) {
  let versions = await getVersions(id, { loaders, gameVersions });
  if (!versions.length && anyVersionFallback) versions = await getVersions(id, { loaders });
  return versions[0] || null;
}

async function getVersion(fileOrVersionId, modId) {
  const fileId = rawId(fileOrVersionId);
  if (!modId) {
    const file = ((await post(`${API}/mods/files`, { fileIds: [fileId] })).data || [])[0];
    if (!file) throw new Error('CurseForge file not found');
    modId = file.modId;
  }
  const [mod, file] = await Promise.all([getModRaw(modId), get(`${API}/mods/${rawId(modId)}/files/${fileId}`).then((r) => r.data)]);
  return mapFile(file, mod);
}

async function getFiles(fileIds) {
  if (!fileIds.length) return [];
  return (await post(`${API}/mods/files`, { fileIds: fileIds.map(rawId) })).data || [];
}

/**
 * Download URL for a file. Mods whose author turned off third-party
 * distribution have no URL: the caller must send the user to CurseForge.
 */
async function downloadUrl(modId, fileId, { allowModDistribution, url } = {}) {
  if (allowModDistribution === false) return null;
  if (url) return url;
  try {
    const res = await get(`${API}/mods/${rawId(modId)}/files/${rawId(fileId)}/download-url`);
    return typeof res.data === 'string' && /^https:\/\//.test(res.data) ? res.data : null;
  } catch (err) {
    if (err.code === 'CURSEFORGE_NO_KEY') throw err;
    return null;
  }
}

/**
 * Newest compatible file for each tracked record, using the mods' latestFilesIndexes.
 * records: [{modId, fileId}] -> { [modId]: {fileId, filename} }
 */
async function latestFor(records, { mcVersion, loaders }) {
  const mods = await getMods([...new Set(records.map((r) => r.modId))]);
  const wanted = loaders.map((l) => LOADER_TYPES[l]).filter(Boolean);
  const out = {};
  for (const mod of mods) {
    const idx = (mod.latestFilesIndexes || []).filter((i) => i.gameVersion === mcVersion && (!wanted.length || wanted.includes(i.modLoader)));
    if (!idx.length) continue;
    idx.sort((a, b) => (a.releaseType || 1) - (b.releaseType || 1) || b.fileId - a.fileId);
    out[mod.id] = { fileId: idx[0].fileId, filename: idx[0].filename };
  }
  return out;
}

module.exports = {
  API,
  GAME_ID,
  CLASS_IDS,
  LOADER_TYPES,
  APPLY_URL,
  KEY_FILE,
  cfId,
  isCfId,
  rawId,
  status,
  apiKey,
  search,
  getProject,
  getMods,
  getVersions,
  getVersion,
  getFiles,
  pickVersion,
  downloadUrl,
  latestFor,
  mapFile,
  mapHit,
  htmlToText,
  pageUrl,
  _resetKeyCache: () => { keyFileCache = undefined; },
};
