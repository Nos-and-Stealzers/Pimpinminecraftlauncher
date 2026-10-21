# Wardrobe integration

No main.js/app.js/CSS/state/auth/package files were edited by the wardrobe worker.

## Main-process RPC map

```js
const wardrobe = require('./wardrobe');
// Add to the existing RPC handlers object (arguments are already spread by rpc).
'wardrobe:list': () => wardrobe.listSkins(),
'wardrobe:select': (options) => wardrobe.selectSkin(options),
'wardrobe:import': (options) => wardrobe.importSkin(options),
'wardrobe:export': (options) => wardrobe.exportSkin(options),
'wardrobe:delete': (options) => wardrobe.deleteSkin(options),
```

Exports from `src/main/wardrobe.js`:
- `listSkins() -> Promise<{ skins, selected: {id, model} }>`
- `selectSkin({id, model?}) -> Promise<snapshot>`
- `importSkin({name?, dataUrl?, bytes?, model? = 'classic'}) -> Promise<snapshot>`
- `deleteSkin({id}) -> Promise<snapshot>`; imported IDs only
- `exportSkin({id}) -> Promise<{ name, dataUrl }>`; exact original bytes for imports, not an arbitrary file write
- `createWardrobe(root)` creates an isolated service with the five methods above (used by tests).
- `decodeSkinPNG(Buffer) -> {width,height,pixels}` decodes/validates PNG, packed and 16-bit colors, transparency, all filters and Adam7. No new packages.
- `MAX_BYTES = 262144`, `MAX_IMPORTS = 64`.

Skin records contain `id,name,model,imported,height,description,dataUrl`, plus `outfit` for built-ins. Six built-in IDs: `builtin-explorer`, `builtin-mechanic`, `builtin-ranger`, `builtin-hoodie`, `builtin-astronaut`, `builtin-knight`. Ranger and hoodie are slim; others classic. IDs for imports are opaque random names, never user filenames.

Persistence is separate from packs/accounts: `<dirs.root>/wardrobe/wardrobe.json` and `<dirs.root>/wardrobe/imports/import-<random>.png`. Selection is wardrobe-local and never writes settings.activeAccount or account skin state. RPC payload never contains an upload token or a destination path.

## Renderer

Import the page module like existing pages:

```js
import * as wardrobePage from './pages/wardrobe.js';
// Wire route 'wardrobe' to wardrobePage.render.
```

Signature: `render(pageElement, params = {}, navigate) -> cleanupFunction` (synchronous, loads async). Call returned cleanup when navigating away. Existing `shell:openExternal` is used for the Minecraft.net link, shown only for the active `msa` account. Existing preload already supports generic rpc; no preload edits needed.

`skin3d.js` stays backward compatible: `mountSkin(root, player, scale)` unchanged. New `mountSkinTexture(root, dataUrl, {scale=6,model='classic'|'slim',interactive=true})` returns a cleanup function with `.rotateBy(degrees)` and `.rotateTo(degrees)` for interactive previews. Static gallery uses no animation-frame loops or window pointer listeners.

Wardrobe page includes essential layout inline, uses existing flat theme variables (`--bg-1`, `--line`, `--accent`) and existing classes `btn`, `primary`, `ghost`, `sm`, `muted`. Existing `.mc-*` rules render the 3D models.

Custom classes available for parent CSS: `.wardrobe-page`, `.wardrobe-notice`, `.wardrobe-toolbar`, `.wardrobe-status`, `.wardrobe-layout`, `.wardrobe-gallery`, `.wardrobe-card`, `.wardrobe-card.selected`, `.wardrobe-card-model`, `.wardrobe-selected`, `.wardrobe-details`, `.wardrobe-preview`, `.wardrobe-rotation`, `.wardrobe-actions`.

Recommended small additions to app.css (not made here):

```css
.wardrobe-page h1 { margin: 0; font-size: 22px; font-weight: 600; }
.wardrobe-page .page-head p { margin: 4px 0 0; }
.wardrobe-card:hover { background: var(--bg-2) !important; }
.wardrobe-card .mc-model .part { animation: none; }
.wardrobe-page select { padding: 7px 10px; background: var(--bg-2); border: 1px solid var(--line); border-radius: 6px; width: 100%; }
@media (max-width: 1000px) {
  .wardrobe-layout { grid-template-columns: 1fr !important; }
  .wardrobe-details { min-width: 0 !important; }
}
```

## Verification and artifacts

- `node scripts/wardrobe-test.js`: Node assert suite for original skins, real decode, valid/invalid imports, size/count limits, legacy, persistent model choice, export byte equality, path traversal, safe display/export names, delete restrictions, concurrent writes.
- `env -u ELECTRON_RUN_AS_NODE WARDROBE_OUTPUT='C:/Users/lucas/AppData/Local/hermes/cache/scratch/wardrobe-preview' ./node_modules/.bin/electron scripts/wardrobe-preview.js`: isolated Electron harness, existing preload and renderer CSS, real RPC service, native PNG decode, real 3D faces, slim/classic geometry, selection/rotation/persistence, FileReader import, byte-exact native download and confirmed UI delete. Uses its own dynamic HTTP port; no shared Electron debugging port and no effect on parent session.
- Harness writes `wardrobe-ui.png`, `wardrobe-contact-sheet.png` and all six `wardrobe-<id>.png` under WARDROBE_OUTPUT. No source art copied from existing skins or external assets.

UI explicitly says selection is preview/export only. Online skin changes must be made manually on Minecraft.net after export; no automatic uploads and no implied offline/in-game replacement.
