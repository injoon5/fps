/**
 * Fullscreen triangle vertex shader (GLSL ES 3.00).
 * Covers the viewport with a single triangle — no vertex buffer attributes
 * beyond gl_VertexID.
 */
export const liquidGlassVertSource = /* glsl */ `#version 300 es
precision highp float;

const vec2 POS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);

out vec2 vUv;

void main() {
  vec2 p = POS[gl_VertexID];
  // Map clip → UV: (-1,-1)→(0,0), (1,1)→(1,1)
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

export default liquidGlassVertSource;
