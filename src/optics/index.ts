/**
 * Optics barrel — refraction params + Apple-like lighting / adaptive shadows.
 */

export {
  GlassVariantId,
  OPTICAL_DEFAULTS,
  REGULAR_GLASS,
  CLEAR_GLASS,
  opticalParamsForVariant,
  thicknessForSize,
  bevelPxForSize,
  blurPxToUv,
  lensPathUv,
  lerpOpticalParams,
  resolveOpticalUniforms,
} from "./refraction.ts";

export type { GlassVariant, OpticalParams } from "./refraction.ts";
// GlassVariantId is a value+type pair in refraction.ts; import the const from
// this barrel (or `import type { GlassVariantId }` from refraction.ts).

export {
  APPLE_THREE_POINT,
  DEVICE_TILT_DEFAULTS,
  REGULAR_LIGHTING,
  CLEAR_LIGHTING,
  REGULAR_SHADOW,
  CLEAR_SHADOW,
  lightingForVariant,
  shadowForVariant,
  lightDirFromDeviceTilt,
  shadowOffsetFromLight,
  resolveLightingUniforms,
  type Rgb,
  type Vec3,
  type LightDesc,
  type LightingRig,
  type AdaptiveShadowParams,
  type DeviceTiltParams,
} from "./lighting.ts";
