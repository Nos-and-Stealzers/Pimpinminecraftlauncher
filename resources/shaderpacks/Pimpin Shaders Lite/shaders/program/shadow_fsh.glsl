varying vec2 texcoord;
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
