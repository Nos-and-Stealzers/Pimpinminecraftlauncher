varying vec2 texcoord;
varying vec4 glcolor;

void main() {
    vec4 c = texture2D(tex, texcoord) * glcolor;
#ifdef DIM_END
    gl_FragData[0] = vec4(toLinear(c.rgb) * vec3(0.85, 0.7, 1.15) * 0.9 * END_SKY, c.a);
#else
    vec3 col = toLinear(c.rgb) * 6.0;
#ifdef DIM_OVERWORLD
    // the sun sinks into the atmosphere: reddened near the horizon
    col *= sunTransmittance(max(sunHeight(), 0.01)) * 1.2 + vec3(0.02);
#endif
#ifdef MC_RENDER_STAGE_MOON
    if (renderStage == MC_RENDER_STAGE_MOON) col = toLinear(c.rgb) * 1.4 * MOON_BRIGHTNESS * vec3(0.85, 0.92, 1.0);
#endif
    gl_FragData[0] = vec4(col * (1.0 - rainStrength), c.a);
#endif
}
