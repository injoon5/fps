/**
 * Infinite Office — Kane Pixel corporate dread / Backrooms Level 4.
 * Endless beige cubicle maze, drop-ceiling fluorescents, red EXIT stairwell.
 */

import { Group, Vector3 } from "three";
import type { LevelBuildResult, LevelMeta } from "../types";
import {
  GeometryBatcher,
  addCeilingLights,
  addDoorFrame,
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

const WIDTH = 52;
const DEPTH = 44;
const HEIGHT = 2.72;
const WALL_T = 0.22;

const CELL_W = 2.55;
const CELL_D = 2.4;
const COLS = 16;
const ROWS = 13;
const ORIGIN_X = 3.2;
const ORIGIN_Z = 5.0;

const PANEL_H = 1.22;
const PANEL_T = 0.07;
const DESK_H = 0.72;

type Placement = { x: number; y: number; z: number; rotY: number };

function cellCenter(cx: number, cz: number): [number, number] {
  return [ORIGIN_X + (cx + 0.5) * CELL_W, ORIGIN_Z + (cz + 0.5) * CELL_D];
}

export function buildOfficeLevel(
  matLib?: MaterialLib,
  lightLib?: LightLib,
): LevelBuildResult {
  const materials = matLib ?? createFallbackMaterials("office");
  const lighting = lightLib ?? createFallbackLighting();
  const rand = mulberry32(0x0ff1ce);
  const root = new Group();
  root.name = "level-office";
  const lights = new Group();
  lights.name = "lights-office";
  const batch = new GeometryBatcher();

  // --- Shell ---
  batch.addBox(
    "floor",
    materials.floor,
    WIDTH,
    0.12,
    DEPTH,
    WIDTH * 0.5,
    -0.06,
    DEPTH * 0.5,
    { collide: true },
  );
  batch.addBox(
    "ceiling",
    materials.ceiling,
    WIDTH,
    0.1,
    DEPTH,
    WIDTH * 0.5,
    HEIGHT + 0.05,
    DEPTH * 0.5,
    { collide: false },
  );

  // Perimeter walls (full height beige drywall)
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
    WIDTH,
    HEIGHT,
    WALL_T,
    WIDTH * 0.5,
    HEIGHT * 0.5,
    DEPTH + WALL_T * 0.5,
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

  // Occupancy grid — carve corridors for ~60+ irregular cubicle cells
  const occupied: boolean[][] = Array.from({ length: COLS }, () =>
    Array.from({ length: ROWS }, () => true),
  );

  // South entrance clear zone
  for (let x = 0; x < COLS; x++) {
    occupied[x]![0] = false;
    if (x >= 6 && x <= 9) occupied[x]![1] = false;
  }

  // Main E-W aisles
  for (const z of [4, 8, 11]) {
    for (let x = 0; x < COLS; x++) occupied[x]![z] = false;
  }

  // Main N-S corridors
  for (const x of [0, 5, 10, 15]) {
    for (let z = 0; z < ROWS; z++) occupied[x]![z] = false;
  }

  // Irregular bite-outs for liminal broken rhythm
  for (let i = 0; i < 22; i++) {
    const x = 1 + Math.floor(rand() * (COLS - 2));
    const z = 1 + Math.floor(rand() * (ROWS - 2));
    if (rand() < 0.55) occupied[x]![z] = false;
  }

  // Keep north path toward exit clear
  for (let x = 6; x <= 9; x++) {
    occupied[x]![ROWS - 1] = false;
    occupied[x]![ROWS - 2] = false;
  }

  let cubicleCount = 0;
  for (let x = 0; x < COLS; x++) {
    for (let z = 0; z < ROWS; z++) {
      if (occupied[x]![z]) cubicleCount++;
    }
  }
  // Guarantee density if carve overshot
  if (cubicleCount < 60) {
    for (let z = 1; z < ROWS - 1 && cubicleCount < 64; z++) {
      for (let x = 1; x < COLS - 1 && cubicleCount < 64; x++) {
        if (
          !occupied[x]![z] &&
          x !== 5 &&
          x !== 10 &&
          z !== 4 &&
          z !== 8 &&
          z !== 0
        ) {
          occupied[x]![z] = true;
          cubicleCount++;
        }
      }
    }
  }

  const panelPlacements: Placement[] = [];
  const deskPlacements: Placement[] = [];
  const monitorPlacements: Placement[] = [];
  const chairPlacements: Placement[] = [];
  const colliders = batch.colliders;

  const pushPanel = (
    cx: number,
    cz: number,
    alongX: boolean,
    halfSpan: number,
  ): void => {
    panelPlacements.push({
      x: cx,
      y: PANEL_H * 0.5,
      z: cz,
      rotY: alongX ? 0 : Math.PI * 0.5,
    });
    const hw = alongX ? halfSpan : PANEL_T * 0.5;
    const hd = alongX ? PANEL_T * 0.5 : halfSpan;
    colliders.push({
      minX: cx - hw,
      maxX: cx + hw,
      minY: 0,
      maxY: PANEL_H,
      minZ: cz - hd,
      maxZ: cz + hd,
    });
  };

  for (let x = 0; x < COLS; x++) {
    for (let z = 0; z < ROWS; z++) {
      if (!occupied[x]![z]) continue;
      const [wx, wz] = cellCenter(x, z);
      const westOcc = x > 0 && occupied[x - 1]![z]!;
      const eastOcc = x < COLS - 1 && occupied[x + 1]![z]!;
      const southOcc = z > 0 && occupied[x]![z - 1]!;
      const northOcc = z < ROWS - 1 && occupied[x]![z + 1]!;
      const westOpen = !westOcc;
      const eastOpen = !eastOcc;
      const southOpen = !southOcc;
      const northOpen = !northOcc;

      // Emit each shared panel once (parity on owner cell)
      if (westOpen || (westOcc && (x + z) % 2 === 0)) {
        pushPanel(wx - CELL_W * 0.5, wz, false, CELL_D * 0.48);
      }
      if (eastOpen) {
        pushPanel(wx + CELL_W * 0.5, wz, false, CELL_D * 0.48);
      }
      if (southOpen || (southOcc && (x + z) % 2 === 0)) {
        pushPanel(wx, wz - CELL_D * 0.5, true, CELL_W * 0.48);
      }
      if (northOpen) {
        pushPanel(wx, wz + CELL_D * 0.5, true, CELL_W * 0.48);
      }

      // Opening faces nearest aisle (prefer south, then west)
      let openDir: "n" | "s" | "e" | "w" = "s";
      if (southOpen) openDir = "s";
      else if (northOpen) openDir = "n";
      else if (westOpen) openDir = "w";
      else if (eastOpen) openDir = "e";
      else openDir = "s";

      // Desk against wall opposite the opening
      let deskX = wx;
      let deskZ = wz;
      let deskRot = 0;
      switch (openDir) {
        case "s":
          deskZ = wz + CELL_D * 0.28;
          deskRot = 0;
          break;
        case "n":
          deskZ = wz - CELL_D * 0.28;
          deskRot = Math.PI;
          break;
        case "w":
          deskX = wx + CELL_W * 0.28;
          deskRot = -Math.PI * 0.5;
          break;
        case "e":
          deskX = wx - CELL_W * 0.28;
          deskRot = Math.PI * 0.5;
          break;
        default: {
          const _exhaustive: never = openDir;
          void _exhaustive;
        }
      }

      deskPlacements.push({
        x: deskX,
        y: DESK_H * 0.5,
        z: deskZ,
        rotY: deskRot,
      });
      colliders.push({
        minX: deskX - 0.55,
        maxX: deskX + 0.55,
        minY: 0,
        maxY: DESK_H,
        minZ: deskZ - 0.35,
        maxZ: deskZ + 0.35,
      });

      const fwdX = Math.sin(deskRot) * 0.05;
      const fwdZ = Math.cos(deskRot) * 0.05;
      monitorPlacements.push({
        x: deskX + fwdX,
        y: DESK_H + 0.22,
        z: deskZ + fwdZ,
        rotY: deskRot,
      });

      // Chair in opening
      const chairOff = 0.55 + rand() * 0.15;
      const chairX = deskX - Math.sin(deskRot) * chairOff;
      const chairZ = deskZ - Math.cos(deskRot) * chairOff;
      chairPlacements.push({
        x: chairX,
        y: 0.42,
        z: chairZ,
        rotY: deskRot + (rand() - 0.5) * 0.4,
      });
      if (rand() > 0.15) {
        colliders.push({
          minX: chairX - 0.28,
          maxX: chairX + 0.28,
          minY: 0,
          maxY: 0.85,
          minZ: chairZ - 0.28,
          maxZ: chairZ + 0.28,
        });
      }
    }
  }

  // --- Break room (west) ---
  addRoom(batch, materials, {
    minX: 0.2,
    maxX: 8.5,
    minZ: 18,
    maxZ: 26,
    height: HEIGHT,
    wallThickness: WALL_T,
    walls: { n: true, s: true, e: true, w: false },
    doors: { e: [0.35, 0.7] },
    floor: false,
    ceiling: false,
  });
  // Empty fridge silhouette
  batch.addBox("metal", materials.metal, 0.7, 1.7, 0.65, 1.4, 0.85, 19.2, {
    collide: true,
  });
  batch.addBox("prop", materials.prop, 0.55, 0.08, 0.5, 1.4, 1.55, 19.2, {
    collide: false,
  });
  // Water cooler
  batch.addBox("prop", materials.prop, 0.35, 1.05, 0.35, 3.2, 0.525, 24.5, {
    collide: true,
  });
  batch.addBox("trim", materials.trim, 0.32, 0.35, 0.32, 3.2, 1.25, 24.5, {
    collide: false,
  });
  // Break table
  batch.addBox("prop", materials.prop, 1.8, 0.08, 0.9, 5.2, 0.72, 22, {
    collide: true,
  });
  batch.addBox("metal", materials.metal, 0.08, 0.7, 0.08, 4.5, 0.35, 21.7, {
    collide: false,
  });
  batch.addBox("metal", materials.metal, 0.08, 0.7, 0.08, 5.9, 0.35, 22.3, {
    collide: false,
  });

  // --- Copy room (east) ---
  addRoom(batch, materials, {
    minX: 43,
    maxX: 51.5,
    minZ: 14,
    maxZ: 22,
    height: HEIGHT,
    wallThickness: WALL_T,
    walls: { n: true, s: true, e: false, w: true },
    doors: { w: [0.3, 0.65] },
    floor: false,
    ceiling: false,
  });
  // Copier bulk
  batch.addBox("metal", materials.metal, 1.4, 1.05, 0.85, 48.5, 0.525, 16.2, {
    collide: true,
  });
  batch.addBox("prop", materials.prop, 1.2, 0.15, 0.7, 48.5, 1.12, 16.2, {
    collide: false,
  });
  // Paper stacks
  for (let i = 0; i < 5; i++) {
    batch.addBox(
      "accent",
      materials.accent,
      0.35,
      0.12 + i * 0.02,
      0.28,
      45.5 + (i % 3) * 0.5,
      0.08 + i * 0.06,
      19.5 + Math.floor(i / 3) * 0.6,
      { collide: true },
    );
  }

  // --- Stairwell / EXIT vestibule (north) ---
  addRoom(batch, materials, {
    minX: 20,
    maxX: 32,
    minZ: 40,
    maxZ: 43.6,
    height: HEIGHT,
    wallThickness: WALL_T,
    walls: { n: true, s: false, e: true, w: true },
    doors: { s: [0.35, 0.65] },
    floor: false,
    ceiling: false,
  });

  const exitX = 26;
  const exitZ = 43.2;
  addDoorFrame(batch, materials, exitX, exitZ, "z", {
    width: 1.35,
    height: 2.25,
    glowing: true,
  });
  // EXIT sign
  batch.addBox(
    "exitglow",
    materials.exit,
    1.1,
    0.28,
    0.06,
    exitX,
    2.45,
    exitZ - 0.05,
    { collide: false },
  );
  // Stair hint steps into void
  for (let i = 0; i < 4; i++) {
    batch.addBox(
      "trim",
      materials.trim,
      1.4,
      0.14,
      0.4,
      exitX,
      0.08 + i * 0.16,
      exitZ - 0.55 - i * 0.35,
      { collide: true },
    );
  }

  batch.flush(root);

  // --- Instanced cubicle panels ---
  if (panelPlacements.length > 0) {
    root.add(
      createBoxInstances(
        materials.accent,
        panelPlacements.length,
        [1, PANEL_H, PANEL_T],
        (i, dummy) => {
          const p = panelPlacements[i]!;
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.y = p.rotY;
          // rotY 0 → span along X; rotY ±π/2 → span along Z (via rotated local X)
          const alongX = Math.abs(Math.sin(p.rotY)) < 0.1;
          dummy.scale.set(alongX ? CELL_W * 0.96 : CELL_D * 0.96, 1, 1);
        },
      ),
    );
  }

  // Desks
  if (deskPlacements.length > 0) {
    root.add(
      createBoxInstances(
        materials.prop,
        deskPlacements.length,
        [1.15, DESK_H, 0.65],
        (i, dummy) => {
          const p = deskPlacements[i]!;
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.y = p.rotY;
        },
      ),
    );
  }

  // Dead monitors — dark rectangles
  if (monitorPlacements.length > 0) {
    root.add(
      createBoxInstances(
        materials.metal,
        monitorPlacements.length,
        [0.48, 0.36, 0.06],
        (i, dummy) => {
          const p = monitorPlacements[i]!;
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.y = p.rotY;
          dummy.rotation.x = -0.08;
        },
      ),
    );
  }

  // Rolling chairs — cylinders
  if (chairPlacements.length > 0) {
    root.add(
      createCylinderInstances(
        materials.trim,
        chairPlacements.length,
        0.28,
        0.3,
        0.55,
        (i, dummy) => {
          const p = chairPlacements[i]!;
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.y = p.rotY;
        },
      ),
    );
    // Chair backs (thin boxes)
    root.add(
      createBoxInstances(
        materials.trim,
        chairPlacements.length,
        [0.42, 0.45, 0.06],
        (i, dummy) => {
          const p = chairPlacements[i]!;
          const bx = p.x + Math.sin(p.rotY) * 0.22;
          const bz = p.z + Math.cos(p.rotY) * 0.22;
          dummy.position.set(bx, 0.85, bz);
          dummy.rotation.y = p.rotY;
        },
      ),
    );
  }

  // Drop-ceiling fluorescent grid
  const lightPlacements: CeilingLightPlacement[] = [];
  for (let x = 3; x < WIDTH - 2; x += 3.2) {
    for (let z = 3; z < DEPTH - 2; z += 3.2) {
      // Occasional dead tube gap
      if (rand() < 0.07) continue;
      lightPlacements.push({ x, y: HEIGHT - 0.06, z });
    }
  }
  // Extra over break / copy / exit
  lightPlacements.push({ x: 4.5, y: HEIGHT - 0.06, z: 22 });
  lightPlacements.push({ x: 48, y: HEIGHT - 0.06, z: 18 });
  lightPlacements.push({ x: exitX, y: HEIGHT - 0.06, z: 41.5 });

  addCeilingLights(root, lights, materials, lighting, lightPlacements, {
    panelW: 1.15,
    panelD: 0.55,
    panelH: 0.04,
    lightEvery: 4,
    color: 0xd4e8d0,
    intensity: 1.15,
    distance: 9,
  });

  lights.add(lighting.ambient(0x889488, 0.18));

  const exitLight = lighting.point(0xff2233, 3.2, 14, 2);
  exitLight.position.set(exitX, 2.1, exitZ - 0.8);
  lights.add(exitLight);

  // Enemy spawns in aisles / dead ends / anomaly rooms
  const enemySpawns: Vector3[] = [
    new Vector3(8, 0, 12),
    new Vector3(18, 0, 16),
    new Vector3(28, 0, 14),
    new Vector3(38, 0, 20),
    new Vector3(12, 0, 28),
    new Vector3(22, 0, 32),
    new Vector3(34, 0, 30),
    new Vector3(4.5, 0, 22),
    new Vector3(48, 0, 18),
    new Vector3(26, 0, 38),
    new Vector3(15, 0, 22),
    new Vector3(42, 0, 10),
  ];
  for (let i = 0; i < 3; i++) {
    enemySpawns.push(
      new Vector3(6 + rand() * 38, 0, 8 + rand() * 28),
    );
  }

  const spawn: [number, number, number] = [26, 1.65, 2.8];

  const meta: LevelMeta = {
    id: "office",
    name: "Infinite Office",
    objective:
      "Find the red EXIT stairwell. The cubicles do not remember your name.",
    fogColor: 0xa8b0a4,
    fogNear: 5,
    fogFar: 28,
    ambient: 0.2,
    spawn,
  };

  return {
    root,
    colliders,
    lights,
    enemySpawns,
    exitPosition: new Vector3(exitX, 1.4, exitZ - 0.3),
    meta,
  };
}
