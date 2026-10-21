// gentle wind for foliage, offsets in world space
vec3 waveOffset(vec3 wp, float id, bool top, float sky) {
    float t = frameTimeCounter;
    float gust = 0.6 + 0.4 * sin(t * 0.37 + wp.x * 0.05 + wp.z * 0.03) * sin(t * 0.21 + wp.z * 0.02);
    float wind = WAVE_STRENGTH * (0.65 + 0.9 * rainStrength) * gust;
    wind *= smoothstep(0.15, 0.6, sky);
    if (isId(id, ID_LEAVES)) {
        return vec3(sin(t * 1.7 + wp.x * 1.3 + wp.z * 0.7 + wp.y),
                    sin(t * 1.3 + wp.y * 1.9 + wp.x) * 0.5,
                    cos(t * 1.5 + wp.z * 1.1 + wp.x * 0.4)) * 0.035 * wind;
    }
    float amp = 0.0;
    if (isId(id, ID_PLANT) && top) amp = 0.09;
    else if (isId(id, ID_TALL_UPPER)) amp = top ? 0.16 : 0.08;
    else if (isId(id, ID_TALL_LOWER) && top) amp = 0.08;
    if (amp == 0.0) return vec3(0.0);
    vec2 sway = vec2(sin(t * 2.1 + wp.x * 0.9 + wp.z * 0.4), cos(t * 1.8 + wp.z * 1.1 + wp.x * 0.3) * 0.6);
    return vec3(sway.x, 0.0, sway.y) * amp * wind;
}
