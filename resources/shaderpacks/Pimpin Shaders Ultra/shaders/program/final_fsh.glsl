varying vec2 uv;
const bool colortex0MipmapEnabled = true;

void main() {
    vec2 px = 1.0 / vec2(viewWidth, viewHeight);
    vec3 col = texture2D(colortex0, uv).rgb;
#ifdef SHARPEN
    // gentle sharpening to win back what TAA softens
    vec3 nb = texture2D(colortex0, uv + vec2(px.x, 0.0)).rgb + texture2D(colortex0, uv - vec2(px.x, 0.0)).rgb
            + texture2D(colortex0, uv + vec2(0.0, px.y)).rgb + texture2D(colortex0, uv - vec2(0.0, px.y)).rgb;
    vec3 sharp = col + (col - nb * 0.25) * 0.35;
    col = clamp(sharp, col * 0.6, col * 1.6);
#endif
#ifdef BLOOM
    vec3 bloom = vec3(0.0);
    float wsum = 0.0;
    for (int i = 2; i < 8; i++) {
        float lod = float(i);
        vec2 o = px * exp2(lod) * 0.5;
        vec3 s = texture2D(colortex0, uv + vec2(o.x, o.y), lod).rgb;
        s += texture2D(colortex0, uv + vec2(-o.x, o.y), lod).rgb;
        s += texture2D(colortex0, uv + vec2(o.x, -o.y), lod).rgb;
        s += texture2D(colortex0, uv + vec2(-o.x, -o.y), lod).rgb;
        float w = 1.0 / (lod - 0.5);
        bloom += s * 0.25 * w;
        wsum += w;
    }
    bloom /= wsum;
    float bl = luma(bloom);
    vec3 bright = bloom * clamp((bl - 0.9) / max(bl, 0.0001), 0.0, 1.0);
    col += (bright * 0.45 + bloom * 0.03) * BLOOM_STRENGTH;
#endif
    float exposure = exposureValue();
#ifdef AUTO_EXPOSURE
    float avg = luma(texture2D(colortex0, vec2(0.5), 14.0).rgb);
    float autoExp = clamp(0.2 / max(avg * exposure, 0.0001), 0.6, 1.3);
    exposure *= mix(1.0, autoExp, 0.5);
#endif
    gl_FragData[0] = vec4(finishColor(col, uv, exposure), 1.0);
}
