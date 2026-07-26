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

/** Glossy candy jelly — clearcoat + sheen + mild anisotropy for wet plastic read. */
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
  }> = {},
): THREE.MeshPhysicalMaterial {
  const sheenColor = new THREE.Color(color).offsetHSL(0.02, 0.05, 0.12);
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.22,
    metalness: opts.metalness ?? 0.04,
    clearcoat: opts.clearcoat ?? 1.0,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.14,
    sheen: opts.sheen ?? 0.85,
    sheenRoughness: opts.sheenRoughness ?? 0.32,
    sheenColor,
    anisotropy: opts.anisotropy ?? 0.55,
    anisotropyRotation: 0.35,
    reflectivity: 0.88,
    envMapIntensity: 1.35,
    emissive: color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.07,
  });
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

/** Procedural candy-stadium materials — glossy jelly + chalk platforms. */
export class MaterialLibrary {
  private readonly stripeHot = makeStripeTexture("#0a0608", "#ff4d7a", 18);
  private readonly stripeWarn = makeStripeTexture("#120e04", "#ffd24a", 20);
  private readonly conveyorMap = makeConveyorTexture();

  readonly jellyPink = jellyMat(Palette.platform, {
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    sheen: 0.95,
    anisotropy: 0.62,
    emissiveIntensity: 0.08,
  });
  readonly jellyCyan = jellyMat(Palette.platformAlt, {
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    sheen: 0.9,
    anisotropy: 0.58,
    emissiveIntensity: 0.07,
  });
  readonly jellyLime = jellyMat(Palette.lime, {
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
    sheen: 0.88,
    anisotropy: 0.5,
    emissiveIntensity: 0.04,
  });
  /** Hot hazard — emissive boosted for UnrealBloom. */
  readonly hazard = softMat(0xffffff, {
    roughness: 0.24,
    metalness: 0.26,
    map: this.stripeHot,
    emissive: Palette.hazard,
    emissiveMap: this.stripeHot,
    emissiveIntensity: 2.15,
  });
  readonly hazardWarn = softMat(0xffffff, {
    roughness: 0.26,
    metalness: 0.2,
    map: this.stripeWarn,
    emissive: Palette.sun,
    emissiveMap: this.stripeWarn,
    emissiveIntensity: 1.95,
  });
  readonly metal = softMat(Palette.metal, {
    roughness: 0.22,
    metalness: 0.9,
  });
  readonly wood = softMat(Palette.wood, {
    roughness: 0.68,
    metalness: 0.04,
  });
  readonly finish = jellyMat(Palette.sun, {
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    sheen: 1,
    anisotropy: 0.4,
    emissiveIntensity: 0.42,
    metalness: 0.1,
  });
  readonly water = new THREE.MeshPhysicalMaterial({
    color: Palette.water,
    roughness: 0.06,
    metalness: 0.35,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    transparent: true,
    opacity: 0.72,
    transmission: 0.15,
    thickness: 1.2,
  });
  /** Contrasting rim lip on pads. */
  readonly rim = softMat(0xffe8c0, {
    roughness: 0.28,
    metalness: 0.22,
    emissive: 0xffc878,
    emissiveIntensity: 0.48,
  });
  /** Darker underside skirt — reads thickness without a second light pass. */
  readonly underside = softMat(0x0c181c, {
    roughness: 0.88,
    metalness: 0.08,
    emissive: Palette.deepTeal,
    emissiveIntensity: 0.08,
  });
  readonly trim = softMat(0xf2f6f8, {
    roughness: 0.36,
    metalness: 0.12,
    emissive: 0xffffff,
    emissiveIntensity: 0.22,
  });
  readonly neonLime = softMat(Palette.lime, {
    roughness: 0.1,
    metalness: 0.45,
    emissive: Palette.lime,
    emissiveIntensity: 3.35,
  });
  readonly neonHot = softMat(Palette.hot, {
    roughness: 0.1,
    metalness: 0.45,
    emissive: Palette.hot,
    emissiveIntensity: 3.4,
  });
  readonly neonCyan = softMat(Palette.teal, {
    roughness: 0.12,
    metalness: 0.42,
    emissive: Palette.teal,
    emissiveIntensity: 3.2,
  });
  readonly conveyor = softMat(0xffffff, {
    roughness: 0.48,
    metalness: 0.26,
    map: this.conveyorMap,
    emissive: Palette.teal,
    emissiveIntensity: 0.7,
  });
  readonly safe = jellyMat(Palette.safe, {
    roughness: 0.26,
    clearcoat: 0.85,
    clearcoatRoughness: 0.2,
    sheen: 0.7,
    anisotropy: 0.35,
    emissiveIntensity: 0.28,
  });
  /** Matte rubber / candy shell for hammer heads & roller tips. */
  readonly rubberHot = softMat(Palette.hot, {
    roughness: 0.52,
    metalness: 0.06,
    emissive: Palette.hot,
    emissiveIntensity: 0.4,
  });
  readonly rubberCyan = softMat(Palette.teal, {
    roughness: 0.5,
    metalness: 0.06,
    emissive: Palette.teal,
    emissiveIntensity: 0.35,
  });
  readonly rubberLime = softMat(Palette.lime, {
    roughness: 0.48,
    metalness: 0.05,
    emissive: Palette.lime,
    emissiveIntensity: 0.38,
  });
  readonly bannerHot = softMat(Palette.hot, {
    roughness: 0.4,
    metalness: 0.08,
    emissive: Palette.hot,
    emissiveIntensity: 1.15,
    side: THREE.DoubleSide,
  });
  readonly bannerLime = softMat(Palette.lime, {
    roughness: 0.4,
    metalness: 0.08,
    emissive: Palette.lime,
    emissiveIntensity: 1.15,
    side: THREE.DoubleSide,
  });

  constructor() {
    this.hazard.map?.repeat.set(3.2, 1.4);
    this.hazard.emissiveMap?.repeat.set(3.2, 1.4);
    this.hazardWarn.map?.repeat.set(2.8, 1.25);
    this.hazardWarn.emissiveMap?.repeat.set(2.8, 1.25);
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
