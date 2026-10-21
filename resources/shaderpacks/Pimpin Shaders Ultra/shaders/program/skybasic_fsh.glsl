varying vec4 glcolor;

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
