#!/usr/bin/env python
"""Run the guarded waypoint widget fixture on a disposable client/world."""
import json, os, shutil, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MOD=ROOT/'mod'; RUN=MOD/'run/waypoint-test-1.21.4'; OUT=MOD/'run/waypoint-results'
JDK=Path('C:/Users/lucas/tools/jdk-25.0.4.1+1')
source=MOD/'run/1.21.4/saves/PimpinTest'
assert (source/'level.dat').is_file(), 'Disposable base world missing'
RUN.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
world=RUN/'saves/PimpinWaypointTest'
if world.exists(): shutil.rmtree(world)
shutil.copytree(source,world,ignore=shutil.ignore_patterns('session.lock'))
fixture=RUN/'waypoint-test-fixture'
if fixture.exists(): shutil.rmtree(fixture)
(RUN/'options.txt').write_text('pauseOnLostFocus:false\nonboardAccessibility:false\ntutorialStep:none\njoinedFirstServer:true\nrenderDistance:6\nsimulationDistance:5\nguiScale:2\n',encoding='utf-8')
for shot in (RUN/'screenshots').glob('waypoint-*.png'): shot.unlink()
init=OUT/'waypoint.init.gradle'
init.write_text("""gradle.projectsEvaluated {
    def p = gradle.rootProject.project(':1.21.4')
    p.loom.runs.named('client') { runDir = '../../run/waypoint-test-1.21.4'; vmArg '-Dpimpin.dev.waypointTest=true' }
    p.tasks.named('processResources') {
        outputs.upToDateWhen { false }
        doLast {
            def f = p.layout.buildDirectory.file('resources/main/fabric.mod.json').get().asFile
            def json = new groovy.json.JsonSlurper().parse(f)
            if (!json.entrypoints.client.contains('dev.pimpin.client.feature.WaypointDevTest')) json.entrypoints.client.add('dev.pimpin.client.feature.WaypointDevTest')
            f.text = groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson(json))
        }
    }
}
""",encoding='utf-8')
with (OUT/'gradle.log').open('w',encoding='utf-8') as log:
    r=subprocess.run(['cmd.exe','/d','/c','gradlew.bat','-I',str(init),'-Pversions=1.21.4','-PstrictMixins','-PquickPlay=PimpinWaypointTest',':1.21.4:runClient','--console=plain'],cwd=MOD,env=dict(os.environ,JAVA_HOME=str(JDK)),stdout=log,stderr=subprocess.STDOUT,timeout=600)
assert r.returncode==0, f'Gradle failed: {OUT}/gradle.log'
text=(RUN/'logs/latest.log').read_text(encoding='utf-8',errors='replace')
(OUT/'latest.log').write_text(text,encoding='utf-8')
assert 'WAYPOINT_TEST COMPLETE:' in text and 'WAYPOINT_TEST FAILED' not in text and 'Mixin apply failed' not in text, f'Fixture failed: {OUT}/latest.log'
shots=list((RUN/'screenshots').glob('waypoint-*.png'))
assert len(shots)>=7, shots
for shot in shots: shutil.copy2(shot,OUT/shot.name)
passes=sum('WAYPOINT_TEST PASS:' in line for line in text.splitlines())
(OUT/'summary.json').write_text(json.dumps({'assertions':passes,'screenshots':[s.name for s in shots],'physical_input':False},indent=2),encoding='utf-8')
print(f'PASS {passes} waypoint checks, {len(shots)} real game screenshots: {OUT}')
