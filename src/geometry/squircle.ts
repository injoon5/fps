/**
 * Apple-style squircle (superellipse) math for liquid-glass geometry.
 *
 * Optical intent
 * --------------
 * Liquid Glass refraction is driven by surface normals of a thin lens whose
 * planform is a squircle and whose thickness is flat in the interior with a
 * circular-arc bevel at the rim. Almost all Snell's-law bending happens in
 * that rim bevel; the center stays optically "quiet."
 *
 * Shape model
 * -----------
 * Superellipse (Lamé curve) in canonical form:
 *
 *   |x/a|^n + |y/b|^n = 1
 *
 * - n = 2     → ellipse / circle
 * - n ≈ 4–5   → Apple squircle feel (iOS icon / continuous-corner look)
 * - n → ∞     → axis-aligned rectangle
 *
 * Apple "continuous corners" are not a pure superellipse — they blend a
 * circular arc into the straight edge with G2 (curvature-continuous)
 * transitions. Empirically, a superellipse with n in [4, 5] matches the
 * silhouette closely enough for screen-space SDF work; for tighter matching
 * use {@link continuousCornerExponent} to map a corner-radius fraction to n.
 *
 * SDF approach
 * ------------
 * There is no closed-form Euclidean SDF for general n. We evaluate the
 * implicit f = |x/a|^n + |y/b|^n − 1 and convert to an approximate distance
 * via one Newton step:  sd ≈ f / |∇f|. This is highly accurate near the
 * surface (exactly where AA and bevel sampling matter) and numerically
 * stable when guarded against zero gradients on the axes.
 */

/** Default exponent that reads as Apple's continuous-corner squircle. */
export const APPLE_SQUIRCLE_N = 4.0;

/** Softer continuous-corner style (slightly rounder shoulders). */
export const CONTINUOUS_CORNER_N = 4.5;

/** Harder squircle approaching a rounded rect silhouette. */
export const TIGHT_SQUIRCLE_N = 5.0;

export interface SquircleParams {
  /** Half-width (a). */
  halfWidth: number;
  /** Half-height (b). */
  halfHeight: number;
  /**
   * Superellipse exponent n.
   * Prefer {@link APPLE_SQUIRCLE_N} (4) or {@link CONTINUOUS_CORNER_N} (4.5).
   */
  n: number;
}

export const DEFAULT_SQUIRCLE: Readonly<SquircleParams> = {
  halfWidth: 1,
  halfHeight: 1,
  n: APPLE_SQUIRCLE_N,
};

/**
 * Map a corner-radius fraction (0 = sharp rect, 1 = full pill/ellipse)
 * into a superellipse exponent that approximates Apple continuous corners.
 *
 * Heuristic: small radii → large n (boxy); large radii → n closer to 2.
 */
export function continuousCornerExponent(
  cornerRadiusFraction: number,
  opts: { minN?: number; maxN?: number } = {},
): number {
  const minN = opts.minN ?? 2.0;
  const maxN = opts.maxN ?? 8.0;
  const t = clamp01(cornerRadiusFraction);
  // Smooth remap: radius↑ ⇒ n↓ toward ellipse.
  const n = maxN + (minN - maxN) * smoothstep(0, 1, t);
  return clamp(n, minN, maxN);
}

/**
 * Implicit superellipse field f(p) = |x/a|^n + |y/b|^n − 1.
 * f < 0 inside, f = 0 on boundary, f > 0 outside.
 */
export function squircleField(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  n: number = APPLE_SQUIRCLE_N,
): number {
  const a = Math.max(halfWidth, 1e-8);
  const b = Math.max(halfHeight, 1e-8);
  const nn = Math.max(n, 1e-3);
  const px = Math.abs(x) / a;
  const py = Math.abs(y) / b;
  // pow(0, n) is fine for n > 0; guard extremes for stability.
  return Math.pow(px, nn) + Math.pow(py, nn) - 1;
}

/**
 * Approximate signed distance to the squircle via Newton linearization
 * sd ≈ f / |∇f|. Negative inside.
 *
 * Near-edge accuracy is excellent; far-field is only approximate (acceptable
 * for mask / bevel work where we only sample near the rim).
 */
export function evalSquircleSd(
  x: number,
  y: number,
  w: number,
  h: number,
  n: number = APPLE_SQUIRCLE_N,
): number {
  const a = Math.max(w * 0.5, 1e-8);
  const b = Math.max(h * 0.5, 1e-8);
  const nn = Math.max(n, 1e-3);

  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const px = ax / a;
  const py = ay / b;

  const f = Math.pow(px, nn) + Math.pow(py, nn) - 1;

  // ∇f in world space: ∂f/∂x = (n/a) * (ax/a)^{n-1} * sign(x), etc.
  // On axes, one term vanishes — clamp powers so the other axis still works.
  const gx = (nn / a) * Math.pow(Math.max(px, 1e-12), nn - 1);
  const gy = (nn / b) * Math.pow(Math.max(py, 1e-12), nn - 1);
  const gradLen = Math.hypot(gx, gy);

  // Fallback when both coords ~ 0 (center): use isotropic scale.
  if (gradLen < 1e-12) {
    return f * Math.min(a, b);
  }
  return f / gradLen;
}

/**
 * Analytic gradient of the implicit field (not unit normal).
 * Points outward for f increasing outside.
 */
