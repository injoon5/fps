/**
 * Nocturnal Garage — liminal multi-bay parking structure at 2am.
 * Sodium haze, oil stains, abandoned cars, glowing stairwell exit.
 */

import { Group, Vector3 } from "three";
import type { AABB, LevelBuildResult, LevelMeta } from "../types";
import {
  GeometryBatcher,
  addDoorFrame,
  createBoxInstances,
  createFallbackLighting,
  createFallbackMaterials,
  mulberry32,
  type LightLib,
  type MaterialLib,
} from "./geometry";

const WIDTH = 68;
const DEPTH = 88;
const HEIGHT = 3.05;
const WALL_T = 0.35;
const COL_SIZE = 0.7;
const COL_PITCH_X = 8.5;
const COL_PITCH_Z = 9.0;
const STALL_W = 2.6;
const STALL_D = 5.2;
const DRIVE_W = 6.2;
const LINE_H = 0.025;
const SODIUM = 0xff9a3a;

export function buildGarageLevel(
  matLib?: MaterialLib,
  lightLib?: LightLib,
): LevelBuildResult {
  const materials = matLib ?? createFallbackMaterials("garage");
  const lighting = lightLib ?? createFallbackLighting();
  const rand = mulberry32(0x6a7a6e);
  const root = new Group();
  root.name = "level-garage";
  const lights = new Group();
  lights.name = "lights-garage";
  const batch = new GeometryBatcher();

  // --- Shell: main deck ---
  batch.addBox(
    "floor",
    materials.floor,
    WIDTH,
    0.18,
    DEPTH,
    WIDTH * 0.5,
    -0.09,
    DEPTH * 0.5,
    { collide: true },
  );
  batch.addBox(
    "ceiling",
    materials.ceiling,
    WIDTH,
    0.22,
    DEPTH,
    WIDTH * 0.5,
    HEIGHT + 0.11,
    DEPTH * 0.5,
    { collide: false },
  );

  // Outer walls (north opens into stair vestibule)
  batch.addBox(
    "wall",
    materials.wall,
    WIDTH,
    HEIGHT,
    WALL_T,
    WIDTH * 0.5,
    HEIGHT * 0.5,
    -WALL_T * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    HEIGHT,
    DEPTH,
    -WALL_T * 0.5,
    HEIGHT * 0.5,
    DEPTH * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    HEIGHT,
    DEPTH,
    WIDTH + WALL_T * 0.5,
    HEIGHT * 0.5,
    DEPTH * 0.5,
    { collide: true },
  );

  const exitGap = 5.5;
  const sideW = (WIDTH - exitGap) * 0.5;
  batch.addBox(
    "wall",
    materials.wall,
    sideW,
    HEIGHT,
    WALL_T,
    sideW * 0.5,
    HEIGHT * 0.5,
    DEPTH + WALL_T * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    sideW,
    HEIGHT,
    WALL_T,
    WIDTH - sideW * 0.5,
    HEIGHT * 0.5,
    DEPTH + WALL_T * 0.5,
    { collide: true },
  );

  // Stairwell / rooftop vestibule beyond north wall
  const vestibuleD = 7;
  const exitX = WIDTH * 0.5;
  batch.addBox(
    "floor",
    materials.floor,
    exitGap,
    0.18,
    vestibuleD,
    exitX,
    -0.09,
    DEPTH + vestibuleD * 0.5,
    { collide: true },
  );
  batch.addBox(
    "ceiling",
    materials.ceiling,
    exitGap,
    0.22,
    vestibuleD,
    exitX,
    HEIGHT + 0.11,
    DEPTH + vestibuleD * 0.5,
    { collide: false },
  );
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    HEIGHT,
    vestibuleD,
    exitX - exitGap * 0.5,
    HEIGHT * 0.5,
    DEPTH + vestibuleD * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    HEIGHT,
    vestibuleD,
    exitX + exitGap * 0.5,
    HEIGHT * 0.5,
    DEPTH + vestibuleD * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    exitGap,
    HEIGHT,
    WALL_T,
    exitX,
    HEIGHT * 0.5,
    DEPTH + vestibuleD + WALL_T * 0.5,
    { collide: true },
  );

  // Perimeter Jersey-style curb / wheel stops along long walls
  for (let z = 4; z < DEPTH - 2; z += 6) {
    batch.addBox("trim", materials.trim, 0.35, 0.28, 1.6, 1.1, 0.14, z, {
      collide: true,
    });
    batch.addBox(
      "trim",
      materials.trim,
      0.35,
      0.28,
      1.6,
      WIDTH - 1.1,
      0.14,
      z,
      { collide: true },
    );
  }

  // Ramp feel: stepped floor rise mid-structure + diagonal wedge walls
  const rampZ0 = 38;
  const rampZ1 = 52;
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const rise = t * 1.35;
    const z = rampZ0 + (rampZ1 - rampZ0) * (i / 6) + 1.1;
    batch.addBox(
      "floor",
      materials.floor,
      WIDTH * 0.42,
      0.14,
      2.4,
      WIDTH * 0.28,
      rise - 0.02,
      z,
      { collide: true },
    );
  }
  // Diagonal wedge walls flanking ramp (sloping visual)
  for (let i = 0; i < 5; i++) {
    const z = rampZ0 + 2 + i * 2.6;
    const h = 0.9 + i * 0.35;
    batch.addBox(
      "wall",
      materials.wall,
      0.45,
      h,
      2.4,
      WIDTH * 0.48,
      h * 0.5,
      z,
      { collide: true, rotationY: 0.35 },
    );
    batch.addBox(
      "wall",
      materials.wall,
      0.45,
      h,
      2.4,
      WIDTH * 0.08,
      h * 0.5,
      z,
      { collide: true, rotationY: -0.35 },
    );
  }

  // Low concrete barrier separating west drive from east bays near ramp
  batch.addBox(
    "trim",
    materials.trim,
    0.4,
    0.85,
    rampZ1 - rampZ0,
    WIDTH * 0.5,
    0.425,
    (rampZ0 + rampZ1) * 0.5,
    { collide: true },
  );

  batch.flush(root);

  // --- Column grid (InstancedMesh) ---
  const colPositions: Array<{ x: number; z: number }> = [];
  const marginX = 6;
  const marginZ = 7;
  for (let x = marginX; x < WIDTH - marginX; x += COL_PITCH_X) {
    for (let z = marginZ; z < DEPTH - marginZ; z += COL_PITCH_Z) {
      // Keep center drive clearer — skip a few columns in aisle
      if (Math.abs(x - WIDTH * 0.5) < 3.2 && z > 20 && z < 70) continue;
      colPositions.push({ x, z });
    }
  }

  root.add(
    createBoxInstances(
      materials.wall,
      colPositions.length,
      [COL_SIZE, HEIGHT, COL_SIZE],
      (i, dummy) => {
        const p = colPositions[i]!;
        dummy.position.set(p.x, HEIGHT * 0.5, p.z);
      },
    ),
  );

  const colliders: AABB[] = [...batch.colliders];
  for (const c of colPositions) {
    const hs = COL_SIZE * 0.55;
    colliders.push({
      minX: c.x - hs,
      maxX: c.x + hs,
      minY: 0,
      maxY: HEIGHT,
      minZ: c.z - hs,
      maxZ: c.z + hs,
    });
  }

  // --- Parking stall lines (yellow accent strips) ---
  type LinePlacement = { x: number; y: number; z: number; rotY: number; sx: number; sz: number };
  const lines: LinePlacement[] = [];

  // Two bay banks: west of drive aisle and east of drive aisle
  const westBayX0 = 3.2;
  const eastBayX0 = WIDTH * 0.5 + DRIVE_W * 0.5 + 0.8;
  const bayRows = Math.floor((DEPTH - 14) / (STALL_D + 0.4));

  const addStallLines = (bayOriginX: number, faceEast: boolean): void => {
    for (let row = 0; row < bayRows; row++) {
      const z0 = 6 + row * (STALL_D + 0.35);
      const stalls = 3;
      for (let s = 0; s < stalls; s++) {
        const x0 = bayOriginX + s * STALL_W;
        // Side lines
        lines.push({
          x: x0,
          y: LINE_H,
          z: z0 + STALL_D * 0.5,
          rotY: 0,
          sx: 0.1,
          sz: STALL_D,
        });
        lines.push({
          x: x0 + STALL_W,
          y: LINE_H,
          z: z0 + STALL_D * 0.5,
          rotY: 0,
          sx: 0.1,
          sz: STALL_D,
        });
        // End line (toward drive)
        const endX = faceEast ? x0 + STALL_W * 0.5 : x0 + STALL_W * 0.5;
        lines.push({
          x: endX,
          y: LINE_H,
          z: faceEast ? z0 + STALL_D : z0,
          rotY: 0,
          sx: STALL_W,
          sz: 0.1,
        });
      }
      // Occasional wheelchair bay marker (simple square + cross)
      if (row % 5 === 2) {
        const hx = bayOriginX + STALL_W * 1.5;
        const hz = z0 + STALL_D * 0.45;
        lines.push({
          x: hx,
          y: LINE_H + 0.002,
          z: hz,
          rotY: 0,
          sx: 0.9,
          sz: 0.9,
        });
        lines.push({
          x: hx,
          y: LINE_H + 0.004,
          z: hz,
          rotY: 0,
          sx: 0.18,
          sz: 0.55,
        });
        lines.push({
          x: hx,
          y: LINE_H + 0.004,
          z: hz,
          rotY: 0,
          sx: 0.55,
          sz: 0.18,
        });
      }
    }
  };

  addStallLines(westBayX0, true);
  addStallLines(eastBayX0, false);

  // Center drive dashed centerline
  for (let z = 5; z < DEPTH - 4; z += 3.2) {
    lines.push({
      x: WIDTH * 0.5,
      y: LINE_H,
      z,
      rotY: 0,
      sx: 0.18,
      sz: 1.4,
    });
  }

  if (lines.length > 0) {
    root.add(
      createBoxInstances(
        materials.accent,
        lines.length,
        [1, LINE_H, 1],
        (i, dummy) => {
          const L = lines[i]!;
          dummy.position.set(L.x, L.y, L.z);
          dummy.rotation.y = L.rotY;
          dummy.scale.set(L.sx, 1, L.sz);
        },
      ),
    );
  }

  // --- Abandoned car silhouettes ---
  type CarPose = { x: number; y: number; z: number; rotY: number };
  const cars: CarPose[] = [];

  const placeCar = (x: number, z: number, rotY: number): void => {
    cars.push({ x, y: 0, z, rotY });
    const hw = 1.05;
    const hd = 2.25;
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    const aw = hw * c + hd * s;
    const ad = hw * s + hd * c;
    colliders.push({
      minX: x - aw,
      maxX: x + aw,
      minY: 0,
      maxY: 1.55,
      minZ: z - ad,
      maxZ: z + ad,
    });
  };

  // West bays — sparse abandoned vehicles
  for (let row = 0; row < bayRows; row++) {
    if (rand() > 0.42) continue;
    const z = 6 + row * (STALL_D + 0.35) + STALL_D * 0.5;
    const stall = Math.floor(rand() * 3);
    placeCar(
      westBayX0 + stall * STALL_W + STALL_W * 0.5,
      z,
      Math.PI * 0.5 + (rand() - 0.5) * 0.08,
    );
  }
  // East bays
  for (let row = 0; row < bayRows; row++) {
    if (rand() > 0.48) continue;
    const z = 6 + row * (STALL_D + 0.35) + STALL_D * 0.5;
    const stall = Math.floor(rand() * 3);
    placeCar(
      eastBayX0 + stall * STALL_W + STALL_W * 0.5,
      z,
      -Math.PI * 0.5 + (rand() - 0.5) * 0.1,
    );
  }
  // A couple crooked in the drive
  placeCar(WIDTH * 0.5 + 1.2, 28, 0.35);
  placeCar(WIDTH * 0.42, 64, -0.2);

  // Bodies
  root.add(
    createBoxInstances(materials.prop, cars.length, [2.0, 0.75, 4.3], (i, dummy) => {
      const c = cars[i]!;
      dummy.position.set(c.x, 0.45, c.z);
      dummy.rotation.y = c.rotY;
    }),
  );
  // Cabins
  root.add(
    createBoxInstances(materials.metal, cars.length, [1.85, 0.7, 2.0], (i, dummy) => {
      const c = cars[i]!;
      const forward = 0.35;
      dummy.position.set(
        c.x + Math.sin(c.rotY) * forward,
        1.05,
        c.z + Math.cos(c.rotY) * forward,
      );
      dummy.rotation.y = c.rotY;
    }),
  );

  // --- Sparse sodium fixtures ---
  const sodiumSpots: Array<[number, number, number]> = [];
  // Sparse grid — large dark stretches between
  for (let x = 10; x < WIDTH - 6; x += 17) {
    for (let z = 10; z < DEPTH - 6; z += 14) {
      // Skip some for dead zones
      if (rand() < 0.28) continue;
      sodiumSpots.push([x + (rand() - 0.5) * 1.5, HEIGHT - 0.12, z]);
    }
  }
  // Guarantee a few near spawn and exit approach
  sodiumSpots.push([WIDTH * 0.5, HEIGHT - 0.12, 8]);
  sodiumSpots.push([WIDTH * 0.5 - 4, HEIGHT - 0.12, DEPTH - 10]);
  sodiumSpots.push([exitX, HEIGHT - 0.12, DEPTH + 2]);

  root.add(
    createBoxInstances(
      materials.lightPanel,
      sodiumSpots.length,
      [0.85, 0.12, 0.45],
      (i, dummy) => {
        const s = sodiumSpots[i]!;
        dummy.position.set(s[0], s[1], s[2]);
      },
    ),
  );

  // Real PointLights only on subset (perf) — orange sodium
  for (let i = 0; i < sodiumSpots.length; i += 2) {
    const s = sodiumSpots[i]!;
    const pl = lighting.point(SODIUM, 1.55 + rand() * 0.4, 11, 2);
    pl.position.set(s[0], s[1] - 0.2, s[2]);
    lights.add(pl);
  }

  // Dark ambient — barely any fill
  lights.add(lighting.ambient(0x4a3020, 0.09));

  // Exit stairwell glow
  const exitBatch = new GeometryBatcher();
  addDoorFrame(exitBatch, materials, exitX, DEPTH + vestibuleD - 0.25, "z", {
    width: 1.5,
    height: 2.35,
    glowing: true,
  });
  // Stair steps leading up to rooftop door
  for (let i = 0; i < 7; i++) {
    exitBatch.addBox(
      "trim",
      materials.trim,
      2.2,
      0.16,
      0.55,
      exitX,
      0.08 + i * 0.2,
      DEPTH + 1.2 + i * 0.55,
      { collide: true },
    );
  }
  // Emissive EXIT bar
  exitBatch.addBox(
    "exitglow",
    materials.exit,
    1.8,
    0.35,
    0.06,
    exitX,
    2.7,
    DEPTH + vestibuleD - 0.2,
    { collide: false },
  );
  exitBatch.flush(root);
  for (const c of exitBatch.colliders) colliders.push(c);

  const exitLight = lighting.point(0xffb040, 3.2, 16, 2);
  exitLight.position.set(exitX, 2.4, DEPTH + vestibuleD - 1.2);
  lights.add(exitLight);

  // Enemy spawns in dark bays (8–14)
  const enemySpawns: Vector3[] = [
    new Vector3(westBayX0 + STALL_W * 0.5, 0, 14),
    new Vector3(westBayX0 + STALL_W * 2.5, 0, 26),
    new Vector3(eastBayX0 + STALL_W * 1.5, 0, 18),
    new Vector3(eastBayX0 + STALL_W * 0.5, 0, 40),
    new Vector3(westBayX0 + STALL_W, 0, 48),
    new Vector3(eastBayX0 + STALL_W * 2, 0, 55),
    new Vector3(8, 0, 72),
    new Vector3(WIDTH - 9, 0, 68),
    new Vector3(WIDTH * 0.35, 0, 33),
    new Vector3(WIDTH * 0.62, 0, 76),
  ];
  for (let i = 0; i < 3; i++) {
    enemySpawns.push(
      new Vector3(
        5 + rand() * (WIDTH - 10),
        0,
        12 + rand() * (DEPTH - 24),
      ),
    );
  }

  const spawn: [number, number, number] = [WIDTH * 0.5, 1.7, 4.2];

  const meta: LevelMeta = {
    id: "garage",
    name: "Nocturnal Garage",
    objective:
      "Reach the stairwell EXIT. The sodium lights do not reach every bay.",
    fogColor: 0x3a2818,
    fogNear: 2,
    fogFar: 16,
    ambient: 0.1,
    spawn,
  };

  return {
    root,
    colliders,
    lights,
    enemySpawns,
    exitPosition: new Vector3(exitX, 1.4, DEPTH + vestibuleD - 0.9),
    meta,
  };
}
