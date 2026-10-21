// Lottes 2016 filmic curve ("Advanced Techniques and Optimization of HDR Color Pipelines")
vec3 lottes(vec3 x) {
    const vec3 a = vec3(1.36);
    const vec3 d = vec3(0.93);
    const vec3 hdrMax = vec3(10.0);
    const vec3 midIn = vec3(0.24);
    const vec3 midOut = vec3(0.26);
    vec3 b = (-pow(midIn, a) + pow(hdrMax, a) * midOut) / ((pow(hdrMax, a * d) - pow(midIn, a * d)) * midOut);
    vec3 c = (pow(hdrMax, a * d) * pow(midIn, a) - pow(hdrMax, a) * pow(midIn, a * d) * midOut) / ((pow(hdrMax, a * d) - pow(midIn, a * d)) * midOut);
    return pow(x, a) / (pow(x, a * d) * b + c);
}

vec3 grade(vec3 c) {
    float l = luma(c);
    // vibrance: push the dull colours more than the already vivid ones
    float s = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    c = mix(vec3(l), c, SATURATION * (1.0 + 0.25 * (1.0 - sat(s * 2.0))));
    // warm highlights, slightly cool shadows
    c *= mix(vec3(0.97, 0.99, 1.04), vec3(1.03, 1.0, 0.96), smoothstep(0.1, 0.7, l));
    return max(c, vec3(0.0));
}
