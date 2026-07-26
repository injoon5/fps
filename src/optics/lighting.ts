/**
 * Apple-like lighting & adaptive-shadow defaults for Liquid Glass.
 *
 * Specular tracks device tilt / environment (WWDC). Shadows deepen over
 * busy/dark text and lighten over flat light backgrounds.
 */

import type { GlassVariant } from "./refraction.ts";

/** RGB triplet in linear-ish 0–1 space. */
export type Rgb = readonly [number, number, number];

/** Normalized (or soon-to-be-normalized) direction. */
export type Vec3 = readonly [number, number, number];

/** One light in the 3-point setup. */
export interface LightDesc {
  /** Direction toward the light (screen space: +X right, +Y up, +Z toward viewer). */
  dir: Vec3;
  /** Tint × intensity baked into RGB. */
  color: Rgb;
}

/** Full lighting rig consumed by the specular GLSL layer. */
export interface LightingRig {
  key: LightDesc;
  fill: LightDesc;
  rim: LightDesc;
  /** Microfacet roughness — Clear is sharper than Regular. */
  roughness: number;
  /** Overall specular intensity multiplier. */
  specularIntensity: number;
  /** Edge rim glow strength. */
  rimStrength: number;
  /** Cheap background-as-env reflection strength. */
  envStrength: number;
  /** Env UV spread (lateral walk of reflected ray). */
  envSpread: number;
  /** Caustic boost amount near bevel. */
  causticAmount: number;
}

/** Adaptive contact-shadow parameters. */
export interface AdaptiveShadowParams {
  /** Base opacity before luminance/contrast adaptation. */
  baseStrength: number;
  /** Soft penumbra width in CSS pixels. */
  blurPx: number;
  /** Shadow cast offset in px (aligned with key light XY). */
  offsetPx: readonly [number, number];
}

/** Device-tilt → light mapping controls. */
export interface DeviceTiltParams {
  /** Max radians-ish contribution of tilt.x / tilt.y into lightDir. */
  tiltScale: number;
  /** Clamp for incoming tilt before mapping. */
  tiltClamp: number;
}

/** Warm key from upper-left, cool fill from lower-right, cool rim from behind. */
export const APPLE_THREE_POINT = {
  key: {
    dir: [0.42, 0.78, 0.48] as const,
    /** Warm key — Apple specular often reads slightly golden. */
    color: [1.0, 0.96, 0.9] as const,
  },
  fill: {
    dir: [-0.55, -0.25, 0.65] as const,
    /** Cool fill softens contrast without washing the key. */
    color: [0.72, 0.82, 1.0] as const,
  },
  rim: {
    dir: [-0.25, 0.55, -0.35] as const,
    /** Cool rim catches the bevel silhouette. */
    color: [0.85, 0.92, 1.0] as const,
  },
} as const satisfies {
  key: LightDesc;
  fill: LightDesc;
  rim: LightDesc;
};

/** Shared tilt mapping — matches `lightDirFromTilt` feel on GPU. */
export const DEVICE_TILT_DEFAULTS: DeviceTiltParams = {
  tiltScale: 0.55,
  tiltClamp: 1.0,
};

/** Regular glass — softer specular, stronger frost-era rim & caustics. */
export const REGULAR_LIGHTING: LightingRig = {
  key: { ...APPLE_THREE_POINT.key },
  fill: { ...APPLE_THREE_POINT.fill },
  rim: { ...APPLE_THREE_POINT.rim },
  roughness: 0.28,
  specularIntensity: 0.85,
  rimStrength: 0.42,
  envStrength: 0.18,
  envSpread: 0.04,
  causticAmount: 0.55,
};

/** Clear glass — sharper highlights, subtler env / caustics. */
export const CLEAR_LIGHTING: LightingRig = {
  key: { ...APPLE_THREE_POINT.key },
  fill: {
    dir: APPLE_THREE_POINT.fill.dir,
    color: [0.78, 0.86, 1.0] as const,
  },
  rim: { ...APPLE_THREE_POINT.rim },
  roughness: 0.12,
  specularIntensity: 1.05,
  rimStrength: 0.32,
  envStrength: 0.28,
  envSpread: 0.055,
  causticAmount: 0.38,
};

/** Regular: deeper adaptive contact shadow for frosted panels. */
export const REGULAR_SHADOW: AdaptiveShadowParams = {
  baseStrength: 0.22,
  blurPx: 10,
  offsetPx: [2.5, -3.5],
};

/** Clear: lighter shadow so thin crystal doesn't muddy content. */
export const CLEAR_SHADOW: AdaptiveShadowParams = {
  baseStrength: 0.1,
  blurPx: 6,
  offsetPx: [1.5, -2.0],
};

/** Lookup lighting rig by variant. */
export function lightingForVariant(variant: GlassVariant): LightingRig {
  switch (variant) {
    case "regular":
      return { ...REGULAR_LIGHTING, key: { ...REGULAR_LIGHTING.key }, fill: { ...REGULAR_LIGHTING.fill }, rim: { ...REGULAR_LIGHTING.rim } };
    case "clear":
      return { ...CLEAR_LIGHTING, key: { ...CLEAR_LIGHTING.key }, fill: { ...CLEAR_LIGHTING.fill }, rim: { ...CLEAR_LIGHTING.rim } };
    default: {
      const _exhaustive: never = variant;
      return _exhaustive;
    }
  }
}

