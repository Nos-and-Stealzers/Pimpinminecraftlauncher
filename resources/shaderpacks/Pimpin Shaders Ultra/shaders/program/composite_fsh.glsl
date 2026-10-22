varying vec2 uv;
uniform sampler2D colortex6;

vec3 decodeNormal(vec2 e) {
    vec2 fe = e * 4.0 - 2.0;
    float f = dot(fe, fe);
    float g = sqrt(max(1.0 - f / 4.0, 0.0));
    return vec3(fe * g, 1.0 - f / 2.0);
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

vec3 waterScatter(float skyL) {
    vec3 light = ambientColor() * skyL * skyL + minimumLight();
#ifdef DIM_OVERWORLD
    light += sunLightColor() * 0.12 * skyL;
#endif
    return vec3(0.018, 0.12, 0.15) * light;
}

void main() {
    vec3 col = texture2D(colortex0, uv).rgb;
    float depth0 = texture2D(depthtex0, uv).r;
    float depth1 = texture2D(depthtex1, uv).r;
    vec3 vp = screenToView(uv, depth0);
    vec3 dir = normalize(vp);
    float dist = length(vp);
    float jitter = dither(gl_FragCoord.xy);
    vec3 up = normalize(upPosition);

    if (depth0 >= 1.0) {
        dist = far * 4.0;
    } else {
        vec4 data = texture2D(colortex1, uv);
        float m = data.z * 8.0;
        float mat = floor(m + 0.02);
        float skyL = clamp((m - mat) / 0.95, 0.0, 1.0);
        vec3 n = normalize(decodeNormal(data.xy));
        bool water = abs(mat - 2.0) < 0.5 && depth1 > depth0;

        float F = 0.0;
        if (water) {
            vec3 spec = texture2D(colortex6, uv).rgb;
            if (isEyeInWater == 0) {
                // refraction: bend the view ray and look up what is behind the surface there
                float thick0 = depth1 >= 1.0 ? 16.0 : distance(screenToView(uv, depth1), vp);
                vec3 rd = refract(dir, n, 0.75);
                vec2 suv = viewToScreen(vp + rd * clamp(thick0, 0.5, 3.0)).xy;
                suv = mix(uv, suv, WATER_REFRACTION);
                if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0 || texture2D(depthtex1, suv).r <= depth0) suv = uv;
                vec3 bg = texture2D(colortex0, suv).rgb;
                float bd = texture2D(depthtex1, suv).r;
                vec3 bp = screenToView(suv, bd);
                float thick = bd >= 1.0 ? 64.0 : max(distance(bp, vp), 0.0);
#if defined CAUSTICS && defined DIM_OVERWORLD
                if (bd < 1.0) {
                    vec3 bw = (gbufferModelViewInverse * vec4(bp, 1.0)).xyz + cameraPosition;
                    float c = waterCaustics(bw);
                    bg *= 1.0 + c * 2.5 * skyL * skyL * sat(luma(sunLightColor()) * 0.5) * exp(-thick * 0.2);
                }
#endif
                vec3 absorb = waterTransmission(thick, WATER_FOG);
                col = bg * absorb + waterScatter(skyL) * (1.0 - absorb);
            }
            F = 0.02 + 0.98 * pow(1.0 - abs(dot(dir, n)), 5.0);
            if (isEyeInWater == 1) F *= 0.4;
            col += spec;
        }
#if defined WET_REFLECTIONS && defined DIM_OVERWORLD
        else if (abs(mat - 1.0) < 0.5 && wetness > 0.01) {
            vec3 wp = (gbufferModelViewInverse * vec4(vp, 1.0)).xyz + cameraPosition;
            float puddle = smoothstep(0.4, 0.65, valueNoise(wp.xz * 0.35));
            float flatness = smoothstep(0.85, 0.98, dot(n, up));
            float wetMask = wetness * flatness * smoothstep(0.85, 0.95, skyL) * mix(0.15, 1.0, puddle);
            F = (0.12 + 0.88 * pow(1.0 - abs(dot(dir, n)), 5.0)) * wetMask * 0.9;
        }
#endif
#if defined CAUSTICS && defined DIM_OVERWORLD
        if (isEyeInWater == 1 && depth0 > 0.56) {
            vec3 wp = (gbufferModelViewInverse * vec4(vp, 1.0)).xyz + cameraPosition;
            col *= 1.0 + waterCaustics(wp) * 2.0 * skyL * skyL * sat(luma(sunLightColor()) * 0.5);
        }
#endif
        if (F > 0.003) {
            vec3 R = reflect(dir, n);
            vec3 refl = skyColorAt(R) * smoothstep(0.3, 0.85, skyL) + ambientColor() * 0.03;
#ifdef SSR
            vec4 hit = traceWaterReflection(colortex0, vp + n * 0.05, R, jitter);
            refl = mix(refl, hit.rgb, hit.a);
#endif
            col = mix(col, refl, F);
        }
        col = applyFog(col, dir, dist);
    }

#if defined VOLUMETRIC_LIGHT && defined DIM_OVERWORLD
    col += volumetricLight(dir, dist, jitter) * (depth0 >= 1.0 ? 0.6 - 0.3 * twilightFactor() : 1.0);
#endif
    vec4 weather = texture2D(colortex3, uv);
    col = col * (1.0 - weather.a) + weather.rgb;
    col = mediumFog(col, dist);
    gl_FragData[0] = vec4(col, 1.0);
}
