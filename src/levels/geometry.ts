/**
 * Shared CSG-free room builders for THRESHOLD levels.
 *
 * Material / lighting libs are stub-compatible with `../rendering`.
 * When that module ships MaterialLib / LightLib factories, swap the
 * createFallback* helpers for rendering imports — call sites stay the same.
 */

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  AmbientLight,
  type Material,
  type ColorRepresentation,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AABB } from "../types";

/* -------------------------------------------------------------------------- */
/*  Material / lighting contracts (mirrors future ../rendering exports)       */
/* -------------------------------------------------------------------------- */

export interface MaterialLib {
  floor: MeshStandardMaterial;
  wall: MeshStandardMaterial;
  ceiling: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  exit: MeshStandardMaterial;
  metal: MeshStandardMaterial;
  lightPanel: MeshStandardMaterial;
  prop: MeshStandardMaterial;
  accent: MeshStandardMaterial;
}

export interface LightLib {
  ambient(color: ColorRepresentation, intensity: number): AmbientLight;
  point(
    color: ColorRepresentation,
    intensity: number,
    distance: number,
    decay?: number,
  ): PointLight;
}

export type ThemeId = "backrooms" | "mart" | "hotel";

const THEME_PALETTE: Record<
  ThemeId,
  {
    floor: number;
    wall: number;
    ceiling: number;
    trim: number;
    exit: number;
    metal: number;
    light: number;
    prop: number;
    accent: number;
    roughness: { floor: number; wall: number; ceiling: number };
  }
> = {
  backrooms: {
    floor: 0xc4a35a,
    wall: 0xd4c48a,
    ceiling: 0xe8e0c8,
    trim: 0xa89050,
    exit: 0xffee88,
    metal: 0x8a8a82,
    light: 0xfff5d0,
    prop: 0xb8a060,
    accent: 0x9a8040,
    roughness: { floor: 0.95, wall: 0.88, ceiling: 0.75 },
  },
  mart: {
    floor: 0x6a6a68,
    wall: 0xb8b4a8,
    ceiling: 0xd0cec4,
    trim: 0xf0c020,
    exit: 0xff3344,
    metal: 0x5a5a58,
    light: 0xe8f0ff,
    prop: 0x4a4a48,
    accent: 0xe8c84a,
    roughness: { floor: 0.92, wall: 0.7, ceiling: 0.65 },
  },
  hotel: {
    floor: 0x5c3d3a,
    wall: 0xd8cfc0,
    ceiling: 0xece6dc,
    trim: 0x8a7060,
    exit: 0xffcc66,
    metal: 0x9a9590,
    light: 0xffe8c8,
    prop: 0x6a5850,
    accent: 0xc4a070,
    roughness: { floor: 0.9, wall: 0.72, ceiling: 0.68 },
  },
};

function mat(
  color: number,
  opts: {
    roughness?: number;
    metalness?: number;
    emissive?: number;
    emissiveIntensity?: number;
  } = {},
): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.8,
    metalness: opts.metalness ?? 0.05,
  });
  if (opts.emissive !== undefined) {
    m.emissive = new Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  return m;
}

/** Kane Pixel–adjacent fallback materials until `../rendering` exists. */
export function createFallbackMaterials(theme: ThemeId): MaterialLib {
  const p = THEME_PALETTE[theme];
  return {
    floor: mat(p.floor, { roughness: p.roughness.floor }),
    wall: mat(p.wall, { roughness: p.roughness.wall }),
    ceiling: mat(p.ceiling, { roughness: p.roughness.ceiling }),
    trim: mat(p.trim, { roughness: 0.7, metalness: 0.15 }),
    exit: mat(p.exit, {
      roughness: 0.35,
      emissive: p.exit,
      emissiveIntensity: 1.4,
    }),
    metal: mat(p.metal, { roughness: 0.45, metalness: 0.65 }),
    lightPanel: mat(p.light, {
      roughness: 0.3,
      emissive: p.light,
      emissiveIntensity: 1.8,
    }),
    prop: mat(p.prop, { roughness: 0.85 }),
    accent: mat(p.accent, { roughness: 0.6, metalness: 0.2 }),
  };
}

