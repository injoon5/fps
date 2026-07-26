/**
 * Yellow Zone — Kane Pixel OG mono-yellow backrooms maze.
 * Irregular rooms/corridors, fluorescent ceiling grid, damp carpet.
 */

import { Group, Vector3 } from "three";
import type { LevelBuildResult, LevelMeta } from "../types";
import {
  GeometryBatcher,
  addCeilingLights,
  addDoorFrame,
  addPillar,
  createFallbackLighting,
  createFallbackMaterials,
  mulberry32,
  type LightLib,
  type MaterialLib,
  type CeilingLightPlacement,
} from "./geometry";

const CELL = 5.2;
const HEIGHT = 3.1;
const WALL_T = 0.22;
const COLS = 11;
const ROWS = 10;

type Dir = 0 | 1 | 2 | 3; // N E S W
const DX = [0, 1, 0, -1] as const;
const DZ = [1, 0, -1, 0] as const;

interface MazeData {
  /** Vertical walls between columns: V[x][z] = wall west of cell (x,z), x in 0..COLS */
  V: boolean[][];
  /** Horizontal walls between rows: H[x][z] = wall south of cell (x,z), z in 0..ROWS */
  H: boolean[][];
  open: boolean[][];
}

function cellCenter(cx: number, cz: number): [number, number] {
  return [(cx + 0.5) * CELL, (cz + 0.5) * CELL];
}

function buildMaze(rand: () => number): MazeData {
  const open: boolean[][] = Array.from({ length: COLS }, () =>
    Array.from({ length: ROWS }, () => true),
  );
  // Start with all walls present
  const V: boolean[][] = Array.from({ length: COLS + 1 }, () =>
    Array.from({ length: ROWS }, () => true),
  );
  const H: boolean[][] = Array.from({ length: COLS }, () =>
    Array.from({ length: ROWS + 1 }, () => true),
  );

  const visited: boolean[][] = Array.from({ length: COLS }, () =>
    Array.from({ length: ROWS }, () => false),
  );

  function carve(x: number, z: number): void {
    visited[x]![z] = true;
    const order: Dir[] = [0, 1, 2, 3];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i]!;
      order[i] = order[j]!;
      order[j] = tmp;
    }
    for (const d of order) {
      const nx = x + DX[d];
      const nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= COLS || nz >= ROWS) continue;
      if (visited[nx]![nz]) continue;
      // Remove wall between (x,z) and (nx,nz)
      if (d === 0) H[x]![z + 1] = false; // north
      else if (d === 1) V[x + 1]![z] = false; // east
      else if (d === 2) H[x]![z] = false; // south
      else V[x]![z] = false; // west
      carve(nx, nz);
    }
  }

  carve(1, 1);

  // Merge rooms: remove extra walls for open chambers
  const mergeCount = 28;
  for (let i = 0; i < mergeCount; i++) {
    if (rand() < 0.55) {
      const x = 1 + Math.floor(rand() * (COLS - 2));
      const z = 1 + Math.floor(rand() * (ROWS - 1));
      H[x]![z] = false;
    } else {
      const x = 1 + Math.floor(rand() * (COLS - 1));
      const z = 1 + Math.floor(rand() * (ROWS - 2));
      V[x]![z] = false;
    }
  }

  // Carve a recognizable start chamber (2x2 open at 1,1)
  for (let x = 1; x <= 2; x++) {
    for (let z = 1; z <= 2; z++) {
      if (x < 2) V[x + 1]![z] = false;
      if (z < 2) H[x]![z + 1] = false;
    }
  }

  // Larger mid chamber
  for (let x = 5; x <= 7; x++) {
    for (let z = 4; z <= 6; z++) {
      if (x < 7) V[x + 1]![z] = false;
      if (z < 6) H[x]![z + 1] = false;
    }
  }

  // Occasional blocked cells for irregular silhouette (solid fill)
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(rand() * (COLS - 4));
    const z = 2 + Math.floor(rand() * (ROWS - 4));
    if ((x <= 2 && z <= 2) || (x >= COLS - 2 && z >= ROWS - 2)) continue;
    open[x]![z] = false;
    // Seal around blocked cell
    V[x]![z] = true;
    V[x + 1]![z] = true;
    H[x]![z] = true;
    H[x]![z + 1] = true;
  }

  return { V, H, open };
}

