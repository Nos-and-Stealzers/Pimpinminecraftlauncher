const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { createHash } = require('crypto');
const zlib = require('zlib');
const { createScreenshots, inspectPNG, MAX_BYTES } = require('../src/main/screenshots');
const { png, chunk } = require('./screenshots-fixtures');

async function fixture(t) {
  assert.ok(process.env.TMPDIR, 'TMPDIR scratch is required; never fall back to real instance data');
  const root = await fs.mkdtemp(path.join(process.env.TMPDIR, 'screenshots-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const instancesRoot = path.join(root, 'instances');
  const shots = path.join(instancesRoot, 'one', 'screenshots');
  await fs.mkdir(shots, { recursive: true });
  await fs.mkdir(path.join(instancesRoot, 'two'), { recursive: true });
  const original = png(32, 18);
  await fs.writeFile(path.join(shots, 'first.png'), original);
  await fs.writeFile(path.join(shots, 'second.PNG'), png(16, 9, 1));
  await fs.utimes(path.join(shots, 'first.png'), 1000, 1000);
  await fs.utimes(path.join(shots, 'second.PNG'), 2000, 2000);
  const manager = createScreenshots({ instancesRoot });
  return { root, instancesRoot, shots, original, manager };
}

test('valid PNG dimensions and newest order, original bytes unchanged by reads/favorites/export', async (t) => {
  const { root, instancesRoot, shots, original, manager } = await fixture(t);
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const listing = await manager.list('one');
  assert.deepEqual(listing.screenshots.map((shot) => shot.name), ['second.PNG', 'first.png']);
  assert.deepEqual(inspectPNG(original), { width: 32, height: 18 });
  assert.equal(listing.screenshots[1].size, original.length);
  assert.equal(listing.screenshots[1].time, 1000000);
  await Promise.all([manager.favorite('one', 'first.png', true), manager.favorite('one', 'second.PNG', true)]);
  assert.equal((await createScreenshots({ instancesRoot }).list('one')).screenshots.filter((shot) => shot.favorite).length, 2);
  await manager.favorite('one', 'second.PNG', false);
  assert.equal((await manager.list('one')).screenshots[0].favorite, false);
  assert.deepEqual(await manager.list('two'), { screenshots: [], skipped: 0 });
  assert.deepEqual(await manager.bytes('one', 'first.png'), original);
  const exported = path.join(root, 'export.png');
  assert.deepEqual(await manager.exportTo('one', 'first.png', exported), { exported: true });
  assert.deepEqual(await fs.readFile(exported), original);
  await assert.rejects(manager.exportTo('one', 'first.png', exported), { code: 'EEXIST' });
  await assert.rejects(manager.exportTo('one', 'first.png', path.join(shots, 'first.png')), { code: 'EEXIST' });
  assert.equal(hash(await fs.readFile(path.join(shots, 'first.png'))), hash(original));
  assert.equal((await fs.stat(path.join(shots, 'first.png'))).mtimeMs, 1000000);
  assert.deepEqual((await fs.readdir(shots)).sort(), ['first.png', 'second.PNG']);
});

test('export dialog cancellation, exact options, no renderer destination and exclusive writes', async (t) => {
  const { root, manager, original } = await fixture(t);
  assert.deepEqual(await manager.exportWithDialog('one', 'first.png', async (options) => {
    assert.equal(options.defaultPath, 'first.png');
    assert.deepEqual(options.filters, [{ name: 'PNG image', extensions: ['png'] }]);
    return { canceled: true };
  }), { exported: false });
  const destination = path.join(root, 'from-dialog.png');
  assert.deepEqual(await manager.exportWithDialog('one', 'first.png', async () => ({ canceled: false, filePath: destination })), { exported: true });
  assert.deepEqual(await fs.readFile(destination), original);
  await assert.rejects(manager.exportTo('one', 'first.png', 'relative.png'), /destination/);
  await assert.rejects(manager.exportTo('one', 'first.png', path.join(root, 'bad.jpg')), /destination/);
});

test('copy passes PNG pixels through nativeImage and writeImage, not text', async (t) => {
  const { instancesRoot, original } = await fixture(t);
  let written;
  const image = { isEmpty: () => false };
  const manager = createScreenshots({ instancesRoot, nativeImage: { createFromBuffer(bytes) { assert.deepEqual(bytes, original); return image; } }, clipboard: { writeImage(value) { written = value; } } });
  assert.deepEqual(await manager.copy('one', 'first.png'), { copied: true });
  assert.equal(written, image);
  await assert.rejects(createScreenshots({ instancesRoot }).copy('one', 'first.png'), /unavailable/);
  const broken = createScreenshots({ instancesRoot, nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) }, clipboard: { writeImage() { assert.fail('invalid image copied'); } } });
  await assert.rejects(broken.copy('one', 'first.png'), /decoded/);
});

test('traversal, ADS, absolute paths, controls and invalid argument types reject', async (t) => {
  const { manager } = await fixture(t);
  for (const name of ['../first.png', '..\\first.png', '/first.png', 'C:\\first.png', 'first.png:secret', 'nul.png', '.png/evil', 'first.png\0', 'first.png ', 42, null, 'first.jpg']) {
    await assert.rejects(manager.bytes('one', name));
    await assert.rejects(manager.remove('one', name));
  }
  for (const id of ['..', '../one', 'one/..', 'one\\..', 'C:one', null]) await assert.rejects(manager.list(id));
  await assert.rejects(manager.favorite('one', 'first.png', 'true'), /true or false/);
});

