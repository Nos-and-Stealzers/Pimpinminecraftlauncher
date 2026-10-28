// Electron fixture for the optional Minecraft style (src/renderer/themes/minecraft).
// Real renderer, CSS and sandboxed preload loaded from file:// like the app,
// fixture IPC and a disposable PIMPIN_ROOT under TMPDIR. Checks: default off
// (also with legacy pre-v3 keys), every preset and background renders, block
// icons, reduced motion and hidden window keep the panorama static, reset
// removes everything, and a renderer copy without the themes folder boots
// with no errors and no Minecraft settings block.
// Run: node_modules/.bin/electron scripts/minecraft-style-electron.js
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const scratch = process.env.TMPDIR;
if (!scratch) throw new Error('TMPDIR is required: never test against real launcher data');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const INSTANCES = [
  ['survival', 'Survival 1.21', '1.21.4', 'fabric', 'grass'],
  ['skyblock', 'Skyblock', '1.20.1', 'fabric', 'ocean'],
  ['create', 'Create Above', '1.20.1', 'forge', 'gold'],
  ['vanilla', 'Vanilla', '1.21.4', 'vanilla', 'emerald'],
  ['pvp', 'PvP practice', '1.8.9', 'fabric', 'crimson'],
  ['night', 'Night builds', '1.21.1', 'quilt', 'night'],
  ['magic', 'Magic pack', '1.20.1', 'neoforge', 'violet'],
  ['pack', 'Modpack', '1.19.2', 'fabric', 'pack'],
].map(([id, name, mcVersion, loader, icon], i) => ({ id, name, mcVersion, loader, icon, lastPlayed: Date.now() - i * 36e5 * 7, playTime: 3600 * (12 - i), contentCount: 20 + i * 7 }));

