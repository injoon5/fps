import * as THREE from "three";
import { Palette } from "./config";

function softMat(
  color: number,
  opts: Partial<{
    roughness: number;
    metalness: number;
    emissive: number;
    emissiveIntensity: number;
    flatShading: boolean;
    map: THREE.Texture;
    emissiveMap: THREE.Texture;
    side: THREE.Side;
  }> = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.42,
    metalness: opts.metalness ?? 0.08,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: opts.flatShading ?? false,
    map: opts.map,
    emissiveMap: opts.emissiveMap,
    side: opts.side,
  });
}

/** Procedural vinyl micro-bump — soft noise normal for tactile plastic read. */
function makeVinylNormalMap(size = 256, strength = 1.15): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n1 =
        Math.sin(x * 0.11 + y * 0.07) * 0.45 +
        Math.sin(x * 0.31 - y * 0.19) * 0.28 +
        Math.sin((x + y) * 0.053) * 0.18;
      const n2 =
        Math.cos(x * 0.09 - y * 0.13) * 0.4 +
        Math.cos(x * 0.27 + y * 0.23) * 0.25;
      // Encode as tangent-space normal (Z-up in RGB)
      const nx = THREE.MathUtils.clamp(0.5 + n1 * 0.12 * strength, 0, 1);
      const ny = THREE.MathUtils.clamp(0.5 + n2 * 0.12 * strength, 0, 1);
      data[i] = Math.floor(nx * 255);
      data[i + 1] = Math.floor(ny * 255);
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Glossy candy jelly — vinyl clearcoat + sheen + subtle bump. */
function jellyMat(
  color: number,
  opts: Partial<{
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    sheen: number;
    sheenRoughness: number;
    anisotropy: number;
    emissiveIntensity: number;
    metalness: number;
    map: THREE.Texture;
    normalMap: THREE.Texture;
    normalScale: number;
  }> = {},
): THREE.MeshPhysicalMaterial {
  const sheenColor = new THREE.Color(color).offsetHSL(0.02, 0.05, 0.1);
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    map: opts.map,
    roughness: opts.roughness ?? 0.32,
    metalness: opts.metalness ?? 0.02,
    // Soft vinyl — high clearcoat + PMREM = single-pixel specular white flashes
    clearcoat: Math.min(opts.clearcoat ?? 0.35, 0.4),
    clearcoatRoughness: Math.max(opts.clearcoatRoughness ?? 0.45, 0.4),
    sheen: opts.sheen ?? 0.35,
    sheenRoughness: opts.sheenRoughness ?? 0.45,
    sheenColor,
    anisotropy: Math.min(opts.anisotropy ?? 0.15, 0.2),
    anisotropyRotation: 0.35,
    reflectivity: 0.22,
    envMapIntensity: 0.28,
    emissive: color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.015,
  });
  if (opts.normalMap) {
    mat.normalMap = opts.normalMap;
    mat.normalScale = new THREE.Vector2(
      opts.normalScale ?? 0.55,
      opts.normalScale ?? 0.55,
    );
  }
  return mat;
}

/** Chevron / arrow decal for pad tops — CanvasTexture plane. */
export function makeChevronDecalTexture(
  fill = "#ffc857",
  outline = "#1a1010",
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  const drawChevron = (oy: number, scale: number) => {
    ctx.save();
    ctx.translate(size / 2, size / 2 + oy);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, -58);
    ctx.lineTo(52, 8);
    ctx.lineTo(28, 8);
    ctx.lineTo(28, 48);
    ctx.lineTo(-28, 48);
    ctx.lineTo(-28, 8);
    ctx.lineTo(-52, 8);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.restore();
  };
  drawChevron(-28, 0.85);
  drawChevron(42, 0.72);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Soft candy chalk — breaks flat albedo so sun hits don't read as white plastic. */
