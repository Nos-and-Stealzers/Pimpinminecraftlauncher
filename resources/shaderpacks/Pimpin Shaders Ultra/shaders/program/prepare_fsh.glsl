// renders the sky-view LUT plus the sun and ambient colours into a corner of colortex5
#define SKY_INTENSITY 9.0
#define SUN_INTENSITY 2.8

vec3 skyRadiance(vec3 d, vec3 sunL) {
    float below = max(-d.y, 0.0);
    if (d.y < 0.0) d = normalize(vec3(d.x, 0.0, d.z));
    vec3 c = vec3(0.0);
    if (sunL.y > -0.3) c += atmScatter(d, sunL) * SKY_INTENSITY;
    if (sunL.y < 0.3) c += atmScatter(d, -sunL) * SKY_INTENSITY * 0.012 * moonTint();
    // faint airglow so a moonless night is not pitch black
    c += vec3(0.0030, 0.0042, 0.0085) * (1.15 - 0.5 * d.y) * (1.0 - dayFactor());
    c *= mix(1.0, 0.3, smoothstep(0.0, 0.5, below));
    float l = luma(c);
    c = mix(vec3(l), c, 1.12);
    vec3 overcast = vec3(l) * vec3(0.92, 0.96, 1.02) * 0.7;
    return mix(c, overcast, rainStrength * 0.85);
}

void main() {
    vec2 px = gl_FragCoord.xy;
    if (px.x > LUT_W || px.y > LUT_H + 1.0) discard;
    float sinE = sunHeight();
    vec3 sunL = vec3(sqrt(max(1.0 - sinE * sinE, 0.0)), sinE, 0.0);
    vec3 col;
    if (px.y < LUT_H) {
        col = skyRadiance(lutDirection((px - 0.5) / (vec2(LUT_W, LUT_H) - 1.0)), sunL);
    } else if (px.x < 1.0) {
        vec3 sunC = sunTransmittance(max(sinE, 0.0)) * SUN_INTENSITY * smoothstep(0.0, 0.06, sinE);
        vec3 moonC = sunTransmittance(max(-sinE, 0.0)) * 0.065 * moonTint() * smoothstep(0.0, 0.06, -sinE);
        col = (sunC * vec3(1.07, 0.98, 0.87) + moonC) * (1.0 - 0.85 * rainStrength);
    } else if (px.x < 3.0 && px.x >= 2.0) {
        // the sun disk colour: reddened by the long path through the air, kept until the sun has set
        col = sunTransmittance(max(sinE, 0.0)) * SUN_INTENSITY * smoothstep(-0.06, 0.0, sinE) * (1.0 - 0.9 * rainStrength);
    } else if (px.x < 2.0) {
        // cosine weighted average of the sky over the upper hemisphere
        col = skyRadiance(vec3(0.0, 1.0, 0.0), sunL);
        col += (skyRadiance(vec3(0.82, 0.57, 0.0), sunL) + 2.0 * skyRadiance(vec3(0.0, 0.57, 0.82), sunL) + skyRadiance(vec3(-0.82, 0.57, 0.0), sunL)) * 0.75;
        col += (skyRadiance(vec3(0.99, 0.14, 0.0), sunL) + 2.0 * skyRadiance(vec3(0.0, 0.14, 0.99), sunL) + skyRadiance(vec3(-0.99, 0.14, 0.0), sunL)) * 0.3;
        col /= 5.2;
        // a little saturation so shade stays blue instead of grey
        col = mix(vec3(luma(col)), col, 0.8) * 1.15 * AMBIENT_STRENGTH;
        col += vec3(0.006, 0.009, 0.018) * MOON_BRIGHTNESS * (1.0 - dayFactor());
    } else {
        discard;
    }
    gl_FragData[0] = vec4(max(col, vec3(0.0)), 1.0);
}
