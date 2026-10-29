# Make the launcher yours

Appearance settings change the launcher window, not Minecraft's HUD or graphics.
Use **Settings → Appearance** for themes, accent colours, gradients, heading font,
interface and text size, spacing, sidebar layout and reduced motion. **Reset
appearance** restores these choices without resetting accounts or game settings.
No extra app, plugin, account or credentials are needed to customize the launcher.

Settings has a section list on the left (with **Search settings**) and one
scrolling column on the right. Appearance is split into Theme and colour,
Gradient, Layout and text, Minecraft style, and Presets and reset. Search stays
applied when optional controls load or redraw; Escape clears it. Section links
and keyboard navigation keep headings visible below the sticky navigation in
narrow windows. Imported scene speeds such as `0.85` appear as an explicit
custom dropdown value rather than a blank choice.

## Optional Minecraft style

**Settings → Appearance → Minecraft style** is off for every install, new or
old. Old settings files from before the v3 redesign (`background`, `blockIcons`,
`effects3d`, `skinPose` and similar keys) are ignored and never switch it on.
Turn on **Minecraft style** to get:

- **Preset**: Overworld, Nether or End. Sets the Home panorama, the background
  tiles and the Home sidebar block.
- **Background**: a slowly turning floating island on Home (other pages use
  darkened block tiles), block tiles everywhere, or none.
- **Sky scene**: Floating island or One block. Both use the selected world's
  sky and blocks. These controls apply only to the Home panorama.
- **Wandering mobs**: sheep in the Overworld, pigmen in the Nether, Endermen in
  the End. Switch them off separately, choose one to three visitors, and choose
  Slow, Normal or Lively scene speed. They stay behind the UI in the panorama
  band and freeze along with the scenery when reduced motion is on.
- **Buttons**: stone or dark oak pixel buttons with bevels. Play and other
  accent buttons keep your accent colour and gradient under a faint pixel grain.
- **Corners** (blocky or rounded), **Pixel font** (headings and buttons, all
  text, or off), **Block icons** for the sidebar and instance icons (custom
  instance images are kept) and **Card tilt** (off by default).
- **Skin pose**, **Skin turning** and **Skin stand** for the 3D skin on Home.

All textures are original and drawn by code at runtime. There are no sound
effects. The island is a plain 2D canvas (no WebGL); it only animates on Home
while the window is visible and stays still with reduced motion. **Turn off and
reset** switches the style off and restores only its own choices.

To remove it completely, delete `src/renderer/themes/minecraft/`. The launcher
loads that folder only through a guarded dynamic import, so it keeps working and
the Minecraft style block disappears from Settings.

## Share a look, not your private settings

In **Settings → Appearance**, use **Import** or **Export** in the Appearance
presets row. Import and export use your OS's normal Open/Save dialogs. In
**Settings → Launcher**, **Show file** reveals the active `settings.json` in the
file manager. Integration lives in the main process; the preset module itself
never opens files.

- **Export appearance preset** saves a small, readable `.json` file with only the
  supported appearance keys below. This is the file to share.
- **Import appearance preset** opens a preset and applies only its appearance
  values after validation/confirmation. A partial preset leaves omitted settings
  alone. Canceling or rejecting a file should leave settings unchanged.
- **Show file** reveals the active `settings.json` in your file manager; open it
  with your preferred text editor. Quit the launcher before saving manual edits,
  then restart it. Running launchers can overwrite external edits.
- Exports create a **new** file; choose a fresh filename if it already exists.
  This prevents accidentally overwriting account files, saves or other settings.

A preset is not a copy of `settings.json`. Accounts, tokens, file paths, Discord
application IDs, Java/memory options and all other non-appearance settings are
excluded from export and rejected on import. Presets cannot include CSS, scripts,
fonts to download or extra files. Do not share your whole data folder or
`settings.json`; use an exported preset instead.

## Edit a preset in any text editor

This complete example changes four settings and leaves the others alone:

```json
{
  "schema": "pimpin-appearance",
  "version": 1,
  "appearance": {
    "uiStyle": "midnight",
    "accent": "custom",
    "customA1": "#45aaff",
    "animations": false
  }
}
```

Keep the envelope exactly as shown. `appearance` must contain at least one of
these keys. Colours accept uppercase or lowercase hex; exports use lowercase.