/** Lookup adaptive shadow params by variant. */
export function shadowForVariant(variant: GlassVariant): AdaptiveShadowParams {
  switch (variant) {
    case "regular":
      return { ...REGULAR_SHADOW, offsetPx: [...REGULAR_SHADOW.offsetPx] };
    case "clear":
      return { ...CLEAR_SHADOW, offsetPx: [...CLEAR_SHADOW.offsetPx] };
    default: {
      const _exhaustive: never = variant;
      return _exhaustive;
    }
  }
}

/**
 * Map device tilt (e.g. DeviceOrientation / pointer parallax) into a light
 * direction, mirroring `lightDirFromTilt` in specular.glsl.ts.
 *
 * @param baseL   base key light direction
 * @param tilt    xy tilt in roughly [-1,1] (or radians scaled into that range)
 * @param params  optional scale/clamp overrides
 */
export function lightDirFromDeviceTilt(
  baseL: Vec3,
  tilt: readonly [number, number],
  params: DeviceTiltParams = DEVICE_TILT_DEFAULTS,
): [number, number, number] {
  const tx = clamp(tilt[0], -params.tiltClamp, params.tiltClamp);
  const ty = clamp(tilt[1], -params.tiltClamp, params.tiltClamp);
  let x = baseL[0] + tx * params.tiltScale;
  let y = baseL[1] + ty * params.tiltScale;
  let z = Math.max(
    baseL[2] + Math.abs(tx) * 0.08 + Math.abs(ty) * 0.08,
    0.15,
  );
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/**
 * Derive a soft shadow offset from the key light's XY (cast opposite light).
 */
export function shadowOffsetFromLight(
  keyDir: Vec3,
  magnitudePx: number,
): [number, number] {
  const xy = Math.hypot(keyDir[0], keyDir[1]) || 1;
  // Shadow sits opposite the key on screen.
  return [(-keyDir[0] / xy) * magnitudePx, (-keyDir[1] / xy) * magnitudePx];
}

/**
 * Resolve a complete lighting + shadow uniform payload for the fragment shader.
 */
export function resolveLightingUniforms(options: {
  variant?: GlassVariant;
  /** Device / pointer tilt in ~[-1,1]. */
  deviceTilt?: readonly [number, number];
  overrides?: Partial<LightingRig> & { shadow?: Partial<AdaptiveShadowParams> };
}): {
  keyDir: [number, number, number];
  keyColor: Rgb;
  fillDir: Vec3;
  fillColor: Rgb;
  rimDir: Vec3;
  rimColor: Rgb;
  roughness: number;
  specularIntensity: number;
  rimStrength: number;
  envStrength: number;
  envSpread: number;
  causticAmount: number;
  shadowBase: number;
  shadowBlurPx: number;
  shadowOffsetPx: [number, number];
  deviceTilt: [number, number];
} {
  const variant = options.variant ?? "regular";
  const rig = lightingForVariant(variant);
  const shadow = shadowForVariant(variant);
  const o = options.overrides;

  const keyDirBase = o?.key?.dir ?? rig.key.dir;
  const tilt = options.deviceTilt ?? ([0, 0] as const);
  const keyDir = lightDirFromDeviceTilt(keyDirBase, tilt);

  const shadowMerged: AdaptiveShadowParams = {
    ...shadow,
    ...o?.shadow,
    offsetPx: o?.shadow?.offsetPx ?? shadow.offsetPx,
  };

  // Prefer light-aligned offset when caller didn't override offset.
  const offset =
    o?.shadow?.offsetPx != null
      ? ([...o.shadow.offsetPx] as [number, number])
      : shadowOffsetFromLight(keyDir, Math.hypot(shadowMerged.offsetPx[0], shadowMerged.offsetPx[1]));

  return {
    keyDir,
    keyColor: o?.key?.color ?? rig.key.color,
    fillDir: o?.fill?.dir ?? rig.fill.dir,
    fillColor: o?.fill?.color ?? rig.fill.color,
    rimDir: o?.rim?.dir ?? rig.rim.dir,
    rimColor: o?.rim?.color ?? rig.rim.color,
    roughness: o?.roughness ?? rig.roughness,
    specularIntensity: o?.specularIntensity ?? rig.specularIntensity,
    rimStrength: o?.rimStrength ?? rig.rimStrength,
    envStrength: o?.envStrength ?? rig.envStrength,
    envSpread: o?.envSpread ?? rig.envSpread,
    causticAmount: o?.causticAmount ?? rig.causticAmount,
    shadowBase: shadowMerged.baseStrength,
    shadowBlurPx: shadowMerged.blurPx,
    shadowOffsetPx: offset,
    deviceTilt: [tilt[0], tilt[1]],
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
