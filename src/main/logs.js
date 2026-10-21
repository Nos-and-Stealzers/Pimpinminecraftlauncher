// Game log files on disk (logs/latest.log and the gzipped older ones) and
// sharing a log through mclo.gs, the paste site Prism and most modpack
// support channels use.
const fsp = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const { safeJoin } = require('./store');
const { request } = require('./net');

const gunzip = promisify(zlib.gunzip);
const MAX_LINES = 25000; // mclo.gs rejects anything longer

async function listLogs(dir) {
  const logsDir = path.join(dir, 'logs');
  const names = await fsp.readdir(logsDir).catch(() => []);
  const out = [];
  for (const name of names) {
    if (!/\.log(\.gz)?$/.test(name)) continue;
    const st = await fsp.stat(path.join(logsDir, name)).catch(() => null);
    if (st?.isFile()) out.push({ name, size: st.size, modified: st.mtimeMs });
  }
  // latest.log first, then newest archives
  return out.sort((a, b) => (a.name === 'latest.log' ? -1 : b.name === 'latest.log' ? 1 : b.modified - a.modified));
}

async function readLog(dir, name) {
  const file = safeJoin(path.join(dir, 'logs'), name);
  let buf = await fsp.readFile(file);
  if (name.endsWith('.gz')) buf = await gunzip(buf);
  return buf.toString('utf8').split(/\r?\n/);
}

async function upload(lines) {
  const text = (Array.isArray(lines) ? lines : String(lines).split('\n')).slice(-MAX_LINES).join('\n');
  if (!text.trim()) throw new Error('The log is empty.');
  const res = await request('https://api.mclo.gs/1/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ content: text }).toString(),
  }, 2);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'mclo.gs did not accept the log.');
  return { url: data.url, id: data.id };
}

module.exports = { listLogs, readLog, upload };
