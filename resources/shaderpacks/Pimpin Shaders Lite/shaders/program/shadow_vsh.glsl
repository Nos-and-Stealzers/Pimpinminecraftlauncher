varying vec2 texcoord;
varying vec4 glcolor;
varying float blockId;
attribute vec4 mc_Entity;
attribute vec4 mc_midTexCoord;

void main() {
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    glcolor = gl_Color;
    blockId = mc_Entity.x;
    vec4 vp = gl_ModelViewMatrix * gl_Vertex;
#ifdef WAVING_PLANTS
    vec3 pp = (shadowModelViewInverse * vp).xyz;
    vec2 lm = lightmapCoords((gl_TextureMatrix[1] * gl_MultiTexCoord1).xy);
    pp += waveOffset(pp + cameraPosition, mc_Entity.x, gl_MultiTexCoord0.t < mc_midTexCoord.t, lm.y);
    vp = shadowModelView * vec4(pp, 1.0);
#endif
    gl_Position = gl_ProjectionMatrix * vp;
    gl_Position.xy = distortShadow(gl_Position.xy);
}
