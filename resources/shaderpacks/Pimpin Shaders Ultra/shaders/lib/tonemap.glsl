// Narkowicz fit of the ACES filmic curve
vec3 acesFilm(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 grade(vec3 c) {
    float l = luma(c);
    c = mix(vec3(l), c, SATURATION);
    return c;
}
