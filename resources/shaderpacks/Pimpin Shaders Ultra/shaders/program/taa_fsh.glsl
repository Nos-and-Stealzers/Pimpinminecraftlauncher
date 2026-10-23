varying vec2 uv;
uniform sampler2D colortex7;
const bool colortex0MipmapEnabled = true;

// Full-scene metering needs varying UV derivatives. A constant vec2(0.5)
// gives zero derivatives: texture2D's bias then samples the centre pixel,
// not a high mip, and exposure flashes whenever the crosshair crosses a light.
float adaptedExposure() {
    float base = exposureValue();
#ifdef AUTO_EXPOSURE
    float average = luma(texture2D(colortex0, uv, 14.0).rgb);
    float target = base * mix(1.0, clamp(0.2 / max(average * base, 0.0001), 0.6, 1.3), 0.5);
    // History alpha is uniform across the buffer and independent of TAA motion
    // reprojection; scene cuts, resize/reload and invalid history start cleanly.
    float previous = texture2D(colortex7, vec2(0.5)).a;
    if (frameCounter < 2 || !(previous > 0.05 && previous < 8.0)
            || length(cameraPosition - previousCameraPosition) > 64.0) return target;
    float response = 1.0 - exp(-clamp(frameTime, 0.001, 0.25) * 1.5);
    return exp2(mix(log2(previous), log2(max(target, 0.0001)), response));
#else
    return base;
#endif
}

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
    float exposure = adaptedExposure();
    gl_FragData[0] = vec4(res, exposure);
    gl_FragData[1] = vec4(res, exposure);
}
