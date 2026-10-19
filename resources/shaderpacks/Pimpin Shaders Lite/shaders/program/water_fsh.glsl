varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying vec3 viewNormal;
varying vec3 viewPos;
varying vec3 worldPos;
varying vec3 shadowPos;
varying float blockId;

void main() {
    vec4 albedo = texture2D(tex, texcoord) * glcolor;
    bool water = isId(blockId, ID_WATER);
    vec3 n = normalize(viewNormal);
    vec3 V = normalize(viewPos);
    vec3 up = normalize(upPosition);
    if (water) {
#ifdef WATER_WAVES
        if (dot(n, up) > 0.5) n = normalize(mat3(gbufferModelView) * waterNormalWorld(worldPos.xz));
#endif
        float detail = 0.75 + 0.35 * luma(texture2D(tex, texcoord).rgb);
        albedo.rgb = glcolor.rgb * vec3(0.55, 0.78, 0.9) * detail;
        albedo.a = WATER_ALPHA;
    }
    if (albedo.a < 0.01) discard;
    vec3 alb = toLinear(albedo.rgb);
    vec3 direct;
    vec3 color = shadeSurface(alb, n, lmcoord, shadowPos, 0.0, length(viewPos), direct);
    float alpha = albedo.a;

    if (water) {
        float NdotV = abs(dot(V, n));
        float F = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
        if (isEyeInWater == 1) F *= 0.4;
        vec3 R = reflect(V, n);
        vec3 L = normalize(shadowLightPosition);
        float RdotL = max(dot(R, L), 0.0);
        float lit = luma(direct) / max(luma(sunLightColor()), 0.0001);
        vec3 spec = sunLightColor() * (pow(RdotL, 400.0) * 6.0 + pow(RdotL, 60.0) * 0.12) * clamp(lit * 3.0, 0.0, 1.0);
#ifdef ULTRA
        // the composite pass adds the real reflection; keep the sun glint here
        color += spec;
        alpha = mix(alpha, 1.0, clamp(luma(spec), 0.0, 1.0));
#else
        float skyVis = smoothstep(0.4, 0.9, lmcoord.y);
        vec3 refl = skyColorAt(R) * skyVis + ambientColor() * 0.05 * (1.0 - skyVis);
        color = mix(color, refl, F) + spec;
        alpha = mix(alpha, 1.0, F);
#endif
    }

    gl_FragData[0] = vec4(color, alpha);
#ifdef ULTRA
    gl_FragData[1] = vec4(encodeNormal(n), packMaterial(water ? 2.0 : 3.0, lmcoord.y), 1.0);
#endif
}