| Key | Accepted values | Default |
| --- | --- | --- |
| `uiStyle` | `modern` (Dark), `midnight`, `light`, `system` | `modern` |
| `accent` | `violet`, `blue`, `green`, `orange`, `red`, `pink`, `custom` | `violet` |
| `customA1` | `#` plus six hex digits; used with `accent: "custom"` | `#8f5cf7` |
| `font` | `default` (system headings), `pixel` | `default` |
| `uiScale` | Whole number, 80–130 percent | `100` |
| `animations` | `true` or `false`; false reduces motion | `true` |
| `density` | `comfortable`, `compact` | `comfortable` |
| `textSize` | Whole number, 90–120 percent | `100` |
| `sidebarWidth` | Whole number, 190–300 pixels | `232` |
| `sidebarMode` | `auto`, `expanded`, `compact` | `auto` |
| `gradient` | `true` or `false` | `true` |
| `customA2` | Second gradient colour, six-digit hex | `#ff4fb8` |
| `gradientAngle` | Whole number, 0–360 degrees | `135` |
| `mcStyle` | `true` or `false`; master switch for the Minecraft style | `false` |
| `mcPreset` | `overworld`, `nether`, `end` | `overworld` |
| `mcBackground` | `panorama`, `tiles`, `plain` | `panorama` |
| `mcScene` | `island`, `oneblock` | `island` |
| `mcMobs` | `true` or `false`; only in the Home panorama | `true` |
| `mcMobCount` | Whole number, 1–3 | `2` |
| `mcSceneSpeed` | Number, 0.5–1.5; UI offers 0.5, 1, 1.5 | `1` |
| `mcButtons` | `stone`, `wood` | `stone` |
| `mcCorners` | `blocky`, `rounded` | `blocky` |
| `mcFont` | `headings`, `all`, `system` | `headings` |
| `mcBlockIcons` | `true` or `false` | `true` |
| `mcTilt` | `true` or `false` | `false` |
| `mcSkinPose` | `idle`, `walk`, `run`, `zombie`, `sit`, `dance` | `idle` |
| `mcSkinTurn` | `still`, `sway`, `spin` | `sway` |
| `mcSkinPedestal` | `none`, `grass` | `grass` |

The `mc*` keys other than `mcStyle` only take effect while `mcStyle` is `true`.

System reduced-motion preferences also reduce animations. Auto sidebar layout
can collapse the sidebar in a narrow window. Use `gradient: false` for flat accent
surfaces. A colour string is data, not arbitrary CSS.

Imports reject malformed JSON, unknown keys (even at the top level), invalid
values, unsupported versions, and input above 16 KiB of UTF-8 text. Numbers are
numbers, not quoted strings. JSON has no comments or trailing commas. Fix the
file and retry; do not paste your entire settings file into the preset.

## Optional Discord Rich Presence

Keep **Discord Rich Presence** on (Settings → Launcher), open the Discord
desktop app and launch a game. There is nothing to paste or register. If presence
is unavailable in your build, the status row says so; turning on the switch does
not configure the integration.

The launcher uses local Discord IPC, not a Discord account login. Without an
available integration and a running game, it makes no presence connection.
Browser-only Discord is not a local IPC peer. Discord's activity-sharing controls can also hide your status.

Three independent toggles control what is shared:

| Settings key | Meaning | Default |
| --- | --- | --- |
| `discordRich` | Enable presence when configured and playing | `true` |
| `discordShowInstance` | Include the instance name; off uses Playing Minecraft | `true` |
| `discordShowVersion` | Include Minecraft version and loader | `true` |
| `discordShowElapsed` | Include session elapsed time | `true` |

Server addresses and account metadata are not included. If you put private
information into an instance name, switch off **Show instance name**. Multiple
running games show the newest session and a count of the others. Connections
retry automatically while playing, including after Discord restarts. **Refresh**
rechecks the current status; changing a privacy toggle applies without relaunching
the game. Turning presence off or closing the last game clears the connection.
The status row is a snapshot; click Refresh to recheck it.

## Window recovery

The launcher restores its saved window size and position, but discards a saved
position when its titlebar would be unreachable on the current displays. This
recovers windows saved on a monitor that has since been disconnected. Valid
negative coordinates on a second monitor are kept. Empty coordinates use normal
OS placement instead of forcing the desktop's top-left corner.

A stale `--hidden` startup argument only hides the launcher if a tray icon
actually exists to reopen it. With tray behavior disabled, the window appears
normally so the launcher cannot become an invisible background process.

## Remote servers

**Servers → Remote** watches and controls servers that do not run in this
launcher. Everything is optional; with no connections nothing runs in the
background. Pick a type with **Connect**:

| Type | What you need | What works |
| --- | --- | --- |
| Hosting panel | Panel address and a *client* API key (Account → API credentials). Pterodactyl and Pelican panels. | Status, CPU/memory/disk/uptime, start/stop/restart/kill, commands, live console |
| Another PC with Pimpin | That PC's address, port and pairing token from **Share this PC** | Status, start/stop/restart, commands, log, players and ops |
| RCON | `enable-rcon=true`, `rcon.port` and `rcon.password` in `server.properties` | Commands with their replies, players via `list`, stop |
| Address only | Just the address | Online, players, version, MOTD, icon and latency |

