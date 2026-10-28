// Build-time only. Enumerate the actual NSIS payload; never glob user files.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function manifestFromListing(listing) {
  const files = [];
  const directories = new Set();
  const seen = new Set();
  for (const block of listing.trim().split(/\r?\n\r?\n/)) {
    const record = Object.fromEntries(block.split(/\r?\n/).filter(line => line.includes(' = ')).map(line => {
      const index = line.indexOf(' = ');
      return [line.slice(0, index), line.slice(index + 3)];
    }));
    if (!record.Path) continue;
    const relative = record.Path.replace(/\//g, '\\');
    const parts = relative.split('\\');
    if (parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*$\x00-\x1f]/.test(part) || /[. ]$/.test(part))) {
      throw new Error(`Unsafe installer payload path: ${record.Path}`);
    }
    const key = relative.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate installer payload path: ${relative}`);
    seen.add(key);
    if (record.Folder === '+' || /D/.test(record.Attributes || '')) directories.add(relative);
    else {
      files.push(relative);
      for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('\\'));
    }
  }
  if (!files.length) throw new Error('Installer payload manifest is empty');
  return {
    files: files.sort(),
    directories: [...directories].sort((a, b) => b.split('\\').length - a.split('\\').length || a.localeCompare(b)),
  };
}

function renderManifest({ files, directories }) {
  const lines = ['; Generated from this build\'s archive, not from the installed directory.'];
  lines.push('!macro pimpinRestorePackagedFiles');
  for (const file of files) {
    lines.push(`  Rename "$PLUGINSDIR\\pimpin-old\\${file}" "$INSTDIR\\${file}"`);
  }
  lines.push('!macroend', '!macro pimpinCheckPackagedDirectories');
  for (const directory of directories) lines.push(`  !insertmacro pimpinCheckDirectory "\\${directory}"`);
  lines.push('!macroend', '!macro pimpinCheckPackagedFiles');
  for (const file of files) lines.push(`  !insertmacro pimpinCheckFile "${file}"`);
  lines.push('!macroend', '!macro pimpinMovePackagedFiles');
  for (const directory of [...directories].reverse()) {
    lines.push(`  CreateDirectory "$PLUGINSDIR\\pimpin-old\\${directory}"`);
  }
  for (const file of files) {
    lines.push(`  !insertmacro pimpinMoveFile "${file}"`);
  }
  lines.push('!macroend', '!macro pimpinRemoveEmptyDirectories');
  for (const directory of directories) lines.push(`  RMDir "$INSTDIR\\${directory}"`);
  lines.push('!macroend', '');
  return lines.join('\n');
}

async function main() {
  const [archive, output] = process.argv.slice(2);
  if (!archive || !output || !/\.nsis\.(7z|zip)$/i.test(archive)) throw new Error('Expected NSIS payload archive and output path');
  const { getPath7za } = require('app-builder-lib/out/toolsets/7zip');
  const sevenZip = await getPath7za();
  const listing = execFileSync(sevenZip, ['l', '-slt', '-ba', archive], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const manifest = manifestFromListing(listing);
  // Fail closed if the builder changes the archive layout.
  if (!manifest.files.includes('resources\\app.asar')) throw new Error('Expected packaged resources/app.asar');
  fs.writeFileSync(path.resolve(output), renderManifest(manifest));
  console.log(`Pimpin installer: preserving all non-payload files (${manifest.files.length} packaged files)`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { manifestFromListing, renderManifest };
