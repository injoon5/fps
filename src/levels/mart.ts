/**
 * Aisle Zero — vast Costco / big-box liminal warehouse.
 * High ceiling, parallel empty shelves, cold fluorescents, loading-dock exit.
 */

import { Group, Vector3 } from "three";
import type { LevelBuildResult, LevelMeta } from "../types";
import {
  GeometryBatcher,
  addCeilingLights,
  addDoorFrame,
  createBoxInstances,
  createCylinderInstances,
  createFallbackLighting,
  createFallbackMaterials,
  mulberry32,
  type CeilingLightPlacement,
  type LightLib,
  type MaterialLib,
} from "./geometry";

const WIDTH = 72;
const DEPTH = 56;
const HEIGHT = 9.2;
const WALL_T = 0.35;
const AISLE_COUNT = 9;
const SHELF_H = 5.8;
const SHELF_D = 1.15;
const DOCK_W = 14;
const DOCK_D = 6;

export function buildMartLevel(
  matLib?: MaterialLib,
  lightLib?: LightLib,
): LevelBuildResult {
  const materials = matLib ?? createFallbackMaterials("mart");
  const lighting = lightLib ?? createFallbackLighting();
  const rand = mulberry32(0xa151e0);
  const root = new Group();
  root.name = "level-mart";
  const lights = new Group();
  lights.name = "lights-mart";
  const batch = new GeometryBatcher();

  const dockX = WIDTH * 0.5;
  const sideW = (WIDTH - DOCK_W) * 0.5;

  // Warehouse shell
  batch.addBox(
    "floor",
    materials.floor,
    WIDTH,
    0.15,
    DEPTH,
    WIDTH * 0.5,
    -0.075,
    DEPTH * 0.5,
    { collide: true },
  );
  batch.addBox(
    "ceiling",
    materials.ceiling,
    WIDTH,
    0.2,
    DEPTH,
    WIDTH * 0.5,
    HEIGHT + 0.1,
    DEPTH * 0.5,
    { collide: false },
  );

  // Outer walls — south / west / east full; north has loading-dock gap
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

  // Loading dock bay
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    HEIGHT * 0.72,
    DOCK_D,
    dockX - DOCK_W * 0.5,
    HEIGHT * 0.36,
    DEPTH + DOCK_D * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    HEIGHT * 0.72,
    DOCK_D,
    dockX + DOCK_W * 0.5,
    HEIGHT * 0.36,
    DEPTH + DOCK_D * 0.5,
    { collide: true },
  );
  batch.addBox(
    "floor",
    materials.floor,
    DOCK_W,
    0.15,
    DOCK_D,
    dockX,
    -0.075,
    DEPTH + DOCK_D * 0.5,
    { collide: true },
  );
  batch.addBox(
    "ceiling",
    materials.ceiling,
    DOCK_W,
    0.2,
    DOCK_D,
    dockX,
    HEIGHT * 0.72,
    DEPTH + DOCK_D * 0.5,
    { collide: false },
  );

  // Structural columns
  for (let i = 0; i < 6; i++) {
    const x = 8 + i * 11;
    addColumn(batch, materials, x, 4);
    addColumn(batch, materials, x, DEPTH - 4);
  }

  batch.flush(root);

  // --- Instanced shelving aisles ---
  const aisleSpanZ0 = 6;
  const aisleSpanZ1 = DEPTH - 8;
  const aisleLen = aisleSpanZ1 - aisleSpanZ0;
  const marginX = 5;
  const usableW = WIDTH - marginX * 2;
  const aislePitch = usableW / (AISLE_COUNT - 1);
  const segLen = aisleLen / 7;

  type ShelfPlacement = { x: number; y: number; z: number; rotY: number };
  const uprights: ShelfPlacement[] = [];
  const decks: ShelfPlacement[] = [];
  const boxes: ShelfPlacement[] = [];
  const collidersExtra = batch.colliders;

  for (let a = 0; a < AISLE_COUNT; a++) {
    const x = marginX + a * aislePitch;
    for (let s = 0; s < 7; s++) {
      const z =
        aisleSpanZ0 + (s + 0.5) * segLen + (rand() - 0.5) * 0.4;
      uprights.push({ x: x - SHELF_D * 0.45, y: SHELF_H * 0.5, z, rotY: 0 });
      uprights.push({ x: x + SHELF_D * 0.45, y: SHELF_H * 0.5, z, rotY: 0 });

      for (const y of [1.2, 2.8, 4.4]) {
        decks.push({ x, y, z, rotY: 0 });
      }

      if (rand() < 0.35) {
        boxes.push({
          x: x + (rand() - 0.5) * 0.5,
          y: 1.2 + rand() * 0.4,
          z: z + (rand() - 0.5) * 0.8,
          rotY: rand() * 0.2,
        });
      }
      if (rand() < 0.2) {
        boxes.push({
          x: x + (rand() - 0.5) * 0.4,
          y: 2.8 + rand() * 0.3,
          z,
          rotY: 0,
        });
      }

      collidersExtra.push({
        minX: x - SHELF_D * 0.55,
        maxX: x + SHELF_D * 0.55,
        minY: 0,
        maxY: SHELF_H,
        minZ: z - segLen * 0.42,
        maxZ: z + segLen * 0.42,
      });
    }
  }

  root.add(
    createBoxInstances(
      materials.metal,
      uprights.length,
      [0.12, SHELF_H, segLen * 0.85],
      (i, dummy) => {
        const p = uprights[i]!;
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.y = p.rotY;
      },
    ),
  );

  root.add(
    createBoxInstances(
      materials.prop,
      decks.length,
      [SHELF_D * 1.05, 0.06, segLen * 0.8],
      (i, dummy) => {
        const p = decks[i]!;
        dummy.position.set(p.x, p.y, p.z);
      },
    ),
  );

  if (boxes.length > 0) {
    root.add(
      createBoxInstances(
        materials.accent,
        boxes.length,
        [0.7, 0.55, 0.55],
        (i, dummy) => {
          const p = boxes[i]!;
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.y = p.rotY;
          const s = 0.7 + rand() * 0.6;
          dummy.scale.set(s, s * (0.8 + rand() * 0.5), s);
        },
      ),
    );
  }

  // Pallet stacks in cross-aisles
  const palletPositions: Array<[number, number, number]> = [];
  for (let i = 0; i < 18; i++) {
    const ax = Math.floor(rand() * (AISLE_COUNT - 1));
    const x = marginX + (ax + 0.5) * aislePitch;
    const z = 10 + rand() * (DEPTH - 22);
    palletPositions.push([x, 0.35 + rand() * 0.8, z]);
    collidersExtra.push({
      minX: x - 0.6,
      maxX: x + 0.6,
      minY: 0,
      maxY: 1.4,
      minZ: z - 0.6,
      maxZ: z + 0.6,
    });
  }
  root.add(
    createBoxInstances(
      materials.prop,
      palletPositions.length,
      [1.1, 0.7, 1.1],
      (i, dummy) => {
        const p = palletPositions[i]!;
        dummy.position.set(p[0], p[1], p[2]);
        dummy.rotation.y = rand() * Math.PI * 0.15;
      },
    ),
  );

  // Shopping carts
  const cartCount = 10;
  const cartPositions: Array<{
    x: number;
    y: number;
    z: number;
    rotY: number;
    tipped: boolean;
  }> = [];
  for (let i = 0; i < cartCount; i++) {
    cartPositions.push({
      x: 4 + rand() * 8,
      y: i % 3 === 0 ? 0.28 : 0.42,
      z: 8 + rand() * (DEPTH - 16),
      rotY: rand() * Math.PI * 2,
      tipped: i % 3 === 0,
    });
  }
  root.add(
    createBoxInstances(materials.metal, cartCount, [0.7, 0.85, 1.1], (i, dummy) => {
      const c = cartPositions[i]!;
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.y = c.rotY;
      dummy.rotation.z = c.tipped ? 0.55 : 0;
    }),
  );
  for (const c of cartPositions) {
    if (c.tipped) continue;
    collidersExtra.push({
      minX: c.x - 0.4,
      maxX: c.x + 0.4,
      minY: 0,
      maxY: 0.9,
      minZ: c.z - 0.55,
      maxZ: c.z + 0.55,
    });
  }

  // Yellow safety poles
  const poleSpots: Array<[number, number]> = [];
  for (let a = 0; a < AISLE_COUNT; a++) {
    const x = marginX + a * aislePitch;
    poleSpots.push([x - SHELF_D * 0.7, aisleSpanZ0 - 0.8]);
    poleSpots.push([x + SHELF_D * 0.7, aisleSpanZ0 - 0.8]);
    poleSpots.push([x - SHELF_D * 0.7, aisleSpanZ1 + 0.8]);
    poleSpots.push([x + SHELF_D * 0.7, aisleSpanZ1 + 0.8]);
  }
  poleSpots.push([dockX - DOCK_W * 0.45, DEPTH + 1]);
  poleSpots.push([dockX + DOCK_W * 0.45, DEPTH + 1]);

  root.add(
    createCylinderInstances(
      materials.accent,
      poleSpots.length,
      0.08,
      0.08,
      1.35,
      (i, dummy) => {
        const p = poleSpots[i]!;
        dummy.position.set(p[0], 0.675, p[1]);
      },
    ),
  );
  for (const [px, pz] of poleSpots) {
    collidersExtra.push({
      minX: px - 0.12,
      maxX: px + 0.12,
      minY: 0,
      maxY: 1.35,
      minZ: pz - 0.12,
      maxZ: pz + 0.12,
    });
  }

  // Cold fluorescent strips along aisles
  const lightPlacements: CeilingLightPlacement[] = [];
  for (let a = 0; a < AISLE_COUNT - 1; a++) {
    const x = marginX + (a + 0.5) * aislePitch;
    for (let z = aisleSpanZ0 + 2; z < aisleSpanZ1; z += 4.5) {
      lightPlacements.push({ x, y: HEIGHT - 0.4, z });
    }
  }
  lightPlacements.push({ x: dockX - 3, y: HEIGHT * 0.65, z: DEPTH + 2 });
  lightPlacements.push({ x: dockX + 3, y: HEIGHT * 0.65, z: DEPTH + 2 });

  addCeilingLights(root, lights, materials, lighting, lightPlacements, {
    panelW: 3.2,
    panelD: 0.35,
    panelH: 0.06,
    lightEvery: 3,
    color: 0xdde8ff,
    intensity: 1.35,
    distance: 14,
  });

  lights.add(lighting.ambient(0xa8b0c0, 0.18));

  // Red EXIT glow at loading dock
  const exitBatch = new GeometryBatcher();
  addDoorFrame(exitBatch, materials, dockX, DEPTH + DOCK_D - 0.2, "z", {
    width: 2.4,
    height: 3.2,
    glowing: true,
  });
  exitBatch.addBox(
    "exitglow",
    materials.exit,
    2.8,
    0.45,
    0.08,
    dockX,
    3.6,
    DEPTH + DOCK_D - 0.15,
    { collide: false },
  );
  exitBatch.flush(root);
  for (const c of exitBatch.colliders) collidersExtra.push(c);

  const exitLight = lighting.point(0xff2233, 3.5, 18, 2);
  exitLight.position.set(dockX, 3.2, DEPTH + DOCK_D - 1);
  lights.add(exitLight);

  const enemySpawns: Vector3[] = [];
  for (let a = 1; a < AISLE_COUNT - 1; a++) {
    const x = marginX + a * aislePitch;
    if (a % 2 === 0) {
      enemySpawns.push(new Vector3(x + SHELF_D * 0.9, 0, DEPTH * 0.35));
      enemySpawns.push(new Vector3(x - SHELF_D * 0.9, 0, DEPTH * 0.72));
    } else {
      enemySpawns.push(new Vector3(x, 0, DEPTH * 0.55));
    }
  }
  enemySpawns.push(new Vector3(WIDTH - 6, 0, DEPTH - 10));
  enemySpawns.push(new Vector3(6, 0, DEPTH * 0.6));

  const spawn: [number, number, number] = [WIDTH * 0.5, 1.7, 4.5];

  const meta: LevelMeta = {
    id: "mart",
    name: "Aisle Zero",
    objective:
      "Reach the loading dock EXIT. The aisles do not end where they should.",
    fogColor: 0x9aa3b0,
    fogNear: 8,
    fogFar: 42,
    ambient: 0.18,
    spawn,
  };

  return {
    root,
    colliders: collidersExtra,
    lights,
    enemySpawns,
    exitPosition: new Vector3(dockX, 1.5, DEPTH + DOCK_D - 0.8),
    meta,
  };
}

function addColumn(
  batch: GeometryBatcher,
  materials: MaterialLib,
  x: number,
  z: number,
): void {
  batch.addBox(
    "metal",
    materials.metal,
    0.55,
    HEIGHT,
    0.55,
    x,
    HEIGHT * 0.5,
    z,
    { collide: true },
  );
}
