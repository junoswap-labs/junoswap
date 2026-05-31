precision mediump float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uIntensity;
uniform vec3 uAccentColor1;
uniform vec3 uAccentColor2;
uniform vec3 uAccentColor3;
uniform vec3 uBgColor;

// ── Hash & Noise ──────────────────────────────────────────────────────

float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// ── Nebula ────────────────────────────────────────────────────────────

vec3 nebula(vec2 uv, float time) {
    vec2 q = vec2(
        fbm(uv * 3.0 + vec2(0.0, 0.0) + time * 0.025),
        fbm(uv * 3.0 + vec2(5.2, 1.3) + time * 0.02)
    );

    vec2 r2 = vec2(
        fbm(uv * 3.0 + 4.0 * q + vec2(1.7, 9.2) + time * 0.012),
        fbm(uv * 3.0 + 4.0 * q + vec2(8.3, 2.8) + time * 0.015)
    );

    float f = fbm(uv * 3.0 + 4.0 * r2);

    // Color ramp — fire palette: amber-red → orange → gold
    vec3 color = uBgColor;
    color = mix(color, uAccentColor1 * 0.9, smoothstep(0.1, 0.35, f));
    color = mix(color, uAccentColor2 * 0.85, smoothstep(0.35, 0.6, f));
    color = mix(color, uAccentColor3 * 0.8, smoothstep(0.6, 0.85, f));

    color *= 0.5 + 0.9 * f;

    // Radial mask — nebula at mid-periphery
    float dist = length(uv - 0.5);
    float mask = smoothstep(0.05, 0.3, dist) * smoothstep(0.85, 0.35, dist);
    color *= mask;

    return color;
}

// ── Vignette ──────────────────────────────────────────────────────────

float vignette(vec2 uv) {
    float dist = length(uv - 0.5);
    return 1.0 - smoothstep(0.2, 0.8, dist);
}

// ── Main ──────────────────────────────────────────────────────────────

void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 uv = vUv;
    vec2 centeredUv = (uv - 0.5) * vec2(aspect, 1.0) + 0.5;

    // Vanishing point shifted by mouse
    vec2 center = 0.5 + (uMouse - 0.5) * 0.1;

    // ── Background base
    vec3 color = uBgColor;

    // ── Nebula layer
    vec3 neb = nebula(uv, uTime);
    color += neb;

    // ── Central glow — golden warp core
    float glowDist = length(centeredUv - center * vec2(aspect, 1.0));
    float glow = exp(-glowDist * 3.5) * 0.25;
    vec3 glowColor = mix(uAccentColor2, uAccentColor3, 0.6);
    color += glow * glowColor;

    // ── Vignette
    color *= mix(1.0, vignette(uv), 0.6);

    // ── Entrance animation
    color = mix(uBgColor, color, uIntensity);

    gl_FragColor = vec4(color, 1.0);
}
