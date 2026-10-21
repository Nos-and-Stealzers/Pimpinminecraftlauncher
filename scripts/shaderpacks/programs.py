# GLSL program bodies. Each body is included from a small per-dimension stub that
# sets #version, DIM_* and PROGRAM_* defines. ULTRA is defined for the Ultra pack.

SHADOW_LITE = r"""// shadow lookup: a rotated Vogel disk of hardware-filtered taps
uniform sampler2DShadow shadowtex0;
#ifdef COLORED_SHADOWS
uniform sampler2DShadow shadowtex1;
uniform sampler2D shadowcolor0;
#endif

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
    float r = 1.6 * SHADOW_SOFTNESS / float(shadowMapResolution);
    float s = 0.0;
    for (int i = 0; i < 6; i++) s += shadow2D(shadowtex0, vec3(c.xy + vogel(i, 6, noise * 6.2831853) * r, c.z)).x;
    s /= 6.0;
#else
    float s = shadow2D(shadowtex0, c).x;
#endif
    vec3 v = vec3(s);
#ifdef COLORED_SHADOWS
    // light that only stained glass / ice blocks gets their colour (one extra tap of each map)
    float s1 = shadow2D(shadowtex1, c).x;
    if (s1 > s + 0.01) {
        vec4 sc = texture2D(shadowcolor0, c.xy);
        v = vec3(s) + (s1 - s) * mix(vec3(1.0), sc.rgb, sc.a);
    }
#endif
    return mix(v, vec3(fallback), fade);
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

// how much light passes through the leaves between this point and the sun (depth behind the first occluder)
float shadowThrough(vec3 clip) {
    if (max(abs(clip.x), abs(clip.y)) > 0.98) return 0.0;
    vec3 c = vec3(distortShadow(clip.xy), clip.z) * 0.5 + 0.5;
    float thick = max(c.z - texture2D(shadowtex1, c.xy).r, 0.0) * 256.0;
    return exp(-thick * 1.1);
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
#if defined ULTRA || defined COLORED_SHADOWS
    if (isId(blockId, ID_WATER)) {
#ifndef ULTRA
        discard;
#endif
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
    JITTER(gl_Position);
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
float ggxSpecular(vec3 n, vec3 V, vec3 L, float rough) {
    vec3 H = normalize(L - V);
    float NdotH = max(dot(n, H), 0.0);
    float NdotL = max(dot(n, L), 0.0);
    float a2 = pow2(rough * rough);
    float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * d * d);
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(H, -V), 0.0), 5.0);
    float k = rough * 0.5;
    float vis = 0.25 / ((NdotL * (1.0 - k) + k) * (max(dot(n, -V), 0.0) * (1.0 - k) + k));
    return D * F * vis * NdotL;
}

// returns the lit colour; indirectOut is the part that ambient occlusion may darken
vec3 shadeSurface(vec3 alb, vec3 n, vec2 lm, vec3 shadowP, float foliage, vec3 vpos, vec3 wpos, float shine, out vec3 directOut, out vec3 indirectOut) {
    vec3 up = normalize(upPosition);
    vec3 L = normalize(shadowLightPosition);
    vec3 V = normalize(vpos);
    float NdotL = dot(n, L);
    float diffuse = foliage > 0.5 ? 0.35 + 0.4 * abs(NdotL) : max(NdotL, 0.0);
    float skyL = lm.y;
    float NdotU = dot(n, up);
    vec3 direct = vec3(0.0);
    vec3 bounce = vec3(0.0);
#ifdef DIM_OVERWORLD
    vec3 sunC = sunLightColor();
    float fallback = pow(skyL, 6.0);
    if (skyL > 0.02 && (diffuse > 0.001 || foliage > 0.5)) {
#if defined SHADOWS && !defined PROGRAM_HAND
        vec3 vis = sampleShadow(shadowP, fallback, dither(gl_FragCoord.xy));
        vis *= smoothstep(0.02, 0.3, skyL);
#else
        vec3 vis = vec3(fallback);
#endif
#if defined ULTRA && defined VOLUMETRIC_CLOUDS && defined CLOUD_SHADOWS
        vis *= cloudShadow(wpos, mat3(gbufferModelViewInverse) * L);
#endif
        // light glowing through leaves and grass when looking towards the sun: a tight forward lobe
        // plus a wide one, tinted by the leaf colour a second time (light passes through the leaf)
        float VoL = max(dot(V, L), 0.0);
        float sss = foliage * (pow(VoL, 8.0) * 2.4 + pow(VoL, 2.0) * 0.5) * SSS_STRENGTH;
        vec3 sssTint = mix(vec3(1.0), sat3(alb * 3.2), 0.65);
        // light still gets through a block or two of leaves even where the leaf itself is in shadow
#if defined ULTRA && defined SHADOWS && !defined PROGRAM_HAND
        vec3 sssVis = max(vis, vec3(foliage > 0.5 ? shadowThrough(shadowP) * smoothstep(0.02, 0.3, skyL) : 0.0));
#else
        vec3 sssVis = max(vis, vec3(foliage * 0.4 * smoothstep(0.55, 1.0, skyL)));
#endif
        direct = sunC * (diffuse * vis + sss * sssTint * sssVis);
        if (shine > 0.0) direct += sunC * vis * ggxSpecular(n, V, L, mix(0.45, 0.18, shine)) * shine;
    }
    vec3 amb = ambientColor() * skyL * skyL * (0.62 + 0.38 * NdotU);
    // sunlight bouncing off the ground onto walls
    bounce = sunC * 0.05 * sat(0.6 - 0.6 * NdotU) * skyL * skyL * dayFactor();
#else
    vec3 amb = ambientColor() * (0.75 + 0.25 * NdotU);
#endif
#ifdef DIM_END
    vec3 Le = normalize(mat3(gbufferModelView) * vec3(0.3, 0.88, 0.36));
    direct = vec3(0.62, 0.36, 1.0) * 0.5 * END_SKY * (foliage > 0.5 ? 0.6 : max(dot(n, Le), 0.0));
#endif
    float bl = lm.x;
    float held = float(max(heldBlockLightValue, heldBlockLightValue2));
    bl = max(bl, clamp((held - length(vpos)) / 15.0, 0.0, 1.0) * 0.95);
    vec3 block = blockLightColor(bl);
    directOut = direct;
    indirectOut = alb * (amb + bounce + block * 0.5 + minimumLight());
    return alb * (amb + bounce + block + direct + minimumLight());
}

vec3 emission(vec3 alb, vec3 srgb, float id) {
    if (isId(id, ID_LAVA)) return alb * 1.5 * EMISSIVE_STRENGTH;
#ifdef GLOWING_ORES
    if (isId(id, ID_ORE)) {
        // only the coloured specks glow, the grey stone around them stays put
        float chroma = max(srgb.r, max(srgb.g, srgb.b)) - min(srgb.r, min(srgb.g, srgb.b));
        return alb * smoothstep(0.18, 0.45, chroma) * 0.9 * EMISSIVE_STRENGTH;
    }
#endif
    if (isId(id, ID_GLOW)) {
        float m = smoothstep(0.55, 0.95, max(srgb.r, max(srgb.g, srgb.b)));
        return alb * m * 1.4 * EMISSIVE_STRENGTH;
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
    float skyVis = smoothstep(0.4, 0.9, lmcoord.y);
    vec3 refl = skyColorAt(R) * skyVis + ambientColor() * 0.03 * (1.0 - skyVis);
    if (water) {
        // how much water lies between this surface and the ground below it
        float d1 = texture2D(depthtex1, gl_FragCoord.xy / vec2(viewWidth, viewHeight)).r;
        float thick = d1 >= 1.0 ? 32.0 : max(length(screenToView(gl_FragCoord.xy / vec2(viewWidth, viewHeight), d1)) - length(viewPos), 0.0);
        if (isEyeInWater == 1) { thick = 0.5; F *= 0.35; }
        float a = 1.0 - exp(-thick * 0.30 * WATER_FOG);
        a = mix(0.16, 0.95, a);
        vec3 deep = vec3(0.014, 0.085, 0.115) * (ambientColor() * lmcoord.y * lmcoord.y * 1.3 + sunLightColor() * 0.10 * lit + blockLightColor(lmcoord.x) * 0.5 + minimumLight());
        deep *= 0.85 + 0.3 * luma(texture2D(tex, texcoord).rgb);
        F = max(F, 0.05);
        float A = a * (1.0 - F) + F;
        color = (deep * a * (1.0 - F) + refl * F + spec) / max(A, 0.001);
        alpha = sat(A + luma(spec));
    } else {
        color = mix(color, refl, F * 0.6) + spec * 0.3;
        alpha = mix(alpha, 1.0, F * 0.5);
    }
    gl_FragData[0] = vec4(color, alpha);
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
    JITTER(gl_Position);
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
#if (defined VOLUMETRIC_CLOUDS || defined CLOUDS_2D) && defined DIM_OVERWORLD
    discard;
#endif
    vec4 c = texture2D(tex, texcoord) * glcolor;
    if (c.a < 0.01) discard;
    vec3 n = normalize(viewNormal);
    vec3 L = normalize(shadowLightPosition);
    vec3 sun = sunLightColor();
    float side = 0.55 + 0.45 * max(dot(n, L), 0.0);
    vec3 V = normalize(viewPos);
    float silver = pow(max(dot(V, L), 0.0), 6.0) * 0.6;
    vec3 col = ambientColor() * 1.1 + sun * (0.32 * side + silver);
    col *= mix(1.0, 0.55, rainStrength);
    // distant clouds melt into the sky
    col = mix(col, skyColorAt(V), sat(length(viewPos) / (far * 3.0)) * 0.6);
    gl_FragData[0] = vec4(col * CLOUD_BRIGHTNESS, c.a * mix(0.85, 0.95, rainStrength));
#elif defined PROGRAM_WEATHER
    vec4 c = texture2D(tex, texcoord) * glcolor;
    if (c.a < 0.01) discard;
    vec3 tint = mix(vec3(luma(toLinear(c.rgb))), toLinear(c.rgb), 0.35);
    vec3 col = tint * (ambientColor() * 2.0 + blockLightColor(lmcoord.x) + 0.04);
    gl_FragData[0] = vec4(col, c.a * 0.42);
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
    JITTER(gl_Position);
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
    float twinkle = 0.75 + 0.25 * sin(frameTimeCounter * 3.0 + gl_FragCoord.x * 0.37 + gl_FragCoord.y * 0.71);
    vec3 c = vec3(0.78, 0.85, 1.0) * glcolor.rgb * glcolor.a * STAR_BRIGHTNESS * 2.2 * twinkle * night * night * (1.0 - rainStrength);
    gl_FragData[0] = vec4(c, 1.0);
}
"""

