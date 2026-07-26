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
  }> = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.42,
    metalness: opts.metalness ?? 0.08,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: opts.flatShading ?? false,
  });
}

/** Procedural candy-stadium materials — glossy jelly + chalk platforms. */
export class MaterialLibrary {
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
  readonly hazard = softMat(Palette.hazard, {
    roughness: 0.35,
    metalness: 0.15,
    emissive: Palette.hazard,
    emissiveIntensity: 0.35,
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

  dispose(): void {
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
