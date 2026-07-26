/**
 * Optical parameter helpers tuned to match Apple Liquid Glass.
 *
 * Reference ranges (WWDC / system materials):
 * - IOR ≈ 1.45–1.52 (soda-lime / optical glass feel)
 * - Bevel concentrates normals at the rim; flat center
 * - Dispersion subtle — fringe only at high curvature
 * - Blur is secondary to lensing; Clear ≪ Regular frost
 */

/** Glass material variant — mirrors Apple's Regular / Clear. */
export type GlassVariant = "regular" | "clear";

export const GlassVariantId = {
  regular: 0,
  clear: 1,
} as const satisfies Record<GlassVariant, number>;

export type GlassVariantId = (typeof GlassVariantId)[GlassVariant];

/** Core optical uniforms fed to the Liquid Glass fragment shader. */
export interface OpticalParams {
  /** Absolute index of refraction. */
  ior: number;
  /** Chromatic dispersion amount (shader applies * 0.02 to IOR). */
  dispersion: number;
  /** Base frosted-blur radius in pixels (converted to UV by the renderer). */
  blurPx: number;
  /** Optical thickness in [0,1] — drives bend + scatter softeness. */
  thickness: number;
  /** Bevel width in pixels — region where surface normals tilt. */
  bevelPx: number;
  /** Soft corner normal falloff exponent (higher = sharper rim). */
  cornerN: number;
  /** Optional glass tint (rgb) + alpha used as tint strength. */
  tint: readonly [number, number, number, number];
  /** Variant id: 0 = regular, 1 = clear. */
  variant: GlassVariantId;
}

/** Sensible scene-level defaults shared across variants. */
export const OPTICAL_DEFAULTS = {
  /** Mid glass IOR — reads as physical without over-bending. */
  ior: 1.48,
  /** IOR clamp used when remapping UI controls. */
  iorRange: [1.45, 1.52] as const,
  /** Bevel width as a fraction of the shorter half-extent (fallback). */
  bevelFraction: 0.22,
  /** Minimum / maximum bevel in CSS pixels. */
  bevelPxRange: [6, 28] as const,
  /** Default light direction (normalized later on GPU). */
  lightDir: [0.35, 0.75, 0.55] as const,
  /** Materialize idle / fully-on. */
  materialize: 1,
} as const;

/**
 * Regular Liquid Glass — medium frost, adaptive lensing, subtle CA.
 * Primary look for toolbars, menus, sidebars.
 */
export const REGULAR_GLASS: OpticalParams = {
  ior: 1.48,
  dispersion: 0.55,
  blurPx: 2.4,
  thickness: 0.55,
  bevelPx: 14,
  cornerN: 1.8,
  tint: [0.92, 0.95, 1.0, 0.08],
  variant: GlassVariantId.regular,
};

/**
 * Clear Liquid Glass — more transparent, minimal frost, crisper refraction.
 * Used for controls that should feel like thin crystal over content.
 */
export const CLEAR_GLASS: OpticalParams = {
  ior: 1.5,
  dispersion: 0.35,
  blurPx: 0.7,
  thickness: 0.32,
  bevelPx: 10,
  cornerN: 2.2,
  tint: [1.0, 1.0, 1.0, 0.03],
  variant: GlassVariantId.clear,
};

/** Lookup by variant name. */
export function opticalParamsForVariant(variant: GlassVariant): OpticalParams {
  switch (variant) {
    case "regular":
      return { ...REGULAR_GLASS };
    case "clear":
      return { ...CLEAR_GLASS };
    default: {
      const _exhaustive: never = variant;
      return _exhaustive;
    }
  }
}

/**
 * Map a morphing surface's on-screen size to optical thickness.
 * Apple: larger morphing menus get thicker material → stronger bend + softer scatter.
 *
 * @param shorterHalfPx  min(halfWidth, halfHeight) of the glass rect in px
 * @param variant        material variant
 */