SKYTEXTURED_VSH = r"""varying vec2 texcoord;
varying vec4 glcolor;
varying vec3 viewPos;

void main() {
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    glcolor = gl_Color;
    viewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;
    gl_Position = ftransform();
    JITTER(gl_Position);
}
"""

SKYTEXTURED_FSH = r"""varying vec2 texcoord;
varying vec4 glcolor;
varying vec3 viewPos;

void main() {
#ifdef DIM_OVERWORLD
    // the square vanilla sun is replaced by a round disk drawn with the sky in deferred
    if (dot(normalize(viewPos), normalize(sunPosition)) > 0.5) discard;
#endif
    vec4 c = texture2D(tex, texcoord) * glcolor;
#ifdef DIM_END
    gl_FragData[0] = vec4(toLinear(c.rgb) * vec3(0.85, 0.7, 1.15) * 0.9 * END_SKY, c.a);
#else
    // only the moon (and custom sky textures in other dimensions) get here
    vec3 col = toLinear(c.rgb) * 1.6 * MOON_BRIGHTNESS * vec3(0.85, 0.92, 1.0);
    gl_FragData[0] = vec4(col * (1.0 - rainStrength), c.a);
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

PREPARE_FSH = r"""// renders the sky-view LUT plus the sun and ambient colours into a corner of colortex5
#define SKY_INTENSITY 9.0
#define SUN_INTENSITY 3.3

