const fs = require('fs/promises');
const { constants } = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');
const zlib = require('zlib');

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_PIXELS = 64 * 1024 * 1024;
const FAVORITES = '.pimpin-screenshot-favorites.json';
const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Validate compressed scanlines too: a plausible IHDR is not an image.
function inspectPNG(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 || bytes.length > MAX_BYTES || !bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('Invalid PNG screenshot.');
  let width, height, depth, color, interlace, palette, transparency;
  let ended = false, sawImage = false, closedImage = false;
  const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error('Truncated PNG.');
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) throw new Error('Truncated PNG.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, end - 4);
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error('Corrupt PNG checksum.');
    if (offset === 8 && type !== 'IHDR') throw new Error('Missing PNG header.');
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) throw new Error('Invalid PNG header.');
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]; color = body[9]; interlace = body[12];
      if (!width || !height || width * height > MAX_PIXELS || width > 32768 || height > 32768) throw new Error('PNG dimensions exceed the screenshot limit.');
      if (!({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] })[color]?.includes(depth) || body[10] || body[11] || interlace > 1) throw new Error('Unsupported PNG encoding.');
    } else if (type === 'PLTE') {
      if (palette || sawImage || transparency || !length || length % 3 || length > 768 || [0, 4].includes(color) || (color === 3 && length / 3 > 2 ** depth)) throw new Error('Invalid PNG palette.');
      palette = body;
    } else if (type === 'tRNS') {
      if (transparency || sawImage || (color === 3 ? !palette || !length || length > palette.length / 3 : color === 0 ? length !== 2 : color === 2 ? length !== 6 : true)) throw new Error('Invalid PNG transparency.');
      transparency = body;
    } else if (type === 'IDAT') {
      if (closedImage || (color === 3 && !palette)) throw new Error('Invalid PNG image data.');
      sawImage = true; compressed.push(body);
    } else if (type === 'IEND') {
      if (length || !sawImage || end !== bytes.length) throw new Error('Invalid PNG end.');
      ended = true; break;
    } else {
      if (sawImage) closedImage = true;
      if (['acTL', 'fcTL', 'fdAT'].includes(type) || type[0] === type[0].toUpperCase()) throw new Error('Unsupported PNG chunk.');
    }
    offset = end;
  }
  if (!ended) throw new Error('Incomplete PNG.');
  const bits = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[color] * depth;
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const layout = passes.map(([x, y, dx, dy]) => ({ w: Math.ceil((width - x) / dx), h: Math.ceil((height - y) / dy) })).filter((pass) => pass.w > 0 && pass.h > 0);
  const expected = layout.reduce((sum, pass) => sum + pass.h * (1 + Math.ceil(pass.w * bits / 8)), 0);
  if (expected > 256 * 1024 * 1024) throw new Error('Decoded PNG exceeds the screenshot memory limit.');
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(compressed), { maxOutputLength: expected }); }
  catch { throw new Error('PNG image data could not be decoded.'); }
  if (raw.length !== expected) throw new Error('Incomplete PNG scanlines.');
  let cursor = 0;
  const stride = Math.max(1, Math.ceil(bits / 8));
  const paeth = (a, b, c) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (const pass of layout) {
    const rowBytes = Math.ceil(pass.w * bits / 8);
    let previous = Buffer.alloc(rowBytes);
    for (let y = 0; y < pass.h; y++) {
      const filter = raw[cursor++];
      if (filter > 4) throw new Error('Invalid PNG scanline filter.');
      const row = raw.subarray(cursor, cursor + rowBytes); cursor += rowBytes;
      // Only palette images need unfiltering; other colors have no invalid sample values.
      if (color === 3) {
        for (let x = 0; x < rowBytes; x++) {
          const a = x >= stride ? row[x - stride] : 0, b = previous[x], c = x >= stride ? previous[x - stride] : 0;
          row[x] = (row[x] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) & 255;
        }
        for (let x = 0; x < pass.w; x++) {
          const sample = (row[Math.floor(x * depth / 8)] >> (8 - depth - x * depth % 8)) & (2 ** depth - 1);
          if (sample * 3 >= palette.length) throw new Error('Invalid PNG palette index.');
        }
        previous = row;
      }
    }
  }
  return { width, height };
}

