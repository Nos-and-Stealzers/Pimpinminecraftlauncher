#version 120
#define DIM_NETHER 1
#define PROGRAM_POST 1
/* DRAWBUFFERS:0 */
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
#include "/program/deferred_fsh.glsl"
