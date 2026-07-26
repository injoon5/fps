/**
 * Liquid Glass interaction physics — springs, body state, motion light, shimmer.
 */

export {
  Spring,
  SpringPresets,
  springFromResponse,
  dampingRatio,
  createSpring,
  clamp,
  type SpringConfig,
  type SpringState,
  type SpringPresetName,
} from "./spring.ts";

export {
  GlassBody,
  type GlassRect,
  type GlassBodyOptions,
} from "./glassBody.ts";

export {
  MotionLight,
  bindDeviceOrientation,
  type MotionLightOptions,
  type Vec2,
  type Vec3,
} from "./motionLight.ts";

export {
  Shimmer,
  shimmerUniformsFromPress,
  type ShimmerUniforms,
  type ShimmerOptions,
} from "./shimmer.ts";
