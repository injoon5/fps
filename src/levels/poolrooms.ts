/**
 * POOL THRESHOLD — endless indoor poolrooms.
 * Turquoise ceramic, humid fog, shallow basins, tall empty chambers.
 */

import {
  Group,
  Mesh,
  PlaneGeometry,
  Vector3,
  type Material,
} from "three";
import {
  createPoolWaterMaterial,
} from "../rendering";
import type { LevelBuildResult, LevelMeta } from "../types";
import {
  GeometryBatcher,
  addCeilingLights,
  addDoorFrame,
  addPillar,
  addRoom,
  createBoxInstances,
  createCylinderInstances,
  createFallbackLighting,
  createFallbackMaterials,
  mulberry32,
  type CeilingLightPlacement,
  type LightLib,
  type MaterialLib,
} from "./geometry";

const WIDTH = 78;
const DEPTH = 66;
const LOW_H = 3.8;
const TALL_H = 9.2;
const WALL_T = 0.28;
const DECK_Y = 0;

interface Basin {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Water surface height above deck. */
  waterY?: number;
}

export function buildPoolroomsLevel(
  matLib?: MaterialLib,
  lightLib?: LightLib,
): LevelBuildResult {
  const materials = matLib ?? createFallbackMaterials("poolrooms");
  const lighting = lightLib ?? createFallbackLighting();
  const rand = mulberry32(0x9001);
  const root = new Group();
  root.name = "level-poolrooms";
  const lights = new Group();
  lights.name = "lights-poolrooms";
  const batch = new GeometryBatcher();
  const waterMat = createPoolWaterMaterial();
  const waterGroup = new Group();
  waterGroup.name = "water-surfaces";

  // --- Continuous tiled deck under everything (player never falls forever) ---
  batch.addBox(
    "floor",
    materials.floor,
    WIDTH + 2,
    0.12,
    DEPTH + 2,
    WIDTH * 0.5,
    DECK_Y - 0.06,
    DEPTH * 0.5,
    { collide: true },
  );

  // --- Outer shell ---
  // South
  batch.addBox(
    "wall",
    materials.wall,
    WIDTH + WALL_T * 2,
    LOW_H,
    WALL_T,
    WIDTH * 0.5,
    LOW_H * 0.5,
    -WALL_T * 0.5,
    { collide: true },
  );
  // North (exit wall with gap carved later via door)
  batch.addBox(
    "wall",
    materials.wall,
    32,
    LOW_H,
    WALL_T,
    16,
    LOW_H * 0.5,
    DEPTH + WALL_T * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    32,
    LOW_H,
    WALL_T,
    WIDTH - 16,
    LOW_H * 0.5,
    DEPTH + WALL_T * 0.5,
    { collide: true },
  );
  // West / East
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    Math.max(LOW_H, TALL_H),
    DEPTH + WALL_T * 2,
    -WALL_T * 0.5,
    Math.max(LOW_H, TALL_H) * 0.5,
    DEPTH * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    Math.max(LOW_H, TALL_H),
    DEPTH + WALL_T * 2,
    WIDTH + WALL_T * 0.5,
    Math.max(LOW_H, TALL_H) * 0.5,
    DEPTH * 0.5,
    { collide: true },
  );

  // --- Entrance vestibule (dry, low ceiling) ---
  addRoom(batch, materials, {
    minX: 30,
    maxX: 48,
    minZ: 0,
    maxZ: 10,
    height: LOW_H,
    wallThickness: WALL_T,
    walls: { n: false, s: false, e: true, w: true },
    doors: {},
    floor: false,
    ceiling: true,
  });

  // --- Main pool hall (low ceiling over walkways, open to atrium north) ---
  addRoom(batch, materials, {
    minX: 10,
    maxX: 68,
    minZ: 10,
    maxZ: 38,
    height: LOW_H,
    wallThickness: WALL_T,
    walls: { n: false, s: true, e: false, w: false },
    doors: {
      s: [0.38, 0.62], // from vestibule
    },
    floor: false,
    ceiling: true,
  });

  // Interior partition walls with arched openings (tall rectangular)
  // Separating vestibule from main hall — arch already via door gap on south of main
  addArchOpening(batch, materials, 39, 10, "z", 5.5, LOW_H);

  // West divider with arch into alcove wing
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    LOW_H,
    10,
    10,
    LOW_H * 0.5,
    16,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    LOW_H,
    10,
    10,
    LOW_H * 0.5,
    32,
    { collide: true },
  );
  addArchOpening(batch, materials, 10, 24, "x", 4.2, LOW_H);

  // East divider into lane hall
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    LOW_H,
    12,
    68,
    LOW_H * 0.5,
    17,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    LOW_H,
    12,
    68,
    LOW_H * 0.5,
    33,
    { collide: true },
  );
  addArchOpening(batch, materials, 68, 25, "x", 4.5, LOW_H);

  // --- West alcove wing ---
  addRoom(batch, materials, {
    minX: 0,
    maxX: 10,
    minZ: 12,
    maxZ: 42,
    height: LOW_H,
    wallThickness: WALL_T,
    walls: { n: true, s: true, e: false, w: false },
    floor: false,
    ceiling: true,
  });
  // Alcove niches (enemy dens)
  const alcoves: Array<[number, number, number, number]> = [
    [0, 4, 14, 18],
    [0, 4, 22, 26],
    [0, 4, 30, 34],
    [0, 4, 36, 40],
  ];
  for (const [ax0, ax1, az0, az1] of alcoves) {
    addRoom(batch, materials, {
      minX: ax0,
      maxX: ax1,
      minZ: az0,
      maxZ: az1,
      height: LOW_H * 0.92,
      wallThickness: 0.18,
      walls: { n: true, s: true, e: false, w: true },
      doors: { e: [0.15, 0.85] },
      floor: false,
      ceiling: true,
    });
  }

  // --- East lane hall (repeating pool corridors) ---
  addRoom(batch, materials, {
    minX: 68,
    maxX: 78,
    minZ: 10,
    maxZ: 52,
    height: LOW_H,
    wallThickness: WALL_T,
    walls: { n: true, s: true, e: false, w: false },
    floor: false,
    ceiling: true,
  });
  // Lane separators (thin walls with openings)
  for (let i = 0; i < 3; i++) {
    const z = 18 + i * 10;
    batch.addBox(
      "wall",
      materials.wall,
      6,
      LOW_H,
      WALL_T,
      73,
      LOW_H * 0.5,
      z,
      { collide: true },
    );
    // Opening on west side of separator
    addArchOpening(batch, materials, 70.5, z, "z", 2.4, LOW_H * 0.85);
  }

  // --- Tall atrium chamber ---
  addRoom(batch, materials, {
    minX: 20,
    maxX: 58,
    minZ: 38,
    maxZ: 54,
    height: TALL_H,
    wallThickness: WALL_T,
    walls: { n: true, s: false, e: true, w: true },
    doors: {
      n: [0.4, 0.6], // toward exit
      s: [0.35, 0.65],
    },
    floor: false,
    ceiling: true,
  });
  // Mezzanine / diving-board ledge on east of atrium
  batch.addBox(
    "floor",
    materials.floor,
    4.5,
    0.18,
    8,
    54.5,
    4.2,
    46,
    { collide: true },
  );
  batch.addBox(
    "trim",
    materials.trim,
    4.5,
    0.9,
    0.1,
    54.5,
    4.65,
    42.05,
    { collide: true },
  );
  batch.addBox(
    "trim",
    materials.trim,
    0.1,
    0.9,
    8,
    52.3,
    4.65,
    46,
    { collide: true },
  );
  // Diving board stub
  batch.addBox(
    "metal",
    materials.metal,
    1.1,
    0.08,
    3.2,
    53.2,
    4.35,
    44.2,
    { collide: true },
  );

  // Atrium pillars
  addPillar(batch, materials.trim, 24, 42, 0, TALL_H, 0.45);
  addPillar(batch, materials.trim, 54, 42, 0, TALL_H, 0.45);
  addPillar(batch, materials.trim, 24, 50, 0, TALL_H, 0.45);
  addPillar(batch, materials.trim, 54, 50, 0, TALL_H, 0.45);

  // --- Exit dry vestibule ---
  addRoom(batch, materials, {
    minX: 32,
    maxX: 46,
    minZ: 54,
    maxZ: 66,
    height: LOW_H,
    wallThickness: WALL_T,
    walls: { n: true, s: false, e: true, w: true },
    doors: {
      s: [0.35, 0.65],
    },
    floor: false,
    ceiling: true,
  });
  addArchOpening(batch, materials, 39, 54, "z", 4.5, LOW_H);

  // Glowing dry exit portal
  addDoorFrame(batch, materials, 39, 65.55, "z", {
    width: 1.6,
    height: 2.6,
    glowing: true,
  });
  batch.addBox(
    "exitglow",
    materials.exit,
    2.2,
    0.35,
    0.06,
    39,
    3.1,
    65.5,
    { collide: false },
  );

  // --- Basins (visual water + curb colliders) ---
  const basins: Basin[] = [
    // Main hall central pool
    { minX: 18, maxX: 42, minZ: 16, maxZ: 32, waterY: 0.22 },
    // Main hall satellite
    { minX: 48, maxX: 62, minZ: 18, maxZ: 30, waterY: 0.18 },
    // West shallow
    { minX: 4.5, maxX: 9.2, minZ: 20, maxZ: 28, waterY: 0.16 },
    // East lane pools
    { minX: 70, maxX: 76.5, minZ: 12, maxZ: 17, waterY: 0.2 },
    { minX: 70, maxX: 76.5, minZ: 20, maxZ: 27, waterY: 0.2 },
    { minX: 70, maxX: 76.5, minZ: 30, maxZ: 37, waterY: 0.2 },
    { minX: 70, maxX: 76.5, minZ: 40, maxZ: 48, waterY: 0.2 },
    // Tall atrium deep-look basin
    { minX: 28, maxX: 50, minZ: 41, maxZ: 51, waterY: 0.28 },
  ];

  for (const b of basins) {
    addBasin(batch, materials, waterGroup, waterMat, b);
  }

  // Lane / deck accent strips (pale cyan markers)
  const strips: Array<[number, number, number, number, number, number]> = [
    [1.2, 0.02, 26, 14, 0.02, 24],
    [1.2, 0.02, 26, 44, 0.02, 24],
    [48, 0.02, 1.0, 39, 0.02, 12],
    [14, 0.02, 1.0, 39, 0.02, 36],
    [8, 0.02, 1.0, 39, 0.02, 56],
    [0.9, 0.02, 20, 73, 0.02, 30],
  ];
  for (const [w, h, d, cx, cy, cz] of strips) {
    batch.addBox("accent", materials.accent, w, h, d, cx, cy, cz, {
      collide: false,
    });
  }

  // Bench / ledge props along walkways
  const benches: Array<[number, number, number]> = [
    [15, 0.35, 14],
    [63, 0.35, 14],
    [15, 0.35, 34],
    [63, 0.35, 34],
    [6, 0.35, 28],
    [72, 0.35, 50],
    [35, 0.35, 58],
    [43, 0.35, 58],
  ];
  for (const [bx, by, bz] of benches) {
    batch.addBox("prop", materials.prop, 2.4, 0.42, 0.55, bx, by, bz, {
      collide: true,
    });
  }

  batch.flush(root);
  root.add(waterGroup);

  // --- Instanced columns through main hall + atrium ---
  const columnPts: Array<[number, number]> = [];
  for (let x = 16; x <= 62; x += 11.5) {
    for (let z = 14; z <= 34; z += 10) {
      // Skip interiors of large basins
      if (x > 18 && x < 42 && z > 16 && z < 32) continue;
      if (x > 48 && x < 62 && z > 18 && z < 30) continue;
      columnPts.push([x, z]);
    }
  }
  for (let x = 30; x <= 48; x += 9) {
    columnPts.push([x, 40]);
    columnPts.push([x, 52]);
  }

  const colH = LOW_H;
  root.add(
    createCylinderInstances(
      materials.trim,
      columnPts.length,
      0.28,
      0.32,
      colH,
      (i, dummy) => {
        const p = columnPts[i]!;
        dummy.position.set(p[0], colH * 0.5, p[1]);
      },
    ),
  );
  // Column colliders
  for (const [cx, cz] of columnPts) {
    batch.colliders.push({
      minX: cx - 0.32,
      maxX: cx + 0.32,
      minY: 0,
      maxY: colH,
      minZ: cz - 0.32,
      maxZ: cz + 0.32,
    });
  }

  // Underwater glow strips (emissive panels near basin edges) — bloom bait
  const glowStrips: Array<[number, number, number, number]> = [];
  for (const b of basins) {
    const midX = (b.minX + b.maxX) * 0.5;
    const midZ = (b.minZ + b.maxZ) * 0.5;
    glowStrips.push([midX, 0.08, midZ, 0]);
    glowStrips.push([b.minX + 0.4, 0.08, midZ, 0]);
    glowStrips.push([b.maxX - 0.4, 0.08, midZ, 0]);
  }
  root.add(
    createBoxInstances(
      materials.lightPanel,
      glowStrips.length,
      [1.8, 0.04, 0.12],
      (i, dummy) => {
        const g = glowStrips[i]!;
        dummy.position.set(g[0], g[1], g[2]);
        dummy.rotation.y = g[3];
      },
    ),
  );

  // Sparse underwater point lights for caustic bloom feel
  for (let i = 0; i < basins.length; i++) {
    if (i % 2 !== 0) continue;
    const b = basins[i]!;
    const pl = lighting.point(0x7ee8f0, 1.6, 14, 2);
    pl.position.set(
      (b.minX + b.maxX) * 0.5,
      0.35,
      (b.minZ + b.maxZ) * 0.5,
    );
    lights.add(pl);
  }

  // Recessed ceiling lights
  const lightPlacements: CeilingLightPlacement[] = [];
  // Vestibule
  for (let x = 33; x <= 45; x += 3) {
    lightPlacements.push({ x, y: LOW_H - 0.06, z: 5 });
  }
  // Main hall grid
  for (let x = 14; x <= 64; x += 5) {
    for (let z = 12; z <= 36; z += 5) {
      if (rand() < 0.08) continue; // occasional dead tube
      lightPlacements.push({ x, y: LOW_H - 0.06, z });
    }
  }
  // West wing
  for (let z = 15; z <= 40; z += 4) {
    lightPlacements.push({ x: 7, y: LOW_H - 0.06, z });
  }
  // East lanes
  for (let z = 13; z <= 50; z += 3.5) {
    lightPlacements.push({ x: 73, y: LOW_H - 0.06, z });
  }
  // Tall atrium — higher recessed cans
  for (let x = 26; x <= 52; x += 6) {
    for (let z = 42; z <= 50; z += 5) {
      lightPlacements.push({ x, y: TALL_H - 0.1, z });
    }
  }
  // Exit vestibule
  for (let x = 34; x <= 44; x += 3.5) {
    lightPlacements.push({ x, y: LOW_H - 0.06, z: 58 });
    lightPlacements.push({ x, y: LOW_H - 0.06, z: 63 });
  }

  addCeilingLights(root, lights, materials, lighting, lightPlacements, {
    panelW: 1.35,
    panelD: 0.42,
    lightEvery: 5,
    color: 0xc8f0f4,
    intensity: 1.25,
    distance: 11,
  });

  lights.add(lighting.ambient(0x7ec8c8, 0.2));

  const exitLight = lighting.point(0xa8fff0, 3.2, 16, 2);
  exitLight.position.set(39, 2.4, 64.2);
  lights.add(exitLight);

  // Enemy spawns in alcoves / lane ends / atrium corners
  const enemySpawns: Vector3[] = [
    new Vector3(2, 0, 16),
    new Vector3(2, 0, 24),
    new Vector3(2, 0, 32),
    new Vector3(2, 0, 38),
    new Vector3(74, 0, 14.5),
    new Vector3(74, 0, 23.5),
    new Vector3(74, 0, 33.5),
    new Vector3(74, 0, 44),
    new Vector3(22, 0, 48),
    new Vector3(56, 0, 48),
    new Vector3(12, 0, 20),
    new Vector3(64, 0, 22),
    new Vector3(50, 0, 58),
    new Vector3(28, 0, 60),
  ];

  const spawn: [number, number, number] = [39, 1.7, 4.2];
  const exitPosition = new Vector3(39, 1.4, 65.2);

  const meta: LevelMeta = {
    id: "poolrooms",
    name: "POOL THRESHOLD",
    objective:
      "Find the dry exit. The water has no bottom you can trust.",
    fogColor: 0x7ec8c8,
    fogNear: 4,
    fogFar: 36,
    ambient: 0.2,
    spawn,
  };

  // Merge column colliders into batch list (already pushed above into batch.colliders after flush — they still accumulate)
  return {
    root,
    colliders: batch.colliders,
    lights,
    enemySpawns,
    exitPosition,
    meta,
  };
}

