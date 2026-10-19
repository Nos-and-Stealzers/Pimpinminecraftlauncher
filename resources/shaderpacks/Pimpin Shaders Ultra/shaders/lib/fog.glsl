uniform sampler2D colortex2;
uniform sampler2D colortex3;

float eyeSkyLight() { return float(eyeBrightnessSmooth.y) / 240.0; }

vec3 applyFog(vec3 col, vec3 dir, float dist) {
    float border = smoothstep(far * 0.55, far, dist);
#if defined DIM_NETHER
    float f = 1.0 - exp(-dist * 0.014 * FOG_DENSITY);
#elif defined DIM_END
    float f = 1.0 - exp(-dist * 0.005 * FOG_DENSITY);
#else
    float density = (0.0018 + 0.010 * rainStrength + 0.003 * twilightFactor()) * FOG_DENSITY;
    float f = 1.0 - exp(-dist * density);
    f *= mix(0.35, 1.0, eyeSkyLight());
#endif
    f = max(f, border);
    return mix(col, skyColorAt(dir), f);
}

vec3 mediumFog(vec3 col, float dist) {
    if (isEyeInWater == 1) {
        vec3 tint = vec3(0.10, 0.42, 0.52);
#ifdef DIM_OVERWORLD
        vec3 lightAmt = ambientColor() * 0.9 + sunLightColor() * 0.12;
#else
        vec3 lightAmt = ambientColor();
#endif
        vec3 fogC = tint * luma(lightAmt) * mix(0.25, 1.0, eyeSkyLight()) + vec3(0.002, 0.006, 0.008);
        col *= vec3(0.55, 0.85, 0.95);
        return mix(col, fogC, 1.0 - exp(-dist * 0.075));
    }
    if (isEyeInWater == 2) return mix(col, vec3(1.2, 0.32, 0.04), 1.0 - exp(-dist * 1.2));
    if (isEyeInWater == 3) return mix(col, vec3(0.6, 0.7, 0.8), 1.0 - exp(-dist * 1.2));
    return col;
}

float exposureValue() {
    float e = EXPOSURE;
#ifdef DIM_OVERWORLD
    float eye = eyeSkyLight();
    e *= mix(1.7, 1.0, eye);
    e *= mix(1.0, mix(1.7, 1.0, dayFactor()), eye);
#else
    e *= 1.35;
#endif
    return e;
}

vec3 finishColor(vec3 col, vec2 uv, float exposure) {
    col = mix(col, vec3(0.0), max(blindness, darknessFactor * 0.7));
    col = acesFilm(col * exposure);
    col = grade(col);
    col = pow(col, vec3(1.0 / 2.2));
    vec2 v = uv - 0.5;
    col *= 1.0 - VIGNETTE * pow(dot(v, v) * 2.0, 1.3);
    col += (dither(gl_FragCoord.xy) - 0.5) / 255.0;
    return col;
}
