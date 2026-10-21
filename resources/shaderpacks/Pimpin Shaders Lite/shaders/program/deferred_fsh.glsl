varying vec2 uv;

// paint the sky behind the opaque world before translucent blocks are drawn
void main() {
    vec3 col = texture2D(colortex0, uv).rgb;
    float depth = texture2D(depthtex0, uv).r;
    if (depth >= 1.0) {
        vec3 dir = normalize(screenToView(uv, 1.0));
        col = skyColorAt(dir) + texture2D(colortex2, uv).rgb;
#ifdef DIM_END
        col += endSkyDetail(dir);
#endif
    }
    gl_FragData[0] = vec4(col, 1.0);
}
