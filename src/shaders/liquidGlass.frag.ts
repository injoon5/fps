/**
 * Apple Liquid Glass — WebGL2 fragment shader (GLSL ES 3.00).
 *
 * Optical stack (composite order):
 *   1. Background pass-through outside glass
 *   2. Adaptive soft contact shadow under glass
 *   3. Rounded-rect SDF mask + soft AA
 *   4. Bevel-derived surface normals (flat center, warp at rim)
 *   5. Snell refraction UV bend (lensing = primary cue)
 *   6. Subtle chromatic dispersion at high-curvature edges
 *   7. Multi-tap frosted blur (secondary; Regular > Clear)
 *   8. Caustic boost near bevel (cylindrical lens focus)
 *   9. Fresnel reflection + 3-point specular + env + rim
 *  10. Tint
 *  11. AA mask composite
 *
 * Materialize modulates bend / specular strength — not opacity (Apple fade).
 */

import { REFRACTION_SNIPPETS_GLSL } from "./refraction.glsl.ts";
import { SPECULAR_SNIPPETS_GLSL } from "./specular.glsl.ts";
import { SHADOW_SNIPPETS_GLSL } from "./shadow.glsl.ts";

/** Self-contained SDF + bevel normals for the glass silhouette. */
const SDF_GLSL = /* glsl */ `
// Signed distance to a rounded box centered at \`center\` with half-extents
// \`halfSize\` and corner radius \`radius\` (all in pixel space).
float sdRoundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

// Analytic gradient of sdRoundedBox (unit normal in the XY plane).
vec2 sdRoundedBoxGrad(vec2 p, vec2 halfSize, float radius) {
  vec2 ap = abs(p);
  vec2 q = ap - halfSize + radius;
  vec2 sgn = sign(p);
  // Outside the rounded corner region — axis-aligned faces.
  if (q.x > 0.0 && q.y > 0.0) {
    return normalize(q) * sgn;
  }
  if (q.x > q.y) {
    return vec2(sgn.x, 0.0);
  }
  if (q.y > q.x) {
    return vec2(0.0, sgn.y);
  }
  // Degenerate centerline — fall back to normalized abs direction.
  return normalize(max(ap, vec2(1e-4))) * sgn;
}

/**
 * Bevel normal from SDF.
 * Interior distance d < 0. Bevel band is the outer |bevel| px of the interior.
 * Flat center → N=(0,0,1). Rim → XY tilt from SDF gradient.
 */
vec3 bevelNormal(vec2 p, vec2 halfSize, float radius, float bevelPx, float cornerN) {
  float d = sdRoundedBox(p, halfSize, radius);
  // Distance from rim toward interior (positive inside).
  float fromRim = -d;
  float bevel = max(bevelPx, 1e-3);

  // 0 at rim, 1 deep inside / outside the bevel band.
  float inward = clamp(fromRim / bevel, 0.0, 1.0);
  // Corner exponent sharpens or softens the normal falloff.
  float rimMask = pow(1.0 - inward, max(cornerN, 0.5));

  vec2 g = sdRoundedBoxGrad(p, halfSize, radius);
  // Tilt strength: stronger near rim, zero in flat center.
  vec2 tilt = g * rimMask;

  // Reconstruct a unit-ish normal with Z facing the viewer.
  // Keep Z dominant so center stays optically flat.
  return normalize(vec3(tilt, 1.0));
}

// Soft AA coverage from signed distance (px).
float softMask(float d, float aa) {
  return 1.0 - smoothstep(-aa, aa, d);
}
`;

/**
 * Full fragment shader source. Concatenates SDF + refraction + specular + shadow.
 */
export const liquidGlassFragSource = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uBackground;
uniform vec2  uResolution;   // framebuffer size in px
uniform vec4  uGlassRect;    // xy = center px, zw = half-size px
uniform float uCornerN;      // bevel falloff exponent
uniform float uBevel;        // bevel width px
uniform float uIOR;          // ~1.45–1.52
uniform float uDispersion;   // chromatic amount (shader uses * 0.02)
uniform float uBlur;         // frost radius in UV units
uniform float uThickness;    // 0–1 optical thickness
uniform vec3  uLightDir;     // legacy key light (overridden by tilt + uKeyDir)
uniform float uTime;
uniform vec2  uPointer;      // pointer in px (optional parallax cue)
uniform float uMaterialize;  // 0–1 — modulates lensing, not opacity
uniform vec4  uTint;         // rgb + strength
uniform float uVariant;      // 0 = regular, 1 = clear