/** Tall rectangular “arch” trim around an opening (no true curve — liminal flat). */
function addArchOpening(
  batch: GeometryBatcher,
  materials: MaterialLib,
  cx: number,
  cz: number,
  facing: "x" | "z",
  width: number,
  height: number,
): void {
  addDoorFrame(batch, materials, cx, cz, facing, {
    width,
    height: height * 0.92,
    depth: 0.22,
    glowing: false,
  });
  // Soft reveal panel (non-collide) suggesting deeper space beyond
  if (facing === "z") {
    batch.addBox(
      "trim",
      materials.trim,
      width * 0.95,
      0.08,
      0.06,
      cx,
      height * 0.9,
      cz,
      { collide: false },
    );
  } else {
    batch.addBox(
      "trim",
      materials.trim,
      0.06,
      0.08,
      width * 0.95,
      cx,
      height * 0.9,
      cz,
      { collide: false },
    );
  }
}

function addBasin(
  batch: GeometryBatcher,
  materials: MaterialLib,
  waterGroup: Group,
  waterMat: Material,
  basin: Basin,
): void {
  const w = basin.maxX - basin.minX;
  const d = basin.maxZ - basin.minZ;
  const cx = (basin.minX + basin.maxX) * 0.5;
  const cz = (basin.minZ + basin.maxZ) * 0.5;
  const waterY = basin.waterY ?? 0.2;
  const curbH = 0.28;
  const curbT = 0.22;

  // Tile curb around basin (solid ledge so player stays on deck)
  batch.addBox(
    "trim",
    materials.trim,
    w + curbT * 2,
    curbH,
    curbT,
    cx,
    curbH * 0.5,
    basin.minZ - curbT * 0.5,
    { collide: true },
  );
  batch.addBox(
    "trim",
    materials.trim,
    w + curbT * 2,
    curbH,
    curbT,
    cx,
    curbH * 0.5,
    basin.maxZ + curbT * 0.5,
    { collide: true },
  );
  batch.addBox(
    "trim",
    materials.trim,
    curbT,
    curbH,
    d,
    basin.minX - curbT * 0.5,
    curbH * 0.5,
    cz,
    { collide: true },
  );
  batch.addBox(
    "trim",
    materials.trim,
    curbT,
    curbH,
    d,
    basin.maxX + curbT * 0.5,
    curbH * 0.5,
    cz,
    { collide: true },
  );

  // Water surface (visual only)
  const geo = new PlaneGeometry(w * 0.98, d * 0.98);
  const mesh = new Mesh(geo, waterMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, waterY, cz);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  waterGroup.add(mesh);

  // Soft submerged floor tint (darker tile plane under water)
  batch.addBox(
    "accent",
    materials.accent,
    w * 0.96,
    0.03,
    d * 0.96,
    cx,
    0.02,
    cz,
    { collide: false },
  );
}
