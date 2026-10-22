// Sky and light colours.
// The overworld sky is a small physically based atmosphere (Rayleigh + Mie + ozone, single
// scattering plus a cheap multiple-scattering term). The prepare pass renders it into a
// sky-view lookup table in the corner of colortex5 (after Hillaire 2020); everything else reads
// that table, so sky, fog, reflections and ambient light always agree with each other.
#define LUT_W 96.0
#define LUT_H 48.0

float sunHeight() { return dot(normalize(sunPosition), normalize(upPosition)); }
float dayFactor() { return smoothstep(-0.10, 0.12, sunHeight()); }
float twilightFactor() { float e = sunHeight(); return exp(-e * e * 30.0); }

#ifdef DIM_OVERWORLD
const vec3 rayleighBeta = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const vec3 ozoneBeta = vec3(0.650e-3, 1.881e-3, 0.085e-3) * 1.5;
#define MIE_SCATTER 2.4e-3
#define MIE_EXTINCT 2.64e-3
#define ATM_GROUND 6360.0
#define ATM_TOP 6420.0

vec3 atmDensity(float h) {
    float haze = 1.0 + rainStrength * 3.0;
    return vec3(exp(-h / 8.0), exp(-h / 1.2) * haze, max(0.0, 1.0 - abs(h - 25.0) / 15.0));
}
vec3 atmExtinction(vec3 d) { return rayleighBeta * d.x + vec3(MIE_EXTINCT * d.y) + ozoneBeta * d.z; }

vec2 raySphere(vec3 o, vec3 d, float r) {
    float b = dot(o, d);
    float h = b * b - dot(o, o) + r * r;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

// transmittance from a point to the top of the atmosphere
vec3 atmTransmittance(vec3 p, vec3 L) {
    vec2 g = raySphere(p, L, ATM_GROUND);
    if (g.x > 0.0) return vec3(0.0);
    float t = raySphere(p, L, ATM_TOP).y;
    vec3 od = vec3(0.0);
    for (int i = 0; i < 6; i++) {
        vec3 q = p + L * (t * (float(i) + 0.5) / 6.0);
        od += atmExtinction(atmDensity(length(q) - ATM_GROUND));
    }
    return exp(-od * t / 6.0);
}

// light scattered towards the eye along a view ray, for a light source of irradiance 1
vec3 atmScatter(vec3 d, vec3 L) {
    vec3 o = vec3(0.0, ATM_GROUND + 0.4, 0.0);
    float t = raySphere(o, d, ATM_TOP).y;
    vec2 gh = raySphere(o, d, ATM_GROUND);
    if (gh.x > 0.0) t = gh.x;
    float mu = dot(d, L);
    float pR = 0.0596831 * (1.0 + mu * mu);
    const float g = 0.78;
    float pM = 0.1193662 * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    vec3 T = vec3(1.0);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 16; i++) {
        float s0 = t * pow2(float(i) / 16.0);
        float s1 = t * pow2(float(i + 1) / 16.0);
        vec3 p = o + d * (0.5 * (s0 + s1));
        vec3 dens = atmDensity(length(p) - ATM_GROUND);
        vec3 ext = atmExtinction(dens);
        vec3 Ts = atmTransmittance(p, L);
        vec3 scat = rayleighBeta * dens.x * (pR + 0.07) + vec3(MIE_SCATTER * dens.y * (pM + 0.05));
        vec3 stepT = exp(-ext * (s1 - s0));
        acc += T * scat * Ts * (1.0 - stepT) / max(ext, vec3(1e-7));
        T *= stepT;
    }
    return acc;
}

vec3 sunTransmittance(float sinE) {
    vec3 L = vec3(sqrt(max(1.0 - sinE * sinE, 0.0)), sinE, 0.0);
    return atmTransmittance(vec3(0.0, ATM_GROUND + 0.4, 0.0), L);
}

vec3 moonTint() { return vec3(0.40, 0.58, 1.0) * MOON_BRIGHTNESS * (0.55 + 0.45 * abs(float(moonPhase) - 4.0) / 4.0); }

// LUT parameterisation: x = angle to the sun around the up axis, y = elevation (squeezed towards the horizon)
vec3 lutDirection(vec2 uv) {
    float phi = uv.x * PI;
    float v = uv.y * 2.0 - 1.0;
    float l = sign(v) * v * v * PI * 0.5;
    return vec3(cos(l) * cos(phi), sin(l), cos(l) * sin(phi));
}

