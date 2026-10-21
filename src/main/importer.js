// Importing instances from files on disk: Modrinth .mrpack files (from
// another launcher or a download) and Pimpin .zip exports. Used by the
// Import button and by dropping a file onto the window.
const fsp = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const instances = require('./instances');
const content = require('./content');
const { safeJoin } = require('./store');
const { download, pool } = require('./net');

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

/** Import whatever the file is: .mrpack, or a .zip that holds either format. */
async function importFile(file, progress) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.mrpack') return importMrpack(file, progress);
  if (ext !== '.zip') throw new Error('Drop a .mrpack modpack or a Pimpin .zip export.');
  const zip = new AdmZip(file);
  if (zip.getEntry('modrinth.index.json')) return importMrpack(file, progress);
  return instances.importZip(file);
}

module.exports = { importFile };
