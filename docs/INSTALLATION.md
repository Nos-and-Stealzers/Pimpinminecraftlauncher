# Installing and removing Pimpin Launcher

## Windows

Use `PimpinLauncher-Setup-<version>.exe` for an installed launcher and in-app updates. The assisted installer keeps the existing current-user/all-users choices, installation-folder selection, shortcuts and optional launch-on-finish behavior. Installing for all users may require administrator approval. Keep the application folder separate from your game-data folder.

`PimpinLauncher-Portable-<version>.exe` is the alternative without the normal installed-app registration. "Portable" describes the executable distribution, **not** an automatic change to where Minecraft data is stored. The portable build uses the same default data root unless `PIMPIN_ROOT` is set.

### Where your data lives

On Windows, the default launcher/game-data root is:

```text
%APPDATA%\.pimpinlauncher
```

This is normally `C:\Users\<you>\AppData\Roaming\.pimpinlauncher`. It contains launcher settings/accounts, instances and their worlds, shared game downloads, runtimes, cache and logs. An existing `PIMPIN_ROOT` environment-variable override selects its own root instead. The installer cannot infer an arbitrary override used when launching the app, so it labels the default location and the override separately rather than claiming to display your active path.

Electron also keeps application/browser state under its Windows application-data location. Uninstall preserves this state and updater cache as well. Reinstalling as the same Windows user with the same data root makes the retained data available again. For a custom root, supply the same override on the next launch.

### Uninstall

Close the launcher, then remove **Pimpin Launcher** through Windows Settings > Apps > Installed apps, or its installed uninstaller.

- Application payload files, launcher shortcuts and installed-app registration are removed.
- **Worlds, accounts, instances, launcher settings, custom roots and caches are retained.** There is no delete-data checkbox or supported delete-data mode.
- Extra files you placed inside the application folder are not swept away. Non-empty folders may intentionally remain after uninstall.
- A linked/junction application directory, or a directory replacing a payload file, stops removal rather than traversing into another folder.
- A locked payload file stops removal and attempts to restore files already moved aside. Close the launcher and retry; if application files need repair, reinstall to the same application folder.

Do not use the upstream `--delete-app-data` argument: this launcher rejects that request before file removal. Data retention is intentional, not an incomplete uninstall.

**Older installers:** these protections belong to the uninstaller shipped with this version. An upgrade can invoke the previously installed version's uninstaller; the new installer cannot retroactively change old uninstall code. Back up any data stored inside an old application folder before upgrading. The normal default data root is outside that folder.

## Maintainer notes

The application identity, NSIS GUID derivation, executable/product names, public updater feed and artifact names are unchanged. Keep them stable so existing installations and update discovery continue to match.

- `package.json` / `build.nsis`: assisted installer, explicit data retention and `build/installer.nsh` inclusion.
- `build/installer.nsh`: retention messages, rejection of upstream's destructive command-line override, guarded payload-only removal. It uses supported electron-builder macros rather than replacing the full installer template.
- `build/installer-manifest.js`: **build-time only**, lists the actual x64 `.nsis.7z`/`.nsis.zip` payload using electron-builder's existing 7-Zip tool. It emits exact file moves and non-recursive directory removals; it never enumerates the user's installation or data root. Paths are validated before NSIS generation. Missing/changed archive layouts stop compilation instead of falling back to recursive removal.
- `build/icon.png` is explicitly included in `app.asar` because the main-process window/tray code reads it there. The installer/build scripts themselves are not packaged into the app.

Removal reserves only the payload filenames from that version plus its exact uninstaller filename. Do not repurpose an application payload filename (such as `resources/app.asar`) for user documents. Unknown files, including extra files under `resources` or `locales`, remain untouched. A future architecture/layout change needs an explicit manifest update, tests and a new package build; it must not silently reintroduce recursive removal.

### Verification

Run the source regression checks:

```sh
node --test scripts/installer.test.js
```

Optional package verification (read-only; does not launch the installer):

```sh
PIMPIN_INSTALLER_OUTPUT="C:/path/to/isolated/build-output" node --test scripts/installer.test.js
```

Build to a unique scratch folder with publishing disabled, for example:

```sh
npx electron-builder --win nsis --x64 --publish never -c.directories.output="C:/path/to/unique/scratch-output"
```

The audit compiled the actual Windows x64 installer and uninstaller, inspected the payload/ASAR and update metadata, and ran source/package checks. **It did not install, uninstall, exercise Windows registration/UAC/shortcuts, visually review the installer pages, or test an older-version self-update/relaunch cycle.** Packaging success is not a live installation test. Local unsigned builds can trigger Windows publisher/SmartScreen warnings; do not bypass these warnings without verifying the download's source.

### Primary references

- [electron-builder NSIS configuration and custom macros](https://www.electron.build/docs/nsis): `include`, `customUnInit`, `customRemoveFiles`, `customWelcomePage`, `customUnWelcomePage`, identity/GUID guidance and assisted-install options.
- Installed `app-builder-lib` **26.15.3** source: `templates/nsis/uninstaller.nsh` (custom-removal hook, recursive default removal and command-line data-deletion override), `assistedInstaller.nsh` (pages and existing-install discovery), `installer.nsi` and `installSection.nsh` (upgrade flow).
- Installed NSIS Modern UI 2 `Pages/Welcome.nsh`: both install and uninstall welcome pages consume `MUI_WELCOMEPAGE_TEXT`.
- Local `src/main/store.js`: authoritative data-root behavior; no runtime settings migration is added by the installer.
