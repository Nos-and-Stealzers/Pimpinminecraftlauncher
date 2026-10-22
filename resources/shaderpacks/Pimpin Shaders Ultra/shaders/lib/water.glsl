// Directional gravity waves and wind ripples. Analytic slopes avoid four full noise evaluations.
// Return value-noise height and its exact x/z derivatives from the same four corner hashes.
vec3 waterNoiseGradient(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0));
    return vec3(mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
                mix(b - a, d - c, u.y) * du.x, mix(c - a, d - b, u.x) * du.y);
}

// Shared phase/amplitude definitions keep the testable height and derivative in sync.
vec3 waterWaveData(vec2 p) {
    float t = frameTimeCounter * WATER_SPEED;
    vec3 h = vec3(0.0);
    vec2 k = vec2(0.80, 0.60) * 0.9;
    float a = dot(p, k) + t * 1.2;
    h += vec3(sin(a), cos(a) * k) * 0.50;
    k = vec2(-0.55, 0.83) * 1.7;
    a = dot(p, k) + t * 1.7;
    h += vec3(sin(a), cos(a) * k) * 0.26;
    k = vec2(0.96, -0.28) * 3.1;
    a = dot(p, k) + t * 2.4;
    h += vec3(sin(a), cos(a) * k) * 0.12;
    vec3 noise = waterNoiseGradient(p * 1.6 + vec2(t * 0.6, t * 0.35));
    h += noise * vec3(0.35, 0.56, 0.56);
#ifdef WATER_DETAIL
    // Opposing capillary ripples: low amplitudes but visible glints, no repeated full fbm.
    k = vec2(0.45, 0.89) * 5.7;
    a = dot(p, k) - t * 3.0;
    h += vec3(sin(a), cos(a) * k) * 0.025;
    k = vec2(-0.93, 0.36) * 8.1;
    a = dot(p, k) + t * 3.7;
    h += vec3(sin(a), cos(a) * k) * 0.012;
#endif
    return h;
}
float waterHeight(vec2 p) { return waterWaveData(p).x; }
vec2 waterSlope(vec2 p) { return waterWaveData(p).yz; }

vec3 waterNormalWorld(vec2 p) {
    vec2 slope = waterSlope(p);
    // Calm distant water instead of turning sub-pixel ripples into white shimmer.
    float distanceFade = 1.0 / (1.0 + length(p - cameraPosition.xz) * 0.012);
    slope *= WATER_WAVE_HEIGHT * 0.62 * distanceFade;
    return normalize(vec3(-slope.x, 1.0, -slope.y));
}

// Per-channel Beer-Lambert transmission; red disappears fastest in clear water.
vec3 waterTransmission(float thickness, float murk) {
    return exp(-vec3(0.42, 0.11, 0.07) * max(thickness, 0.0) * murk);
}

#ifdef SSR
// Geometric steps cover a useful distance in twelve taps. Only refine a front-to-back
// crossing; revalidate the final depth and fade at screen edges, never reflect the sky as terrain.
vec4 traceWaterReflection(sampler2D scene, vec3 origin, vec3 R, float jitter) {
    float stepSize = 0.28 + length(origin) * 0.015;
    float previousT = 0.0;
    float t = stepSize * (0.75 + jitter * 0.5);
    for (int i = 0; i < SSR_STEPS; i++) {
        vec3 pos = origin + R * t;
        if (pos.z >= -near) break;
        vec3 sc = viewToScreen(pos);
        if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0 || sc.z >= 1.0) break;
        float d = texture2D(depthtex1, sc.xy).r;
        float gap = d >= 1.0 ? -1.0 : screenToView(sc.xy, d).z - pos.z;
        if (d > 0.56 && gap > 0.0 && gap < stepSize * 2.0 + 0.25) {
            float lo = previousT, hi = t;
            for (int j = 0; j < 4; j++) {
                float mid = (lo + hi) * 0.5;
                vec3 mp = origin + R * mid;
                vec3 ms = viewToScreen(mp);
                float md = texture2D(depthtex1, ms.xy).r;
                if (md < 1.0 && screenToView(ms.xy, md).z > mp.z) hi = mid;
                else lo = mid;
            }
            vec3 hitPos = origin + R * hi;
            sc = viewToScreen(hitPos);
            d = texture2D(depthtex1, sc.xy).r;
            float error = abs(screenToView(sc.xy, d).z - hitPos.z);
            float confidence = 1.0 - smoothstep(0.12 + hi * 0.008, 0.5 + hi * 0.02, error);
            vec2 edge = min(sc.xy, 1.0 - sc.xy);
            confidence *= clamp(min(edge.x, edge.y) * 16.0, 0.0, 1.0);
            if (d >= 1.0 || d <= 0.56) return vec4(0.0);
            return vec4(texture2D(scene, sc.xy).rgb, confidence);
        }
        previousT = t;
        t += stepSize;
        stepSize *= 1.5;
    }
    return vec4(0.0);
}
#endif

// light focused by the waves onto whatever is under the water (iterated warp pattern)
float waterCaustics(vec3 wp) {
    float t = frameTimeCounter * WATER_SPEED * 0.5;
    vec2 p = mod(wp.xz * 0.55 + wp.y * 0.08, 6.2831853) - 250.0;
    vec2 i = p;
    float c = 1.0;
    for (int n = 0; n < 4; n++) {
        float tt = t * (1.0 - 3.5 / float(n + 1));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
}
