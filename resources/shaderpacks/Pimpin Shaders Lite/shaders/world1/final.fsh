#version 120
#define DIM_END 1
#define PROGRAM_POST 1
/* DRAWBUFFERS:0 */
/*
const int colortex0Format = RGBA16F;
const int colortex2Format = RGBA16F;
const int colortex3Format = RGBA16F;
const vec4 colortex2ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 colortex3ClearColor = vec4(0.0, 0.0, 0.0, 0.0);
*/
#include "/lib/settings.glsl"
#include "/lib/uniforms.glsl"
#include "/lib/common.glsl"
#include "/lib/atmosphere.glsl"
#include "/lib/shadow.glsl"
#include "/lib/tonemap.glsl"
#include "/lib/fog.glsl"
#include "/program/final_fsh.glsl"
