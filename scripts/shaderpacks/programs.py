# GLSL program bodies. Each body is included from a small per-dimension stub that
# sets #version, DIM_* and PROGRAM_* defines. ULTRA is defined for the Ultra pack.

SHADOW_LITE = r"""// shadow lookup: hardware filtered with a few taps
uniform sampler2DShadow shadowtex0;

vec2 distortShadow(vec2 p) {
    return p / (length(p) * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT));
}

vec3 shadowClipPos(vec3 playerPos, vec3 worldNormal) {
    float dist = length(playerPos);
    float texel = 2.0 * shadowDistance / float(shadowMapResolution);
    float grow = SHADOW_DISTORT * min(dist / shadowDistance, 1.0) + (1.0 - SHADOW_DISTORT);
    vec3 p = playerPos + worldNormal * (texel * grow * 1.7 + 0.01);
    return (shadowProjection * (shadowModelView * vec4(p, 1.0))).xyz;
}

vec3 sampleShadow(vec3 clip, float fallback, float noise) {
    vec3 c = vec3(distortShadow(clip.xy), clip.z) * 0.5 + 0.5;
    float fade = smoothstep(0.8, 0.98, max(abs(clip.x), abs(clip.y)));
    if (fade >= 1.0 || c.z >= 1.0) return vec3(fallback);
    c.z -= 0.00012;
#ifdef SOFT_SHADOWS
    float r = SHADOW_SOFTNESS / float(shadowMapResolution);
    float s = shadow2D(shadowtex0, c + vec3(-0.6, 1.4, 0.0) * r).x;
    s += shadow2D(shadowtex0, c + vec3(1.4, 0.6, 0.0) * r).x;
    s += shadow2D(shadowtex0, c + vec3(0.6, -1.4, 0.0) * r).x;
    s += shadow2D(shadowtex0, c + vec3(-1.4, -0.6, 0.0) * r).x;
    s *= 0.25;
#else
    float s = shadow2D(shadowtex0, c).x;
#endif
    return vec3(mix(s, fallback, fade));
}
"""

SHADOW_ULTRA = r"""// shadow lookup: blocker search + Vogel disk PCF, coloured through translucent blocks
uniform sampler2D shadowtex0;
uniform sampler2D shadowtex1;
uniform sampler2D shadowcolor0;

vec2 distortShadow(vec2 p) {
    return p / (length(p) * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT));
}

vec3 shadowClipPos(vec3 playerPos, vec3 worldNormal) {
    float dist = length(playerPos);
    float texel = 2.0 * shadowDistance / float(shadowMapResolution);
    float grow = SHADOW_DISTORT * min(dist / shadowDistance, 1.0) + (1.0 - SHADOW_DISTORT);
    vec3 p = playerPos + worldNormal * (texel * grow * 1.7 + 0.01);
    return (shadowProjection * (shadowModelView * vec4(p, 1.0))).xyz;
}

vec3 shadowTap(vec2 uv, float z) {
    if (z <= texture2D(shadowtex0, uv).r) return vec3(1.0);
#ifdef COLORED_SHADOWS
    if (z > texture2D(shadowtex1, uv).r) return vec3(0.0);
    vec4 sc = texture2D(shadowcolor0, uv);
    return mix(vec3(1.0), sc.rgb, sc.a);
#else
    return vec3(0.0);
#endif
}

vec2 vogel(int i, int n, float phi) {
    float r = sqrt((float(i) + 0.5) / float(n));
    float a = float(i) * 2.39996323 + phi;
    return r * vec2(cos(a), sin(a));
}

vec3 sampleShadow(vec3 clip, float fallback, float noise) {
    vec3 c = vec3(distortShadow(clip.xy), clip.z) * 0.5 + 0.5;
    float fade = smoothstep(0.8, 0.98, max(abs(clip.x), abs(clip.y)));
    if (fade >= 1.0 || c.z >= 1.0) return vec3(fallback);
    float f = length(clip.xy) * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT);
    float uvPerBlock = 0.5 / shadowDistance / f;
    float phi = noise * 6.2831853;
    float radius = 0.06 * SHADOW_SOFTNESS;
#ifdef PCSS
    float blockers = 0.0;
    float sum = 0.0;
    for (int i = 0; i < 8; i++) {
        float d = texture2D(shadowtex1, c.xy + vogel(i, 8, phi) * uvPerBlock * 1.2).r;
        if (d < c.z - 0.0002) { sum += d; blockers += 1.0; }
    }
    if (blockers < 0.5) return vec3(mix(1.0, fallback, fade));
    float gap = (c.z - sum / blockers) * 256.0;
    radius = clamp(gap * 0.03 * SHADOW_SOFTNESS, 0.04, 1.1);
#endif
    float r = radius * uvPerBlock;
    float bias = 0.0001 + radius / 256.0;
    vec3 s = vec3(0.0);
    for (int i = 0; i < SHADOW_SAMPLES; i++) {
        s += shadowTap(c.xy + vogel(i, SHADOW_SAMPLES, phi) * r, c.z - bias);
    }
    s /= float(SHADOW_SAMPLES);
    return mix(s, vec3(fallback), fade);
}
"""

