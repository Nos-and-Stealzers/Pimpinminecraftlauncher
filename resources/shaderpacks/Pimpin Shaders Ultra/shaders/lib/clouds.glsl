// cumulus layer for the Ultra pack: 2D coverage with a vertical profile, raymarched in deferred
float cloudFbm(vec2 p) {
    float n = valueNoise(p) * 0.5;
    n += valueNoise(p * 2.03 + 11.7) * 0.25;
    n += valueNoise(p * 4.01 + 3.1) * 0.125;
    n += valueNoise(p * 8.07 + 7.9) * 0.0625;
    return n / 0.9375;
}

float cloudCoverage(vec2 xz) {
    vec2 p = (xz + vec2(frameTimeCounter * 2.0, frameTimeCounter * 0.7)) * 0.0028;
    float cov = CLOUD_AMOUNT * 0.1 + rainStrength * 0.3;
    return sat((cloudFbm(p) - (0.62 - cov)) * 3.2);
}

float cloudDensity(vec3 wp, bool detail) {
    float h = (wp.y - CLOUD_HEIGHT) / CLOUD_THICKNESS;
    if (h < 0.0 || h > 1.0) return 0.0;
    float cov = cloudCoverage(wp.xz);
    if (cov <= 0.0) return 0.0;
    // rounded tops, flatter bases
    float profile = smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.35, 1.0, h));
    float d = cov * profile - h * 0.25;
    if (detail && d > 0.0) {
        vec2 q = wp.xz * 0.035 + wp.y * 0.05 + frameTimeCounter * 0.04;
        d -= (valueNoise(q) * 0.6 + valueNoise(q * 2.7) * 0.4) * 0.22 * (1.0 - h * 0.5);
    }
    return sat(d * 3.0);
}

// how much sun a point on the ground gets through the cloud layer
float cloudShadow(vec3 wp, vec3 Lworld) {
    if (Lworld.y < 0.05) return 1.0;
    vec3 p = wp + Lworld * ((CLOUD_HEIGHT + CLOUD_THICKNESS * 0.35 - wp.y) / Lworld.y);
    return 1.0 - 0.75 * smoothstep(0.0, 0.6, cloudCoverage(p.xz));
}
