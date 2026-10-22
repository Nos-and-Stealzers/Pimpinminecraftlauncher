varying vec2 uv;
const bool colortex0MipmapEnabled = true;

#if defined GODRAYS && defined DIM_OVERWORLD
// screen-space light shafts: march from the pixel towards the sun on screen and count how much open sky
// lies on the way (cheap stand-in for shadow-map volumetric light)
vec3 godRays(vec3 dir, float noise) {
    vec3 Lv = normalize(shadowLightPosition);
    float VoL = dot(dir, Lv);
    if (VoL < 0.0) return vec3(0.0);
    vec4 sc = gbufferProjection * vec4(Lv, 1.0);
    vec2 spos = sc.xy / sc.w * 0.5 + 0.5;
    vec2 delta = (spos - uv) / float(GODRAY_STEPS) * 0.85;
    vec2 p = uv + delta * noise;
    float acc = 0.0;
    for (int i = 0; i < GODRAY_STEPS; i++) {
        if (p.x > 0.0 && p.x < 1.0 && p.y > 0.0 && p.y < 1.0) acc += step(1.0, texture2D(depthtex0, p).r);
        p += delta;
    }
    acc /= float(GODRAY_STEPS);
    float phase = pow(VoL, 10.0) * 0.8 + pow(VoL, 3.0) * 0.2;
    float amount = (0.25 + 0.75 * twilightFactor() + 0.3 * rainStrength) * GODRAY_STRENGTH;
    return sunLightColor() * acc * phase * amount * 0.22 * eyeSkyLight();
}
#endif

#ifdef SSAO
// cheap depth-only ambient occlusion (after Capt Tatsu / MakeUp), 2 x SSAO_STEPS taps
float linDepth(float d) { return (2.0 * near) / (far + near - (d * 2.0 - 1.0) * (far - near)); }

float depthAO(float depth, float noise) {
    float ld = linDepth(depth);
    vec2 scale = vec2(viewHeight / viewWidth, 1.0) * gbufferProjection[1][1] * 0.5 / (ld * far) * 1.2;
    float ao = 0.0;
    for (int i = 0; i < SSAO_STEPS; i++) {
        float s = float(i) + noise;
        float a = fract(s * 1.618034) * 3.1415926;
        vec2 o = vec2(cos(a), sin(a)) * s / float(SSAO_STEPS) * scale;
        float d1 = (ld - linDepth(texture2D(depthtex0, uv + o).r)) * far;
        float d2 = (ld - linDepth(texture2D(depthtex0, uv - o).r)) * far;
        float angle = sat(0.5 - d1) + sat(0.5 - d2);
        float dist = sat(0.25 * d1 - 1.0) + sat(0.25 * d2 - 1.0);
        ao += sat(angle + dist);
    }
    ao /= float(SSAO_STEPS);
    return mix(1.0, sqrt(ao), SSAO_STRENGTH);
}
#endif

void main() {
#ifdef FXAA
    vec3 col = spatialAA(colortex0, uv, 1.0 / vec2(viewWidth, viewHeight));
#else
    vec3 col = texture2D(colortex0, uv).rgb;
#endif
    float depth = texture2D(depthtex0, uv).r;
    vec3 vp = screenToView(uv, depth);
    vec3 dir = normalize(vp);
    float dist = length(vp);
    if (depth >= 1.0) {
        dist = far * 4.0;
    } else {
#ifdef SSAO
        if (depth > 0.56) col *= depthAO(depth, dither(gl_FragCoord.xy));
#endif
        col = applyFog(col, dir, dist);
    }
#if defined GODRAYS && defined DIM_OVERWORLD
    if (isEyeInWater == 0) col += godRays(dir, dither(gl_FragCoord.xy));
#endif
    vec4 weather = texture2D(colortex3, uv);
    col = col * (1.0 - weather.a) + weather.rgb;
    col = mediumFog(col, dist);
#ifdef BLOOM
    // cheap bloom from four mip levels of the HDR image
    vec3 bloom = texture2D(colortex0, uv, 3.0).rgb * 0.30 + texture2D(colortex0, uv, 4.5).rgb * 0.30
               + texture2D(colortex0, uv, 6.0).rgb * 0.25 + texture2D(colortex0, uv, 7.5).rgb * 0.15;
    float bl = luma(bloom);
    col += (bloom * clamp((bl - 0.8) / max(bl, 0.0001), 0.0, 1.0) * 0.5 + bloom * 0.02) * BLOOM_STRENGTH;
#endif
    gl_FragData[0] = vec4(finishColor(col, uv, exposureValue()), 1.0);
}
