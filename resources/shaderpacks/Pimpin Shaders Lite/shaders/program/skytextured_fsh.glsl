varying vec2 texcoord;
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
