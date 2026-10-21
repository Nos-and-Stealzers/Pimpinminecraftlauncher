// shadow lookup: a rotated Vogel disk of hardware-filtered taps
uniform sampler2DShadow shadowtex0;
#ifdef COLORED_SHADOWS
uniform sampler2DShadow shadowtex1;
uniform sampler2D shadowcolor0;
#endif

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

vec3 sampleShadow(vec3 clip, float fallback, float noise) {
    vec3 c = vec3(distortShadow(clip.xy), clip.z) * 0.5 + 0.5;
    float fade = smoothstep(0.8, 0.98, max(abs(clip.x), abs(clip.y)));
    if (fade >= 1.0 || c.z >= 1.0) return vec3(fallback);
    c.z -= 0.00012;
#ifdef SOFT_SHADOWS
    float r = 1.6 * SHADOW_SOFTNESS / float(shadowMapResolution);
    float s = 0.0;
    for (int i = 0; i < 6; i++) s += shadow2D(shadowtex0, vec3(c.xy + vogel(i, 6, noise * 6.2831853) * r, c.z)).x;
    s /= 6.0;
#else
    float s = shadow2D(shadowtex0, c).x;
#endif
    vec3 v = vec3(s);
#ifdef COLORED_SHADOWS
    // light that only stained glass / ice blocks gets their colour (one extra tap of each map)
    float s1 = shadow2D(shadowtex1, c).x;
    if (s1 > s + 0.01) {
        vec4 sc = texture2D(shadowcolor0, c.xy);
        v = vec3(s) + (s1 - s) * mix(vec3(1.0), sc.rgb, sc.a);
    }
#endif
    return mix(v, vec3(fallback), fade);
}
