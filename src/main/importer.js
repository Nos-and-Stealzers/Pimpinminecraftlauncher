// Importing instances from files on disk: Modrinth .mrpack files (from
// another launcher or a download), CurseForge modpack .zip files (manifest.json,
// files fetched through the official API) and Pimpin .zip exports. Used by the
// Import button and by dropping a file onto the window.
const fsp = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const instances = require('./instances');
const content = require('./content');
const { safeJoin, dirs } = require('./store');
const { download, pool } = require('./net');
const curseforge = require('./curseforge');

async function importMrpack(file, progress = () => {}) {
  const zip = new AdmZip(file);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error(`${path.basename(file)} is not a Modrinth modpack (no modrinth.index.json).`);
  const index = JSON.parse(indexEntry.getData().toString('utf8'));
  const deps = index.dependencies || {};
  if (deps.forge || deps.neoforge) throw new Error('Forge and NeoForge modpacks are not supported. Use a Fabric or Quilt pack.');
  if (!deps.minecraft) throw new Error('The modpack does not say which Minecraft version it needs.');
  const loader = deps['quilt-loader'] ? 'quilt' : deps['fabric-loader'] ? 'fabric' : 'vanilla';
  const name = index.name || path.basename(file, path.extname(file));

  const inst = await instances.create({
    name,
    mcVersion: deps.minecraft,
    loader,
    loaderVersion: deps['quilt-loader'] || deps['fabric-loader'] || null,
    icon: 'pack',
  });
  const dir = instances.dirOf(inst.id);
  const files = (index.files || []).filter((f) => f.env?.client !== 'unsupported' && f.downloads?.length);
  let done = 0;
  try {
    await pool(files, 8, async (f) => {
      await download(f.downloads[0], safeJoin(dir, f.path), { sha1: f.hashes?.sha1, size: f.fileSize });
      progress({ stage: `Installing ${name}`, done: ++done, total: files.length });
    });
    for (const entry of zip.getEntries()) {
      for (const prefix of ['overrides/', 'client-overrides/']) {
        if (entry.isDirectory || !entry.entryName.startsWith(prefix)) continue;
        const dest = safeJoin(dir, entry.entryName.slice(prefix.length));
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.writeFile(dest, entry.getData());
      }
    }
  } catch (err) {
    // half-installed packs are worse than none
    await instances.remove(inst.id).catch(() => {});
    throw err;
  }
  const holder = await instances.holder(inst.id);
  const meta = await holder.load();
  await holder.save({ ...meta, modpack: { file: path.basename(file), versionNumber: index.versionId || null } });
  // gives the pack's jars real names and icons in the Content tab
  await content.identifyLocal(holder).catch(() => {});
  return instances.get(inst.id);
}

// CurseForge class id -> instance folder (mods 6, resource packs 12, shaders 6552)
const CF_FOLDERS = { 6: 'mods', 12: 'resourcepacks', 6552: 'shaderpacks' };
const CF_TYPES = { 6: 'mod', 12: 'resourcepack', 6552: 'shader' };

function readCurseforgeManifest(zip) {
  const entry = zip.getEntry('manifest.json');
  if (!entry) return null;
  try {
    const m = JSON.parse(entry.getData().toString('utf8'));
    return m && m.manifestType === 'minecraftModpack' && m.minecraft ? m : null;
  } catch {
    return null;
  }
}

/**
 * CurseForge modpack zip. Files come from the API (never scraped); mods whose
 * author disabled third-party downloads are skipped and returned as `blocked`
 * so the UI can send the user to CurseForge for them.
 */
