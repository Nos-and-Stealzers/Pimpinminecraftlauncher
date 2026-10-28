# Where files belong

There are two separate trees: **source code** (the project you build) and **user
data** (your installed games and preferences). Editing source is not needed to
change a theme. Start with [CUSTOMIZATION.md](CUSTOMIZATION.md).

## Source tree

```text
Pimpinminecraftlauncher/
├── package.json              App entry, dependencies and npm commands
├── package-lock.json         Exact dependency resolution
├── VERSION                   Release version input
├── README.md                 Setup, features and storage overview
├── src/
│   ├── main/                 Electron/Node services and disk access
│   │   ├── main.js           Window, native dialogs and whitelisted RPC handlers
│   │   ├── preload.js        Isolated bridge from UI to main process
│   │   ├── store.js          PIMPIN_ROOT, settings.json and JSON persistence
│   │   ├── appearance-settings.js  Appearance defaults and normalization
│   │   ├── appearance-presets.js   Pure appearance JSON import/export validation
│   │   ├── presence.js       Optional Discord IPC lifecycle and recovery
│   │   ├── presence-preferences.js  Typed privacy and application-ID validation
│   │   ├── client-settings.js     Per-instance Pimpin Client config editor
│   │   └── pack-art/         Original resource-pack texture painters
│   └── renderer/
│       ├── index.html        Actual launcher page loaded by the Electron window
│       ├── css/app.css       Shared styles, colours and layout
│       ├── js/appearance.js  Applies validated theme, scale and motion settings
│       ├── js/state.js       UI settings/state and RPC access
│       ├── js/pages/         Screens, including settings.js
│       ├── themes/minecraft/ Optional, removable Minecraft style (see below)
│       ├── fonts/            Bundled heading fonts and licence
│       └── img/              Launcher images
├── mod/                      Pimpin Client Java source and Gradle builds
│   ├── src/                  Shared client source
│   └── versions/             Per-Minecraft-version subprojects
├── resources/                Bundled runtime content, including built mod jars
├── scripts/                  Node/Python checks, test fixtures and generators
├── docs/                     Guides and screenshots
├── build/                    Installer/build artwork, not game data
└── .github/workflows/        CI builds and release automation
```

The root `index.html` is not the launcher's Electron window entry;
`src/renderer/index.html` is. Main-process services include accounts (`auth.js`),
instances, servers, downloads, content, wardrobe, screenshots and world backups.
Keep additions next to the service they extend instead of creating a second
settings system.

For appearance work, the small path is: shared defaults/validation in
`appearance-settings.js` → store settings → `renderer/js/appearance.js` →
`renderer/css/app.css`. Settings controls live in `renderer/js/pages/settings.js`
(left section list, `section()` → `group()` → `row()`; section ids such as
`#set-appearance` are deep-link targets for `navigate('settings', { section })`).

The optional Minecraft style is self-contained in `renderer/themes/minecraft/`:
`index.js` (apply/disable and its Settings rows), `textures.js` (original
procedural 16×16 textures and isometric block icons), `panorama.js` (2D canvas
floating-island/one-block scene), `mobs.js` (world-specific walking visitors), `scene.js` (scene layout and
background details), `blocks.js` (sidebar/instance block icons, card tilt), `skin.js`
(poses, turning and stand via the `onSkinMount` hook in `js/skin3d.js`) and
`theme.css` (every rule scoped to `body[data-mc]`). Only `js/appearance.js`
refers to the folder, through a dynamic `import()` with a `.catch`, so deleting
the folder leaves the launcher working. Its `mc*` keys are validated in
`appearance-settings.js` like every other appearance key. Test it with
`npm run test:electron-minecraft`.
Preset parsing belongs in `appearance-presets.js`; native dialogs and persistence
do not. The **Import appearance preset**, **Export appearance preset** and
**Show file** actions are described in the customization guide.

Generated/local folders such as `node_modules/`, `dist/`, Gradle `build/` folders
and test screenshots are not the place to make permanent source changes. Change
the generator/source and rebuild instead. `resources/mods/` contains packaged mod
outputs; edit Java under `mod/src/`, not a jar.

## User-data tree

`ROOT` below means the active `PIMPIN_ROOT` or the platform default, **not** the
source checkout or installation directory. Exact defaults are in CUSTOMIZATION.md
and `src/main/store.js`.

```text
ROOT/
├── settings.json             Launcher settings; appearance keys are top-level
├── accounts.json             Private account storage; never share or theme-edit
├── notifications.json        Launcher notification history/state
├── instances/<id>/           One Minecraft game directory per instance
│   ├── pimpin-instance.json  Launcher-managed instance metadata
│   ├── config/               Mod preferences, including pimpin-client.json
│   ├── mods/                 Installed mod jars
│   ├── resourcepacks/        Resource-pack ZIPs
│   ├── shaderpacks/          Shader ZIPs and related settings
│   ├── options.txt           Minecraft options
│   ├── saves/                Your worlds; back these up
│   ├── screenshots/          Your game screenshots
│   ├── logs/                 Game logs
│   └── pimpin-backups/       World backup/recovery data outside saves/
├── servers/<id>/             Separate local server directory
│   └── pimpin-server.json    Launcher-managed server metadata
├── shared/                   Shared downloaded game files
│   ├── versions/
│   ├── libraries/
│   ├── assets/
│   └── natives/
├── runtimes/                 Downloaded Java runtimes
├── cache/                    Cached downloads/metadata
└── logs/                     Launcher-related logs
```

Entries appear as their features are used; this is a practical map, not an
exhaustive list of every generated file. Appearance presets are saved wherever
you choose in the Save dialog, not in a mandatory extra preset directory.

## What is safe to edit?

| File or folder | Guidance |
| --- | --- |
| Exported appearance preset | Best file to edit/share. Small allowlist; no account data. |
| `settings.json` | Advanced local edits only. Close launcher, back up, preserve unrelated keys, restart. Do not share the whole file. |
| Instance `config/` and `options.txt` | User preferences, but stop the game/server and back up first. Prefer built-in editors. |
| `saves/`, server worlds, backup archives | Valuable user data, not scratch space. Use backup/restore tools; never test deletion here. |
| `accounts.json` | Private. Leave to the launcher; do not edit, share or use for presets. |
| `pimpin-instance.json`, `pimpin-server.json` | Managed metadata. Prefer the launcher instead of manual changes. |
| `shared/`, `runtimes/`, `cache/` | Managed downloads/cache, not customization sources. Do not alter them for appearance changes. |
| `src/`, `mod/`, `scripts/` | Developer source. Changes need tests/builds and are separate from user preferences. |

`config/pimpin-client.json` controls the in-game mod, not the launcher. Its HUD
layouts and waypoints are not part of appearance presets. Likewise, resource
packs, shaders and wardrobe skins are separate from the window theme.

## Lean development checks

Use a disposable absolute `PIMPIN_ROOT` set **before** starting Electron or
requiring `store.js`. That module creates its data directories when loaded. Never
point tests at your usual launcher data, worlds or accounts. Disk-writing test
fixtures should also use the designated scratch `TMPDIR`.

```bash
node --test scripts/appearance-presets.test.js
npm run check
```

The preset tests need only Node's built-in test runner: no Electron launch,
network, extra dependency, browser or sign-in. Full launcher tests are under
`scripts/`; `npm test` runs the suite configured in `package.json`. UI/native-dialog
integration needs its own isolated Electron check; pure parser tests do not prove
that the buttons or OS dialogs are wired correctly.
