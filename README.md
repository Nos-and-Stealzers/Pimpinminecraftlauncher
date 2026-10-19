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
- **Local servers.** Create a [Paper](https://papermc.io) server, install plugins from the library, start and stop it, type console commands, and **Join** with one click (it launches a matching instance and connects to `localhost`).
- **Accounts.** Sign in with Microsoft (the official Microsoft login window) to play online, or add offline accounts. Login tokens are encrypted with your OS keychain.
- **Custom UI.** Frameless window, five accent themes, live game console with readable logs, Minecraft news, and play-time tracking.

## Download

Every push builds installers in GitHub Actions (**Actions → Build → Artifacts**). Pushing a tag like `v0.1.0` attaches them to a GitHub Release.

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
  servers.js     Paper servers, plugins, console
  main.js        window + RPC bridge
src/renderer/    the UI (plain HTML/CSS/JS modules, no framework)
```

## Not supported yet

- Forge and NeoForge (instances and modpacks). Fabric and Quilt are supported.
- Code signing and auto-update.

Pimpin Launcher is not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang Studios.
