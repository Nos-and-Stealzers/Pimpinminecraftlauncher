// Pimpin Shaders Lite - options (edit in-game: Video Settings > Shader Packs > Shader Settings)
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

// referenced here so every toggle is detected as an option
#ifdef SHADOWS
#endif
#ifdef SOFT_SHADOWS
#endif
#ifdef WAVING_PLANTS
#endif
#ifdef WATER_WAVES
#endif