# ---------------------------------------------------------------- shadow pass
SHADOW_VSH = r"""varying vec2 texcoord;
varying vec4 glcolor;
varying float blockId;
attribute vec4 mc_Entity;
attribute vec4 mc_midTexCoord;

void main() {
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    glcolor = gl_Color;
    blockId = mc_Entity.x;
    vec4 vp = gl_ModelViewMatrix * gl_Vertex;
#ifdef WAVING_PLANTS
    vec3 pp = (shadowModelViewInverse * vp).xyz;
    vec2 lm = lightmapCoords((gl_TextureMatrix[1] * gl_MultiTexCoord1).xy);
    pp += waveOffset(pp + cameraPosition, mc_Entity.x, gl_MultiTexCoord0.t < mc_midTexCoord.t, lm.y);
    vp = shadowModelView * vec4(pp, 1.0);
#endif
    gl_Position = gl_ProjectionMatrix * vp;
    gl_Position.xy = distortShadow(gl_Position.xy);
}
"""

SHADOW_FSH = r"""varying vec2 texcoord;
varying vec4 glcolor;
varying float blockId;

void main() {
    vec4 c = texture2D(tex, texcoord) * glcolor;
    if (c.a < 0.1) discard;
#ifdef ULTRA
    if (isId(blockId, ID_WATER)) {
        c = vec4(0.62, 0.86, 1.0, 0.35);
    } else if (c.a < 0.97 || isId(blockId, ID_GLASS) || isId(blockId, ID_ICE)) {
        vec3 tint = toLinear(c.rgb);
        tint /= max(max(tint.r, max(tint.g, tint.b)), 0.02);
        c = vec4(tint, clamp(c.a * 1.3, 0.0, 1.0));
    }
#else
    if (isId(blockId, ID_WATER)) discard;
#endif
    gl_FragData[0] = c;
}
"""

# ---------------------------------------------------------------- lit geometry
LIT_VSH = r"""varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying vec3 viewNormal;
varying vec3 viewPos;
varying vec3 worldPos;
varying vec3 shadowPos;
varying float blockId;
attribute vec4 mc_Entity;
attribute vec4 mc_midTexCoord;

void main() {
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lmcoord = lightmapCoords((gl_TextureMatrix[1] * gl_MultiTexCoord1).xy);
    glcolor = gl_Color;
    viewNormal = normalize(gl_NormalMatrix * gl_Normal);
#if defined PROGRAM_TERRAIN || defined PROGRAM_WATER
    blockId = mc_Entity.x;
#else
    blockId = 0.0;
#endif
    vec4 vp = gl_ModelViewMatrix * gl_Vertex;
    vec3 playerPos = (gbufferModelViewInverse * vp).xyz;
#if defined PROGRAM_TERRAIN && defined WAVING_PLANTS
    playerPos += waveOffset(playerPos + cameraPosition, mc_Entity.x, gl_MultiTexCoord0.t < mc_midTexCoord.t, lmcoord.y);
    vp = gbufferModelView * vec4(playerPos, 1.0);
#endif
    viewPos = vp.xyz;
    worldPos = playerPos + cameraPosition;
    gl_Position = gl_ProjectionMatrix * vp;
#if defined SHADOWS && defined DIM_OVERWORLD && !defined PROGRAM_HAND
    vec3 wn = mat3(gbufferModelViewInverse) * viewNormal;
    if (blockId > 10000.5 && blockId < 10004.5) wn = normalize(mat3(gbufferModelViewInverse) * shadowLightPosition);
    shadowPos = shadowClipPos(playerPos, wn);
#else
    shadowPos = vec3(0.0);
#endif
}
"""

