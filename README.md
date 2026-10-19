# Pimpin Launcher

A custom Minecraft: Java Edition launcher in the style of Feather and Lunar, with its own UI and a built-in public library of **mods, shaders, resource packs, modpacks and server plugins**. Runs on **Windows 10/11** and **Linux**; macOS should work too but hasn't been tested.

![Pimpin Launcher home screen](docs/home.png)

## Features

- **One big PLAY button.** Pimpin downloads the game, libraries, assets and natives itself, plus the Java version each Minecraft release needs (Java 8, 17, 21 or 25). You don't need to install Java.
- **Instances.** Each instance is its own game folder with its own version, mod loader (**Vanilla, Fabric or Quilt**), mods, shaders, worlds, memory and Java settings. It handles old versions like 1.8.9 and the new `26.x` versions.
- **Client features (Feather/Lunar style).** Switch on curated features and the matching mods for your version are installed with their dependencies:
  FPS Boost (Sodium, Lithium, FerriteCore, Entity Culling, ImmediatelyFast), Shader Support (Iris), Zoom, Minimap, World Map, Freelook, 3D Skin Layers, Dynamic Lights, Better Animations, Better HUD, Connected Textures, Background FPS saver and Mod Menu.
  New Fabric/Quilt instances can include **Pimpin Essentials** (FPS Boost, Zoom and Mod Menu) automatically.
