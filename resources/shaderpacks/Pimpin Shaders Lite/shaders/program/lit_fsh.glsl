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

#if defined ULTRA && defined PROGRAM_TERRAIN && defined DIM_OVERWORLD
    float up = dot(n, normalize(upPosition));
    float wet = wetness * smoothstep(0.82, 0.95, lm.y) * (0.45 + 0.55 * clamp(up, 0.0, 1.0));
    alb *= 1.0 - 0.38 * wet * (1.0 - foliage);
#endif

    vec3 direct;
    vec3 color = shadeSurface(alb, n, lm, shadowPos, foliage, length(viewPos), direct);
    color += emission(alb, albedo.rgb, blockId);

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
#endif
}
