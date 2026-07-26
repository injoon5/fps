/**
 * GLSL snippets: squircle SDF, primitives, and Apple-style bevel heightfield.
 *
 * Optical intent
 * --------------
 * Liquid Glass looks like a thick lens only near its perimeter. The planform
 * is a squircle (superellipse n≈4–5). Thickness is a heightfield that is flat
 * in the center and falls to the rim along a circular arc — so surface slope
 * (and refraction via Snell's law) concentrates at the bevel, matching Apple's
 * edge-lensing look.
 *
 * Import into shader sources by string concatenation / template embedding.
 */

/** Shared constants and tiny utilities used by the SDF block. */
export const sdfCommonGlsl = /* glsl */ `
#ifndef LIQUID_GLASS_SDF_COMMON
#define LIQUID_GLASS_SDF_COMMON

const float LG_SDF_EPS = 1e-6;
const float LG_SDF_EPS_GRAD = 1e-12;

float lgPowSafe(float x, float n) {
  // Stable pow for non-negative bases (superellipse uses abs coords).
  return pow(max(x, LG_SDF_EPS_GRAD), n);
}

#endif // LIQUID_GLASS_SDF_COMMON
`;

/**
 * Accurate approximate SDF for a squircle (superellipse).
 *
 *   |x/b.x|^n + |y/b.y|^n = 1
 *
 * Uses Newton linearization sd ≈ f / |∇f| which is exact to first order on
 * the surface — ideal for AA and bevel sampling. `b` is the half-extents.
 * Negative = inside.
 */
export const sdSquircleGlsl = /* glsl */ `
float sdSquircle(vec2 p, vec2 b, float n) {
  vec2 ab = max(b, vec2(LG_SDF_EPS));
  float nn = max(n, 1e-3);
  vec2 ap = abs(p);
  vec2 q = ap / ab;

  float f = lgPowSafe(q.x, nn) + lgPowSafe(q.y, nn) - 1.0;

  // World-space gradient of f = |x/a|^n + |y/b|^n - 1
  vec2 g = vec2(
    (nn / ab.x) * lgPowSafe(q.x, nn - 1.0),
    (nn / ab.y) * lgPowSafe(q.y, nn - 1.0)
  );
  float gradLen = length(g);

  // Center / degenerate fallback: isotropic scale of the implicit field.
  if (gradLen < LG_SDF_EPS) {
    return f * min(ab.x, ab.y);
  }
  return f / gradLen;
}
`;

/**
 * Exact SDF for a rounded box (IQ). Useful as a comparison baseline against
 * the squircle — continuous corners sit visually between this and n=4.
 * `b` = half-extents of the inner sharp box; `r` = corner radius.
 */
export const sdRoundedBoxGlsl = /* glsl */ `
float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
`;

/** Capsule SDF (IQ): segment a→b with radius r. */
export const sdCapsuleGlsl = /* glsl */ `
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), LG_SDF_EPS), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
`;

/** Circle SDF. */
export const sdCircleGlsl = /* glsl */ `
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}
`;

/**
 * Unit outward normal of the squircle planform via analytic ∇f, with an
 * optional central-difference fallback path for validation.
 *
 * Set LG_SQUIRCLE_NORMAL_FD to 1 before including to force finite differences.
 */
export const squircleNormalGlsl = /* glsl */ `
vec2 squircleNormal(vec2 p, vec2 b, float n) {
#ifdef LG_SQUIRCLE_NORMAL_FD
  // Central differences — robust cross-check, slightly softer on axes.
  float e = 0.001 * max(min(b.x, b.y), 1.0);
  float dx = sdSquircle(p + vec2(e, 0.0), b, n) - sdSquircle(p - vec2(e, 0.0), b, n);
  float dy = sdSquircle(p + vec2(0.0, e), b, n) - sdSquircle(p - vec2(0.0, e), b, n);
  return normalize(vec2(dx, dy) + vec2(LG_SDF_EPS_GRAD));
#else
  vec2 ab = max(b, vec2(LG_SDF_EPS));
  float nn = max(n, 1e-3);
  vec2 ap = abs(p);
  vec2 q = max(ap / ab, vec2(LG_SDF_EPS_GRAD));
  vec2 g = vec2(
    sign(p.x) * (nn / ab.x) * lgPowSafe(q.x, nn - 1.0),
    sign(p.y) * (nn / ab.y) * lgPowSafe(q.y, nn - 1.0)
  );
  float len = length(g);
  if (len < LG_SDF_EPS) {
    return vec2(1.0, 0.0);
  }
  return g / len;
#endif
}
`;