LIGHTING = r"""// shared surface lighting
vec3 shadeSurface(vec3 alb, vec3 n, vec2 lm, vec3 shadowP, float foliage, float vdist, out vec3 directOut) {
    vec3 up = normalize(upPosition);
    vec3 L = normalize(shadowLightPosition);
    float NdotL = dot(n, L);
    float diffuse = foliage > 0.5 ? 0.42 + 0.45 * abs(NdotL) : max(NdotL, 0.0);
    float skyL = lm.y;
    vec3 direct = vec3(0.0);
#ifdef DIM_OVERWORLD
    float fallback = pow(skyL, 6.0);
    if (diffuse > 0.001 && skyL > 0.02) {
#if defined SHADOWS && !defined PROGRAM_HAND
        vec3 vis = sampleShadow(shadowP, fallback, dither(gl_FragCoord.xy));
        vis *= smoothstep(0.02, 0.3, skyL);
#else
        vec3 vis = vec3(fallback);
#endif
        direct = sunLightColor() * diffuse * vis;
    }
    vec3 amb = ambientColor() * skyL * skyL * (0.78 + 0.22 * dot(n, up));
#else
    vec3 amb = ambientColor() * (0.8 + 0.2 * dot(n, up));
#endif
    float bl = lm.x;
    float held = float(max(heldBlockLightValue, heldBlockLightValue2));
    bl = max(bl, clamp((held - vdist) / 15.0, 0.0, 1.0) * 0.95);
    directOut = direct;
    return alb * (amb + blockLightColor(bl) + direct + minimumLight());
}

vec3 emission(vec3 alb, vec3 srgb, float id) {
    if (isId(id, ID_LAVA)) return alb * 1.6 * EMISSIVE_STRENGTH;
    if (isId(id, ID_GLOW)) {
        float m = smoothstep(0.6, 0.95, max(srgb.r, max(srgb.g, srgb.b)));
        return alb * m * 1.1 * EMISSIVE_STRENGTH;
    }
    return vec3(0.0);
}

#ifdef ULTRA
vec2 encodeNormal(vec3 n) {
    float f = sqrt(8.0 * n.z + 8.0001);
    return n.xy / f + 0.5;
}
float packMaterial(float mat, float sky) { return (mat + clamp(sky, 0.0, 1.0) * 0.95) / 8.0; }
#endif
"""

LIT_FSH = r"""varying vec2 texcoord;
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
"""

WATER_FSH = r"""varying vec2 texcoord;
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
    if (water) {
#ifdef WATER_WAVES
        if (dot(n, up) > 0.5) n = normalize(mat3(gbufferModelView) * waterNormalWorld(worldPos.xz));
#endif
        float detail = 0.75 + 0.35 * luma(texture2D(tex, texcoord).rgb);
        albedo.rgb = glcolor.rgb * vec3(0.55, 0.78, 0.9) * detail;
        albedo.a = WATER_ALPHA;
    }
    if (albedo.a < 0.01) discard;
    vec3 alb = toLinear(albedo.rgb);
    vec3 direct;
    vec3 color = shadeSurface(alb, n, lmcoord, shadowPos, 0.0, length(viewPos), direct);
    float alpha = albedo.a;

    if (water) {
        float NdotV = abs(dot(V, n));
        float F = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
        if (isEyeInWater == 1) F *= 0.4;
        vec3 R = reflect(V, n);
        vec3 L = normalize(shadowLightPosition);
        float RdotL = max(dot(R, L), 0.0);
        float lit = luma(direct) / max(luma(sunLightColor()), 0.0001);
        vec3 spec = sunLightColor() * (pow(RdotL, 400.0) * 6.0 + pow(RdotL, 60.0) * 0.12) * clamp(lit * 3.0, 0.0, 1.0);
#ifdef ULTRA
        // the composite pass adds the real reflection; keep the sun glint here
        color += spec;
        alpha = mix(alpha, 1.0, clamp(luma(spec), 0.0, 1.0));
#else
        float skyVis = smoothstep(0.4, 0.9, lmcoord.y);
        vec3 refl = skyColorAt(R) * skyVis + ambientColor() * 0.05 * (1.0 - skyVis);
        color = mix(color, refl, F) + spec;
        alpha = mix(alpha, 1.0, F);
#endif
    }

    gl_FragData[0] = vec4(color, alpha);
#ifdef ULTRA
    gl_FragData[1] = vec4(encodeNormal(n), packMaterial(water ? 2.0 : 3.0, lmcoord.y), 1.0);
#endif
}
"""

