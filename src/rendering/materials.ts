import {
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Texture,
} from "three";
import {
  acousticCeilingTile,
  concreteFloor,
  dampCarpet,
  disposeTextureSet,
  fluorescentDiffuser,
  hotelCarpet,
  hotelWallpaper,
  hotelWood,
  stainedWallpaper,
  warehouseMetal,
  configureRepeat,
  type ProceduralTextureSet,
} from "./textures";

export type LevelMaterialPack = {
  wall: MeshStandardMaterial;
  floor: MeshStandardMaterial;
  ceiling: MeshStandardMaterial;
  accent?: MeshStandardMaterial;
  trim?: MeshStandardMaterial;
  dispose: () => void;
};

interface SharedMaps {
  map: Texture;
  roughnessMap: Texture;
  normalMap: Texture;
  aoMap?: Texture;
}

function applyMaps(
  mat: MeshStandardMaterial | MeshPhysicalMaterial,
  maps: SharedMaps,
  opts: {
    color?: number;
    roughness?: number;
    metalness?: number;
    envMapIntensity?: number;
    normalScale?: number;
    aoMapIntensity?: number;
  } = {},
): void {
  mat.map = maps.map;
  mat.roughnessMap = maps.roughnessMap;
  mat.normalMap = maps.normalMap;
  if (maps.aoMap) {
    mat.aoMap = maps.aoMap;
    mat.aoMapIntensity = opts.aoMapIntensity ?? 0.85;
  }
  mat.color = new Color(opts.color ?? 0xffffff);
  mat.roughness = opts.roughness ?? 1;
  mat.metalness = opts.metalness ?? 0;
  mat.envMapIntensity = opts.envMapIntensity ?? 0.15;
  if (opts.normalScale !== undefined) {
    mat.normalScale.set(opts.normalScale, opts.normalScale);
  }
  mat.needsUpdate = true;
}

function fromSet(
  set: ProceduralTextureSet,
  repeatX: number,
  repeatY: number,
): SharedMaps {
  configureRepeat(set, repeatX, repeatY);
  return {
    map: set.map,
    roughnessMap: set.roughnessMap,
    normalMap: set.normalMap,
    aoMap: set.aoMap,
  };
}

/** Classic Kane Pixel yellow drywall — sickly warm, stained, never clean. */
export function createBackroomsWallMaterial(): MeshStandardMaterial {
  const set = stainedWallpaper({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "backrooms-wall" });
  applyMaps(mat, fromSet(set, 2.5, 2.5), {
    color: 0xd4c48a,
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.08,
    normalScale: 0.55,
    aoMapIntensity: 0.7,
  });
  attachDisposable(mat, set);
  return mat;
}

export function createBackroomsCeilingMaterial(): MeshStandardMaterial {
  const set = acousticCeilingTile({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "backrooms-ceiling" });
  applyMaps(mat, fromSet(set, 4, 4), {
    color: 0xc4b47a,
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.05,
    normalScale: 0.85,
    aoMapIntensity: 1.0,
  });
  attachDisposable(mat, set);
  return mat;
}

