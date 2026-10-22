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
#ifdef PROGRAM_ENTITIES
    albedo.rgb = mix(albedo.rgb, entityColor.rgb, entityColor.a);
#endif
    if (albedo.a < 0.1) discard;
    vec3 alb = toLinear(albedo.rgb);
    vec3 n = normalize(viewNormal);
    float foliage = (blockId > 10000.5 && blockId < 10004.5) ? 1.0 : 0.0;
    vec2 lm = lmcoord;
#ifdef PROGRAM_HAND
    lm.y = max(lm.y, float(eyeBrightnessSmooth.y) / 240.0);
#endif
    float shine = isId(blockId, ID_SHINY) ? 0.6 : 0.0;

#if defined PROGRAM_TERRAIN && defined DIM_OVERWORLD
    // rain soaks the ground: darker and glossier
    float up = dot(n, normalize(upPosition));
    float wet = wetness * smoothstep(0.82, 0.95, lm.y) * (0.45 + 0.55 * clamp(up, 0.0, 1.0));
    alb *= 1.0 - 0.38 * wet * (1.0 - foliage);
    shine = max(shine, wet * 0.8 * (1.0 - foliage));
#endif

    vec3 direct;
    vec3 indirect;
    vec3 color = shadeSurface(alb, n, lm, shadowPos, foliage, viewPos, worldPos, shine, direct, indirect);
#if defined PROGRAM_TERRAIN && defined DIM_OVERWORLD && !defined ULTRA
    // Lite has no screen-space reflections: wet ground and puddles mirror the sky instead
    if (wet > 0.01 && foliage < 0.5) {
        float puddle = smoothstep(0.45, 0.7, valueNoise(worldPos.xz * 0.35)) * smoothstep(0.9, 0.98, up);
        vec3 V = normalize(viewPos);
        float F = 0.03 + 0.97 * pow(1.0 - max(dot(-V, n), 0.0), 5.0);
        color = mix(color, skyColorAt(reflect(V, n)), F * wet * mix(0.35, 1.0, puddle));
    }
#endif
    vec3 glow = emission(alb, albedo.rgb, blockId);
#ifdef DIM_OVERWORLD
    glow *= 1.0 - 0.55 * dayFactor() * lm.y * lm.y;
#endif
    color += glow;

    gl_FragData[0] = vec4(color, albedo.a);
#ifdef ULTRA
#if defined PROGRAM_HAND
    float mat = 4.0;
#elif defined PROGRAM_ENTITIES
    float mat = 5.0;
#else
    float mat = foliage > 0.5 ? 6.0 : 1.0;
#endif
    gl_FragData[1] = vec4(encodeNormal(n), packMaterial(mat, lm.y), 1.0);
    gl_FragData[2] = vec4(luma(glow) > 0.0 ? vec3(0.0) : indirect, 1.0);
#endif
}
