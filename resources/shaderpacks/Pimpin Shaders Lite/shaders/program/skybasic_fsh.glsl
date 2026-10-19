varying vec4 glcolor;

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
