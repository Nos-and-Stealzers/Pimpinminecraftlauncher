// The Pimpin shader packs: "Pimpin Shaders Lite" (good looking, light on FPS) and
// "Pimpin Shaders Ultra" (max eye candy). Shipped as folders in resources/shaderpacks,
// zipped on demand into an instance's shaderpacks/ and switched on for Iris
// (config/iris.properties) and OptiFine (optionsshaders.txt).
const fsp = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');

const SHADERS = {
  lite: {
    id: 'lite',
    name: 'Pimpin Shaders Lite',
    folder: 'Pimpin Shaders Lite',
    file: 'Pimpin Shaders Lite.zip',
    tagline: 'Good looking shaders that keep your FPS high.',
    features: [
      'Physically based sky with real orange sunsets and deep blue nights',
      'Distant land fades into the horizon instead of grey fog',
      'Soft sun shadows and ambient occlusion in corners',
      'Water that is clear in the shallows and deep blue further out',
      'Sunlight glowing through leaves, swaying plants',
      'Glowing torches, lava and lamps, filmic colours',
    ],
  },
  ultra: {
    id: 'ultra',
    name: 'Pimpin Shaders Ultra',
    folder: 'Pimpin Shaders Ultra',
    file: 'Pimpin Shaders Ultra.zip',
    tagline: 'Maximum eye candy. Needs a strong graphics card.',
    features: [
      'Physically based sky with volumetric clouds and cloud shadows',
      'Contact-hardening shadows, coloured light through stained glass',
      'God rays and screen-space ambient occlusion',
      'Water with refraction, caustics, depth colour and reflections',
      'Wet, reflective ground in rain',
      'Temporal anti-aliasing, bloom and auto exposure',
      'Low / Medium / High / Ultra quality profiles',
    ],
  },
};

const PACK_ROOT = path.join(__dirname, '..', '..', 'resources', 'shaderpacks');

function pack(id) {
  const p = SHADERS[id];
  if (!p) throw new Error(`Unknown shader pack: ${id}`);
  return p;
}

async function addFolder(zip, dir, prefix) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await addFolder(zip, full, name);
    else zip.addFile(name, await fsp.readFile(full));
  }
}

/** Zip a pack folder. The zip root holds shaders/ directly. Resolves to a Buffer. */
async function build(id) {
  const zip = new AdmZip();
  await addFolder(zip, path.join(PACK_ROOT, pack(id).folder), '');
  return zip.toBuffer();
}

// Minimal reader/writer for key=value files that keeps unknown lines untouched.
async function readText(file) {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

function getKey(text, key) {
  const m = text.match(new RegExp(`^\\s*${key}\\s*[=:]\\s*(.*?)\\s*$`, 'm'));
  return m ? m[1].replace(/\\(.)/g, '$1') : null;
}

function setKeys(text, pairs) {
  for (const [k, v] of pairs) {
    const re = new RegExp(`^\\s*${k}\\s*[=:].*$`, 'm');
    const line = `${k}=${v}`;
    if (re.test(text)) text = text.replace(re, () => line);
    else text = `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  }
  return text;
}

async function writeText(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text);
}

const irisFile = (gameDir) => path.join(gameDir, 'config', 'iris.properties');
const optifineFile = (gameDir) => path.join(gameDir, 'optionsshaders.txt');

async function selection(gameDir) {
  const iris = await readText(irisFile(gameDir));
  const of = await readText(optifineFile(gameDir));
  return {
    iris: getKey(iris, 'enableShaders') !== 'false' ? getKey(iris, 'shaderPack') : null,
    optifine: getKey(of, 'shaderPack'),
  };
}

async function exists(file) {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

/** One entry per Pimpin pack with installed/active flags for this game dir. */
async function status(gameDir) {
  const sel = await selection(gameDir);
  const out = [];
  for (const p of Object.values(SHADERS)) {
    out.push({
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      features: p.features,
      installed: await exists(path.join(gameDir, 'shaderpacks', p.file)),
      active: sel.iris === p.file || sel.optifine === p.file,
    });
  }
  return out;
}

/** Turn a pack on, or (on=false) switch shaders off if this pack is the selected one. */
async function setActive(gameDir, id, on = true) {
  const p = pack(id);
  const irisPath = irisFile(gameDir);
  const ofPath = optifineFile(gameDir);
  let iris = await readText(irisPath);
  let of = await readText(ofPath);
  if (on) {
    await writeText(irisPath, setKeys(iris, [['shaderPack', p.file], ['enableShaders', 'true']]));
    await writeText(ofPath, setKeys(of, [['shaderPack', p.file]]));
    return;
  }
  if (getKey(iris, 'shaderPack') === p.file) {
    await writeText(irisPath, setKeys(iris, [['enableShaders', 'false']]));
  }
  if (getKey(of, 'shaderPack') === p.file) {
    await writeText(ofPath, setKeys(of, [['shaderPack', 'OFF']]));
  }
}

/** Write the pack zip into <gameDir>/shaderpacks and optionally select it. */
async function install(gameDir, id, activate = true) {
  const p = pack(id);
  const dir = path.join(gameDir, 'shaderpacks');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, p.file), await build(id));
  if (activate) await setActive(gameDir, id, true);
}

async function remove(gameDir, id) {
  const p = pack(id);
  await setActive(gameDir, id, false);
  await fsp.rm(path.join(gameDir, 'shaderpacks', p.file), { force: true });
}

module.exports = { SHADERS, build, status, install, setActive, remove };
