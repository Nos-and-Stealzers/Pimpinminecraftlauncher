// shared surface lighting
float ggxSpecular(vec3 n, vec3 V, vec3 L, float rough) {
    vec3 H = normalize(L - V);
    float NdotH = max(dot(n, H), 0.0);
    float NdotL = max(dot(n, L), 0.0);
    float a2 = pow2(rough * rough);
    float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * d * d);
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(H, -V), 0.0), 5.0);
    float k = rough * 0.5;
    float vis = 0.25 / ((NdotL * (1.0 - k) + k) * (max(dot(n, -V), 0.0) * (1.0 - k) + k));
    return D * F * vis * NdotL;
}

// returns the lit colour; indirectOut is the part that ambient occlusion may darken
vec3 shadeSurface(vec3 alb, vec3 n, vec2 lm, vec3 shadowP, float foliage, vec3 vpos, vec3 wpos, float shine, out vec3 directOut, out vec3 indirectOut) {
    vec3 up = normalize(upPosition);
    vec3 L = normalize(shadowLightPosition);
    vec3 V = normalize(vpos);
    float NdotL = dot(n, L);
    float diffuse = foliage > 0.5 ? 0.35 + 0.4 * abs(NdotL) : max(NdotL, 0.0);
    float skyL = lm.y;
    float NdotU = dot(n, up);
    vec3 direct = vec3(0.0);
    vec3 bounce = vec3(0.0);
#ifdef DIM_OVERWORLD
    vec3 sunC = sunLightColor();
    float fallback = pow(skyL, 6.0);
    if (skyL > 0.02 && (diffuse > 0.001 || foliage > 0.5)) {
#if defined SHADOWS && !defined PROGRAM_HAND
        vec3 vis = sampleShadow(shadowP, fallback, dither(gl_FragCoord.xy));
        vis *= smoothstep(0.02, 0.3, skyL);
#else
        vec3 vis = vec3(fallback);
#endif
#if defined ULTRA && defined VOLUMETRIC_CLOUDS && defined CLOUD_SHADOWS
        vis *= cloudShadow(wpos, mat3(gbufferModelViewInverse) * L);
#endif
        // light glowing through leaves and grass when looking towards the sun: a tight forward lobe
        // plus a wide one, tinted by the leaf colour a second time (light passes through the leaf)
        float VoL = max(dot(V, L), 0.0);
        float sss = foliage * (pow(VoL, 8.0) * 2.4 + pow(VoL, 2.0) * 0.5) * SSS_STRENGTH;
        vec3 sssTint = mix(vec3(1.0), sat3(alb * 3.2), 0.65);
        // light still gets through a block or two of leaves even where the leaf itself is in shadow
#if defined ULTRA && defined SHADOWS && !defined PROGRAM_HAND
        vec3 sssVis = max(vis, vec3(foliage > 0.5 ? shadowThrough(shadowP) * smoothstep(0.02, 0.3, skyL) : 0.0));
#else
        vec3 sssVis = max(vis, vec3(foliage * 0.4 * smoothstep(0.55, 1.0, skyL)));
#endif
        direct = sunC * (diffuse * vis + sss * sssTint * sssVis);
        if (shine > 0.0) direct += sunC * vis * ggxSpecular(n, V, L, mix(0.45, 0.18, shine)) * shine;
    }
    vec3 amb = ambientColor() * skyL * skyL * (0.62 + 0.38 * NdotU);
    // sunlight bouncing off the ground onto walls
    bounce = sunC * 0.05 * sat(0.6 - 0.6 * NdotU) * skyL * skyL * dayFactor();
#else
    vec3 amb = ambientColor() * (0.75 + 0.25 * NdotU);
#endif
#ifdef DIM_END
    vec3 Le = normalize(mat3(gbufferModelView) * END_LIGHT_DIR);
    direct = vec3(0.78, 0.58, 1.0) * 0.72 * END_SKY * (foliage > 0.5 ? 0.6 : max(dot(n, Le), 0.0));
#endif
    float bl = lm.x;
    float held = float(max(heldBlockLightValue, heldBlockLightValue2));
    bl = max(bl, clamp((held - length(vpos)) / 15.0, 0.0, 1.0) * 0.95);
    vec3 block = blockLightColor(bl);
    directOut = direct;
    indirectOut = alb * (amb + bounce + block * 0.5 + minimumLight());
    return alb * (amb + bounce + block + direct + minimumLight());
}

vec3 emission(vec3 alb, vec3 srgb, float id) {
    if (isId(id, ID_LAVA)) return alb * 1.5 * EMISSIVE_STRENGTH;
#ifdef GLOWING_ORES
    if (isId(id, ID_ORE)) {
        // only the coloured specks glow, the grey stone around them stays put
        float chroma = max(srgb.r, max(srgb.g, srgb.b)) - min(srgb.r, min(srgb.g, srgb.b));
        return alb * smoothstep(0.18, 0.45, chroma) * 0.9 * EMISSIVE_STRENGTH;
    }
#endif
    if (isId(id, ID_GLOW)) {
        float m = smoothstep(0.55, 0.95, max(srgb.r, max(srgb.g, srgb.b)));
        return alb * m * 1.4 * EMISSIVE_STRENGTH;
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