# ---------------------------------------------------------------- simple programs
SIMPLE_VSH = r"""varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying vec3 viewNormal;
varying vec3 viewPos;

void main() {
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lmcoord = lightmapCoords((gl_TextureMatrix[1] * gl_MultiTexCoord1).xy);
    glcolor = gl_Color;
    viewNormal = normalize(gl_NormalMatrix * gl_Normal);
    vec4 vp = gl_ModelViewMatrix * gl_Vertex;
    viewPos = vp.xyz;
    gl_Position = gl_ProjectionMatrix * vp;
}
"""

SIMPLE_FSH = r"""varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying vec3 viewNormal;
varying vec3 viewPos;

void main() {
#if defined PROGRAM_BASIC
    vec4 c = glcolor;
    gl_FragData[0] = vec4(toLinear(c.rgb), c.a);
#elif defined PROGRAM_DAMAGED
    gl_FragData[0] = texture2D(tex, texcoord) * glcolor;
#elif defined PROGRAM_EMISSIVE
    vec4 c = texture2D(tex, texcoord) * glcolor;
    if (c.a < 0.01) discard;
    gl_FragData[0] = vec4(toLinear(c.rgb) * 2.2 * EMISSIVE_STRENGTH, c.a);
#elif defined PROGRAM_GLINT
    vec4 c = texture2D(tex, texcoord) * glcolor;
    gl_FragData[0] = vec4(toLinear(c.rgb) * 1.6, c.a);
#elif defined PROGRAM_CLOUDS
    vec4 c = texture2D(tex, texcoord) * glcolor;
    if (c.a < 0.01) discard;
    vec3 n = normalize(viewNormal);
    vec3 L = normalize(shadowLightPosition);
    vec3 sun = sunLightColor();
    float side = 0.55 + 0.45 * max(dot(n, L), 0.0);
    vec3 V = normalize(viewPos);
    float silver = pow(max(dot(V, L), 0.0), 6.0) * 0.6;
    vec3 col = ambientColor() * 1.25 + sun * (0.35 * side + silver);
    col *= mix(1.0, 0.55, rainStrength);
    gl_FragData[0] = vec4(col * CLOUD_BRIGHTNESS, c.a * mix(0.85, 0.95, rainStrength));
#elif defined PROGRAM_WEATHER
    vec4 c = texture2D(tex, texcoord) * glcolor;
    if (c.a < 0.01) discard;
    vec3 col = toLinear(c.rgb) * (ambientColor() * 1.6 + blockLightColor(lmcoord.x) + 0.05);
    gl_FragData[0] = vec4(col, c.a * 0.55);
#else
    // particles and anything else textured
    vec4 c = texture2D(tex, texcoord) * glcolor;
    if (c.a < 0.1) discard;
    vec3 alb = toLinear(c.rgb);
    float skyL = lmcoord.y;
#ifdef DIM_OVERWORLD
    vec3 light = ambientColor() * skyL * skyL + sunLightColor() * 0.55 * pow(skyL, 4.0);
#else
    vec3 light = ambientColor();
#endif
    light += blockLightColor(lmcoord.x) + minimumLight();
    gl_FragData[0] = vec4(alb * light, c.a);
#endif
}
"""

SKYBASIC_VSH = r"""varying vec4 glcolor;

void main() {
    glcolor = gl_Color;
    gl_Position = ftransform();
}
"""

