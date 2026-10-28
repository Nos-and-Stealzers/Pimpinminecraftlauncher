# What's new in 0.1.34

- New sky scenes in Settings > Appearance > Minecraft style: a floating sky island with distant islands, or a single suspended block with a flower, crimson mushroom or chorus detail.
- Wandering mobs follow the selected world: sheep in the Overworld, golden-sword pigmen in the Nether, purple-eyed Endermen in the End. They walk across a biome-matched foreground in the island scene, or pace on top of the one-block scene.
- Separate controls for mobs on/off, one to three visitors, and Slow/Normal/Lively scene speed. All scene settings work with appearance preset import/export and the Minecraft-style reset.
- Animation pauses away from Home, when the window is hidden, or with reduced motion. Scenery and mobs stay in the reserved background band, behind the launcher controls.

Minecraft style stays optional and off unless enabled. Its entire folder remains removable. No added npm dependencies, downloads, telemetry or sounds. Worlds, accounts and game data are unchanged.

Verified: 127 Node tests, actual-launcher Electron checks for all six scene/world combinations at 1280x800 and 1024x640, settings persistence, reduced motion, hidden-window pause, reset and folder removal. Existing appearance and native-settings fixtures pass. This does not verify an installed launcher's self-update cycle.