async function importCurseforgeZip(file, progress = () => {}, { iconUrl } = {}) {
  const zip = new AdmZip(file);
  const manifest = readCurseforgeManifest(zip);
  if (!manifest) throw new Error(`${path.basename(file)} is not a CurseForge modpack (no manifest.json).`);
  if (!curseforge.status().configured) throw new Error('CurseForge needs an API key to install this modpack.');
  const loaders = manifest.minecraft.modLoaders || [];
  const primary = (loaders.find((l) => l.primary) || loaders[0] || {}).id || '';
  if (/^(forge|neoforge)-/i.test(primary)) throw new Error('Forge and NeoForge modpacks are not supported. Use a Fabric or Quilt pack.');
  if (!manifest.minecraft.version) throw new Error('The modpack does not say which Minecraft version it needs.');
  const loader = /^quilt-/i.test(primary) ? 'quilt' : /^fabric-/i.test(primary) ? 'fabric' : 'vanilla';
  const name = manifest.name || path.basename(file, path.extname(file));
  const wanted = (manifest.files || []).filter((f) => f.required !== false && Number.isSafeInteger(f.fileID) && Number.isSafeInteger(f.projectID));

  // Resolve everything before creating the instance.
  const files = [];
  for (let i = 0; i < wanted.length; i += 50) files.push(...(await curseforge.getFiles(wanted.slice(i, i + 50).map((f) => f.fileID))));
  const mods = [];
  const modIds = [...new Set(files.map((f) => f.modId))];
  for (let i = 0; i < modIds.length; i += 50) mods.push(...(await curseforge.getMods(modIds.slice(i, i + 50))));
  const modById = new Map(mods.map((m) => [m.id, m]));

  const inst = await instances.create({
    name,
    mcVersion: manifest.minecraft.version,
    loader,
    loaderVersion: primary.replace(/^(fabric|quilt)-/i, '') || null,
    icon: 'pack',
    iconUrl: iconUrl || undefined,
  });
  const dir = instances.dirOf(inst.id);
  const blocked = [];
  const records = [];
  let done = 0;
  try {
    const jobs = [];
    for (const f of files) {
      const mod = modById.get(f.modId);
      const v = curseforge.mapFile(f, mod);
      const url = v.downloadable ? v.files[0].url : null;
      if (!url) {
        blocked.push({ title: mod?.name || f.fileName, pageUrl: v.pageUrl });
        continue;
      }
      const folder = CF_FOLDERS[mod?.classId] || 'mods';
      jobs.push({ v, mod, url, folder, type: CF_TYPES[mod?.classId] || 'mod' });
    }
    await pool(jobs, 6, async (j) => {
      const file0 = j.v.files[0];
      await download(j.url, safeJoin(dir, j.folder, file0.filename), { sha1: file0.hashes.sha1 || undefined, size: file0.size || undefined });
      records.push({ type: j.type, file: file0.filename, provider: 'curseforge', projectId: j.v.project_id, modId: j.v.modId, versionId: j.v.id, fileId: j.v.fileId, versionNumber: j.v.version_number, title: j.mod?.name || file0.filename, icon: j.v.project?.icon_url || null, sha1: file0.hashes.sha1 || undefined, pinned: false });
      progress({ stage: `Installing ${name}`, done: ++done, total: jobs.length });
    });
    const overrides = `${String(manifest.overrides || 'overrides').replace(/\/+$/, '')}/`;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.startsWith(overrides)) continue;
      const dest = safeJoin(dir, entry.entryName.slice(overrides.length));
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, entry.getData());
    }
  } catch (err) {
    await instances.remove(inst.id).catch(() => {});
    throw err;
  }
  const holder = await instances.holder(inst.id);
  const meta = await holder.load();
  await holder.save({ ...meta, content: [...(meta.content || []), ...records], modpack: { file: path.basename(file), versionNumber: manifest.version || null, provider: 'curseforge' } });
  return { ...(await instances.get(inst.id)), blocked };
}

/** Library install of a CurseForge modpack: download its file through the API, then import it. */
async function installCurseforgeModpack({ projectId, versionId }, progress = () => {}) {
  const v = versionId
    ? await curseforge.getVersion(versionId, projectId ? curseforge.rawId(projectId) : undefined)
    : await curseforge.pickVersion(projectId, { loaders: ['fabric', 'quilt'] });
  if (!v) throw new Error('This modpack has no Fabric or Quilt version.');
  const f = v.files[0];
  if (!v.downloadable || !f.url) {
    throw Object.assign(new Error('Author requires download on CurseForge'), { pageUrl: v.pageUrl });
  }
  const packFile = path.join(dirs.cache, `curseforge-${v.fileId}.zip`);
  try {
    await download(f.url, packFile, { sha1: f.hashes.sha1 || undefined, size: f.size || undefined, onProgress: (d, t) => progress({ stage: `Downloading ${v.project?.title || 'modpack'}`, done: d, total: t, bytes: true }) });
    return await importCurseforgeZip(packFile, progress, { iconUrl: v.project?.icon_url });
  } finally {
    await fsp.rm(packFile, { force: true });
  }
}

/** Import whatever the file is: .mrpack, or a .zip that holds any of the formats. */
async function importFile(file, progress) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.mrpack') return importMrpack(file, progress);
  if (ext !== '.zip') throw new Error('Drop a .mrpack or CurseForge modpack, or a Pimpin .zip export.');
  const zip = new AdmZip(file);
  if (zip.getEntry('modrinth.index.json')) return importMrpack(file, progress);
  if (readCurseforgeManifest(zip)) return importCurseforgeZip(file, progress);
  return instances.importZip(file);
}

module.exports = { importFile, importCurseforgeZip, installCurseforgeModpack };
