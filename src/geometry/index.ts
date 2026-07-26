/**
 * Geometry barrel — squircle planform + bevel heightfield helpers for liquid glass.
 */

export {
  APPLE_SQUIRCLE_N,
  CONTINUOUS_CORNER_N,
  TIGHT_SQUIRCLE_N,
  DEFAULT_SQUIRCLE,
  continuousCornerExponent,
  squircleField,
  evalSquircleSd,
  squircleFieldGradient,
  squircleNormal2,
  bevelHeightFromSd,
  bevelSlopeDhDs,
  bevelNormal3,
  smoothEdge,
  squircleBoundaryPoint,
  type SquircleParams,
} from "./squircle.ts";

// Re-export GLSL snippet module for convenient single-entry imports.
export {
  sdfCommonGlsl,
  sdSquircleGlsl,
  sdRoundedBoxGlsl,
  sdCapsuleGlsl,
  sdCircleGlsl,
  squircleNormalGlsl,
  bevelHeightGlsl,
  bevelNormalGlsl,
  smoothEdgeGlsl,
  sdfLibraryGlsl,
  glslSnippets,
} from "../shaders/sdf.glsl.ts";
