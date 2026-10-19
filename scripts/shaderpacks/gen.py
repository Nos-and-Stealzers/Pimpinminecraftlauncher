import os, re, shutil, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *
from programs import *

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "resources", "shaderpacks")

SETTINGS_LITE = """// Pimpin Shaders Lite - options (edit in-game: Video Settings > Shader Packs > Shader Settings)
const int shadowMapResolution = 1536; // [1024 1536 2048]
const float shadowDistance = 80.0; // [48.0 64.0 80.0 96.0 128.0]
const float shadowDistanceRenderMul = 1.0;
const float sunPathRotation = -25.0; // [-40.0 -30.0 -25.0 -15.0 0.0 15.0 25.0 40.0]
const bool shadowHardwareFiltering = true;
const float ambientOcclusionLevel = 1.0; // [0.0 0.25 0.5 0.75 1.0]

#define SHADOWS
#define SOFT_SHADOWS
#define SHADOW_SOFTNESS 1.0 // [0.5 1.0 1.5 2.0]
#define SHADOW_DISTORT 0.85
#define WAVING_PLANTS
#define WAVE_STRENGTH 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define WATER_WAVES
#define WATER_WAVE_HEIGHT 0.4 // [0.2 0.3 0.4 0.6 0.8 1.0]
#define WATER_SPEED 1.0 // [0.5 1.0 1.5 2.0]
#define WATER_ALPHA 0.62 // [0.4 0.5 0.62 0.75 0.9]
#define FOG_DENSITY 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define SUN_GLOW 1.0 // [0.0 0.5 1.0 1.5]
#define MOON_BRIGHTNESS 1.0 // [0.5 1.0 1.5 2.0]
#define STAR_BRIGHTNESS 1.0 // [0.0 0.5 1.0 2.0]
#define CLOUD_BRIGHTNESS 1.0 // [0.6 0.8 1.0 1.2]
#define BLOCKLIGHT_STRENGTH 1.0 // [0.6 0.8 1.0 1.2 1.5]
#define EMISSIVE_STRENGTH 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define EXPOSURE 1.0 // [0.6 0.8 1.0 1.2 1.4 1.6]
#define SATURATION 1.06 // [0.8 0.9 1.0 1.06 1.15 1.25]
#define VIGNETTE 0.22 // [0.0 0.12 0.22 0.35]
"""

SETTINGS_ULTRA = """// Pimpin Shaders Ultra - options (edit in-game: Video Settings > Shader Packs > Shader Settings)
const int shadowMapResolution = 3072; // [1024 2048 3072 4096]
const float shadowDistance = 128.0; // [64.0 96.0 128.0 160.0 192.0]
const float shadowDistanceRenderMul = 1.0;
const float sunPathRotation = -25.0; // [-40.0 -30.0 -25.0 -15.0 0.0 15.0 25.0 40.0]
const float ambientOcclusionLevel = 1.0; // [0.0 0.25 0.5 0.75 1.0]
const float wetnessHalflife = 100.0;
const float drynessHalflife = 300.0;

#define SHADOWS
#define PCSS
#define COLORED_SHADOWS
#define SHADOW_SAMPLES 16 // [8 12 16 24 32]
#define SHADOW_SOFTNESS 1.0 // [0.5 1.0 1.5 2.0 3.0]
#define SHADOW_DISTORT 0.85
#define VOLUMETRIC_LIGHT
#define VL_STEPS 16 // [8 12 16 24 32]
#define VL_STRENGTH 1.0 // [0.5 1.0 1.5 2.0 3.0]
#define VL_DISTANCE 96.0 // [48.0 64.0 96.0 128.0]
#define SSR
#define SSR_STEPS 24 // [12 16 24 32 48]
#define WET_REFLECTIONS
#define BLOOM
#define BLOOM_STRENGTH 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define AUTO_EXPOSURE
#define WAVING_PLANTS
#define WAVE_STRENGTH 1.4 // [0.0 0.5 1.0 1.4 2.0 3.0]
#define WATER_WAVES
#define WATER_DETAIL
#define WATER_WAVE_HEIGHT 0.35 // [0.15 0.25 0.35 0.5 0.7 1.0]
#define WATER_SPEED 1.0 // [0.5 1.0 1.5 2.0]
#define WATER_ALPHA 0.42 // [0.25 0.33 0.42 0.55 0.7]
#define WATER_FOG 1.0 // [0.5 1.0 1.5 2.0]
#define FOG_DENSITY 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define SUN_GLOW 1.2 // [0.0 0.5 1.0 1.2 1.5 2.0]
#define MOON_BRIGHTNESS 1.0 // [0.5 1.0 1.5 2.0]
#define STAR_BRIGHTNESS 1.4 // [0.0 0.5 1.0 1.4 2.0]
#define CLOUD_BRIGHTNESS 1.0 // [0.6 0.8 1.0 1.2]
#define BLOCKLIGHT_STRENGTH 1.0 // [0.6 0.8 1.0 1.2 1.5]
#define EMISSIVE_STRENGTH 1.3 // [0.0 0.5 1.0 1.3 1.6 2.0]
#define EXPOSURE 1.0 // [0.6 0.8 1.0 1.2 1.4 1.6]
#define SATURATION 1.1 // [0.8 0.9 1.0 1.1 1.2 1.3]
#define VIGNETTE 0.28 // [0.0 0.15 0.28 0.4]
"""