export function thicknessForSize(
  shorterHalfPx: number,
  variant: GlassVariant = "regular",
): number {
  const base = variant === "clear" ? 0.22 : 0.4;
  // Remap ~24px → thin, ~120px+ → thick, with a soft knee.
  const t = smootherstep(24, 120, Math.max(0, shorterHalfPx));
  const boosted = base + t * (variant === "clear" ? 0.35 : 0.55);
  return clamp01(boosted);
}

/**
 * Bevel width in pixels from glass size — keeps rim proportion stable
 * while clamping to physically plausible widths.
 */
export function bevelPxForSize(shorterHalfPx: number): number {
  const [minB, maxB] = OPTICAL_DEFAULTS.bevelPxRange;
  const raw = shorterHalfPx * OPTICAL_DEFAULTS.bevelFraction;
  return clamp(raw, minB, maxB);
}

/**
 * Convert a pixel blur radius to UV space for the current framebuffer.
 */
export function blurPxToUv(blurPx: number, resolution: readonly [number, number]): number {
  const minDim = Math.max(1, Math.min(resolution[0], resolution[1]));
  return blurPx / minDim;
}

/**
 * Convert optical thickness + materialize into the UV-space path length
 * consumed by `refractUV` (mirrors `lensStrengthFromThickness` on GPU).
 */
export function lensPathUv(
  thickness: number,
  materialize: number,
  resolution: readonly [number, number],
  /** Extra scale: ~8–18 px of max lateral walk at full thickness. */
  maxBendPx = 14,
): number {
  const t = clamp01(thickness);
  const optical = mix(0.35, 1.25, t * t);
  const strength = optical * clamp01(materialize);
  const minDim = Math.max(1, Math.min(resolution[0], resolution[1]));
  return (maxBendPx * strength) / minDim;
}

/** Blend Regular → Clear optical params (for animated variant switches). */
export function lerpOpticalParams(
  a: OpticalParams,
  b: OpticalParams,
  t: number,
): OpticalParams {
  const u = clamp01(t);
  return {
    ior: mix(a.ior, b.ior, u),
    dispersion: mix(a.dispersion, b.dispersion, u),
    blurPx: mix(a.blurPx, b.blurPx, u),
    thickness: mix(a.thickness, b.thickness, u),
    bevelPx: mix(a.bevelPx, b.bevelPx, u),
    cornerN: mix(a.cornerN, b.cornerN, u),
    tint: [
      mix(a.tint[0], b.tint[0], u),
      mix(a.tint[1], b.tint[1], u),
      mix(a.tint[2], b.tint[2], u),
      mix(a.tint[3], b.tint[3], u),
    ],
    variant: u < 0.5 ? a.variant : b.variant,
  };
}

/** Resolve a complete uniform payload from size + variant + materialize. */
export function resolveOpticalUniforms(options: {
  variant?: GlassVariant;
  halfSizePx: readonly [number, number];
  resolution: readonly [number, number];
  materialize?: number;
  overrides?: Partial<OpticalParams>;
}): OpticalParams & {
  blurUv: number;
  lensPath: number;
  materialize: number;
  lightDir: readonly [number, number, number];
} {
  const variant = options.variant ?? "regular";
  const shorter = Math.min(options.halfSizePx[0], options.halfSizePx[1]);
  const base = opticalParamsForVariant(variant);
  const merged: OpticalParams = {
    ...base,
    thickness: thicknessForSize(shorter, variant),
    bevelPx: bevelPxForSize(shorter),
    ...options.overrides,
  };
  const materialize = options.materialize ?? OPTICAL_DEFAULTS.materialize;
  return {
    ...merged,
    blurUv: blurPxToUv(merged.blurPx, options.resolution),
    lensPath: lensPathUv(merged.thickness, materialize, options.resolution),
    materialize,
    lightDir: OPTICAL_DEFAULTS.lightDir,
  };
}

// --- math utils ------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(edge1 - edge0, 1e-6));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
