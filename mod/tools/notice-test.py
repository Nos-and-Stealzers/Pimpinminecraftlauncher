"""Strict real-game launcher notice tests. Only named mod/run disposable fixtures.
Usage: python mod/tools/notice-test.py [1.20.1 1.21.4 1.21.11 26.3]
No fixture sources or injected metadata are included by a normal clean collect.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

MOD = Path(__file__).resolve().parents[1]
OUT = MOD / 'run/notice-results'
JDK = Path('C:/Users/lucas/tools/jdk-25.0.4.1+1')
ENV = dict(os.environ, JAVA_HOME=str(JDK))
VERSIONS = sys.argv[1:] or ['1.20.1', '1.21.4', '1.21.11', '26.3']

def preprocess(text, version):
    key = lambda v: tuple([int(x) for x in v.split('.')] + [0] * (3-len(v.split('.'))))
    active, stack, out = True, [], []
    for line in text.splitlines():
        t = line.strip()
        if t.startswith('//#if ') or t.startswith('//#elseif '):
            m = re.fullmatch(r'//#(?:if|elseif) MC >= ([0-9.]+)', t)
            assert m, t
            matches = key(version) >= key(m[1])
            if t.startswith('//#if '):
                stack.append([active, matches])
                active = active and matches
            else:
                parent, taken = stack[-1]
                active = parent and not taken and matches
                stack[-1][1] |= matches
            out.append('')
        elif t == '//#else':
            parent, taken = stack[-1]
            active = parent and not taken
            out.append('')
        elif t == '//#endif':
            active = stack.pop()[0]
            out.append('')
        else:
            out.append(line if active else '')
    assert not stack
    return '\n'.join(out)+'\n'

reports = []
for version in VERSIONS:
    assert (MOD / f'versions/{version}/gradle.properties').is_file(), version
    run = MOD / f'run/notice-test-{version}'
    out = OUT / version
    out.mkdir(parents=True, exist_ok=True)
    source = MOD / f'run/{version}/saves/PimpinTest'
    assert (source / 'level.dat').is_file(), 'Missing existing disposable version fixture'
    world = run / 'saves/PimpinNoticeTest'
    if world.exists():
        shutil.rmtree(world)
    shutil.copytree(source, world, ignore=shutil.ignore_patterns('session.lock'))
    (run / 'config').mkdir(exist_ok=True)
    for name in ['pimpin-notices.json', 'pimpin-notices-seen.json']:
        (run / 'config' / name).unlink(missing_ok=True)
    (run / 'config/pimpin-client.json').write_text('{"minimap":true}', encoding='utf-8')
    (run / 'options.txt').write_text('pauseOnLostFocus:false\nonboardAccessibility:false\ntutorialStep:none\njoinedFirstServer:true\nrenderDistance:4\nsimulationDistance:5\nguiScale:2\nmaxFps:120\n', encoding='utf-8')
    for shot in (run / 'screenshots').glob('notice-*.png'):
        shot.unlink()
    fixtures = out / 'fixture-java'
    for rel in ['feature/LauncherNoticesDevTest.java', 'compat/NoticeTestCapture.java']:
        p = fixtures / 'dev/pimpin/client' / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(preprocess((MOD / 'src/testFixtures/java/dev/pimpin/client' / rel).read_text(encoding='utf-8'), version), encoding='utf-8')
    init = out / 'notice.init.gradle'
    init.write_text('''import groovy.json.JsonSlurper
import groovy.json.JsonOutput
allprojects {
    afterEvaluate { p ->
        if (p.name == 'VERSION') {
            p.sourceSets.main.java.srcDir(p.rootProject.file('run/notice-results/VERSION/fixture-java'))
            p.loom.runs.named('client') {
                runDir = '../../run/notice-test-VERSION'
                vmArg '-Dpimpin.dev.noticeTest=true'
            }
            p.tasks.named('processResources') {
                outputs.upToDateWhen { false }
                doLast {
                    def target = new File(destinationDir, 'fabric.mod.json')
                    def metadata = new JsonSlurper().parse(target)
                    metadata.entrypoints.client += 'dev.pimpin.client.feature.LauncherNoticesDevTest'
                    target.text = JsonOutput.prettyPrint(JsonOutput.toJson(metadata))
                }
            }
        }
    }
}
'''.replace('VERSION', version), encoding='utf-8')
    with (out / 'gradle.log').open('w', encoding='utf-8') as log:
        result = subprocess.run(['cmd.exe', '/d', '/c', 'gradlew.bat', '-I', str(init), '-Pversions='+version, '-PstrictMixins', '-PquickPlay=PimpinNoticeTest', ':'+version+':runClient', '--console=plain'], cwd=MOD, env=ENV, stdout=log, stderr=subprocess.STDOUT, timeout=600)
    text = (run / 'logs/latest.log').read_text(encoding='utf-8', errors='replace') if (run / 'logs/latest.log').exists() else ''
    (out / 'latest.log').write_text(text, encoding='utf-8')
    assert result.returncode == 0, f'{version} Gradle failed: {out}/gradle.log'
    assert 'NOTICE_TEST COMPLETE:' in text, f'{version}: test incomplete'
    for error in ['NOTICE_TEST FAILED', 'Mixin apply failed', 'Reported exception thrown']:
        assert error not in text, (version, error)
    shots = sorted((run / 'screenshots').glob('notice-*.png'))
    assert len(shots) == 3, shots
    for shot in shots:
        shutil.copy2(shot, out / shot.name)
    passes = sum('NOTICE_TEST PASS:' in line for line in text.splitlines())
    report = {'version':version, 'assertions':passes, 'screenshots':[str(out / p.name) for p in shots], 'strict':True}
    reports.append(report)
    (out / 'summary.json').write_text(json.dumps(report, indent=2))
    print(f'{version}: PASS {passes} assertions, {len(shots)} screenshots', flush=True)
(OUT / 'summary.json').write_text(json.dumps(reports, indent=2))
