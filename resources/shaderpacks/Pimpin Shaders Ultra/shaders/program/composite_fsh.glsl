varying vec2 uv;

vec3 decodeNormal(vec2 e) {
    vec2 fe = e * 4.0 - 2.0;
    float f = dot(fe, fe);
    float g = sqrt(max(1.0 - f / 4.0, 0.0));
    return vec3(fe * g, 1.0 - f / 2.0);
}

vec3 toScreen(vec3 vp) {
    vec4 c = gbufferProjection * vec4(vp, 1.0);
    return c.xyz / c.w * 0.5 + 0.5;
}

vec4 traceReflection(vec3 origin, vec3 R, float jitter) {
    float stepLen = 0.35 + length(origin) * 0.03;
    vec3 stepv = R * stepLen;
    vec3 pos = origin + stepv * (0.3 + jitter);
    for (int i = 0; i < SSR_STEPS; i++) {
        vec3 sc = toScreen(pos);
        if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) break;
        float d = texture2D(depthtex1, sc.xy).r;
        if (d < 1.0) {
            vec3 sp = screenToView(sc.xy, d);
            float diff = sp.z - pos.z;
            if (diff > 0.0 && diff < length(stepv) * 2.5 + 0.4) {
                for (int j = 0; j < 5; j++) {
                    stepv *= 0.5;
                    sc = toScreen(pos);
                    sp = screenToView(sc.xy, texture2D(depthtex1, sc.xy).r);
                    pos += (sp.z - pos.z > 0.0 ? -stepv : stepv);
                }
                sc = toScreen(pos);
                vec2 edge = min(sc.xy, 1.0 - sc.xy);
                float fade = clamp(min(edge.x, edge.y) * 12.0, 0.0, 1.0);
                if (texture2D(depthtex1, sc.xy).r >= 1.0) return vec4(0.0);
                return vec4(texture2D(colortex0, sc.xy).rgb, fade);
            }
        }
        pos += stepv;
        stepv *= 1.28;
    }
    return vec4(0.0);
}

#if defined VOLUMETRIC_LIGHT && defined DIM_OVERWORLD
vec3 volumetricLight(vec3 dir, float dist, float jitter) {
    float maxD = min(dist, min(shadowDistance, VL_DISTANCE));
    vec3 origin = gbufferModelViewInverse[3].xyz;
    vec3 dirP = mat3(gbufferModelViewInverse) * dir;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < VL_STEPS; i++) {
        float t = (float(i) + jitter) / float(VL_STEPS);
        vec3 pp = origin + dirP * (t * t * maxD);
        vec3 sp = (shadowProjection * (shadowModelView * vec4(pp, 1.0))).xyz;
        vec3 c = vec3(distortShadow(sp.xy), sp.z) * 0.5 + 0.5;
        acc += shadowTap(c.xy, c.z - 0.0002);
    }
    acc /= float(VL_STEPS);
    float cosT = dot(dir, normalize(shadowLightPosition));
    float g = 0.62;
    float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
    float phase = hg * 0.55 + 0.45;
    float sigma = (0.0005 + 0.005 * twilightFactor() + 0.003 * rainStrength) * VL_STRENGTH;
    vec3 tint = vec3(1.0);
    if (isEyeInWater == 1) { sigma = 0.03 * VL_STRENGTH; tint = vec3(0.25, 0.75, 0.9); }
    float amount = 1.0 - exp(-maxD * sigma);
    return sunLightColor() * tint * acc * amount * phase * 0.35 * mix(0.25, 1.0, eyeSkyLight());
}
#endif

void main() {
    vec3 col = texture2D(colortex0, uv).rgb;
    float depth0 = texture2D(depthtex0, uv).r;
    float depth1 = texture2D(depthtex1, uv).r;
    vec3 vp = screenToView(uv, depth0);
    vec3 dir = normalize(vp);
    float dist = length(vp);
    float jitter = dither(gl_FragCoord.xy);

    if (depth0 >= 1.0) {
        col = skyColorAt(dir) + texture2D(colortex2, uv).rgb;
        dist = far * 4.0;
    } else {
        vec4 data = texture2D(colortex1, uv);
        float m = data.z * 8.0;
        float mat = floor(m + 0.02);
        float skyL = clamp((m - mat) / 0.95, 0.0, 1.0);
        vec3 n = normalize(decodeNormal(data.xy));

        if (abs(mat - 2.0) < 0.5 && isEyeInWater == 0) {
            float thick = depth1 >= 1.0 ? 48.0 : length(screenToView(uv, depth1) - vp);
            vec3 absorb = exp(-vec3(0.42, 0.11, 0.07) * thick * WATER_FOG);
            vec3 deep = vec3(0.01, 0.06, 0.08) * luma(ambientColor() + sunLightColor() * 0.2) * skyL;
            col = col * absorb + deep * (1.0 - absorb);
        }

        float F = 0.0;
        if (abs(mat - 2.0) < 0.5) {
            F = 0.02 + 0.98 * pow(1.0 - abs(dot(dir, n)), 5.0);
            if (isEyeInWater == 1) F *= 0.4;
        }
#if defined WET_REFLECTIONS && defined DIM_OVERWORLD
        else if (abs(mat - 1.0) < 0.5 && wetness > 0.01) {
            vec3 wp = (gbufferModelViewInverse * vec4(vp, 1.0)).xyz + cameraPosition;
            float puddle = smoothstep(0.4, 0.65, valueNoise(wp.xz * 0.35));
            float flatness = smoothstep(0.85, 0.98, dot(n, normalize(upPosition)));
            float wetMask = wetness * flatness * smoothstep(0.85, 0.95, skyL) * mix(0.15, 1.0, puddle);
            F = (0.12 + 0.88 * pow(1.0 - abs(dot(dir, n)), 5.0)) * wetMask * 0.9;
        }
#endif
        if (F > 0.003) {
            vec3 R = reflect(dir, n);
            vec3 refl = skyColorAt(R) * smoothstep(0.3, 0.85, skyL) + ambientColor() * 0.03;
#ifdef SSR
            vec4 hit = traceReflection(vp, R, jitter);
            refl = mix(refl, hit.rgb, hit.a);
#endif
            col = mix(col, refl, F);
        }
        col = applyFog(col, dir, dist);
    }

#if defined VOLUMETRIC_LIGHT && defined DIM_OVERWORLD
    col += volumetricLight(dir, dist, jitter) * (depth0 >= 1.0 ? 0.6 : 1.0);
#endif
    vec4 weather = texture2D(colortex3, uv);
    col = col * (1.0 - weather.a) + weather.rgb;
    col = mediumFog(col, dist);
    gl_FragData[0] = vec4(col, 1.0);
}
