#version 120
#define DIM_OVERWORLD 1
#define PROGRAM_POST 1
/* DRAWBUFFERS:04 */
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
#include "/program/deferred_fsh.glsl"
