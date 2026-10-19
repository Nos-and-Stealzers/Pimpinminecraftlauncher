// procedural water surface: a few travelling sine waves plus a noise layer
float waterHeight(vec2 p) {
    float t = frameTimeCounter * WATER_SPEED;
    float h = 0.0;
    h += sin(dot(p, vec2(0.80, 0.60)) * 0.9 + t * 1.2) * 0.50;
    h += sin(dot(p, vec2(-0.55, 0.83)) * 1.7 + t * 1.7) * 0.26;
    h += sin(dot(p, vec2(0.96, -0.28)) * 3.1 + t * 2.4) * 0.12;
    h += valueNoise(p * 1.6 + vec2(t * 0.6, t * 0.35)) * 0.35;
#ifdef WATER_DETAIL
    h += valueNoise(p * 3.1 - vec2(t * 0.7, -t * 0.5)) * 0.10;
    h += sin(dot(p, vec2(0.3, 0.95)) * 4.4 + t * 2.6) * 0.04;
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