/**
 * Circular-arc bevel heightfield from signed distance.
 *
 * Flat center, steep rim — Apple's edge lensing lives here.
 *
 *   s = -sd  (inward distance from the silhouette)
 *   R = bevelWidth, t = thickness
 *
 *   h = 0                         s ≤ 0
 *   h = t * sqrt(1 - (1 - s/R)^2) 0 < s < R   // quarter-ellipse / circular arc
 *   h = t                         s ≥ R
 *
 * At s→0 the slope → ∞ (vertical tangent); at s→R the slope → 0 (joins flat).
 * That packs dN/dx into a thin band at the perimeter for Snell's law.
 */
export const bevelHeightGlsl = /* glsl */ `
float bevelHeight(float sd, float bevelWidth, float thickness) {
  float R = max(bevelWidth, LG_SDF_EPS);
  float t = max(thickness, 0.0);
  float s = -sd;
  if (s <= 0.0) return 0.0;
  if (s >= R) return t;
  float x = 1.0 - s / R;
  return t * sqrt(max(1.0 - x * x, 0.0));
}

// dh/ds along the inward normal; 0 on the flat plateau and outside.
float bevelSlopeDhDs(float sd, float bevelWidth, float thickness) {
  float R = max(bevelWidth, LG_SDF_EPS);
  float t = max(thickness, 0.0);
  float s = -sd;
  if (s <= 0.0 || s >= R) return 0.0;
  float x = 1.0 - s / R;
  float denom = sqrt(max(1.0 - x * x, LG_SDF_EPS_GRAD));
  // h = t*sqrt(1-x^2), x = 1-s/R  →  dh/ds = t*x / (R * sqrt(1-x^2))
  // Near the rim x→1, denom→0: slope blows up (vertical) — clamp for stability.
  return (t * x) / max(R * denom, LG_SDF_EPS);
}
`;

/**
 * 3D surface normal for refraction (Snell's law).
 *
 * N ∝ ( (dh/ds) · n_planform , 1 ) with n_planform the outward 2D squircle
 * normal. nz stays positive (upward-facing lens surface).
 */
export const bevelNormalGlsl = /* glsl */ `
vec3 bevelNormal(vec2 p, vec2 halfSize, float n, float bevelWidth) {
  // Unit thickness for normal shape; scale cancels in normalize for pure arc,
  // but we keep thickness=bevelWidth so the arc is circular in world units.
  float thickness = bevelWidth;
  float sd = sdSquircle(p, halfSize, n);
  vec2 n2 = squircleNormal(p, halfSize, n);
  float dhds = bevelSlopeDhDs(sd, bevelWidth, thickness);
  // ∇h = -(dh/ds) n2  in the plane; surface normal (−∇h, 1) = (dhds*n2, 1).
  vec3 N = vec3(dhds * n2, 1.0);
  return normalize(N);
}

// Overload with explicit thickness (optical depth of the lens plateau).
vec3 bevelNormalThick(vec2 p, vec2 halfSize, float n, float bevelWidth, float thickness) {
  float sd = sdSquircle(p, halfSize, n);
  vec2 n2 = squircleNormal(p, halfSize, n);
  float dhds = bevelSlopeDhDs(sd, bevelWidth, thickness);
  return normalize(vec3(dhds * n2, 1.0));
}
`;

/**
 * Pixel-aware soft edge for AA coverage.
 * `px` ≈ screen-space SDF gradient magnitude (e.g. fwidth(sd) or length(dFdx/dFdy)).
 */
export const smoothEdgeGlsl = /* glsl */ `
float smoothEdge(float sd, float px) {
  float w = max(px, LG_SDF_EPS);
  return clamp(0.5 - sd / w, 0.0, 1.0);
}
`;

/**
 * Full SDF + bevel library as a single include string (common + all functions).
 * Order matters: common → primitives → squircle → normals → bevel → AA.
 */
export const sdfLibraryGlsl = [
  sdfCommonGlsl,
  sdCircleGlsl,
  sdCapsuleGlsl,
  sdRoundedBoxGlsl,
  sdSquircleGlsl,
  squircleNormalGlsl,
  bevelHeightGlsl,
  bevelNormalGlsl,
  smoothEdgeGlsl,
].join("\n");

/** Named export aliases matching the user's requested GLSL symbols. */
export const glslSnippets = {
  sdSquircle: sdSquircleGlsl,
  sdRoundedBox: sdRoundedBoxGlsl,
  sdCapsule: sdCapsuleGlsl,
  sdCircle: sdCircleGlsl,
  squircleNormal: squircleNormalGlsl,
  bevelHeight: bevelHeightGlsl,
  bevelNormal: bevelNormalGlsl,
  smoothEdge: smoothEdgeGlsl,
  common: sdfCommonGlsl,
  library: sdfLibraryGlsl,
} as const;
