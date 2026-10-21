// World archives are rooted at level.dat, never nested inside the live save.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const zlib = require('node:zlib');
const AdmZip = require('adm-zip');
const { crc32 } = require('adm-zip/util');

const LIMITS = Object.freeze({ entries: 100000, file: 256 * 1024 ** 2, total: 2 * 1024 ** 3, archive: 2 * 1024 ** 3, ratio: 2000 });

function component(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' ||
      /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) {
    throw new Error('Invalid world or backup path.');
  }
  return name;
}

// lstat every ancestor, including Windows junctions. Never traverse a link.
async function checked(target, missing = false) {
  const absolute = path.resolve(target);
  const root = path.parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); } catch (err) {
      if (missing && err.code === 'ENOENT') return null;
      throw err;
    }
    if (stat.isSymbolicLink()) throw new Error('World backups cannot use symbolic links or junctions.');
  }
  return fs.lstat(absolute);
}

function createService({ instances = require('./instances'), limits = LIMITS } = {}) {
  const { safeJoin } = require('./store');
  const active = new Set();
  async function locations(id, world, make = false) {
    component(id);
    component(world);
    await instances.get(id);
    const dir = instances.dirOf(id);
    await checked(dir);
    const save = safeJoin(dir, 'saves', world);
    const folder = safeJoin(dir, 'pimpin-backups', world);
    await checked(save);
    await checked(folder, true);
    if (make) {
      await fs.mkdir(folder, { recursive: true });
      await checked(folder);
    }
    return { dir, save, folder };
  }

  async function stopped(id, task) {
    if (active.has(id)) throw new Error('A world backup operation is already in progress.');
    active.add(id);
    try {
      if (typeof instances.withStopped !== 'function') throw new Error('World backups require the instance maintenance guard.');
      return await instances.withStopped(id, task);
    } finally { active.delete(id); }
  }

  function archiveFile(folder, name) {
    component(name);
    if (!name.endsWith('.zip')) throw new Error('Unknown world backup.');
    return safeJoin(folder, name);
  }

  async function record(folder, name) {
    const stat = await checked(archiveFile(folder, name));
    if (!stat.isFile()) throw new Error('Unknown world backup.');
    return { name, size: stat.size, created: stat.mtimeMs, safety: name.startsWith('safety-') };
  }

  async function list(id, world) {
    const { folder } = await locations(id, world);
    let names;
    try { names = await fs.readdir(folder); } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const records = [];
    for (const name of names) if (name.endsWith('.zip')) records.push(await record(folder, name));
    return records.sort((a, b) => b.created - a.created);
  }

  async function snapshot(save, folder, safety = false) {
    const zip = new AdmZip();
    let count = 0;
    let total = 0;
    async function walk(dir, prefix = '') {
      await checked(dir);
      for (const name of await fs.readdir(dir)) {
        component(name);
        const file = safeJoin(dir, name);
        const relative = `${prefix}${name}`;
        const stat = await checked(file);
        if (++count > limits.entries) throw new Error('World has too many files to back up.');
        if (stat.isDirectory()) {
          zip.addFile(`${relative}/`, Buffer.alloc(0));
          await walk(file, `${relative}/`);
        } else if (stat.isFile()) {
          total += stat.size;
          if (stat.size > limits.file || total > limits.total) throw new Error('World exceeds backup size limits.');
          zip.addFile(relative, await fs.readFile(file), '', stat.mode);
        } else throw new Error('World contains an unsupported file type.');
      }
    }
    const level = await checked(path.join(save, 'level.dat'));
    if (!level.isFile() || !level.size) throw new Error('World is missing level.dat.');
    await walk(save);
    const name = `${safety ? 'safety' : 'backup'}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.zip`;
    const buffer = zip.toBuffer();
    if (buffer.length > limits.archive) throw new Error('World exceeds archive size limits.');
    const file = archiveFile(folder, name);
    await fs.writeFile(file, buffer, { flag: 'wx' });
    return record(folder, name);
  }

  async function create(id, world) {
    return stopped(id, async () => {
      const { save, folder } = await locations(id, world, true);
      return snapshot(save, folder);
    });
  }

  function validate(zip) {
    const entries = zip.getEntries();
    if (entries.length > limits.entries) throw new Error('Backup has too many entries.');
    const names = new Map();
    let total = 0;
    for (const entry of entries) {
      const name = entry.entryName;
      if (!name || name.includes('\\') || name.startsWith('/') || name.includes('\ufffd')) throw new Error('Unsafe backup entry path.');
      const parts = (entry.isDirectory ? name.slice(0, -1) : name).split('/');
      for (const part of parts) component(part);
      const key = parts.join('/').normalize('NFC').toLowerCase();
      if (names.has(key)) throw new Error('Backup contains duplicate paths.');
      names.set(key, entry.isDirectory);
      const type = (entry.attr >>> 16) & 0xf000;
      if ((type && type !== (entry.isDirectory ? 0x4000 : 0x8000)) || (entry.attr & 0x400)) {
        throw new Error('Backup contains a link or unsupported file type.');
      }
      const h = entry.header;
      total += h.size;
      if (h.encrypted || ![0, 8].includes(h.method) || h.size > limits.file || total > limits.total ||
          h.size > Math.max(1, h.compressedSize) * limits.ratio || (entry.isDirectory && (h.size || h.compressedSize || h.crc))) {
        throw new Error('Backup exceeds size limits or uses an unsupported format.');
      }
    }
    for (const name of names.keys()) {
      const parts = name.split('/');
      while (parts.length > 1) {
        parts.pop();
        if (names.get(parts.join('/')) === false) throw new Error('Backup has conflicting paths.');
      }
    }
    const level = entries.find((entry) => entry.entryName === 'level.dat' && !entry.isDirectory);
    if (!level || !level.header.size) throw new Error('Backup is missing level.dat.');
    return entries;
  }

  // Bound actual inflation, not just attacker-controlled size declarations.
  function dataOf(entry) {
    const h = entry.header;
    const compressed = entry.getCompressedData();
    if (compressed.length !== h.compressedSize) throw new Error('Corrupt backup entry.');
    const data = h.method === 0 ? compressed : zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, h.size) });
    if (data.length !== h.size || crc32(data) !== h.crc) throw new Error('Corrupt backup entry checksum or size.');
    return data;
  }

  async function restore(id, world, name) {
    return stopped(id, async () => {
      const { save, folder } = await locations(id, world, true);
      const file = archiveFile(folder, name);
      const stat = await checked(file);
      if (!stat.isFile() || stat.size > limits.archive) throw new Error('Invalid backup archive size.');
      const zip = new AdmZip(await fs.readFile(file));
      const entries = validate(zip); // Check EVERY name and header before writing.
      const safetyBackup = await snapshot(save, folder, true);
      const stage = await fs.mkdtemp(path.join(folder, '.restore-'));
      const recoveryPath = safeJoin(folder, `.previous-${randomUUID()}`);
      let moved = false;
      try {
        for (const entry of entries) {
          const target = safeJoin(stage, entry.entryName);
          if (entry.isDirectory) await fs.mkdir(target, { recursive: true });
          else {
            await fs.mkdir(path.dirname(target), { recursive: true });
            await checked(path.dirname(target));
            await fs.writeFile(target, dataOf(entry), { flag: 'wx' });
          }
        }
        await checked(path.join(stage, 'level.dat'));
        await checked(save);
        await checked(folder);
        await fs.rename(save, recoveryPath);
        moved = true;
        try { await fs.rename(stage, save); } catch (err) {
          try {
            await fs.rename(recoveryPath, save);
            moved = false;
          } catch (rollback) {
            throw new Error(`Restore failed and rollback was blocked. Original save: ${recoveryPath}. Safety backup: ${safetyBackup.name}. ${rollback.message}`);
          }
          throw err;
        }
        // Keep the untouched original too: survives crashes and unexpected disk errors.
        return { safetyBackup, recoveryPath };
      } catch (err) {
        err.message += ` Safety backup: ${safetyBackup.name}.${moved ? ` Original save retained at ${recoveryPath}.` : ''}`;
        throw err;
      } finally {
        await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
      }
    });
  }

  async function deleteBackup(id, world, name) {
    return stopped(id, async () => {
      const { folder } = await locations(id, world);
      const file = archiveFile(folder, name);
      await record(folder, name);
      await fs.unlink(file);
      return list(id, world);
    });
  }

  // Destination must come from the main-process save dialog, never renderer IPC.
  // Exclusive copy deliberately refuses overwrite, links, and live instance paths.
  async function exportBackup(id, world, name, destination) {
    return stopped(id, async () => {
      const { dir, folder } = await locations(id, world);
      await record(folder, name);
      if (typeof destination !== 'string' || !path.isAbsolute(destination)) throw new Error('Choose an export destination.');
      const relative = path.relative(path.resolve(dir), path.resolve(destination));
      if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
        throw new Error('Export outside the instance folder.');
      }
      await checked(path.dirname(destination));
      await fs.copyFile(archiveFile(folder, name), destination, constants.COPYFILE_EXCL);
      return { exported: true };
    });
  }

  return { create, list, restore, deleteBackup, exportBackup };
}

let defaultService;
module.exports = { createService, LIMITS };
for (const method of ['create', 'list', 'restore', 'deleteBackup', 'exportBackup']) {
  module.exports[method] = (...args) => (defaultService ||= createService())[method](...args);
}
