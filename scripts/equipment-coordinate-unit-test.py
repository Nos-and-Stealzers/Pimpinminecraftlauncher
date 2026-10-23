#!/usr/bin/env python
"""Run pure Java equipment/coordinate tests without Gradle or user data."""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
JDK = Path('C:/Users/lucas/tools/jdk-25.0.4.1+1')
assert (JDK / 'bin/javac.exe').is_file(), 'JDK required'
SCRATCH = Path.home() / 'AppData/Local/hermes/cache/scratch'
SCRATCH.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='pimpin-equipment-', dir=SCRATCH) as out:
    for group, name in [('hud', 'DurabilityText'), ('feature', 'CoordinateText')]:
        test = ROOT / f'mod/src/test/java/dev/pimpin/client/{group}/{name}Test.java'
        if not test.exists():
            continue
        source = ROOT / f'mod/src/main/java/dev/pimpin/client/{group}/{name}.java'
        sources = [str(test)] + ([str(source)] if source.exists() else [])
        subprocess.run([str(JDK / 'bin/javac.exe'), '-encoding', 'UTF-8', '-d', out, *sources], check=True)
        subprocess.run([str(JDK / 'bin/java.exe'), '-cp', out, f'dev.pimpin.client.{group}.{name}Test'], check=True)
