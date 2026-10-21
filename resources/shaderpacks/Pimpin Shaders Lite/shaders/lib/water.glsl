// procedural water surface: travelling directional waves plus a noise layer
float waterHeight(vec2 p) {
    float t = frameTimeCounter * WATER_SPEED;
    float h = 0.0;
    h += sin(dot(p, vec2(0.80, 0.60)) * 0.9 + t * 1.2) * 0.50;
    h += sin(dot(p, vec2(-0.55, 0.83)) * 1.7 + t * 1.7) * 0.26;
    h += sin(dot(p, vec2(0.96, -0.28)) * 3.1 + t * 2.4) * 0.12;
    h += valueNoise(p * 1.6 + vec2(t * 0.6, t * 0.35)) * 0.35;
#ifdef WATER_DETAIL
    h += valueNoise(p * 3.7 - vec2(t * 0.7, -t * 0.5)) * 0.12;
    h += valueNoise(p * 7.3 + vec2(t * 1.1, t * 0.9)) * 0.05;
#endif
    return h;
}

vec3 waterNormalWorld(vec2 p) {
    float e = 0.06;
    float hx = waterHeight(p + vec2(e, 0.0)) - waterHeight(p - vec2(e, 0.0));
    float hz = waterHeight(p + vec2(0.0, e)) - waterHeight(p - vec2(0.0, e));
    float s = WATER_WAVE_HEIGHT * 0.22 / e;
    return normalize(vec3(-hx * s, 1.0, -hz * s));
}

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
