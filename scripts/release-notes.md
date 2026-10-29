# What's new in 0.1.34

## Remote servers
- The Servers page now has a This PC / Remote switch. Use Connect to add a server that isn't running on this PC:
  - Hosting panel (Pterodactyl or Pelican, the panel most Minecraft hosts use): live console, commands, Start/Stop/Restart/Kill, CPU, memory, disk and uptime. It uses your own client API key from the panel's account page.
  - Another PC running Pimpin Launcher: turn on Share this PC on the PC hosting the server, then enter its address and pairing token on the other PC to see its servers and start, stop, restart or run commands on them.
  - RCON: send commands and see who's online on any server with RCON turned on.
  - Address only: watch any server's status, player count, version and message of the day.
- Every remote server can be joined in one click with a matching instance.
- Passwords, API keys and pairing tokens are stored with the system keychain and never shown in the app again. Share this PC is off by default. It uses an unencrypted connection, so use it on your home network, or reach it over Tailscale or a forwarded port.

## CurseForge removed
- The Library uses Modrinth only. Mods you installed from CurseForge stay installed and work like files you added yourself. CurseForge modpack .zip files are no longer imported; use the .mrpack version of the pack.

## Sky scenes and wandering mobs
- New sky scenes in Settings > Appearance > Minecraft style: a floating sky island with distant islands, or a single suspended block with a flower, crimson mushroom or chorus detail.
- Wandering mobs follow the selected world: sheep in the Overworld, golden-sword pigmen in the Nether, purple-eyed Endermen in the End.
- Separate controls for mobs on/off, one to three visitors, and Slow/Normal/Lively scene speed. All scene settings work with appearance preset import/export and the Minecraft-style reset.
- Animation pauses away from Home, when the window is hidden, or with reduced motion.

## Fixes
- Settings search now really hides controls that don't match, including optional controls that load later. Section navigation keeps headings below the sticky bar.
- Saved windows on a disconnected monitor come back on screen, and hidden startup without a tray icon no longer leaves the launcher invisible.
- Packaged builds include the missing window/tray icon.
- The new Windows uninstaller only removes the app's own files and explains what it keeps. See docs/INSTALLATION.md.

Minecraft style stays optional and off unless enabled. No added npm dependencies, telemetry or sounds.

Upgrade caution: upgrading can run the OLD uninstaller, which the new retention changes can't affect. Back up any personal files you put inside the old app installation folder. The normal launcher data folder is outside it.

Remote servers are verified against local test servers only, not yet against a real hosting panel, a real RCON server or two real PCs.