vec2 lutCoord(vec3 d) {
    vec3 up = normalize(upPosition);
    float s = clamp(dot(d, up), -1.0, 1.0);
    float l = asin(s);
    vec3 sv = normalize(sunPosition);
    vec3 sh = sv - up * dot(sv, up);
    vec3 dh = d - up * s;
    float c = dot(dh, sh) * inversesqrt(max(dot(dh, dh) * dot(sh, sh), 1e-12));
    float u = acos(clamp(c, -1.0, 1.0)) / PI;
    float v = 0.5 + 0.5 * sign(l) * sqrt(abs(l) / (PI * 0.5));
    vec2 uv = vec2(u, v) * (vec2(LUT_W, LUT_H) - 1.0) + 0.5;
    return uv / vec2(viewWidth, viewHeight);
}
#endif

// the old hand-tuned gradient, used if the LUT was never written (an old loader without prepare passes)
vec3 analyticSky(vec3 dir) {
    vec3 up = normalize(upPosition);
    vec3 sv = normalize(sunPosition);
    float h = dot(dir, up);
    float d = dayFactor();
    float tw = twilightFactor();
    float toSun = dot(dir, sv) * 0.5 + 0.5;
    vec3 zenith = mix(vec3(0.006, 0.010, 0.026), vec3(0.16, 0.34, 0.82), d);
    vec3 horizon = mix(vec3(0.025, 0.035, 0.065), vec3(0.60, 0.74, 0.95), d);
    horizon = mix(horizon, vec3(1.15, 0.48, 0.18), tw * pow(toSun, 2.5));
    vec3 c = mix(horizon, zenith, pow(max(h, 0.0), 0.45));
    c = mix(c, horizon * 0.35, sat(-h * 2.5));
    return mix(c, vec3(luma(c)) * 0.55, rainStrength * 0.85);
}

vec4 lutTexel(float x) { return texture2D(colortex5, vec2(x + 0.5, LUT_H + 0.5) / vec2(viewWidth, viewHeight)); }

// sky radiance seen in a view-space direction, without the sun, moon and stars
vec3 skyColorAt(vec3 dir) {
#if defined DIM_NETHER
    return toLinear(fogColor) * 0.9;
#elif defined DIM_END
    // dark void overhead, a purple haze band around the horizon, dimmer again below
    float h = dot(dir, normalize(upPosition));
    vec3 c = mix(vec3(0.120, 0.048, 0.185), vec3(0.0045, 0.0025, 0.012), 1.0 - exp(-max(h, 0.0) * 5.0));
    c = mix(c, vec3(0.030, 0.012, 0.055), 1.0 - exp(-max(-h, 0.0) * 5.0));
    return c * END_SKY;
#else
    vec4 s = texture2D(colortex5, lutCoord(dir));
    return s.a > 0.5 ? s.rgb : analyticSky(dir);
#endif
}

// colour of the direct sun or moon light reaching the ground
vec3 sunLightColor() {
#ifdef DIM_OVERWORLD
    vec4 t = lutTexel(0.0);
    if (t.a < 0.5) {
        float e = sunHeight();
        float low = 1.0 - smoothstep(0.02, 0.45, e);
        vec3 c = e > 0.0 ? mix(vec3(1.0, 0.91, 0.78) * 3.1, vec3(1.0, 0.47, 0.17) * 2.3, low * low) : vec3(0.42, 0.56, 0.95) * 0.14 * MOON_BRIGHTNESS;
        return c * smoothstep(0.0, 0.06, abs(e)) * (1.0 - 0.82 * rainStrength);
    }
    return t.rgb;
#else
    return vec3(0.0);
#endif
}

// light from the whole sky onto an upward facing surface
vec3 ambientColor() {
#if defined DIM_NETHER
    return toLinear(fogColor) * 0.55 + vec3(0.10, 0.06, 0.04);
#elif defined DIM_END
    return vec3(0.034, 0.026, 0.078) * END_SKY;
#else
    vec4 t = lutTexel(1.0);
    if (t.a < 0.5) {
        float d = dayFactor();
        vec3 a = mix(vec3(0.05, 0.07, 0.13) * MOON_BRIGHTNESS, vec3(0.40, 0.54, 0.82) * 0.8, d);
        return mix(a, vec3(luma(a)) * 0.75, rainStrength * 0.7);
    }
    return t.rgb;
#endif
}

#ifdef DIM_OVERWORLD
// colour of the sun disk itself (not faded out at the horizon like the ground light)
vec3 sunDiskColor() {
    vec4 t = lutTexel(2.0);
    if (t.a < 0.5) {
        float e = sunHeight();
        float low = 1.0 - smoothstep(0.0, 0.4, e);
        return mix(vec3(1.0, 0.92, 0.80) * 3.2, vec3(1.0, 0.36, 0.08) * 2.2, low * low) * smoothstep(-0.06, 0.0, e) * (1.0 - 0.9 * rainStrength);
    }
    return t.rgb;
}

// light that tints clouds: the sun by day, the moon by night
vec3 cloudLightColor() { return sunHeight() > -0.02 ? sunDiskColor() : sunLightColor(); }