export function createBackroomsCarpetMaterial(): MeshStandardMaterial {
  const set = dampCarpet({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "backrooms-carpet" });
  applyMaps(mat, fromSet(set, 6, 6), {
    color: 0xa89968,
    roughness: 0.98,
    metalness: 0,
    envMapIntensity: 0.04,
    normalScale: 1.1,
    aoMapIntensity: 0.9,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Mart polished concrete — cooler, slight reflection via low roughness. */
export function createMartConcreteMaterial(): MeshPhysicalMaterial {
  const set = concreteFloor({ size: 512 });
  const mat = new MeshPhysicalMaterial({
    name: "mart-concrete",
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
    reflectivity: 0.35,
  });
  applyMaps(mat, fromSet(set, 8, 8), {
    color: 0x9a9ca0,
    roughness: 0.32,
    metalness: 0.08,
    envMapIntensity: 0.45,
    normalScale: 0.4,
    aoMapIntensity: 0.5,
  });
  attachDisposable(mat, set);
  return mat;
}

export function createMartWallMaterial(): MeshStandardMaterial {
  const set = concreteFloor({ size: 256 });
  const mat = new MeshStandardMaterial({ name: "mart-wall" });
  applyMaps(mat, fromSet(set, 3, 3), {
    color: 0xc8ccd0,
    roughness: 0.78,
    metalness: 0.02,
    envMapIntensity: 0.2,
    normalScale: 0.25,
  });
  attachDisposable(mat, set);
  return mat;
}

export function createMartShelfMaterial(): MeshStandardMaterial {
  const set = warehouseMetal({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "mart-shelf" });
  applyMaps(mat, fromSet(set, 1, 3), {
    color: 0xb0b4bc,
    roughness: 0.48,
    metalness: 0.72,
    envMapIntensity: 0.35,
    normalScale: 0.65,
  });
  attachDisposable(mat, set);
  return mat;
}

export function createMartCeilingMaterial(): MeshStandardMaterial {
  const set = acousticCeilingTile({ size: 256 });
  const mat = new MeshStandardMaterial({ name: "mart-ceiling" });
  applyMaps(mat, fromSet(set, 6, 6), {
    color: 0xb8bcc0,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.12,
    normalScale: 0.7,
  });
  attachDisposable(mat, set);
  return mat;
}

export function createHotelWallMaterial(): MeshStandardMaterial {
  const set = hotelWallpaper({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "hotel-wall" });
  applyMaps(mat, fromSet(set, 2, 2), {
    color: 0xe4dac8,
    roughness: 0.82,
    metalness: 0,
    envMapIntensity: 0.12,
    normalScale: 0.35,
    aoMapIntensity: 0.55,
  });
  attachDisposable(mat, set);
  return mat;
}

export function createHotelCarpetMaterial(): MeshStandardMaterial {
  const set = hotelCarpet({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "hotel-carpet" });
  applyMaps(mat, fromSet(set, 5, 5), {
    color: 0x948470,
    roughness: 0.96,
    metalness: 0,
    envMapIntensity: 0.06,
    normalScale: 0.95,
    aoMapIntensity: 0.8,
  });
  attachDisposable(mat, set);
  return mat;
}

export function createHotelCeilingMaterial(): MeshStandardMaterial {
  const set = hotelWallpaper({ size: 256 });
  const mat = new MeshStandardMaterial({ name: "hotel-ceiling" });
  applyMaps(mat, fromSet(set, 1, 1), {
    color: 0xf0e8dc,
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.1,
    normalScale: 0.15,
  });
  attachDisposable(mat, set);
  return mat;
}

export function createHotelWoodMaterial(): MeshStandardMaterial {
  const set = hotelWood({ size: 256 });
  const mat = new MeshStandardMaterial({ name: "hotel-wood" });
  applyMaps(mat, fromSet(set, 2, 1), {
    color: 0x5a3a28,
    roughness: 0.58,
    metalness: 0.05,
    envMapIntensity: 0.25,
    normalScale: 0.5,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Brass / dark metal accent for hotel door plates / rails. */
export function createHotelBrassMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    name: "hotel-brass",
    color: new Color(0x8a7040),
    roughness: 0.42,
    metalness: 0.85,
    envMapIntensity: 0.4,
  });
  return mat;
}

/** Emissive fluorescent panel material (green-white). */
export function createFluorescentPanelMaterial(
  intensity = 1.35,
): MeshStandardMaterial {
  const map = fluorescentDiffuser({ size: 128 });
  const mat = new MeshStandardMaterial({
    name: "fluorescent-panel",
    map,
    color: new Color(0xe8f0e0),
    emissive: new Color(0xd8ead0),
    emissiveIntensity: intensity,
    emissiveMap: map,
    roughness: 0.65,
    metalness: 0,
    toneMapped: false,
  });
  return mat;
}

/** Cooler mart fluorescent — blue-white. */
export function createMartFluorescentMaterial(
  intensity = 1.6,
): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    name: "mart-fluorescent",
    color: new Color(0xe8f0f8),
    emissive: new Color(0xc8e0f0),
    emissiveIntensity: intensity,
    roughness: 0.55,
    metalness: 0,
    toneMapped: false,
  });
  return mat;
}

/** Soft warm cove / recessed hotel light. */
export function createHotelCoveMaterial(
  intensity = 0.9,
): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    name: "hotel-cove",
    color: new Color(0xfff0dc),
    emissive: new Color(0xffe4c4),
    emissiveIntensity: intensity,
    roughness: 0.7,
    metalness: 0,
    toneMapped: false,
  });
  return mat;
}

export function createBackroomsMaterialPack(): LevelMaterialPack {
  const wall = createBackroomsWallMaterial();
  const floor = createBackroomsCarpetMaterial();
  const ceiling = createBackroomsCeilingMaterial();
  return {
    wall,
    floor,
    ceiling,
    dispose: () => {
      disposeMaterial(wall);
      disposeMaterial(floor);
      disposeMaterial(ceiling);
    },
  };
}

export function createMartMaterialPack(): LevelMaterialPack {
  const wall = createMartWallMaterial();
  const floor = createMartConcreteMaterial();
  const ceiling = createMartCeilingMaterial();
  const accent = createMartShelfMaterial();
  return {
    wall,
    floor,
    ceiling,
    accent,
    dispose: () => {
      disposeMaterial(wall);
      disposeMaterial(floor);
      disposeMaterial(ceiling);
      disposeMaterial(accent);
    },
  };
}

export function createHotelMaterialPack(): LevelMaterialPack {
  const wall = createHotelWallMaterial();
  const floor = createHotelCarpetMaterial();
  const ceiling = createHotelCeilingMaterial();
  const trim = createHotelWoodMaterial();
  const accent = createHotelBrassMaterial();
  return {
    wall,
    floor,
    ceiling,
    trim,
    accent,
    dispose: () => {
      disposeMaterial(wall);
      disposeMaterial(floor);
      disposeMaterial(ceiling);
      disposeMaterial(trim);
      disposeMaterial(accent);
    },
  };
}

const TEXTURE_SET_KEY = "__thresholdTextureSet";

type DisposableMat = MeshStandardMaterial & {
  [TEXTURE_SET_KEY]?: ProceduralTextureSet;
};

function attachDisposable(
  mat: MeshStandardMaterial,
  set: ProceduralTextureSet,
): void {
  (mat as DisposableMat)[TEXTURE_SET_KEY] = set;
}

export function disposeMaterial(mat: MeshStandardMaterial): void {
  const tagged = mat as DisposableMat;
  const set = tagged[TEXTURE_SET_KEY];
  if (set) {
    disposeTextureSet(set);
    delete tagged[TEXTURE_SET_KEY];
  } else {
    mat.map?.dispose();
    mat.roughnessMap?.dispose();
    mat.normalMap?.dispose();
    mat.aoMap?.dispose();
    mat.emissiveMap?.dispose();
  }
  mat.dispose();
}
