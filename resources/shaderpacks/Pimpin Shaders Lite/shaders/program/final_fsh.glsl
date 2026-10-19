varying vec2 uv;

void main() {
    vec3 col = texture2D(colortex0, uv).rgb;
    float depth = texture2D(depthtex0, uv).r;
    vec3 vp = screenToView(uv, depth);
    vec3 dir = normalize(vp);
    float dist = length(vp);
    if (depth >= 1.0) {
        col = skyColorAt(dir) + texture2D(colortex2, uv).rgb;
        dist = far * 4.0;
    } else {
        col = applyFog(col, dir, dist);
    }
    vec4 weather = texture2D(colortex3, uv);
    col = col * (1.0 - weather.a) + weather.rgb;
    col = mediumFog(col, dist);
    gl_FragData[0] = vec4(finishColor(col, uv, exposureValue()), 1.0);
}
