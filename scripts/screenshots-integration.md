# Screenshot manager integration (parent-owned files)

No changes to main.js, instances.js, pages/instances.js, CSS, package.json or workflows were made by this worker.

## src/main/main.js

Add `clipboard` to the existing Electron destructure:

```js
const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, clipboard } = require('electron');
```

After `store` is loaded (before `handlers`):

```js
const { createScreenshots } = require('./screenshots');
const screenshots = createScreenshots({
  instancesRoot: store.dirs.instances,
  nativeImage,
  clipboard,
});
```

Add to the `handlers` object:

```js
'screenshots:list': (id) => screenshots.list(id),
'screenshots:favorite': (id, name, on) => screenshots.favorite(id, name, on),
'screenshots:delete': (id, name) => screenshots.remove(id, name),
'screenshots:copy': (id, name) => screenshots.copy(id, name),
'screenshots:export': (id, name) => screenshots.exportWithDialog(
  id, name, (options) => dialog.showSaveDialog(win, options),
),
```

**Do not bind `exportTo`, `bytes`, or a destination parameter to RPC.** The export handler's two-argument signature ignores any renderer-supplied third argument; the only destination reaching `exportTo` comes from the main-process dialog callback. `exportTo` uses `wx`: existing destinations, source images and destination symlinks are not overwritten. Cancel returns `{ exported: false }` without writing.

Replace the existing legacy handlers too, so their old unguarded implementations are no longer reachable through IPC:

```js
'instances:screenshots': async (id) => (await screenshots.list(id)).screenshots,
'instances:deleteScreenshot': (id, name) => screenshots.remove(id, name),
```

The unused primitive implementations can be removed from instances.js by the parent, but that is not required for the new manager. Do not retain the original unsafe delete RPC.

## src/renderer/js/pages/instances.js

Add:

```js
import { renderScreenshots } from '../screenshots.js';
```

Replace the screenshot dispatch line inside `drawBody` with:

```js
if (tab === 'screenshots') offTab = renderScreenshots(body, inst);
```

Existing `offTab?.()` at the top of `drawBody`, and the detail page's returned cleanup, already provide the necessary lifecycle. Delete the old `drawScreenshots` function. The new function returns a synchronous cleanup, not a Promise; cleanup removes keyboard listeners, preview/confirmation dialogs and prevents late requests from repainting a different tab.

## CSS

Append the **entire contents of `scripts/screenshots.css`** to the parent-owned `src/renderer/css/app.css`. The standalone harness already tests that exact stylesheet together with the real app.css. No new runtime stylesheet link is needed after appending it.

## IPC schema

All arguments are positional via existing `window.pimpin.call(channel, ...args)`; existing RPC wrappers handle errors.

| Channel | Arguments | Return |
| --- | --- | --- |
| screenshots:list | id:string | `{ screenshots: [{ name, url, time, size, width, height, favorite }], skipped:number }` |
| screenshots:favorite | id:string, name:string, on:boolean | `{ name, favorite:boolean }` |
| screenshots:delete | id:string, name:string | `{ removed:true }` |
| screenshots:copy | id:string, name:string | `{ copied:true }` |
| screenshots:export | id:string, name:string | `{ exported:boolean }` |

`time` is file mtime in epoch milliseconds (displayed as a local timestamp), size is bytes. This is a PNG screenshot manager; JPEGs and other non-PNG files are left alone. Invalid/unsafe PNGs are skipped and counted, never rewritten/deleted by listing. Preview URLs point at the original validated files, without shared thumbnail caches. Full-size preview uses natural image dimensions inside a scrollable native HTML dialog, not resampled output. Left/Right browse only the active manager's filtered/sorted selection and do not steal arrows from search/select inputs. Navigation stops at list ends.

Favorites are a serialized, atomically replaced name array in `<instance>/.pimpin-screenshot-favorites.json`, not in image metadata. Favorites survive refresh and restart, and remain separate across instances. No account/store initialization or Electron require happens when importing the backend module in Node tests. Only `copy`, called by main, invokes the injected nativeImage/clipboard APIs.

Safety limits: 64 MiB compressed PNG, 64 million pixels, at most 32768 pixels per side and 256 MiB decoded scanlines. CRCs, chunk ordering, bounded deflate, scanline filters, palette indices and Adam7 layout are checked. Paths are single components; Windows reserved names, ADS, traversal, symlinks/junctions, hardlinks, directories and changing read handles are rejected. No bulk delete API exists. Only explicit single-file `remove` unlinks an original.

## Verification commands (Git Bash on this workstation)

The tool shell's default TMPDIR was not the documented Hermes scratch. Set it explicitly; do not use the shared default or point tests at real instances:

```sh
TMPDIR='C:/Users/lucas/AppData/Local/hermes/cache/scratch' node --test scripts/screenshots.test.js
TMPDIR='C:/Users/lucas/AppData/Local/hermes/cache/scratch' env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron scripts/screenshots-preview.js
node scripts/check.js
```

The renderer harness creates its own scratch Electron profile and synthetic PNGs, uses a dynamic loopback HTTP port (no CDP/debugger port, never 9341), real preload/module/app CSS, isolated mock RPC/dialog and a nativeImage clipboard spy. It verifies image decoding and bitmap copy without altering the user's system clipboard. Native Save dialog interaction itself remains an integration check for the parent; the fixture asserts its callback options and byte-exact destination writes.
