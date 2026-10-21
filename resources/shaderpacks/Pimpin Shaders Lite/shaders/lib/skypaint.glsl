// the full sky behind the world: atmosphere, sun disk + glare, moon glow, stars, Milky Way, flat clouds
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
