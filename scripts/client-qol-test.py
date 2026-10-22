#!/usr/bin/env python
"""Reproducible QoL tests. Only mod/run fixtures; never launcher/user saves.
Run with JDK 25: python scripts/client-qol-test.py --build
Then: python scripts/client-qol-test.py --boot 1.20.1 1.21.4 1.21.11 26.3
Boot fixtures must come from the explicitly supplied --fixtures directory.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / 'mod'
JDK = Path(os.environ.get('JAVA_HOME', 'C:/Users/lucas/tools/jdk-25.0.4.1+1'))
ENV = dict(os.environ, JAVA_HOME=str(JDK))
OUT = MOD / 'run' / 'client-qol-results'
OUT.mkdir(parents=True, exist_ok=True)


def gradle(args, log, timeout=1200):
    with log.open('w', encoding='utf-8') as f:
        result = subprocess.run(['cmd.exe', '/d', '/c', 'gradlew.bat', *args, '--console=plain'], cwd=MOD, env=ENV, stdout=f, stderr=subprocess.STDOUT, timeout=timeout)
    text = log.read_text(encoding='utf-8', errors='replace')
    print('\n'.join(line for line in text.splitlines() if 'BUILD ' in line or 'actionable tasks:' in line))
    if result.returncode:
        raise RuntimeError(f'Gradle failed ({result.returncode}), see {log}')
    return text


def unit():
    work = MOD / 'run' / 'client-qol-unit'
    work.mkdir(parents=True, exist_ok=True)
    test = work / 'ClientQolUnit.java'
    test.write_text('''import dev.pimpin.client.hud.EffectText;
public class ClientQolUnit {
  static int checks;
  static void eq(String actual, String expected) {
    if (!actual.equals(expected)) throw new AssertionError(actual + " != " + expected);
    checks++;
  }
  public static void main(String[] args) {
    eq(EffectText.duration(0, false), "0:00");
    eq(EffectText.duration(-1, false), "0:00");
    eq(EffectText.duration(1, false), "0:01");
    eq(EffectText.duration(20, false), "0:01");
    eq(EffectText.duration(21, false), "0:02");
    eq(EffectText.duration(1200, false), "1:00");
    eq(EffectText.duration(72000, false), "1:00:00");
    eq(EffectText.duration(-1, true), "Infinite");
    eq(EffectText.duration(Integer.MAX_VALUE, false), "29826:09:43");
    eq(EffectText.amplifier(0), "I");
    eq(EffectText.amplifier(1), "II");
    eq(EffectText.amplifier(9), "X");
    eq(EffectText.amplifier(10), "11");
    eq(EffectText.amplifier(Integer.MAX_VALUE), "2147483648");
    System.out.println("PASS " + checks + " effect formatting assertions");
  }
}
''', encoding='utf-8')
    source = MOD / 'src/main/java/dev/pimpin/client/hud/EffectText.java'
    subprocess.run([str(JDK / 'bin/javac.exe'), '-d', str(work), str(source), str(test)], check=True)
    subprocess.run([str(JDK / 'bin/java.exe'), '-cp', str(work), 'ClientQolUnit'], check=True)


def artifacts():
    versions = sorted(x.name for x in (MOD / 'versions').iterdir() if (x / 'gradle.properties').is_file())
    sources = list((MOD / 'src/main/java').rglob('*.java'))
    shipped = sorted((ROOT / 'resources/mods').glob('pimpin-client-*.jar'))
    assert len(versions) == 14, versions
    assert len(shipped) == len(versions), shipped
    report = []
    for version in versions:
        classes = MOD / f'versions/{version}/build/classes/java/main'
        jar = ROOT / f'resources/mods/pimpin-client-{version}.jar'
        with zipfile.ZipFile(jar) as z:
            entries = set(z.namelist())
            for src in sources:
                entry = src.relative_to(MOD / 'src/main/java').with_suffix('.class').as_posix()
                assert (classes / entry).is_file(), (version, entry, 'missing compiled class')
                assert entry in entries, (version, entry, 'missing shipped class')
            count = sum(x.endswith('.class') for x in entries)
            compiled = len(list(classes.rglob('*.class')))
            assert count == compiled, (version, count, compiled)
            assert json.loads(z.read('pimpin.mixins.json'))['injectors']['defaultRequire'] == 0, 'Strict test resources accidentally shipped'
            report.append(dict(version=version, compiled_classes=compiled, jar_classes=count, bytes=jar.stat().st_size))
    (OUT / 'artifacts.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'PASS {len(versions)} versions, {len(shipped)} shipped jars; every one of {len(sources)} source classes present in each jar')
    for row in report:
        print(f"{row['version']}: compiled={row['compiled_classes']} jar={row['jar_classes']} bytes={row['bytes']}")


def boot(version, fixtures):
    run = MOD / 'run' / version
    out = OUT / version
    out.mkdir(parents=True, exist_ok=True)
    generated = fixtures / ('worldgen-' + version) / 'PimpinTest'
    if not generated.is_dir():
        generated = fixtures / 'worldgen' / 'PimpinTest'
    assert generated.is_dir(), f'Missing generated fixture: {generated}'
    if version.startswith('26.'):
        assert ('worldgen-' + version) in str(generated), '26.x must use its own fixture'
    world = run / 'saves' / 'PimpinQolTest'
    if world.exists():
        shutil.rmtree(world)
    shutil.copytree(generated, world, ignore=shutil.ignore_patterns('session.lock'))
    (run / 'config').mkdir(parents=True, exist_ok=True)
    (run / 'config/pimpin-client.json').write_text('{}', encoding='utf-8')
    (run / 'options.txt').write_text('pauseOnLostFocus:false\nonboardAccessibility:false\ntutorialStep:none\njoinedFirstServer:true\nrenderDistance:6\nsimulationDistance:5\nguiScale:2\n', encoding='utf-8')
    for p in (run / 'screenshots').glob('client-qol-*.png'):
        p.unlink()
    gradle([f':{version}:runClient', '-Pversions=' + version, '-PstrictMixins', '-PquickPlay=PimpinQolTest', '-PclientQolTest'], out / 'gradle.log', timeout=600)
    text = (run / 'logs/latest.log').read_text(encoding='utf-8', errors='replace')
    (out / 'latest.log').write_text(text, encoding='utf-8')
    assert 'Pimpin Client ready' in text, 'Mod did not initialize'
    assert 'CLIENT_QOL_TEST COMPLETE' in text, 'Test did not complete'
    for error in ['CLIENT_QOL_TEST FAILED', 'Mixin apply failed', 'Exception in thread', 'Reported exception thrown']:
        assert error not in text, error
    passes = [s for s in text.splitlines() if 'CLIENT_QOL_TEST PASS:' in s]
    shots = list((run / 'screenshots').glob('client-qol-*.png'))
    assert len(shots) == 5, shots
    for shot in shots:
        shutil.copy2(shot, out / shot.name)
    print(f'PASS strict boot {version}: {len(passes)} fixture assertions, {len(shots)} real game screenshots')
    print('\n'.join(passes))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--boot', nargs='*', default=[])
    parser.add_argument('--fixtures', type=Path)
    args = parser.parse_args()
    unit()
    if args.build:
        gradle(['clean', 'collect'], OUT / 'collect.log')
    if args.boot:
        assert args.fixtures, '--fixtures must explicitly identify disposable server-generated test worlds'
        for version in args.boot:
            boot(version, args.fixtures)
    else:
        artifacts()
