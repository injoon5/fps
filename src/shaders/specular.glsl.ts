/**
 * GLSL ES 3.00 specular / Fresnel / caustic primitives for Apple Liquid Glass.
 *
 * WWDC cues:
 * - Specular responds to device motion (tilt shifts key light)
 * - Fresnel brightens at grazing angles (glass edge read)
 * - Bevel acts as a cylindrical lens → caustic concentration near rim
 * - Cheap env reflection samples background at reflected UV
 */

/** Dielectric F0 and lighting constants shared by specular helpers. */
export const SPECULAR_CONSTANTS_GLSL = /* glsl */ `
// Soda-lime / optical glass reflectance at normal incidence (~4%).
const float LG_F0_GLASS = 0.04;
const float LG_SPEC_EPS = 1e-4;
`;

/**
 * Fresnel Schlick, Blinn-Phong / GGX-ish specular, 3-point lights,
 * rim glow, environment reflection, caustics, motion-linked light.
 */
export const SPECULAR_GLSL = /* glsl */ `
// --- Fresnel ---------------------------------------------------------------

/**
 * Schlick approximation: F = F0 + (1 − F0) · (1 − cosθ)⁵
 * cosTheta = max(N·V, 0). F0 ≈ 0.04 for glass.
 */
float fresnelSchlick(float cosTheta, float F0) {
  float ct = clamp(cosTheta, 0.0, 1.0);
  float m = 1.0 - ct;
  float m2 = m * m;
  return F0 + (1.0 - F0) * m2 * m2 * m;
}

float fresnelGlass(float cosTheta) {
  return fresnelSchlick(cosTheta, LG_F0_GLASS);
}

// --- Motion-linked light (Apple device-tilt specular) ----------------------

/**
 * Shift a base light direction by device tilt (xy radians-ish / normalized).
 * Mirrors WWDC: specular highlight tracks orientation / environment.
 */
vec3 lightDirFromTilt(vec3 baseL, vec2 tilt) {
  // Tilt.x → yaw around Y, tilt.y → pitch around X (screen space).
  vec3 L = normalize(baseL);
  L.x += tilt.x * 0.55;
  L.y += tilt.y * 0.55;
  // Keep a minimum Z so lights never go fully behind the glass.
  L.z = max(L.z + abs(tilt.x) * 0.08 + abs(tilt.y) * 0.08, 0.15);
  return normalize(L);
}

// --- Microfacet-ish specular -----------------------------------------------

/**
 * Blinn-Phong lobe with a GGX-flavored softness remap.
 * roughness ∈ (0,1]: lower = sharper highlight (Clear glass).
 */
float specularBlinnGGX(vec3 N, vec3 V, vec3 L, float roughness) {
  vec3 Nn = normalize(N);
  vec3 Ln = normalize(L);
  vec3 H = normalize(Ln + V);
  float ndh = max(dot(Nn, H), 0.0);
  float ndl = max(dot(Nn, Ln), 0.0);

  // Remap roughness → Phong exponent (GGX-ish feel without full Smith).
  float r = max(roughness, 0.04);
  float a = r * r;
  float shininess = (2.0 / max(a * a, LG_SPEC_EPS)) - 2.0;
  shininess = clamp(shininess, 8.0, 512.0);

  float spec = pow(ndh, shininess);
  // Soft Fresnel-weighted energy so highlights don't blow the center.
  float F = fresnelSchlick(max(dot(H, V), 0.0), LG_F0_GLASS);
  return spec * F * ndl;
}

/**
 * Three-point specular: warm key + cool fill + rim.
 * Returns RGB specular contribution (already color-tinted per light).
 */
vec3 specularThreePoint(
  vec3 N,
  vec3 V,
  vec3 keyDir,
  vec3 keyColor,
  vec3 fillDir,
  vec3 fillColor,
  vec3 rimDir,
  vec3 rimColor,
  float roughness,
  float intensity
) {
  float key = specularBlinnGGX(N, V, keyDir, roughness);
  float fill = specularBlinnGGX(N, V, fillDir, mix(roughness, 1.0, 0.35));
  // Rim light: favor grazing — boost when N·V is low.
  float ndv = max(dot(normalize(N), V), 0.0);
  float rimWeight = pow(1.0 - ndv, 2.5);
  float rim = specularBlinnGGX(N, V, rimDir, mix(roughness, 0.55, 0.4)) * rimWeight;

  vec3 spec =
      keyColor * key * 1.0 +
      fillColor * fill * 0.45 +
      rimColor * rim * 0.85;
  return spec * intensity;
}

// --- Edge rim glow ---------------------------------------------------------

/**
 * Soft emissive rim that intensifies at grazing angles (Fresnel-driven).
 * Independent of discrete lights — sells the glass silhouette.
 */
float edgeRimGlow(vec3 N, vec3 V, float strength) {
  float ndv = max(dot(normalize(N), V), 0.0);
  float fres = fresnelSchlick(ndv, LG_F0_GLASS);
  // Extra power so only the outer bevel sings.
  float rim = pow(1.0 - ndv, 3.5);
  return (fres * 0.55 + rim * 0.85) * strength;
}

vec3 edgeRimColor(vec3 N, vec3 V, vec3 rimTint, float strength) {
  return rimTint * edgeRimGlow(N, V, strength);
}

// --- Cheap environment reflection ------------------------------------------

/**
 * Reflect view about N and sample background at a laterally shifted UV.
 * Not a cubemap — just enough env response for UI glass over content.
 */
vec3 envReflection(
  sampler2D tex,
  vec2 uv,
  vec3 N,
  float strength,
  float spread
) {
  vec3 Nn = normalize(N);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 R = reflect(-V, Nn);
  // Project reflection into screen UV (XY dominates).
  vec2 envUv = uv + R.xy * spread;
  envUv = clamp(envUv, 0.0, 1.0);
  vec3 env = texture(tex, envUv).rgb;
  // Slightly lift midtones so env reads as specular, not a copy of bg.
  env = mix(env, env * env * 1.15 + env * 0.15, 0.35);
  float fres = fresnelGlass(max(dot(Nn, V), 0.0));
  return env * fres * strength;
}

// --- Caustic concentration (bevel cylindrical lens) ------------------------

/**
 * Approximate light focusing near the bevel: a cylindrical lens brightens
 * transmitted light where curvature is highest (rim band, not flat center).
 *
 * fromRimPx  distance from rim toward interior (px), ≥0 inside
 * bevelPx    bevel width
 * N          surface normal (xy magnitude ≈ curvature proxy)
 */
float causticConcentration(float fromRimPx, float bevelPx, vec3 N) {
  float bevel = max(bevelPx, 1e-3);
  // Peak slightly inside the rim where a cylinder would focus.
  float focus = fromRimPx / bevel;
  // Gaussian-ish lobe centered ~0.35 into the bevel band.
  float lobe = exp(-pow((focus - 0.35) * 3.2, 2.0));
  // Curvature proxy: stronger tilt → stronger caustic.
  float curv = clamp(length(N.xy) * 1.8, 0.0, 1.0);
  // Kill caustics in the flat interior.
  float band = smoothstep(1.15, 0.05, focus);
  return lobe * curv * band;
}

/**
 * Boost transmitted RGB by caustic concentration.
 * Warm-white lift — Apple glass caustics are soft, not disco.
 */
vec3 applyCausticBoost(vec3 transmitted, float concentration, float amount) {
  float c = clamp(concentration * amount, 0.0, 1.5);
  // Prefer lifting toward white rather than saturating color.
  vec3 lift = mix(transmitted, vec3(1.0), 0.35);
  return transmitted + lift * c * 0.55;
}

// --- Full specular + Fresnel composite layer --------------------------------

/**
 * evaluateSpecularLayer — combined Fresnel reflection, 3-point specular,
 * rim glow, and cheap env sample. Call after transmission is ready.
 *
 * Returns additive RGB to composite over refracted glass.
 */
vec3 evaluateSpecularLayer(
  sampler2D bg,
  vec2 uv,
  vec3 N,
  vec3 keyDir,
  vec3 keyColor,
  vec3 fillDir,
  vec3 fillColor,
  vec3 rimDir,
  vec3 rimColor,
  float roughness,
  float specularIntensity,
  float rimStrength,
  float envStrength,
  float envSpread,
  float materialize
) {
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Nn = normalize(N);
  float ndv = max(dot(Nn, V), 0.0);
  float F = fresnelGlass(ndv);

  vec3 spec = specularThreePoint(
    Nn, V,
    keyDir, keyColor,
    fillDir, fillColor,
    rimDir, rimColor,
    roughness,
    specularIntensity
  );

  vec3 rim = edgeRimColor(Nn, V, mix(keyColor, rimColor, 0.5), rimStrength);
  vec3 env = envReflection(bg, uv, Nn, envStrength, envSpread);

  // Fresnel gates reflection/specular so the flat center stays calm.
  vec3 layer = spec * (0.35 + 0.65 * F) + rim + env;
  return layer * clamp(materialize, 0.0, 1.0);
}
`;

/** Combined export for string concatenation into the fragment shader. */
export const SPECULAR_SNIPPETS_GLSL =
  SPECULAR_CONSTANTS_GLSL + SPECULAR_GLSL;