export function createFallbackLighting(): LightLib {
  return {
    ambient(color, intensity) {
      return new AmbientLight(color, intensity);
    },
    point(color, intensity, distance, decay = 2) {
      const light = new PointLight(color, intensity, distance, decay);
      return light;
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  AABB helpers                                                              */
/* -------------------------------------------------------------------------- */

export function aabbFromCenter(
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
): AABB {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const hd = d * 0.5;
  return {
    minX: cx - hw,
    maxX: cx + hw,
    minY: cy - hh,
    maxY: cy + hh,
    minZ: cz - hd,
    maxZ: cz + hd,
  };
}

export function mergeAABBs(a: AABB, b: AABB): AABB {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

/* -------------------------------------------------------------------------- */
/*  Batched solid geometry                                                    */
/* -------------------------------------------------------------------------- */

export class GeometryBatcher {
  private readonly buckets = new Map<
    string,
    { material: Material; geos: BufferGeometry[] }
  >();
  readonly colliders: AABB[] = [];

  addBox(
    key: string,
    material: Material,
    width: number,
    height: number,
    depth: number,
    cx: number,
    cy: number,
    cz: number,
    options: { collide?: boolean; rotationY?: number } = {},
  ): void {
    const geo = new BoxGeometry(width, height, depth);
    if (options.rotationY) {
      geo.rotateY(options.rotationY);
    }
    geo.translate(cx, cy, cz);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { material, geos: [] };
      this.buckets.set(key, bucket);
    }
    bucket.geos.push(geo);

    if (options.collide !== false) {
      // Approximate rotated boxes with expanded AABB (doors/frames stay axis-aligned).
      if (options.rotationY) {
        const c = Math.abs(Math.cos(options.rotationY));
        const s = Math.abs(Math.sin(options.rotationY));
        const aw = width * c + depth * s;
        const ad = width * s + depth * c;
        this.colliders.push(aabbFromCenter(cx, cy, cz, aw, height, ad));
      } else {
        this.colliders.push(aabbFromCenter(cx, cy, cz, width, height, depth));
      }
    }
  }

  /** Thin vertical wall segment on XZ plane (axis-aligned). */
  addBoxWall(
    material: Material,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    yBottom: number,
    height: number,
    thickness: number,
  ): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const cy = yBottom + height * 0.5;
    const angle = Math.atan2(dx, dz);
    this.addBox("wall", material, thickness, height, len, cx, cy, cz, {
      collide: true,
      rotationY: angle,
    });
  }

  flush(parent: Group): void {
    for (const [, bucket] of this.buckets) {
      if (bucket.geos.length === 0) continue;
      const merged = mergeGeometries(bucket.geos, false);
      for (const g of bucket.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, bucket.material);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.buckets.clear();
  }
}

/** Standalone wall helper — delegates to GeometryBatcher.addBoxWall. */
export function addBoxWall(
  batch: GeometryBatcher,
  material: Material,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yBottom: number,
  height: number,
  thickness: number,
): void {
  batch.addBoxWall(material, x0, z0, x1, z1, yBottom, height, thickness);
}

/* -------------------------------------------------------------------------- */
/*  Room / door / lights                                                      */
/* -------------------------------------------------------------------------- */

export interface RoomSpec {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  yBottom?: number;
  height: number;
  wallThickness?: number;
  /** Which sides get solid walls. Default: all four. */
  walls?: { n?: boolean; s?: boolean; e?: boolean; w?: boolean };
  /** Door gaps as [t0, t1] along each wall in local 0..1. */
  doors?: {
    n?: [number, number];
    s?: [number, number];
    e?: [number, number];
    w?: [number, number];
  };
  floor?: boolean;
  ceiling?: boolean;
}

function wallWithGap(
  batch: GeometryBatcher,
  material: Material,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  yBottom: number,
  height: number,
  thickness: number,
  gap: [number, number] | undefined,
): void {
  if (!gap) {
    batch.addBoxWall(material, ax, az, bx, bz, yBottom, height, thickness);
    return;
  }
  const [g0, g1] = gap;
  const segments: Array<[number, number]> = [];
  if (g0 > 0.02) segments.push([0, g0]);
  if (g1 < 0.98) segments.push([g1, 1]);
  for (const [t0, t1] of segments) {
    const x0 = ax + (bx - ax) * t0;
    const z0 = az + (bz - az) * t0;
    const x1 = ax + (bx - ax) * t1;
    const z1 = az + (bz - az) * t1;
    batch.addBoxWall(material, x0, z0, x1, z1, yBottom, height, thickness);
  }
}

/**
 * Axis-aligned room: floor, ceiling, and four optional walls with door gaps.
 * Colliders are registered for solid wall segments (and optional floor slab).
 */
export function addRoom(
  batch: GeometryBatcher,
  materials: Pick<MaterialLib, "floor" | "wall" | "ceiling">,
  spec: RoomSpec,
): void {
  const y0 = spec.yBottom ?? 0;
  const h = spec.height;
  const t = spec.wallThickness ?? 0.2;
  const walls = {
    n: true,
    s: true,
    e: true,
    w: true,
    ...spec.walls,
  };
  const doors = spec.doors ?? {};

  if (spec.floor !== false) {
    const w = spec.maxX - spec.minX;
    const d = spec.maxZ - spec.minZ;
    batch.addBox(
      "floor",
      materials.floor,
      w,
      0.08,
      d,
      (spec.minX + spec.maxX) * 0.5,
      y0 - 0.04,
      (spec.minZ + spec.maxZ) * 0.5,
      { collide: true },
    );
  }

  if (spec.ceiling !== false) {
    const w = spec.maxX - spec.minX;
    const d = spec.maxZ - spec.minZ;
    batch.addBox(
      "ceiling",
      materials.ceiling,
      w,
      0.08,
      d,
      (spec.minX + spec.maxX) * 0.5,
      y0 + h + 0.04,
      (spec.minZ + spec.maxZ) * 0.5,
      { collide: false },
    );
  }

  // N = +Z, S = -Z, E = +X, W = -X
  if (walls.n) {
    wallWithGap(
      batch,
      materials.wall,
      spec.minX,
      spec.maxZ,
      spec.maxX,
      spec.maxZ,
      y0,
      h,
      t,
      doors.n,
    );
  }
  if (walls.s) {
    wallWithGap(
      batch,
      materials.wall,
      spec.minX,
      spec.minZ,
      spec.maxX,
      spec.minZ,
      y0,
      h,
      t,
      doors.s,
    );
  }
  if (walls.e) {
    wallWithGap(
      batch,
      materials.wall,
      spec.maxX,
      spec.minZ,
      spec.maxX,
      spec.maxZ,
      y0,
      h,
      t,
      doors.e,
    );
  }
  if (walls.w) {
    wallWithGap(
      batch,
      materials.wall,
      spec.minX,
      spec.minZ,
      spec.minX,
      spec.maxZ,
      y0,
      h,
      t,
      doors.w,
    );
  }
}

export function addDoorFrame(
  batch: GeometryBatcher,
  materials: Pick<MaterialLib, "trim" | "exit" | "wall">,
  cx: number,
  cz: number,
  facing: "x" | "z",
  opts: {
    width?: number;
    height?: number;
    yBottom?: number;
    depth?: number;
    glowing?: boolean;
  } = {},
): void {
  const width = opts.width ?? 1.1;
  const height = opts.height ?? 2.2;
  const y0 = opts.yBottom ?? 0;
  const depth = opts.depth ?? 0.18;
  const jamb = 0.12;
  const matFrame = opts.glowing ? materials.exit : materials.trim;

  if (facing === "z") {
    // Opening faces along ±Z; frame spans X
    batch.addBox(
      "doorframe",
      matFrame,
      jamb,
      height,
      depth,
      cx - width * 0.5,
      y0 + height * 0.5,
      cz,
      { collide: true },
    );
    batch.addBox(
      "doorframe",
      matFrame,
      jamb,
      height,
      depth,
      cx + width * 0.5,
      y0 + height * 0.5,
      cz,
      { collide: true },
    );
    batch.addBox(
      "doorframe",
      matFrame,
      width + jamb * 2,
      jamb,
      depth,
      cx,
      y0 + height + jamb * 0.5,
      cz,
      { collide: true },
    );
    if (opts.glowing) {
      batch.addBox(
        "exitglow",
        materials.exit,
        width * 0.85,
        height * 0.9,
        0.04,
        cx,
        y0 + height * 0.5,
        cz,
        { collide: false },
      );
    }
  } else {
    batch.addBox(
      "doorframe",
      matFrame,
      depth,
      height,
      jamb,
      cx,
      y0 + height * 0.5,
      cz - width * 0.5,
      { collide: true },
    );
    batch.addBox(
      "doorframe",
      matFrame,
      depth,
      height,
      jamb,
      cx,
      y0 + height * 0.5,
      cz + width * 0.5,
      { collide: true },
    );
    batch.addBox(
      "doorframe",
      matFrame,
      depth,
      jamb,
      width + jamb * 2,
      cx,
      y0 + height + jamb * 0.5,
      cz,
      { collide: true },
    );
    if (opts.glowing) {
      batch.addBox(
        "exitglow",
        materials.exit,
        0.04,
        height * 0.9,
        width * 0.85,
        cx,
        y0 + height * 0.5,
        cz,
        { collide: false },
      );
    }
  }
}

export interface CeilingLightPlacement {
  x: number;
  y: number;
  z: number;
}

/**
 * Instanced fluorescent panels + sparse real PointLights for perf.
 */
export function addCeilingLights(
  root: Group,
  lightsGroup: Group,
  materials: Pick<MaterialLib, "lightPanel">,
  lightLib: LightLib,
  placements: CeilingLightPlacement[],
  opts: {
    panelW?: number;
    panelH?: number;
    panelD?: number;
    lightEvery?: number;
    color?: ColorRepresentation;
    intensity?: number;
    distance?: number;
  } = {},
): void {
  const count = placements.length;
  if (count === 0) return;

  const pw = opts.panelW ?? 1.15;
  const ph = opts.panelH ?? 0.04;
  const pd = opts.panelD ?? 0.55;
  const every = opts.lightEvery ?? 4;
  const color = opts.color ?? 0xfff2d0;
  const intensity = opts.intensity ?? 1.1;
  const distance = opts.distance ?? 8;

  const geo = new BoxGeometry(pw, ph, pd);
  const inst = new InstancedMesh(geo, materials.lightPanel, count);
  const dummy = new Object3D();

  for (let i = 0; i < count; i++) {
    const p = placements[i];
    if (!p) continue;
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);

    if (i % every === 0) {
      const pl = lightLib.point(color, intensity, distance, 2);
      pl.position.set(p.x, p.y - 0.15, p.z);
      lightsGroup.add(pl);
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  root.add(inst);
}

/** Simple pillar (merged into batch). */
export function addPillar(
  batch: GeometryBatcher,
  material: Material,
  cx: number,
  cz: number,
  yBottom: number,
  height: number,
  size = 0.35,
): void {
  batch.addBox(
    "pillar",
    material,
    size,
    height,
    size,
    cx,
    yBottom + height * 0.5,
    cz,
    { collide: true },
  );
}

/** Create an InstancedMesh of identical boxes. */
export function createBoxInstances(
  material: Material,
  count: number,
  size: [number, number, number],
  place: (i: number, dummy: Object3D) => void,
): InstancedMesh {
  const geo = new BoxGeometry(size[0], size[1], size[2]);
  const inst = new InstancedMesh(geo, material, count);
  const dummy = new Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    place(i, dummy);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

export function createCylinderInstances(
  material: Material,
  count: number,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  place: (i: number, dummy: Object3D) => void,
): InstancedMesh {
  const geo = new CylinderGeometry(radiusTop, radiusBottom, height, 8);
  const inst = new InstancedMesh(geo, material, count);
  const dummy = new Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    place(i, dummy);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

/** Deterministic mulberry32 PRNG for reproducible layouts. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
