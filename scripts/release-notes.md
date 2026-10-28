# What's new in 0.1.33

- Minecraft style is back, rebuilt and optional. Turn it on in Settings > Appearance > Minecraft style: Overworld, Nether or End looks, a floating-island panorama on Home, block tiles, stone or wood pixel buttons, blocky corners, pixel font, block icons for the sidebar and instances, card tilt, and skin poses with a grass-block stand. It is off by default, has a one-click "Turn off and reset", animates only on Home while visible, respects reduced motion and has no sounds. Everything lives in one folder (src/renderer/themes/minecraft) and the launcher works normally if it is deleted.
- CurseForge in the Library. Switch between Modrinth and CurseForge to search and install mods, resource packs, shaders and modpacks (Fabric/Quilt). Downloads are hash-checked. Mods whose authors block third-party downloads show an Open on CurseForge button instead. CurseForge needs an API key: builds can include one, or add your own in Settings > Launcher.
- Required dependencies install automatically, and a small popup shows exactly what is being installed with per-item progress, done/failed status, Hide and Cancel. Cancelling leaves no half-downloaded files, and dependency failures are no longer silent.
- Settings has a new layout: a section list with search on the left, consistent rows, and grouped Appearance options.
- Discord Rich Presence can now start on its own with a built-in Pimpin application ID; your own ID is optional and overrides it.

No new npm dependency. No ads, telemetry or sound effects. Existing worlds, accounts and settings are kept; Minecraft style stays off unless you turn it on.

Tested with automated suites and isolated Electron fixtures. Not yet tested against the live CurseForge API (needs a key). Live Discord display needs the built-in application ID to be set. The older-version self-update install cycle is not covered by these tests.
