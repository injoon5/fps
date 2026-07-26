/**
 * Shader barrel — GLSL snippets + full Liquid Glass program sources.
 */

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
} from "./sdf.glsl.ts";

export {
  REFRACTION_CONSTANTS_GLSL,
  REFRACTION_GLSL,
  REFRACTION_SNIPPETS_GLSL,
} from "./refraction.glsl.ts";

export {
  SPECULAR_CONSTANTS_GLSL,
  SPECULAR_GLSL,
  SPECULAR_SNIPPETS_GLSL,
} from "./specular.glsl.ts";

export {
  SHADOW_CONSTANTS_GLSL,
  SHADOW_GLSL,
  SHADOW_SNIPPETS_GLSL,
} from "./shadow.glsl.ts";

export {
  liquidGlassFragSource,
  default as liquidGlassFrag,
} from "./liquidGlass.frag.ts";

export {
  liquidGlassVertSource,
  default as liquidGlassVert,
} from "./liquidGlass.vert.ts";
