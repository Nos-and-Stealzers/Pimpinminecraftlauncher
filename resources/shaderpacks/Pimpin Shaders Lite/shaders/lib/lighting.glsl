// shared surface lighting
vec3 shadeSurface(vec3 alb, vec3 n, vec2 lm, vec3 shadowP, float foliage, float vdist, out vec3 directOut) {
    vec3 up = normalize(upPosition);
    vec3 L = normalize(shadowLightPosition);
    float NdotL = dot(n, L);
    float diffuse = foliage > 0.5 ? 0.42 + 0.45 * abs(NdotL) : max(NdotL, 0.0);
    float skyL = lm.y;
    vec3 direct = vec3(0.0);
#ifdef DIM_OVERWORLD
    float fallback = pow(skyL, 6.0);
    if (diffuse > 0.001 && skyL > 0.02) {
#if defined SHADOWS && !defined PROGRAM_HAND
        vec3 vis = sampleShadow(shadowP, fallback, dither(gl_FragCoord.xy));
        vis *= smoothstep(0.02, 0.3, skyL);
#else
        vec3 vis = vec3(fallback);
#endif
        direct = sunLightColor() * diffuse * vis;
    }
    vec3 amb = ambientColor() * skyL * skyL * (0.78 + 0.22 * dot(n, up));
#else
    vec3 amb = ambientColor() * (0.8 + 0.2 * dot(n, up));
#endif
    float bl = lm.x;
    float held = float(max(heldBlockLightValue, heldBlockLightValue2));
    bl = max(bl, clamp((held - vdist) / 15.0, 0.0, 1.0) * 0.95);
    directOut = direct;
    return alb * (amb + blockLightColor(bl) + direct + minimumLight());
}

vec3 emission(vec3 alb, vec3 srgb, float id) {
    if (isId(id, ID_LAVA)) return alb * 1.6 * EMISSIVE_STRENGTH;
    if (isId(id, ID_GLOW)) {
        float m = smoothstep(0.6, 0.95, max(srgb.r, max(srgb.g, srgb.b)));
        return alb * m * 1.1 * EMISSIVE_STRENGTH;
    }
    return vec3(0.0);
}

#ifdef ULTRA
vec2 encodeNormal(vec3 n) {
    float f = sqrt(8.0 * n.z + 8.0001);
    return n.xy / f + 0.5;
}
float packMaterial(float mat, float sky) { return (mat + clamp(sky, 0.0, 1.0) * 0.95) / 8.0; }
#endif