- **Public library** powered by [Modrinth](https://modrinth.com):
  - **Mods.** Search, filter to what's compatible, and install with one click. Required dependencies (Fabric API and others) come along automatically.
  - **Shaders.** Install any shader pack. Iris and Sodium are added for you.
  - **Resource packs.**
  - **Modpacks.** Install `.mrpack` modpacks (Fabric/Quilt) as a new ready-to-play instance.
  - **Plugins.** Install them onto a local Paper server.
- **Content manager.** Turn installed mods, shaders and packs on or off, remove them, or check for updates and update them all. Mods you drop into the folder by hand are identified automatically.
- **Local servers.** Create a [Paper](https://papermc.io), [Purpur](https://purpurmc.org) or Vanilla server, install plugins from the library, start/stop/restart it, type console commands, and **Join** with one click (it launches a matching instance and connects to `localhost`).
  - **Starter plugins** when you create a server: EssentialsX, LuckPerms, WorldEdit, Chunky, ViaVersion and Geyser + Floodgate (Bedrock players).
  - **Properties editor** for game mode, difficulty, max players, MOTD, PvP, whitelist, hardcore, view distance, seed and more. Offline accounts get a one-click fix if the server only allows Microsoft accounts.
  - **Players tab** shows who's online, operators, the whitelist and bans, with OP / kick / ban / pardon buttons.
  - **World backups.** Zip the world (even while the server runs) and restore it later.
  - Quick console buttons (save, day, clear weather, TPS, broadcast), command history, your **LAN address** to share with friends, uptime, plugin updates, auto-restart after a crash and custom JVM arguments.
- **Pimpin Client — our own mod (Fabric, Minecraft 1.21.4).** Turn it on in Client features and you get:
  - A HUD with FPS, coordinates, direction, biome, ping, speed, clock and your last death spot; keystrokes with CPS; armour durability. Position, size and colour are up to you.
  - A **minimap** (north-up, other players, death marker, cave view in the Nether). It only redraws when you move and only reads loaded chunks, so it costs almost nothing.
  - **Zoom** (hold Z, scroll to adjust, smooth).
  - An **FPS booster**: caps the frame rate while the game is in the background, plus a one-click fast-settings switch that remembers your old settings.
  - A built-in **mod menu** (Right Shift or the "✦ Pimpin" button on the title and pause screens): every mod with its icon, version, authors, description and website, search, and a shortcut to the mods folder.
  - Source in `mod/` (build with `gradle build` inside `mod/`); the launcher ships the built jar from `resources/mods/`.
- **Pimpin Specials: our own resource packs.** Two original packs drawn by the launcher itself (procedural textures, no Mojang art), built for each instance's Minecraft version (1.8.9 up to the newest) and switched on for you:
  - **Pimpin Performance** (16×): every animated texture made static, low fire, clear pumpkin/vignette/underwater overlays, clean low-noise blocks with easy-to-spot ores, minimal crosshair.
  - **Pimpin Pretty** (32×): rich stone, dirt, grass, sand, gravel, wood, leaves, bricks and snow, shiny gem ores, smooth animated water and lava, clear glass, plus a Pimpin sun, moon phases, crosshair and splash texts.
  - **Max FPS / Max Pretty** combos set everything up in one click (pack + game settings + matching mods; Max Pretty also installs and turns on the Complementary shaders).
  - **Game-settings presets** (FPS, Balanced, Pretty) write `options.txt` for you. Export either pack as a `.zip` to share, or run `npm run packs -- <version>`.
- **File browser.** Every instance and server has a Files tab: browse its folders, edit configs and `server.properties` in the launcher, rename, delete, make folders, and drag files in from your PC.
- **Accounts.** Sign in with Microsoft (the official Microsoft login window) to play online, or add offline accounts. Login tokens are encrypted with your OS keychain.
- **Worlds & screenshots.** Each instance lists its worlds. Press Play on one to load straight into it (1.20+), or use "Jump back in" on Home. Screenshots appear in a gallery.
- **Crash helper.** If the game crashes, a dialog shows the end of the log, the crash report and plain-English hints (incompatible mods, out of memory, wrong Java, graphics drivers).
- **Updater.** The Windows installer and the AppImage update themselves from GitHub Releases (turn automatic installs off if you like, or join the Beta channel). Portable, `.deb` and macOS copies get an "Update to x.y.z" button that downloads the right file. Release notes are shown before you update, and a "What's new" window after.
- **Made easy.** A first-run setup (sign in, pick a look, get a ready-to-play Max FPS or Max Pretty game), a **command palette** (Ctrl+K) to find any instance, server, page or action, keyboard shortcuts (F1), desktop notifications, a tray icon with quick Play, start with your PC, export/import instances as `.zip`, and "Update all" for the mods in every instance.
- **3D.** Your real skin is drawn as a 3D player on the home screen: drag to spin it, click to wave, and its head follows your mouse. Pick a pose (idle, walk, run, zombie, sit, dance), how it turns, and whether it stands on a glow or a grass block. There's also a title-screen style **3D panorama** (a floating voxel island with trees, water and a square sun), 3D block icons for the sidebar and instances, 3D page transitions and cards that tilt towards the cursor.
- **Make it yours.** One-click theme presets (Pimpin Modern, OG Minecraft, Nether, The End), or mix your own: Modern or **Classic Minecraft** style (stone buttons, dark panels, text shadows), a pixel font, rounded or blocky corners, backgrounds (glow, 3D panorama, dirt, Nether, End, plain), 10 accent colours or your own two, UI size, glass blur, animations, Minecraft-style click sounds, what Home shows and which page the launcher opens on. All block textures are drawn by the launcher itself.
- **Custom UI.** Frameless window, five accent themes, live game console with readable logs, Minecraft news, play-time tracking, and you can duplicate instances.

## Download

Every push to `main` publishes a new release with installers on the [Releases page](https://github.com/Nos-and-Stealzers/Pimpinminecraftlauncher/releases). Installed copies update themselves.

| Platform | File |
| --- | --- |
| Windows 10/11 | `PimpinLauncher-Setup-x.y.z.exe` (installer) or `PimpinLauncher-Portable-x.y.z.exe` |
| Linux | `PimpinLauncher-x.y.z-linux-x86_64.AppImage` or `.deb` |

> The Windows build isn't code-signed yet, so SmartScreen may warn you the first time. Click "More info" → "Run anyway".

## Run from source

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm start          # run the launcher
npm run check      # syntax-check all sources
npm run packs      # write the Pimpin resource packs to dist/packs
npm run dist:win   # build Windows installer + portable exe (run on Windows)
npm run dist:linux # build AppImage + deb
```

## Where things are stored

| OS | Folder |
| --- | --- |
| Windows | `%APPDATA%\.pimpinlauncher` |
| Linux | `~/.local/share/pimpinlauncher` |
| macOS | `~/Library/Application Support/pimpinlauncher` |

Inside that folder, `instances/` and `servers/` hold your game folders, `shared/` holds versions, libraries and assets shared by all instances, and `runtimes/` holds the downloaded Java runtimes. Set the `PIMPIN_ROOT` environment variable to use a different folder.

## How it works

```
src/main/        Electron main process (Node)
  minecraft.js   version resolution, Fabric/Quilt profiles, downloads, natives, launch arguments
  java.js        Java runtimes (Mojang's official runtimes, Adoptium fallback)
  auth.js        Microsoft (msmc) + offline accounts
  modrinth.js    Modrinth API client
  content.js     install/remove/update mods, shaders, packs & plugins, dependency resolution, client features
  instances.js   instances, game process, modpacks
  servers.js     Paper/Purpur/Vanilla servers, properties, players, backups, console
  files.js       file browser for instance & server folders
  packs.js       Pimpin resource packs, options.txt presets
  pack-art.js    procedural textures for the packs (png.js encodes them)
  main.js        window + RPC bridge
src/renderer/    the UI (plain HTML/CSS/JS modules, no framework)
  js/fx3d.js     CSS-3D player model, blocks and card tilt (no WebGL needed)
  js/panorama.js 3D floating-island background
  js/textures.js procedural 16×16 block textures
  js/appearance.js themes, backgrounds, scale and click sounds
  fonts/         Pixelify Sans (SIL Open Font License)
  js/files.js    file browser UI
```

## Not supported yet

- Forge and NeoForge (instances and modpacks). Fabric and Quilt are supported.
- Code signing.
- Auto-update for the portable exe and the `.deb` (download a new copy instead).

Pimpin Launcher is not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang Studios.