export function squircleFieldGradient(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  n: number = APPLE_SQUIRCLE_N,
): [number, number] {
  const a = Math.max(halfWidth, 1e-8);
  const b = Math.max(halfHeight, 1e-8);
  const nn = Math.max(n, 1e-3);
  const px = Math.max(Math.abs(x) / a, 1e-12);
  const py = Math.max(Math.abs(y) / b, 1e-12);
  const gx = Math.sign(x || 1) * (nn / a) * Math.pow(px, nn - 1);
  const gy = Math.sign(y || 1) * (nn / b) * Math.pow(py, nn - 1);
  return [gx, gy];
}

/**
 * Unit 2D outward normal in the plane of the squircle (from SDF gradient).
 */
export function squircleNormal2(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  n: number = APPLE_SQUIRCLE_N,
): [number, number] {
  const [gx, gy] = squircleFieldGradient(x, y, halfWidth, halfHeight, n);
  const len = Math.hypot(gx, gy);
  if (len < 1e-12) {
    // Degenerate center — arbitrary; callers should not sample here for normals.
    return [1, 0];
  }
  return [gx / len, gy / len];
}

/**
 * Circular-arc bevel height from signed distance.
 *
 * Optical intent: flat plateau in the interior (no refraction), circular arc
 * that meets the rim with a vertical tangent so surface slope — and therefore
 * Snell's-law bending — concentrates at the edge.
 *
 * Cross-section (s = inward distance from boundary = −sd):
 *
 *   h(s) = 0                         s ≤ 0          (outside)
 *   h(s) = t · √(1 − (1 − s/R)²)     0 < s < R      (circular arc)
 *   h(s) = t                         s ≥ R          (flat lens center)
 *
 * where R = bevelWidth, t = thickness.
 */
export function bevelHeightFromSd(
  sd: number,
  bevelWidth: number,
  thickness: number,
): number {
  const R = Math.max(bevelWidth, 1e-8);
  const t = Math.max(thickness, 0);
  const s = -sd;
  if (s <= 0) return 0;
  if (s >= R) return t;
  const x = 1 - s / R; // 1 at rim → 0 at inner bevel
  return t * Math.sqrt(Math.max(1 - x * x, 0));
}

/**
 * dh/ds for the circular-arc bevel (used to build 3D normals).
 * s = −sd (inward).
 */
export function bevelSlopeDhDs(
  sd: number,
  bevelWidth: number,
  thickness: number,
): number {
  const R = Math.max(bevelWidth, 1e-8);
  const t = Math.max(thickness, 0);
  const s = -sd;
  if (s <= 0 || s >= R) return 0;
  const x = 1 - s / R;
  const denom = Math.sqrt(Math.max(1 - x * x, 1e-12));
  // h = t * sqrt(1 - x^2), x = 1 - s/R
  // dh/ds = t * (1/2)(1-x^2)^{-1/2} * (-2x) * dx/ds
  // dx/ds = -1/R  ⇒  dh/ds = t * (x / (R * sqrt(1-x^2)))
  return (t * x) / (R * denom);
}

/**
 * 3D surface normal for Snell's law. XY from SDF gradient, Z from height.
 * Returns [nx, ny, nz] pointing generally upward (nz > 0).
 */
export function bevelNormal3(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  n: number,
  bevelWidth: number,
  thickness: number = 1,
): [number, number, number] {
  const sd = evalSquircleSd(x, y, halfWidth * 2, halfHeight * 2, n);
  const [nx2, ny2] = squircleNormal2(x, y, halfWidth, halfHeight, n);
  const dhds = bevelSlopeDhDs(sd, bevelWidth, thickness);
  // Height decreases toward the rim along −n_planar when moving outward,
  // so ∇h_xy = dh/ds * (−n_planar) wait: s increases inward, n_planar points out,
  // ∇s = −n_planar, ∇h = (dh/ds) ∇s = −(dh/ds) n_planar.
  // Surface F = z - h(x,y) = 0 ⇒ N ∝ (−∂h/∂x, −∂h/∂y, 1) = ((dh/ds)n_planar, 1)
  const nx = dhds * nx2;
  const ny = dhds * ny2;
  const nz = 1;
  const len = Math.hypot(nx, ny, nz);
  return [nx / len, ny / len, nz / len];
}

/**
 * Soft anti-aliased coverage from signed distance (CPU helper mirroring GLSL).
 */
export function smoothEdge(sd: number, px: number): number {
  const w = Math.max(px, 1e-8);
  return clamp01(0.5 - sd / w);
}

/**
 * Evaluate squircle point on the boundary for a given polar-like parameter.
 * u ∈ [0,1] maps around the shape (not arc-length). Useful for debug outlines.
 */
export function squircleBoundaryPoint(
  theta: number,
  halfWidth: number,
  halfHeight: number,
  n: number = APPLE_SQUIRCLE_N,
): [number, number] {
  const nn = Math.max(n, 1e-3);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const ca = Math.abs(c);
  const sa = Math.abs(s);
  // Radial solution of |r c / a|^n + |r s / b|^n = 1
  const k = Math.pow(ca / halfWidth, nn) + Math.pow(sa / halfHeight, nn);
  const r = k > 0 ? Math.pow(k, -1 / nn) : 0;
  return [r * c, r * s];
}

// ---------------------------------------------------------------------------
// Local math utils (kept file-local to avoid extra deps)
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
