# What's new in 0.1.32

- Optional Discord Rich Presence shows your running Minecraft session. Configure a public Discord application ID in Settings > Launcher; choose separately whether to share the instance name, game version/loader and elapsed time. No Discord token or client secret is needed. Connections recover after Discord restarts and close when disabled or the last game stops.
- Share your launcher look using small, editable JSON appearance presets. Import/export includes colours, theme, sizing, sidebar layout, density and motion only. Accounts, tokens, paths, game settings and Discord IDs are excluded. Imports validate the file and ask for confirmation; exports never overwrite an existing file.
- More appearance control: two-colour gradients, editable hex colours, gradient angle, ready-made blends and a live preview. Flat accents remain available. Fixed gradient toggle/control synchronization and save the angle only when you release the slider.
- Settings > Launcher can reveal settings.json for manual editing. New customization and project-structure guides explain which files to edit, where source and player data live, and what not to share.
- More original pack textures for copper, trial chambers and pale-garden/resin content, gated to compatible Minecraft versions. Fixed opaque copper bulb faces so their dark recesses do not become see-through holes.
- Finer continuous shader-slider choices, with unchanged defaults and discrete sample-count/enum options. Generation now preserves the choices instead of losing them on rebuild.

No new dependency was added by this finishing pass. No ads, telemetry, background launch service or UI sound effects were added. Existing worlds, accounts and game settings are not migrated or reset.

Discord transport/recovery is covered by automated tests; appearance and privacy controls were exercised in an isolated real Electron launcher. Live visibility on a Discord profile still depends on your application ID, desktop Discord and its activity-sharing settings. Shader support differs between Lite and Ultra; OptiFine runtime compatibility has not been verified. Publishing a release is not proof of a completed older-version install/relaunch update cycle.
