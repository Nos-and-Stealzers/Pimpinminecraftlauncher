// Java runtime management. Downloads the exact runtime Mojang ships for a given
// Minecraft version (same as the official launcher), and falls back to
// Eclipse Temurin (Adoptium) on platforms Mojang does not cover, e.g. Linux ARM.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { getJson, download, pool } = require('./net');
const { dirs, readJson, writeJson } = require('./store');

const RUNTIME_INDEX =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

function mojangPlatform() {
  const { platform, arch } = process;
  if (platform === 'win32') return { x64: 'windows-x64', ia32: 'windows-x86', arm64: 'windows-arm64' }[arch];
  if (platform === 'linux') return { x64: 'linux', ia32: 'linux-i386' }[arch];
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  return undefined;
}

function javaBinary(home) {
  if (process.platform === 'win32') return path.join(home, 'bin', 'javaw.exe');
  if (process.platform === 'darwin' && fs.existsSync(path.join(home, 'jre.bundle'))) {
    return path.join(home, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  }
  return path.join(home, 'bin', 'java');
}

/** Console-attached java (for servers on Windows we want java.exe, not javaw.exe). */
function consoleJava(bin) {
  return process.platform === 'win32' ? bin.replace(/javaw\.exe$/i, 'java.exe') : bin;
}

async function installMojangRuntime(component, onProgress) {
  const platformKey = mojangPlatform();
  if (!platformKey) return null;
  const index = await getJson(RUNTIME_INDEX);
  const entry = index[platformKey]?.[component]?.[0];
  if (!entry) return null;

  const home = path.join(dirs.runtimes, component);
  const marker = path.join(home, '.pimpin-runtime.json');
  const existing = await readJson(marker, null);
  if (existing?.sha1 === entry.manifest.sha1 && fs.existsSync(javaBinary(home))) return javaBinary(home);

  const manifest = await getJson(entry.manifest.url);
  const files = Object.entries(manifest.files);
  for (const [rel, info] of files) {
    if (info.type === 'directory') await fsp.mkdir(path.join(home, rel), { recursive: true });
  }
  const downloads = files.filter(([, info]) => info.type === 'file');
  let done = 0;
  await pool(downloads, 12, async ([rel, info]) => {
    const dest = path.join(home, rel);
    const raw = info.downloads.raw;
    await download(raw.url, dest, { sha1: raw.sha1, size: raw.size });
    if (info.executable && process.platform !== 'win32') await fsp.chmod(dest, 0o755);
    onProgress?.({ stage: `Java ${entry.version.name}`, done: ++done, total: downloads.length });
  });
  if (process.platform !== 'win32') {
    for (const [rel, info] of files) {
      if (info.type !== 'link') continue;
      const linkPath = path.join(home, rel);
      await fsp.rm(linkPath, { force: true });
      await fsp.symlink(info.target, linkPath).catch(() => {});
    }
  }
  await writeJson(marker, { sha1: entry.manifest.sha1, version: entry.version.name });
  return javaBinary(home);
}

async function installAdoptium(major, onProgress) {
  const osName = { win32: 'windows', linux: 'linux', darwin: 'mac' }[process.platform];
  const arch = { x64: 'x64', arm64: 'aarch64', ia32: 'x32', arm: 'arm' }[process.arch];
  const home = path.join(dirs.runtimes, `temurin-${major}`);
  const found = findJavaIn(home);
  if (found) return found;

  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const archive = path.join(dirs.cache, `temurin-${major}.${ext}`);
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${osName}/${arch}/jre/hotspot/normal/eclipse`;
  await download(url, archive, {
    force: true,
    onProgress: (r, t) => onProgress?.({ stage: `Java ${major}`, done: r, total: t || r, bytes: true }),
  });
  await fsp.mkdir(home, { recursive: true });
  if (ext === 'zip') {
    const AdmZip = require('adm-zip');
    new AdmZip(archive).extractAllTo(home, true);
  } else {
    const tar = require('tar');
    await tar.x({ file: archive, cwd: home });
  }
  await fsp.rm(archive, { force: true });
  const bin = findJavaIn(home);
  if (!bin) throw new Error(`Downloaded Java ${major} but could not find the java binary`);
  return bin;
}

function findJavaIn(home) {
  if (!fs.existsSync(home)) return null;
  const exe = process.platform === 'win32' ? 'javaw.exe' : 'java';
  const stack = [home];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === exe && path.basename(dir) === 'bin') return p;
    }
  }
  return null;
}

/**
 * Return a java binary suitable for the given version requirement.
 * @param {{component?: string, majorVersion?: number}} req from the version json
 */
async function ensureJava(req = {}, onProgress) {
  const component = req.component || 'jre-legacy';
  const major = req.majorVersion || 8;
  try {
    const bin = await installMojangRuntime(component, onProgress);
    if (bin) return bin;
  } catch (err) {
    console.warn('Mojang runtime failed, falling back to Temurin:', err.message);
  }
  return installAdoptium(major, onProgress);
}

module.exports = { ensureJava, consoleJava };
