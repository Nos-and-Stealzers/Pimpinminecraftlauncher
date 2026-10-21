const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { CHARACTERS, skin } = require('./wardrobe-art');

const MAX_BYTES = 256 * 1024;
const MAX_IMPORTS = 64;
const IMPORT_ID = /^import-[a-f0-9]{32}$/;
const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const CRC = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Decode scanlines, including Adam7, rather than trusting a PNG-looking header.
function decodeSkinPNG(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES || bytes.length < 57 || !bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('Choose a PNG skin up to 256 KB.');
  let offset = 8, width, height, depth, color, interlace, palette, transparency;
  let ended = false, sawIDAT = false, closedIDAT = false;
  const chunks = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('Truncated PNG chunk.');
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('Truncated PNG chunk.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, end - 4);
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error('Corrupt PNG checksum.');
    if (offset === 8 && type !== 'IHDR') throw new Error('Missing PNG header.');
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) throw new Error('Invalid PNG header.');
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]; color = body[9]; interlace = body[12];
      if (width !== 64 || ![32, 64].includes(height)) throw new Error('Skin must be 64 x 64 or 64 x 32 pixels.');
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(depth) || body[10] !== 0 || body[11] !== 0 || interlace > 1) throw new Error('Unsupported PNG encoding.');
    } else if (type === 'PLTE') {
      if (palette || sawIDAT || transparency || length === 0 || length % 3 || length > 768 || (color === 3 && length / 3 > (1 << depth)) || [0, 4].includes(color)) throw new Error('Invalid PNG palette.');
      palette = body;
    } else if (type === 'tRNS') {
      if (transparency || sawIDAT || (color === 3 ? !palette || length === 0 || length > palette.length / 3 : color === 0 ? length !== 2 : color === 2 ? length !== 6 : true)) throw new Error('Invalid PNG transparency.');
      transparency = body;
    } else if (type === 'IDAT') {
      if (closedIDAT || (color === 3 && !palette)) throw new Error('Invalid PNG image data.');
      sawIDAT = true; chunks.push(body);
    } else if (type === 'IEND') {
      if (length || !sawIDAT || end !== bytes.length) throw new Error('Invalid PNG end.');
      ended = true; break;
    } else {
      if (sawIDAT) closedIDAT = true;
      if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw new Error('Animated skins are not supported.');
      if (type[0] === type[0].toUpperCase()) throw new Error('Unknown critical PNG chunk.');
    }
    offset = end;
  }
  if (!ended) throw new Error('Incomplete PNG.');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  const bits = channels * depth, stride = Math.max(1, Math.ceil(bits / 8));
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const layout = passes.map(([x, y, dx, dy]) => ({ x, y, dx, dy, w: Math.ceil((width - x) / dx), h: Math.ceil((height - y) / dy) }));
  const expected = layout.reduce((sum, p) => sum + p.h * (1 + Math.ceil(p.w * bits / 8)), 0);
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(chunks), { maxOutputLength: expected }); }
  catch { throw new Error('PNG image data could not be decoded.'); }
  if (raw.length !== expected) throw new Error('Incomplete PNG image data.');
  const pixels = Buffer.alloc(width * height * 4);
  let cursor = 0;
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
      const row = Buffer.from(raw.subarray(cursor, cursor + rowBytes)); cursor += rowBytes;
      for (let i = 0; i < row.length; i++) {
        const a = i >= stride ? row[i - stride] : 0, b = previous[i], c = i >= stride ? previous[i - stride] : 0;
        row[i] = (row[i] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) & 255;
      }
      const sample = (index) => depth === 16 ? row.readUInt16BE(index * 2) : depth === 8 ? row[index] : ((row[Math.floor(index * depth / 8)] >> (8 - depth - index * depth % 8)) & ((1 << depth) - 1));
      const scaled = (index) => Math.round(sample(index) * 255 / (depth === 16 ? 65535 : (1 << depth) - 1));
      for (let x = 0; x < pass.w; x++) {
        const i = ((pass.y + y * pass.dy) * width + pass.x + x * pass.dx) * 4;
        const s = x * channels;
        let rgba;
        if (color === 3) {
          const index = sample(s);
          if (index * 3 >= palette.length) throw new Error('Invalid PNG palette index.');
          rgba = [...palette.subarray(index * 3, index * 3 + 3), transparency?.[index] ?? 255];
        } else if (color === 0 || color === 4) {
          const gray = scaled(s);
          rgba = [gray, gray, gray, color === 4 ? scaled(s + 1) : transparency && sample(s) === transparency.readUInt16BE(0) ? 0 : 255];
        } else {
          const transparent = transparency && [0, 1, 2].every((channel) => sample(s + channel) === transparency.readUInt16BE(channel * 2));
          rgba = [scaled(s), scaled(s + 1), scaled(s + 2), color === 6 ? scaled(s + 3) : transparent ? 0 : 255];
        }
        pixels.set(rgba, i);
      }
      previous = row;
    }
  }
  return { width, height, pixels };
}

function inputBytes(input) {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === 'string' && input.length <= MAX_BYTES * 1.4 + 32 && /^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(input)) return Buffer.from(input.slice(22), 'base64');
  throw new Error('Choose a PNG skin up to 256 KB.');
}
function modelName(model) {
  if (!['classic', 'slim'].includes(model)) throw new Error('Choose classic or slim arms.');
  return model;
}
function displayName(name) {
  const cleaned = String(name || 'Imported skin').replace(/\.png$/i, '').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').replace(/^\.+|\.+$/g, '').trim().slice(0, 64);
  return cleaned || 'Imported skin';
}
const dataUrl = (bytes) => `data:image/png;base64,${bytes.toString('base64')}`;

