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
block.10012=white_stained_glass orange_stained_glass magenta_stained_glass light_blue_stained_glass yellow_stained_glass lime_stained_glass pink_stained_glass gray_stained_glass light_gray_stained_glass cyan_stained_glass purple_stained_glass blue_stained_glass brown_stained_glass green_stained_glass red_stained_glass black_stained_glass white_stained_glass_pane orange_stained_glass_pane magenta_stained_glass_pane light_blue_stained_glass_pane yellow_stained_glass_pane lime_stained_glass_pane pink_stained_glass_pane gray_stained_glass_pane light_gray_stained_glass_pane cyan_stained_glass_pane purple_stained_glass_pane blue_stained_glass_pane brown_stained_glass_pane green_stained_glass_pane red_stained_glass_pane black_stained_glass_pane tinted_glass glass glass_pane

# light sources: bright texels glow
block.10020=glowstone sea_lantern shroomlight jack_o_lantern redstone_lamp:lit=true beacon end_rod lantern soul_lantern torch wall_torch soul_torch soul_wall_torch redstone_torch:lit=true redstone_wall_torch:lit=true campfire:lit=true soul_campfire:lit=true fire soul_fire ochre_froglight verdant_froglight pearlescent_froglight glow_lichen crying_obsidian sea_pickle respawn_anchor cave_vines:berries=true cave_vines_plant:berries=true furnace:lit=true blast_furnace:lit=true smoker:lit=true conduit copper_bulb:lit=true exposed_copper_bulb:lit=true weathered_copper_bulb:lit=true oxidized_copper_bulb:lit=true waxed_copper_bulb:lit=true waxed_exposed_copper_bulb:lit=true waxed_weathered_copper_bulb:lit=true waxed_oxidized_copper_bulb:lit=true amethyst_cluster large_amethyst_bud magma_block nether_portal end_portal end_gateway candle:lit=true white_candle:lit=true orange_candle:lit=true yellow_candle:lit=true red_candle:lit=true

# fully emissive
block.10021=lava

# ores: the coloured specks glow faintly (GLOWING_ORES)
block.10040=coal_ore iron_ore copper_ore gold_ore redstone_ore emerald_ore lapis_ore diamond_ore deepslate_coal_ore deepslate_iron_ore deepslate_copper_ore deepslate_gold_ore deepslate_redstone_ore deepslate_emerald_ore deepslate_lapis_ore deepslate_diamond_ore nether_gold_ore nether_quartz_ore ancient_debris

# shiny blocks: a little sun specular
block.10030=iron_block gold_block diamond_block emerald_block copper_block exposed_copper weathered_copper oxidized_copper waxed_copper_block netherite_block polished_andesite polished_diorite polished_granite polished_deepslate quartz_block smooth_quartz obsidian packed_ice blue_ice smooth_stone calcite
"""

UNIFORMS = """uniform sampler2D tex;
uniform sampler2D colortex0;
uniform sampler2D colortex1;
uniform sampler2D colortex4;
uniform sampler2D colortex5;
uniform sampler2D depthtex0;
uniform sampler2D depthtex1;
uniform mat4 gbufferModelView;
uniform mat4 gbufferModelViewInverse;
uniform mat4 gbufferProjection;
uniform mat4 gbufferProjectionInverse;
uniform mat4 gbufferPreviousModelView;
uniform mat4 gbufferPreviousProjection;
uniform mat4 shadowModelView;
uniform mat4 shadowModelViewInverse;
uniform mat4 shadowProjection;
uniform vec3 sunPosition;
uniform vec3 moonPosition;
uniform vec3 shadowLightPosition;
uniform vec3 upPosition;
uniform vec3 cameraPosition;
uniform vec3 previousCameraPosition;
uniform vec3 fogColor;
uniform vec3 skyColor;
uniform vec4 entityColor;
uniform float rainStrength;
uniform float wetness;
uniform float frameTimeCounter;
uniform float frameTime;
uniform float sunAngle;
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
uniform int frameCounter;
uniform int moonPhase;
uniform int heldBlockLightValue;
uniform int heldBlockLightValue2;
uniform ivec2 eyeBrightnessSmooth;
uniform float auroraCold; // custom uniform (shaders.properties): 1 in cold biomes, 0 elsewhere or on loaders without it
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
#define ID_SHINY 10030.0
#define ID_ORE 10040.0
#define PI 3.14159265
#define END_LIGHT_DIR vec3(0.3, 0.88, 0.36)

