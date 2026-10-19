// Pimpin Shaders Ultra - options (edit in-game: Video Settings > Shader Packs > Shader Settings)
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

// referenced here so every toggle is detected as an option
#ifdef SHADOWS
#endif
#ifdef PCSS
#endif
#ifdef COLORED_SHADOWS
#endif
#ifdef VOLUMETRIC_LIGHT
#endif
#ifdef SSR
#endif
#ifdef WET_REFLECTIONS
#endif
#ifdef BLOOM
#endif
#ifdef AUTO_EXPOSURE
#endif
#ifdef WAVING_PLANTS
#endif
#ifdef WATER_WAVES
#endif
#ifdef WATER_DETAIL
#endif