vec3 skyRadiance(vec3 d, vec3 sunL) {
    float below = max(-d.y, 0.0);
    if (d.y < 0.0) d = normalize(vec3(d.x, 0.0, d.z));
    vec3 c = vec3(0.0);
    if (sunL.y > -0.3) c += atmScatter(d, sunL) * SKY_INTENSITY;
    if (sunL.y < 0.3) c += atmScatter(d, -sunL) * SKY_INTENSITY * 0.012 * moonTint();
    // faint airglow so a moonless night is not pitch black
    c += vec3(0.0030, 0.0042, 0.0085) * (1.15 - 0.5 * d.y) * (1.0 - dayFactor());
    c *= mix(1.0, 0.3, smoothstep(0.0, 0.5, below));
    float l = luma(c);
    c = mix(vec3(l), c, 1.12);
    vec3 overcast = vec3(l) * vec3(0.92, 0.96, 1.02) * 0.7;
    return mix(c, overcast, rainStrength * 0.85);
}

void main() {
    vec2 px = gl_FragCoord.xy;
    if (px.x > LUT_W || px.y > LUT_H + 1.0) discard;
    float sinE = sunHeight();
    vec3 sunL = vec3(sqrt(max(1.0 - sinE * sinE, 0.0)), sinE, 0.0);
    vec3 col;
    if (px.y < LUT_H) {
        col = skyRadiance(lutDirection((px - 0.5) / (vec2(LUT_W, LUT_H) - 1.0)), sunL);
    } else if (px.x < 1.0) {
        vec3 sunC = sunTransmittance(max(sinE, 0.0)) * SUN_INTENSITY * smoothstep(0.0, 0.06, sinE);
        vec3 moonC = sunTransmittance(max(-sinE, 0.0)) * 0.065 * moonTint() * smoothstep(0.0, 0.06, -sinE);
        col = (sunC * vec3(1.05, 0.98, 0.90) + moonC) * (1.0 - 0.85 * rainStrength);
    } else if (px.x < 3.0 && px.x >= 2.0) {
        // the sun disk colour: reddened by the long path through the air, kept until the sun has set
        col = sunTransmittance(max(sinE, 0.0)) * SUN_INTENSITY * smoothstep(-0.06, 0.0, sinE) * (1.0 - 0.9 * rainStrength);
    } else if (px.x < 2.0) {
        // cosine weighted average of the sky over the upper hemisphere
        col = skyRadiance(vec3(0.0, 1.0, 0.0), sunL);
        col += (skyRadiance(vec3(0.82, 0.57, 0.0), sunL) + 2.0 * skyRadiance(vec3(0.0, 0.57, 0.82), sunL) + skyRadiance(vec3(-0.82, 0.57, 0.0), sunL)) * 0.75;
        col += (skyRadiance(vec3(0.99, 0.14, 0.0), sunL) + 2.0 * skyRadiance(vec3(0.0, 0.14, 0.99), sunL) + skyRadiance(vec3(-0.99, 0.14, 0.0), sunL)) * 0.3;
        col /= 5.2;
        // a little saturation so shade stays blue instead of grey
        col = mix(vec3(luma(col)), col, 1.1) * AMBIENT_STRENGTH;
        col += vec3(0.006, 0.009, 0.018) * MOON_BRIGHTNESS * (1.0 - dayFactor());
    } else {
        discard;
    }
    gl_FragData[0] = vec4(max(col, vec3(0.0)), 1.0);
}
"""

FOG = r"""uniform sampler2D colortex2;
uniform sampler2D colortex3;

