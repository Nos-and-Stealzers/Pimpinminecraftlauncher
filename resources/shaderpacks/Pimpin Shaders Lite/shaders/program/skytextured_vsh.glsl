varying vec2 texcoord;
varying vec4 glcolor;
varying vec3 viewPos;

void main() {
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    glcolor = gl_Color;
    viewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;
    gl_Position = ftransform();
    JITTER(gl_Position);
}
