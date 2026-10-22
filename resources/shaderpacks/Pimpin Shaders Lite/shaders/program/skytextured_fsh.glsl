varying vec2 texcoord;
varying vec4 glcolor;
varying vec3 viewPos;

void main() {
#ifdef DIM_OVERWORLD
    // the square vanilla sun is replaced by a round disk drawn with the sky in deferred
    if (dot(normalize(viewPos), normalize(sunPosition)) > 0.5) discard;
#endif
    vec4 c = texture2D(tex, texcoord) * glcolor;
#ifdef DIM_END
    // the flat grey vanilla End sky is replaced by the painted void + nebula in deferred
    discard;
#else
    // only the moon (and custom sky textures in other dimensions) get here
    vec3 col = toLinear(c.rgb) * 1.6 * MOON_BRIGHTNESS * vec3(0.85, 0.92, 1.0);
    gl_FragData[0] = vec4(col * (1.0 - rainStrength), c.a);
#endif
}