// round sun disk with limb darkening, a tight glare and a wide halo; a soft glow around the moon
vec3 sunMoonGlow(vec3 dir) {
    vec3 col = vec3(0.0);
    float horizon = smoothstep(-0.03, 0.01, dot(dir, normalize(upPosition)));
    float cs = dot(dir, normalize(sunPosition));
    if (cs > 0.0) {
        vec3 sunC = sunDiskColor();
        float tw = twilightFactor();
        float ang = acos(min(cs, 1.0));
        // the low sun looks bigger (and is easier to read through the haze)
        float x = ang / (0.034 * SUN_SIZE * (1.0 + 0.45 * tw));
        float limb = sqrt(max(1.0 - x * x, 0.0));
        float disk = (1.0 - smoothstep(0.85, 1.0, x)) * (0.45 + 0.55 * limb);
        float glare = exp(-ang * 32.0) * (0.9 + 0.8 * tw) + exp(-ang * 6.0) * (0.06 + 0.32 * tw) + exp(-ang * 2.2) * 0.10 * tw;
        // warm glow spreading sideways along the horizon around a low sun
        vec3 up = normalize(upPosition);
        float dh = dot(dir, up);
        vec3 sh = normalize(sunPosition) - up * dot(normalize(sunPosition), up);
        vec3 ph = dir - up * dh;
        float az = dot(ph, sh) * inversesqrt(max(dot(ph, ph) * dot(sh, sh), 1e-8));
        float band = exp(-abs(dh) * 9.0) * pow(max(az, 0.0), 3.0) * tw * 0.22;
        col += sunC * (disk * 40.0 * horizon + glare * mix(horizon, 1.0, 0.5) + band * horizon);
    }
    float cm = dot(dir, normalize(moonPosition));
    if (cm > 0.0) {
        float ang = acos(min(cm, 1.0));
        col += moonTint() * (exp(-ang * 40.0) * 0.05 + exp(-ang * 6.0) * 0.012) * (1.0 - dayFactor()) * horizon;
    }
    return col * (1.0 - rainStrength);
}

// faint dense stars and a Milky Way band behind the vanilla stars
vec3 nightSkyDetail(vec3 dir) {
    float night = (1.0 - dayFactor()) * (1.0 - rainStrength) * STAR_BRIGHTNESS;
    vec3 d = mat3(gbufferModelViewInverse) * dir;
    if (night < 0.01 || d.y < -0.05) return vec3(0.0);
    float fade = smoothstep(-0.05, 0.25, d.y);
    // rotate the sky with the sun so the stars turn through the night
    float a = sunAngle * 6.2831853;
    d.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * d.xy;
    vec2 sc = d.xz / (abs(d.y) + 0.35) * 70.0;
    vec2 cell = floor(sc);
    float h = hash12(cell);
    vec2 f = fract(sc) - 0.5 - (vec2(hash12(cell + 7.1), hash12(cell + 3.7)) - 0.5) * 0.6;
    float star = step(0.975, h) * smoothstep(0.25, 0.0, length(f)) * (0.3 + 1.2 * pow(fract(h * 91.7), 3.0));
    vec3 starC = mix(vec3(1.0, 0.82, 0.62), vec3(0.70, 0.82, 1.0), fract(h * 37.3));
    // Milky Way: a noisy band along a tilted great circle
    vec3 bandN = normalize(vec3(0.35, 0.45, 0.82));
    float b = dot(d, bandN);
    vec2 q = d.xz / (abs(d.y) + 0.35) * 2.2 + d.y * 1.7;
    float n = valueNoise(q * 2.0) * 0.6 + valueNoise(q * 5.0 + 3.1) * 0.4;
    float band = exp(-b * b * 14.0) * (0.35 + 0.9 * n * n);
    float dust = smoothstep(0.55, 0.8, valueNoise(q * 3.5 + 9.0)) * exp(-b * b * 60.0);
    vec3 mw = mix(vec3(0.050, 0.045, 0.070), vec3(0.075, 0.060, 0.050), n) * band * (1.0 - 0.75 * dust);
    return (starC * star * 0.25 * (0.8 + 0.4 * band) + mw * 0.35) * night * fade;
}
#endif


vec3 blockLightColor(float bl) {
    // treat the light level as distance from the source: bright warm pools that fall off quickly,
    // plus a faint fill so lit caves never go fully black
    float d = max(14.5 - bl * 15.0, 0.0);
    float b = 1.8 * exp2(-0.85 * d) + 0.035 * bl * bl;
#ifdef DIM_NETHER
    vec3 warm = vec3(1.0, 0.48, 0.20);
#else
    vec3 warm = vec3(1.0, 0.55, 0.24);
#endif
    return warm * b * BLOCKLIGHT_STRENGTH;
}

vec3 minimumLight() { return vec3(0.010, 0.012, 0.016) * (1.0 + screenBrightness * 2.5) + vec3(0.30) * nightVision; }
