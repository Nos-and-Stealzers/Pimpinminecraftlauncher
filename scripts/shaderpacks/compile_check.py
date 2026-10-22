"""Compile-check every program of both packs with glslang for many option combinations."""
import os, re, subprocess, sys, tempfile, itertools, concurrent.futures as cf

GLSLANG = os.environ.get("GLSLANG", "glslangValidator")  # github.com/KhronosGroup/glslang/releases
PACKS = os.environ.get("SHADERPACK_OUT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "resources", "shaderpacks")
TMP = os.path.join(tempfile.gettempdir(), "pimpin-shader-check")
os.makedirs(TMP, exist_ok=True)

IRIS_MACROS = """#define MC_VERSION 12104
#define MC_GL_VERSION 460
#define MC_GLSL_VERSION 460
#define IRIS_VERSION 10808
#define MC_RENDER_STAGE_SKY 1
#define MC_RENDER_STAGE_SUNSET 2
#define MC_RENDER_STAGE_CUSTOM_SKY 3
#define MC_RENDER_STAGE_SUN 4
#define MC_RENDER_STAGE_MOON 5
#define MC_RENDER_STAGE_STARS 6
#define MC_RENDER_STAGE_VOID 7
"""


def resolve(shaders_dir, path, settings_override):
    out = []
    for line in open(path).read().splitlines():
        m = re.match(r'\s*#include\s+"(.+)"', line)
        if m:
            inc = m.group(1).lstrip("/")
            if inc == "lib/settings.glsl" and settings_override is not None:
                out.append(settings_override)
            else:
                out.append(resolve(shaders_dir, os.path.join(shaders_dir, inc), None))
        else:
            out.append(line)
    return "\n".join(out)


def variants(settings):
    bools = re.findall(r"^#define (\w+)\s*$", settings, re.M)
    yield "default", settings
    off = settings
    for b in bools:
        off = re.sub(r"^#define %s\s*$" % b, "//#define %s" % b, off, flags=re.M)
    yield "all-off", off
    if os.environ.get("QUICK"): return
    for b in bools:
        yield "no-" + b, re.sub(r"^#define %s\s*$" % b, "//#define %s" % b, settings, flags=re.M)
    # every listed value of each numeric option (one at a time)
    for m in re.finditer(r"^(#define (\w+) (\S+) // \[(.+)\])$|^(const (int|float) (\w+) = (\S+); // \[(.+)\])$", settings, re.M):
        if m.group(1):
            line, name, vals = m.group(1), m.group(2), m.group(4).split()
            for v in vals:
                yield "%s=%s" % (name, v), settings.replace(line, "#define %s %s // [%s]" % (name, v, m.group(4)))
        else:
            line, typ, name, vals = m.group(5), m.group(6), m.group(7), m.group(9).split()
            for v in vals:
                yield "%s=%s" % (name, v), settings.replace(line, "const %s %s = %s; // [%s]" % (typ, name, v, m.group(9)))


def check(job):
    src, stage, tag = job
    fd, p = tempfile.mkstemp(suffix="." + stage, dir=TMP)
    with os.fdopen(fd, "w") as f:
        f.write(src)
    r = subprocess.run([GLSLANG, "-S", stage, p], capture_output=True, text=True)
    os.remove(p)
    return tag, r.returncode, (r.stdout + r.stderr).strip()


def main():
    jobs = []
    for pack in sorted(os.listdir(PACKS)):
        sd = os.path.join(PACKS, pack, "shaders")
        settings = open(os.path.join(sd, "lib", "settings.glsl")).read()
        vs = list(variants(settings))
        for folder in ("", "world-1", "world1"):
            d = os.path.join(sd, folder)
            for fn in sorted(os.listdir(d)):
                if not fn.endswith((".vsh", ".fsh")):
                    continue
                stage = "vert" if fn.endswith(".vsh") else "frag"
                for vname, vset in vs:
                    for macros, mtag in ((IRIS_MACROS, "iris"), ("", "optifine-old")):
                        if mtag == "optifine-old" and vname != "default":
                            continue
                        src = resolve(sd, os.path.join(d, fn), vset)
                        lines = src.split("\n")
                        src = lines[0] + "\n" + macros + "\n".join(lines[1:])
                        jobs.append((src, stage, "%s/%s%s [%s,%s]" % (pack, folder + "/" if folder else "", fn, vname, mtag)))
    fails = 0
    with cf.ThreadPoolExecutor(16) as ex:
        for tag, rc, out in ex.map(check, jobs):
            if rc != 0:
                fails += 1
                if fails <= 15:
                    print("FAIL", tag, "\n", out[:1500])
    print("checked %d compiles, %d failures" % (len(jobs), fails))
    if fails:
        raise SystemExit(1)


main()
