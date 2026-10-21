varying vec2 uv;

#ifdef SSAO
// cheap depth-only ambient occlusion (after Capt Tatsu / MakeUp), 2 x SSAO_STEPS taps
float linDepth(float d) { return (2.0 * near) / (far + near - (d * 2.0 - 1.0) * (far - near)); }

float depthAO(float depth, float noise) {
    float ld = linDepth(depth);
    vec2 scale = vec2(viewHeight / viewWidth, 1.0) * gbufferProjection[1][1] * 0.5 / (ld * far) * 1.2;
    float ao = 0.0;
    for (int i = 0; i < SSAO_STEPS; i++) {
        float s = float(i) + noise;
        float a = fract(s * 1.618034) * 3.1415926;
        vec2 o = vec2(cos(a), sin(a)) * s / float(SSAO_STEPS) * scale;
        float d1 = (ld - linDepth(texture2D(depthtex0, uv + o).r)) * far;
        float d2 = (ld - linDepth(texture2D(depthtex0, uv - o).r)) * far;
        float angle = sat(0.5 - d1) + sat(0.5 - d2);
        float dist = sat(0.25 * d1 - 1.0) + sat(0.25 * d2 - 1.0);
        ao += sat(angle + dist);
    }
    ao /= float(SSAO_STEPS);
    return mix(1.0, sqrt(ao), SSAO_STRENGTH);
}
#endif

void main() {
    vec3 col = texture2D(colortex0, uv).rgb;
    float depth = texture2D(depthtex0, uv).r;
    vec3 vp = screenToView(uv, depth);
    vec3 dir = normalize(vp);
    float dist = length(vp);
    if (depth >= 1.0) {
        dist = far * 4.0;
    } else {
#ifdef SSAO
        if (depth > 0.56) col *= depthAO(depth, dither(gl_FragCoord.xy));
#endif
        col = applyFog(col, dir, dist);
    }
    vec4 weather = texture2D(colortex3, uv);
    col = col * (1.0 - weather.a) + weather.rgb;
    col = mediumFog(col, dist);
    gl_FragData[0] = vec4(finishColor(col, uv, exposureValue()), 1.0);
}