BUFFERS_LITE = """/*
const int colortex0Format = RGBA16F;
const int colortex2Format = RGBA16F;
const int colortex3Format = RGBA16F;
const vec4 colortex2ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 colortex3ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
*/
"""
BUFFERS_ULTRA = """/*
const int colortex0Format = RGBA16F;
const int colortex1Format = RGBA16;
const int colortex2Format = RGBA16F;
const int colortex3Format = RGBA16F;
const vec4 colortex1ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 colortex2ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 colortex3ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 shadowcolor0ClearColor = vec4(1.0, 1.0, 1.0, 0.0);
*/
"""

PROPS_COMMON = """oldLighting=false
oldHandLight=false
separateAo=false
underwaterOverlay=false
vignette=false
sun=true
moon=true
dynamicHandLight=true
shadowTerrain=true
shadowTranslucent=true
shadowEntities=true
shadowBlockEntities=true
frustum.culling=true
"""

PROPS_LITE = """# Pimpin Shaders Lite
""" + PROPS_COMMON + """
profile.FAST=shadowMapResolution=1024 shadowDistance=64.0 !SOFT_SHADOWS !WATER_WAVES WAVE_STRENGTH=0.5
profile.BALANCED=shadowMapResolution=1536 shadowDistance=80.0 SOFT_SHADOWS WATER_WAVES WAVE_STRENGTH=1.0
profile.CRISP=shadowMapResolution=2048 shadowDistance=96.0 SOFT_SHADOWS WATER_WAVES WAVE_STRENGTH=1.0

screen=<profile> <empty> [SHADOWS_PAGE] [WORLD_PAGE] [SKY_PAGE] [CAMERA_PAGE]
screen.columns=2
screen.SHADOWS_PAGE=SHADOWS SOFT_SHADOWS shadowMapResolution shadowDistance SHADOW_SOFTNESS sunPathRotation ambientOcclusionLevel
screen.WORLD_PAGE=WAVING_PLANTS WAVE_STRENGTH WATER_WAVES WATER_WAVE_HEIGHT WATER_SPEED WATER_ALPHA BLOCKLIGHT_STRENGTH EMISSIVE_STRENGTH
screen.SKY_PAGE=FOG_DENSITY SUN_GLOW MOON_BRIGHTNESS STAR_BRIGHTNESS CLOUD_BRIGHTNESS
screen.CAMERA_PAGE=EXPOSURE SATURATION VIGNETTE
sliders=shadowMapResolution shadowDistance SHADOW_SOFTNESS sunPathRotation ambientOcclusionLevel WAVE_STRENGTH WATER_WAVE_HEIGHT WATER_SPEED WATER_ALPHA BLOCKLIGHT_STRENGTH EMISSIVE_STRENGTH FOG_DENSITY SUN_GLOW MOON_BRIGHTNESS STAR_BRIGHTNESS CLOUD_BRIGHTNESS EXPOSURE SATURATION VIGNETTE
"""

