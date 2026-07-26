import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Scene,
  Vector3,
  type Object3D,
} from "three";
import {
  createFluorescentPanelMaterial,
  createHotelCoveMaterial,
  createMartFluorescentMaterial,
} from "./materials";
import type { LevelId } from "../types";

export interface FluorescentFixture {
  group: Group;
  panel: Mesh;
  light: PointLight;
  baseIntensity: number;
  phase: number;
  flickerAmount: number;
}

export interface FluorescentGridOptions {
  /** World-space origin of the grid (fixture centers). */
  origin?: Vector3;
  cols?: number;
  rows?: number;
  spacingX?: number;
  spacingZ?: number;
  height?: number;
  panelWidth?: number;
  panelDepth?: number;
  /** PointLight intensity at full brightness. */
  intensity?: number;
  distance?: number;
  decay?: number;
  color?: number;
  /** Level tint for emissive panel look. */
  profile?: LevelId;
  castShadow?: boolean;
}

export interface FlickerController {
  fixtures: FluorescentFixture[];
  /** Call each frame with elapsed seconds. */
  update: (dt: number, elapsed: number) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

export interface DoorGlowOptions {
  position: Vector3;
  width?: number;
  height?: number;
  color?: number;
  intensity?: number;
  /** Leak direction (unit); plane faces opposite. */
  normal?: Vector3;
}

const DEFAULT_FLUORO_COLOR = 0xdce8d4;
const MART_FLUORO_COLOR = 0xc8e4f4;
const HOTEL_COVE_COLOR = 0xffe8cc;

function panelMaterialFor(profile: LevelId, intensity: number): MeshStandardMaterial {
  switch (profile) {
    case "backrooms":
      return createFluorescentPanelMaterial(intensity);
    case "mart":
      return createMartFluorescentMaterial(intensity);
    case "hotel":
      return createHotelCoveMaterial(intensity);
    default: {
      const _exhaustive: never = profile;
      return _exhaustive;
    }
  }
}

function lightColorFor(profile: LevelId, override?: number): Color {
  if (override !== undefined) return new Color(override);
  switch (profile) {
    case "backrooms":
      return new Color(DEFAULT_FLUORO_COLOR);
    case "mart":
      return new Color(MART_FLUORO_COLOR);
    case "hotel":
      return new Color(HOTEL_COVE_COLOR);
    default: {
      const _exhaustive: never = profile;
      return _exhaustive;
    }
  }
}

/**
 * Single fluorescent strip: emissive rectangle + PointLight underneath.
 * Prefer this over RectAreaLight for renderer compatibility.
 */
export function createFluorescentFixture(
  options: {
    position?: Vector3;
    width?: number;
    depth?: number;
    intensity?: number;
    distance?: number;
    decay?: number;
    color?: number;
    profile?: LevelId;
    castShadow?: boolean;
  } = {},
): FluorescentFixture {
  const profile = options.profile ?? "backrooms";
  const width = options.width ?? 1.2;
  const depth = options.depth ?? 0.35;
  const intensity = options.intensity ?? 2.4;
  const distance = options.distance ?? 14;
  const decay = options.decay ?? 1.6;
  const position = options.position ?? new Vector3();

  const group = new Group();
  group.name = "fluorescent-fixture";
  group.position.copy(position);

  const geo = new PlaneGeometry(width, depth);
  const mat = panelMaterialFor(profile, profile === "mart" ? 1.7 : 1.35);
  const panel = new Mesh(geo, mat);
  panel.rotation.x = Math.PI / 2;
  panel.position.y = 0;
  panel.name = "fluoro-panel";
  group.add(panel);

  // Thin housing frame (dark)
  const frameGeo = new PlaneGeometry(width + 0.06, depth + 0.06);
  const frameMat = new MeshStandardMaterial({
    color: 0x3a3a32,
    roughness: 0.85,
    metalness: 0.2,
  });
  const frame = new Mesh(frameGeo, frameMat);
  frame.rotation.x = Math.PI / 2;
  frame.position.y = 0.01;
  frame.name = "fluoro-frame";
  group.add(frame);

  const light = new PointLight(
    lightColorFor(profile, options.color),
    intensity,
    distance,
    decay,
  );
  light.position.set(0, -0.08, 0);
  light.castShadow = options.castShadow ?? false;
  if (light.castShadow) {
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0008;
    light.shadow.radius = 3;
  }
  group.add(light);

  return {
    group,
    panel,
    light,
    baseIntensity: intensity,
    phase: Math.random() * Math.PI * 2,
    flickerAmount: 0.04 + Math.random() * 0.06,
  };
}

/**
 * Grid of overhead fluorescents parented under `parent`.
 * Returns a flicker controller for subtle / rare hard flickers.
 */
export function createFluorescentGrid(
  parent: Object3D,
  options: FluorescentGridOptions = {},
): FlickerController {
  const cols = options.cols ?? 4;
  const rows = options.rows ?? 4;
  const spacingX = options.spacingX ?? 4;
  const spacingZ = options.spacingZ ?? 4;
  const height = options.height ?? 2.85;
  const origin = options.origin ?? new Vector3(0, 0, 0);
  const profile = options.profile ?? "backrooms";
  const root = new Group();
  root.name = `fluoro-grid-${profile}`;
  parent.add(root);

  const fixtures: FluorescentFixture[] = [];
  const startX = origin.x - ((cols - 1) * spacingX) / 2;
  const startZ = origin.z - ((rows - 1) * spacingZ) / 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const uneven = (Math.random() - 0.5) * 0.35;
      const fixture = createFluorescentFixture({
        position: new Vector3(
          startX + col * spacingX,
          height,
          startZ + row * spacingZ,
        ),
        width: options.panelWidth ?? 1.25,
        depth: options.panelDepth ?? 0.38,
        intensity: (options.intensity ?? 2.2) + uneven,
        distance: options.distance ?? 12,
        decay: options.decay ?? 1.55,
        color: options.color,
        profile,
        castShadow: options.castShadow ?? false,
      });
      // Occasional dead / dim tube for unease
      if (Math.random() < 0.08) {
        fixture.baseIntensity *= 0.15;
        fixture.light.intensity = fixture.baseIntensity;
        const mat = fixture.panel.material;
        if (mat instanceof MeshStandardMaterial) {
          mat.emissiveIntensity *= 0.2;
        }
      }
      root.add(fixture.group);
      fixtures.push(fixture);
    }
  }

  return createFlickerController(fixtures, root);
}

