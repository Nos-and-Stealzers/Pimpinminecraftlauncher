#!/usr/bin/env python
"""Disposable real 1.21.4 equipment/coordinate handler + screenshot integration test.
Never touches installed instances or a user's worlds. Injects a test-only client entrypoint.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / 'mod'
RUN = MOD / 'run/equipment-qol-1.21.4'
OUT = MOD / 'run/equipment-qol-results'
JDK = Path('C:/Users/lucas/tools/jdk-25.0.4.1+1')
source = MOD / 'run/1.21.4/saves/PimpinTest'
assert (JDK / 'bin/java.exe').is_file(), JDK
assert (source / 'level.dat').is_file(), 'Missing disposable world fixture'

# Wait only for known dev harnesses; never stop a user's client or server.
command = "Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^java(w)?\\.exe$' -and ($_.CommandLine -like '*-Dfabric.dli.env=client*' -or $_.CommandLine -like '*shadertest*runClient*')} | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
idle_since = None
for attempt in range(91):
    result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', command], capture_output=True, text=True, check=True)
    busy = result.stdout.strip()
    if busy:
        idle_since = None
    elif idle_since is None:
        idle_since = time.monotonic()
    elif time.monotonic() - idle_since >= 15:
        break
    if attempt == 90:
        raise RuntimeError('Another dev harness still running; do not interfere: ' + busy)
    if attempt == 0:
        print('Waiting for a 15-second dev-harness idle window before using GPU.', flush=True)
    time.sleep(5)

RUN.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
world = RUN / 'saves/PimpinEquipmentQolTest'
if world.exists():
    shutil.rmtree(world)
shutil.copytree(source, world, ignore=shutil.ignore_patterns('session.lock'))
(RUN / 'config').mkdir(exist_ok=True)
config = {'showBiome': True, 'minimap': False, 'hudLayout': [
    {'x': 0, 'y': 0, 'scale': 1}, {'x': 0, 'y': .35, 'scale': 1},
    {'x': 1, 'y': 1, 'scale': 1}, {'x': 0, 'y': .7, 'scale': 1}, {'x': 1, 'y': 0, 'scale': 1}]}
(RUN / 'config/pimpin-client.json').write_text(json.dumps(config), encoding='utf-8')
(RUN / 'options.txt').write_text('pauseOnLostFocus:false\nonboardAccessibility:false\ntutorialStep:none\njoinedFirstServer:true\nrenderDistance:4\nsimulationDistance:5\nguiScale:2\n', encoding='utf-8')
for shot in (RUN / 'screenshots').glob('equipment-*.png'):
    shot.unlink()
init = OUT / 'equipment-qol.init.gradle'
init.write_text("""import groovy.json.JsonSlurper
import groovy.json.JsonOutput
allprojects {
    afterEvaluate { p ->
        if (p.name == '1.21.4') {
            p.sourceSets.main.java.srcDir(p.rootProject.file('src/testFixtures/java'))
            p.loom.runs.named('client') {
                runDir = '../../run/equipment-qol-1.21.4'
                vmArg '-Dpimpin.dev.equipmentTest=true'
            }
            p.tasks.named('processResources') {
                outputs.upToDateWhen { false }
                doLast {
                    def target = new File(destinationDir, 'fabric.mod.json')
                    def metadata = new JsonSlurper().parse(target)
                    metadata.entrypoints.client += 'dev.pimpin.client.screen.EquipmentQolDevTest'
                    target.text = JsonOutput.prettyPrint(JsonOutput.toJson(metadata))
                }
            }
        }
    }
}
""", encoding='utf-8')
env = dict(os.environ, JAVA_HOME=str(JDK))
with (OUT / 'gradle.log').open('w', encoding='utf-8') as log:
    result = subprocess.run(['cmd.exe', '/d', '/c', 'gradlew.bat', '-I', str(init), '-Pversions=1.21.4', '-PstrictMixins', '-PquickPlay=PimpinEquipmentQolTest', ':1.21.4:runClient', '--console=plain'], cwd=MOD, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=600)
text = (RUN / 'logs/latest.log').read_text(encoding='utf-8', errors='replace') if (RUN / 'logs/latest.log').exists() else ''
(OUT / 'latest.log').write_text(text, encoding='utf-8')
assert result.returncode == 0, f'Gradle exited {result.returncode}: {OUT}/gradle.log'
assert 'EQUIPMENT_QOL_TEST COMPLETE:' in text, 'Fixture incomplete; inspect latest.log'
assert 'EQUIPMENT_QOL_TEST FAILED' not in text
assert 'Mixin apply failed' not in text
shots = sorted((RUN / 'screenshots').glob('equipment-*.png'))
assert len(shots) == 7, shots
for shot in shots:
    shutil.copy2(shot, OUT / shot.name)
passes = [line for line in text.splitlines() if 'EQUIPMENT_QOL_TEST PASS:' in line]
(OUT / 'summary.json').write_text(json.dumps({'assertions': len(passes), 'screenshots': [p.name for p in shots], 'version': '1.21.4', 'physical_input': False}, indent=2), encoding='utf-8')
print(f'PASS {len(passes)} assertions, {len(shots)} actual game screenshots: {OUT}')