PROPS_ULTRA = """# Pimpin Shaders Ultra
""" + PROPS_COMMON + """
profile.LOW=shadowMapResolution=1024 shadowDistance=64.0 SHADOW_SAMPLES=8 !PCSS !VOLUMETRIC_LIGHT VL_STEPS=8 SSR SSR_STEPS=12 !WET_REFLECTIONS BLOOM !WATER_DETAIL
profile.MEDIUM=shadowMapResolution=2048 shadowDistance=96.0 SHADOW_SAMPLES=12 PCSS VOLUMETRIC_LIGHT VL_STEPS=12 SSR SSR_STEPS=16 WET_REFLECTIONS BLOOM WATER_DETAIL
profile.HIGH=shadowMapResolution=3072 shadowDistance=128.0 SHADOW_SAMPLES=16 PCSS VOLUMETRIC_LIGHT VL_STEPS=16 SSR SSR_STEPS=24 WET_REFLECTIONS BLOOM WATER_DETAIL
profile.ULTRA=shadowMapResolution=4096 shadowDistance=160.0 SHADOW_SAMPLES=24 PCSS VOLUMETRIC_LIGHT VL_STEPS=24 SSR SSR_STEPS=32 WET_REFLECTIONS BLOOM WATER_DETAIL

screen=<profile> <empty> [SHADOWS_PAGE] [LIGHT_PAGE] [WATER_PAGE] [SKY_PAGE] [WORLD_PAGE] [CAMERA_PAGE]
screen.columns=2
screen.SHADOWS_PAGE=SHADOWS PCSS shadowMapResolution shadowDistance SHADOW_SAMPLES SHADOW_SOFTNESS COLORED_SHADOWS sunPathRotation ambientOcclusionLevel
screen.LIGHT_PAGE=VOLUMETRIC_LIGHT VL_STEPS VL_STRENGTH VL_DISTANCE BLOCKLIGHT_STRENGTH EMISSIVE_STRENGTH
screen.WATER_PAGE=WATER_WAVES WATER_DETAIL WATER_WAVE_HEIGHT WATER_SPEED WATER_ALPHA WATER_FOG SSR SSR_STEPS WET_REFLECTIONS
screen.SKY_PAGE=FOG_DENSITY SUN_GLOW MOON_BRIGHTNESS STAR_BRIGHTNESS CLOUD_BRIGHTNESS
screen.WORLD_PAGE=WAVING_PLANTS WAVE_STRENGTH
screen.CAMERA_PAGE=BLOOM BLOOM_STRENGTH AUTO_EXPOSURE EXPOSURE SATURATION VIGNETTE
sliders=shadowMapResolution shadowDistance SHADOW_SAMPLES SHADOW_SOFTNESS sunPathRotation ambientOcclusionLevel VL_STEPS VL_STRENGTH VL_DISTANCE BLOCKLIGHT_STRENGTH EMISSIVE_STRENGTH WATER_WAVE_HEIGHT WATER_SPEED WATER_ALPHA WATER_FOG SSR_STEPS FOG_DENSITY SUN_GLOW MOON_BRIGHTNESS STAR_BRIGHTNESS CLOUD_BRIGHTNESS WAVE_STRENGTH BLOOM_STRENGTH EXPOSURE SATURATION VIGNETTE
"""

