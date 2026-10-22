const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { createWardrobe, decodeSkinPNG, MAX_BYTES, MAX_IMPORTS } = require('../src/main/wardrobe');
const { CHARACTERS, skin } = require('../src/main/wardrobe-art');
const { Image } = require('../src/main/png');

function chunk(type, body) {
  const label = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([label, body])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, label, body, checksum]);
}
function fixture({ width = 64, height = 64, depth = 8, color = 6, interlace = 0, filter = 0, raw, extra = [] } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = depth; header[9] = color; header[12] = interlace;
  if (!raw) {
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
    const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
    const scanlines = [];
    for (const [x, y, dx, dy] of passes) {
      const count = Math.ceil((width - x) / dx), rows = Math.ceil((height - y) / dy);
      for (let row = 0; row < rows; row++) scanlines.push(Buffer.concat([Buffer.from([filter]), Buffer.alloc(Math.ceil(count * channels * depth / 8))]));
    }
    raw = Buffer.concat(scanlines);
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), ...extra, chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function main() {
  const scratch = process.env.TMPDIR || path.join(os.homedir(), 'AppData/Local/hermes/cache/scratch');
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, 'wardrobe-test-'));
  let checks = 0;
  const check = (fn) => { fn(); checks++; };
  const rejects = async (promise, pattern) => { await assert.rejects(promise, pattern); checks++; };
  try {
    const service = createWardrobe(root);
    const initial = await service.listSkins();
    check(() => assert.equal(initial.skins.length, 6));
    check(() => assert.equal(initial.selected.id, 'builtin-explorer'));
    check(() => assert.equal(new Set(initial.skins.map((entry) => entry.dataUrl)).size, 6));
    for (const c of CHARACTERS) {
      const image = skin(c.id), decoded = decodeSkinPNG(image.toPNG());
      check(() => assert.deepEqual(decoded.pixels, Buffer.from(image.data)));
      const aw = c.model === 'slim' ? 3 : 4;
      check(() => assert.equal(image.get(44 + aw - 1, 20)[3], 255));
      if (aw === 3) check(() => assert.equal(image.get(54, 20)[3], 0));
    }
    for (const color of [0, 2, 3, 4, 6]) for (const interlace of [0, 1]) {
      const extra = color === 3 ? [chunk('PLTE', Buffer.from([24, 55, 79])), chunk('tRNS', Buffer.from([0]))] : [];
      const decoded = decodeSkinPNG(fixture({ color, interlace, extra }));
      check(() => assert.equal(decoded.pixels.length, 64 * 64 * 4));
      if (color === 3) check(() => assert.deepEqual([...decoded.pixels.subarray(0, 4)], [24, 55, 79, 0]));
    }
    for (const filter of [1, 2, 3, 4]) check(() => assert.equal(decodeSkinPNG(fixture({ filter })).height, 64));
    for (const depth of [1, 2, 4, 16]) check(() => assert.equal(decodeSkinPNG(fixture({ depth, color: 0 })).height, 64));
    check(() => assert.equal(decodeSkinPNG(fixture({ depth: 16 })).height, 64));
    const original = skin('ranger').toPNG();
    const imported = await service.importSkin({ name: '../../escape\\NUL<>.png', bytes: original, model: 'slim' });
    const id = imported.selected.id;
    check(() => assert.match(id, /^import-[a-f0-9]{32}$/));
    check(() => assert.equal(imported.selected.model, 'slim'));
    check(() => assert.equal(imported.skins.length, 7));
    const exported = await service.exportSkin({ id });
    check(() => assert.deepEqual(Buffer.from(exported.dataUrl.slice(22), 'base64'), original));
    check(() => assert.equal(path.basename(exported.name), exported.name));
    await service.selectSkin({ id, model: 'classic' });
    const reloaded = await createWardrobe(root).listSkins();
    check(() => assert.deepEqual(reloaded.selected, { id, model: 'classic' }));
    const legacy = new Image(64, 32).toPNG();
    const legacyImport = await service.importSkin({ name: 'Legacy', dataUrl: `data:image/png;base64,${legacy.toString('base64')}`, model: 'slim' });
    check(() => assert.equal(legacyImport.selected.model, 'classic'));
    await rejects(service.selectSkin({ id: legacyImport.selected.id, model: 'slim' }), /Legacy/);
    await rejects(service.importSkin({ bytes: new Image(32, 64).toPNG() }), /64 x 64/);
    await rejects(service.importSkin({ bytes: original.subarray(0, 48) }), /PNG/);
    const corrupt = Buffer.from(original); corrupt[50] ^= 1;
    await rejects(service.importSkin({ bytes: corrupt }), /checksum/);
    await rejects(service.importSkin({ bytes: fixture({ filter: 5 }) }), /filter/);
    await rejects(service.importSkin({ bytes: fixture({ raw: Buffer.alloc(100) }) }), /Incomplete/);
    await rejects(service.importSkin({ bytes: Buffer.alloc(MAX_BYTES + 1) }), /256 KB/);
    await rejects(service.importSkin({ dataUrl: 'data:image/png;base64,not-a-png' }), /PNG/);
    await rejects(service.importSkin({ bytes: Buffer.from('not a png') }), /PNG/);
    await rejects(service.importSkin({ bytes: original, model: 'evil' }), /classic or slim/);
    for (const unsafe of ['../escape', '../../accounts.json', 'import-../../escape', 'C:\\escape', id + '/../escape']) {
      await rejects(service.exportSkin({ id: unsafe }), /not found/);
      await rejects(service.deleteSkin({ id: unsafe }), /Invalid/);
      await rejects(service.selectSkin({ id: unsafe }), /not found/);
    }
    await rejects(service.deleteSkin({ id: 'builtin-explorer' }), /Invalid/);
    const remaining = await service.deleteSkin({ id });
    check(() => assert.equal(remaining.skins.some((entry) => entry.id === id), false));
    await rejects(fs.stat(path.join(root, 'wardrobe', 'imports', `${id}.png`)), /ENOENT/);
    await service.selectSkin({ id: legacyImport.selected.id });
    const fallback = await service.deleteSkin({ id: legacyImport.selected.id });
    check(() => assert.equal(fallback.selected.id, 'builtin-explorer'));
    const parallel = await Promise.all([service.importSkin({ bytes: original, name: 'One' }), service.importSkin({ bytes: original, name: 'Two' })]);
    check(() => assert.notEqual(parallel[0].selected.id, parallel[1].selected.id));
    const afterParallel = await createWardrobe(root).listSkins();
    check(() => assert.equal(afterParallel.skins.length, 8));
    const indexFile = path.join(root, 'wardrobe', 'wardrobe.json');
    const index = JSON.parse(await fs.readFile(indexFile));
    index.imports = Array.from({ length: MAX_IMPORTS }, (_, i) => ({ ...index.imports[0], id: `import-${i.toString(16).padStart(32, '0')}` }));
    await fs.writeFile(indexFile, JSON.stringify(index));
    await rejects(service.importSkin({ bytes: original }), /64 imports/);
    console.log(`Wardrobe: ${checks} assertions passed (decode, originals, import, persistence, export, traversal, delete, concurrency, limits).`);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
