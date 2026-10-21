"""Generates the two Pimpin shader packs into resources/shaderpacks.

Run: python scripts/shaderpacks/gen.py   (then compile_check.py to validate every program)
"""
import os, re, shutil, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *
from programs import *

REPO = os.environ.get("SHADERPACK_OUT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "resources", "shaderpacks")

SETTINGS_LITE = """// Pimpin Shaders Lite - options (edit in-game: Video Settings > Shader Packs > Shader Settings)
const int shadowMapResolution = 1536; // [1024 1536 2048]
const float shadowDistance = 80.0; // [48.0 64.0 80.0 96.0 128.0]
const float shadowDistanceRenderMul = 1.0;
const float sunPathRotation = -25.0; // [-40.0 -30.0 -25.0 -15.0 0.0 15.0 25.0 40.0]
const bool shadowHardwareFiltering = true;
const float ambientOcclusionLevel = 1.0; // [0.0 0.25 0.5 0.75 1.0]

#define SHADOWS
#define SOFT_SHADOWS
#define COLORED_SHADOWS
#define SHADOW_SOFTNESS 1.0 // [0.5 1.0 1.5 2.0]
#define SHADOW_DISTORT 0.85
#define SSAO
#define SSAO_STEPS 4 // [3 4 6 8]
#define SSAO_STRENGTH 0.8 // [0.4 0.6 0.8 1.0]
#define SSS_STRENGTH 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define CLOUDS_2D
#define CLOUD_AMOUNT 1.0 // [0.0 0.5 1.0 1.5 2.0 3.0]
#define CLOUD_PLANE_HEIGHT 260.0 // [200.0 260.0 320.0 400.0]
#define GODRAYS
#define GODRAY_STEPS 10 // [6 8 10 14 20]
#define GODRAY_STRENGTH 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define BLOOM
#define BLOOM_STRENGTH 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define GLOWING_ORES
#define SUN_SIZE 1.0 // [0.5 0.75 1.0 1.5 2.0]
#define WAVING_PLANTS
#define WAVE_STRENGTH 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define WATER_WAVES
#define WATER_WAVE_HEIGHT 0.4 // [0.2 0.3 0.4 0.6 0.8 1.0]
#define WATER_SPEED 1.0 // [0.5 1.0 1.5 2.0]
#define WATER_FOG 1.0 // [0.5 1.0 1.5 2.0]
#define FOG_DENSITY 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define AMBIENT_STRENGTH 1.0 // [0.7 0.85 1.0 1.15 1.3]
#define MOON_BRIGHTNESS 1.0 // [0.5 1.0 1.5 2.0]
#define STAR_BRIGHTNESS 1.0 // [0.0 0.5 1.0 2.0]
#define CLOUD_BRIGHTNESS 1.0 // [0.6 0.8 1.0 1.2]
#define END_SKY 1.0 // [0.5 1.0 1.5 2.0]
#define BLOCKLIGHT_STRENGTH 1.0 // [0.6 0.8 1.0 1.2 1.5]
#define EMISSIVE_STRENGTH 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define EXPOSURE 1.0 // [0.6 0.8 1.0 1.2 1.4 1.6]
#define SATURATION 1.0 // [0.8 0.9 1.0 1.1 1.2]
#define NIGHT_DESAT 1.0 // [0.0 0.5 1.0]
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
#define SHADOW_SAMPLES 12 // [8 12 16 24 32]
#define SHADOW_SOFTNESS 1.0 // [0.5 1.0 1.5 2.0 3.0]
#define SHADOW_DISTORT 0.85
#define SSAO
#define SSAO_SAMPLES 8 // [4 6 8 12 16]
#define SSAO_RADIUS 1.0 // [0.5 0.75 1.0 1.5 2.0]
#define SSAO_STRENGTH 1.0 // [0.5 0.75 1.0 1.25]
#define TAA
#define TAA_BLEND 0.9 // [0.8 0.85 0.9 0.93]
#define SHARPEN
#define VOLUMETRIC_LIGHT
#define VL_STEPS 12 // [8 12 16 24 32]
#define VL_STRENGTH 1.0 // [0.5 1.0 1.5 2.0 3.0]
#define VL_DISTANCE 96.0 // [48.0 64.0 96.0 128.0]
#define VOLUMETRIC_CLOUDS
#define CLOUD_SHADOWS
#define CLOUD_STEPS 16 // [8 12 16 24 32]
#define CLOUD_HEIGHT 192.0 // [128.0 160.0 192.0 224.0 256.0]
#define CLOUD_THICKNESS 90.0 // [50.0 70.0 90.0 120.0]
#define CLOUD_AMOUNT 1.0 // [0.0 0.5 1.0 1.5 2.0 3.0]
#define CIRRUS
#define SSS_STRENGTH 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define GLOWING_ORES
#define SUN_SIZE 1.0 // [0.5 0.75 1.0 1.5 2.0]
#define SSR
#define SSR_STEPS 24 // [12 16 24 32 48]
#define WET_REFLECTIONS
#define CAUSTICS
#define BLOOM
#define BLOOM_STRENGTH 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define AUTO_EXPOSURE
#define WAVING_PLANTS
#define WAVE_STRENGTH 1.4 // [0.0 0.5 1.0 1.4 2.0 3.0]
#define WATER_WAVES
#define WATER_DETAIL
#define WATER_WAVE_HEIGHT 0.35 // [0.15 0.25 0.35 0.5 0.7 1.0]
#define WATER_SPEED 1.0 // [0.5 1.0 1.5 2.0]
#define WATER_REFRACTION 1.0 // [0.0 0.5 1.0 1.5]
#define WATER_FOG 1.0 // [0.5 1.0 1.5 2.0]
#define FOG_DENSITY 1.0 // [0.0 0.5 1.0 1.5 2.0]
#define AMBIENT_STRENGTH 1.0 // [0.7 0.85 1.0 1.15 1.3]
#define MOON_BRIGHTNESS 1.0 // [0.5 1.0 1.5 2.0]
#define STAR_BRIGHTNESS 1.4 // [0.0 0.5 1.0 1.4 2.0]
#define CLOUD_BRIGHTNESS 1.0 // [0.6 0.8 1.0 1.2]
#define END_SKY 1.0 // [0.5 1.0 1.5 2.0]
#define BLOCKLIGHT_STRENGTH 1.0 // [0.6 0.8 1.0 1.2 1.5]
#define EMISSIVE_STRENGTH 1.3 // [0.0 0.5 1.0 1.3 1.6 2.0]
#define EXPOSURE 1.0 // [0.6 0.8 1.0 1.2 1.4 1.6]
#define SATURATION 1.05 // [0.8 0.9 1.0 1.05 1.1 1.2 1.3]
#define NIGHT_DESAT 1.0 // [0.0 0.5 1.0]
#define VIGNETTE 0.28 // [0.0 0.15 0.28 0.4]
"""

BUFFERS_LITE = """/*
const int colortex0Format = RGBA16F;
const int colortex2Format = RGBA16F;
const int colortex3Format = RGBA16F;
const int colortex5Format = RGBA16F;
const bool colortex5Clear = false;
const vec4 colortex2ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 colortex3ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 shadowcolor0ClearColor = vec4(1.0, 1.0, 1.0, 0.0);
*/
"""
BUFFERS_ULTRA = """/*
const int colortex0Format = RGBA16F;
const int colortex1Format = RGBA16;
const int colortex2Format = RGBA16F;
const int colortex3Format = RGBA16F;
const int colortex4Format = RGBA16F;
const int colortex5Format = RGBA16F;
const int colortex6Format = RGBA16F;
const int colortex7Format = RGBA16F;
const bool colortex5Clear = false;
const bool colortex7Clear = false;
const vec4 colortex1ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 colortex2ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 colortex3ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 colortex4ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 colortex6ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
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
profile.FAST=shadowMapResolution=1024 shadowDistance=64.0 !SOFT_SHADOWS !COLORED_SHADOWS !SSAO !WATER_WAVES WAVE_STRENGTH=0.5 !GODRAYS !BLOOM CLOUDS_2D
profile.BALANCED=shadowMapResolution=1536 shadowDistance=80.0 SOFT_SHADOWS SSAO SSAO_STEPS=4 WATER_WAVES WAVE_STRENGTH=1.0 GODRAYS GODRAY_STEPS=10 BLOOM CLOUDS_2D
profile.CRISP=shadowMapResolution=2048 shadowDistance=96.0 SOFT_SHADOWS SSAO SSAO_STEPS=6 WATER_WAVES WAVE_STRENGTH=1.0 GODRAYS GODRAY_STEPS=14 BLOOM CLOUDS_2D

screen=<profile> <empty> [SHADOWS_PAGE] [WORLD_PAGE] [SKY_PAGE] [CAMERA_PAGE]
screen.columns=2
screen.SHADOWS_PAGE=SHADOWS SOFT_SHADOWS COLORED_SHADOWS shadowMapResolution shadowDistance SHADOW_SOFTNESS sunPathRotation SSAO SSAO_STEPS SSAO_STRENGTH ambientOcclusionLevel SSS_STRENGTH
screen.WORLD_PAGE=WAVING_PLANTS WAVE_STRENGTH WATER_WAVES WATER_WAVE_HEIGHT WATER_SPEED WATER_FOG BLOCKLIGHT_STRENGTH EMISSIVE_STRENGTH GLOWING_ORES
screen.SKY_PAGE=CLOUDS_2D CLOUD_AMOUNT CLOUD_PLANE_HEIGHT CLOUD_BRIGHTNESS GODRAYS GODRAY_STEPS GODRAY_STRENGTH SUN_SIZE FOG_DENSITY AMBIENT_STRENGTH MOON_BRIGHTNESS STAR_BRIGHTNESS END_SKY
screen.CAMERA_PAGE=BLOOM BLOOM_STRENGTH EXPOSURE SATURATION NIGHT_DESAT VIGNETTE
sliders=shadowMapResolution shadowDistance SHADOW_SOFTNESS sunPathRotation SSAO_STEPS SSAO_STRENGTH ambientOcclusionLevel SSS_STRENGTH CLOUD_AMOUNT CLOUD_PLANE_HEIGHT GODRAY_STEPS GODRAY_STRENGTH SUN_SIZE BLOOM_STRENGTH WAVE_STRENGTH WATER_WAVE_HEIGHT WATER_SPEED WATER_FOG BLOCKLIGHT_STRENGTH EMISSIVE_STRENGTH FOG_DENSITY AMBIENT_STRENGTH MOON_BRIGHTNESS STAR_BRIGHTNESS CLOUD_BRIGHTNESS END_SKY EXPOSURE SATURATION NIGHT_DESAT VIGNETTE
"""

PROPS_ULTRA = """# Pimpin Shaders Ultra
""" + PROPS_COMMON + """
profile.LOW=shadowMapResolution=1024 shadowDistance=64.0 SHADOW_SAMPLES=8 !PCSS SSAO_SAMPLES=4 !VOLUMETRIC_LIGHT VL_STEPS=8 VOLUMETRIC_CLOUDS CLOUD_STEPS=8 SSR SSR_STEPS=12 !WET_REFLECTIONS BLOOM !WATER_DETAIL !CIRRUS
profile.MEDIUM=shadowMapResolution=2048 shadowDistance=96.0 SHADOW_SAMPLES=8 PCSS SSAO_SAMPLES=6 VOLUMETRIC_LIGHT VL_STEPS=8 VOLUMETRIC_CLOUDS CLOUD_STEPS=12 SSR SSR_STEPS=16 WET_REFLECTIONS BLOOM WATER_DETAIL CIRRUS
profile.HIGH=shadowMapResolution=3072 shadowDistance=128.0 SHADOW_SAMPLES=12 PCSS SSAO_SAMPLES=8 VOLUMETRIC_LIGHT VL_STEPS=12 VOLUMETRIC_CLOUDS CLOUD_STEPS=16 SSR SSR_STEPS=24 WET_REFLECTIONS BLOOM WATER_DETAIL CIRRUS
profile.ULTRA=shadowMapResolution=4096 shadowDistance=160.0 SHADOW_SAMPLES=24 PCSS SSAO_SAMPLES=12 VOLUMETRIC_LIGHT VL_STEPS=24 VOLUMETRIC_CLOUDS CLOUD_STEPS=24 SSR SSR_STEPS=32 WET_REFLECTIONS BLOOM WATER_DETAIL CIRRUS

screen=<profile> <empty> [SHADOWS_PAGE] [LIGHT_PAGE] [CLOUDS_PAGE] [WATER_PAGE] [SKY_PAGE] [WORLD_PAGE] [CAMERA_PAGE]
screen.columns=2
screen.SHADOWS_PAGE=SHADOWS PCSS shadowMapResolution shadowDistance SHADOW_SAMPLES SHADOW_SOFTNESS COLORED_SHADOWS sunPathRotation ambientOcclusionLevel SSS_STRENGTH
screen.LIGHT_PAGE=SSAO SSAO_SAMPLES SSAO_RADIUS SSAO_STRENGTH VOLUMETRIC_LIGHT VL_STEPS VL_STRENGTH VL_DISTANCE BLOCKLIGHT_STRENGTH EMISSIVE_STRENGTH AMBIENT_STRENGTH
screen.CLOUDS_PAGE=VOLUMETRIC_CLOUDS CLOUD_SHADOWS CLOUD_STEPS CLOUD_AMOUNT CLOUD_HEIGHT CLOUD_THICKNESS CLOUD_BRIGHTNESS CIRRUS
screen.WATER_PAGE=WATER_WAVES WATER_DETAIL WATER_WAVE_HEIGHT WATER_SPEED WATER_REFRACTION WATER_FOG CAUSTICS SSR SSR_STEPS WET_REFLECTIONS
screen.SKY_PAGE=SUN_SIZE FOG_DENSITY MOON_BRIGHTNESS STAR_BRIGHTNESS END_SKY
screen.WORLD_PAGE=WAVING_PLANTS WAVE_STRENGTH GLOWING_ORES
screen.CAMERA_PAGE=TAA TAA_BLEND SHARPEN BLOOM BLOOM_STRENGTH AUTO_EXPOSURE EXPOSURE SATURATION NIGHT_DESAT VIGNETTE
sliders=shadowMapResolution shadowDistance SHADOW_SAMPLES SHADOW_SOFTNESS sunPathRotation ambientOcclusionLevel SSS_STRENGTH SUN_SIZE SSAO_SAMPLES SSAO_RADIUS SSAO_STRENGTH VL_STEPS VL_STRENGTH VL_DISTANCE BLOCKLIGHT_STRENGTH EMISSIVE_STRENGTH AMBIENT_STRENGTH CLOUD_STEPS CLOUD_AMOUNT CLOUD_HEIGHT CLOUD_THICKNESS CLOUD_BRIGHTNESS WATER_WAVE_HEIGHT WATER_SPEED WATER_REFRACTION WATER_FOG SSR_STEPS FOG_DENSITY MOON_BRIGHTNESS STAR_BRIGHTNESS END_SKY WAVE_STRENGTH TAA_BLEND BLOOM_STRENGTH EXPOSURE SATURATION NIGHT_DESAT VIGNETTE
"""

LANG = {
    "screen.SHADOWS_PAGE": "Shadows & AO", "screen.WORLD_PAGE": "World", "screen.SKY_PAGE": "Sky & Fog", "screen.CAMERA_PAGE": "Camera",
    "screen.LIGHT_PAGE": "Light", "screen.WATER_PAGE": "Water & Reflections", "screen.CLOUDS_PAGE": "Clouds",
    "profile.FAST": "Fast", "profile.BALANCED": "Balanced", "profile.CRISP": "Crisp",
    "profile.LOW": "Low", "profile.MEDIUM": "Medium", "profile.HIGH": "High", "profile.ULTRA": "Ultra",
    "option.SHADOWS": "Shadows", "option.SOFT_SHADOWS": "Soft Shadows",
    "option.shadowMapResolution": "Shadow Resolution", "option.shadowDistance": "Shadow Distance",
    "option.SHADOW_SOFTNESS": "Shadow Softness", "option.sunPathRotation": "Sun Angle",
    "option.ambientOcclusionLevel": "Block Ambient Occlusion", "option.PCSS": "Contact-Hardening Shadows",
    "option.SHADOW_SAMPLES": "Shadow Quality", "option.COLORED_SHADOWS": "Coloured Glass Shadows",
    "option.SSAO": "Ambient Occlusion", "option.SSAO_STEPS": "AO Quality", "option.SSAO_SAMPLES": "AO Quality",
    "option.SSAO_RADIUS": "AO Radius", "option.SSAO_STRENGTH": "AO Strength",
    "option.TAA": "Temporal Anti-Aliasing", "option.TAA_BLEND": "TAA Smoothness", "option.SHARPEN": "Sharpen",
    "option.VOLUMETRIC_LIGHT": "God Rays", "option.VL_STEPS": "God Ray Quality",
    "option.VL_STRENGTH": "God Ray Strength", "option.VL_DISTANCE": "God Ray Distance",
    "option.VOLUMETRIC_CLOUDS": "Volumetric Clouds", "option.CLOUD_SHADOWS": "Cloud Shadows", "option.CLOUD_STEPS": "Cloud Quality",
    "option.CLOUD_HEIGHT": "Cloud Height", "option.CLOUD_THICKNESS": "Cloud Thickness", "option.CLOUD_AMOUNT": "Cloud Amount",
    "option.SSR": "Screen-Space Reflections", "option.SSR_STEPS": "Reflection Quality",
    "option.WET_REFLECTIONS": "Wet Ground In Rain", "option.CAUSTICS": "Water Caustics", "option.WATER_REFRACTION": "Water Refraction",
    "option.BLOOM": "Bloom", "option.BLOOM_STRENGTH": "Bloom Strength",
    "option.AUTO_EXPOSURE": "Auto Exposure", "option.WAVING_PLANTS": "Waving Plants", "option.WAVE_STRENGTH": "Wind Strength",
    "option.WATER_WAVES": "Water Waves", "option.WATER_DETAIL": "Detailed Water", "option.WATER_WAVE_HEIGHT": "Wave Height",
    "option.WATER_SPEED": "Wave Speed", "option.WATER_FOG": "Water Murkiness",
    "option.FOG_DENSITY": "Fog Density", "option.AMBIENT_STRENGTH": "Sky Light", "option.MOON_BRIGHTNESS": "Moonlight",
    "option.STAR_BRIGHTNESS": "Stars", "option.CLOUD_BRIGHTNESS": "Cloud Brightness", "option.END_SKY": "End Brightness",
    "option.BLOCKLIGHT_STRENGTH": "Torch Light", "option.EMISSIVE_STRENGTH": "Glowing Blocks",
    "option.EXPOSURE": "Exposure", "option.SATURATION": "Saturation", "option.NIGHT_DESAT": "Night Vision Shift", "option.VIGNETTE": "Vignette",
    "option.SSS_STRENGTH": "Light Through Leaves", "option.CLOUDS_2D": "Clouds", "option.CLOUD_PLANE_HEIGHT": "Cloud Height",
    "option.GODRAYS": "Sun Rays", "option.GODRAY_STEPS": "Sun Ray Quality", "option.GODRAY_STRENGTH": "Sun Ray Strength",
    "option.GLOWING_ORES": "Glowing Ores", "option.SUN_SIZE": "Sun Size", "option.CIRRUS": "High Cirrus Clouds",
    "option.CLOUDS_2D.comment": "Soft drifting clouds drawn into the sky. Replaces the blocky vanilla clouds.",
    "option.GODRAYS.comment": "Beams of light around the sun when it peeks past trees and hills.",
    "option.GLOWING_ORES.comment": "The coloured bits of ore blocks glow a little, so you can spot them in caves.",
    "option.shadowMapResolution.comment": "Higher is sharper but slower.",
    "option.shadowDistance.comment": "How far shadows reach, in blocks. Lower is faster.",
    "option.PCSS.comment": "Shadows get softer the further they are from what casts them.",
    "option.SSAO.comment": "Darkens corners and creases where light has a hard time reaching.",
    "option.TAA.comment": "Smooths jagged edges and noise by blending frames together.",
    "option.VOLUMETRIC_LIGHT.comment": "Light shafts through trees, clouds and windows.",
    "option.VOLUMETRIC_CLOUDS.comment": "Puffy 3D clouds instead of the flat vanilla ones. Costs a lot of FPS when looking at the sky.",
    "option.SSR.comment": "Water (and wet ground) reflects what is on screen.",
    "option.AUTO_EXPOSURE.comment": "Adapts brightness to what you are looking at.",
    "option.NIGHT_DESAT.comment": "Very dark scenes lose colour and turn slightly blue, like real night vision.",
}

README_LITE = """Pimpin Shaders Lite
===================
Made for the Pimpin Launcher by Nos and Stealzers. Works with Iris (Fabric/NeoForge) and OptiFine,
Minecraft 1.16.5 and newer.

Looks good, keeps your FPS: a physically based sky (sunsets go orange and red on their own, the
night turns deep blue under a Milky Way), a round sun with glare, soft drifting clouds, sun rays
past trees and hills, fog that fades distant land into the horizon, soft sun shadows, ambient
occlusion in corners, light glowing through leaves, water that is clear in the shallows and deep
blue further out, swaying plants, bloom around lights and ACES filmic colours. It costs the world
passes plus two cheap full-screen passes.

Profiles (Shader Settings): Fast, Balanced (default), Crisp.
"""

README_ULTRA = """Pimpin Shaders Ultra
====================
Made for the Pimpin Launcher by Nos and Stealzers. Works with Iris (Fabric/NeoForge) and OptiFine,
Minecraft 1.16.5 and newer. Built for looks first: expect a big FPS drop on weaker graphics cards.

A physically based sky with a round sun, glare, a Milky Way at night, volumetric clouds under high
cirrus and cloud shadows, high resolution soft shadows that
harden near contact, coloured light through stained glass, god rays, ambient occlusion, water with
refraction, depth colour, caustics and screen-space reflections, wet reflective ground in rain,
leaves that glow when backlit, glowing ores, temporal anti-aliasing, bloom, auto exposure and ACES
filmic colours, a deep blue night with twinkling stars.
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
    ("gbuffers_terrain", "lit", "PROGRAM_TERRAIN", "014", "0"),
    ("gbuffers_block", "lit", "PROGRAM_BLOCK", "014", "0"),
    ("gbuffers_entities", "lit", "PROGRAM_ENTITIES", "014", "0"),
    ("gbuffers_hand", "lit", "PROGRAM_HAND", "014", "0"),
    ("gbuffers_water", "water", "PROGRAM_WATER", "016", "0"),
    ("gbuffers_skybasic", "skybasic", "PROGRAM_SKY", "2", "2"),
    ("gbuffers_skytextured", "skytextured", "PROGRAM_SKY", "2", "2"),
]

BODY = {
    ("simple", "vsh"): "simple_vsh", ("simple", "fsh"): "simple_fsh",
    ("lit", "vsh"): "lit_vsh", ("lit", "fsh"): "lit_fsh",
    ("water", "vsh"): "lit_vsh", ("water", "fsh"): "water_fsh",
    ("skybasic", "vsh"): "skybasic_vsh", ("skybasic", "fsh"): "skybasic_fsh",
    ("skytextured", "vsh"): "skytextured_vsh", ("skytextured", "fsh"): "skytextured_fsh",
    ("shadow", "vsh"): "shadow_vsh", ("shadow", "fsh"): "shadow_fsh",
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
    libs["clouds"] = CLOUDS
    libs["skypaint"] = SKY_PAINT
    extra_libs = ["clouds"] if ultra else []
    libs_geo = ["settings", "uniforms", "common", "atmosphere", "shadow", "waving", "water"] + extra_libs + ["lighting"]
    libs_vsh = libs_geo[:-1]
    libs_post = ["settings", "uniforms", "common", "atmosphere", "shadow", "water", "clouds", "tonemap", "fog", "skypaint"]
    libs_prepare = ["settings", "uniforms", "common", "atmosphere"]

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
        "prepare_fsh": PREPARE_FSH,
        "deferred_fsh": DEFERRED_ULTRA if ultra else DEFERRED_LITE,
        "final_fsh": FINAL_ULTRA if ultra else FINAL_LITE,
    }
    if ultra:
        bodies["composite_fsh"] = COMPOSITE_ULTRA
        bodies["taa_fsh"] = TAA_ULTRA
    for k, v in bodies.items():
        write(os.path.join(sh, "program", k + ".glsl"), v)

    # (program file, body, drawbuffers)
    posts = [("deferred", "deferred_fsh", "0")]
    if ultra:
        posts += [("composite", "composite_fsh", "0"), ("composite1", "taa_fsh", "07")]
    posts += [("final", "final_fsh", "0")]

    for folder, dim in (("", "DIM_OVERWORLD"), ("world-1", "DIM_NETHER"), ("world1", "DIM_END")):
        d = os.path.join(sh, folder) if folder else sh
        for prog, kind, define, db_u, db_l in GBUF:
            db = db_u if ultra else db_l
            for stage in ("vsh", "fsh"):
                write(os.path.join(d, prog + "." + stage),
                      stub(dim, flag + [define], libs_geo if stage == "fsh" else libs_vsh, BODY[(kind, stage)], db if stage == "fsh" else None))
        if dim == "DIM_OVERWORLD":
            for stage in ("vsh", "fsh"):
                write(os.path.join(d, "shadow." + stage), stub(dim, flag + ["PROGRAM_SHADOW"], libs_vsh, BODY[("shadow", stage)]))
            write(os.path.join(d, "prepare.vsh"), stub(dim, flag + ["PROGRAM_POST"], ["settings"], "fullscreen_vsh"))
            write(os.path.join(d, "prepare.fsh"), stub(dim, flag + ["PROGRAM_POST"], libs_prepare, "prepare_fsh", "5"))
        for prog, body, db in posts:
            write(os.path.join(d, prog + ".vsh"), stub(dim, flag + ["PROGRAM_POST"], ["settings"], "fullscreen_vsh"))
            write(os.path.join(d, prog + ".fsh"), stub(dim, flag + ["PROGRAM_POST"], libs_post, body, db,
                                                       (BUFFERS_ULTRA if ultra else BUFFERS_LITE) if prog == "final" else ""))

    write(os.path.join(sh, "block.properties"), BLOCK_PROPERTIES)
    write(os.path.join(sh, "shaders.properties"), PROPS_ULTRA if ultra else PROPS_LITE)
    write(os.path.join(sh, "lang", "en_us.lang"), "\n".join("%s=%s" % kv for kv in LANG.items()) + "\n")
    write(os.path.join(root, "README.txt"), README_ULTRA if ultra else README_LITE)
    return root


if __name__ == "__main__":
    for u in (False, True):
        print(build(u))