function segment(name) {
  if (typeof name !== 'string' || !name || name.length > 255 || /[\x00-\x1f\x7f<>:"/\\|?*]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Invalid screenshot or instance name.');
  return name;
}
function pngName(name) {
  segment(name);
  if (!/\.png$/i.test(name)) throw new Error('Choose a PNG screenshot.');
  return name;
}
const samePath = (a, b) => path.relative(a, b) === '';
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs;

function createScreenshots({ instancesRoot, nativeImage, clipboard }) {
  const root = path.resolve(instancesRoot);
  const queues = new Map();
  function serialize(id, action) {
    const previous = queues.get(id) || Promise.resolve();
    const pending = previous.catch(() => {}).then(action);
    queues.set(id, pending);
    pending.finally(() => { if (queues.get(id) === pending) queues.delete(id); }).catch(() => {});
    return pending;
  }
  async function directory(folder) {
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await fs.realpath(folder), folder)) throw new Error('Screenshot folders must not be symbolic links or junctions.');
    return folder;
  }
  async function instance(id) {
    segment(id);
    await directory(root);
    return directory(path.join(root, id));
  }
  async function folder(id) {
    return directory(path.join(await instance(id), 'screenshots'));
  }
  async function readFile(file, limit) {
    const before = await fs.lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit) throw new Error('Unsafe or oversized screenshot file.');
    const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const opened = await handle.stat();
      if (!sameFile(before, opened)) throw new Error('Screenshot changed while opening. Refresh and try again.');
      // Bounded reads also handle a file growing after the initial stat.
      const bytes = Buffer.alloc(opened.size + 1);
      let count = 0;
      while (count < bytes.length) {
        const chunk = await handle.read(bytes, count, bytes.length - count, count);
        if (!chunk.bytesRead) break;
        count += chunk.bytesRead;
      }
      if (count !== opened.size || !sameFile(opened, await handle.stat()) || !sameFile(opened, await fs.lstat(file))) throw new Error('Screenshot changed while reading. Refresh and try again.');
      return { bytes: bytes.subarray(0, count), stat: opened };
    } finally { await handle.close(); }
  }
  async function source(id, name) {
    pngName(name);
    const dir = await folder(id), file = path.join(dir, name);
    const read = await readFile(file, MAX_BYTES);
    await folder(id);
    return { ...read, file, ...inspectPNG(read.bytes) };
  }
  async function favorites(id) {
    const file = path.join(await instance(id), FAVORITES);
    try {
      const { bytes } = await readFile(file, 1024 * 1024);
      const names = JSON.parse(bytes.toString('utf8'));
      if (!Array.isArray(names) || names.some((name) => { try { pngName(name); return false; } catch { return true; } })) throw new Error('Invalid screenshot favorites file.');
      return new Set(names);
    } catch (error) {
      if (error.code === 'ENOENT') return new Set();
      throw error;
    }
  }
  async function saveFavorites(id, names) {
    const dir = await instance(id), file = path.join(dir, FAVORITES);
    const temporary = path.join(dir, `.pimpin-screenshots-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, JSON.stringify([...names].sort()), { flag: 'wx' });
      await instance(id);
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  async function list(id) {
    const starred = await favorites(id);
    let dir;
    try { dir = await folder(id); }
    catch (error) { if (error.code === 'ENOENT') return { screenshots: [], skipped: 0 }; throw error; }
    const screenshots = [];
    let skipped = 0;
    for (const name of await fs.readdir(dir)) {
      if (!/\.png$/i.test(name)) continue;
      try {
        const shot = await source(id, name);
        screenshots.push({ name, url: `${pathToFileURL(shot.file).href}?t=${shot.stat.mtimeMs}`, time: shot.stat.mtimeMs, size: shot.bytes.length, width: shot.width, height: shot.height, favorite: starred.has(name) });
      } catch (error) {
        if (['EACCES', 'EPERM', 'EIO'].includes(error.code)) throw error;
        skipped++;
      }
    }
    screenshots.sort((a, b) => b.time - a.time || a.name.localeCompare(b.name));
    return { screenshots, skipped };
  }
  function favorite(id, name, on) {
    return serialize(id, async () => {
      if (typeof on !== 'boolean') throw new Error('Favorite must be true or false.');
      await source(id, name);
      const names = await favorites(id);
      if (on) names.add(name); else names.delete(name);
      await saveFavorites(id, names);
      return { name, favorite: on };
    });
  }
  function remove(id, name) {
    return serialize(id, async () => {
      const shot = await source(id, name);
      const names = await favorites(id);
      if (names.delete(name)) await saveFavorites(id, names);
      await folder(id);
      if (!sameFile(shot.stat, await fs.lstat(shot.file))) throw new Error('Screenshot changed. Refresh before deleting.');
      await fs.unlink(shot.file);
      return { removed: true };
    });
  }
  async function bytes(id, name) { return (await source(id, name)).bytes; }
  async function copy(id, name) {
    if (!nativeImage || !clipboard) throw new Error('Image clipboard is unavailable.');
    const image = nativeImage.createFromBuffer(await bytes(id, name));
    if (image.isEmpty()) throw new Error('Screenshot could not be decoded.');
    clipboard.writeImage(image);
    return { copied: true };
  }
  // Main-only capability: never bind exportTo directly to a renderer channel.
  async function exportTo(id, name, destination) {
    const original = await bytes(id, name);
    if (typeof destination !== 'string' || !path.isAbsolute(destination) || !/\.png$/i.test(destination)) throw new Error('Choose a PNG destination in the Save dialog.');
    const handle = await fs.open(destination, 'wx');
    try { await handle.writeFile(original); }
    finally { await handle.close(); }
    return { exported: true };
  }
  async function exportWithDialog(id, name, chooseDestination) {
    await source(id, name);
    const choice = await chooseDestination({ title: 'Export screenshot', defaultPath: name, filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (choice.canceled || !choice.filePath) return { exported: false };
    return exportTo(id, name, choice.filePath);
  }
  return { list, favorite, remove, bytes, copy, exportTo, exportWithDialog };
}

module.exports = { createScreenshots, inspectPNG, MAX_BYTES, MAX_PIXELS };
