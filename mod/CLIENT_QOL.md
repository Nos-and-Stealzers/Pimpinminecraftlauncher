# Client quality of life

Both features default **off**. Open Pimpin settings > Quality of life.

- **Native toggle sprint** opts into Minecraft's existing accessibility toggle for the current world session. Press the normal vanilla Sprint key to request/release sprint; this is not auto-run. The optional Pimpin key switches the mode on/off, not sprint itself, and starts unbound. The HUD reports ready/requested/active using actual native state.
- The implementation never calls `setSprinting`, never presses Sprint, and never modifies movement. Vanilla handles sneaking, hunger, item use, swimming and flight. In particular this does not add an automatic land-sprint loop that could force sprint while those conditions apply; intentional vanilla swim/fly sprint behavior is unchanged.
- A temporary hold-to-toggle change is rolled back on disconnect, missing player/level, shutdown, disabling and reset. The backup is saved before changing the option and recovered on the next client start after an unclean exit. A pre-existing native toggle preference is left alone; changing vanilla Controls to Hold while enabled is respected for the rest of the session, including respawn/travel.
- **Active effects HUD** adds localized names, level and duration to the existing HUD panel. Green is beneficial, red harmful, yellow neutral. Finite durations come from the current synchronized effect ticks (not wall time); only actual infinite effects say `Infinite`. No effect/player/world cache is retained. Expired/removed effects disappear. Rows can be set to 4/8/12, are further limited to available screen room, and overflow is counted. Position, scale, background, HUD hide/debug and big-map behavior follow the original HUD.

## Verification

Use JDK 25 explicitly; the host's inherited JAVA_HOME may still be Java 21.

```bash
JAVA_HOME='C:/Users/lucas/tools/jdk-25.0.4.1+1' python scripts/client-qol-test.py --build
JAVA_HOME='C:/Users/lucas/tools/jdk-25.0.4.1+1' python scripts/client-qol-test.py --boot 1.20.1 1.21.4 1.21.11 26.3 --fixtures C:/Users/lucas/AppData/Local/hermes/cache/scratch
```

The build command invokes `gradlew.bat clean collect`, checks all 14 versions and release jars, verifies every source class exists in every compiled output and jar, matches compiled/jar class counts, and verifies shipped mixins are not strict-test resources. Run it again after strict boot tests to restore ordinary release resources in build outputs.

The dev fixture is gated by Fabric development mode **and** `-Dpimpin.dev.clientQolTest=true` (`-PclientQolTest`). It additionally requires an integrated world named `PimpinQolTest` under `mod/run/<version>`. It applies real effects on the server thread and checks their synchronized client view, expiration, removal, HUD disabled/overflow behavior, sprint option rollback, preserving pre-existing native Toggle, respecting a manual Controls override, simulated crash-backup recovery, and actual shutdown cleanup. It takes five real Minecraft screenshots per tested version and stops cleanly. It cannot run in an ordinary release launcher session. Fixtures are copied disposable server-generated worlds; user saves are not used.

Verified output:

- `PASS 14 effect formatting assertions`
- `PASS 14 versions, 14 shipped jars; every one of 28 source classes present in each jar`
- Each version has `compiled=36 jar=36`.
- Strict boots: `1.20.1`, `1.21.4`, `1.21.11`, `26.3` each pass **15 fixture assertions and 5 real game screenshots**.
- Logs and screenshots: `mod/run/client-qol-results/<version>/` (ignored build/test output). Files: `client-qol-effects.png`, `client-qol-expired.png`, `client-qol-off.png`, `client-qol-cleared.png`, `client-qol-settings.png`.
- Artifact report: `mod/run/client-qol-results/artifacts.json`; build log: `collect.log`.

API signatures/vanilla sprint guards were inspected using JDK25 `javap` against the local official-Mojang-mapped Loom jars. The effect holder boundary is 1.20.5. Screenshot scale parameter starts at 1.21.6; render target moves to `gameRenderer.mainRenderTarget()` at 26.2.

### Limits

This is deterministic in-game fixture automation, **not physical keyboard/mouse interaction coverage**. The settings screen is opened by the fixture and inspected visually, not clicked by the harness. The known 26.3 posted-input issue is bypassed only for screenshots; no keyboard interaction success is claimed. Native sprint's unsafe-state gameplay matrix (hunger, sneaking, flight, water, eating), actual network disconnect/reconnect and dimension travel were not manually exercised. They remain vanilla behavior / structurally safe read-only effect handling, not claimed gameplay-test results. Rollback after a crash is tested with a persisted-backup-shaped state, not by killing a running JVM.
