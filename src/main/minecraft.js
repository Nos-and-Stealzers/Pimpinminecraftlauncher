// The game core: resolves a Minecraft version (optionally with the Fabric or
// Quilt loader), downloads everything it needs into the shared folders and
// builds the java command line. Works on Windows, Linux and macOS.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { getJson, download, pool } = require('./net');
const { dirs, readJson, writeJson } = require('./store');
const { ensureJava } = require('./java');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const LIBRARIES_URL = 'https://libraries.minecraft.net/';
const RESOURCES_URL = 'https://resources.download.minecraft.net/';
const LAUNCHER_NAME = 'pimpin-launcher';
const LAUNCHER_VERSION = '0.1.0';

const OS_NAME = { win32: 'windows', darwin: 'osx', linux: 'linux' }[process.platform] || 'linux';
const CP_SEP = process.platform === 'win32' ? ';' : ':';

const LOADERS = {
  fabric: {
    list: (mc) => `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`,
    profile: (mc, l) =>
      `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(l)}/profile/json`,
    games: 'https://meta.fabricmc.net/v2/versions/game',
  },
  quilt: {
    list: (mc) => `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}`,
    profile: (mc, l) =>
      `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(l)}/profile/json`,
    games: 'https://meta.quiltmc.org/v3/versions/game',
  },
};

// ---------------------------------------------------------------- versions --

async function getVersionManifest() {
  const cache = path.join(dirs.cache, 'version_manifest_v2.json');
  try {
    const manifest = await getJson(MANIFEST_URL);
    await writeJson(cache, manifest);
    return manifest;
  } catch (err) {
    const cached = await readJson(cache, null);
    if (cached) return cached;
    throw err;
  }
}

async function getLoaderVersions(loader, mcVersion) {
  const def = LOADERS[loader];
  if (!def) return [];
  const list = await getJson(def.list(mcVersion));
  return list.map((e) => ({ version: e.loader.version, stable: e.loader.stable !== false }));
}

async function getLoaderGameVersions(loader) {
  const def = LOADERS[loader];
  if (!def) return [];
  const list = await getJson(def.games);
  return list.map((e) => e.version);
}