SKYBASIC_FSH = r"""varying vec4 glcolor;

void main() {
#ifdef MC_RENDER_STAGE_STARS
    bool star = renderStage == MC_RENDER_STAGE_STARS;
#else
    bool star = glcolor.r == glcolor.g && glcolor.g == glcolor.b && glcolor.r > 0.0 && glcolor.a > 0.0;
#endif
    if (!star) discard;
    float night = 1.0 - dayFactor();
    vec3 c = vec3(0.75, 0.82, 1.0) * glcolor.rgb * glcolor.a * STAR_BRIGHTNESS * 1.6 * night * (1.0 - rainStrength);
    gl_FragData[0] = vec4(c, 1.0);
}
"""

SKYTEXTURED_VSH = r"""varying vec2 texcoord;
varying vec4 glcolor;

void main() {
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    glcolor = gl_Color;
    gl_Position = ftransform();
}
"""

SKYTEXTURED_FSH = r"""varying vec2 texcoord;
varying vec4 glcolor;

void main() {
    vec4 c = texture2D(tex, texcoord) * glcolor;
#ifdef DIM_END
    gl_FragData[0] = vec4(toLinear(c.rgb) * vec3(0.85, 0.7, 1.15) * 0.9, c.a);
#else
    float boost = 3.0;
#ifdef MC_RENDER_STAGE_MOON
    if (renderStage == MC_RENDER_STAGE_MOON) boost = 1.3 * MOON_BRIGHTNESS;
#endif
    gl_FragData[0] = vec4(toLinear(c.rgb) * boost * (1.0 - rainStrength), c.a);
#endif
}
"""

# ---------------------------------------------------------------- fullscreen passes
FULLSCREEN_VSH = r"""varying vec2 uv;

void main() {
    uv = gl_MultiTexCoord0.xy;
    gl_Position = ftransform();
}
"""

FOG = r"""uniform sampler2D colortex2;
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
"""

FINAL_LITE = r"""varying vec2 uv;

void main() {
    vec3 col = texture2D(colortex0, uv).rgb;
    float depth = texture2D(depthtex0, uv).r;
    vec3 vp = screenToView(uv, depth);
    vec3 dir = normalize(vp);
    float dist = length(vp);
    if (depth >= 1.0) {
        col = skyColorAt(dir) + texture2D(colortex2, uv).rgb;
        dist = far * 4.0;
    } else {
        col = applyFog(col, dir, dist);
    }
    vec4 weather = texture2D(colortex3, uv);
    col = col * (1.0 - weather.a) + weather.rgb;
    col = mediumFog(col, dist);
    gl_FragData[0] = vec4(finishColor(col, uv, exposureValue()), 1.0);
}
"""

COMPOSITE_ULTRA = r"""varying vec2 uv;

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
"""

FINAL_ULTRA = r"""varying vec2 uv;
const bool colortex0MipmapEnabled = true;

void main() {
    vec3 col = texture2D(colortex0, uv).rgb;
#ifdef BLOOM
    vec2 px = 1.0 / vec2(viewWidth, viewHeight);
    vec3 bloom = vec3(0.0);
    float wsum = 0.0;
    for (int i = 2; i < 8; i++) {
        float lod = float(i);
        vec2 o = px * exp2(lod) * 0.5;
        vec3 s = texture2D(colortex0, uv + vec2(o.x, o.y), lod).rgb;
        s += texture2D(colortex0, uv + vec2(-o.x, o.y), lod).rgb;
        s += texture2D(colortex0, uv + vec2(o.x, -o.y), lod).rgb;
        s += texture2D(colortex0, uv + vec2(-o.x, -o.y), lod).rgb;
        float w = 1.0 / (lod - 0.5);
        bloom += s * 0.25 * w;
        wsum += w;
    }
    bloom /= wsum;
    float bl = luma(bloom);
    vec3 bright = bloom * clamp((bl - 0.9) / max(bl, 0.0001), 0.0, 1.0);
    col += (bright * 0.45 + bloom * 0.025) * BLOOM_STRENGTH;
#endif
    float exposure = exposureValue();
#ifdef AUTO_EXPOSURE
    float avg = luma(texture2D(colortex0, vec2(0.5), 14.0).rgb);
    float autoExp = clamp(0.2 / max(avg * exposure, 0.0001), 0.6, 1.6);
    exposure *= mix(1.0, autoExp, 0.5);
#endif
    gl_FragData[0] = vec4(finishColor(col, uv, exposure), 1.0);
}
"""