function neighborCount(maze: MazeData, x: number, z: number): number {
  let n = 0;
  if (z + 1 < ROWS && maze.open[x]![z + 1] && !maze.H[x]![z + 1]) n++;
  if (x + 1 < COLS && maze.open[x + 1]![z] && !maze.V[x + 1]![z]) n++;
  if (z - 1 >= 0 && maze.open[x]![z - 1] && !maze.H[x]![z]) n++;
  if (x - 1 >= 0 && maze.open[x - 1]![z] && !maze.V[x]![z]) n++;
  return n;
}

export function buildBackroomsLevel(
  matLib?: MaterialLib,
  lightLib?: LightLib,
): LevelBuildResult {
  const materials = matLib ?? createFallbackMaterials("backrooms");
  const lighting = lightLib ?? createFallbackLighting();
  const rand = mulberry32(0x79e110);
  const maze = buildMaze(rand);

  const root = new Group();
  root.name = "level-backrooms";
  const lights = new Group();
  lights.name = "lights-backrooms";
  const batch = new GeometryBatcher();

  const worldW = COLS * CELL;
  const worldD = ROWS * CELL;

  // Continuous damp carpet + acoustic tile (single slabs — rooms share envelope)
  batch.addBox(
    "floor",
    materials.floor,
    worldW + 1,
    0.1,
    worldD + 1,
    worldW * 0.5,
    -0.05,
    worldD * 0.5,
    { collide: true },
  );
  batch.addBox(
    "ceiling",
    materials.ceiling,
    worldW + 1,
    0.1,
    worldD + 1,
    worldW * 0.5,
    HEIGHT + 0.05,
    worldD * 0.5,
    { collide: false },
  );

  // Perimeter shell
  batch.addBox(
    "wall",
    materials.wall,
    worldW + WALL_T * 2,
    HEIGHT,
    WALL_T,
    worldW * 0.5,
    HEIGHT * 0.5,
    -WALL_T * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    worldW + WALL_T * 2,
    HEIGHT,
    WALL_T,
    worldW * 0.5,
    HEIGHT * 0.5,
    worldD + WALL_T * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    HEIGHT,
    worldD + WALL_T * 2,
    -WALL_T * 0.5,
    HEIGHT * 0.5,
    worldD * 0.5,
    { collide: true },
  );
  batch.addBox(
    "wall",
    materials.wall,
    WALL_T,
    HEIGHT,
    worldD + WALL_T * 2,
    worldW + WALL_T * 0.5,
    HEIGHT * 0.5,
    worldD * 0.5,
    { collide: true },
  );

  // Interior vertical walls (between columns)
  for (let x = 1; x < COLS; x++) {
    for (let z = 0; z < ROWS; z++) {
      if (!maze.V[x]![z]) continue;
      // Skip if both sides blocked
      const leftOpen = x > 0 && maze.open[x - 1]![z];
      const rightOpen = maze.open[x]![z];
      if (!leftOpen && !rightOpen) continue;

      // Segment may span; split into runs where wall is continuous
      const zx0 = z * CELL;
      const zx1 = (z + 1) * CELL;
      // Door gap chance on long corridors — leave opening mid-wall occasionally
      const leaveDoor = rand() < 0.08 && leftOpen && rightOpen;
      if (leaveDoor) {
        const mid = (zx0 + zx1) * 0.5;
        const gap = 1.15;
        batch.addBoxWall(
          materials.wall,
          x * CELL,
          zx0,
          x * CELL,
          mid - gap * 0.5,
          0,
          HEIGHT,
          WALL_T,
        );
        batch.addBoxWall(
          materials.wall,
          x * CELL,
          mid + gap * 0.5,
          x * CELL,
          zx1,
          0,
          HEIGHT,
          WALL_T,
        );
        // lintel
        batch.addBox(
          "trim",
          materials.trim,
          WALL_T + 0.04,
          0.25,
          gap + 0.2,
          x * CELL,
          2.3,
          mid,
          { collide: true },
        );
      } else {
        batch.addBoxWall(
          materials.wall,
          x * CELL,
          zx0,
          x * CELL,
          zx1,
          0,
          HEIGHT,
          WALL_T,
        );
      }
    }
  }

  // Interior horizontal walls (between rows)
  for (let z = 1; z < ROWS; z++) {
    for (let x = 0; x < COLS; x++) {
      if (!maze.H[x]![z]) continue;
      const below = maze.open[x]![z - 1];
      const above = maze.open[x]![z];
      if (!below && !above) continue;

      const xx0 = x * CELL;
      const xx1 = (x + 1) * CELL;
      const leaveDoor = rand() < 0.08 && below && above;
      if (leaveDoor) {
        const mid = (xx0 + xx1) * 0.5;
        const gap = 1.15;
        batch.addBoxWall(
          materials.wall,
          xx0,
          z * CELL,
          mid - gap * 0.5,
          z * CELL,
          0,
          HEIGHT,
          WALL_T,
        );
        batch.addBoxWall(
          materials.wall,
          mid + gap * 0.5,
          z * CELL,
          xx1,
          z * CELL,
          0,
          HEIGHT,
          WALL_T,
        );
        batch.addBox(
          "trim",
          materials.trim,
          gap + 0.2,
          0.25,
          WALL_T + 0.04,
          mid,
          2.3,
          z * CELL,
          { collide: true },
        );
      } else {
        batch.addBoxWall(
          materials.wall,
          xx0,
          z * CELL,
          xx1,
          z * CELL,
          0,
          HEIGHT,
          WALL_T,
        );
      }
    }
  }

  // Fill blocked cells as solid yellow masses
  for (let x = 0; x < COLS; x++) {
    for (let z = 0; z < ROWS; z++) {
      if (maze.open[x]![z]) continue;
      batch.addBox(
        "wall",
        materials.wall,
        CELL - 0.05,
        HEIGHT,
        CELL - 0.05,
        (x + 0.5) * CELL,
        HEIGHT * 0.5,
        (z + 0.5) * CELL,
        { collide: true },
      );
    }
  }

  // Start chamber pillars — recognizable landmark
  const [sx, sz] = cellCenter(1, 1);
  addPillar(batch, materials.trim, sx + 1.6, sz + 1.6, 0, HEIGHT, 0.28);
  addPillar(batch, materials.trim, sx + CELL + 1.6, sz + 1.6, 0, HEIGHT, 0.28);

  // Mid chamber pillars
  addPillar(batch, materials.trim, 6.5 * CELL, 5.5 * CELL, 0, HEIGHT, 0.4);
  addPillar(batch, materials.trim, 5.5 * CELL, 4.5 * CELL, 0, HEIGHT, 0.32);

  // Stained wall patches (darker accent panels, no collide)
  for (let i = 0; i < 40; i++) {
    const x = rand() * worldW;
    const z = rand() * worldD;
    const alongX = rand() < 0.5;
    if (alongX) {
      batch.addBox(
        "accent",
        materials.accent,
        0.8 + rand() * 1.4,
        0.5 + rand() * 1.2,
        0.03,
        x,
        0.4 + rand() * 1.5,
        z,
        { collide: false },
      );
    } else {
      batch.addBox(
        "accent",
        materials.accent,
        0.03,
        0.5 + rand() * 1.2,
        0.8 + rand() * 1.4,
        x,
        0.4 + rand() * 1.5,
        z,
        { collide: false },
      );
    }
  }

  // Fluorescent ceiling grid over open cells
  const lightPlacements: CeilingLightPlacement[] = [];
  for (let x = 0; x < COLS; x++) {
    for (let z = 0; z < ROWS; z++) {
      if (!maze.open[x]![z]) continue;
      const [cx, cz] = cellCenter(x, z);
      // 2x2 panel grid per cell
      for (const ox of [-1.15, 1.15]) {
        for (const oz of [-1.15, 1.15]) {
          // Skip some for irregular buzz / dark spots
          if (rand() < 0.12) continue;
          lightPlacements.push({
            x: cx + ox,
            y: HEIGHT - 0.06,
            z: cz + oz,
          });
        }
      }
    }
  }

  // Exit at far corner open cell
  let exitX = COLS - 2;
  let exitZ = ROWS - 2;
  for (let z = ROWS - 1; z >= 0; z--) {
    for (let x = COLS - 1; x >= 0; x--) {
      if (maze.open[x]![z]) {
        exitX = x;
        exitZ = z;
        z = -1;
        break;
      }
    }
  }
  const [ex, ez] = cellCenter(exitX, exitZ);
  // Noclip threshold — glowing door on north wall of exit cell
  addDoorFrame(batch, materials, ex, exitZ * CELL + CELL - 0.05, "z", {
    width: 1.2,
    height: 2.35,
    glowing: true,
  });
  // Soft exit light
  const exitLight = lighting.point(0xffeeaa, 2.2, 12, 2);
  exitLight.position.set(ex, 2.0, ez + 1.2);
  lights.add(exitLight);

  batch.flush(root);

  addCeilingLights(root, lights, materials, lighting, lightPlacements, {
    panelW: 1.1,
    panelD: 0.5,
    lightEvery: 8,
    color: 0xfff0c8,
    intensity: 1.05,
    distance: 8,
  });

  // Ambient hum
  lights.add(lighting.ambient(0xc4b070, 0.22));

  // Enemy spawns in dark alcoves (dead ends, not start/exit)
  const enemySpawns: Vector3[] = [];
  for (let x = 0; x < COLS; x++) {
    for (let z = 0; z < ROWS; z++) {
      if (!maze.open[x]![z]) continue;
      if (x <= 2 && z <= 2) continue;
      if (x === exitX && z === exitZ) continue;
      const n = neighborCount(maze, x, z);
      if (n === 1 || (n === 2 && rand() < 0.15)) {
        const [px, pz] = cellCenter(x, z);
        enemySpawns.push(new Vector3(px, 0, pz));
      }
    }
  }
  // Cap / ensure minimum
  while (enemySpawns.length > 14) {
    enemySpawns.splice(Math.floor(rand() * enemySpawns.length), 1);
  }
  if (enemySpawns.length < 6) {
    for (let i = enemySpawns.length; i < 6; i++) {
      const x = 3 + Math.floor(rand() * (COLS - 4));
      const z = 3 + Math.floor(rand() * (ROWS - 4));
      if (!maze.open[x]![z]) continue;
      const [px, pz] = cellCenter(x, z);
      enemySpawns.push(new Vector3(px, 0, pz));
    }
  }

  const [spawnX, spawnZ] = cellCenter(1, 1);
  const spawn: [number, number, number] = [spawnX + 0.5, 1.7, spawnZ + 0.5];

  const meta: LevelMeta = {
    id: "backrooms",
    name: "Yellow Zone",
    objective: "Find the glowing threshold. Do not look too long at the walls.",
    fogColor: 0xc4b896,
    fogNear: 4,
    fogFar: 28,
    ambient: 0.22,
    spawn,
  };

  return {
    root,
    colliders: batch.colliders,
    lights,
    enemySpawns,
    exitPosition: new Vector3(ex, 1.2, exitZ * CELL + CELL - 0.4),
    meta,
  };
}
