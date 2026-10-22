// the full sky behind the world: atmosphere, sun disk + glare, moon glow, stars, Milky Way, flat clouds
#ifdef DIM_END
// seamless fbm on the view sphere: three planar projections blended by the direction
float sphereFbm(vec3 d, float s) {
    vec3 w = d * d;
    w *= w;
    w /= w.x + w.y + w.z;
    return cloudFbm(d.yz * s) * w.x + cloudFbm(d.zx * s + 17.0) * w.y + cloudFbm(d.xy * s + 31.0) * w.z;
}

// the End sky: a dark void with a purple and teal nebula band, dust lanes and sharp stars
vec3 endSkyDetail(vec3 dir) {
    vec3 d = mat3(gbufferModelViewInverse) * dir;
    // stars from 3D cells on the sphere (no seam anywhere)
    vec3 sp = d * 110.0;
    vec3 cell = floor(sp);
    float h = hash12(cell.xy + cell.z * 37.17);
    vec3 jit = vec3(hash12(cell.xy + 7.1 + cell.z), hash12(cell.yz + 3.7), hash12(cell.zx + 1.3));
    float star = step(0.90, h) * smoothstep(0.30, 0.0, length(fract(sp) - 0.2 - jit * 0.6)) * (0.25 + 2.5 * pow(fract(h * 91.7), 4.0));
    vec3 starC = mix(vec3(1.0, 0.85, 1.0), vec3(0.75, 0.85, 1.0), fract(h * 37.3));
    // nebula: a tilted band of fbm clouds, purple with teal edges and pink cores, cut by dark dust
    vec3 bandN = normalize(vec3(0.35, 0.75, -0.55));
    float b = dot(d, bandN);
    float band = exp(-b * b * 6.0);
    float n1 = sphereFbm(d, 2.2);
    float n2 = sphereFbm(d, 5.5);
    float cloud = smoothstep(0.38, 0.85, n1 * 0.65 + n2 * 0.35 + band * 0.22);
    vec3 nebC = mix(vec3(0.50, 0.14, 0.78), vec3(0.10, 0.42, 0.62), smoothstep(0.35, 0.7, n2));
    nebC = mix(nebC, vec3(1.0, 0.45, 0.85), pow(cloud, 3.0) * 0.45);
    float dust = smoothstep(0.52, 0.72, sphereFbm(d, 4.0) * 0.6 + n2 * 0.4) * band;
    vec3 neb = nebC * cloud * (0.12 + 0.88 * band) * (1.0 - 0.7 * dust) * 0.16;
    float vis = mix(0.45, 1.0, smoothstep(-0.25, 0.1, d.y));
    // a soft violet glow where the End's light comes from
    float glow = exp(-acos(clamp(dot(d, normalize(END_LIGHT_DIR)), -1.0, 1.0)) * 5.0) * 0.05;
    return (starC * star * 0.55 * (1.0 - 0.6 * dust) + neb + vec3(0.55, 0.35, 0.9) * glow) * vis * END_SKY;
}
#endif

#if defined DIM_OVERWORLD && AURORA > 0
// northern lights: curtains of a thin wavy filament pattern, extruded upwards by marching a few height slices
vec3 aurora(vec3 dirView) {
#if AURORA == 1
    float amount = auroraCold;
#else
    float amount = 1.0;
#endif
    amount *= (1.0 - dayFactor()) * (1.0 - rainStrength);
    vec3 d = mat3(gbufferModelViewInverse) * dirView;
    if (amount < 0.01 || d.y < 0.0) return vec3(0.0);
    float noise = dither(gl_FragCoord.xy);
    float T = frameTimeCounter;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < AURORA_STEPS; i++) {
        float h = (float(i) + noise) / float(AURORA_STEPS);
        float t = (1.0 + h * 1.4) / (d.y + 0.06);
        vec2 p = d.xz * t * 0.55;
        p += vec2(0.0, h * 0.06);
        float n = valueNoise(p * 1.1 + vec2(T * 0.012, -T * 0.008)) * 0.75 + valueNoise(p * 2.9 - vec2(T * 0.02, 0.0)) * 0.25;
        float line = pow(1.0 - abs(n - 0.5) * 2.0, 14.0);
        float patchy = smoothstep(0.25, 0.65, valueNoise(p * 0.22 + 4.0));
        vec3 c = mix(vec3(0.10, 1.0, 0.45), vec3(0.55, 0.20, 1.0), pow(h, 1.3));
        acc += c * line * patchy * exp(-h * 2.2);
    }
    float fade = smoothstep(0.0, 0.18, d.y);
    return acc / float(AURORA_STEPS) * 0.65 * amount * fade * AURORA_BRIGHTNESS;
}
#endif

vec3 paintSky(vec3 dir, vec2 uv) {
    vec3 col = skyColorAt(dir) + texture2D(colortex2, uv).rgb;
#ifdef DIM_END
    col += endSkyDetail(dir);
#endif
#ifdef DIM_OVERWORLD
    col += sunMoonGlow(dir) + nightSkyDetail(dir);
#if AURORA > 0
    col += aurora(dir);
#endif
#ifdef CLOUDS_2D
    vec4 cl = cloudPlane(dir, CLOUD_PLANE_HEIGHT, 0.0021, 0.42 + CLOUD_AMOUNT * 0.12 + rainStrength * 0.3, 1.0, 0.92);
    col = col * cl.a + cl.rgb;
#endif
#ifdef CIRRUS
    vec4 ci = cloudPlane(dir, 620.0, 0.0011, 0.30 + rainStrength * 0.2, 3.5, 0.55);
    col = col * ci.a + ci.rgb;
#endif
#endif
    return col;
}
