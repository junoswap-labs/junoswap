precision mediump float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uIntensity;
uniform vec3 uAccentColor1; // unused — kept for JS uniform-plumbing compatibility
uniform vec3 uAccentColor2; // orange #FF914D — warm halo
uniform vec3 uAccentColor3; // gold   #FFD700 — warm core
uniform vec3 uBgColor;      // void   #04050B

// ── Hash ──────────────────────────────────────────────────────────────
// NOTE: every smoothstep below keeps edge0 < edge1 (reversed edges are
// undefined per the GLSL spec). Falloffs use 1.0 - smoothstep(...).

float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

// ── Starfield ─────────────────────────────────────────────────────────
// Drawn in aspect-corrected p-space so stars stay round on any aspect.
// `scale` sets density, `bright` the layer weight, `glint` enables
// plus-shaped diffraction spikes on the brightest stars.

vec3 starLayer(vec2 p, float scale, float bright, float glint) {
    vec2 gp = p * scale;
    vec2 id = floor(gp);
    vec2 gv = fract(gp) - 0.5;

    float n = hash21(id);
    // Only the top ~10% of cells hold a star.
    if (n < 0.90) return vec3(0.0);

    // Jitter the star within its cell.
    vec2 offset = (vec2(hash21(id + 1.7), hash21(id + 4.3)) - 0.5) * 0.7;
    vec2 d = gv - offset;
    float dist = length(d);

    // Soft round core.
    float core = 1.0 - smoothstep(0.0, 0.07, dist);
    core *= core;

    // Gentle per-star twinkle.
    float tw = 0.65 + 0.35 * sin(uTime * (0.7 + n * 2.0) + n * 30.0);

    vec3 col = vec3(core * tw) * vec3(0.9, 0.95, 1.0); // cool-white

    // Diffraction glints on the very brightest stars only.
    if (glint > 0.5 && n > 0.972) {
        float gx = (1.0 - smoothstep(0.0, 0.45, abs(d.x))) * (1.0 - smoothstep(0.0, 0.02, abs(d.y)));
        float gy = (1.0 - smoothstep(0.0, 0.45, abs(d.y))) * (1.0 - smoothstep(0.0, 0.02, abs(d.x)));
        float spike = (gx + gy) * 0.5 * tw;
        col += spike * vec3(1.0, 0.96, 0.9); // warm-white flare
    }

    return col * bright;
}

void main() {
    float aspect = uResolution.x / uResolution.y;

    // Aspect-corrected, centered space for the stars + vignette.
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);

    // Very subtle mouse parallax + slow drift give a sense of travel.
    vec2 par = (uMouse - 0.5);

    vec3 color = uBgColor;

    // Three depth layers: near (bright, glinted) → far (faint dust).
    color += starLayer(p + par * 0.060 + vec2(uTime * 0.0030, 0.0), 14.0, 0.65, 1.0);
    color += starLayer(p + par * 0.030 + vec2(uTime * 0.0018, 0.0), 28.0, 0.42, 1.0);
    color += starLayer(p + par * 0.015 + vec2(uTime * 0.0010, 0.0), 52.0, 0.26, 0.0);

    // ── Single warm focal glow ──────────────────────────────────────────
    // Distance in canvas-pixel space normalized by HEIGHT so the glow stays
    // a round focal point (a p-space circle ellipses + washes on portrait).
    vec2 fragPx = vUv * uResolution;
    vec2 glowCenterPx = (vec2(0.5, 0.52) + par * 0.04) * uResolution;
    float gd = length(fragPx - glowCenterPx) / uResolution.y;

    float halo = exp(-gd * 3.8) * 0.17;  // soft orange wash, kept tight to stay clean
    float coreGlow = exp(-gd * 8.5) * 0.22; // bright gold-orange focal core
    color += uAccentColor2 * halo + mix(uAccentColor2, uAccentColor3, 0.7) * coreGlow;

    // ── Film grain ──────────────────────────────────────────────────────
    // Bounded coordinate (mod) keeps the hash well within mediump precision.
    vec2 grainP = mod(fragPx, 256.0) + fract(uTime) * 71.0;
    float grain = (hash21(grainP) - 0.5) * 0.022;
    color += grain;

    // ── Vignette (round, aspect-corrected) ──────────────────────────────
    float vig = 1.0 - smoothstep(0.45, 1.15, length(p));
    color *= mix(1.0, vig, 0.7);

    // ── Entrance ────────────────────────────────────────────────────────
    color = mix(uBgColor, color, uIntensity);

    gl_FragColor = vec4(color, 1.0);
}