float eyeSkyLight() { return float(eyeBrightnessSmooth.y) / 240.0; }

// distance + height fog; its colour is the sky behind the object, so far terrain fades into the horizon
vec3 applyFog(vec3 col, vec3 dir, float dist) {
    float border = smoothstep(far * 0.6, far, dist);
#if defined DIM_NETHER
    float f = 1.0 - exp(-dist * 0.02 * FOG_DENSITY);
#elif defined DIM_END
    float f = 1.0 - exp(-dist * 0.008 * FOG_DENSITY);
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
#ifdef DIM_NETHER
    // the haze glows brighter low down, lit by the lava seas
    fc *= 1.0 + 0.8 * sat(-dot(dir, normalize(upPosition)) * 2.0 + 0.3);
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
    float e = EXPOSURE * 0.9;
#ifdef DIM_OVERWORLD
    float eye = eyeSkyLight();
    e *= mix(1.7, 1.0, eye);
    e *= mix(1.0, mix(1.25, 1.0, dayFactor()), eye);
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
    float scot = 1.0 - smoothstep(0.0, 0.12, l);
#ifdef DIM_OVERWORLD
    // moonlit scenes: the eye's rods take over, colours fade to a cool blue-grey (Purkinje shift)
    // (only dim, mostly neutral pixels: torch-lit and glowing things keep their warm colour)
    float warmth = sat((col.r - col.b) / max(l, 1e-4));
    scot = max(scot, (1.0 - dayFactor()) * eyeSkyLight() * (1.0 - smoothstep(0.02, 0.3, l)) * (1.0 - warmth) * 0.75);
#endif
    col = mix(col, vec3(l) * vec3(0.70, 0.86, 1.25), scot * 0.7 * NIGHT_DESAT);
    col = tonemap(max(col, vec3(0.0)));
    col = grade(col);
    col = pow(sat3(col), vec3(1.0 / 2.2));
    vec2 v = uv - 0.5;
    col *= 1.0 - VIGNETTE * pow(dot(v, v) * 2.0, 1.3);
    col += (dither(gl_FragCoord.xy) - 0.5) / 255.0;
    return col;
}
"""

SKY_PAINT = r"""// the full sky behind the world: atmosphere, sun disk + glare, moon glow, stars, Milky Way, flat clouds
vec3 paintSky(vec3 dir, vec2 uv) {
    vec3 col = skyColorAt(dir) + texture2D(colortex2, uv).rgb;
#ifdef DIM_END
    col += endSkyDetail(dir);
#endif
#ifdef DIM_OVERWORLD
    col += sunMoonGlow(dir) + nightSkyDetail(dir);
#ifdef CLOUDS_2D
    vec4 cl = cloudPlane(dir, CLOUD_PLANE_HEIGHT, 0.0021, 0.42 + CLOUD_AMOUNT * 0.12 + rainStrength * 0.3, 1.0, 0.92);
    col = col * cl.a + cl.rgb;
#endif
#ifdef CIRRUS
    vec4 ci = cloudPlane(dir, 620.0, 0.0011, 0.30 + rainStrength * 0.2, 3.5, 0.55);
    col = col * ci.a + ci.rgb;
#endif
#endif
    return col;
}
"""

DEFERRED_LITE = r"""varying vec2 uv;

