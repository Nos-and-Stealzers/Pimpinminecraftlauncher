// sky, sun and ambient colours. Everything is linear HDR.
float sunHeight() { return dot(normalize(sunPosition), normalize(upPosition)); }
float dayFactor() { return smoothstep(-0.12, 0.18, sunHeight()); }
float twilightFactor() { float e = sunHeight(); return exp(-e * e * 40.0); }

vec3 sunLightColor() {
#ifdef DIM_OVERWORLD
    float e = sunHeight();
    float low = 1.0 - smoothstep(0.02, 0.45, e);
    vec3 sun = mix(vec3(1.0, 0.91, 0.78) * 3.1, vec3(1.0, 0.47, 0.17) * 2.3, low * low);
    vec3 moon = vec3(0.42, 0.56, 0.95) * 0.14 * MOON_BRIGHTNESS;
    vec3 c = e > 0.0 ? sun : moon;
    c *= smoothstep(0.0, 0.06, abs(e));
    return c * (1.0 - 0.82 * rainStrength);
#else
    return vec3(0.0);
#endif
}

vec3 ambientColor() {
#if defined DIM_NETHER
    return toLinear(fogColor) * 0.55 + vec3(0.10, 0.06, 0.04);
#elif defined DIM_END
    return vec3(0.15, 0.12, 0.21);
#else
    float d = dayFactor();
    vec3 a = mix(vec3(0.05, 0.07, 0.13) * MOON_BRIGHTNESS, vec3(0.40, 0.54, 0.82) * 0.8, d);
    a = mix(a, vec3(0.42, 0.33, 0.38) * 0.5, twilightFactor() * 0.45);
    a = mix(a, vec3(luma(a)) * 0.75, rainStrength * 0.7);
    return a;
#endif
}

vec3 skyColorAt(vec3 dir) {
#if defined DIM_NETHER
    return toLinear(fogColor) * 0.9;
#elif defined DIM_END
    return vec3(0.035, 0.025, 0.055);
#else
    vec3 up = normalize(upPosition);
    vec3 sv = normalize(sunPosition);
    float h = dot(dir, up);
    float d = dayFactor();
    float tw = twilightFactor();
    float toSun = dot(dir, sv) * 0.5 + 0.5;

    vec3 zenith = mix(vec3(0.006, 0.010, 0.026), vec3(0.16, 0.34, 0.82), d);
    vec3 horizon = mix(vec3(0.025, 0.035, 0.065), vec3(0.60, 0.74, 0.95), d);
    horizon = mix(horizon, vec3(1.15, 0.48, 0.18), tw * pow(toSun, 2.5));
    zenith = mix(zenith, vec3(0.22, 0.20, 0.38), tw * 0.45);

    float hc = max(h, 0.0);
    vec3 c = mix(horizon, zenith, pow(hc, 0.45));
    c = mix(c, horizon * 0.35, sat(-h * 2.5));

    float cs = max(dot(dir, sv), 0.0);
    vec3 glow = mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 0.45, 0.15), tw);
    c += glow * (pow(cs, 10.0) * 0.30 + pow(cs, 120.0) * 0.9) * SUN_GLOW * (1.0 - rainStrength) * smoothstep(-0.2, 0.05, sunHeight());
    float cm = max(dot(dir, -sv), 0.0);
    c += vec3(0.25, 0.32, 0.5) * pow(cm, 30.0) * 0.08 * (1.0 - d);

    c = mix(c, vec3(luma(c)) * 0.55, rainStrength * 0.85);
    return c;
#endif
}

vec3 blockLightColor(float bl) {
    float b = bl * bl;
    return vec3(1.0, 0.60, 0.30) * (b * b * b * 1.5 + b * 0.09) * BLOCKLIGHT_STRENGTH;
}

vec3 minimumLight() { return vec3(0.012, 0.013, 0.016) * (1.0 + screenBrightness * 2.0) + vec3(0.30) * nightVision; }
