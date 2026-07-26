/**
 * GLSL ES 3.00 adaptive contact-shadow primitives for Apple Liquid Glass.
 *
 * WWDC cue: shadows deepen over busy/dark text-like contrast and lighten
 * over flat light backgrounds so glass stays readable without muddy halos.
 */

export const SHADOW_CONSTANTS_GLSL = /* glsl */ `
const float LG_SHADOW_EPS = 1e-4;
`;

/**
 * Soft contact shadow + adaptive opacity from background luminance/contrast.
 */
export const SHADOW_GLSL = /* glsl */ `
// --- Luminance / contrast helpers ------------------------------------------

float shadowLuminance(vec3 c) {
  // Rec. 709
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

/**
 * Estimate local contrast under the glass by sampling a tiny cross around uv.
 * High contrast ≈ text / busy UI → deepen shadow for legibility.
 */
float backgroundContrast(sampler2D tex, vec2 uv, vec2 texel) {
  vec3 c0 = texture(tex, uv).rgb;
  vec3 c1 = texture(tex, clamp(uv + vec2(texel.x, 0.0), 0.0, 1.0)).rgb;
  vec3 c2 = texture(tex, clamp(uv - vec2(texel.x, 0.0), 0.0, 1.0)).rgb;
  vec3 c3 = texture(tex, clamp(uv + vec2(0.0, texel.y), 0.0, 1.0)).rgb;
  vec3 c4 = texture(tex, clamp(uv - vec2(0.0, texel.y), 0.0, 1.0)).rgb;

  float l0 = shadowLuminance(c0);
  float l1 = shadowLuminance(c1);
  float l2 = shadowLuminance(c2);
  float l3 = shadowLuminance(c3);
  float l4 = shadowLuminance(c4);

  float mean = (l0 + l1 + l2 + l3 + l4) * 0.2;
  float varAcc =
      (l0 - mean) * (l0 - mean) +
      (l1 - mean) * (l1 - mean) +
      (l2 - mean) * (l2 - mean) +
      (l3 - mean) * (l3 - mean) +
      (l4 - mean) * (l4 - mean);
  // Scale so typical UI text contrast lands ~0.4–0.9.
  return clamp(sqrt(varAcc * 0.2) * 4.5, 0.0, 1.0);
}

/**
 * adaptiveShadowStrength — increase over dark / high-contrast content,
 * decrease over flat light backgrounds.
 *
 * bgColor  representative background under glass
 * base     variant base opacity (Regular > Clear)
 * contrast optional precomputed local contrast [0,1]; pass <0 to skip
 */
float adaptiveShadowStrength(vec3 bgColor, float base) {
  float lum = shadowLuminance(bgColor);
  // Light flat bg → weaken; dark bg → strengthen.
  float lumFactor = mix(1.35, 0.45, smoothstep(0.15, 0.85, lum));
  return clamp(base * lumFactor, 0.0, 1.0);
}

/**
 * Same as adaptiveShadowStrength but folds in local contrast (text-like).
 */
float adaptiveShadowStrengthEx(vec3 bgColor, float base, float contrast) {
  float s = adaptiveShadowStrength(bgColor, base);
  // Busy/text regions deepen the contact shadow for readability.
  float contrastBoost = mix(0.85, 1.4, clamp(contrast, 0.0, 1.0));
  return clamp(s * contrastBoost, 0.0, 1.0);
}

// --- Soft contact shadow ---------------------------------------------------

/**
 * Soft elliptical contact shadow under the glass silhouette.
 *
 * d           signed distance to glass (px); <0 inside
 * offsetPx    shadow cast offset in px (typically light-aligned)
 * blurPx      soft penumbra width
 * strength    final opacity multiplier (already adaptive)
 *
 * Returns shadow darkness in [0,1] (1 = fully darkened).
 */
float softContactShadow(float d, vec2 offsetPx, float blurPx, float strength) {
  // Evaluate SDF at a light-shifted position so the shadow sits "under".
  // Caller passes d already measured at (p - offset); this overload takes
  // a pre-offset distance for flexibility.
  float blur = max(blurPx, 0.5);
  // Outside edge softens; interior is solid contact.
  float cover = 1.0 - smoothstep(-blur * 0.25, blur, d);
  return cover * clamp(strength, 0.0, 1.0);
}

/**
 * Full adaptive soft shadow sample.
 *
 * Samples background at uv for luminance, estimates contrast, then builds
 * a soft contact shadow using an offset SDF distance.
 *
 * dShadow     SDF at (fragPx - center - shadowOffset)
 * bg          background sampler
 * uv          current fragment UV (under glass)
 * texel       1/resolution
 * offsetPx    unused here (offset baked into dShadow) — kept for API clarity
 * blurPx      penumbra
 * baseStrength variant base (Regular ~0.22, Clear ~0.10)
 */
float evaluateAdaptiveShadow(
  float dShadow,
  sampler2D bg,
  vec2 uv,
  vec2 texel,
  float blurPx,
  float baseStrength
) {
  vec3 under = texture(bg, clamp(uv, 0.0, 1.0)).rgb;
  float contrast = backgroundContrast(bg, uv, texel);
  float strength = adaptiveShadowStrengthEx(under, baseStrength, contrast);
  return softContactShadow(dShadow, vec2(0.0), blurPx, strength);
}

/**
 * Apply shadow darkness onto a background color (pre-glass composite).
 */
vec3 applyContactShadow(vec3 bgColor, float shadow) {
  float s = clamp(shadow, 0.0, 1.0);
  // Slight cool lift in the umbra so it reads as ambient occlusion, not mud.
  vec3 umbra = bgColor * vec3(0.82, 0.84, 0.88);
  return mix(bgColor, umbra, s);
}
`;

/** Combined export for string concatenation into the fragment shader. */
export const SHADOW_SNIPPETS_GLSL = SHADOW_CONSTANTS_GLSL + SHADOW_GLSL;
