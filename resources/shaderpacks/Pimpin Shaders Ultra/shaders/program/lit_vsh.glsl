varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying vec3 viewNormal;
varying vec3 viewPos;
varying vec3 worldPos;
varying vec3 shadowPos;
varying float blockId;
attribute vec4 mc_Entity;
attribute vec4 mc_midTexCoord;

void main() {
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lmcoord = lightmapCoords((gl_TextureMatrix[1] * gl_MultiTexCoord1).xy);
    glcolor = gl_Color;
    viewNormal = normalize(gl_NormalMatrix * gl_Normal);
#if defined PROGRAM_TERRAIN || defined PROGRAM_WATER
    blockId = mc_Entity.x;
#else
    blockId = 0.0;
#endif
    vec4 vp = gl_ModelViewMatrix * gl_Vertex;
    vec3 playerPos = (gbufferModelViewInverse * vp).xyz;
#if defined PROGRAM_TERRAIN && defined WAVING_PLANTS
    playerPos += waveOffset(playerPos + cameraPosition, mc_Entity.x, gl_MultiTexCoord0.t < mc_midTexCoord.t, lmcoord.y);
    vp = gbufferModelView * vec4(playerPos, 1.0);
#endif
    viewPos = vp.xyz;
    worldPos = playerPos + cameraPosition;
    gl_Position = gl_ProjectionMatrix * vp;
    JITTER(gl_Position);
#if defined SHADOWS && defined DIM_OVERWORLD && !defined PROGRAM_HAND
    vec3 wn = mat3(gbufferModelViewInverse) * viewNormal;
    if (blockId > 10000.5 && blockId < 10004.5) wn = normalize(mat3(gbufferModelViewInverse) * shadowLightPosition);
    shadowPos = shadowClipPos(playerPos, wn);
#else
    shadowPos = vec3(0.0);
#endif
}
