varying vec2 uv;
uniform sampler2D colortex7;

// temporal anti-aliasing: reproject last frame, clamp it to this frame's neighbourhood, blend
vec3 toYCoCg(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
vec3 fromYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
vec3 squash(vec3 c) { return c / (1.0 + luma(c)); }
vec3 unsquash(vec3 c) { return c / max(1.0 - luma(c), 0.001); }

void main() {
    vec3 cur = texture2D(colortex0, uv).rgb;
#ifdef TAA
    float depth = texture2D(depthtex0, uv).r;
    vec2 prevUV = uv;
    if (depth > 0.56) {
        vec3 vp = screenToView(uv, depth);
        vec3 pp = depth >= 1.0 ? mat3(gbufferModelViewInverse) * vp : (gbufferModelViewInverse * vec4(vp, 1.0)).xyz + cameraPosition - previousCameraPosition;
        vec4 pv = gbufferPreviousProjection * (depth >= 1.0 ? vec4(mat3(gbufferPreviousModelView) * pp, 1.0) : gbufferPreviousModelView * vec4(pp, 1.0));
        prevUV = pv.xy / pv.w * 0.5 + 0.5;
    }
    vec2 px = 1.0 / vec2(viewWidth, viewHeight);
    vec3 c = toYCoCg(squash(cur));
    vec3 mn = c;
    vec3 mx = c;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            if (x == 0 && y == 0) continue;
            vec3 s = toYCoCg(squash(texture2D(colortex0, uv + vec2(float(x), float(y)) * px).rgb));
            mn = min(mn, s);
            mx = max(mx, s);
        }
    }
    vec3 hist = toYCoCg(squash(texture2D(colortex7, prevUV).rgb));
    hist = clamp(hist, mn, mx);
    float blend = TAA_BLEND;
    if (prevUV.x < 0.0 || prevUV.x > 1.0 || prevUV.y < 0.0 || prevUV.y > 1.0) blend = 0.0;
    blend *= mix(1.0, 0.85, sat(length((prevUV - uv) * vec2(viewWidth, viewHeight)) / 6.0));
    vec3 res = max(unsquash(fromYCoCg(mix(c, hist, blend))), vec3(0.0));
#else
    vec3 res = cur;
#endif
    gl_FragData[0] = vec4(res, 1.0);
    gl_FragData[1] = vec4(res, 1.0);
}
