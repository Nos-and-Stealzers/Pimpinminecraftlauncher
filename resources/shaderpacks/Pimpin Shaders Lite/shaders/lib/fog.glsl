uniform sampler2D colortex2;
uniform sampler2D colortex3;

float eyeSkyLight() { return float(eyeBrightnessSmooth.y) / 240.0; }

// distance + height fog; its colour is the sky behind the object, so far terrain fades into the horizon
vec3 applyFog(vec3 col, vec3 dir, float dist) {
    float border = smoothstep(far * 0.6, far, dist);
#if defined DIM_NETHER
    float f = 1.0 - exp(-dist * 0.014 * FOG_DENSITY);
#elif defined DIM_END
    float f = 1.0 - exp(-dist * 0.005 * FOG_DENSITY);
#else
    float dy = dot(dir, normalize(upPosition));
    float base = (0.0010 + 0.009 * rainStrength + 0.0007 * twilightFactor()) * FOG_DENSITY;
    // exponential height fog, integrated along the ray
    float b = 1.0 / 28.0;
    float h0 = (0.0035 + 0.004 * twilightFactor() + 0.012 * rainStrength) * FOG_DENSITY * exp(-b * max(cameraPosition.y - 63.0, 0.0));
    float k = b * dy * dist;
    float heightTerm = abs(k) > 0.001 ? (1.0 - exp(-k)) / k : 1.0;
    float tau = base * dist + h0 * dist * heightTerm;
    float f = 1.0 - exp(-tau);
    f *= mix(0.25, 1.0, eyeSkyLight());
#endif
    f = max(f, border);
    vec3 fc = skyColorAt(dir);
#ifdef DIM_OVERWORLD
    fc *= mix(0.08, 1.0, eyeSkyLight());
#endif
    return mix(col, fc, f);
}

vec3 mediumFog(vec3 col, float dist) {
    if (isEyeInWater == 1) {
#ifdef DIM_OVERWORLD
        vec3 lightAmt = ambientColor() * 0.9 + sunLightColor() * 0.15;
#else
        vec3 lightAmt = ambientColor();
#endif
        vec3 scatter = vec3(0.012, 0.075, 0.095) * luma(lightAmt) * mix(0.2, 1.0, eyeSkyLight()) + vec3(0.001, 0.004, 0.005);
        vec3 absorb = exp(-vec3(0.32, 0.09, 0.07) * dist * WATER_FOG);
        return col * absorb + scatter * (1.0 - absorb);
    }
    if (isEyeInWater == 2) return mix(col, vec3(1.2, 0.32, 0.04), 1.0 - exp(-dist * 1.2));
    if (isEyeInWater == 3) return mix(col, vec3(0.6, 0.7, 0.8), 1.0 - exp(-dist * 1.2));
    return col;
}

float exposureValue() {
    float e = EXPOSURE;
#ifdef DIM_OVERWORLD
    float eye = eyeSkyLight();
    e *= mix(2.2, 1.0, eye);
    e *= mix(1.0, mix(1.9, 1.0, dayFactor()), eye);
#else
    e *= 1.35;
#endif
    return e;
}

vec3 finishColor(vec3 col, vec2 uv, float exposure) {
    col = mix(col, vec3(0.0), max(blindness, darknessFactor * 0.7));
    col *= exposure;
    // dark scenes lose colour and drift blue, like the eye at night
    float l = luma(col);
    float scot = (1.0 - smoothstep(0.0, 0.12, l)) * NIGHT_DESAT;
    col = mix(col, vec3(l) * vec3(0.72, 0.86, 1.2), scot * 0.65);
    col = lottes(max(col, vec3(0.0)));
    col = grade(col);
    col = pow(sat3(col), vec3(1.0 / 2.2));
    vec2 v = uv - 0.5;
    col *= 1.0 - VIGNETTE * pow(dot(v, v) * 2.0, 1.3);
    col += (dither(gl_FragCoord.xy) - 0.5) / 255.0;
    return col;
}
