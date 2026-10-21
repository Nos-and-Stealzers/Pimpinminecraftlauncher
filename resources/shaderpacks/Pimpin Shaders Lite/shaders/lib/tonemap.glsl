// ACES filmic curve: Stephen Hill's fit of the RRT + ODT (sRGB -> AP1 -> curve -> sRGB).
// Gives more contrast in the mids and a soft, slightly desaturated roll-off in the highlights.
vec3 acesFit(vec3 c) {
    const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    c = inM * (c * 1.6);
    vec3 a = c * (c + 0.0245786) - 0.000090537;
    vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
    return clamp(outM * (a / b), 0.0, 1.0);
}

// ACES bleaches bright saturated lights (torch flames, lava) towards white; blend a little of a
// hue-preserving version back in so they keep their colour
vec3 tonemap(vec3 c) {
    vec3 t = acesFit(c);
    vec3 hp = c * (luma(t) / max(luma(c), 1e-5));
    hp /= max(1.0, max(hp.r, max(hp.g, hp.b)));
    return mix(t, hp, 0.35);
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
