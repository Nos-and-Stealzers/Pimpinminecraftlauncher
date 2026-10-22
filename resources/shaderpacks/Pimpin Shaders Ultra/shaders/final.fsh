#version 120
#define DIM_OVERWORLD 1
#define ULTRA 1
#define PROGRAM_POST 1
/* DRAWBUFFERS:0 */
/*
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
#include "/lib/settings.glsl"
#include "/lib/uniforms.glsl"
#include "/lib/common.glsl"
#include "/lib/atmosphere.glsl"
#include "/lib/shadow.glsl"
#include "/lib/water.glsl"
#include "/lib/clouds.glsl"
#include "/lib/tonemap.glsl"
#include "/lib/fog.glsl"
#include "/lib/skypaint.glsl"
#include "/lib/antialiasing.glsl"
#include "/program/final_fsh.glsl"
