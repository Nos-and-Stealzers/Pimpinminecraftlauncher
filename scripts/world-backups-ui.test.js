// Isolated renderer test: explicit fixture IPC, never a launcher or real world.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename], { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const scratchRoot = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'cache', 'scratch');
  fs.mkdirSync(scratchRoot, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(scratchRoot, 'world-backups-ui-'));
  const renderer = path.join(__dirname, '..', 'src', 'renderer');
  const url = (file) => pathToFileURL(path.join(renderer, file)).href;
  const fixture = path.join(scratch, 'world-backups-fixture.html');
  fs.writeFileSync(fixture, `<!doctype html><html><head><link rel="stylesheet" href="${url('css/app.css')}"></head>
    <body><div id="modal-root"></div><div id="toasts"></div><script>
    window.calls = [];
    window.records = [{name:'backup-fixture.zip',size:13500000,created:1792512000000,safety:false},
      {name:'safety-fixture.zip',size:12000000,created:1792425600000,safety:true}];
    window.pimpin = {call: async (channel,...args) => {
      calls.push([channel,...args]);
      if(channel==='worldBackups:list') return records.slice();
      if(channel==='worldBackups:create') records.push({name:'created.zip',size:10,created:Date.now(),safety:false});
      if(channel==='worldBackups:restore') return {safetyBackup:{name:'safety-new.zip',safety:true},recoveryPath:'fixture-only'};
      if(channel==='worldBackups:export') return {exported:true};
      if(channel==='worldBackups:delete') records = records.filter(b=>b.name!==args[2]);
    }};</script><script type="module">
    import {openWorldBackups} from '${url('js/world-backups.js')}';
    import {state,notify} from '${url('js/state.js')}';
    window.fixtureState=state;window.fixtureNotify=notify;
    openWorldBackups({id:'fixture',running:false},{folder:'My world'});
    window.ready=true;</script></body></html>`);
  const window = new BrowserWindow({ width: 1100, height: 760, show: false, webPreferences: { offscreen: true, webSecurity: false } });
  try {
    await window.loadFile(fixture);
    const results = await window.webContents.executeJavaScript(`(async()=>{
      const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
      const assert=(value,label)=>{if(!value)throw Error(label);};
      const buttons=()=>[...document.querySelectorAll('button')];
      const click=(text)=>{const b=buttons().find(b=>b.textContent===text);assert(b&&!b.disabled,'Enabled '+text);b.click();};
      await wait(()=>window.ready&&!document.body.textContent.includes('Loading backups'));
      assert(document.body.textContent.includes('Automatic safety backup'),'Safety label');
      assert(document.body.textContent.includes('12.9 MB'),'Size label');
      assert(buttons().filter(b=>b.textContent==='Restore').length===2,'Backup actions');
      return {labels:true,size:true,actions:true};
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 350));
    fs.writeFileSync(path.join(scratch, 'world-backups-modal.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`(async()=>{
      const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
      const assert=(value,label)=>{if(!value)throw Error(label);};
      const buttons=()=>[...document.querySelectorAll('button')];
      const click=(text)=>{const b=buttons().find(b=>b.textContent===text);assert(b&&!b.disabled,'Enabled '+text);b.click();};
      fixtureState.game.fixture={state:'running'};fixtureNotify('game');
      assert(buttons().filter(b=>['Create backup','Restore','Delete','Export'].includes(b.textContent)).every(b=>b.disabled),'Running disables mutations');
      fixtureState.game.fixture={state:'preparing'};fixtureNotify('game');
      assert(buttons().find(b=>b.textContent==='Create backup').disabled,'Preparing disables create');
      fixtureState.game.fixture={state:'stopped'};fixtureNotify('game');
      click('Create backup');await wait(()=>document.body.textContent.includes('created.zip'));await wait(()=>!buttons().find(b=>b.textContent==='Export').disabled);
      click('Export');await wait(()=>calls.some(c=>c[0]==='worldBackups:export'));await wait(()=>!buttons().find(b=>b.textContent==='Restore').disabled);
      click('Restore');await wait(()=>document.body.textContent.includes('Restore world backup?'));
      assert(document.body.textContent.includes('automatic safety backup'),'Restore confirmation explains safety');
      assert(document.body.textContent.includes('Minecraft must be stopped'),'Stopped confirmation');
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 350));
    fs.writeFileSync(path.join(scratch, 'world-backups-confirm.png'), (await window.webContents.capturePage()).toPNG());
    const actions = await window.webContents.executeJavaScript(`(async()=>{
      const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
      const button=(text)=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
      button('Restore backup').click();await wait(()=>calls.some(c=>c[0]==='worldBackups:restore'));await wait(()=>!button('Delete').disabled);
      button('Delete').click();await wait(()=>button('Delete backup'));button('Delete backup').click();
      await wait(()=>calls.some(c=>c[0]==='worldBackups:delete'));await wait(()=>!button('Create backup').disabled);
      return calls.map(c=>c[0]);
    })()`);
    console.log(JSON.stringify({ renderer: 'PASS', checks: results, actions, screenshots: [path.join(scratch, 'world-backups-modal.png'), path.join(scratch, 'world-backups-confirm.png')] }, null, 2));
    fs.unlinkSync(fixture);
    window.destroy();
    app.exit(0);
  } catch (err) {
    console.error(err);
    window.destroy();
    app.exit(1);
  }
});
