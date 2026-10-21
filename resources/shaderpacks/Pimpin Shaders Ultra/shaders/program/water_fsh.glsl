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
    vec3 L = normalize(shadowLightPosition);
    if (water) {
#ifdef WATER_WAVES
        if (dot(n, up) > 0.5) n = normalize(mat3(gbufferModelView) * waterNormalWorld(worldPos.xz));
#endif
        albedo.rgb = glcolor.rgb * vec3(0.55, 0.78, 0.9) * (0.75 + 0.35 * luma(texture2D(tex, texcoord).rgb));
        albedo.a = 1.0;
    }
    if (albedo.a < 0.01) discard;
    vec3 alb = toLinear(albedo.rgb);
    vec3 direct;
    vec3 indirect;
    vec3 color = shadeSurface(alb, n, lmcoord, shadowPos, 0.0, viewPos, worldPos, 0.0, direct, indirect);
    float alpha = albedo.a;
    float lit = 0.0;
#ifdef DIM_OVERWORLD
    lit = sat(luma(direct) / max(luma(sunLightColor()), 0.0001) * 3.0);
#endif
    float NdotV = abs(dot(V, n));
    float F = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
    vec3 spec = vec3(0.0);
#ifdef DIM_OVERWORLD
    spec = sunLightColor() * ggxSpecular(n, V, L, 0.06) * lit * 0.6;
#endif

#ifdef ULTRA
    if (water) {
        // refraction, absorption and reflections are done in composite; keep the sun glint here
        gl_FragData[0] = vec4(0.0);
        gl_FragData[1] = vec4(encodeNormal(n), packMaterial(2.0, lmcoord.y), 1.0);
        gl_FragData[2] = vec4(spec, 1.0);
        return;
    }
    // glass and ice: a faint sky reflection, the background keeps its material data
    vec3 R = reflect(V, n);
    vec3 refl = skyColorAt(R) * smoothstep(0.4, 0.9, lmcoord.y);
    color = mix(color, refl, F * 0.6) + spec * 0.3;
    alpha = mix(alpha, 1.0, F * 0.5);
    gl_FragData[0] = vec4(color, alpha);
    gl_FragData[1] = vec4(0.0);
    gl_FragData[2] = vec4(0.0);
#else
    vec3 R = reflect(V, n);
    float skyVis = smoothstep(0.4, 0.9, lmcoord.y);
    vec3 refl = skyColorAt(R) * skyVis + ambientColor() * 0.03 * (1.0 - skyVis);
    if (water) {
        // how much water lies between this surface and the ground below it
        float d1 = texture2D(depthtex1, gl_FragCoord.xy / vec2(viewWidth, viewHeight)).r;
        float thick = d1 >= 1.0 ? 32.0 : max(length(screenToView(gl_FragCoord.xy / vec2(viewWidth, viewHeight), d1)) - length(viewPos), 0.0);
        if (isEyeInWater == 1) { thick = 0.5; F *= 0.35; }
        float a = 1.0 - exp(-thick * 0.32 * WATER_FOG);
        a = mix(0.10, 0.97, a);
        vec3 deep = vec3(0.020, 0.13, 0.16) * (ambientColor() * lmcoord.y * lmcoord.y + sunLightColor() * 0.12 + blockLightColor(lmcoord.x) * 0.5 + minimumLight());
        deep = mix(deep, color * 0.6, 0.25);
        float A = a * (1.0 - F) + F;
        color = (deep * a * (1.0 - F) + refl * F + spec) / max(A, 0.001);
        alpha = sat(A + luma(spec));
    } else {
        color = mix(color, refl, F * 0.6) + spec * 0.3;
        alpha = mix(alpha, 1.0, F * 0.5);
    }
    gl_FragData[0] = vec4(color, alpha);
#endif
}
