// shadow lookup: blocker search + Vogel disk PCF, coloured through translucent blocks
uniform sampler2D shadowtex0;
uniform sampler2D shadowtex1;
uniform sampler2D shadowcolor0;

vec2 distortShadow(vec2 p) {
    return p / (length(p) * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT));
}

vec3 shadowClipPos(vec3 playerPos, vec3 worldNormal) {
    float dist = length(playerPos);
    float texel = 2.0 * shadowDistance / float(shadowMapResolution);
    float grow = SHADOW_DISTORT * min(dist / shadowDistance, 1.0) + (1.0 - SHADOW_DISTORT);
    vec3 p = playerPos + worldNormal * (texel * grow * 1.7 + 0.01);
    return (shadowProjection * (shadowModelView * vec4(p, 1.0))).xyz;
}

vec3 shadowTap(vec2 uv, float z) {
    if (z <= texture2D(shadowtex0, uv).r) return vec3(1.0);
#ifdef COLORED_SHADOWS
    if (z > texture2D(shadowtex1, uv).r) return vec3(0.0);
    vec4 sc = texture2D(shadowcolor0, uv);
    return mix(vec3(1.0), sc.rgb, sc.a);
#else
    return vec3(0.0);
#endif
}

vec3 sampleShadow(vec3 clip, float fallback, float noise) {
    vec3 c = vec3(distortShadow(clip.xy), clip.z) * 0.5 + 0.5;
    float fade = smoothstep(0.8, 0.98, max(abs(clip.x), abs(clip.y)));
    if (fade >= 1.0 || c.z >= 1.0) return vec3(fallback);
    float f = length(clip.xy) * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT);
    float uvPerBlock = 0.5 / shadowDistance / f;
    float phi = noise * 6.2831853;
    float radius = 0.06 * SHADOW_SOFTNESS;
#ifdef PCSS
    float blockers = 0.0;
    float sum = 0.0;
    for (int i = 0; i < 8; i++) {
        float d = texture2D(shadowtex1, c.xy + vogel(i, 8, phi) * uvPerBlock * 1.2).r;
        if (d < c.z - 0.0002) { sum += d; blockers += 1.0; }
    }
    if (blockers < 0.5) return vec3(mix(1.0, fallback, fade));
    float gap = (c.z - sum / blockers) * 256.0;
    radius = clamp(gap * 0.03 * SHADOW_SOFTNESS, 0.04, 1.1);
#endif
    float r = radius * uvPerBlock;
    float bias = 0.0001 + radius / 256.0;
    vec3 s = vec3(0.0);
    for (int i = 0; i < SHADOW_SAMPLES; i++) {
        s += shadowTap(c.xy + vogel(i, SHADOW_SAMPLES, phi) * r, c.z - bias);
    }
    s /= float(SHADOW_SAMPLES);
    return mix(s, vec3(fallback), fade);
}