export function createFlickerController(
  fixtures: FluorescentFixture[],
  root?: Group,
): FlickerController {
  let enabled = true;
  let hardFlickerTimer = 3 + Math.random() * 8;
  let hardFlickerRemaining = 0;
  let hardFlickerTarget: FluorescentFixture | null = null;

  const update = (dt: number, elapsed: number): void => {
    if (!enabled) return;

    hardFlickerTimer -= dt;
    if (hardFlickerTimer <= 0 && hardFlickerRemaining <= 0) {
      hardFlickerTarget = fixtures[Math.floor(Math.random() * fixtures.length)] ?? null;
      hardFlickerRemaining = 0.08 + Math.random() * 0.35;
      hardFlickerTimer = 4 + Math.random() * 14;
    }

    if (hardFlickerRemaining > 0) {
      hardFlickerRemaining -= dt;
      if (hardFlickerRemaining <= 0) {
        hardFlickerTarget = null;
      }
    }

    for (const fx of fixtures) {
      const buzz =
        1 +
        Math.sin(elapsed * 58 + fx.phase) * fx.flickerAmount * 0.35 +
        Math.sin(elapsed * 11.3 + fx.phase * 1.7) * fx.flickerAmount;

      let mul = buzz;
      if (fx === hardFlickerTarget) {
        // Rare hard flicker — tube almost dies then pops
        const stutter = Math.random() > 0.45 ? 0.05 + Math.random() * 0.25 : 1.15;
        mul *= stutter;
      }

      fx.light.intensity = Math.max(0, fx.baseIntensity * mul);

      const mat = fx.panel.material;
      if (mat instanceof MeshStandardMaterial) {
        const baseEmissive =
          fx.baseIntensity < 0.5 ? 0.25 : mat.name.includes("mart") ? 1.7 : 1.35;
        mat.emissiveIntensity = MathUtils.clamp(baseEmissive * mul, 0, 3);
      }
    }
  };

  const dispose = (): void => {
    for (const fx of fixtures) {
      fx.panel.geometry.dispose();
      const mats = Array.isArray(fx.panel.material)
        ? fx.panel.material
        : [fx.panel.material];
      for (const m of mats) m.dispose();
      fx.light.dispose();
      fx.group.removeFromParent();
    }
    fixtures.length = 0;
    root?.removeFromParent();
  };

  return {
    fixtures,
    update,
    setEnabled: (v: boolean) => {
      enabled = v;
    },
    dispose,
  };
}

/**
 * Soft light leak under / around a door — found-footage corridor anxiety.
 */