// --- Specular / lighting (3-point + motion) --------------------------------
uniform vec2  uDeviceTilt;       // xy tilt → shifts key light (Apple motion specular)
uniform vec3  uKeyDir;           // warm key direction
uniform vec3  uKeyColor;
uniform vec3  uFillDir;          // cool fill
uniform vec3  uFillColor;
uniform vec3  uRimDir;           // rim / back light
uniform vec3  uRimColor;
uniform float uRoughness;        // Clear sharper than Regular
uniform float uSpecularIntensity;
uniform float uRimStrength;
uniform float uEnvStrength;
uniform float uEnvSpread;
uniform float uCausticAmount;

// --- Adaptive contact shadow ----------------------------------------------
uniform float uShadowBase;       // variant base opacity
uniform float uShadowBlurPx;     // penumbra px
uniform vec2  uShadowOffsetPx;   // cast offset px

${SDF_GLSL}
${REFRACTION_SNIPPETS_GLSL}
${SPECULAR_SNIPPETS_GLSL}
${SHADOW_SNIPPETS_GLSL}

// Corner radius derived from half-size — Apple continuous-corner feel.
float glassCornerRadius(vec2 halfSize) {
  float m = min(halfSize.x, halfSize.y);
  return clamp(m * 0.42, 8.0, m);
}

// Variant → frost amount. Clear is nearly sharp; Regular carries medium frost.
float frostForVariant(float variant) {
  return mix(1.0, 0.22, clamp(variant, 0.0, 1.0));
}

// Variant → shadow base if uniform left at 0 (safe fallback).
float shadowBaseForVariant(float variant, float uniformBase) {
  float fallback = mix(0.22, 0.10, clamp(variant, 0.0, 1.0));
  return uniformBase > 1e-5 ? uniformBase : fallback;
}