// paint the sky behind the opaque world before translucent blocks are drawn
void main() {
    vec3 col = texture2D(colortex0, uv).rgb;
    float depth = texture2D(depthtex0, uv).r;
    if (depth >= 1.0) col = paintSky(normalize(screenToView(uv, 1.0)), uv);
    gl_FragData[0] = vec4(col, 1.0);
}
"""

FINAL_LITE = r"""varying vec2 uv;
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
    vec3 col = texture2D(colortex0, uv).rgb;
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
"""

# ---------------------------------------------------------------- Ultra only
DEFERRED_ULTRA = r"""varying vec2 uv;
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
        col = paintSky(dir, uv);
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
"""

COMPOSITE_ULTRA = r"""varying vec2 uv;
uniform sampler2D colortex6;

vec3 decodeNormal(vec2 e) {
    vec2 fe = e * 4.0 - 2.0;
    float f = dot(fe, fe);
    float g = sqrt(max(1.0 - f / 4.0, 0.0));
    return vec3(fe * g, 1.0 - f / 2.0);
}

vec4 traceReflection(vec3 origin, vec3 R, float jitter) {
    float stepLen = 0.35 + length(origin) * 0.03;
    vec3 stepv = R * stepLen;
    vec3 pos = origin + stepv * (0.3 + jitter);
    for (int i = 0; i < SSR_STEPS; i++) {
        vec3 sc = viewToScreen(pos);
        if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) break;
        float d = texture2D(depthtex1, sc.xy).r;
        if (d < 1.0 && d > 0.56) {
            vec3 sp = screenToView(sc.xy, d);
            float diff = sp.z - pos.z;
            if (diff > 0.0 && diff < length(stepv) * 2.5 + 0.4) {
                for (int j = 0; j < 5; j++) {
                    stepv *= 0.5;
                    sc = viewToScreen(pos);
                    sp = screenToView(sc.xy, texture2D(depthtex1, sc.xy).r);
                    pos += (sp.z - pos.z > 0.0 ? -stepv : stepv);
                }
                sc = viewToScreen(pos);
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
                vec3 absorb = exp(-vec3(0.42, 0.11, 0.07) * thick * WATER_FOG);
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

TAA_ULTRA = r"""varying vec2 uv;
uniform sampler2D colortex7;

// temporal anti-aliasing: reproject last frame, clamp it to this frame's neighbourhood, blend
vec3 toYCoCg(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
vec3 fromYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
vec3 squash(vec3 c) { return c / (1.0 + luma(c)); }
vec3 unsquash(vec3 c) { return c / max(1.0 - luma(c), 0.001); }

void main() {
    vec3 cur = texture2D(colortex0, uv).rgb;
#ifdef TAA
    float depth = texture2D(depthtex0, uv).r;
    vec2 prevUV = uv;
    if (depth > 0.56) {
        vec3 vp = screenToView(uv, depth);
        vec3 pp = depth >= 1.0 ? mat3(gbufferModelViewInverse) * vp : (gbufferModelViewInverse * vec4(vp, 1.0)).xyz + cameraPosition - previousCameraPosition;
        vec4 pv = gbufferPreviousProjection * (depth >= 1.0 ? vec4(mat3(gbufferPreviousModelView) * pp, 1.0) : gbufferPreviousModelView * vec4(pp, 1.0));
        prevUV = pv.xy / pv.w * 0.5 + 0.5;
    }
    vec2 px = 1.0 / vec2(viewWidth, viewHeight);
    vec3 c = toYCoCg(squash(cur));
    vec3 mn = c;
    vec3 mx = c;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            if (x == 0 && y == 0) continue;
            vec3 s = toYCoCg(squash(texture2D(colortex0, uv + vec2(float(x), float(y)) * px).rgb));
            mn = min(mn, s);
            mx = max(mx, s);
        }
    }
    vec3 hist = toYCoCg(squash(texture2D(colortex7, prevUV).rgb));
    hist = clamp(hist, mn, mx);
    float blend = TAA_BLEND;
    if (prevUV.x < 0.0 || prevUV.x > 1.0 || prevUV.y < 0.0 || prevUV.y > 1.0) blend = 0.0;
    blend *= mix(1.0, 0.85, sat(length((prevUV - uv) * vec2(viewWidth, viewHeight)) / 6.0));
    vec3 res = max(unsquash(fromYCoCg(mix(c, hist, blend))), vec3(0.0));
#else
    vec3 res = cur;
#endif
    gl_FragData[0] = vec4(res, 1.0);
    gl_FragData[1] = vec4(res, 1.0);
}
"""

FINAL_ULTRA = r"""varying vec2 uv;
const bool colortex0MipmapEnabled = true;

void main() {
    vec2 px = 1.0 / vec2(viewWidth, viewHeight);
    vec3 col = texture2D(colortex0, uv).rgb;
#ifdef SHARPEN
    // gentle sharpening to win back what TAA softens
    vec3 nb = texture2D(colortex0, uv + vec2(px.x, 0.0)).rgb + texture2D(colortex0, uv - vec2(px.x, 0.0)).rgb
            + texture2D(colortex0, uv + vec2(0.0, px.y)).rgb + texture2D(colortex0, uv - vec2(0.0, px.y)).rgb;
    vec3 sharp = col + (col - nb * 0.25) * 0.35;
    col = clamp(sharp, col * 0.6, col * 1.6);
#endif
#ifdef BLOOM
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
    col += (bright * 0.45 + bloom * 0.03) * BLOOM_STRENGTH;
#endif
    float exposure = exposureValue();
#ifdef AUTO_EXPOSURE
    float avg = luma(texture2D(colortex0, vec2(0.5), 14.0).rgb);
    float autoExp = clamp(0.2 / max(avg * exposure, 0.0001), 0.6, 1.3);
    exposure *= mix(1.0, autoExp, 0.5);
#endif
    gl_FragData[0] = vec4(finishColor(col, uv, exposure), 1.0);
}
"""