Every type also pings the game address (like the multiplayer screen) and
**Join** starts a matching instance straight into the server. Passwords, API
keys and tokens are encrypted with your system keychain (Electron
`safeStorage`) in `remote-secrets.json` and never shown again; if secure
storage is unavailable the launcher refuses to save them instead of storing
plain text. Panel addresses must use `https://` unless they are on your own
network.

**Share this PC** (Servers → This PC) is off by default. Turning it on starts a
small HTTP API on port 25590 that lets another Pimpin Launcher start, stop and
restart this PC's servers, send console commands and read logs and players. It
cannot delete servers, touch files, change properties or restore backups.
Requests need the pairing token; five wrong tokens lock that address out for a
while, and **Regenerate** revokes the old token. The connection is plain HTTP:
use it on a network you trust, or reach the PC over a VPN such as Tailscale
rather than forwarding the port to the internet. Windows may ask to allow the
launcher through the firewall the first time.

Limits: RCON has no live log (Minecraft only sends command replies), the panel
console needs the panel's websocket to accept the launcher (it sends the panel
address as `Origin`), and only Java Edition servers answer the status ping.

## Editing your own files

The active data folder is chosen by `PIMPIN_ROOT`, if set before starting the
launcher. Otherwise it is:

| OS | Default data folder |
| --- | --- |
| Windows | `%APPDATA%\.pimpinlauncher` |
| macOS | `~/Library/Application Support/pimpinlauncher` |
| Linux | `$XDG_DATA_HOME/pimpinlauncher`, or `~/.local/share/pimpinlauncher` |

`PIMPIN_ROOT` is an environment variable, not a `settings.json` key. Changing it
selects a different data folder; it does not move existing instances or accounts.
A new empty root starts with separate settings. Use a disposable absolute root
for development, not your everyday game folder.

Back up `settings.json` before hand-editing it, close the launcher, change only
the keys you understand, save valid JSON and restart. Appearance keys live
**directly at the top level** in this file, unlike a preset's nested `appearance`.
Keep unrelated keys intact. Startup normalizes invalid appearance values to safe
defaults or limits; malformed JSON falls back to defaults, so restore your backup
rather than continuing to save over a broken file.

For in-game changes, use the instance's client-settings editor or the in-game
Pimpin settings. Its `config/pimpin-client.json` is separate from launcher
`settings.json`; it also contains saved HUD/layout data. Stop Minecraft before
manual config edits. Back up worlds before any save changes. Never hand-edit
`accounts.json`, downloaded libraries, or launcher-managed instance metadata to
change a theme.

See [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md) for the file map.

## Integration setup (maintainers only)

Players are not asked to create developer applications, obtain API keys or open
service consoles. The Library uses Modrinth only. CurseForge support was removed:
a `curseforgeApiKey` saved by an older version is dropped from `settings.json` on
the next save, CurseForge modpack `.zip` files are refused with a pointer to the
`.mrpack` version, and mods an older version installed from CurseForge stay
installed as local files (no update checks).

Discord uses the public application ID in `src/main/discord-app.json`. Maintainers
must supply a valid registered application ID for presence to work. Empty or
missing IDs leave presence honestly unavailable. The legacy `discordAppId` setting
still overrides the build ID for compatibility, but has no consumer-facing control.
No bot token, account token, client secret or Discord login is needed.

## Developer wiring

`src/main/appearance-presets.js` exports these CommonJS APIs:

- `parsePreset(text)` returns a validated **partial appearance patch**, or throws
  an error. Pass only that result to `store.updateSettings(patch)` after import
  confirmation. It performs no disk access and does not import `store.js`.
- `serializePreset(store.getSettings())` returns formatted JSON plus a newline,
  projected to known appearance keys and normalized through
  `appearance-settings.js`. It does not mutate settings.
- `MAX_PRESET_BYTES` is `16384`. Enforce a bounded file read in the main handler
  as well; parser validation alone cannot prevent allocating an enormous file.

Wire `settings:importAppearance` and `settings:exportAppearance` to native Open/Save
JSON dialogs in `main.js`, with cancellation and errors handled before any
settings mutation. Never use a filename or path from preset content. After a
successful import, refresh renderer settings/apply appearance and redraw the
controls. Keep **Show file** pointed at `store.dirs.root/settings.json`,
not a renderer-supplied path. No authentication belongs in any of these flows.

Run the pure preset tests with:

```bash
node --test scripts/appearance-presets.test.js
```
