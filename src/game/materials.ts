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

/** Diagonal hazard stripes — high-contrast readable danger. */
function makeStripeTexture(
  a: string,
  b: string,
  stripeWidth = 18,
  size = 256,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = b;
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.translate(-size, -size);
  for (let x = -size; x < size * 2; x += stripeWidth * 2) {
    ctx.fillRect(x, 0, stripeWidth, size * 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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
  private readonly stripeHot = makeStripeTexture("#1a0a10", "#ff3d6e", 20);
  private readonly stripeWarn = makeStripeTexture("#1a1408", "#ffc857", 22);
  private readonly conveyorMap = makeConveyorTexture();

  readonly jellyPink = softMat(Palette.platform, {
    roughness: 0.28,
    metalness: 0.05,
    emissive: Palette.platform,
    emissiveIntensity: 0.08,
  });
  readonly jellyCyan = softMat(Palette.platformAlt, {
    roughness: 0.3,
    metalness: 0.06,
    emissive: Palette.platformAlt,
    emissiveIntensity: 0.06,
  });
  readonly jellyLime = softMat(Palette.lime, {
    roughness: 0.32,
    metalness: 0.04,
    emissive: Palette.lime,
    emissiveIntensity: 0.12,
  });
  readonly hazard = softMat(0xffffff, {
    roughness: 0.32,
    metalness: 0.18,
    map: this.stripeHot,
    emissive: Palette.hazard,
    emissiveMap: this.stripeHot,
    emissiveIntensity: 0.9,
  });
  readonly hazardWarn = softMat(0xffffff, {
    roughness: 0.34,
    metalness: 0.12,
    map: this.stripeWarn,
    emissive: Palette.sun,
    emissiveMap: this.stripeWarn,
    emissiveIntensity: 0.75,
  });
  readonly metal = softMat(Palette.metal, {
    roughness: 0.25,
    metalness: 0.85,
  });
  readonly wood = softMat(Palette.wood, {
    roughness: 0.72,
    metalness: 0.02,
  });
  readonly finish = softMat(Palette.sun, {
    roughness: 0.22,
    metalness: 0.2,
    emissive: Palette.sun,
    emissiveIntensity: 0.55,
  });
  readonly water = new THREE.MeshStandardMaterial({
    color: Palette.water,
    roughness: 0.15,
    metalness: 0.35,
    transparent: true,
    opacity: 0.82,
  });
  readonly trim = softMat(0xffffff, {
    roughness: 0.4,
    metalness: 0.1,
    emissive: 0xffffff,
    emissiveIntensity: 0.15,
  });
  readonly neonLime = softMat(Palette.lime, {
    roughness: 0.2,
    metalness: 0.35,
    emissive: Palette.lime,
    emissiveIntensity: 1.6,
  });
  readonly neonHot = softMat(Palette.hot, {
    roughness: 0.2,
    metalness: 0.35,
    emissive: Palette.hot,
    emissiveIntensity: 1.5,
  });
  readonly neonCyan = softMat(Palette.teal, {
    roughness: 0.22,
    metalness: 0.3,
    emissive: Palette.teal,
    emissiveIntensity: 1.45,
  });
  readonly conveyor = softMat(0xffffff, {
    roughness: 0.55,
    metalness: 0.2,
    map: this.conveyorMap,
    emissive: Palette.teal,
    emissiveIntensity: 0.28,
  });
  readonly safe = softMat(Palette.safe, {
    roughness: 0.35,
    metalness: 0.05,
    emissive: Palette.safe,
    emissiveIntensity: 0.22,
  });
  readonly bannerHot = softMat(Palette.hot, {
    roughness: 0.45,
    metalness: 0.05,
    emissive: Palette.hot,
    emissiveIntensity: 0.45,
    side: THREE.DoubleSide,
  });
  readonly bannerLime = softMat(Palette.lime, {
    roughness: 0.45,
    metalness: 0.05,
    emissive: Palette.lime,
    emissiveIntensity: 0.45,
    side: THREE.DoubleSide,
  });

  constructor() {
    this.hazard.map?.repeat.set(2.5, 1.2);
    this.hazard.emissiveMap?.repeat.set(2.5, 1.2);
    this.hazardWarn.map?.repeat.set(2.2, 1.1);
    this.hazardWarn.emissiveMap?.repeat.set(2.2, 1.1);
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
