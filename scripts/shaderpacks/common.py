# Shared GLSL pieces for both Pimpin shader packs.

BLOCK_PROPERTIES = """# Pimpin Shaders block ids (read by gbuffers and shadow programs via mc_Entity.x)
# Unknown names (from older or newer Minecraft versions) are ignored by the loader.

# leaves and vines: whole block sways
block.10001=oak_leaves spruce_leaves birch_leaves jungle_leaves acacia_leaves dark_oak_leaves mangrove_leaves cherry_leaves azalea_leaves flowering_azalea_leaves pale_oak_leaves vine

# small plants: top vertices sway
block.10002=grass short_grass fern dandelion poppy blue_orchid allium azure_bluet red_tulip orange_tulip white_tulip pink_tulip oxeye_daisy cornflower lily_of_the_valley wither_rose torchflower closed_eyeblossom open_eyeblossom sweet_berry_bush wheat carrots potatoes beetroots dead_bush oak_sapling spruce_sapling birch_sapling jungle_sapling acacia_sapling dark_oak_sapling cherry_sapling pale_oak_sapling mangrove_propagule short_dry_grass bush firefly_bush

# upper half of tall plants: sways from its base
block.10003=tall_grass:half=upper large_fern:half=upper sunflower:half=upper lilac:half=upper rose_bush:half=upper peony:half=upper pitcher_plant:half=upper tall_dry_grass

# lower half of tall plants: only the top edge moves
block.10004=tall_grass:half=lower large_fern:half=lower sunflower:half=lower lilac:half=lower rose_bush:half=lower peony:half=lower pitcher_plant:half=lower

# water
block.10010=water

# other translucent blocks
block.10011=ice frosted_ice slime_block honey_block
block.10012=white_stained_glass orange_stained_glass magenta_stained_glass light_blue_stained_glass yellow_stained_glass lime_stained_glass pink_stained_glass gray_stained_glass light_gray_stained_glass cyan_stained_glass purple_stained_glass blue_stained_glass brown_stained_glass green_stained_glass red_stained_glass black_stained_glass white_stained_glass_pane orange_stained_glass_pane magenta_stained_glass_pane light_blue_stained_glass_pane yellow_stained_glass_pane lime_stained_glass_pane pink_stained_glass_pane gray_stained_glass_pane light_gray_stained_glass_pane cyan_stained_glass_pane purple_stained_glass_pane blue_stained_glass_pane brown_stained_glass_pane green_stained_glass_pane red_stained_glass_pane black_stained_glass_pane tinted_glass

# light sources: bright texels glow
block.10020=glowstone sea_lantern shroomlight jack_o_lantern redstone_lamp:lit=true beacon end_rod lantern soul_lantern torch wall_torch soul_torch soul_wall_torch redstone_torch:lit=true redstone_wall_torch:lit=true campfire:lit=true soul_campfire:lit=true fire soul_fire ochre_froglight verdant_froglight pearlescent_froglight glow_lichen crying_obsidian sea_pickle respawn_anchor cave_vines:berries=true cave_vines_plant:berries=true furnace:lit=true blast_furnace:lit=true smoker:lit=true conduit copper_bulb:lit=true exposed_copper_bulb:lit=true weathered_copper_bulb:lit=true oxidized_copper_bulb:lit=true waxed_copper_bulb:lit=true waxed_exposed_copper_bulb:lit=true waxed_weathered_copper_bulb:lit=true waxed_oxidized_copper_bulb:lit=true amethyst_cluster large_amethyst_bud magma_block nether_portal end_portal end_gateway candle:lit=true white_candle:lit=true orange_candle:lit=true yellow_candle:lit=true red_candle:lit=true

# fully emissive
block.10021=lava
"""

