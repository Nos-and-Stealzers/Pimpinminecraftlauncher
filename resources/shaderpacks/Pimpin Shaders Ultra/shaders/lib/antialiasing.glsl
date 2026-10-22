// Low-tap FXAA-style spatial filter, with perceptual luma for HDR edge decisions.
// Filter along the local diagonal edge tangent; reject a broad blend which crosses luma bounds.
#ifdef FXAA
float aaLuma(vec3 c) {
    float l = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0);
    return sqrt(l / (1.0 + l));
}
vec3 spatialAA(sampler2D image, vec2 coord, vec2 px) {
    vec3 center = texture2D(image, coord).rgb;
    float m = aaLuma(center);
    float nw = aaLuma(texture2D(image, coord + vec2(-px.x, px.y)).rgb);
    float ne = aaLuma(texture2D(image, coord + px).rgb);
    float sw = aaLuma(texture2D(image, coord - px).rgb);
    float se = aaLuma(texture2D(image, coord + vec2(px.x, -px.y)).rgb);
    float lo = min(m, min(min(nw, ne), min(sw, se)));
    float hi = max(m, max(max(nw, ne), max(sw, se)));
    if (hi - lo < max(0.045, hi * 0.11)) return center;
    vec2 gradient = vec2(ne + se - nw - sw, nw + ne - sw - se);
    vec2 tangent = vec2(-gradient.y, gradient.x);
    float stabilizer = max((nw + ne + sw + se) * 0.02, 0.006);
    tangent /= min(abs(tangent.x), abs(tangent.y)) + stabilizer;
    tangent = clamp(tangent, vec2(-4.0), vec2(4.0)) * px;
    vec3 narrow = (texture2D(image, coord - tangent * 0.18).rgb + texture2D(image, coord + tangent * 0.18).rgb) * 0.5;
    vec3 wide = narrow * 0.5 + (texture2D(image, coord - tangent * 0.48).rgb + texture2D(image, coord + tangent * 0.48).rgb) * 0.25;
    float wl = aaLuma(wide);
    return wl < lo || wl > hi ? narrow : wide;
}
#endif
