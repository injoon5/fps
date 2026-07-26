import {
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Texture,
} from "three";
import {
  acousticCeilingTile,
  asphaltStains,
  ballpitPlastic,
  beigeWallpaper,
  concreteFloor,
  dampCarpet,
  disposeTextureSet,
  dropCeilingTile,
  fluorescentDiffuser,
  garageConcrete,
  hotelCarpet,
  hotelWallpaper,
  hotelWood,
  officeCarpet,
  officeCubicleFabric,
  parkingLine,
  poolGroutWall,
  poolTile,
  primaryWallPanel,
  softPlayFoam,
  stainedFunCarpet,
  stainedWallpaper,
  warehouseMetal,
  wetConcrete,
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

/** Beige corporate drywall — flat, faintly striped, coffee-stained. */
export function createOfficeWallMaterial(): MeshStandardMaterial {
  const set = beigeWallpaper({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "office-wall" });
  applyMaps(mat, fromSet(set, 2.2, 2.2), {
    color: 0xc4baa4,
    roughness: 0.86,
    metalness: 0,
    envMapIntensity: 0.1,
    normalScale: 0.4,
    aoMapIntensity: 0.6,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Gray speckled corporate carpet. */
export function createOfficeCarpetMaterial(): MeshStandardMaterial {
  const set = officeCarpet({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "office-carpet" });
  applyMaps(mat, fromSet(set, 7, 7), {
    color: 0x767a76,
    roughness: 0.98,
    metalness: 0,
    envMapIntensity: 0.05,
    normalScale: 1.05,
    aoMapIntensity: 0.85,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Drop-ceiling acoustic tiles — cooler gray-white. */
export function createOfficeCeilingMaterial(): MeshStandardMaterial {
  const set = dropCeilingTile({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "office-ceiling" });
  applyMaps(mat, fromSet(set, 5, 5), {
    color: 0xc6c8c2,
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.08,
    normalScale: 0.8,
    aoMapIntensity: 0.95,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Cubicle partition fabric panels. */
export function createOfficeCubicleMaterial(): MeshStandardMaterial {
  const set = officeCubicleFabric({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "office-cubicle" });
  applyMaps(mat, fromSet(set, 1.5, 1.2), {
    color: 0xa8a294,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.08,
    normalScale: 0.7,
    aoMapIntensity: 0.55,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Sick cold green-white office fluorescent. */
export function createOfficeFluorescentMaterial(
  intensity = 1.45,
): MeshStandardMaterial {
  const map = fluorescentDiffuser({ size: 128 });
  const mat = new MeshStandardMaterial({
    name: "office-fluorescent",
    map,
    color: new Color(0xe4f0e2),
    emissive: new Color(0xc8e0c8),
    emissiveIntensity: intensity,
    emissiveMap: map,
    roughness: 0.62,
    metalness: 0,
    toneMapped: false,
  });
  return mat;
}

/** Padded foam wall — soft, scuffed, faded primary vinyl. */
export function createPlayplaceFoamMaterial(): MeshStandardMaterial {
  const set = softPlayFoam({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "playplace-foam" });
  applyMaps(mat, fromSet(set, 2.2, 2.2), {
    color: 0xe8d0c0,
    roughness: 0.86,
    metalness: 0,
    envMapIntensity: 0.08,
    normalScale: 0.7,
    aoMapIntensity: 0.75,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Faded primary laminate panels for soft-play shells. */
export function createPlayplaceWallMaterial(): MeshStandardMaterial {
  const set = primaryWallPanel({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "playplace-wall" });
  applyMaps(mat, fromSet(set, 1.8, 1.8), {
    color: 0xe0d0b8,
    roughness: 0.8,
    metalness: 0.02,
    envMapIntensity: 0.1,
    normalScale: 0.4,
    aoMapIntensity: 0.55,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Loud 90s geometric carpet — soda-stained and sun-faded. */
export function createPlayplaceCarpetMaterial(): MeshStandardMaterial {
  const set = stainedFunCarpet({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "playplace-carpet" });
  applyMaps(mat, fromSet(set, 5, 5), {
    color: 0xc8b898,
    roughness: 0.97,
    metalness: 0,
    envMapIntensity: 0.05,
    normalScale: 1.0,
    aoMapIntensity: 0.85,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Dingy acoustic tile ceiling over the party rooms. */
export function createPlayplaceCeilingMaterial(): MeshStandardMaterial {
  const set = acousticCeilingTile({ size: 256 });
  const mat = new MeshStandardMaterial({ name: "playplace-ceiling" });
  applyMaps(mat, fromSet(set, 5, 5), {
    color: 0xd0c4a0,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.08,
    normalScale: 0.75,
    aoMapIntensity: 0.9,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Glossy ball-pit / slide plastic. */
export function createPlayplacePlasticMaterial(): MeshPhysicalMaterial {
  const set = ballpitPlastic({ size: 256 });
  const mat = new MeshPhysicalMaterial({
    name: "playplace-plastic",
    clearcoat: 0.55,
    clearcoatRoughness: 0.35,
    reflectivity: 0.4,
  });
  applyMaps(mat, fromSet(set, 2, 2), {
    color: 0xf0e8e0,
    roughness: 0.32,
    metalness: 0.05,
    envMapIntensity: 0.4,
    normalScale: 0.45,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Dying party bulb / colored festoon — warm dingy emissive. */
export function createPlayplacePartyBulbMaterial(
  intensity = 1.1,
  color = 0xffcc88,
): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    name: "playplace-party-bulb",
    color: new Color(color),
    emissive: new Color(color),
    emissiveIntensity: intensity,
    roughness: 0.45,
    metalness: 0.1,
    toneMapped: false,
  });
  return mat;
}

/** Wet turquoise pool floor tile — shiny, slight clearcoat sheen. */
export function createPoolTileMaterial(): MeshPhysicalMaterial {
  const set = poolTile({ size: 512 });
  const mat = new MeshPhysicalMaterial({
    name: "pool-tile",
    clearcoat: 0.55,
    clearcoatRoughness: 0.18,
    reflectivity: 0.55,
    metalness: 0.1,
  });
  applyMaps(mat, fromSet(set, 10, 10), {
    color: 0x3aa8b5,
    roughness: 0.15,
    metalness: 0.1,
    envMapIntensity: 0.65,
    normalScale: 0.75,
    aoMapIntensity: 0.55,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Ceramic pool wall with white grout — humid, slightly reflective. */
export function createPoolGroutWallMaterial(): MeshPhysicalMaterial {
  const set = poolGroutWall({ size: 512 });
  const mat = new MeshPhysicalMaterial({
    name: "pool-grout-wall",
    clearcoat: 0.28,
    clearcoatRoughness: 0.35,
    reflectivity: 0.4,
  });
  applyMaps(mat, fromSet(set, 3.5, 4.5), {
    color: 0x2a8a96,
    roughness: 0.28,
    metalness: 0.06,
    envMapIntensity: 0.4,
    normalScale: 0.7,
    aoMapIntensity: 0.5,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Damp recessed concrete ceiling for pool halls. */
export function createPoolCeilingMaterial(): MeshStandardMaterial {
  const set = wetConcrete({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "pool-ceiling" });
  applyMaps(mat, fromSet(set, 5, 5), {
    color: 0xb0c0c4,
    roughness: 0.78,
    metalness: 0.04,
    envMapIntensity: 0.18,
    normalScale: 0.45,
    aoMapIntensity: 0.7,
  });
  attachDisposable(mat, set);
  return mat;
}

/**
 * Shallow basin water — translucent cyan with soft underwater emissive glow.
 * Visual only; place above a solid floor collider.
 */
export function createPoolWaterMaterial(): MeshPhysicalMaterial {
  const mat = new MeshPhysicalMaterial({
    name: "pool-water",
    color: new Color(0x2a9aaa),
    emissive: new Color(0x1a6070),
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.05,
    transmission: 0.72,
    thickness: 0.6,
    ior: 1.33,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: DoubleSide,
    envMapIntensity: 0.85,
  });
  return mat;
}

/** Cool cyan-white recessed pool light panel. */
export function createPoolroomsLightMaterial(
  intensity = 1.55,
): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    name: "poolrooms-light",
    color: new Color(0xe0f8fa),
    emissive: new Color(0xa8e8f0),
    emissiveIntensity: intensity,
    roughness: 0.45,
    metalness: 0,
    toneMapped: false,
  });
  return mat;
}

/** Pale cyan lane / curb accent tile. */
export function createPoolAccentMaterial(): MeshStandardMaterial {
  const set = poolTile({ size: 256 });
  const mat = new MeshStandardMaterial({ name: "pool-accent" });
  applyMaps(mat, fromSet(set, 4, 4), {
    color: 0x7ec8c8,
    roughness: 0.22,
    metalness: 0.12,
    envMapIntensity: 0.5,
    normalScale: 0.5,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Parking-garage wall / column concrete with drip stains. */
export function createGarageWallMaterial(): MeshStandardMaterial {
  const set = garageConcrete({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "garage-wall" });
  applyMaps(mat, fromSet(set, 2.5, 2.5), {
    color: 0x8a8478,
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.06,
    normalScale: 0.7,
    aoMapIntensity: 0.85,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Oil-stained asphalt parking deck. */
export function createGarageFloorMaterial(): MeshStandardMaterial {
  const set = asphaltStains({ size: 512 });
  const mat = new MeshStandardMaterial({ name: "garage-floor" });
  applyMaps(mat, fromSet(set, 7, 7), {
    color: 0x5a5650,
    roughness: 0.78,
    metalness: 0.04,
    envMapIntensity: 0.12,
    normalScale: 0.55,
    aoMapIntensity: 0.55,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Low concrete slab ceiling — darker, soot-shadowed. */
export function createGarageCeilingMaterial(): MeshStandardMaterial {
  const set = garageConcrete({ size: 256 });
  const mat = new MeshStandardMaterial({ name: "garage-ceiling" });
  applyMaps(mat, fromSet(set, 4, 4), {
    color: 0x6a645c,
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.04,
    normalScale: 0.5,
    aoMapIntensity: 0.9,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Faded yellow stall-line paint for floor decals. */
export function createGarageLineMaterial(): MeshStandardMaterial {
  const set = parkingLine({ size: 256 });
  const mat = new MeshStandardMaterial({ name: "garage-line" });
  applyMaps(mat, fromSet(set, 1, 8), {
    color: 0xd4b030,
    roughness: 0.68,
    metalness: 0.05,
    envMapIntensity: 0.15,
    normalScale: 0.35,
  });
  attachDisposable(mat, set);
  return mat;
}

/** Sodium-vapor orange fixture housing / emissive lens. */
export function createGarageSodiumMaterial(
  intensity = 1.45,
): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    name: "garage-sodium",
    color: new Color(0xffb060),
    emissive: new Color(0xff8a28),
    emissiveIntensity: intensity,
    roughness: 0.55,
    metalness: 0.15,
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

export function createPlayplaceMaterialPack(): LevelMaterialPack {
  const wall = createPlayplaceWallMaterial();
  const floor = createPlayplaceCarpetMaterial();
  const ceiling = createPlayplaceCeilingMaterial();
  const trim = createPlayplaceFoamMaterial();
  const accent = createPlayplacePlasticMaterial();
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

export function createPoolroomsMaterialPack(): LevelMaterialPack {
  const wall = createPoolGroutWallMaterial();
  const floor = createPoolTileMaterial();
  const ceiling = createPoolCeilingMaterial();
  const accent = createPoolAccentMaterial();
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

export function createOfficeMaterialPack(): LevelMaterialPack {
  const wall = createOfficeWallMaterial();
  const floor = createOfficeCarpetMaterial();
  const ceiling = createOfficeCeilingMaterial();
  const accent = createOfficeCubicleMaterial();
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

export function createGarageMaterialPack(): LevelMaterialPack {
  const wall = createGarageWallMaterial();
  const floor = createGarageFloorMaterial();
  const ceiling = createGarageCeilingMaterial();
  const accent = createGarageLineMaterial();
  const trim = createGarageWallMaterial();
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
      disposeMaterial(accent);
      disposeMaterial(trim);
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