UNIFORMS = """uniform sampler2D tex;
uniform sampler2D colortex0;
uniform sampler2D colortex1;
uniform sampler2D depthtex0;
uniform sampler2D depthtex1;
uniform mat4 gbufferModelView;
uniform mat4 gbufferModelViewInverse;
uniform mat4 gbufferProjection;
uniform mat4 gbufferProjectionInverse;
uniform mat4 shadowModelView;
uniform mat4 shadowModelViewInverse;
uniform mat4 shadowProjection;
uniform vec3 sunPosition;
uniform vec3 moonPosition;
uniform vec3 shadowLightPosition;
uniform vec3 upPosition;
uniform vec3 cameraPosition;
uniform vec3 fogColor;
uniform vec3 skyColor;
uniform vec4 entityColor;
uniform float rainStrength;
uniform float wetness;
uniform float frameTimeCounter;
uniform float viewWidth;
uniform float viewHeight;
uniform float near;
uniform float far;
uniform float nightVision;
uniform float blindness;
uniform float darknessFactor;
uniform float screenBrightness;
uniform int isEyeInWater;
uniform int renderStage;
uniform int heldBlockLightValue;
uniform int heldBlockLightValue2;
uniform ivec2 eyeBrightnessSmooth;
"""

COMMON = """// small helpers shared by every program
#define ID_LEAVES 10001.0
#define ID_PLANT 10002.0
#define ID_TALL_UPPER 10003.0
#define ID_TALL_LOWER 10004.0
#define ID_WATER 10010.0
#define ID_ICE 10011.0
#define ID_GLASS 10012.0
#define ID_GLOW 10020.0
#define ID_LAVA 10021.0

bool isId(float id, float want) { return abs(id - want) < 0.5; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 toLinear(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
float sat(float x) { return clamp(x, 0.0, 1.0); }

// interleaved gradient noise
float dither(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

float hash12(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 lightmapCoords(vec2 lm) { return clamp((lm - 1.0 / 32.0) * (32.0 / 30.0), 0.0, 1.0); }

vec3 screenToView(vec2 uv, float depth) {
    vec4 p = gbufferProjectionInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
}
"""

ATMOSPHERE = """// sky, sun and ambient colours. Everything is linear HDR.
float sunHeight() { return dot(normalize(sunPosition), normalize(upPosition)); }
float dayFactor() { return smoothstep(-0.12, 0.18, sunHeight()); }
float twilightFactor() { float e = sunHeight(); return exp(-e * e * 40.0); }

vec3 sunLightColor() {
#ifdef DIM_OVERWORLD
    float e = sunHeight();
    float low = 1.0 - smoothstep(0.02, 0.45, e);
    vec3 sun = mix(vec3(1.0, 0.91, 0.78) * 3.1, vec3(1.0, 0.47, 0.17) * 2.3, low * low);
    vec3 moon = vec3(0.42, 0.56, 0.95) * 0.14 * MOON_BRIGHTNESS;
    vec3 c = e > 0.0 ? sun : moon;
    c *= smoothstep(0.0, 0.06, abs(e));
    return c * (1.0 - 0.82 * rainStrength);
#else
    return vec3(0.0);
#endif
}

vec3 ambientColor() {
#if defined DIM_NETHER
    return toLinear(fogColor) * 0.55 + vec3(0.10, 0.06, 0.04);
#elif defined DIM_END
    return vec3(0.15, 0.12, 0.21);
#else
    float d = dayFactor();
    vec3 a = mix(vec3(0.05, 0.07, 0.13) * MOON_BRIGHTNESS, vec3(0.40, 0.54, 0.82) * 0.8, d);
    a = mix(a, vec3(0.42, 0.33, 0.38) * 0.5, twilightFactor() * 0.45);
    a = mix(a, vec3(luma(a)) * 0.75, rainStrength * 0.7);
    return a;
#endif
}

vec3 skyColorAt(vec3 dir) {
#if defined DIM_NETHER
    return toLinear(fogColor) * 0.9;
#elif defined DIM_END
    return vec3(0.035, 0.025, 0.055);
#else
    vec3 up = normalize(upPosition);
    vec3 sv = normalize(sunPosition);
    float h = dot(dir, up);
    float d = dayFactor();
    float tw = twilightFactor();
    float toSun = dot(dir, sv) * 0.5 + 0.5;

    vec3 zenith = mix(vec3(0.006, 0.010, 0.026), vec3(0.16, 0.34, 0.82), d);
    vec3 horizon = mix(vec3(0.025, 0.035, 0.065), vec3(0.60, 0.74, 0.95), d);
    horizon = mix(horizon, vec3(1.15, 0.48, 0.18), tw * pow(toSun, 2.5));
    zenith = mix(zenith, vec3(0.22, 0.20, 0.38), tw * 0.45);

    float hc = max(h, 0.0);
    vec3 c = mix(horizon, zenith, pow(hc, 0.45));
    c = mix(c, horizon * 0.35, sat(-h * 2.5));

    float cs = max(dot(dir, sv), 0.0);
    vec3 glow = mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 0.45, 0.15), tw);
    c += glow * (pow(cs, 10.0) * 0.30 + pow(cs, 120.0) * 0.9) * SUN_GLOW * (1.0 - rainStrength) * smoothstep(-0.2, 0.05, sunHeight());
    float cm = max(dot(dir, -sv), 0.0);
    c += vec3(0.25, 0.32, 0.5) * pow(cm, 30.0) * 0.08 * (1.0 - d);

    c = mix(c, vec3(luma(c)) * 0.55, rainStrength * 0.85);
    return c;
#endif
}

vec3 blockLightColor(float bl) {
    float b = bl * bl;
    return vec3(1.0, 0.60, 0.30) * (b * b * b * 1.5 + b * 0.09) * BLOCKLIGHT_STRENGTH;
}

vec3 minimumLight() { return vec3(0.012, 0.013, 0.016) * (1.0 + screenBrightness * 2.0) + vec3(0.30) * nightVision; }
"""