bool isId(float id, float want) { return abs(id - want) < 0.5; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 toLinear(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
float sat(float x) { return clamp(x, 0.0, 1.0); }
float pow2(float x) { return x * x; }
vec3 sat3(vec3 c) { return clamp(c, 0.0, 1.0); }

// interleaved gradient noise; the Ultra pack shifts it every frame so TAA can average it out
float dither(vec2 p) {
#if defined ULTRA && defined TAA
    p += 5.588238 * mod(float(frameCounter), 64.0);
#endif
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

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

vec3 viewToScreen(vec3 vp) {
    vec4 c = gbufferProjection * vec4(vp, 1.0);
    return c.xyz / c.w * 0.5 + 0.5;
}

vec2 vogel(int i, int n, float phi) {
    float r = sqrt((float(i) + 0.5) / float(n));
    float a = float(i) * 2.39996323 + phi;
    return r * vec2(cos(a), sin(a));
}

#if defined ULTRA && defined TAA
// sub-pixel camera jitter (Halton 2,3), averaged away again by the TAA pass
vec2 taaOffset() {
    float i = mod(float(frameCounter), 8.0) + 1.0;
    vec2 h = vec2(0.0);
    float f = 0.5;
    float j = i;
    for (int k = 0; k < 4; k++) { h.x += f * mod(j, 2.0); j = floor(j / 2.0); f *= 0.5; }
    f = 1.0 / 3.0;
    j = i;
    for (int k = 0; k < 3; k++) { h.y += f * mod(j, 3.0); j = floor(j / 3.0); f /= 3.0; }
    return (h - 0.5) * 2.0 / vec2(viewWidth, viewHeight);
}
#define JITTER(p) p.xy += taaOffset() * p.w
#else
#define JITTER(p)
#endif
"""

ATMOSPHERE = """// Sky and light colours.
// The overworld sky is a small physically based atmosphere (Rayleigh + Mie + ozone, single
// scattering plus a cheap multiple-scattering term). The prepare pass renders it into a
// sky-view lookup table in the corner of colortex5 (after Hillaire 2020); everything else reads
// that table, so sky, fog, reflections and ambient light always agree with each other.
#define LUT_W 96.0
#define LUT_H 48.0

float sunHeight() { return dot(normalize(sunPosition), normalize(upPosition)); }
float dayFactor() { return smoothstep(-0.10, 0.12, sunHeight()); }
float twilightFactor() { float e = sunHeight(); return exp(-e * e * 30.0); }

#ifdef DIM_OVERWORLD
const vec3 rayleighBeta = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const vec3 ozoneBeta = vec3(0.650e-3, 1.881e-3, 0.085e-3) * 1.5;
#define MIE_SCATTER 2.4e-3
#define MIE_EXTINCT 2.64e-3
#define ATM_GROUND 6360.0
#define ATM_TOP 6420.0

vec3 atmDensity(float h) {
    float haze = 1.0 + rainStrength * 3.0;
    return vec3(exp(-h / 8.0), exp(-h / 1.2) * haze, max(0.0, 1.0 - abs(h - 25.0) / 15.0));
}
vec3 atmExtinction(vec3 d) { return rayleighBeta * d.x + vec3(MIE_EXTINCT * d.y) + ozoneBeta * d.z; }

vec2 raySphere(vec3 o, vec3 d, float r) {
    float b = dot(o, d);
    float h = b * b - dot(o, o) + r * r;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

// transmittance from a point to the top of the atmosphere
vec3 atmTransmittance(vec3 p, vec3 L) {
    vec2 g = raySphere(p, L, ATM_GROUND);
    if (g.x > 0.0) return vec3(0.0);
    float t = raySphere(p, L, ATM_TOP).y;
    vec3 od = vec3(0.0);
    for (int i = 0; i < 6; i++) {
        vec3 q = p + L * (t * (float(i) + 0.5) / 6.0);
        od += atmExtinction(atmDensity(length(q) - ATM_GROUND));
    }
    return exp(-od * t / 6.0);
}

// light scattered towards the eye along a view ray, for a light source of irradiance 1
vec3 atmScatter(vec3 d, vec3 L) {
    vec3 o = vec3(0.0, ATM_GROUND + 0.4, 0.0);
    float t = raySphere(o, d, ATM_TOP).y;
    vec2 gh = raySphere(o, d, ATM_GROUND);
    if (gh.x > 0.0) t = gh.x;
    float mu = dot(d, L);
    float pR = 0.0596831 * (1.0 + mu * mu);
    const float g = 0.78;
    float pM = 0.1193662 * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    vec3 T = vec3(1.0);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 16; i++) {
        float s0 = t * pow2(float(i) / 16.0);
        float s1 = t * pow2(float(i + 1) / 16.0);
        vec3 p = o + d * (0.5 * (s0 + s1));
        vec3 dens = atmDensity(length(p) - ATM_GROUND);
        vec3 ext = atmExtinction(dens);
        vec3 Ts = atmTransmittance(p, L);
        vec3 scat = rayleighBeta * dens.x * (pR + 0.07) + vec3(MIE_SCATTER * dens.y * (pM + 0.05));
        vec3 stepT = exp(-ext * (s1 - s0));
        acc += T * scat * Ts * (1.0 - stepT) / max(ext, vec3(1e-7));
        T *= stepT;
    }
    return acc;
}

vec3 sunTransmittance(float sinE) {
    vec3 L = vec3(sqrt(max(1.0 - sinE * sinE, 0.0)), sinE, 0.0);
    return atmTransmittance(vec3(0.0, ATM_GROUND + 0.4, 0.0), L);
}

vec3 moonTint() { return vec3(0.40, 0.58, 1.0) * MOON_BRIGHTNESS * (0.55 + 0.45 * abs(float(moonPhase) - 4.0) / 4.0); }

// LUT parameterisation: x = angle to the sun around the up axis, y = elevation (squeezed towards the horizon)
vec3 lutDirection(vec2 uv) {
    float phi = uv.x * PI;
    float v = uv.y * 2.0 - 1.0;
    float l = sign(v) * v * v * PI * 0.5;
    return vec3(cos(l) * cos(phi), sin(l), cos(l) * sin(phi));
}

vec2 lutCoord(vec3 d) {
    vec3 up = normalize(upPosition);
    float s = clamp(dot(d, up), -1.0, 1.0);
    float l = asin(s);
    vec3 sv = normalize(sunPosition);
    vec3 sh = sv - up * dot(sv, up);
    vec3 dh = d - up * s;
    float c = dot(dh, sh) * inversesqrt(max(dot(dh, dh) * dot(sh, sh), 1e-12));
    float u = acos(clamp(c, -1.0, 1.0)) / PI;
    float v = 0.5 + 0.5 * sign(l) * sqrt(abs(l) / (PI * 0.5));
    vec2 uv = vec2(u, v) * (vec2(LUT_W, LUT_H) - 1.0) + 0.5;
    return uv / vec2(viewWidth, viewHeight);
}
#endif

// the old hand-tuned gradient, used if the LUT was never written (an old loader without prepare passes)
vec3 analyticSky(vec3 dir) {
    vec3 up = normalize(upPosition);
    vec3 sv = normalize(sunPosition);
    float h = dot(dir, up);
    float d = dayFactor();
    float tw = twilightFactor();
    float toSun = dot(dir, sv) * 0.5 + 0.5;
    vec3 zenith = mix(vec3(0.006, 0.010, 0.026), vec3(0.16, 0.34, 0.82), d);
    vec3 horizon = mix(vec3(0.025, 0.035, 0.065), vec3(0.60, 0.74, 0.95), d);
    horizon = mix(horizon, vec3(1.15, 0.48, 0.18), tw * pow(toSun, 2.5));
    vec3 c = mix(horizon, zenith, pow(max(h, 0.0), 0.45));
    // The analytic fallback shares the same horizon continuation as the LUT.
    return mix(c, vec3(luma(c)) * 0.55, rainStrength * 0.85);
}

vec4 lutTexel(float x) { return texture2D(colortex5, vec2(x + 0.5, LUT_H + 0.5) / vec2(viewWidth, viewHeight)); }

// sky radiance seen in a view-space direction, without the sun, moon and stars
vec3 skyColorAt(vec3 dir) {
#if defined DIM_NETHER
    return toLinear(fogColor) * 0.9;
#elif defined DIM_END
    // dark void overhead, a purple haze band around the horizon, dimmer again below
    float h = dot(dir, normalize(upPosition));
    vec3 c = mix(vec3(0.120, 0.048, 0.185), vec3(0.0045, 0.0025, 0.012), 1.0 - exp(-max(h, 0.0) * 5.0));
    c = mix(c, vec3(0.030, 0.012, 0.055), 1.0 - exp(-max(-h, 0.0) * 5.0));
    return c * END_SKY;
#else
    vec4 s = texture2D(colortex5, lutCoord(dir));
    return s.a > 0.5 ? s.rgb : analyticSky(dir);
#endif
}

// colour of the direct sun or moon light reaching the ground
vec3 sunLightColor() {
#ifdef DIM_OVERWORLD
    vec4 t = lutTexel(0.0);
    if (t.a < 0.5) {
        float e = sunHeight();
        float low = 1.0 - smoothstep(0.02, 0.45, e);
        vec3 c = e > 0.0 ? mix(vec3(1.0, 0.91, 0.78) * 3.1, vec3(1.0, 0.47, 0.17) * 2.3, low * low) : vec3(0.42, 0.56, 0.95) * 0.14 * MOON_BRIGHTNESS;
        return c * smoothstep(0.0, 0.06, abs(e)) * (1.0 - 0.82 * rainStrength);
    }
    return t.rgb;
#else
    return vec3(0.0);
#endif
}

// light from the whole sky onto an upward facing surface
vec3 ambientColor() {
#if defined DIM_NETHER
    return toLinear(fogColor) * 0.55 + vec3(0.10, 0.06, 0.04);
#elif defined DIM_END
    return vec3(0.034, 0.026, 0.078) * END_SKY;
#else
    vec4 t = lutTexel(1.0);
    if (t.a < 0.5) {
        float d = dayFactor();
        vec3 a = mix(vec3(0.05, 0.07, 0.13) * MOON_BRIGHTNESS, vec3(0.40, 0.54, 0.82) * 0.8, d);
        return mix(a, vec3(luma(a)) * 0.75, rainStrength * 0.7);
    }
    return t.rgb;
#endif
}

#ifdef DIM_OVERWORLD
// colour of the sun disk itself (not faded out at the horizon like the ground light)
vec3 sunDiskColor() {
    vec4 t = lutTexel(2.0);
    if (t.a < 0.5) {
        float e = sunHeight();
        float low = 1.0 - smoothstep(0.0, 0.4, e);
        return mix(vec3(1.0, 0.92, 0.80) * 3.2, vec3(1.0, 0.36, 0.08) * 2.2, low * low) * smoothstep(-0.06, 0.0, e) * (1.0 - 0.9 * rainStrength);
    }
    return t.rgb;
}

// light that tints clouds: the sun by day, the moon by night
vec3 cloudLightColor() { return sunHeight() > -0.02 ? sunDiskColor() : sunLightColor(); }

// round sun disk with limb darkening, a tight glare and a wide halo; a soft glow around the moon
vec3 sunMoonGlow(vec3 dir) {
    vec3 col = vec3(0.0);
    float horizon = smoothstep(-0.03, 0.01, dot(dir, normalize(upPosition)));
    float cs = dot(dir, normalize(sunPosition));
    if (cs > 0.0) {
        vec3 sunC = sunDiskColor();
        float tw = twilightFactor();
        float ang = acos(min(cs, 1.0));
        // the low sun looks bigger (and is easier to read through the haze)
        float x = ang / (0.034 * SUN_SIZE * (1.0 + 0.45 * tw));
        float limb = sqrt(max(1.0 - x * x, 0.0));
        float disk = (1.0 - smoothstep(0.85, 1.0, x)) * (0.45 + 0.55 * limb);
        float glare = exp(-ang * 32.0) * (0.9 + 0.8 * tw) + exp(-ang * 6.0) * (0.06 + 0.32 * tw) + exp(-ang * 2.2) * 0.10 * tw;
        // warm glow spreading sideways along the horizon around a low sun
        vec3 up = normalize(upPosition);
        float dh = dot(dir, up);
        vec3 sh = normalize(sunPosition) - up * dot(normalize(sunPosition), up);
        vec3 ph = dir - up * dh;
        float az = dot(ph, sh) * inversesqrt(max(dot(ph, ph) * dot(sh, sh), 1e-8));
        float band = exp(-abs(dh) * 9.0) * pow(max(az, 0.0), 3.0) * tw * 0.22;
        col += sunC * (disk * 40.0 * horizon + glare * mix(horizon, 1.0, 0.5) + band * horizon);
    }
    float cm = dot(dir, normalize(moonPosition));
    if (cm > 0.0) {
        float ang = acos(min(cm, 1.0));
        col += moonTint() * (exp(-ang * 40.0) * 0.05 + exp(-ang * 6.0) * 0.012) * (1.0 - dayFactor()) * horizon;
    }
    return col * (1.0 - rainStrength);
}

// faint dense stars and a Milky Way band behind the vanilla stars
vec3 nightSkyDetail(vec3 dir) {
    float night = (1.0 - dayFactor()) * (1.0 - rainStrength) * STAR_BRIGHTNESS;
    vec3 d = mat3(gbufferModelViewInverse) * dir;
    if (night < 0.01 || d.y < -0.05) return vec3(0.0);
    float fade = smoothstep(-0.05, 0.25, d.y);
    // rotate the sky with the sun so the stars turn through the night
    float a = sunAngle * 6.2831853;
    d.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * d.xy;
    vec2 sc = d.xz / (abs(d.y) + 0.35) * 70.0;
    vec2 cell = floor(sc);
    float h = hash12(cell);
    vec2 f = fract(sc) - 0.5 - (vec2(hash12(cell + 7.1), hash12(cell + 3.7)) - 0.5) * 0.6;
    float star = step(0.975, h) * smoothstep(0.25, 0.0, length(f)) * (0.3 + 1.2 * pow(fract(h * 91.7), 3.0));
    vec3 starC = mix(vec3(1.0, 0.82, 0.62), vec3(0.70, 0.82, 1.0), fract(h * 37.3));
    // Milky Way: a noisy band along a tilted great circle
    vec3 bandN = normalize(vec3(0.35, 0.45, 0.82));
    float b = dot(d, bandN);
    vec2 q = d.xz / (abs(d.y) + 0.35) * 2.2 + d.y * 1.7;
    float n = valueNoise(q * 2.0) * 0.6 + valueNoise(q * 5.0 + 3.1) * 0.4;
    float band = exp(-b * b * 14.0) * (0.35 + 0.9 * n * n);
    float dust = smoothstep(0.55, 0.8, valueNoise(q * 3.5 + 9.0)) * exp(-b * b * 60.0);
    vec3 mw = mix(vec3(0.050, 0.045, 0.070), vec3(0.075, 0.060, 0.050), n) * band * (1.0 - 0.75 * dust);
    return (starC * star * 0.25 * (0.8 + 0.4 * band) + mw * 0.35) * night * fade;
}
#endif


vec3 blockLightColor(float bl) {
    // treat the light level as distance from the source: bright warm pools that fall off quickly,
    // plus a faint fill so lit caves never go fully black
    float d = max(14.5 - bl * 15.0, 0.0);
    float b = 1.8 * exp2(-0.85 * d) + 0.035 * bl * bl;
#ifdef DIM_NETHER
    vec3 warm = vec3(1.0, 0.48, 0.20);
#else
    vec3 warm = vec3(1.0, 0.55, 0.24);
#endif
    return warm * b * BLOCKLIGHT_STRENGTH;
}

vec3 minimumLight() { return vec3(0.010, 0.012, 0.016) * (1.0 + screenBrightness * 2.5) + vec3(0.30) * nightVision; }
"""

WAVING = """// gentle wind for foliage, offsets in world space
vec3 waveOffset(vec3 wp, float id, bool top, float sky) {
    float t = frameTimeCounter;
    float gust = 0.6 + 0.4 * sin(t * 0.37 + wp.x * 0.05 + wp.z * 0.03) * sin(t * 0.21 + wp.z * 0.02);
    float wind = WAVE_STRENGTH * (0.65 + 0.9 * rainStrength) * gust;
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

WATER = """// Directional gravity waves and wind ripples. Analytic slopes avoid four full noise evaluations.
// Return value-noise height and its exact x/z derivatives from the same four corner hashes.
vec3 waterNoiseGradient(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0));
    return vec3(mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
                mix(b - a, d - c, u.y) * du.x, mix(c - a, d - b, u.x) * du.y);
}

// Shared phase/amplitude definitions keep the testable height and derivative in sync.
vec3 waterWaveData(vec2 p) {
    float t = frameTimeCounter * WATER_SPEED;
    vec3 h = vec3(0.0);
    vec2 k = vec2(0.80, 0.60) * 0.9;
    float a = dot(p, k) + t * 1.2;
    h += vec3(sin(a), cos(a) * k) * 0.50;
    k = vec2(-0.55, 0.83) * 1.7;
    a = dot(p, k) + t * 1.7;
    h += vec3(sin(a), cos(a) * k) * 0.26;
    k = vec2(0.96, -0.28) * 3.1;
    a = dot(p, k) + t * 2.4;
    h += vec3(sin(a), cos(a) * k) * 0.12;
    vec3 noise = waterNoiseGradient(p * 1.6 + vec2(t * 0.6, t * 0.35));
    h += noise * vec3(0.35, 0.56, 0.56);
#ifdef WATER_DETAIL
    // Opposing capillary ripples: low amplitudes but visible glints, no repeated full fbm.
    k = vec2(0.45, 0.89) * 5.7;
    a = dot(p, k) - t * 3.0;
    h += vec3(sin(a), cos(a) * k) * 0.025;
    k = vec2(-0.93, 0.36) * 8.1;
    a = dot(p, k) + t * 3.7;
    h += vec3(sin(a), cos(a) * k) * 0.012;
#endif
    return h;
}
float waterHeight(vec2 p) { return waterWaveData(p).x; }
vec2 waterSlope(vec2 p) { return waterWaveData(p).yz; }

vec3 waterNormalWorld(vec2 p) {
    vec2 slope = waterSlope(p);
    // Calm distant water instead of turning sub-pixel ripples into white shimmer.
    float distanceFade = 1.0 / (1.0 + length(p - cameraPosition.xz) * 0.012);
    slope *= WATER_WAVE_HEIGHT * 0.62 * distanceFade;
    return normalize(vec3(-slope.x, 1.0, -slope.y));
}

// Per-channel Beer-Lambert transmission; red disappears fastest in clear water.
vec3 waterTransmission(float thickness, float murk) {
    return exp(-vec3(0.42, 0.11, 0.07) * max(thickness, 0.0) * murk);
}

#ifdef SSR
// Geometric steps cover a useful distance in twelve taps. Only refine a front-to-back
// crossing; revalidate the final depth and fade at screen edges, never reflect the sky as terrain.
vec4 traceWaterReflection(sampler2D scene, vec3 origin, vec3 R, float jitter) {
    float stepSize = 0.28 + length(origin) * 0.015;
    float previousT = 0.0;
    float t = stepSize * (0.75 + jitter * 0.5);
    for (int i = 0; i < SSR_STEPS; i++) {
        vec3 pos = origin + R * t;
        if (pos.z >= -near) break;
        vec3 sc = viewToScreen(pos);
        if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0 || sc.z >= 1.0) break;
        float d = texture2D(depthtex1, sc.xy).r;
        float gap = d >= 1.0 ? -1.0 : screenToView(sc.xy, d).z - pos.z;
        if (d > 0.56 && gap > 0.0 && gap < stepSize * 2.0 + 0.25) {
            float lo = previousT, hi = t;
            for (int j = 0; j < 4; j++) {
                float mid = (lo + hi) * 0.5;
                vec3 mp = origin + R * mid;
                vec3 ms = viewToScreen(mp);
                float md = texture2D(depthtex1, ms.xy).r;
                if (md < 1.0 && screenToView(ms.xy, md).z > mp.z) hi = mid;
                else lo = mid;
            }
            vec3 hitPos = origin + R * hi;
            sc = viewToScreen(hitPos);
            d = texture2D(depthtex1, sc.xy).r;
            float error = abs(screenToView(sc.xy, d).z - hitPos.z);
            float confidence = 1.0 - smoothstep(0.12 + hi * 0.008, 0.5 + hi * 0.02, error);
            vec2 edge = min(sc.xy, 1.0 - sc.xy);
            confidence *= clamp(min(edge.x, edge.y) * 16.0, 0.0, 1.0);
            if (d >= 1.0 || d <= 0.56) return vec4(0.0);
            return vec4(texture2D(scene, sc.xy).rgb, confidence);
        }
        previousT = t;
        t += stepSize;
        stepSize *= 1.5;
    }
    return vec4(0.0);
}
#endif

// light focused by the waves onto whatever is under the water (iterated warp pattern)
float waterCaustics(vec3 wp) {
    float t = frameTimeCounter * WATER_SPEED * 0.5;
    vec2 p = mod(wp.xz * 0.55 + wp.y * 0.08, 6.2831853) - 250.0;
    vec2 i = p;
    float c = 1.0;
    for (int n = 0; n < 4; n++) {
        float tt = t * (1.0 - 3.5 / float(n + 1));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
}
"""

TONEMAP = """// ACES filmic curve: Stephen Hill's fit of the RRT + ODT (sRGB -> AP1 -> curve -> sRGB).
// Gives more contrast in the mids and a soft, slightly desaturated roll-off in the highlights.
vec3 acesFit(vec3 c) {
    const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    c = inM * (c * 1.6);
    vec3 a = c * (c + 0.0245786) - 0.000090537;
    vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
    return clamp(outM * (a / b), 0.0, 1.0);
}

// ACES bleaches bright saturated lights (torch flames, lava) towards white; blend a little of a
// hue-preserving version back in so they keep their colour
vec3 tonemap(vec3 c) {
    vec3 t = acesFit(c);
    vec3 hp = c * (luma(t) / max(luma(c), 1e-5));
    hp /= max(1.0, max(hp.r, max(hp.g, hp.b)));
    // leave display headroom for the colour grade; even a bright white surface keeps texture
    return mix(t, hp, 0.35) * 0.97;
}

vec3 grade(vec3 c) {
    float l = luma(c);
    // vibrance: push the dull colours more than the already vivid ones
    float s = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    c = mix(vec3(l), c, SATURATION * (1.0 + 0.25 * (1.0 - sat(s * 2.0))));
    // warm highlights, slightly cool shadows
    c *= mix(vec3(0.97, 0.99, 1.04), vec3(1.03, 1.0, 0.96), smoothstep(0.1, 0.7, l));
    return max(c, vec3(0.0));
}
"""

CLOUDS = """// cumulus layer for the Ultra pack: 2D coverage with a vertical profile, raymarched in deferred
float cloudFbm(vec2 p) {
    float n = valueNoise(p) * 0.5;
    n += valueNoise(p * 2.03 + 11.7) * 0.25;
    n += valueNoise(p * 4.01 + 3.1) * 0.125;
    n += valueNoise(p * 8.07 + 7.9) * 0.0625;
    return n / 0.9375;
}

float cloudCoverage(vec2 xz) {
    vec2 p = (xz + vec2(frameTimeCounter * 2.0, frameTimeCounter * 0.7)) * 0.0028;
    float cov = CLOUD_AMOUNT * 0.1 + rainStrength * 0.3;
    return sat((cloudFbm(p) - (0.62 - cov)) * 3.2);
}

#ifdef VOLUMETRIC_CLOUDS

float cloudDensity(vec3 wp, bool detail) {
    float h = (wp.y - CLOUD_HEIGHT) / CLOUD_THICKNESS;
    if (h < 0.0 || h > 1.0) return 0.0;
    float cov = cloudCoverage(wp.xz);
    if (cov <= 0.0) return 0.0;
    // rounded tops, flatter bases
    float profile = smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.35, 1.0, h));
    float d = cov * profile - h * 0.25;
    if (detail && d > 0.0) {
        vec2 q = wp.xz * 0.035 + wp.y * 0.05 + frameTimeCounter * 0.04;
        d -= (valueNoise(q) * 0.6 + valueNoise(q * 2.7) * 0.4) * 0.22 * (1.0 - h * 0.5);
    }
    return sat(d * 3.0);
}

// how much sun a point on the ground gets through the cloud layer
float cloudShadow(vec3 wp, vec3 Lworld) {
    if (Lworld.y < 0.05) return 1.0;
    vec3 p = wp + Lworld * ((CLOUD_HEIGHT + CLOUD_THICKNESS * 0.35 - wp.y) / Lworld.y);
    return 1.0 - 0.75 * smoothstep(0.0, 0.6, cloudCoverage(p.xz));
}
#endif

#ifdef DIM_OVERWORLD
// A flat noise layer (Lite's clouds, Ultra's high cirrus). Returns scattered light (rgb) and transmittance (a).
// Lighting: the layer is brighter where the coverage thins towards the sun (cheap self-shadowing),
// plus a forward-scattering lobe that gives silver linings around the sun.
vec4 cloudPlane(vec3 dirView, float height, float scale, float cover, float stretch, float opacity) {
    vec3 d = mat3(gbufferModelViewInverse) * dirView;
    if (d.y < 0.01) return vec4(0.0, 0.0, 0.0, 1.0);
    float t = (height - cameraPosition.y) / d.y;
    if (t <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
    vec2 p = (cameraPosition.xz + d.xz * t + vec2(frameTimeCounter * 3.0, frameTimeCounter * 1.1)) * scale;
    p.x *= 1.0 / stretch;
    float n = cloudFbm(p);
    float c = smoothstep(1.0 - cover, 1.0 - cover + 0.32, n);
    if (c <= 0.001) return vec4(0.0, 0.0, 0.0, 1.0);
    vec3 Lw = normalize(mat3(gbufferModelViewInverse) * shadowLightPosition);
    float n2 = cloudFbm(p + normalize(Lw.xz + 1e-4) * 0.22);
    float lit = sat(0.55 + (n - n2) * 2.5);
    float mu = dot(d, Lw);
    float phase = 0.55 + 1.6 * pow(max(mu, 0.0), 10.0) + 0.35 * pow(max(mu, 0.0), 2.0);
    float thin = 1.0 - c;
    vec3 light = cloudLightColor() * (0.22 + 0.78 * lit) * phase * (0.30 + 0.45 * thin) + ambientColor() * (0.85 + 0.3 * thin);
    light *= mix(1.0, 0.45, rainStrength) * CLOUD_BRIGHTNESS;
    float fade = exp(-t * 0.00011) * smoothstep(0.01, 0.12, d.y);
    float a = c * opacity * fade;
    return vec4(light * a, 1.0 - a);
}
#endif
"""


ANTIALIASING = """// Low-tap FXAA-style spatial filter, with perceptual luma for HDR edge decisions.
// Filter along the local diagonal edge tangent; reject a broad blend which crosses luma bounds.
#ifdef FXAA
float aaLuma(vec3 c) {
    float l = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0);
    return sqrt(l / (1.0 + l));
}
vec3 spatialAA(sampler2D image, vec2 coord, vec2 px) {
    vec3 center = texture2D(image, coord).rgb;
    float m = aaLuma(center);
    float nw = aaLuma(texture2D(image, coord + vec2(-px.x, px.y)).rgb);
    float ne = aaLuma(texture2D(image, coord + px).rgb);
    float sw = aaLuma(texture2D(image, coord - px).rgb);
    float se = aaLuma(texture2D(image, coord + vec2(px.x, -px.y)).rgb);
    float lo = min(m, min(min(nw, ne), min(sw, se)));
    float hi = max(m, max(max(nw, ne), max(sw, se)));
    if (hi - lo < max(0.045, hi * 0.11)) return center;
    vec2 gradient = vec2(ne + se - nw - sw, nw + ne - sw - se);
    vec2 tangent = vec2(-gradient.y, gradient.x);
    float stabilizer = max((nw + ne + sw + se) * 0.02, 0.006);
    tangent /= min(abs(tangent.x), abs(tangent.y)) + stabilizer;
    tangent = clamp(tangent, vec2(-4.0), vec2(4.0)) * px;
    vec3 narrow = (texture2D(image, coord - tangent * 0.18).rgb + texture2D(image, coord + tangent * 0.18).rgb) * 0.5;
    vec3 wide = narrow * 0.5 + (texture2D(image, coord - tangent * 0.48).rgb + texture2D(image, coord + tangent * 0.48).rgb) * 0.25;
    float wl = aaLuma(wide);
    return wl < lo || wl > hi ? narrow : wide;
}
#endif
"""
