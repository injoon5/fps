/**
 * GLSL ES 3.00 optical primitives for Apple Liquid Glass recreation.
 *
 * Design notes (WWDC / optical fidelity):
 * - Primary cue is LENSING (Snell bend + light concentration), not scatter.
 * - Flat center; warp concentrates in the bevel/rim.
 * - Chromatic dispersion stays subtle (~dispersion * 0.02 IOR delta).
 * - Thickness scales bend strength and frost softness (larger morphing
 *   surfaces read as thicker material).
 */

/** Shared constants used by refraction helpers. */
export const REFRACTION_CONSTANTS_GLSL = /* glsl */ `
const float LG_PI = 3.141592653589793;
const float LG_TAU = 6.283185307179586;
const float LG_REFRACT_EPS = 1e-4;
`;

/**
 * Snell's-law UV bend + chromatic dispersion + multi-tap frosted blur.
 * Expects a surface normal N (unit-ish) from the glass bevel:
 *   - N ≈ (0,0,1) in the flat interior → negligible bend
 *   - N tilts toward the rim → strong lensing
 */
export const REFRACTION_GLSL = /* glsl */ `
// --- Snell screen-space refraction -----------------------------------------

/**
 * refractUV — bend sample UV through a glass interface.
 *
 * uv        background UV in [0,1]
 * N         outward-ish surface normal (bevel-derived); Z faces viewer
 * ior       absolute index of refraction (glass ~1.45–1.52)
 * thickness optical path scale in UV units (already pixel-normalized)
 *
 * Uses GLSL refract() with eta = 1/ior (air → glass). Failed TIR falls back
 * to a mirror-like tangential slide so edges never punch black holes.
 */
vec2 refractUV(vec2 uv, vec3 N, float ior, float thickness) {
  vec3 Nn = normalize(N);
  // Viewer looks down -Z in screen space; glass faces +Z.
  vec3 I = vec3(0.0, 0.0, -1.0);
  float eta = 1.0 / max(ior, 1.0 + LG_REFRACT_EPS);

  vec3 T = refract(I, Nn, eta);

  // TIR / grazing: slide along the surface tangent instead of vanishing.
  if (dot(T, T) < LG_REFRACT_EPS) {
    T = reflect(I, Nn);
    T.z = -abs(T.z);
  }

  // Path length through the slab ~ thickness / |T.z|.
  // Thicker glass → longer walk → stronger apparent bend (Apple morph thickness).
  float tz = max(abs(T.z), LG_REFRACT_EPS);
  float path = thickness / tz;

  // Lateral walk is T.xy * path. Flat normals (Nn.xy≈0) → near-zero offset.
  return uv + T.xy * path;
}

/**
 * Chromatic dispersion: sample R/G/B at slightly different IORs.
 * Offset magnitude ≈ dispersion * 0.02 (subtle fringe at high-curvature rims).
 */
vec3 refractUVChromatic(
  vec2 uv,
  vec3 N,
  float ior,
  float thickness,
  float dispersion
) {
  float d = dispersion * 0.02;
  float iorR = ior + d;
  float iorG = ior;
  float iorB = ior - d;

  vec2 uvR = refractUV(uv, N, iorR, thickness);
  vec2 uvG = refractUV(uv, N, iorG, thickness);
  vec2 uvB = refractUV(uv, N, iorB, thickness);

  // Pack channel X offsets; full mat form preferred for sampling.
  return vec3(uvR.x, uvG.x, uvB.x);
}

/**
 * Full RGB refracted UVs (xy per channel packed into mat3 columns).
 * Column 0 = R uv, column 1 = G uv, column 2 = B uv.
 */
mat3 refractUVChromaticMat(
  vec2 uv,
  vec3 N,
  float ior,
  float thickness,
  float dispersion
) {
  float d = dispersion * 0.02;
  return mat3(
    vec3(refractUV(uv, N, ior + d, thickness), 0.0),
    vec3(refractUV(uv, N, ior,       thickness), 0.0),
    vec3(refractUV(uv, N, ior - d, thickness), 0.0)
  );
}

// --- Multi-tap frosted blur ------------------------------------------------

/**
 * Golden-angle ring offsets (12 taps) — good coverage without grid aliasing.
 * Center sample gets elevated weight so frost softens without washing lensing.
 */
vec2 frostRingOffset(int i, float radius) {
  // Golden angle ≈ 2.399963…
  float a = float(i) * 2.399963229728653;
  // Slight radius stagger so taps don't share one ring (Poisson-ish).
  float r = radius * sqrt((float(i) + 0.5) / 12.0);
  return vec2(cos(a), sin(a)) * r;
}

/**
 * frostedSampleRGB — sample background at three chromatic UVs with a
 * thickness-dependent blur ring.
 *
 * tex          background
 * uvR/G/B      per-channel refracted UVs
 * blur         base frost radius in UV units
 * thickness    scales blur (thicker → softer scatter)
 * frostAmount  0 = sharp lens only, 1 = full frost (variant-driven)
 */
vec3 frostedSampleRGB(
  sampler2D tex,
  vec2 uvR,
  vec2 uvG,
  vec2 uvB,
  float blur,
  float thickness,
  float frostAmount
) {
  // Thickness softens scatter: Apple's larger morphing menus read thicker.
  float radius = blur * mix(0.55, 1.35, clamp(thickness * 8.0, 0.0, 1.0));
  radius *= max(frostAmount, 0.0);

  // Center-weighted accumulation.
  float centerW = 1.0;
  vec3 acc = vec3(
    texture(tex, clamp(uvR, 0.0, 1.0)).r,
    texture(tex, clamp(uvG, 0.0, 1.0)).g,
    texture(tex, clamp(uvB, 0.0, 1.0)).b
  ) * centerW;
  float wSum = centerW;

  // 12-tap frosted ring (within 8–16 budget).
  const int TAPS = 12;
  for (int i = 0; i < TAPS; i++) {
    vec2 off = frostRingOffset(i, radius);
    // Ring taps slightly down-weighted vs center so lensing stays primary.
    float w = 0.55;
    acc += vec3(
      texture(tex, clamp(uvR + off, 0.0, 1.0)).r,
      texture(tex, clamp(uvG + off, 0.0, 1.0)).g,
      texture(tex, clamp(uvB + off, 0.0, 1.0)).b
    ) * w;
    wSum += w;
  }

  return acc / max(wSum, LG_REFRACT_EPS);
}

/**
 * Convenience: single-UV frost (no chromatic split) — useful for specular
 * environment lookups or debug passes.
 */
vec3 frostedSample(
  sampler2D tex,
  vec2 uv,
  float blur,
  float thickness,
  float frostAmount
) {
  return frostedSampleRGB(tex, uv, uv, uv, blur, thickness, frostAmount);
}

/**
 * Thickness-dependent lensing strength.
 * Maps physical thickness into a UV-space bend amplitude.
 * Larger / morphing surfaces feed higher thickness → stronger rim warp.
 */
float lensStrengthFromThickness(float thickness, float materialize) {
  // Smooth response: thin glass barely bends; thick glass concentrates light.
  float t = clamp(thickness, 0.0, 1.0);
  float optical = mix(0.35, 1.25, t * t); // quadratic — Apple "thicker material"
  return optical * clamp(materialize, 0.0, 1.0);
}
`;

/** Combined export for string concatenation into the fragment shader. */
export const REFRACTION_SNIPPETS_GLSL =
  REFRACTION_CONSTANTS_GLSL + REFRACTION_GLSL;
