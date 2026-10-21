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

// `name` is optional: without it this resolves the folder itself.
function resolve(dir, sub, name) {
  return name === undefined ? safeJoin(dir, sub || '.') : safeJoin(dir, sub || '.', name);
}

// Launcher metadata in the top folder. Checked on the resolved path so a sub
// like '.' or 'mods/..' can't sneak past, and case-insensitively for Windows.
function isProtected(dir, sub, name) {
  return PROTECTED.has(String(name).toLowerCase()) && resolve(dir, sub) === path.resolve(dir);
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
    const image = !isDir && IMAGE_EXT.has(ext);
    out.push({
      name: e.name,
      dir: isDir,
      size: isDir ? 0 : st.size,
      mtime: st.mtimeMs,
      ext,
      text: !isDir && TEXT_EXT.has(ext) && st.size <= MAX_TEXT,
      image,
      url: image ? pathToFileURL(full).href : null,
      protected: isProtected(dir, sub, e.name),
    });
  }
  // folders first, then natural order so "world 2" sorts before "world 10"
  out.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
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
  if (isProtected(dir, sub, name)) throw new Error('This file is managed by Pimpin.');
  const file = resolve(dir, sub, checkName(name));
  await fsp.writeFile(file, String(text ?? ''));
}

async function remove(dir, sub, name) {
  if (isProtected(dir, sub, name)) throw new Error('This file is managed by Pimpin and cannot be deleted.');
  const target = resolve(dir, sub, checkName(name));
  if (target === path.resolve(dir)) throw new Error('Invalid path');
  await fsp.rm(target, { recursive: true, force: true });
}

async function rename(dir, sub, from, to) {
  if (isProtected(dir, sub, from) || isProtected(dir, sub, to)) throw new Error('This file is managed by Pimpin.');
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

// Copy files/folders from anywhere on the PC into the browsed folder.
// Name clashes get a " (2)" suffix instead of overwriting.
async function importPaths(dir, sub, paths) {
  const folder = resolve(dir, sub);
  await fsp.mkdir(folder, { recursive: true });
  const added = [];
  for (const src of paths || []) {
    if (typeof src !== 'string' || !path.isAbsolute(src)) continue;
    const st = await fsp.stat(src).catch(() => null);
    if (!st) continue;
    // Never copy a folder into itself. relative() gives an absolute path when
    // the two are on different drives, which is fine to copy.
    const rel = path.relative(src, folder);
    if (st.isDirectory() && !rel.startsWith('..') && !path.isAbsolute(rel)) continue;
    const name = freeName(folder, path.basename(src));
    await fsp.cp(src, path.join(folder, name), { recursive: true, errorOnExist: false });
    added.push(name);
  }
  return added;
}

// For the summary line under the file list. Unreadable bits are skipped.
async function folderSize(dir, sub) {
  let bytes = 0;
  let files = 0;
  const walk = async (folder) => {
    for (const e of await fsp.readdir(folder, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(folder, e.name);
      if (e.isDirectory()) {
        await walk(full);
        continue;
      }
      files++;
      const st = await fsp.stat(full).catch(() => null);
      if (st) bytes += st.size;
    }
  };
  await walk(resolve(dir, sub));
  return { bytes, files };
}

module.exports = { list, read, write, remove, rename, mkdir, importPaths, folderSize, resolve };