function makeChalkTexture(tint: string, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % size;
    const y = Math.floor(i / 4 / size);
    const n =
      (((x * 13 + y * 37) % 17) - 8) * 1.6 +
      (((x * 7 + y * 3) % 9) - 4) * 0.9;
    data[i]! = Math.min(255, Math.max(0, data[i]! + n));
    data[i + 1]! = Math.min(255, Math.max(0, data[i + 1]! + n * 0.9));
    data[i + 2]! = Math.min(255, Math.max(0, data[i + 2]! + n * 0.85));
  }
  ctx.putImageData(img, 0, 0);
  // Soft mottles on top of micro-noise
  for (let k = 0; k < 48; k++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = 8 + Math.random() * 28;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,255,0.07)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * High-contrast diagonal hazard stripes — tiles cleanly for bloom-friendly danger.
 * Bright band + near-black band so emissiveMap punches through postprocessing.
 */
function makeStripeTexture(
  dark: string,
  bright: string,
  stripeWidth = 16,
  size = 512,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.translate(-size, -size);

  const period = stripeWidth * 2;
  for (let x = -size; x < size * 3; x += period) {
    // Soft edge on bright stripe for cleaner mip filtering
    const grad = ctx.createLinearGradient(x, 0, x + stripeWidth, 0);
    grad.addColorStop(0, bright);
    grad.addColorStop(0.92, bright);
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, stripeWidth, size * 4);
  }
  ctx.restore();

  // Micro grit so large tiles don't look flat
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 16) {
    const n = ((i * 17) % 13) - 6;
    data[i]! = Math.min(255, Math.max(0, data[i]! + n));
    data[i + 1]! = Math.min(255, Math.max(0, data[i + 1]! + n));
    data[i + 2]! = Math.min(255, Math.max(0, data[i + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Conveyor tread + chevron — reads as motion direction. */
function makeConveyorTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1a2a30";
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 16) {
    ctx.fillStyle = "#2ee6c0";
    ctx.fillRect(0, y, size, 5);
    ctx.fillStyle = "#ffc857";
    ctx.beginPath();
    ctx.moveTo(size * 0.35, y + 8);
    ctx.lineTo(size * 0.5, y + 2);
    ctx.lineTo(size * 0.65, y + 8);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(2, 4);
  tex.needsUpdate = true;
  return tex;
}

/** Procedural candy-stadium materials — glossy vinyl jelly + chalk platforms. */
export class MaterialLibrary {
  private readonly stripeHot = makeStripeTexture("#0a0608", "#ff4d7a", 18);
  private readonly stripeWarn = makeStripeTexture("#120e04", "#ffd24a", 20);
  private readonly conveyorMap = makeConveyorTexture();
  private readonly chalkPink = makeChalkTexture("#ff4d9a");
  private readonly chalkCyan = makeChalkTexture("#2ad8ff");
  private readonly chalkLime = makeChalkTexture("#8cf03a");
  private readonly chalkSafe = makeChalkTexture("#7aef38");
  private readonly chalkSun = makeChalkTexture("#ffc038");
  private readonly vinylNormal = makeVinylNormalMap(256, 1.2);
  readonly chevronDecal = makeChevronDecalTexture("#ffd24a", "#120808");
  readonly chevronHot = makeChevronDecalTexture("#ff2d6f", "#120808");
  readonly chevronLime = makeChevronDecalTexture("#9dff45", "#120808");

  readonly jellyPink = jellyMat(0xff4d9a, {
    roughness: 0.26,
    clearcoat: 0.94,
    clearcoatRoughness: 0.12,
    sheen: 0.55,
    anisotropy: 0.38,
    emissiveIntensity: 0.04,
    map: this.chalkPink,
    normalMap: this.vinylNormal,
    normalScale: 0.62,
  });
  readonly jellyCyan = jellyMat(0x2ad8ff, {
    roughness: 0.28,
    clearcoat: 0.92,
    clearcoatRoughness: 0.12,
    sheen: 0.55,
    anisotropy: 0.36,
    emissiveIntensity: 0.035,
    map: this.chalkCyan,
    normalMap: this.vinylNormal,
    normalScale: 0.58,
  });
  readonly jellyLime = jellyMat(0x8cf03a, {
    roughness: 0.3,
    clearcoat: 0.92,
    clearcoatRoughness: 0.12,
    sheen: 0.55,
    anisotropy: 0.32,
    emissiveIntensity: 0.03,
    map: this.chalkLime,
    normalMap: this.vinylNormal,
    normalScale: 0.55,
  });
  /** Hot hazard — emissive kept under bloom threshold so stripes stay readable. */
  readonly hazard = softMat(0xffffff, {
    roughness: 0.36,
    metalness: 0.14,
    map: this.stripeHot,
    emissive: Palette.hazard,
    emissiveMap: this.stripeHot,
    emissiveIntensity: 0.28,
  });
  readonly hazardWarn = softMat(0xffffff, {
    roughness: 0.38,
    metalness: 0.12,
    map: this.stripeWarn,
    emissive: Palette.sun,
    emissiveMap: this.stripeWarn,
    emissiveIntensity: 0.22,
  });
  readonly metal = softMat(Palette.metal, {
    roughness: 0.28,
    metalness: 0.85,
  });
  readonly wood = softMat(Palette.wood, {
    roughness: 0.72,
    metalness: 0.04,
  });
  readonly finish = jellyMat(0xffb020, {
    roughness: 0.28,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
    sheen: 0.5,
    anisotropy: 0.28,
    emissiveIntensity: 0.08,
    metalness: 0.06,
    map: this.chalkSun,
    normalMap: this.vinylNormal,
    normalScale: 0.32,
  });
  readonly water = new THREE.MeshPhysicalMaterial({
    color: Palette.water,
    roughness: 0.08,
    metalness: 0.3,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
    transparent: true,
    opacity: 0.72,
    transmission: 0.12,
    thickness: 1.2,
  });
  /** Contrasting rim lip on pads — warm edge, not a second bloom source. */
  readonly rim = softMat(0xe8b878, {
    roughness: 0.45,
    metalness: 0.12,
    emissive: 0xc88840,
    emissiveIntensity: 0.08,
  });
  /** Dark underside skirt — faux AO contact at pad bottoms. */
  readonly underside = softMat(0x020608, {
    roughness: 0.96,
    metalness: 0.02,
    emissive: 0x021018,
    emissiveIntensity: 0.01,
  });
  /** Soft contact blob under static pads (transparent black disc). */
  readonly blobShadow = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    fog: false,
  });
  /** Tighter contact core under pads. */
  readonly blobShadowCore = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: false,
  });
  /** Inflatable candy prop body. */
  readonly inflatableHot = jellyMat(0xff4d7a, {
    roughness: 0.24,
    clearcoat: 0.95,
    clearcoatRoughness: 0.12,
    sheen: 0.45,
    anisotropy: 0.2,
    emissiveIntensity: 0.02,
    normalMap: this.vinylNormal,
    normalScale: 0.28,
  });
  readonly inflatableCyan = jellyMat(0x2ec4d8, {
    roughness: 0.24,
    clearcoat: 0.95,
    clearcoatRoughness: 0.12,
    sheen: 0.45,
    anisotropy: 0.2,
    emissiveIntensity: 0.02,
    normalMap: this.vinylNormal,
    normalScale: 0.28,
  });
  readonly inflatableSun = jellyMat(0xffc857, {
    roughness: 0.26,
    clearcoat: 0.92,
    clearcoatRoughness: 0.14,
    sheen: 0.4,
    anisotropy: 0.18,
    emissiveIntensity: 0.025,
    normalMap: this.vinylNormal,
    normalScale: 0.26,
  });
  readonly coneWarn = softMat(0xff8a3a, {
    roughness: 0.48,
    metalness: 0.06,
    emissive: 0xff6a20,
    emissiveIntensity: 0.06,
  });
  readonly trim = softMat(0xc8d0d6, {
    roughness: 0.48,
    metalness: 0.08,
    emissive: 0xd8e0e8,
    emissiveIntensity: 0.03,
  });
  readonly neonLime = softMat(Palette.lime, {
    roughness: 0.28,
    metalness: 0.22,
    emissive: Palette.lime,
    emissiveIntensity: 0.45,
  });
  readonly neonHot = softMat(Palette.hot, {
    roughness: 0.28,
    metalness: 0.22,
    emissive: Palette.hot,
    emissiveIntensity: 0.48,
  });
  readonly neonCyan = softMat(Palette.teal, {
    roughness: 0.3,
    metalness: 0.2,
    emissive: Palette.teal,
    emissiveIntensity: 0.42,
  });
  readonly conveyor = softMat(0xd8f4f0, {
    roughness: 0.55,
    metalness: 0.1,
    map: this.conveyorMap,
    emissive: Palette.teal,
    emissiveIntensity: 0.12,
  });
  readonly safe = jellyMat(0x7aef38, {
    roughness: 0.28,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
    sheen: 0.5,
    anisotropy: 0.25,
    emissiveIntensity: 0.05,
    map: this.chalkSafe,
    normalMap: this.vinylNormal,
    normalScale: 0.32,
  });
  /** Matte rubber / candy shell for hammer heads & roller tips. */
  readonly rubberHot = softMat(Palette.hot, {
    roughness: 0.62,
    metalness: 0.03,
    emissive: Palette.hot,
    emissiveIntensity: 0.08,
  });
  readonly rubberCyan = softMat(Palette.teal, {
    roughness: 0.6,
    metalness: 0.03,
    emissive: Palette.teal,
    emissiveIntensity: 0.07,
  });
  readonly rubberLime = softMat(Palette.lime, {
    roughness: 0.58,
    metalness: 0.03,
    emissive: Palette.lime,
    emissiveIntensity: 0.07,
  });
  readonly bannerHot = softMat(Palette.hot, {
    roughness: 0.45,
    metalness: 0.04,
    emissive: Palette.hot,
    emissiveIntensity: 0.4,
    side: THREE.DoubleSide,
  });
  readonly bannerLime = softMat(Palette.lime, {
    roughness: 0.45,
    metalness: 0.04,
    emissive: Palette.lime,
    emissiveIntensity: 0.4,
    side: THREE.DoubleSide,
  });

  constructor() {
    this.hazard.map?.repeat.set(3.2, 1.4);
    this.hazard.emissiveMap?.repeat.set(3.2, 1.4);
    this.hazardWarn.map?.repeat.set(2.8, 1.25);
    this.hazardWarn.emissiveMap?.repeat.set(2.8, 1.25);
    this.chalkPink.repeat.set(2.4, 2.4);
    this.chalkCyan.repeat.set(2.2, 2.2);
    this.chalkLime.repeat.set(2.6, 2.6);
    this.chalkSafe.repeat.set(2.0, 2.0);
    this.chalkSun.repeat.set(2.2, 2.2);
    this.vinylNormal.repeat.set(3.5, 3.5);
  }

  /** Idle material juice (conveyor tread shimmer + jelly anisotropy drift). */
  update(t: number): void {
    if (this.conveyor.map) {
      this.conveyor.map.offset.x = (t * 0.15) % 1;
    }
    const drift = t * 0.35;
    this.jellyPink.anisotropyRotation = 0.35 + Math.sin(drift) * 0.2;
    this.jellyCyan.anisotropyRotation = 0.4 + Math.cos(drift * 0.9) * 0.18;
    this.jellyLime.anisotropyRotation = 0.3 + Math.sin(drift * 1.1) * 0.22;
    this.finish.anisotropyRotation = drift * 0.4;
  }

  dispose(): void {
    this.stripeHot.dispose();
    this.stripeWarn.dispose();
    this.conveyorMap.dispose();
    this.chalkPink.dispose();
    this.chalkCyan.dispose();
    this.chalkLime.dispose();
    this.chalkSafe.dispose();
    this.chalkSun.dispose();
    this.vinylNormal.dispose();
    this.chevronDecal.dispose();
    this.chevronHot.dispose();
    this.chevronLime.dispose();
    for (const mat of Object.values(this)) {
      if (mat instanceof THREE.Material) mat.dispose();
    }
  }
}

export function addRimLight(
  mesh: THREE.Mesh,
  color: number,
  intensity = 0.4,
): void {
  const mat = mesh.material;
  if (mat instanceof THREE.MeshStandardMaterial) {
    mat.emissive = new THREE.Color(color);
    mat.emissiveIntensity = intensity;
  }
}
