// Networking helpers: JSON fetches with retries, verified file downloads and a
// small concurrency pool used for libraries / assets / mods.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const USER_AGENT = 'nos-and-stealzers/pimpin-launcher/0.1.0 (github.com/nos-and-stealzers/pimpinminecraftlauncher)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, opts = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': USER_AGENT, ...(opts.headers || {}) },
      });
      if (res.status === 429 || res.status >= 500) {
        throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { retry: true });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (err.retry === false) break;
      await sleep(500 * 2 ** i);
    }
  }
  throw lastErr;
}

async function getJson(url, opts) {
  const res = await request(url, opts);
  return res.json();
}

async function sha1File(file) {
  const hash = crypto.createHash('sha1');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function fileValid(file, { sha1, size } = {}) {
  try {
    const st = await fsp.stat(file);
    if (size && st.size !== size) return false;
    if (sha1) return (await sha1File(file)) === sha1;
    return st.size > 0;
  } catch {
    return false;
  }
}

/**
 * Download `url` to `dest`. Skips the download when the existing file already
 * matches the expected sha1/size. Writes to a temp file first so a crash never
 * leaves a half-written jar behind.
 */
async function download(url, dest, { sha1, size, onProgress, force = false } = {}) {
  if (!force && (await fileValid(dest, { sha1, size }))) return false;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.part`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await request(url);
      const total = Number(res.headers.get('content-length')) || size || 0;
      let received = 0;
      const body = Readable.fromWeb(res.body);
      if (onProgress) {
        body.on('data', (chunk) => {
          received += chunk.length;
          onProgress(received, total);
        });
      }
      await pipeline(body, fs.createWriteStream(tmp));
      if (sha1 && (await sha1File(tmp)) !== sha1) throw new Error(`Checksum mismatch for ${url}`);
      await fsp.rename(tmp, dest);
      return true;
    } catch (err) {
      await fsp.rm(tmp, { force: true });
      if (attempt === 2) throw err;
      await sleep(700 * (attempt + 1));
    }
  }
  return false;
}

/** Run `worker` over `items` with at most `limit` in flight. */
async function pool(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

module.exports = { USER_AGENT, request, getJson, download, pool, sha1File, fileValid };
