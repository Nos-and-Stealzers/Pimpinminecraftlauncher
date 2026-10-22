#!/usr/bin/env python
"""Isolated real-client HUD fixture; no installed instances or user saves.
Usage: python scripts/hud-layout-test.py
Requires the existing disposable mod/run/1.21.4/saves/PimpinTest fixture and JDK25.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
MOD=ROOT/'mod'
RUN=MOD/'run/hud-layout-1.21.4'
OUT=MOD/'run/hud-layout-results'
JDK=Path('C:/Users/lucas/tools/jdk-25.0.4.1+1')
assert (JDK/'bin/java.exe').is_file(), JDK
source=MOD/'run/1.21.4/saves/PimpinTest'
assert (source/'level.dat').is_file(), 'Missing disposable 1.21.4 fixture'
RUN.mkdir(parents=True,exist_ok=True)
OUT.mkdir(parents=True,exist_ok=True)
world=RUN/'saves/PimpinHudLayoutTest'
if world.exists(): shutil.rmtree(world)
shutil.copytree(source,world,ignore=shutil.ignore_patterns('session.lock'))
(RUN/'config').mkdir(exist_ok=True)
(RUN/'config/pimpin-client.json').write_text('{}',encoding='utf-8')
(RUN/'options.txt').write_text('pauseOnLostFocus:false\nonboardAccessibility:false\ntutorialStep:none\njoinedFirstServer:true\nrenderDistance:6\nsimulationDistance:5\nguiScale:2\n',encoding='utf-8')
for shot in (RUN/'screenshots').glob('hud-*.png'): shot.unlink()
init=OUT/'hud-layout.init.gradle'
init.write_text("""allprojects {
    afterEvaluate { p ->
        if (p.name == '1.21.4') p.loom.runs.named('client') {
            runDir = '../../run/hud-layout-1.21.4'
            vmArg '-Dpimpin.dev.hudLayoutTest=true'
        }
    }
}
""",encoding='utf-8')
env=dict(os.environ,JAVA_HOME=str(JDK))
with (OUT/'gradle.log').open('w',encoding='utf-8') as log:
    result=subprocess.run(['cmd.exe','/d','/c','gradlew.bat','-I',str(init),'-Pversions=1.21.4','-PstrictMixins','-PquickPlay=PimpinHudLayoutTest',':1.21.4:runClient','--console=plain'],cwd=MOD,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=600)
assert result.returncode==0, f'Gradle exited {result.returncode}; see {OUT}/gradle.log'
text=(RUN/'logs/latest.log').read_text(encoding='utf-8',errors='replace')
(OUT/'latest.log').write_text(text,encoding='utf-8')
assert result.returncode==0, f'Gradle exited {result.returncode}; see {OUT}/gradle.log'
assert 'HUD_LAYOUT_TEST COMPLETE:' in text, 'Fixture incomplete; inspect latest.log'
assert 'HUD_LAYOUT_TEST FAILED' not in text
assert 'Mixin apply failed' not in text
shots=list((RUN/'screenshots').glob('hud-*.png'))
assert len(shots)==4,shots
for shot in shots:shutil.copy2(shot,OUT/shot.name)
passes=[line for line in text.splitlines() if 'HUD_LAYOUT_TEST PASS:' in line]
(OUT/'summary.json').write_text(json.dumps({'assertions':len(passes),'screenshots':[p.name for p in shots],'version':'1.21.4','physical_input':False},indent=2),encoding='utf-8')
print(f'PASS {len(passes)} assertions, {len(shots)} actual game screenshots: {OUT}')