void main() {
  vec2 fragPx = vUv * uResolution;
  vec2 center = uGlassRect.xy;
  vec2 halfSize = uGlassRect.zw;
  vec2 p = fragPx - center;

  float radius = glassCornerRadius(halfSize);
  float d = sdRoundedBox(p, halfSize, radius);

  // ~1.25 px AA band, scaled slightly with resolution density.
  float aa = 1.25 * max(uResolution.x, uResolution.y) / max(min(uResolution.x, uResolution.y), 1.0);
  aa = clamp(aa, 0.75, 2.0);
  float mask = softMask(d, aa);

  // Outside glass — pure background pass-through.
  vec3 bg = texture(uBackground, vUv).rgb;
  if (mask <= 0.001) {
    fragColor = vec4(bg, 1.0);
    return;
  }

  vec2 texel = 1.0 / max(uResolution, vec2(1.0));

  // =========================================================================
  // 1) Adaptive soft contact shadow (under glass, over background)
  // =========================================================================
  float shadowBlur = max(uShadowBlurPx, 1.0);
  vec2 shadowOff = uShadowOffsetPx;
  // If offset unset, derive a mild cast from legacy light XY.
  if (dot(shadowOff, shadowOff) < 1e-4) {
    vec3 Lfallback = normalize(uLightDir);
    float xyLen = max(length(Lfallback.xy), 1e-3);
    shadowOff = -Lfallback.xy / xyLen * 3.0;
  }
  float dShadow = sdRoundedBox(p - shadowOff, halfSize, radius);
  float shadowBase = shadowBaseForVariant(uVariant, uShadowBase);
  float shadow = evaluateAdaptiveShadow(
    dShadow,
    uBackground,
    vUv,
    texel,
    shadowBlur,
    shadowBase
  );
  // Soften shadow with materialize so fade-in doesn't slam AO first.
  shadow *= uMaterialize;
  vec3 shadowedBg = applyContactShadow(bg, shadow * mask);

  // =========================================================================
  // 2) Surface normals (bevel + optional pointer parallax)
  // =========================================================================
  float bevelPx = max(uBevel, 1.0);
  vec3 N = bevelNormal(p, halfSize, radius, bevelPx, uCornerN);

  // Optional pointer parallax: gently bias normals toward cursor (subtle).
  vec2 toPtr = (uPointer - center) / max(min(halfSize.x, halfSize.y), 1.0);
  N = normalize(N + vec3(toPtr * 0.04 * uMaterialize, 0.0));

  // =========================================================================
  // 3) Motion-linked key light (device tilt → Apple specular response)
  // =========================================================================
  vec3 keyBase = length(uKeyDir) > 0.01 ? uKeyDir : uLightDir;
  vec3 keyDir = lightDirFromTilt(keyBase, uDeviceTilt);
  vec3 keyColor = length(uKeyColor) > 0.01 ? uKeyColor : vec3(1.0, 0.96, 0.9);
  vec3 fillDir = length(uFillDir) > 0.01 ? normalize(uFillDir) : normalize(vec3(-0.55, -0.25, 0.65));
  vec3 fillColor = length(uFillColor) > 0.01 ? uFillColor : vec3(0.72, 0.82, 1.0);
  vec3 rimDir = length(uRimDir) > 0.01 ? normalize(uRimDir) : normalize(vec3(-0.25, 0.55, -0.35));
  vec3 rimColor = length(uRimColor) > 0.01 ? uRimColor : vec3(0.85, 0.92, 1.0);

  // Variant-aware roughness / intensities with uniform overrides.
  float roughness = uRoughness > 1e-5
    ? uRoughness
    : mix(0.28, 0.12, clamp(uVariant, 0.0, 1.0));
  float specIntensity = uSpecularIntensity > 1e-5
    ? uSpecularIntensity
    : mix(0.85, 1.05, clamp(uVariant, 0.0, 1.0));
  float rimStr = uRimStrength > 1e-5
    ? uRimStrength
    : mix(0.42, 0.32, clamp(uVariant, 0.0, 1.0));
  float envStr = uEnvStrength > 1e-5
    ? uEnvStrength
    : mix(0.18, 0.28, clamp(uVariant, 0.0, 1.0));
  float envSpread = uEnvSpread > 1e-5 ? uEnvSpread : mix(0.04, 0.055, clamp(uVariant, 0.0, 1.0));
  float causticAmt = uCausticAmount > 1e-5
    ? uCausticAmount
    : mix(0.55, 0.38, clamp(uVariant, 0.0, 1.0));

  // =========================================================================
  // 4) Lensing path length (thickness × materialize)
  // =========================================================================
  // Apple fades Liquid Glass by dialing light-bending down, not by opacity.
  float lens = lensStrengthFromThickness(uThickness, uMaterialize);
  // Convert to UV-space path: ~14 px max lateral walk at full strength.
  float minDim = max(min(uResolution.x, uResolution.y), 1.0);
  float pathUv = (14.0 * lens) / minDim;

  // =========================================================================
  // 5) Chromatic refraction + frosted transmission
  // =========================================================================
  mat3 uvRGB = refractUVChromaticMat(vUv, N, uIOR, pathUv, uDispersion);
  vec2 uvR = uvRGB[0].xy;
  vec2 uvG = uvRGB[1].xy;
  vec2 uvB = uvRGB[2].xy;

  float frostAmt = frostForVariant(uVariant) * uMaterialize;
  // Clear keeps a hair of blur so edges don't ring; Regular is medium.
  float blurUv = uBlur * mix(1.0, 0.35, clamp(uVariant, 0.0, 1.0));
  vec3 refracted = frostedSampleRGB(
    uBackground,
    uvR, uvG, uvB,
    blurUv,
    uThickness,
    frostAmt
  );

  // =========================================================================
  // 6) Caustic boost near bevel (cylindrical lens focusing)
  // =========================================================================
  float fromRim = max(-d, 0.0);
  float caustic = causticConcentration(fromRim, bevelPx, N);
  refracted = applyCausticBoost(refracted, caustic, causticAmt * uMaterialize);

  // =========================================================================
  // 7) Fresnel reflection + 3-point specular + env + rim
  // =========================================================================
  vec3 specularLayer = evaluateSpecularLayer(
    uBackground,
    vUv,
    N,
    keyDir, keyColor,
    fillDir, fillColor,
    rimDir, rimColor,
    roughness,
    specIntensity,
    rimStr,
    envStr,
    envSpread,
    uMaterialize
  );
  // Very slight time shimmer on the specular (presence, not noise).
  float shimmer = 0.5 + 0.5 * sin(uTime * 1.7 + d * 0.15);
  specularLayer *= mix(0.92, 1.05, shimmer);

  // =========================================================================
  // 8) Tint
  // =========================================================================
  vec3 glass = refracted + specularLayer;
  glass = mix(glass, glass * uTint.rgb, clamp(uTint.a, 0.0, 1.0));

  // =========================================================================
  // 9) AA mask: shadowed background → glass interior
  // =========================================================================
  // Materialize does NOT fade alpha — when lens≈0 the refracted UVs ≈ vUv
  // so the surface naturally settles into the backdrop.
  vec3 color = mix(shadowedBg, glass, mask);

  fragColor = vec4(color, 1.0);
}
`;

export default liquidGlassFragSource;