/** Fetch (or read from disk) the vanilla version json. */
async function getVanillaJson(id) {
  const file = path.join(dirs.versions, id, `${id}.json`);
  const existing = await readJson(file, null);
  if (existing) return existing;
  const manifest = await getVersionManifest();
  const entry = manifest.versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Minecraft ${id} does not exist`);
  await download(entry.url, file, { sha1: entry.sha1 });
  return readJson(file, null);
}

async function getLoaderJson(loader, mcVersion, loaderVersion) {
  const def = LOADERS[loader];
  if (!loaderVersion) {
    const versions = await getLoaderVersions(loader, mcVersion);
    const pick = versions.find((v) => v.stable) || versions[0];
    if (!pick) throw new Error(`${loader} does not support Minecraft ${mcVersion} yet`);
    loaderVersion = pick.version;
  }
  const id = `${loader}-loader-${loaderVersion}-${mcVersion}`;
  const file = path.join(dirs.versions, id, `${id}.json`);
  let json = await readJson(file, null);
  if (!json) {
    json = await getJson(def.profile(mcVersion, loaderVersion));
    json.id = id;
    await writeJson(file, json);
  }
  return { json, loaderVersion };
}

function libKey(name) {
  const [group, artifact, , classifier] = name.split(':');
  return `${group}:${artifact}${classifier ? `:${classifier}` : ''}`;
}

/** Merge a loader profile (child) on top of the vanilla version (parent). */
function mergeVersion(parent, child) {
  const childKeys = new Set(child.libraries.map((l) => libKey(l.name)));
  return {
    ...parent,
    id: child.id,
    inheritsFrom: parent.id,
    mainClass: child.mainClass || parent.mainClass,
    libraries: [...child.libraries, ...parent.libraries.filter((l) => !childKeys.has(libKey(l.name)))],
    arguments: parent.arguments
      ? {
          game: [...(parent.arguments.game || []), ...(child.arguments?.game || [])],
          jvm: [...(parent.arguments.jvm || []), ...(child.arguments?.jvm || [])],
        }
      : undefined,
    minecraftArguments: child.minecraftArguments || parent.minecraftArguments,
  };
}

async function resolveVersion(instance) {
  const vanilla = await getVanillaJson(instance.mcVersion);
  if (!instance.loader || instance.loader === 'vanilla') return { version: vanilla, vanilla };
  const { json, loaderVersion } = await getLoaderJson(instance.loader, instance.mcVersion, instance.loaderVersion);
  return { version: mergeVersion(vanilla, json), vanilla, loaderVersion };
}

// ------------------------------------------------------------------- rules --

function rulesAllow(rules, features = {}) {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    let match = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== OS_NAME) match = false;
      if (rule.os.arch && rule.os.arch !== (process.arch === 'ia32' ? 'x86' : process.arch)) match = false;
      if (rule.os.version) {
        try {
          if (!new RegExp(rule.os.version).test(os.release())) match = false;
        } catch {
          /* ignore bad regex */
        }
      }
    }
    if (rule.features) {
      for (const [k, v] of Object.entries(rule.features)) if (Boolean(features[k]) !== v) match = false;
    }
    if (match) allowed = rule.action === 'allow';
  }
  return allowed;
}

/** Native classifiers for other CPU architectures are not useful to us. */
function wrongArch(classifier = '') {
  const isArm = process.arch === 'arm64';
  if (/arm64|aarch64/.test(classifier)) return !isArm;
  if (/x86(?!_64)/.test(classifier)) return process.arch !== 'ia32';
  return isArm && /natives-(windows|linux|macos)$/.test(classifier) && process.platform !== 'darwin';
}

function mavenPath(name) {
  const [group, artifact, version, classifier] = name.split(':');
  let ext = 'jar';
  let ver = version;
  if (ver && ver.includes('@')) [ver, ext] = ver.split('@');
  const file = `${artifact}-${ver}${classifier ? `-${classifier}` : ''}.${ext}`;
  return `${group.replace(/\./g, '/')}/${artifact}/${ver}/${file}`;
}

// --------------------------------------------------------------- install --

function collectLibraries(version) {
  const classpath = [];
  const natives = [];
  const downloads = [];
  for (const lib of version.libraries) {
    if (!rulesAllow(lib.rules)) continue;
    const classifier = lib.name.split(':')[3];
    if (classifier && classifier.startsWith('natives-') && wrongArch(classifier)) continue;

    const artifact = lib.downloads?.artifact;
    if (artifact || !lib.natives) {
      const rel = artifact?.path || mavenPath(lib.name);
      const url = artifact ? artifact.url : (lib.url || LIBRARIES_URL).replace(/\/?$/, '/') + rel;
      const dest = path.join(dirs.libraries, rel);
      if (url) downloads.push({ url, dest, sha1: artifact?.sha1 || lib.sha1, size: artifact?.size || lib.size });
      classpath.push(dest);
      if (classifier && classifier.startsWith('natives-')) natives.push({ file: dest, exclude: lib.extract?.exclude });
    }

    // Legacy (pre-1.19) native jars live in "classifiers".
    if (lib.natives && lib.natives[OS_NAME]) {
      const key = lib.natives[OS_NAME].replace('${arch}', process.arch === 'ia32' ? '32' : '64');
      const native = lib.downloads?.classifiers?.[key];
      const rel = native?.path || mavenPath(`${lib.name}:${key}`);
      const url = native?.url || (lib.url || LIBRARIES_URL).replace(/\/?$/, '/') + rel;
      const dest = path.join(dirs.libraries, rel);
      downloads.push({ url, dest, sha1: native?.sha1, size: native?.size });
      natives.push({ file: dest, exclude: lib.extract?.exclude });
    }
  }
  return { classpath: [...new Set(classpath)], natives, downloads };
}

async function extractNatives(natives, target) {
  await fsp.mkdir(target, { recursive: true });
  const nativeExt = /\.(dll|so|dylib|jnilib)$/i;
  for (const { file, exclude = [] } of natives) {
    if (!fs.existsSync(file)) continue;
    let zip;
    try {
      zip = new AdmZip(file);
    } catch {
      continue;
    }
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (name.startsWith('META-INF') || exclude.some((e) => name.startsWith(e))) continue;
      if (!nativeExt.test(name)) continue;
      const dest = path.join(target, path.basename(name));
      if (!fs.existsSync(dest)) await fsp.writeFile(dest, entry.getData());
    }
  }
}

async function installAssets(version, gameDir, progress) {
  const idx = version.assetIndex;
  const indexFile = path.join(dirs.assets, 'indexes', `${idx.id}.json`);
  await download(idx.url, indexFile, { sha1: idx.sha1 });
  const index = await readJson(indexFile, { objects: {} });
  const objects = Object.entries(index.objects);
  let done = 0;
  await pool(objects, 24, async ([name, { hash, size }]) => {
    const rel = `${hash.slice(0, 2)}/${hash}`;
    const dest = path.join(dirs.assets, 'objects', rel);
    await download(RESOURCES_URL + rel, dest, { size });
    if (index.virtual || index.map_to_resources) {
      const legacyRoot = index.map_to_resources
        ? path.join(gameDir, 'resources')
        : path.join(dirs.assets, 'virtual', 'legacy');
      const target = path.join(legacyRoot, name);
      if (!fs.existsSync(target)) {
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.copyFile(dest, target);
      }
    }
    done++;
    if (done % 25 === 0 || done === objects.length) progress({ stage: 'Assets', done, total: objects.length });
  });
  return index;
}

/** Download everything needed to launch. Returns data used to build args. */
async function installVersion(instance, gameDir, progress = () => {}) {
  progress({ stage: 'Resolving version', done: 0, total: 1 });
  const { version, vanilla, loaderVersion } = await resolveVersion(instance);

  const clientJar = path.join(dirs.versions, vanilla.id, `${vanilla.id}.jar`);
  progress({ stage: 'Game client', done: 0, total: 1 });
  await download(vanilla.downloads.client.url, clientJar, {
    sha1: vanilla.downloads.client.sha1,
    size: vanilla.downloads.client.size,
  });

  const libs = collectLibraries(version);
  let done = 0;
  await pool(libs.downloads, 12, async (d) => {
    await download(d.url, d.dest, { sha1: d.sha1, size: d.size });
    progress({ stage: 'Libraries', done: ++done, total: libs.downloads.length });
  });

  const nativesDir = path.join(dirs.natives, version.id);
  await extractNatives(libs.natives, nativesDir);

  const assetIndex = await installAssets(version, gameDir, progress);

  let logArg = null;
  const logging = version.logging?.client;
  if (logging?.file) {
    const logFile = path.join(dirs.assets, 'log_configs', logging.file.id);
    await download(logging.file.url, logFile, { sha1: logging.file.sha1 });
    logArg = logging.argument.replace('${path}', logFile);
  }

  const java = await ensureJava(vanilla.javaVersion, progress);
  return { version, vanilla, loaderVersion, clientJar, libs, nativesDir, assetIndex, logArg, java };
}

// --------------------------------------------------------------- arguments --

function expandArgs(list, vars, features) {
  const out = [];
  for (const arg of list || []) {
    if (typeof arg === 'string') out.push(arg);
    else if (rulesAllow(arg.rules, features)) out.push(...(Array.isArray(arg.value) ? arg.value : [arg.value]));
  }
  return out.map((a) => a.replace(/\$\{([a-zA-Z_]+)\}/g, (m, k) => (k in vars ? vars[k] : m)));
}

function buildArgs(ctx, { instance, account, settings, gameDir, server }) {
  const { version, vanilla, clientJar, libs, nativesDir, assetIndex, logArg } = ctx;
  const classpath = [...libs.classpath, clientJar].join(CP_SEP);
  const width = instance.width || settings.width;
  const height = instance.height || settings.height;
  const gameAssets = assetIndex.map_to_resources
    ? path.join(gameDir, 'resources')
    : assetIndex.virtual
      ? path.join(dirs.assets, 'virtual', 'legacy')
      : dirs.assets;

  const vars = {
    auth_player_name: account.name,
    version_name: version.id,
    game_directory: gameDir,
    assets_root: dirs.assets,
    game_assets: gameAssets,
    assets_index_name: vanilla.assetIndex.id,
    auth_uuid: account.uuid.replace(/-/g, ''),
    auth_access_token: account.accessToken,
    auth_session: `token:${account.accessToken}:${account.uuid.replace(/-/g, '')}`,
    clientid: account.clientId || '',
    auth_xuid: account.xuid || '',
    user_type: account.type === 'msa' ? 'msa' : 'legacy',
    user_properties: '{}',
    version_type: vanilla.type,
    resolution_width: String(width),
    resolution_height: String(height),
    natives_directory: nativesDir,
    launcher_name: LAUNCHER_NAME,
    launcher_version: LAUNCHER_VERSION,
    classpath,
    classpath_separator: CP_SEP,
    library_directory: dirs.libraries,
    quickPlayMultiplayer: server || '',
    quickPlayPath: path.join(gameDir, 'quickPlay', 'log.json'),
  };

  const supportsQuickPlay = JSON.stringify(version.arguments?.game || []).includes('quickPlayMultiplayer');
  const features = {
    has_custom_resolution: !settings.fullscreen,
    is_quick_play_multiplayer: Boolean(server && supportsQuickPlay),
  };

  const maxMem = instance.memoryMax || settings.memoryMax;
  const minMem = Math.min(instance.memoryMin || settings.memoryMin, maxMem);
  const jvm = [`-Xmx${maxMem}M`, `-Xms${minMem}M`];
  const custom = (instance.jvmArgs || settings.jvmArgs || '').trim();
  if (custom) jvm.push(...custom.split(/\s+/));

  if (version.arguments?.jvm) {
    jvm.push(...expandArgs(version.arguments.jvm, vars, features));
  } else {
    if (process.platform === 'win32') {
      jvm.push('-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump');
    }
    if (process.platform === 'darwin') jvm.push('-XstartOnFirstThread');
    jvm.push(`-Djava.library.path=${nativesDir}`, '-cp', classpath);
  }
  if (logArg) jvm.push(logArg);

  let game;
  if (version.arguments?.game) {
    game = expandArgs(version.arguments.game, vars, features);
  } else {
    game = expandArgs(version.minecraftArguments.split(' '), vars, features);
    if (!settings.fullscreen) game.push('--width', vars.resolution_width, '--height', vars.resolution_height);
  }
  if (settings.fullscreen) game.push('--fullscreen');
  if (server && !supportsQuickPlay) {
    const [host, port] = server.split(':');
    game.push('--server', host, '--port', port || '25565');
  }

  return [...jvm, version.mainClass, ...game];
}

/**
 * Install and start the game. Returns the child process.
 * `events` gets { progress, log } callbacks.
 */
async function launch({ instance, account, settings, gameDir, server, javaPath }, events = {}) {
  const ctx = await installVersion(instance, gameDir, events.progress);
  const java = javaPath || ctx.java;
  const args = buildArgs(ctx, { instance, account, settings, gameDir, server });
  events.progress?.({ stage: 'Starting Minecraft', done: 1, total: 1 });
  const masked = args.map((a) => (a === account.accessToken ? '********' : a));
  events.log?.(`[Pimpin] ${java} ${masked.join(' ')}`);
  const child = spawn(java, args, { cwd: gameDir, windowsHide: false });
  return { child, loaderVersion: ctx.loaderVersion };
}

module.exports = {
  getVersionManifest,
  getLoaderVersions,
  getLoaderGameVersions,
  getVanillaJson,
  launch,
  installVersion,
  buildArgs,
  rulesAllow,
};