WAVING = """// gentle wind for foliage, offsets in world space
vec3 waveOffset(vec3 wp, float id, bool top, float sky) {
    float t = frameTimeCounter;
    float wind = WAVE_STRENGTH * (0.65 + 0.9 * rainStrength) * (0.55 + 0.45 * sin(t * 0.37 + wp.x * 0.05 + wp.z * 0.03));
    wind *= smoothstep(0.15, 0.6, sky);
    if (isId(id, ID_LEAVES)) {
        return vec3(sin(t * 1.7 + wp.x * 1.3 + wp.z * 0.7 + wp.y),
                    sin(t * 1.3 + wp.y * 1.9 + wp.x) * 0.5,
                    cos(t * 1.5 + wp.z * 1.1 + wp.x * 0.4)) * 0.035 * wind;
    }
    float amp = 0.0;
    if (isId(id, ID_PLANT) && top) amp = 0.09;
    else if (isId(id, ID_TALL_UPPER)) amp = top ? 0.16 : 0.08;
    else if (isId(id, ID_TALL_LOWER) && top) amp = 0.08;
    if (amp == 0.0) return vec3(0.0);
    vec2 sway = vec2(sin(t * 2.1 + wp.x * 0.9 + wp.z * 0.4), cos(t * 1.8 + wp.z * 1.1 + wp.x * 0.3) * 0.6);
    return vec3(sway.x, 0.0, sway.y) * amp * wind;
}
"""

WATER = """// procedural water surface: a few travelling sine waves plus a noise layer
float waterHeight(vec2 p) {
    float t = frameTimeCounter * WATER_SPEED;
    float h = 0.0;
    h += sin(dot(p, vec2(0.80, 0.60)) * 0.9 + t * 1.2) * 0.50;
    h += sin(dot(p, vec2(-0.55, 0.83)) * 1.7 + t * 1.7) * 0.26;
    h += sin(dot(p, vec2(0.96, -0.28)) * 3.1 + t * 2.4) * 0.12;
    h += valueNoise(p * 1.6 + vec2(t * 0.6, t * 0.35)) * 0.35;
#ifdef WATER_DETAIL
    h += valueNoise(p * 3.1 - vec2(t * 0.7, -t * 0.5)) * 0.10;
    h += sin(dot(p, vec2(0.3, 0.95)) * 4.4 + t * 2.6) * 0.04;
#endif
    return h;
}

vec3 waterNormalWorld(vec2 p) {
    float e = 0.06;
    float hx = waterHeight(p + vec2(e, 0.0)) - waterHeight(p - vec2(e, 0.0));
    float hz = waterHeight(p + vec2(0.0, e)) - waterHeight(p - vec2(0.0, e));
    float s = WATER_WAVE_HEIGHT * 0.22 / e;
    return normalize(vec3(-hx * s, 1.0, -hz * s));
}
"""

TONEMAP = """// Narkowicz fit of the ACES filmic curve
vec3 acesFilm(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 grade(vec3 c) {
    float l = luma(c);
    c = mix(vec3(l), c, SATURATION);
    return c;
}
"""
