// Built-in file browser for instance and server folders: list, view and edit
// config files, rename, delete, make folders and import files from the PC.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
const { safeJoin } = require('./store');

const TEXT_EXT = new Set(['txt', 'json', 'json5', 'jsonc', 'properties', 'toml', 'yml', 'yaml', 'cfg', 'conf', 'ini', 'log', 'md', 'mcmeta', 'csv', 'snbt', 'lang', 'xml', 'sk', 'js', 'zs', 'options', 'secret']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const PROTECTED = new Set(['pimpin-instance.json', 'pimpin-server.json']);
const MAX_TEXT = 2 * 1024 * 1024;

const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const isText = (name) => TEXT_EXT.has(extOf(name)) || name === 'eula.txt' || name === 'options.txt';

function resolve(dir, sub = '', name) {
  return name === undefined ? safeJoin(dir, sub || '.') : safeJoin(dir, sub || '.', name);
}

function checkName(name) {
  if (!name || /[\\/:*?"<>|\0]/.test(name) || name === '.' || name === '..') throw new Error('That name is not allowed');
  return name;
}

async function list(dir, sub = '') {
  const folder = resolve(dir, sub);
  const entries = await fsp.readdir(folder, { withFileTypes: true }).catch((err) => {
    if (err.code === 'ENOENT') return [];
    throw err;
  });
  const out = [];
  for (const e of entries) {
    if (e.name.endsWith('.part')) continue;
    const full = path.join(folder, e.name);
    let st;
    try {
      st = await fsp.stat(full);
    } catch {
      continue; // broken link / removed meanwhile
    }
    const isDir = st.isDirectory();
    const ext = isDir ? '' : extOf(e.name);
    out.push({
      name: e.name,
      dir: isDir,
      size: isDir ? 0 : st.size,
      mtime: st.mtimeMs,
      ext,
      text: !isDir && isText(e.name) && st.size <= MAX_TEXT,
      image: !isDir && IMAGE_EXT.has(ext),
      url: !isDir && IMAGE_EXT.has(ext) ? pathToFileURL(full).href : null,
      protected: !sub && PROTECTED.has(e.name),
    });
  }
  out.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.dir ? -1 : 1));
  return { path: sub || '', entries: out };
}

async function read(dir, sub, name) {
  const file = resolve(dir, sub, name);
  const st = await fsp.stat(file);
  if (st.size > MAX_TEXT) throw new Error('This file is too big to open here. Use "Show in folder" instead.');
  const text = await fsp.readFile(file, 'utf8');
  if (text.includes('\0')) throw new Error('This is not a text file.');
  return text;
}

async function write(dir, sub, name, text) {
  if (!sub && PROTECTED.has(name)) throw new Error('This file is managed by Pimpin.');
  const file = resolve(dir, sub, checkName(name));
  await fsp.writeFile(file, String(text ?? ''));
}

async function remove(dir, sub, name) {
  if (!sub && PROTECTED.has(name)) throw new Error('This file is managed by Pimpin and cannot be deleted.');
  const target = resolve(dir, sub, checkName(name));
  if (target === path.resolve(dir)) throw new Error('Invalid path');
  await fsp.rm(target, { recursive: true, force: true });
}

async function rename(dir, sub, from, to) {
  if (!sub && (PROTECTED.has(from) || PROTECTED.has(to))) throw new Error('This file is managed by Pimpin.');
  const src = resolve(dir, sub, checkName(from));
  const dest = resolve(dir, sub, checkName(to));
  if (fs.existsSync(dest)) throw new Error(`"${to}" already exists`);
  await fsp.rename(src, dest);
}

async function mkdir(dir, sub, name) {
  const target = resolve(dir, sub, checkName(name));
  if (fs.existsSync(target)) throw new Error(`"${name}" already exists`);
  await fsp.mkdir(target, { recursive: true });
}

function freeName(folder, name) {
  if (!fs.existsSync(path.join(folder, name))) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let n = 2;
  while (fs.existsSync(path.join(folder, `${base} (${n})${ext}`))) n++;
  return `${base} (${n})${ext}`;
}

/** Copy files/folders from anywhere on the PC into the browsed folder. */
async function importPaths(dir, sub, paths) {
  const folder = resolve(dir, sub);
  await fsp.mkdir(folder, { recursive: true });
  const added = [];
  for (const src of paths || []) {
    if (typeof src !== 'string' || !path.isAbsolute(src)) continue;
    const st = await fsp.stat(src).catch(() => null);
    if (!st) continue;
    // Never copy a folder into itself.
    if (st.isDirectory() && !path.relative(src, folder).startsWith('..')) continue;
    const name = freeName(folder, path.basename(src));
    await fsp.cp(src, path.join(folder, name), { recursive: true, errorOnExist: false });
    added.push(name);
  }
  return added;
}

/** Total size of a folder, used for the summary line. */
async function folderSize(dir, sub = '') {
  let total = 0;
  let count = 0;
  const walk = async (p) => {
    for (const e of await fsp.readdir(p, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        count++;
        total += (await fsp.stat(full).catch(() => ({ size: 0 }))).size;
      }
    }
  };
  await walk(resolve(dir, sub));
  return { bytes: total, files: count };
}

module.exports = { list, read, write, remove, rename, mkdir, importPaths, folderSize, resolve };
