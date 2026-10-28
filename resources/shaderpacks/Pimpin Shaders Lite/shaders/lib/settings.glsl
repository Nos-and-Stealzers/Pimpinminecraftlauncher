// Pimpin Shaders Lite - options (edit in-game: Video Settings > Shader Packs > Shader Settings)
const int shadowMapResolution = 1536; // [1024 1536 2048]
const float shadowDistance = 80.0; // [48.0 64.0 80.0 96.0 128.0]
const float shadowDistanceRenderMul = 1.0;
const float sunPathRotation = -25.0; // [-40.0 -30.0 -25.0 -15.0 0.0 15.0 25.0 40.0]
const bool shadowHardwareFiltering = true;
const float ambientOcclusionLevel = 1.0; // [0.0 0.25 0.5 0.75 1.0]

#define SHADOWS
#define SOFT_SHADOWS
#define COLORED_SHADOWS
#define SHADOW_SOFTNESS 1.0 // [0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define SHADOW_DISTORT 0.85
#define FXAA
#define SSAO
#define SSAO_STEPS 4 // [3 4 6 8]
#define SSAO_STRENGTH 0.8 // [0.4 0.5 0.6 0.7 0.8 0.9 1.0]
#define SSS_STRENGTH 1.0 // [0.0 0.25 0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define CLOUDS_2D
#define CLOUD_AMOUNT 1.0 // [0.0 0.25 0.5 0.75 1.0 1.25 1.5 1.75 2.0 2.5 3.0]
#define CLOUD_PLANE_HEIGHT 260.0 // [200.0 260.0 320.0 400.0]
#define GODRAYS
#define GODRAY_STEPS 10 // [6 8 10 14 20]
#define GODRAY_STRENGTH 1.0 // [0.0 0.25 0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define BLOOM
#define BLOOM_STRENGTH 1.0 // [0.0 0.25 0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define GLOWING_ORES
#define SUN_SIZE 1.0 // [0.5 0.62 0.75 0.88 1.0 1.25 1.5 1.75 2.0]
#define WAVING_PLANTS
#define WAVE_STRENGTH 1.0 // [0.0 0.25 0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define WATER_WAVES
#define WATER_DETAIL
#define SSR
#define SSR_STEPS 12 // [8 12 16 24]
#define WATER_REFRACTION 1.0 // [0.0 0.25 0.5 0.75 1.0 1.25 1.5]
#define WATER_WAVE_HEIGHT 0.4 // [0.2 0.25 0.3 0.35 0.4 0.5 0.6 0.7 0.8 0.9 1.0]
#define WATER_SPEED 1.0 // [0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define WATER_FOG 1.0 // [0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define FOG_DENSITY 1.0 // [0.0 0.25 0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define AMBIENT_STRENGTH 1.0 // [0.7 0.77 0.85 0.93 1.0 1.07 1.15 1.23 1.3]
#define MOON_BRIGHTNESS 1.0 // [0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define STAR_BRIGHTNESS 1.0 // [0.0 0.25 0.5 0.75 1.0 1.5 2.0]
#define CLOUD_BRIGHTNESS 1.0 // [0.6 0.7 0.8 0.9 1.0 1.1 1.2]
#define END_SKY 1.0 // [0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define AURORA 0 // [0 1 2]
#define AURORA_STEPS 8 // [6 8 12 16]
#define AURORA_BRIGHTNESS 1.0 // [0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define WATER_CLOUD_REFLECTIONS
#define BLOCKLIGHT_STRENGTH 1.0 // [0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.35 1.5]
#define EMISSIVE_STRENGTH 1.0 // [0.0 0.25 0.5 0.75 1.0 1.25 1.5 1.75 2.0]
#define EXPOSURE 1.0 // [0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6]
#define SATURATION 1.0 // [0.8 0.85 0.9 0.95 1.0 1.05 1.1 1.15 1.2]
#define NIGHT_DESAT 1.0 // [0.0 0.25 0.5 0.75 1.0]
#define VIGNETTE 0.22 // [0.0 0.06 0.12 0.17 0.22 0.28 0.35]

// referenced here so every toggle is detected as an option
#ifdef SHADOWS
#endif
#ifdef SOFT_SHADOWS
#endif
#ifdef COLORED_SHADOWS
#endif
#ifdef FXAA
#endif
#ifdef SSAO
#endif
#ifdef CLOUDS_2D
#endif
#ifdef GODRAYS
#endif
#ifdef BLOOM
#endif
#ifdef GLOWING_ORES
#endif
#ifdef WAVING_PLANTS
#endif
#ifdef WATER_WAVES
#endif
#ifdef WATER_DETAIL
#endif
#ifdef SSR
#endif
#ifdef WATER_CLOUD_REFLECTIONS
#endif
