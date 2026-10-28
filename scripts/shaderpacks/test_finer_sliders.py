"""Regression checks for reproducible shader slider generation (no GPU needed)."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import re
from decimal import Decimal

import finer_sliders
import gen

HERE = Path(__file__).resolve().parent
SHIPPED = HERE.parents[1] / "resources" / "shaderpacks"
SCRATCH = (Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
           / "hermes" / "cache" / "scratch" if os.name == "nt"
           else Path(os.environ.get("TMPDIR", tempfile.gettempdir())))
SCRATCH.mkdir(parents=True, exist_ok=True)


class GeneratorTests(unittest.TestCase):
    def test_helper_import_has_no_side_effects(self):
        with tempfile.TemporaryDirectory(prefix="slider-import-", dir=SCRATCH) as tmp:
            target = Path(tmp) / "Example" / "shaders" / "lib" / "settings.glsl"
            target.parent.mkdir(parents=True)
            sentinel = b'#define EXPOSURE 1.0 // [0.6 1.0]\n'
            target.write_bytes(sentinel)
            env = dict(os.environ, SHADERPACK_OUT=tmp, PYTHONDONTWRITEBYTECODE="1")
            code = f'import sys; sys.path.insert(0, {str(HERE)!r}); import finer_sliders; import gen'
            result = subprocess.run([sys.executable, "-B", "-c", code],
                                    cwd=tmp, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertEqual(target.read_bytes(), sentinel)
            self.assertEqual([p.relative_to(tmp).as_posix() for p in Path(tmp).rglob('*') if p.is_file()],
                             ["Example/shaders/lib/settings.glsl"])
            # The retired standalone command must fail clearly without writes.
            for _ in range(2):
                result = subprocess.run([sys.executable, "-B", str(HERE / "finer_sliders.py")],
                                        cwd=tmp, env=env, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("gen.py", result.stderr)
                self.assertEqual(target.read_bytes(), sentinel)

    def test_choices_and_defaults_preserved(self):
        option = re.compile(r'^(#define (\w+) [^\n]+?) // \[([^]]+)\]$', re.M)
        for coarse in (gen.SETTINGS_LITE, gen.SETTINGS_ULTRA):
            expanded = finer_sliders.expand_settings(coarse)
            original = {m[1]: (m[0], m[2].split()) for m in option.findall(coarse)}
            for head, name, choices in option.findall(expanded):
                old_head, old_choices = original[name]
                self.assertEqual(head, old_head)  # defaults never change
                stops = choices.split()
                if name not in finer_sliders.CONTINUOUS:
                    self.assertEqual(stops, old_choices)  # enums/sample counts
                else:
                    self.assertEqual([v for v in stops if v in old_choices], old_choices)
                    numbers = [Decimal(v) for v in stops]
                    self.assertTrue(all(a < b for a, b in zip(numbers, numbers[1:])), name)
            # Only the allowlisted option comments may change.
            strip_choices = lambda s: option.sub(lambda m: m[1] if m[2] in finer_sliders.CONTINUOUS else m[0], s)
            self.assertEqual(strip_choices(expanded), strip_choices(coarse))

    def test_rounded_endpoint_is_not_duplicated(self):
        for values in ("0.99 1.0", "1.0 1.01", "-0.01 0.0"):
            text = f'#define EXPOSURE 1.0 // [{values}]\n'
            self.assertEqual(finer_sliders.expand_settings(text), text)

    def test_invalid_order_or_duplicates_rejected(self):
        for values in ("1.0 1", "1.0 0.5", "0.0 bad 1.0"):
            with self.assertRaises(ValueError):
                finer_sliders.expand_settings(f'#define EXPOSURE 1.0 // [{values}]')

    def test_generator_matches_shipped_settings(self):
        with tempfile.TemporaryDirectory(prefix="slider-test-", dir=SCRATCH) as tmp:
            env = dict(os.environ, SHADERPACK_OUT=tmp, PYTHONDONTWRITEBYTECODE="1")
            result = subprocess.run([sys.executable, str(HERE / "gen.py")],
                                    cwd=tmp, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            before = {p.relative_to(tmp): p.read_bytes() for p in Path(tmp).rglob('*') if p.is_file()}
            result = subprocess.run([sys.executable, str(HERE / "gen.py")],
                                    cwd=tmp, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            after = {p.relative_to(tmp): p.read_bytes() for p in Path(tmp).rglob('*') if p.is_file()}
            self.assertEqual(before, after)  # every generated file is stable
            for name in ("Pimpin Shaders Lite", "Pimpin Shaders Ultra"):
                relative = Path(name) / "shaders" / "lib" / "settings.glsl"
                self.assertEqual((Path(tmp) / relative).read_text(),
                                 (SHIPPED / relative).read_text(), name)


if __name__ == "__main__":
    unittest.main()