export function createDoorGlow(
  parent: Object3D,
  options: DoorGlowOptions,
): Group {
  const group = new Group();
  group.name = "door-glow";
  group.position.copy(options.position);

  const width = options.width ?? 0.9;
  const height = options.height ?? 2.1;
  const color = new Color(options.color ?? 0xe8d890);
  const intensity = options.intensity ?? 0.65;
  const normal = (options.normal ?? new Vector3(0, 0, 1)).clone().normalize();

  // Under-door slit
  const slitGeo = new PlaneGeometry(width * 0.92, 0.04);
  const slitMat = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const slit = new Mesh(slitGeo, slitMat);
  slit.position.set(0, 0.02, 0.02);
  group.add(slit);

  // Soft rectangular wash on floor
  const washGeo = new PlaneGeometry(width * 1.4, 1.2);
  const washMat = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const wash = new Mesh(washGeo, washMat);
  wash.rotation.x = -Math.PI / 2;
  wash.position.set(0, 0.01, 0.55);
  group.add(wash);

  // Side crack glow (door jamb)
  const jambGeo = new PlaneGeometry(0.025, height * 0.95);
  const jambMat = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const jambL = new Mesh(jambGeo, jambMat);
  jambL.position.set(-width * 0.5, height * 0.5, 0.02);
  const jambR = jambL.clone();
  jambR.position.x = width * 0.5;
  group.add(jambL, jambR);

  const point = new PointLight(color, intensity, 4.5, 2);
  point.position.set(0, 0.3, 0.4);
  group.add(point);

  // Orient group so +Z faces into the room along `normal`
  group.lookAt(
    options.position.x + normal.x,
    options.position.y + normal.y,
    options.position.z + normal.z,
  );

  parent.add(group);
  return group;
}

/**
 * Fog + ambient baseline helpers for volumetric-feel (cheap, no real volumes).
 */
export interface AtmosphereSettings {
  fogColor: number;
  fogNear: number;
  fogFar: number;
  ambientHex: number;
  ambientIntensity: number;
  hemiSky?: number;
  hemiGround?: number;
  hemiIntensity?: number;
}

export const ATMOSPHERE: Record<LevelId, AtmosphereSettings> = {
  backrooms: {
    fogColor: 0xc4b47a,
    fogNear: 2.5,
    fogFar: 18,
    ambientHex: 0xa09060,
    ambientIntensity: 0.22,
    hemiSky: 0xd4c48a,
    hemiGround: 0x6a6040,
    hemiIntensity: 0.35,
  },
  mart: {
    fogColor: 0xa8b4bc,
    fogNear: 6,
    fogFar: 42,
    ambientHex: 0x8898a8,
    ambientIntensity: 0.28,
    hemiSky: 0xc8d8e8,
    hemiGround: 0x505860,
    hemiIntensity: 0.4,
  },
  hotel: {
    fogColor: 0xc8b8a8,
    fogNear: 4,
    fogFar: 28,
    ambientHex: 0xb0a090,
    ambientIntensity: 0.25,
    hemiSky: 0xe8dcc8,
    hemiGround: 0x5a5048,
    hemiIntensity: 0.32,
  },
};

/**
 * Apply heavy exponential fog + hemi fill for liminal volumetric feel.
 * Returns the settings used (also available via ATMOSPHERE).
 */
export function applyAtmosphere(
  scene: Scene,
  levelId: LevelId,
): AtmosphereSettings {
  const settings = ATMOSPHERE[levelId];
  const fog = new FogExp2(settings.fogColor, 2.2 / settings.fogFar);
  scene.fog = fog;
  scene.background = new Color(settings.fogColor);

  // Remove prior threshold hemi if re-applying
  const existing = scene.getObjectByName("threshold-hemi");
  if (existing) {
    scene.remove(existing);
    if (existing instanceof HemisphereLight) existing.dispose();
  }

  const hemi = new HemisphereLight(
    settings.hemiSky ?? settings.ambientHex,
    settings.hemiGround ?? 0x222218,
    settings.hemiIntensity ?? 0.3,
  );
  hemi.name = "threshold-hemi";
  scene.add(hemi);

  return settings;
}

/**
 * Soft downward pool under a fixture for fake volumetric shaft (additive plane).
 */
export function createLightShaft(
  parent: Object3D,
  position: Vector3,
  options: { color?: number; height?: number; width?: number; opacity?: number } = {},
): Mesh {
  const height = options.height ?? 2.6;
  const width = options.width ?? 0.9;
  const geo = new PlaneGeometry(width, height);
  const mat = new MeshBasicMaterial({
    color: new Color(options.color ?? DEFAULT_FLUORO_COLOR),
    transparent: true,
    opacity: options.opacity ?? 0.04,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const mesh = new Mesh(geo, mat);
  mesh.position.copy(position);
  mesh.position.y -= height * 0.5;
  mesh.name = "light-shaft";
  parent.add(mesh);
  return mesh;
}
