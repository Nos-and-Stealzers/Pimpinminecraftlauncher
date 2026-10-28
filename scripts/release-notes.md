# What's new in 0.1.34

- New sky scenes in Settings > Appearance > Minecraft style: a floating sky island with distant islands, or a single suspended block with a flower, crimson mushroom or chorus detail.
- Wandering mobs follow the selected world: sheep in the Overworld, golden-sword pigmen in the Nether, purple-eyed Endermen in the End. They walk across a biome-matched foreground in the island scene, or pace on top of the one-block scene.
- Separate controls for mobs on/off, one to three visitors, and Slow/Normal/Lively scene speed. All scene settings work with appearance preset import/export and the Minecraft-style reset.
- Animation pauses away from Home, when the window is hidden, or with reduced motion. Scenery and mobs stay in the reserved background band, behind the launcher controls.

- Fixed Settings search so nonmatching controls really hide, including optional controls loaded later. Keyboard section navigation and narrow-window deep links keep headings below the sticky navigation. Imported custom scene speeds display their actual value.
- Recovered saved windows from disconnected monitors, corrected empty-position handling, and prevented hidden startup without a tray icon from leaving the launcher invisible.
- Included the missing runtime window/tray icon in packaged builds.
- Added installer/uninstaller data-retention messaging and payload-only removal for the new Windows uninstaller. Unknown application-folder files are retained; destructive data-deletion arguments are rejected. See docs/INSTALLATION.md for the full behavior and limitations.

Minecraft style stays optional and off unless enabled. Its entire folder remains removable. No added npm dependencies, telemetry or sounds. Normal launcher/game data remains separate from application files.

Upgrade caution: an existing installation can run its OLD uninstaller during upgrade. New retention hooks cannot change old uninstall code. Back up any personal data placed inside an old application installation folder before upgrading; the normal launcher data root is outside it. Failed removal attempts restore moved application files on a best-effort basis, not a guaranteed transaction.

Verified: 131 Node tests passed (one optional artifact check skipped in the normal suite); all five installer checks passed separately against a compiled unsigned installer. Actual-launcher Electron checks cover all six scene/world combinations at 1280x800 and 1024x640, settings persistence, reduced motion, hidden-window pause, reset, folder removal and window recovery. Settings usability, appearance and native-settings fixtures pass; release transport is 20/20. No live install/uninstall, UAC/registry/shortcut changes or older-version self-update/relaunch cycle was tested.
