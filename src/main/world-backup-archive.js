const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const zlib = require('node:zlib');
const AdmZip = require('adm-zip');
const { crc32 } = require('adm-zip/util');
const { safeJoin } = require('./store');

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

function createArchive(limits) {
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
    const temporary = `${file}.part`;
    try {
      await fs.writeFile(temporary, buffer, { flag: 'wx' });
      await fs.rename(temporary, file);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return record(folder, name);
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

  async function stage(file, target) {
    const stat = await checked(file);
    if (!stat.isFile() || stat.size > limits.archive) throw new Error('Invalid backup archive size.');
    const zip = new AdmZip(await fs.readFile(file));
    const entries = validate(zip);
    for (const entry of entries) {
      const destination = safeJoin(target, entry.entryName);
      if (entry.isDirectory) await fs.mkdir(destination, { recursive: true });
      else {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await checked(path.dirname(destination));
        await fs.writeFile(destination, dataOf(entry), { flag: 'wx' });
      }
    }
    await checked(path.join(target, 'level.dat'));
  }
  return { snapshot, stage };
}
module.exports = { component, checked, createArchive };
