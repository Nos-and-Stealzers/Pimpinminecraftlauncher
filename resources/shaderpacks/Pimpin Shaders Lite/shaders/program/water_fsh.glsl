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
    // reflections use a calmer normal than the glint so the sky does not break into white blotches
    vec3 R = reflect(V, normalize(mix(normalize(viewNormal), n, 0.55)));
    R = normalize(R + up * max(0.03 - dot(R, up), 0.0));
    float skyVis = smoothstep(0.4, 0.9, lmcoord.y);
    vec3 refl = skyColorAt(R);
#ifdef DIM_OVERWORLD
    if (water) {
#ifdef WATER_CLOUD_REFLECTIONS
        vec4 cl = cloudPlane(R, CLOUD_PLANE_HEIGHT, 0.0021, 0.42 + CLOUD_AMOUNT * 0.12 + rainStrength * 0.3, 1.0, 0.92);
        refl = refl * cl.a + cl.rgb;
#endif
        // the sun itself, broken up by the full wave normal (shadowed parts of the water get none)
        refl += sunMoonGlow(reflect(V, n)) * lit * 0.6;
    }
#endif
    refl = refl * skyVis + ambientColor() * 0.03 * (1.0 - skyVis);
    if (water) {
        vec2 screenUV = gl_FragCoord.xy / vec2(viewWidth, viewHeight);
        float d1 = texture2D(depthtex1, screenUV).r;
        float thick = d1 >= 1.0 ? 32.0 : max(length(screenToView(screenUV, d1)) - length(viewPos), 0.0);
        vec2 refrUV = screenUV;
        if (WATER_REFRACTION > 0.0 && isEyeInWater == 0) {
            vec3 rd = refract(V, n, 0.75);
            vec2 bent = viewToScreen(viewPos + rd * clamp(thick, 0.25, 2.5)).xy;
            bent = mix(screenUV, bent, WATER_REFRACTION);
            // Avoid pulling a foreground bank, hand or shoreline into the water.
            if (bent.x > 0.0 && bent.x < 1.0 && bent.y > 0.0 && bent.y < 1.0 && texture2D(depthtex1, bent).r > gl_FragCoord.z) refrUV = bent;
        }
        float bd = texture2D(depthtex1, refrUV).r;
        thick = bd >= 1.0 ? 32.0 : max(distance(screenToView(refrUV, bd), viewPos), 0.0);
        if (isEyeInWater == 1) { thick = 0.5; F *= 0.35; }
        vec3 absorb = waterTransmission(thick, WATER_FOG);
        vec3 scatter = vec3(0.014, 0.085, 0.115) * (ambientColor() * lmcoord.y * lmcoord.y * 1.3 + sunLightColor() * 0.10 * lit + blockLightColor(lmcoord.x) * 0.5 + minimumLight());
        vec3 transmitted = texture2D(colortex4, refrUV).rgb * absorb + scatter * (1.0 - absorb);
#ifdef SSR
        vec3 traceR = reflect(V, normalize(mix(normalize(viewNormal), n, 0.75)));
        vec4 hit = traceWaterReflection(colortex4, viewPos + n * 0.05, traceR, 0.5);
        refl = mix(refl, hit.rgb, hit.a);
#endif
        // Replace the translucent surface with the fully composed result. No double blending
        // against colortex0; the background above came from the stable opaque snapshot.
        color = mix(transmitted, refl, F) + spec;
        alpha = 1.0;
    } else {
        color = mix(color, refl, F * 0.6) + spec * 0.3;
        alpha = mix(alpha, 1.0, F * 0.5);
    }
    gl_FragData[0] = vec4(color, alpha);
#endif
}