LANG = {
    "screen.SHADOWS_PAGE": "Shadows", "screen.WORLD_PAGE": "World", "screen.SKY_PAGE": "Sky & Fog", "screen.CAMERA_PAGE": "Camera",
    "screen.LIGHT_PAGE": "Light", "screen.WATER_PAGE": "Water & Reflections",
    "profile.FAST": "Fast", "profile.BALANCED": "Balanced", "profile.CRISP": "Crisp",
    "profile.LOW": "Low", "profile.MEDIUM": "Medium", "profile.HIGH": "High", "profile.ULTRA": "Ultra",
    "option.SHADOWS": "Shadows", "option.SOFT_SHADOWS": "Soft Shadows",
    "option.shadowMapResolution": "Shadow Resolution", "option.shadowDistance": "Shadow Distance",
    "option.SHADOW_SOFTNESS": "Shadow Softness", "option.sunPathRotation": "Sun Angle",
    "option.ambientOcclusionLevel": "Block Ambient Occlusion", "option.PCSS": "Contact-Hardening Shadows",
    "option.SHADOW_SAMPLES": "Shadow Quality", "option.COLORED_SHADOWS": "Coloured Glass Shadows",
    "option.VOLUMETRIC_LIGHT": "God Rays", "option.VL_STEPS": "God Ray Quality",
    "option.VL_STRENGTH": "God Ray Strength", "option.VL_DISTANCE": "God Ray Distance",
    "option.SSR": "Screen-Space Reflections", "option.SSR_STEPS": "Reflection Quality",
    "option.WET_REFLECTIONS": "Wet Ground In Rain", "option.BLOOM": "Bloom", "option.BLOOM_STRENGTH": "Bloom Strength",
    "option.AUTO_EXPOSURE": "Auto Exposure", "option.WAVING_PLANTS": "Waving Plants", "option.WAVE_STRENGTH": "Wind Strength",
    "option.WATER_WAVES": "Water Waves", "option.WATER_DETAIL": "Detailed Water", "option.WATER_WAVE_HEIGHT": "Wave Height",
    "option.WATER_SPEED": "Wave Speed", "option.WATER_ALPHA": "Water Opacity", "option.WATER_FOG": "Water Murkiness",
    "option.FOG_DENSITY": "Fog Density", "option.SUN_GLOW": "Sun Glow", "option.MOON_BRIGHTNESS": "Moonlight",
    "option.STAR_BRIGHTNESS": "Stars", "option.CLOUD_BRIGHTNESS": "Cloud Brightness",
    "option.BLOCKLIGHT_STRENGTH": "Torch Light", "option.EMISSIVE_STRENGTH": "Glowing Blocks",
    "option.EXPOSURE": "Exposure", "option.SATURATION": "Saturation", "option.VIGNETTE": "Vignette",
    "option.shadowMapResolution.comment": "Higher is sharper but slower.",
    "option.shadowDistance.comment": "How far shadows reach, in blocks. Lower is faster.",
    "option.PCSS.comment": "Shadows get softer the further they are from what casts them.",
    "option.VOLUMETRIC_LIGHT.comment": "Light shafts through trees, clouds and windows. Costs the most FPS after shadows.",
    "option.SSR.comment": "Water (and wet ground) reflects what is on screen.",
    "option.AUTO_EXPOSURE.comment": "Adapts brightness to what you are looking at.",
}

README_LITE = """Pimpin Shaders Lite
===================
Made for the Pimpin Launcher by Nos and Stealzers. Works with Iris (Fabric/NeoForge) and OptiFine,
Minecraft 1.16.5 and newer.

Looks good, keeps your FPS: soft sun shadows, warm sunlight with cool shade, a gradient sky with a
glowing sun, fog that matches the sky, nicer water with gentle waves, swaying leaves and grass,
filmic colours and a light vignette. Everything runs in the world passes plus one final pass.

Profiles (Shader Settings): Fast, Balanced (default), Crisp.
"""

