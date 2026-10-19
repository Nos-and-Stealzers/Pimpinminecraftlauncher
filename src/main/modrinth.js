// Thin client for the public Modrinth API (https://docs.modrinth.com).
// Modrinth hosts the public library of mods, shaders, resource packs,
// modpacks and server plugins that the launcher browses and installs.
const { getJson, request } = require('./net');

const API = 'https://api.modrinth.com/v2';

const q = (v) => encodeURIComponent(JSON.stringify(v));

/** Facets for each library tab. `ctx` narrows results to the selected instance/server. */
function facetsFor(type, { mcVersion, loader } = {}) {
  const facets = [];
  switch (type) {
    case 'mod':
      facets.push(['project_type:mod']);
      facets.push(loader === 'quilt' ? ['categories:quilt', 'categories:fabric'] : [`categories:${loader || 'fabric'}`]);
      break;
    case 'shader':
      facets.push(['project_type:shader']);
      facets.push(['categories:iris', 'categories:optifine']);
      break;
    case 'resourcepack':
      facets.push(['project_type:resourcepack']);
      break;
    case 'modpack':
      facets.push(['project_type:modpack']);
      facets.push(['categories:fabric', 'categories:quilt']);
      break;
    case 'plugin':
      facets.push(['project_type:plugin']);
      facets.push(['categories:paper', 'categories:spigot', 'categories:bukkit', 'categories:purpur']);
      break;
    default:
      throw new Error(`Unknown content type ${type}`);
  }
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  return facets;
}

async function search({ type, query = '', sort = 'relevance', offset = 0, limit = 24, mcVersion, loader, category }) {
  const facets = facetsFor(type, { mcVersion, loader });
  if (category) facets.push([`categories:${category}`]);
  const url =
    `${API}/search?query=${encodeURIComponent(query)}&index=${encodeURIComponent(sort)}` +
    `&offset=${Number(offset) || 0}&limit=${Math.min(Number(limit) || 24, 100)}&facets=${q(facets)}`;
  return getJson(url);
}

async function getProject(idOrSlug) {
  return getJson(`${API}/project/${encodeURIComponent(idOrSlug)}`);
}

async function getProjects(ids) {
  if (!ids.length) return [];
  return getJson(`${API}/projects?ids=${q(ids)}`);
}

async function getVersions(idOrSlug, { loaders, gameVersions } = {}) {
  let url = `${API}/project/${encodeURIComponent(idOrSlug)}/version?include_changelog=false`;
  if (loaders?.length) url += `&loaders=${q(loaders)}`;
  if (gameVersions?.length) url += `&game_versions=${q(gameVersions)}`;
  return getJson(url);
}

async function getVersion(id) {
  return getJson(`${API}/version/${encodeURIComponent(id)}`);
}

/** Map of sha1 -> newest compatible version, for update checks. */
async function latestForHashes(hashes, { loaders, gameVersions }) {
  if (!hashes.length) return {};
  const res = await request(`${API}/version_files/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes, algorithm: 'sha1', loaders, game_versions: gameVersions }),
  });
  return res.json();
}

async function versionsForHashes(hashes) {
  if (!hashes.length) return {};
  const res = await request(`${API}/version_files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes, algorithm: 'sha1' }),
  });
  return res.json();
}

async function getCategories() {
  return getJson(`${API}/tag/category`);
}

module.exports = {
  search,
  getProject,
  getProjects,
  getVersions,
  getVersion,
  latestForHashes,
  versionsForHashes,
  getCategories,
};
