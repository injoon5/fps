/**
 * Soft Lobby — empty hotel corridors, atrium void, elevator bank.
 * Warm sconces, patterned carpet, glowing service stair exit.
 */

import { Group, Vector3 } from "three";
import type { LevelBuildResult, LevelMeta } from "../types";
import {
  GeometryBatcher,
  addCeilingLights,
  addDoorFrame,
  addPillar,
  addRoom,
  createBoxInstances,
  createFallbackLighting,
  createFallbackMaterials,
  mulberry32,
  type CeilingLightPlacement,
  type LightLib,
  type MaterialLib,
} from "./geometry";

const HEIGHT = 3.4;
const MEZZ = 3.5;
const ATRIUM_H = 7.2;
const WALL_T = 0.2;

export function buildHotelLevel(
  matLib?: MaterialLib,
  lightLib?: LightLib,
): LevelBuildResult {
  const materials = matLib ?? createFallbackMaterials("hotel");
  const lighting = lightLib ?? createFallbackLighting();
  const rand = mulberry32(0x5017e1);
  const root = new Group();
  root.name = "level-hotel";
  const lights = new Group();
  lights.name = "lights-hotel";
  const batch = new GeometryBatcher();

  // --- Main lobby atrium (center void with mezzanine) ---
  const atrium = { minX: 14, maxX: 30, minZ: 10, maxZ: 26 };
  addRoom(batch, materials, {
    minX: atrium.minX,
    maxX: atrium.maxX,
    minZ: atrium.minZ,
    maxZ: atrium.maxZ,
    height: ATRIUM_H,
    wallThickness: WALL_T,
    walls: { n: true, s: true, e: true, w: true },
    doors: {
      s: [0.35, 0.65], // entrance from south corridor
      n: [0.4, 0.6], // toward north wing
      e: [0.3, 0.55],
      w: [0.3, 0.55],
    },
    floor: true,
    ceiling: true,
  });

  // Mezzanine floor ring (opening in center)
  const voidMargin = 2.2;
  const mezzY = MEZZ;
  // Four mezzanine slabs around atrium void
  const slabs: Array<[number, number, number, number, number, number]> = [
    // south ledge
    [
      atrium.maxX - atrium.minX,
      0.18,
      voidMargin,
      (atrium.minX + atrium.maxX) * 0.5,
      mezzY,
      atrium.minZ + voidMargin * 0.5,
    ],
    // north ledge
    [
      atrium.maxX - atrium.minX,
      0.18,
      voidMargin,
      (atrium.minX + atrium.maxX) * 0.5,
      mezzY,
      atrium.maxZ - voidMargin * 0.5,
    ],
    // west ledge
    [
      voidMargin,
      0.18,
      atrium.maxZ - atrium.minZ - voidMargin * 2,
      atrium.minX + voidMargin * 0.5,
      mezzY,
      (atrium.minZ + atrium.maxZ) * 0.5,
    ],
    // east ledge
    [
      voidMargin,
      0.18,
      atrium.maxZ - atrium.minZ - voidMargin * 2,
      atrium.maxX - voidMargin * 0.5,
      mezzY,
      (atrium.minZ + atrium.maxZ) * 0.5,
    ],
  ];
  for (const [w, h, d, cx, cy, cz] of slabs) {
    batch.addBox("floor", materials.floor, w, h, d, cx, cy, cz, {
      collide: true,
    });
  }

  // Mezzanine railing (thin trim, collide low barrier)
  const railH = 0.95;
  const railY = mezzY + railH * 0.5;
  const vx0 = atrium.minX + voidMargin;
  const vx1 = atrium.maxX - voidMargin;
  const vz0 = atrium.minZ + voidMargin;
  const vz1 = atrium.maxZ - voidMargin;
  batch.addBox("trim", materials.trim, vx1 - vx0, railH, 0.08, (vx0 + vx1) * 0.5, railY, vz0, {
    collide: true,
  });
  batch.addBox("trim", materials.trim, vx1 - vx0, railH, 0.08, (vx0 + vx1) * 0.5, railY, vz1, {
    collide: true,
  });
  batch.addBox("trim", materials.trim, 0.08, railH, vz1 - vz0, vx0, railY, (vz0 + vz1) * 0.5, {
    collide: true,
  });
  batch.addBox("trim", materials.trim, 0.08, railH, vz1 - vz0, vx1, railY, (vz0 + vz1) * 0.5, {
    collide: true,
  });

  // Atrium pillars
  addPillar(batch, materials.trim, atrium.minX + 1.2, atrium.minZ + 1.2, 0, ATRIUM_H, 0.4);
  addPillar(batch, materials.trim, atrium.maxX - 1.2, atrium.minZ + 1.2, 0, ATRIUM_H, 0.4);
  addPillar(batch, materials.trim, atrium.minX + 1.2, atrium.maxZ - 1.2, 0, ATRIUM_H, 0.4);
  addPillar(batch, materials.trim, atrium.maxX - 1.2, atrium.maxZ - 1.2, 0, ATRIUM_H, 0.4);

  // --- South entrance corridor ---
  addRoom(batch, materials, {
    minX: 16,
    maxX: 28,
    minZ: 0,
    maxZ: 10,
    height: HEIGHT,
    doors: {
      n: [0.35, 0.65],
      s: [0.4, 0.6],
    },
    walls: { n: false, s: true, e: true, w: true },
  });

  // --- East wing corridor (long repeating doors) ---
  const eastCorr = { minX: 30, maxX: 52, minZ: 14, maxZ: 20 };
  addRoom(batch, materials, {
    ...eastCorr,
    height: HEIGHT,
    doors: {
      w: [0.25, 0.75],
      e: [0.35, 0.65],
    },
    walls: { n: true, s: true, e: true, w: false },
  });

  // --- West wing corridor ---
  const westCorr = { minX: -8, maxX: 14, minZ: 14, maxZ: 20 };
  addRoom(batch, materials, {
    ...westCorr,
    height: HEIGHT,
    doors: {
      e: [0.25, 0.75],
      w: [0.35, 0.65],
    },
    walls: { n: true, s: true, e: false, w: true },
  });

  // --- North corridor toward exit ---
  addRoom(batch, materials, {
    minX: 16,
    maxX: 28,
    minZ: 26,
    maxZ: 44,
    height: HEIGHT,
    doors: {
      s: [0.4, 0.6],
      n: [0.38, 0.62],
    },
    walls: { n: true, s: false, e: true, w: true },
  });

  // Cross spur (ice machine niche on west of north corridor)
  addRoom(batch, materials, {
    minX: 8,
    maxX: 16,
    minZ: 30,
    maxZ: 36,
    height: HEIGHT,
    doors: {
      e: [0.3, 0.7],
    },
    walls: { n: true, s: true, e: false, w: true },
  });

  // Elevator bank niche (east of atrium)
  addRoom(batch, materials, {
    minX: 30,
    maxX: 36,
    minZ: 20,
    maxZ: 26,
    height: HEIGHT,
    doors: {
      w: [0.2, 0.8],
      s: [0.2, 0.8],
    },
    walls: { n: true, s: false, e: true, w: false },
  });

  // Service stair / rooftop exit vestibule
  addRoom(batch, materials, {
    minX: 18,
    maxX: 26,
    minZ: 44,
    maxZ: 52,
    height: HEIGHT,
    doors: {
      s: [0.35, 0.65],
    },
    walls: { n: true, s: false, e: true, w: true },
  });

  // Patterned carpet runners (accent strips down corridors)
  const runners: Array<[number, number, number, number, number, number]> = [
    [4, 0.02, 9, 22, 0.02, 5],
    [20, 0.02, 4, 41, 0.02, 17],
    [4, 0.02, 16, 22, 0.02, 35],
    [10, 0.02, 4, 12, 0.02, 33],
  ];
  for (const [w, h, d, cx, cy, cz] of runners) {
    batch.addBox("accent", materials.accent, w, h, d, cx, cy, cz, {
      collide: false,
    });
  }

  // Ice machine block in niche
  batch.addBox("metal", materials.metal, 1.4, 1.7, 0.9, 10.5, 0.85, 33, {
    collide: true,
  });
  batch.addBox("prop", materials.prop, 0.5, 0.35, 0.5, 12.2, 0.2, 34.5, {
    collide: true,
  });

  // Elevator doors (closed panels)
  for (let i = 0; i < 3; i++) {
    const z = 21.2 + i * 1.55;
    batch.addBox("metal", materials.metal, 0.08, 2.3, 1.2, 35.5, 1.15, z, {
      collide: true,
    });
    batch.addBox("trim", materials.trim, 0.12, 2.5, 1.4, 35.55, 1.25, z, {
      collide: false,
    });
  }

  // Front desk silhouette in atrium
  batch.addBox("prop", materials.prop, 6, 1.15, 1.2, 22, 0.575, 13.5, {
    collide: true,
  });
  batch.addBox("trim", materials.trim, 6.2, 0.08, 1.35, 22, 1.2, 13.5, {
    collide: false,
  });

  // Glowing service / rooftop stair exit
  addDoorFrame(batch, materials, 22, 51.7, "z", {
    width: 1.3,
    height: 2.4,
    glowing: true,
  });
  // Stair hint
  for (let i = 0; i < 5; i++) {
    batch.addBox(
      "trim",
      materials.trim,
      1.4,
      0.18,
      0.45,
      22,
      0.1 + i * 0.22,
      49.5 + i * 0.4,
      { collide: true },
    );
  }

  batch.flush(root);

  // --- Instanced guest room doors along corridors ---
  const doorPositions: Array<{ x: number; y: number; z: number; rotY: number }> =
    [];
  // East corridor south wall doors
  for (let x = 32; x < 50; x += 2.8) {
    doorPositions.push({ x, y: 1.1, z: eastCorr.minZ + 0.12, rotY: 0 });
    doorPositions.push({ x, y: 1.1, z: eastCorr.maxZ - 0.12, rotY: Math.PI });
  }
  // West corridor
  for (let x = -6; x < 12; x += 2.8) {
    doorPositions.push({ x, y: 1.1, z: westCorr.minZ + 0.12, rotY: 0 });
    doorPositions.push({ x, y: 1.1, z: westCorr.maxZ - 0.12, rotY: Math.PI });
  }
  // North corridor
  for (let z = 28; z < 42; z += 2.8) {
    doorPositions.push({ x: 16.12, y: 1.1, z, rotY: Math.PI * 0.5 });
    doorPositions.push({ x: 27.88, y: 1.1, z, rotY: -Math.PI * 0.5 });
  }

  const doorMesh = createBoxInstances(
    materials.prop,
    doorPositions.length,
    [0.9, 2.15, 0.06],
    (i, dummy) => {
      const p = doorPositions[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.y = p.rotY;
    },
  );
  root.add(doorMesh);

  // Door number plates (tiny accent)
  const plateMesh = createBoxInstances(
    materials.accent,
    doorPositions.length,
    [0.18, 0.1, 0.02],
    (i, dummy) => {
      const p = doorPositions[i]!;
      const ox = Math.sin(p.rotY) * 0.55;
      const oz = Math.cos(p.rotY) * 0.55;
      dummy.position.set(p.x + ox, 1.7, p.z + oz);
      dummy.rotation.y = p.rotY;
    },
  );
  root.add(plateMesh);

  // Wall sconces (instanced) + warm point lights
  const sconceSpots: Array<[number, number, number]> = [];
  for (let x = 33; x < 50; x += 5.5) {
    sconceSpots.push([x, 2.1, eastCorr.minZ + 0.15]);
    sconceSpots.push([x, 2.1, eastCorr.maxZ - 0.15]);
  }
  for (let x = -5; x < 12; x += 5.5) {
    sconceSpots.push([x, 2.1, westCorr.minZ + 0.15]);
    sconceSpots.push([x, 2.1, westCorr.maxZ - 0.15]);
  }
  for (let z = 29; z < 42; z += 5) {
    sconceSpots.push([16.15, 2.1, z]);
    sconceSpots.push([27.85, 2.1, z]);
  }
  // Atrium sconces
  sconceSpots.push([15, 2.4, 12]);
  sconceSpots.push([29, 2.4, 12]);
  sconceSpots.push([15, 2.4, 24]);
  sconceSpots.push([29, 2.4, 24]);

  root.add(
    createBoxInstances(materials.lightPanel, sconceSpots.length, [0.28, 0.35, 0.12], (i, dummy) => {
      const s = sconceSpots[i]!;
      dummy.position.set(s[0], s[1], s[2]);
    }),
  );

  for (let i = 0; i < sconceSpots.length; i += 2) {
    const s = sconceSpots[i]!;
    const pl = lighting.point(0xffd8a8, 0.85, 7, 2);
    pl.position.set(s[0], s[1], s[2]);
    lights.add(pl);
  }

  // Soft ceiling cans in corridors
  const lightPlacements: CeilingLightPlacement[] = [];
  for (let x = 18; x <= 26; x += 3) {
    for (let z = 2; z <= 8; z += 3) {
      lightPlacements.push({ x, y: HEIGHT - 0.08, z });
    }
  }
  for (let x = 32; x < 50; x += 3.5) {
    lightPlacements.push({
      x,
      y: HEIGHT - 0.08,
      z: (eastCorr.minZ + eastCorr.maxZ) * 0.5,
    });
  }
  for (let x = -6; x < 12; x += 3.5) {
    lightPlacements.push({
      x,
      y: HEIGHT - 0.08,
      z: (westCorr.minZ + westCorr.maxZ) * 0.5,
    });
  }
  for (let z = 28; z < 50; z += 3.5) {
    lightPlacements.push({ x: 22, y: HEIGHT - 0.08, z });
  }
  // Atrium chandelier stand-in
  lightPlacements.push({ x: 22, y: ATRIUM_H - 0.5, z: 18 });
  lightPlacements.push({ x: 20, y: ATRIUM_H - 0.5, z: 16 });
  lightPlacements.push({ x: 24, y: ATRIUM_H - 0.5, z: 20 });

  addCeilingLights(root, lights, materials, lighting, lightPlacements, {
    panelW: 0.55,
    panelD: 0.55,
    lightEvery: 2,
    color: 0xffe4c4,
    intensity: 0.9,
    distance: 9,
  });

  lights.add(lighting.ambient(0xc8b090, 0.2));

  const exitLight = lighting.point(0xffcc66, 2.8, 14, 2);
  exitLight.position.set(22, 2.2, 50.5);
  lights.add(exitLight);

  // Enemy spawns in corridor dead ends / elevator alcove / ice niche
  const enemySpawns: Vector3[] = [
    new Vector3(48, 0, 17),
    new Vector3(-5, 0, 17),
    new Vector3(33, 0, 23),
    new Vector3(10, 0, 33),
    new Vector3(22, 0, 40),
    new Vector3(17, 0, 18),
    new Vector3(27, 0, 22),
    new Vector3(40, 0, 15),
  ];

  // Extra random corridor lurkers
  for (let i = 0; i < 3; i++) {
    enemySpawns.push(
      new Vector3(34 + rand() * 12, 0, 15 + rand() * 4),
    );
  }

  const spawn: [number, number, number] = [22, 1.7, 3.5];

  const meta: LevelMeta = {
    id: "hotel",
    name: "Soft Lobby",
    objective: "Find the service stair. The elevators will not open.",
    fogColor: 0xc8b8a0,
    fogNear: 5,
    fogFar: 32,
    ambient: 0.2,
    spawn,
  };

  return {
    root,
    colliders: batch.colliders,
    lights,
    enemySpawns,
    exitPosition: new Vector3(22, 1.3, 51.2),
    meta,
  };
}