README_ULTRA = """Pimpin Shaders Ultra
====================
Made for the Pimpin Launcher by Nos and Stealzers. Works with Iris (Fabric/NeoForge) and OptiFine,
Minecraft 1.16.5 and newer. Built for looks first: expect a big FPS drop on weaker graphics cards.

High resolution soft shadows that harden near contact, coloured light through stained glass, god rays,
screen-space reflections on water and on wet ground in rain, animated detailed water with depth
colour, stronger wind, bloom, auto exposure, shaded clouds, stars and moonlight, glowing blocks.
The Nether and the End have their own lighting and fog.

Profiles (Shader Settings): Low, Medium, High (default), Ultra.
"""

GBUF = [
    # name, kind, define, ultra drawbuffers, lite drawbuffers
    ("gbuffers_basic", "simple", "PROGRAM_BASIC", "0", "0"),
    ("gbuffers_textured", "simple", "PROGRAM_TEXTURED", "0", "0"),
    ("gbuffers_textured_lit", "simple", "PROGRAM_TEXTURED", "0", "0"),
    ("gbuffers_spidereyes", "simple", "PROGRAM_EMISSIVE", "0", "0"),
    ("gbuffers_beaconbeam", "simple", "PROGRAM_EMISSIVE", "0", "0"),
    ("gbuffers_armor_glint", "simple", "PROGRAM_GLINT", "0", "0"),
    ("gbuffers_damagedblock", "simple", "PROGRAM_DAMAGED", "0", "0"),
    ("gbuffers_clouds", "simple", "PROGRAM_CLOUDS", "0", "0"),
    ("gbuffers_weather", "simple", "PROGRAM_WEATHER", "3", "3"),
    ("gbuffers_terrain", "lit", "PROGRAM_TERRAIN", "01", "0"),
    ("gbuffers_block", "lit", "PROGRAM_BLOCK", "01", "0"),
    ("gbuffers_entities", "lit", "PROGRAM_ENTITIES", "01", "0"),
    ("gbuffers_hand", "lit", "PROGRAM_HAND", "01", "0"),
    ("gbuffers_water", "water", "PROGRAM_WATER", "01", "0"),
    ("gbuffers_skybasic", "skybasic", "PROGRAM_SKY", "2", "2"),
    ("gbuffers_skytextured", "skytextured", "PROGRAM_SKY", "2", "2"),
]

LIBS_ALL = ["settings", "uniforms", "common", "atmosphere", "shadow", "waving", "water", "lighting"]
LIBS_POST = ["settings", "uniforms", "common", "atmosphere", "shadow", "tonemap", "fog"]

BODY = {
    ("simple", "vsh"): "simple_vsh", ("simple", "fsh"): "simple_fsh",
    ("lit", "vsh"): "lit_vsh", ("lit", "fsh"): "lit_fsh",
    ("water", "vsh"): "lit_vsh", ("water", "fsh"): "water_fsh",
    ("skybasic", "vsh"): "skybasic_vsh", ("skybasic", "fsh"): "skybasic_fsh",
    ("skytextured", "vsh"): "skytextured_vsh", ("skytextured", "fsh"): "skytextured_fsh",
    ("shadow", "vsh"): "shadow_vsh", ("shadow", "fsh"): "shadow_fsh",
    ("post", "vsh"): "fullscreen_vsh",
}


def stub(dim, defines, libs, body, drawbuffers=None, extra=""):
    out = ["#version 120", "#define " + dim + " 1"]
    out += ["#define %s 1" % d for d in defines]
    if drawbuffers is not None:
        out.append("/* DRAWBUFFERS:%s */" % drawbuffers)
    if extra:
        out.append(extra.rstrip())
    out += ['#include "/lib/%s.glsl"' % l for l in libs]
    out.append('#include "/program/%s.glsl"' % body)
    return "\n".join(out) + "\n"


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="\n") as f:
        f.write(text)


