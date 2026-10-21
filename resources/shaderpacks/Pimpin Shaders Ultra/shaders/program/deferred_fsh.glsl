varying vec2 uv;
uniform sampler2D colortex4;

vec3 decodeNormal(vec2 e) {
    vec2 fe = e * 4.0 - 2.0;
    float f = dot(fe, fe);
    float g = sqrt(max(1.0 - f / 4.0, 0.0));
    return vec3(fe * g, 1.0 - f / 2.0);
}

#ifdef SSAO
// normal-oriented hemisphere AO in view space; noise changes every frame and TAA averages it
float ssao(vec3 vp, vec3 n, float noise) {
    vec3 t = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(n, t);
    float occ = 0.0;
    float radius = SSAO_RADIUS;
    for (int i = 0; i < SSAO_SAMPLES; i++) {
        vec2 v = vogel(i, SSAO_SAMPLES, noise * 6.2831853);
        float z = sqrt(max(1.0 - dot(v, v), 0.0));
        float len = mix(0.15, 1.0, pow2(fract(noise + float(i) * 0.618034)));
        vec3 s = vp + (t * v.x + b * v.y + n * z) * radius * len;
        vec3 sc = viewToScreen(s);
        if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0) continue;
        float sd = texture2D(depthtex0, sc.xy).r;
        vec3 sp = screenToView(sc.xy, sd);
        float diff = sp.z - s.z;
        occ += step(0.03, diff) * (1.0 - smoothstep(0.0, radius * 1.5, diff));
    }
    return 1.0 - occ / float(SSAO_SAMPLES) * SSAO_STRENGTH;
}
#endif

#if defined VOLUMETRIC_CLOUDS && defined DIM_OVERWORLD
float hgPhase(float mu, float g) { float g2 = g * g; return 0.0795775 * (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * mu, 1.5); }

// march the cloud slab; returns scattered light (rgb) and transmittance (a)
vec4 renderClouds(vec3 dirView, float maxDist, float noise) {
    vec3 d = mat3(gbufferModelViewInverse) * dirView;
    if (abs(d.y) < 0.0005) return vec4(0.0, 0.0, 0.0, 1.0);
    float y = cameraPosition.y;
    float ta = (CLOUD_HEIGHT - y) / d.y;
    float tb = (CLOUD_HEIGHT + CLOUD_THICKNESS - y) / d.y;
    float t0 = max(min(ta, tb), 0.0);
    float t1 = min(max(ta, tb), maxDist);
    t1 = min(t1, t0 + CLOUD_THICKNESS * 8.0);
    if (t1 <= t0 || t0 > 4000.0) return vec4(0.0, 0.0, 0.0, 1.0);
    vec3 Lw = normalize(mat3(gbufferModelViewInverse) * shadowLightPosition);
    float mu = dot(d, Lw);
    float phase = mix(hgPhase(mu, 0.65), hgPhase(mu, -0.2), 0.35) * 4.0 * PI;
    float sinE = sunHeight();
    vec3 sunC = sinE > 0.0 ? sunTransmittance(sinE + 0.04) * 4.5 * smoothstep(0.0, 0.05, sinE) * (1.0 - 0.85 * rainStrength) : sunLightColor() * 1.6;
    vec3 ambC = ambientColor() * 0.9 + sunC * 0.04;
    float dt = (t1 - t0) / float(CLOUD_STEPS);
    float T = 1.0;
    vec3 scat = vec3(0.0);
    for (int i = 0; i < CLOUD_STEPS; i++) {
        vec3 p = cameraPosition + d * (t0 + dt * (float(i) + noise));
        float dens = cloudDensity(p, true);
        if (dens < 0.003) continue;
        float od = 0.0;
        for (int j = 0; j < 3; j++) od += cloudDensity(p + Lw * (float(j) + 0.5) * CLOUD_THICKNESS * 0.16, false);
        od *= CLOUD_THICKNESS * 0.16 * 0.09;
        float h = sat((p.y - CLOUD_HEIGHT) / CLOUD_THICKNESS);
        float sigma = dens * 0.09;
        float powder = 1.0 - exp(-dens * 6.0);
        vec3 S = sunC * exp(-od) * phase * mix(0.6, 1.0, powder) + ambC * (0.35 + 0.65 * h);
        float stepT = exp(-sigma * dt);
        scat += T * S * (1.0 - stepT);
        T *= stepT;
        if (T < 0.02) break;
    }
    // far clouds fade into the sky
    float fade = exp(-t0 * 0.00045) * smoothstep(0.0, 0.06, d.y + 0.02);
    vec3 skyBehind = skyColorAt(dirView);
    scat = mix(skyBehind * (1.0 - T), scat, fade);
    return vec4(scat * CLOUD_BRIGHTNESS, T);
}
#endif

void main() {
    vec3 col = texture2D(colortex0, uv).rgb;
    float depth = texture2D(depthtex0, uv).r;
    vec3 vp = screenToView(uv, depth);
    vec3 dir = normalize(vp);
    float noise = dither(gl_FragCoord.xy);
    if (depth >= 1.0) {
        col = skyColorAt(dir) + texture2D(colortex2, uv).rgb;
#ifdef DIM_END
        col += endSkyDetail(dir);
#endif
    }
#ifdef SSAO
    else if (depth > 0.56) {
        vec4 data = texture2D(colortex1, uv);
        vec3 n = normalize(decodeNormal(data.xy));
        vec3 ind = texture2D(colortex4, uv).rgb;
        float ao = ssao(vp, n, noise);
        col -= ind * (1.0 - ao);
    }
#endif
#if defined VOLUMETRIC_CLOUDS && defined DIM_OVERWORLD
    if (depth >= 1.0 || length(vp) > 120.0) {
        vec4 cl = renderClouds(dir, depth >= 1.0 ? 1e6 : length(vp), noise);
        col = col * cl.a + cl.rgb;
    }
#endif
    gl_FragData[0] = vec4(max(col, vec3(0.0)), 1.0);
}