test('invalid, corrupt, truncated, oversized, fake-header and invalid scanline PNGs are skipped and never modified', async (t) => {
  const { manager, shots, original } = await fixture(t);
  const badCRC = Buffer.from(original); badCRC[badCRC.length - 1] ^= 1;
  const header = Buffer.alloc(13); header.writeUInt32BE(99999); header.writeUInt32BE(99999, 4); header[8] = 8; header[9] = 2;
  const tooLarge = Buffer.concat([original.subarray(0, 8), chunk('IHDR', header), original.subarray(33)]);
  const invalid = { 'text.png': Buffer.from('not png'), 'header.png': original.subarray(0, 33), 'truncated.png': original.subarray(0, -3), 'crc.png': badCRC, 'filter.png': png(4, 4, 0, { badFilter: true }), 'deflate.png': png(4, 4, 0, { badDeflate: true }), 'dimensions.png': tooLarge };
  for (const [name, bytes] of Object.entries(invalid)) await fs.writeFile(path.join(shots, name), bytes);
  const huge = await fs.open(path.join(shots, 'huge.png'), 'w'); await huge.truncate(MAX_BYTES + 1); await huge.close();
  await fs.mkdir(path.join(shots, 'directory.png'));
  assert.equal((await manager.list('one')).skipped, Object.keys(invalid).length + 2);
  for (const [name, bytes] of Object.entries(invalid)) {
    await assert.rejects(manager.bytes('one', name));
    await assert.rejects(manager.remove('one', name));
    assert.deepEqual(await fs.readFile(path.join(shots, name)), bytes);
  }
});

test('explicit single delete removes only the selected PNG and its favorite', async (t) => {
  const { manager, shots, instancesRoot } = await fixture(t);
  await manager.favorite('one', 'first.png', true);
  await manager.favorite('one', 'second.PNG', true);
  assert.deepEqual(await manager.remove('one', 'first.png'), { removed: true });
  assert.deepEqual(await fs.readdir(shots), ['second.PNG']);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(instancesRoot, 'one', '.pimpin-screenshot-favorites.json'), 'utf8')), ['second.PNG']);
  await assert.rejects(manager.remove('one', 'first.png'), { code: 'ENOENT' });
});

test('symlinks, junctions and hardlinks cannot leak or delete external images', async (t) => {
  const { root, instancesRoot, manager, shots, original } = await fixture(t);
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  const external = path.join(outside, 'external.png'); await fs.writeFile(external, original);
  await fs.link(external, path.join(shots, 'hardlink.png'));
  await assert.rejects(manager.bytes('one', 'hardlink.png'), /Unsafe/);
  await assert.rejects(manager.remove('one', 'hardlink.png'), /Unsafe/);
  let fileSymlink = true;
  try { await fs.symlink(external, path.join(shots, 'link.png'), 'file'); }
  catch (error) { if (error.code !== 'EPERM') throw error; fileSymlink = false; t.diagnostic('Windows denied file symlink creation; junction and hardlink guards still exercised.'); }
  if (fileSymlink) {
    await assert.rejects(manager.bytes('one', 'link.png'), /Unsafe/);
    await assert.rejects(manager.remove('one', 'link.png'), /Unsafe/);
  }
  await fs.symlink(outside, path.join(instancesRoot, 'linked'), 'junction');
  await assert.rejects(manager.list('linked'), /symbolic links or junctions/);
  await fs.mkdir(path.join(instancesRoot, 'three'));
  await fs.symlink(outside, path.join(instancesRoot, 'three', 'screenshots'), 'junction');
  await assert.rejects(manager.list('three'), /symbolic links or junctions/);
  await assert.rejects(manager.remove('three', 'external.png'), /symbolic links or junctions/);
  assert.deepEqual(await fs.readFile(external), original);
});

test('Adam7 and palette PNGs validate while invalid palette samples and oversized decode reject', () => {
  function assemble(width, height, depth, color, interlace, raw, palette) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
    header[8] = depth; header[9] = color; header[12] = interlace;
    return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
      ...(palette ? [chunk('PLTE', palette)] : []), chunk('IDAT', zlib.deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]);
  }
  assert.deepEqual(inspectPNG(assemble(1, 1, 8, 2, 1, [0, 10, 20, 30])), { width: 1, height: 1 });
  assert.deepEqual(inspectPNG(assemble(2, 1, 1, 3, 0, [0, 64], Buffer.from([0, 0, 0, 255, 255, 255]))), { width: 2, height: 1 });
  assert.throws(() => inspectPNG(assemble(2, 1, 1, 3, 0, [0, 64], Buffer.from([0, 0, 0]))), /palette index/);
  assert.throws(() => inspectPNG(assemble(32768, 2048, 16, 6, 0, [0])), /memory limit/);
});

test('favorites metadata hardlink is rejected without changing target', async (t) => {
  const { root, instancesRoot, manager } = await fixture(t);
  const external = path.join(root, 'favorites.json'); await fs.writeFile(external, '[]');
  await fs.link(external, path.join(instancesRoot, 'one', '.pimpin-screenshot-favorites.json'));
  await assert.rejects(manager.favorite('one', 'first.png', true), /Unsafe/);
  assert.equal(await fs.readFile(external, 'utf8'), '[]');
});