def build(ultra):
    name = "Pimpin Shaders Ultra" if ultra else "Pimpin Shaders Lite"
    root = os.path.join(REPO, name)
    if os.path.isdir(root):
        shutil.rmtree(root)
    sh = os.path.join(root, "shaders")
    flag = ["ULTRA"] if ultra else []
    libs = {
        "settings": SETTINGS_ULTRA if ultra else SETTINGS_LITE,
        "uniforms": UNIFORMS, "common": COMMON, "atmosphere": ATMOSPHERE,
        "shadow": SHADOW_ULTRA if ultra else SHADOW_LITE,
        "waving": WAVING, "water": WATER, "lighting": LIGHTING, "tonemap": TONEMAP, "fog": FOG,
    }
    st = libs["settings"]
    bools = re.findall(r"^#define (\w+)\s*$", st, re.M)
    libs["settings"] = st + "\n// referenced here so every toggle is detected as an option\n" + "".join("#ifdef %s\n#endif\n" % b for b in bools)
    for k, v in libs.items():
        write(os.path.join(sh, "lib", k + ".glsl"), v)
    bodies = {
        "simple_vsh": SIMPLE_VSH, "simple_fsh": SIMPLE_FSH, "lit_vsh": LIT_VSH, "lit_fsh": LIT_FSH,
        "water_fsh": WATER_FSH, "skybasic_vsh": SKYBASIC_VSH, "skybasic_fsh": SKYBASIC_FSH,
        "skytextured_vsh": SKYTEXTURED_VSH, "skytextured_fsh": SKYTEXTURED_FSH,
        "shadow_vsh": SHADOW_VSH, "shadow_fsh": SHADOW_FSH, "fullscreen_vsh": FULLSCREEN_VSH,
        "final_fsh": FINAL_ULTRA if ultra else FINAL_LITE,
    }
    if ultra:
        bodies["composite_fsh"] = COMPOSITE_ULTRA
    for k, v in bodies.items():
        write(os.path.join(sh, "program", k + ".glsl"), v)

    for folder, dim in (("", "DIM_OVERWORLD"), ("world-1", "DIM_NETHER"), ("world1", "DIM_END")):
        d = os.path.join(sh, folder) if folder else sh
        for prog, kind, define, db_u, db_l in GBUF:
            db = db_u if ultra else db_l
            for st in ("vsh", "fsh"):
                write(os.path.join(d, prog + "." + st),
                      stub(dim, flag + [define], LIBS_ALL if st == "fsh" else LIBS_ALL[:-1], BODY[(kind, st)], db if st == "fsh" else None))
        if dim == "DIM_OVERWORLD":
            for st in ("vsh", "fsh"):
                write(os.path.join(d, "shadow." + st), stub(dim, flag + ["PROGRAM_SHADOW"], LIBS_ALL[:-1], BODY[("shadow", st)]))
        posts = ["composite", "final"] if ultra else ["final"]
        for prog in posts:
            write(os.path.join(d, prog + ".vsh"), stub(dim, flag + ["PROGRAM_POST"], ["settings"], "fullscreen_vsh"))
            write(os.path.join(d, prog + ".fsh"), stub(dim, flag + ["PROGRAM_POST"], LIBS_POST, prog + "_fsh", "0",
                                                       (BUFFERS_ULTRA if ultra else BUFFERS_LITE) if prog == "final" else ""))

    write(os.path.join(sh, "block.properties"), BLOCK_PROPERTIES)
    write(os.path.join(sh, "shaders.properties"), PROPS_ULTRA if ultra else PROPS_LITE)
    write(os.path.join(sh, "lang", "en_us.lang"), "\n".join("%s=%s" % kv for kv in LANG.items()) + "\n")
    write(os.path.join(root, "README.txt"), README_ULTRA if ultra else README_LITE)
    return root


if __name__ == "__main__":
    for u in (False, True):
        print(build(u))
