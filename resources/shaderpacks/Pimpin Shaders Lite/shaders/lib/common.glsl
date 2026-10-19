// small helpers shared by every program
#define ID_LEAVES 10001.0
#define ID_PLANT 10002.0
#define ID_TALL_UPPER 10003.0
#define ID_TALL_LOWER 10004.0
#define ID_WATER 10010.0
#define ID_ICE 10011.0
#define ID_GLASS 10012.0
#define ID_GLOW 10020.0
#define ID_LAVA 10021.0

bool isId(float id, float want) { return abs(id - want) < 0.5; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 toLinear(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
float sat(float x) { return clamp(x, 0.0, 1.0); }

// interleaved gradient noise
float dither(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

float hash12(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 lightmapCoords(vec2 lm) { return clamp((lm - 1.0 / 32.0) * (32.0 / 30.0), 0.0, 1.0); }

vec3 screenToView(vec2 uv, float depth) {
    vec4 p = gbufferProjectionInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
}
