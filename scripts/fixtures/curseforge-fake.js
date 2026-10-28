// Fake CurseForge API + CDN for offline tests. Replaces global fetch, which is
// what src/main/net.js uses, so the real curseforge.js / content.js / net.js
// code paths run without any network access.
const crypto = require('node:crypto');

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const CDN = 'https://edge.forgecdn.test';

function mod(id, name, { classId = 6, allow = true, slug, latest = [] } = {}) {
  return {
    id,
    gameId: 432,
    name,
    slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    summary: `${name} summary`,
    downloadCount: id * 10,
    thumbsUpCount: id,
    classId,
    authors: [{ id: 1, name: 'Author' }],
    logo: { thumbnailUrl: `https://media.forgecdn.test/${id}.png`, url: `https://media.forgecdn.test/${id}-big.png` },
    categories: [{ id: 1, name: 'Utility' }],
    links: { websiteUrl: `https://www.curseforge.com/minecraft/mc-mods/${slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` },
    allowModDistribution: allow,
    latestFilesIndexes: latest,
    screenshots: [],
  };
}

function file(id, modId, fileName, { versions = ['1.21.4', 'Fabric'], release = 1, deps = [], bytes, url = true, date = '2026-01-01T00:00:00Z', available = true, badHash = false } = {}) {
  const data = bytes || Buffer.from(`jar ${fileName}`);
  return {
    id,
    gameId: 432,
    modId,
    isAvailable: available,
    displayName: fileName.replace(/\.jar$/, ''),
    fileName,
    releaseType: release,
    fileStatus: 4,
    hashes: [
      { value: 'd41d8cd98f00b204e9800998ecf8427e', algo: 2 },
      { value: badHash ? 'f'.repeat(40) : sha1(data), algo: 1 },
    ],
    fileDate: date,
    fileLength: data.length,
    downloadUrl: url ? `${CDN}/files/${id}/${encodeURIComponent(fileName)}` : null,
    gameVersions: versions,
    dependencies: deps.map(([m, r]) => ({ modId: m, relationType: r })),
    _bytes: data,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Install the fake. world: { mods: [mod], files: [file], description?: html, slowFile?: id }
 * Returns { calls, restore }.
 */
function installFakeFetch(world, { onDownload } = {}) {
  const calls = [];
  const real = global.fetch;
  global.fetch = async (input, opts = {}) => {
    const url = new URL(String(input));
    const method = (opts.method || 'GET').toUpperCase();
    calls.push({ url: url.href, method, headers: { ...(opts.headers || {}) }, body: opts.body || null });
    if (url.origin === CDN) {
      const id = Number(url.pathname.split('/')[2]);
      const f = world.files.find((x) => x.id === id);
      if (!f) return new Response('missing', { status: 404 });
      if (onDownload) {
        const r = await onDownload(f, opts);
        if (r) return r;
      }
      return new Response(f._bytes, { status: 200, headers: { 'Content-Length': String(f._bytes.length) } });
    }
    if (url.origin !== 'https://api.curseforge.com') throw new Error(`Unexpected network call ${url.href}`);
    if (!opts.headers?.['x-api-key']) return json({ error: 'no key' }, 403);
    const p = url.pathname;
    if (method === 'GET' && p === '/v1/mods/search') {
      return json({ data: world.mods.filter((m) => m.classId === Number(url.searchParams.get('classId'))), pagination: { index: 0, pageSize: 24, resultCount: 1, totalCount: 12345 } });
    }
    if (method === 'POST' && p === '/v1/mods') {
      const ids = JSON.parse(opts.body).modIds;
      return json({ data: world.mods.filter((m) => ids.includes(m.id)) });
    }
    if (method === 'POST' && p === '/v1/mods/files') {
      const ids = JSON.parse(opts.body).fileIds;
      return json({ data: world.files.filter((f) => ids.includes(f.id)).map(strip) });
    }
    let m;
    if ((m = p.match(/^\/v1\/mods\/(\d+)$/))) {
      const found = world.mods.find((x) => x.id === Number(m[1]));
      return found ? json({ data: found }) : json({ error: 'not found' }, 404);
    }
    if ((m = p.match(/^\/v1\/mods\/(\d+)\/description$/))) return json({ data: world.description || '<p>Hello <b>world</b></p><script>alert(1)</script>' });
    if ((m = p.match(/^\/v1\/mods\/(\d+)\/files$/))) {
      const gv = url.searchParams.get('gameVersion');
      const lt = url.searchParams.get('modLoaderType');
      const loaderName = { 4: 'Fabric', 5: 'Quilt' }[lt];
      const list = world.files.filter((f) => f.modId === Number(m[1]) && (!gv || f.gameVersions.includes(gv)) && (!loaderName || f.gameVersions.includes(loaderName)));
      return json({ data: list.map(strip), pagination: { index: 0, pageSize: 50, resultCount: list.length, totalCount: list.length } });
    }
    if ((m = p.match(/^\/v1\/mods\/(\d+)\/files\/(\d+)\/download-url$/))) {
      const f = world.files.find((x) => x.id === Number(m[2]));
      return json({ data: f?.downloadUrl || null });
    }
    if ((m = p.match(/^\/v1\/mods\/(\d+)\/files\/(\d+)$/))) {
      const f = world.files.find((x) => x.id === Number(m[2]) && x.modId === Number(m[1]));
      return f ? json({ data: strip(f) }) : json({ error: 'not found' }, 404);
    }
    return json({ error: `unhandled ${method} ${p}` }, 404);
  };
  return { calls, restore: () => { global.fetch = real; } };
}

function strip(f) {
  const { _bytes, ...rest } = f;
  return rest;
}

module.exports = { mod, file, installFakeFetch, sha1, CDN };
