// Syntax-checks every source file (main process as CommonJS, UI as ES modules).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
let failed = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.js')) {
      const isModule = p.includes(`${path.sep}renderer${path.sep}`);
      try {
        if (isModule) execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(p) });
        else execFileSync(process.execPath, ['--check', p]);
      } catch (err) {
        failed++;
        console.error(`✗ ${path.relative(root, p)}\n${err.stderr || err.message}`);
      }
    }
  }
}
walk(root);
if (failed) process.exit(1);
console.log('All source files OK');
