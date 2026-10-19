varying vec2 texcoord;
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