app.whenReady().then(async () => {
  const output = path.join(scratch, 'pimpin-minecraft-style');
  await fs.mkdir(output, { recursive: true });
  const root = await fs.mkdtemp(path.join(output, 'fixture-'));
  process.env.PIMPIN_ROOT = root;
  // Legacy pre-v3 settings must not switch anything on.
  await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify({ background: 'panorama', blockIcons: true, effects3d: true, uiStyle: 'classic', skinPedestal: 'block', skinSpin: 'spin', skinPose: 'dance', corners: 'sharp' }));
  const store = require('../src/main/store');
  const { skin } = require('../src/main/wardrobe-art');
  const skinUrl = 'data:image/png;base64,' + skin('ranger').toPNG().toString('base64');
  app.setPath('userData', path.join(root, 'electron-profile'));
  await store.updateSettings({ startPage: 'home', onboarded: true, lastSeenVersion: 'fixture', memoryMax: 4096, lastInstance: 'survival', showNews: false });
  const unknown = new Set();
  ipcMain.handle('rpc', async (_e, channel, args) => {
    try {
      let data = null;
      switch (channel) {
        case 'settings:get': data = store.getSettings(); break;
        case 'settings:update': data = await store.updateSettings(args[0]); break;
        case 'window:zoom': break;
        case 'app:info': data = { platform: process.platform, arch: process.arch, version: 'fixture' }; break;
        case 'accounts:list': data = { accounts: [{ id: 'offline-steve', name: 'Ranger', type: 'offline' }], active: 'offline-steve' }; break;
        case 'instances:list': data = INSTANCES; break;
        case 'servers:list': case 'instances:worlds': case 'news:get': data = []; break;
        case 'features:list': data = [
          { id: 'fps', name: 'Faster FPS', desc: 'Sodium and friends.', icon: 'bolt', enabled: true },
          { id: 'zoom', name: 'Zoom', desc: 'Hold C to zoom.', icon: 'search', enabled: false },
          { id: 'map', name: 'Minimap', desc: 'Corner map with waypoints.', icon: 'globe', enabled: true, custom: true },
        ]; break;
        case 'skin:get': data = skinUrl; break;
        case 'update:get': data = { status: 'idle' }; break;
        case 'presence:status': data = { message: 'Off' }; break;
        case 'curseforge:status': data = { configured: false, source: null }; break;
        case 'notifications:list': data = { items: [], unread: 0 }; break;
        default: unknown.add(channel);
      }
      return { ok: true, data };
    } catch (error) { return { ok: false, error: error.message }; }
  });

  const errors = [];
  let win;
  const open = async (indexFile) => {
    win?.destroy();
    win = new BrowserWindow({ width: 1280, height: 800, show: true, backgroundColor: '#111214', webPreferences: { preload: path.resolve(__dirname, '../src/main/preload.js'), contextIsolation: true, sandbox: true } });
    win.webContents.on('console-message', (d) => { if (d.level === 'error' || d.level === 'warning') { errors.push(d.message); console.error('Renderer:', d.message); } });
    await win.loadFile(indexFile);
  };
  const run = (code) => win.webContents.executeJavaScript(code).catch((error) => { console.error('Evaluation:', code); throw error; });
  const wait = async (code, ms = 8000) => { for (let i = 0; i < ms / 50; i++) { if (await run(code)) return; await pause(50); } throw new Error('Timed out: ' + code + '; renderer errors: ' + errors.join('; ')); };
  const frame = () => run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const shot = async (name) => { await frame(); await pause(250); await fs.writeFile(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const nav = async (page, params = {}) => { await run(`window.pimpinNavigate(${JSON.stringify(page)}, ${JSON.stringify(params)})`); await frame(); };
  const set = (patch) => run(`import('./js/state.js').then(m => m.updateSettings(${JSON.stringify(patch)})).then(() => true)`);
  const theme = () => run(`import('./themes/minecraft/index.js').then(m => m.status())`);
  const canvasHash = () => run(`(()=>{const c=document.querySelector('.mc-pano-canvas');if(!c)return null;const d=c.toDataURL();let h=0;for(let i=0;i<d.length;i+=7)h=(h*31+d.charCodeAt(i))|0;return h;})()`);
  const report = { root, output, screenshots: [], checks: [] };
  const check = (name) => { report.checks.push(name); console.log('ok -', name); };

  try {
    const realIndex = path.resolve(__dirname, '../src/renderer/index.html');
    await open(realIndex);
    await wait('!!document.querySelector(".home-top")');
    assert.equal(await run('document.body.hasAttribute("data-mc")'), false);
    assert.equal(await run('!!document.querySelector("link[data-theme=minecraft], .mc-backdrop, .mc-block-ico")'), false);
    assert.equal(await run('performance.getEntriesByType("resource").some(e => e.name.includes("/themes/minecraft/"))'), false, 'theme must not load while off');
    assert.equal(store.getSettings().mcStyle, false);
    check('default off, legacy keys ignored, theme not loaded at boot');
    await shot('home-default'); report.screenshots.push('home-default');

    await nav('settings');
    await wait('!!document.querySelector(\'[aria-label="Minecraft style"]\')');
    assert.equal(await run('document.body.hasAttribute("data-mc")'), false, 'settings probe must not apply the theme');
    check('settings shows the Minecraft style block while off');
    await shot('settings-1280'); report.screenshots.push('settings-1280');
    win.setSize(1024, 720); await pause(300);
    assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'), true);
    await shot('settings-1024'); report.screenshots.push('settings-1024');
    // Search filters rows; deep links keep working.
    await run(`{const i=document.querySelector('[aria-label="Search settings"]');i.value='discord';i.dispatchEvent(new Event('input'));}`);
    assert.equal(await run('document.querySelector("#set-launcher").hidden'), false);
    assert.equal(await run('document.querySelector("#set-appearance").hidden'), true);
    await shot('settings-search'); report.screenshots.push('settings-search');
    await nav('settings', { section: 'notifications' });
    await wait('document.querySelector(".set-nav-links a.on")?.dataset.target === "set-notifications"');
    check('settings search and deep-link section highlight');
    win.setSize(1280, 800); await pause(200);
    await nav('settings', { section: 'appearance' });
    await wait('!!document.querySelector(\'[aria-label="Minecraft style"]\')');

    await run(`document.querySelector('[aria-label="Minecraft style"]').click()`);
    await wait('document.body.hasAttribute("data-mc") && !!document.querySelector("link[data-theme=minecraft]")');
    await wait('!!document.querySelector(\'[aria-label="Overworld preset"]\')');
    assert.equal(store.getSettings().mcStyle, true);
    await run(`document.querySelector('#set-group-minecraft-style').scrollIntoView({block:'start'})`);
    await shot('settings-mc-on'); report.screenshots.push('settings-mc-on');
    check('master switch turns the style on and shows its choices');
    // Exercise the real controls, not just direct settings writes.
    await run(`{for (const [label,value] of [['Sky scene','oneblock'],['Mob count','3'],['Scene speed','0.5']]) {
      const control=document.querySelector('[aria-label="'+label+'"]');
      if(!control) throw new Error('Missing control: '+label);
      control.value=value;control.dispatchEvent(new Event('change'));
    }}`);
    await wait(`import('./js/state.js').then(m=>m.state.settings.mcScene === 'oneblock' && m.state.settings.mcMobCount === 3 && m.state.settings.mcSceneSpeed === 0.5)`);
    assert.equal(store.getSettings().mcScene, 'oneblock');
    assert.equal(store.getSettings().mcMobCount, 3);
    assert.equal(store.getSettings().mcSceneSpeed, 0.5);
    await run(`document.querySelector('[aria-label="Wandering mobs"]').click()`);
    await wait(`import('./js/state.js').then(m=>m.state.settings.mcMobs === false)`);
    assert.equal(store.getSettings().mcMobs, false);
    await set({ mcScene: 'island', mcMobs: true, mcMobCount: 2, mcSceneSpeed: 1 });
    check('sky scene, wandering mobs, count and speed controls persist typed settings');

    // Every preset renders a distinct, non-empty panorama on Home.
    const hashes = {};
    for (const preset of ['overworld', 'nether', 'end']) {
      await set({ mcPreset: preset, mcBackground: 'panorama' });
      await nav('home');
      await wait('!!document.querySelector(".mc-pano-canvas") && document.body.hasAttribute("data-mc-home")');
      await wait(`import('./themes/minecraft/index.js').then(m=>m.status().running)`);
      await pause(400);
      const lit = await run(`(()=>{const c=document.querySelector('.mc-pano-canvas');const x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<x.length;i+=4*97)if(x[i+3])n++;return n;})()`);
      assert.ok(lit > 100, `${preset} panorama is empty`);
      hashes[preset] = await canvasHash();
      await shot(`home-${preset}`); report.screenshots.push(`home-${preset}`);
    }
    assert.equal(new Set(Object.values(hashes)).size, 3, 'presets must look different');
    // Animation runs on Home: two frames differ.
    const a = await canvasHash(); await pause(700); const b = await canvasHash();
    assert.notEqual(a, b, 'panorama should turn on Home');
    const cost = (await theme()).drawMs;
    report.panoramaDrawMs = cost;
    check(`overworld, nether and end panoramas render and animate on Home (${cost} ms per frame, software rendering)`);

    // Real Home integration: every scene/species combination, small window too.
    report.scenes = [];
    for (const size of [[1280, 800], [1024, 640]]) {
      win.setSize(...size); await pause(150);
      for (const preset of ['overworld', 'nether', 'end']) for (const scene of ['island', 'oneblock']) {
        await set({ mcPreset: preset, mcScene: scene, mcMobs: true, mcMobCount: 3 });
        await wait(`import('./themes/minecraft/index.js').then(m=>m.status().scene?.scene === ${JSON.stringify(scene)} && m.status().scene?.preset === ${JSON.stringify(preset)})`);
        const d = (await theme()).scene;
        assert.equal(d.mobs.length, 3);
        for (const mob of d.mobs) {
          assert.equal(mob.type, {overworld:'sheep',nether:'pigman',end:'enderman'}[preset]);
          assert.ok(mob.bounds.left >= 0 && mob.bounds.right <= d.width);
          assert.ok(mob.bounds.top >= 0 && mob.bounds.bottom <= d.band);
        }
        assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'), true);
        report.scenes.push({preset,scene,size,drawMs:(await theme()).drawMs});
        await shot(`home-${preset}-${scene}-${size[0]}`);
      }
    }
    const beforeMove = (await theme()).scene.elapsed;
    await pause(200);
    assert.ok((await theme()).scene.elapsed > beforeMove);
    await set({ mcMobs: false });
    assert.equal((await theme()).scene.mobs.length, 0);
    await set({ mcMobs: true, mcMobCount: 2, mcScene: 'island' });
    win.setSize(1280, 800);
    check('all six scene/world combinations at normal and small sizes; correct species, safe bounds, animation and mob off');

    // Not on Home: paused, tiles shown.
    await nav('instances');
    await wait('document.querySelectorAll(".inst-icon img.mc-block-ico").length >= 8');
    assert.equal((await theme()).running, false);
    assert.equal(await run('document.body.hasAttribute("data-mc-home")'), false);
    assert.equal(await run('document.querySelectorAll(".side-item .mc-block-ico").length'), 6);
    await shot('instances-blocks'); report.screenshots.push('instances-blocks');
    check('panorama paused off Home; block icons on sidebar and every instance');

    for (const bg of ['tiles', 'plain']) {
      await set({ mcBackground: bg, mcPreset: 'overworld' });
      await nav('home');
      await wait(`document.body.dataset.mcBg === ${JSON.stringify(bg)}`);
      assert.equal((await theme()).running, false);
      await shot(`home-bg-${bg}`); report.screenshots.push(`home-bg-${bg}`);
    }
    check('tiles and plain backgrounds render without the panorama loop');

    // Light theme + wood buttons + pose/stand.
    await set({ uiStyle: 'light', mcBackground: 'panorama', mcButtons: 'wood', mcSkinPose: 'walk' });
    await nav('home');
    await wait('document.body.dataset.theme === "light" && !!document.querySelector(".home-skin .mc-pedestal")');
    assert.equal(await run('document.querySelector(".home-skin .mc-model").classList.contains("pose-walk")'), true);
    await shot('home-light'); report.screenshots.push('home-light');
    await nav('settings', { section: 'appearance' });
    await wait('!!document.querySelector(\'[aria-label="End preset"]\')');
    await shot('settings-light-mc'); report.screenshots.push('settings-light-mc');
    await set({ uiStyle: 'modern', mcButtons: 'stone', mcSkinPose: 'idle' });
    check('light theme, wood buttons, walk pose and grass stand');

    // Contrast: stone button text and accent button text stay AA.
    const contrast = await run(`(async()=>{const lum=rgb=>{const c=rgb.match(/[\\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
      const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      // brightest pixel of the button texture vs white text
      const img=new Image();img.src=getComputedStyle(document.body).getPropertyValue('--mc-stone-btn-hi').trim().slice(5,-2);await img.decode();
      const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,16,16).data;let max=0;for(let i=0;i<d.length;i+=4)max=Math.max(max,lum('rgb('+d[i]+','+d[i+1]+','+d[i+2]+')'));
      return ratio(1,max);})()`);
    assert.ok(contrast >= 4.5, `stone button contrast ${contrast}`);
    check(`stone button text contrast ${contrast.toFixed(2)}:1 on its brightest pixel`);

    // Reduced motion: static panorama, two frames identical.
    await set({ animations: false });
    await nav('home');
    await wait('!!document.querySelector(".mc-pano-canvas")');
    assert.equal((await theme()).running, false);
    const r1 = await canvasHash(); await pause(600); const r2 = await canvasHash();
    assert.equal(r1, r2, 'reduced motion must keep the panorama still');
    await set({ animations: true });
    await wait(`import('./themes/minecraft/index.js').then(m=>m.status().running)`);
    // Hidden window pauses the loop.
    win.hide(); await pause(400);
    const hidden = await run('document.hidden');
    if (hidden) assert.equal((await theme()).running, false);
    win.show(); await pause(300);
    check(`reduced motion static; hidden window ${hidden ? 'pauses' : 'not reported hidden by this Electron build'}`);

    // Turn off and reset removes every trace and restores defaults.
    await nav('settings', { section: 'appearance' });
    await wait('!!document.querySelector(\'[aria-label="Turn off and reset Minecraft style"]\')');
    await set({ mcPreset: 'end', mcTilt: true });
    await nav('settings', { section: 'appearance' });
    await wait('!!document.querySelector(\'[aria-label="Turn off and reset Minecraft style"]\')');
    await run(`document.querySelector('[aria-label="Turn off and reset Minecraft style"]').click()`);
    await wait('!document.body.hasAttribute("data-mc")');
    assert.equal(await run('!!document.querySelector("link[data-theme=minecraft], .mc-backdrop, .mc-block-ico, .mc-pedestal, [data-mc-block]")'), false);
    const after = store.getSettings();
    const { APPEARANCE_DEFAULTS, MINECRAFT_KEYS } = require('../src/main/appearance-settings');
    for (const key of MINECRAFT_KEYS) assert.equal(after[key], APPEARANCE_DEFAULTS[key], key);
    assert.equal(after.memoryMax, 4096);
    check('turn off and reset removes the theme and restores mc defaults only');

    // Removal: renderer copy without themes/, style switched on in settings.
    await store.updateSettings({ mcStyle: true, mcPreset: 'nether' });
    const copy = path.join(root, 'renderer-without-themes');
    await fs.cp(path.resolve(__dirname, '../src/renderer'), copy, { recursive: true, filter: (src) => !src.includes(`${path.sep}themes`) });
    await assert.rejects(fs.stat(path.join(copy, 'themes')));
    errors.length = 0;
    await open(path.join(copy, 'index.html'));
    await wait('!!document.querySelector(".home-top")');
    await pause(500);
    assert.equal(await run('document.body.hasAttribute("data-mc")'), false);
    await wait('!document.body.hasAttribute("data-mc-pending") && getComputedStyle(document.querySelector(".view")).visibility === "visible"');
    await nav('settings');
    await wait('!!document.querySelector("#set-appearance")');
    await wait('!document.querySelector("#set-group-minecraft-style")');
    assert.equal(await run('!!document.querySelector(\'[aria-label="Minecraft style"]\')'), false);
    await shot('removed-settings'); report.screenshots.push('removed-settings');
    assert.deepEqual(errors, [], 'no renderer errors without the themes folder');
    check('themes folder removed: boots, settings block hidden, no renderer errors');

    report.unknownIpc = [...unknown];
    report.passed = true;
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2));
    console.log(`PASS Electron Minecraft style: ${report.checks.length} checks. Screenshots: ${output}`);
    win.destroy(); app.exit(0);
  } catch (error) {
    console.error(error);
    console.error('Renderer errors:', errors);
    try { await shot('failure'); } catch {}
    win?.destroy(); app.exit(1);
  }
});