function createWardrobe(root) {
  const folder = path.join(root, 'wardrobe');
  const imports = path.join(folder, 'imports');
  const indexFile = path.join(folder, 'wardrobe.json');
  let queue = Promise.resolve();
  const serialize = (fn) => {
    const operation = queue.then(fn);
    queue = operation.catch(() => {});
    return operation;
  };
  const importedPath = (id) => {
    if (!IMPORT_ID.test(id)) throw new Error('Invalid imported skin ID.');
    return path.join(imports, `${id}.png`);
  };
  async function load() {
    try {
      const index = JSON.parse(await fs.readFile(indexFile, 'utf8'));
      return { imports: Array.isArray(index.imports) ? index.imports.filter((entry) => IMPORT_ID.test(entry.id)).slice(0, MAX_IMPORTS) : [], selected: index.selected };
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return { imports: [], selected: null };
      throw error;
    }
  }
  async function save(index) {
    await fs.mkdir(imports, { recursive: true });
    const temporary = `${indexFile}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(index, null, 2), { flag: 'wx' }); await fs.rename(temporary, indexFile); }
    finally { await fs.rm(temporary, { force: true }); }
  }
  async function resolve(id, index) {
    const character = CHARACTERS.find((entry) => `builtin-${entry.id}` === id);
    if (character) return { ...character, id, imported: false, height: 64, bytes: skin(character.id).toPNG() };
    const entry = index.imports.find((record) => record.id === id);
    if (!entry) throw new Error('Skin not found.');
    const file = importedPath(id);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error('Invalid imported skin file.');
    const bytes = await fs.readFile(file);
    const { height } = decodeSkinPNG(bytes);
    return { id, name: displayName(entry.name), model: height === 32 ? 'classic' : modelName(entry.model), imported: true, height, description: 'Your imported skin. Stored separately from resource packs.', bytes };
  }
  const publicSkin = ({ bytes, ...entry }) => ({ ...entry, dataUrl: dataUrl(bytes) });
  async function listInner(index) {
    const skins = [];
    for (const id of [...CHARACTERS.map((entry) => `builtin-${entry.id}`), ...index.imports.map((entry) => entry.id)]) {
      try { skins.push(publicSkin(await resolve(id, index))); }
      catch (error) { if (!IMPORT_ID.test(id)) throw error; }
    }
    const chosen = skins.find((entry) => entry.id === index.selected?.id) || skins[0];
    const model = chosen.height === 32 ? 'classic' : ['classic', 'slim'].includes(index.selected?.model) && chosen.id === index.selected?.id ? index.selected.model : chosen.model;
    return { skins, selected: { id: chosen.id, model } };
  }
  return {
    listSkins: () => serialize(async () => listInner(await load())),
    selectSkin: ({ id, model } = {}) => serialize(async () => {
      const index = await load(), entry = await resolve(id, index);
      model = modelName(model || entry.model);
      if (entry.height === 32 && model !== 'classic') throw new Error('Legacy skins use classic arms.');
      index.selected = { id: entry.id, model };
      await save(index);
      return listInner(index);
    }),
    importSkin: ({ name, bytes, dataUrl: url, model = 'classic' } = {}) => serialize(async () => {
      const png = inputBytes(bytes || url), decoded = decodeSkinPNG(png);
      model = modelName(model);
      if (decoded.height === 32) model = 'classic';
      const index = await load();
      if (index.imports.length >= MAX_IMPORTS) throw new Error('Your wardrobe has 64 imports. Remove one before importing another.');
      const entry = { id: `import-${crypto.randomBytes(16).toString('hex')}`, name: displayName(name), model };
      await fs.mkdir(imports, { recursive: true });
      const file = importedPath(entry.id);
      await fs.writeFile(file, png, { flag: 'wx' });
      index.imports.push(entry); index.selected = { id: entry.id, model };
      try { await save(index); } catch (error) { await fs.rm(file, { force: true }); throw error; }
      return listInner(index);
    }),
    deleteSkin: ({ id } = {}) => serialize(async () => {
      const file = importedPath(id);
      const index = await load();
      if (!index.imports.some((entry) => entry.id === id)) throw new Error('Imported skin not found.');
      index.imports = index.imports.filter((entry) => entry.id !== id);
      if (index.selected?.id === id) index.selected = null;
      await save(index);
      await fs.rm(file, { force: true });
      return listInner(index);
    }),
    exportSkin: ({ id } = {}) => serialize(async () => {
      const entry = await resolve(id, await load());
      const filename = displayName(entry.name).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'skin';
      return { name: `${filename}.png`, dataUrl: dataUrl(entry.bytes) };
    }),
  };
}

let defaultWardrobe;
const service = () => defaultWardrobe ||= createWardrobe(require('./store').dirs.root);
module.exports = { createWardrobe, decodeSkinPNG, MAX_BYTES, MAX_IMPORTS };
for (const method of ['listSkins', 'selectSkin', 'importSkin', 'deleteSkin', 'exportSkin']) module.exports[method] = (...args) => service()[method](...args);
