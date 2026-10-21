varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying vec3 viewNormal;
varying vec3 viewPos;

void main() {
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lmcoord = lightmapCoords((gl_TextureMatrix[1] * gl_MultiTexCoord1).xy);
    glcolor = gl_Color;
    viewNormal = normalize(gl_NormalMatrix * gl_Normal);
    vec4 vp = gl_ModelViewMatrix * gl_Vertex;
    viewPos = vp.xyz;
    gl_Position = gl_ProjectionMatrix * vp;
    JITTER(gl_Position);
}
