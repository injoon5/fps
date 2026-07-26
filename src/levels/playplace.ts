/**
 * Closed Playplace — abandoned soft-play / ballpit nightmare.
 * Faded primaries, crawl-tube corridors, party-room emptiness.
 */

import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
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

const HEIGHT = 3.6;
const WALL_T = 0.28;
const FOAM_T = 0.42;
const TUBE_H = 2.55;
const TUBE_W = 2.4;

/** Padded hollow tunnel corridor — walkable path with foam walls around it. */
function addFoamTunnel(
  batch: GeometryBatcher,
  materials: MaterialLib,
  root: Group,
  opts: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    alongX: boolean;
    yBottom?: number;
    height?: number;
  },
): void {
  const y0 = opts.yBottom ?? 0;
  const h = opts.height ?? TUBE_H;
  const cx = (opts.minX + opts.maxX) * 0.5;
  const cz = (opts.minZ + opts.maxZ) * 0.5;
  const w = opts.maxX - opts.minX;
  const d = opts.maxZ - opts.minZ;

  // Solid floor under tube (walkable)
  batch.addBox("floor", materials.floor, w, 0.1, d, cx, y0 - 0.05, cz, {
    collide: true,
  });

  // Foam side pads + ceiling shell (hollow interior)
  if (opts.alongX) {
    // North / south foam walls
    batch.addBox(
      "trim",
      materials.trim,
      w,
      h,
      FOAM_T,
      cx,
      y0 + h * 0.5,
      opts.minZ + FOAM_T * 0.5,
      { collide: true },
    );
    batch.addBox(
      "trim",
      materials.trim,
      w,
      h,
      FOAM_T,
      cx,
      y0 + h * 0.5,
      opts.maxZ - FOAM_T * 0.5,
      { collide: true },
    );
  } else {
    // East / west foam walls
    batch.addBox(
      "trim",
      materials.trim,
      FOAM_T,
      h,
      d,
      opts.minX + FOAM_T * 0.5,
      y0 + h * 0.5,
      cz,
      { collide: true },
    );
    batch.addBox(
      "trim",
      materials.trim,
      FOAM_T,
      h,
      d,
      opts.maxX - FOAM_T * 0.5,
      y0 + h * 0.5,
      cz,
      { collide: true },
    );
  }

  // Padded ceiling slab
  batch.addBox(
    "trim",
    materials.trim,
    w,
    FOAM_T * 0.55,
    d,
    cx,
    y0 + h + FOAM_T * 0.2,
    cz,
    { collide: true },
  );

  // Visual netted cylinder shell (no collide — colliders are foam boxes)
  const length = opts.alongX ? w : d;
  const radius = Math.min(TUBE_W, h) * 0.48;
  const geo = new CylinderGeometry(radius, radius, length, 12, 1, true);
  const mesh = new Mesh(geo, materials.accent);
  mesh.receiveShadow = true;
  if (opts.alongX) {
    mesh.rotation.z = Math.PI * 0.5;
    mesh.position.set(cx, y0 + radius * 0.95, cz);
  } else {
    mesh.rotation.x = Math.PI * 0.5;
    mesh.position.set(cx, y0 + radius * 0.95, cz);
  }
  // Slightly transparent net feel via roughness already on plastic
  root.add(mesh);
}

/** Quarter-turn torus bend connecting two tube corridors. */
function addTubeBend(
  root: Group,
  materials: MaterialLib,
  batch: GeometryBatcher,
  cx: number,
  cz: number,
  yBottom: number,
  rotY: number,
): void {
  const major = 2.1;
  const tube = 1.05;
  const geo = new TorusGeometry(major, tube, 10, 16, Math.PI * 0.5);
  const mesh = new Mesh(geo, materials.accent);
  mesh.position.set(cx, yBottom + tube * 0.9, cz);
  mesh.rotation.x = Math.PI * 0.5;
  mesh.rotation.z = rotY;
  root.add(mesh);

  // Approximate bend with foam collider boxes around the arc path
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    const ang = rotY + t * (Math.PI * 0.5);
    const px = cx + Math.cos(ang) * major;
    const pz = cz + Math.sin(ang) * major;
    // Outer pad
    batch.addBox(
      "trim",
      materials.trim,
      0.55,
      TUBE_H * 0.85,
      0.55,
      px + Math.cos(ang) * tube * 0.7,
      yBottom + TUBE_H * 0.4,
      pz + Math.sin(ang) * tube * 0.7,
      { collide: true },
    );
  }
  // Floor under bend
  batch.addBox(
    "floor",
    materials.floor,
    major * 2.2,
    0.1,
    major * 2.2,
    cx,
    yBottom - 0.05,
    cz,
    { collide: true },
  );
}

function addClimbFrame(
  batch: GeometryBatcher,
  materials: MaterialLib,
  cx: number,
  cz: number,
): void {
  // Vertical posts
  for (const [ox, oz] of [
    [-1.4, -1.1],
    [1.4, -1.1],
    [-1.4, 1.1],
    [1.4, 1.1],
  ] as const) {
    batch.addBox(
      "prop",
      materials.prop,
      0.22,
      2.8,
      0.22,
      cx + ox,
      1.4,
      cz + oz,
      { collide: true },
    );
  }
  // Platforms
  batch.addBox("accent", materials.accent, 3.0, 0.14, 2.4, cx, 1.1, cz, {
    collide: true,
  });
  batch.addBox("accent", materials.accent, 2.2, 0.14, 1.8, cx, 2.0, cz, {
    collide: true,
  });
  // Cross bars
  batch.addBox("prop", materials.prop, 2.9, 0.12, 0.12, cx, 2.55, cz - 1.1, {
    collide: true,
  });
  batch.addBox("prop", materials.prop, 2.9, 0.12, 0.12, cx, 2.55, cz + 1.1, {
    collide: true,
  });
}

function addSlide(
  batch: GeometryBatcher,
  materials: MaterialLib,
  cx: number,
  cz: number,
  facing: "n" | "e",
): void {
  // Chute as stacked tapered boxes
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const y = 2.2 - t * 1.85;
    const len = 0.55;
    const ox = facing === "e" ? i * 0.5 : 0;
    const oz = facing === "n" ? i * 0.5 : 0;
    batch.addBox(
      "accent",
      materials.accent,
      facing === "e" ? len : 0.85,
      0.35,
      facing === "n" ? len : 0.85,
      cx + ox,
      y,
      cz + oz,
      { collide: true },
    );
  }
  // Side rails
  for (const side of [-0.5, 0.5] as const) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const y = 2.35 - t * 1.7;
      const ox = facing === "e" ? i * 0.5 : side;
      const oz = facing === "n" ? i * 0.5 : side;
      batch.addBox(
        "prop",
        materials.prop,
        0.1,
        0.45,
        0.1,
        cx + ox,
        y,
        cz + oz,
        { collide: true },
      );
    }
  }
}

export function buildPlayplaceLevel(
  matLib?: MaterialLib,
  lightLib?: LightLib,
): LevelBuildResult {
  const materials = matLib ?? createFallbackMaterials("playplace");
  const lighting = lightLib ?? createFallbackLighting();
  const rand = mulberry32(0xa1a7e);
  const root = new Group();
  root.name = "level-playplace";
  const lights = new Group();
  lights.name = "lights-playplace";
  const batch = new GeometryBatcher();

  // --- Party room / birthday lobby (spawn) ---
  const party = { minX: 2, maxX: 16, minZ: 2, maxZ: 14 };
  addRoom(batch, materials, {
    ...party,
    height: HEIGHT,
    wallThickness: WALL_T,
    doors: {
      e: [0.35, 0.65],
      n: [0.4, 0.7],
    },
    walls: { n: true, s: true, e: true, w: true },
  });

  // Birthday booths (tables + benches)
  for (let i = 0; i < 3; i++) {
    const bx = 5 + i * 3.5;
    batch.addBox("prop", materials.prop, 2.2, 0.75, 1.0, bx, 0.375, 5.5, {
      collide: true,
    });
    batch.addBox("trim", materials.trim, 2.0, 0.45, 0.4, bx, 0.25, 4.5, {
      collide: true,
    });
    batch.addBox("trim", materials.trim, 2.0, 0.45, 0.4, bx, 0.25, 6.5, {
      collide: true,
    });
  }

  // Stretched birthday banner (thin box)
  batch.addBox(
    "accent",
    materials.accent,
    10,
    0.55,
    0.06,
    9,
    2.85,
    party.minZ + 0.35,
    { collide: false },
  );
  // Banner poles
  batch.addBox("prop", materials.prop, 0.08, 2.9, 0.08, 4.2, 1.45, party.minZ + 0.35, {
    collide: true,
  });
  batch.addBox("prop", materials.prop, 0.08, 2.9, 0.08, 13.8, 1.45, party.minZ + 0.35, {
    collide: true,
  });

  // Locked fridge / cake cooler
  batch.addBox("metal", materials.metal, 1.1, 1.8, 0.9, 4.2, 0.9, 12.2, {
    collide: true,
  });

  // --- Soft-play atrium (main padded chamber) ---
  const soft = { minX: 20, maxX: 40, minZ: 2, maxZ: 18 };
  addRoom(batch, materials, {
    ...soft,
    height: HEIGHT + 0.4,
    wallThickness: WALL_T,
    doors: {
      w: [0.35, 0.65],
      n: [0.35, 0.65],
      e: [0.3, 0.55],
      s: [0.4, 0.6],
    },
    walls: { n: true, s: true, e: true, w: true },
  });

  // Padded foam wall inserts (thicker primary panels)
  for (const z of [4, 8, 12, 16]) {
    batch.addBox(
      "trim",
      materials.trim,
      FOAM_T,
      2.2,
      2.8,
      soft.minX + FOAM_T * 0.5 + 0.05,
      1.1,
      z,
      { collide: true },
    );
    batch.addBox(
      "trim",
      materials.trim,
      FOAM_T,
      2.2,
      2.8,
      soft.maxX - FOAM_T * 0.5 - 0.05,
      1.1,
      z,
      { collide: true },
    );
  }

  addClimbFrame(batch, materials, 26, 8);
  addClimbFrame(batch, materials, 34, 12);
  addSlide(batch, materials, 30, 5, "n");
  addSlide(batch, materials, 24, 14, "e");

  // Foam block stepping stones
  for (let i = 0; i < 5; i++) {
    batch.addBox(
      "trim",
      materials.trim,
      0.9,
      0.45 + (i % 2) * 0.25,
      0.9,
      32 + (i % 3) * 0.2,
      0.25 + (i % 2) * 0.12,
      6 + i * 1.6,
      { collide: true },
    );
  }

  // --- Ball pit room ---
  const pitRoom = { minX: 20, maxX: 40, minZ: 22, maxZ: 36 };
  addRoom(batch, materials, {
    ...pitRoom,
    height: HEIGHT,
    wallThickness: WALL_T,
    doors: {
      s: [0.35, 0.65],
      e: [0.35, 0.65],
    },
    walls: { n: true, s: true, e: true, w: true },
  });

  // Recessed basin (solid floor under balls — lowered walkable slab)
  const basin = { minX: 24, maxX: 36, minZ: 25, maxZ: 33 };
  const basinFloorY = -0.35;
  batch.addBox(
    "floor",
    materials.floor,
    basin.maxX - basin.minX,
    0.12,
    basin.maxZ - basin.minZ,
    (basin.minX + basin.maxX) * 0.5,
    basinFloorY,
    (basin.minZ + basin.maxZ) * 0.5,
    { collide: true },
  );
  // Basin rim walls (padded)
  const rimH = 0.85;
  batch.addBox(
    "trim",
    materials.trim,
    basin.maxX - basin.minX + FOAM_T * 2,
    rimH,
    FOAM_T,
    (basin.minX + basin.maxX) * 0.5,
    rimH * 0.5,
    basin.minZ - FOAM_T * 0.5,
    { collide: true },
  );
  batch.addBox(
    "trim",
    materials.trim,
    basin.maxX - basin.minX + FOAM_T * 2,
    rimH,
    FOAM_T,
    (basin.minX + basin.maxX) * 0.5,
    rimH * 0.5,
    basin.maxZ + FOAM_T * 0.5,
    { collide: true },
  );
  batch.addBox(
    "trim",
    materials.trim,
    FOAM_T,
    rimH,
    basin.maxZ - basin.minZ,
    basin.minX - FOAM_T * 0.5,
    rimH * 0.5,
    (basin.minZ + basin.maxZ) * 0.5,
    { collide: true },
  );
  batch.addBox(
    "trim",
    materials.trim,
    FOAM_T,
    rimH,
    basin.maxZ - basin.minZ,
    basin.maxX + FOAM_T * 0.5,
    rimH * 0.5,
    (basin.minZ + basin.maxZ) * 0.5,
    { collide: true },
  );

  // Cut hole in main floor above basin by not overlapping — rim sits on floor.
  // Extra surround floor ring already from room floor; basin is recessed below.

  // --- Prize counter / employees vestibule (exit) ---
  const prize = { minX: 44, maxX: 56, minZ: 8, maxZ: 22 };
  addRoom(batch, materials, {
    ...prize,
    height: HEIGHT,
    wallThickness: WALL_T,
    doors: {
      w: [0.3, 0.7],
      n: [0.35, 0.65],
    },
    walls: { n: true, s: true, e: true, w: true },
  });

  // Locked prize counter
  batch.addBox("prop", materials.prop, 6.5, 1.15, 1.1, 50, 0.575, 12.5, {
    collide: true,
  });
  batch.addBox("metal", materials.metal, 6.6, 0.08, 0.15, 50, 1.2, 12.0, {
    collide: false,
  });
  // Glass case silhouettes
  for (let i = 0; i < 4; i++) {
    batch.addBox(
      "accent",
      materials.accent,
      1.2,
      0.9,
      0.7,
      47.5 + i * 1.6,
      1.7,
      12.5,
      { collide: true },
    );
  }
  // Shelves of dusty prizes
  batch.addBox("prop", materials.prop, 5.5, 2.2, 0.4, 50, 1.5, 20.5, {
    collide: true,
  });

  // EMPLOYEES ONLY glowing exit on north wall
  addDoorFrame(batch, materials, 50, prize.maxZ - 0.08, "z", {
    width: 1.35,
    height: 2.35,
    glowing: true,
  });
  // Door plaque strip
  batch.addBox("exit", materials.exit, 1.5, 0.22, 0.04, 50, 2.55, prize.maxZ - 0.12, {
    collide: false,
  });

  // --- Crawl tube corridors connecting rooms ---
  // Party → soft-play (along X)
  addFoamTunnel(batch, materials, root, {
    minX: 16,
    maxX: 20,
    minZ: 7.8,
    maxZ: 7.8 + TUBE_W,
    alongX: true,
  });

  // Soft-play → ball pit (along Z)
  addFoamTunnel(batch, materials, root, {
    minX: 28.8,
    maxX: 28.8 + TUBE_W,
    minZ: 18,
    maxZ: 22,
    alongX: false,
  });

  // Soft-play → prize (along X)
  addFoamTunnel(batch, materials, root, {
    minX: 40,
    maxX: 44,
    minZ: 11.8,
    maxZ: 11.8 + TUBE_W,
    alongX: true,
  });

  // Ball pit → prize spur (L-bend via tubes)
  addFoamTunnel(batch, materials, root, {
    minX: 40,
    maxX: 48,
    minZ: 28.8,
    maxZ: 28.8 + TUBE_W,
    alongX: true,
  });
  addFoamTunnel(batch, materials, root, {
    minX: 46.8,
    maxX: 46.8 + TUBE_W,
    minZ: 22,
    maxZ: 28.8,
    alongX: false,
  });
  addTubeBend(root, materials, batch, 47.9, 29.9, 0, -Math.PI * 0.5);

  // Party north spur tube into soft-play west
  addFoamTunnel(batch, materials, root, {
    minX: 8.8,
    maxX: 8.8 + TUBE_W,
    minZ: 14,
    maxZ: 20,
    alongX: false,
  });
  addFoamTunnel(batch, materials, root, {
    minX: 8.8,
    maxX: 20,
    minZ: 18.8,
    maxZ: 18.8 + TUBE_W,
    alongX: true,
  });
  addTubeBend(root, materials, batch, 9.9, 19.9, 0, 0);

  // Net poles (visual) along soft-play
  const netPoles = createCylinderInstances(
    materials.metal,
    12,
    0.04,
    0.04,
    3.2,
    (i, dummy) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      dummy.position.set(22 + col * 5, 1.6, 4 + row * 5.5);
    },
  );
  root.add(netPoles);

  batch.flush(root);

  // --- Ball pit InstancedMesh spheres (visual only) ---
  const BALL_COUNT = 520;
  const ballGeo = new SphereGeometry(0.14, 7, 6);
  const ballMat = materials.accent.clone();
  ballMat.name = "ballpit-ball";
  ballMat.roughness = 0.35;
  ballMat.metalness = 0.05;
  const balls = new InstancedMesh(ballGeo, ballMat, BALL_COUNT);
  const ballColors = [
    new Color(0xc04038),
    new Color(0x3868b0),
    new Color(0xd4b028),
    new Color(0x38a068),
    new Color(0xd06828),
  ];
  const dummy = new Object3D();
  const bw = basin.maxX - basin.minX - 0.6;
  const bd = basin.maxZ - basin.minZ - 0.6;
  for (let i = 0; i < BALL_COUNT; i++) {
    const x = basin.minX + 0.3 + rand() * bw;
    const z = basin.minZ + 0.3 + rand() * bd;
    const layer = Math.floor(rand() * 4);
    const y = basinFloorY + 0.2 + layer * 0.22 + rand() * 0.08;
    dummy.position.set(x, y, z);
    dummy.rotation.set(rand() * 2, rand() * 2, rand() * 2);
    const s = 0.85 + rand() * 0.35;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    balls.setMatrixAt(i, dummy.matrix);
    balls.setColorAt(i, ballColors[i % ballColors.length]!);
  }
  if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
  balls.instanceMatrix.needsUpdate = true;
  balls.castShadow = false;
  balls.receiveShadow = true;
  root.add(balls);

  // Confetti / litter scraps on party carpet (tiny non-collide boxes)
  root.add(
    createBoxInstances(materials.accent, 40, [0.12, 0.02, 0.08], (_i, d) => {
      d.position.set(4 + rand() * 10, 0.03, 3.5 + rand() * 8);
      d.rotation.y = rand() * Math.PI;
    }),
  );

  // --- Lighting: dying fluorescents + sparse colored party bulbs ---
  const fluoroPlacements: CeilingLightPlacement[] = [];
  for (let x = 5; x <= 13; x += 4) {
    for (let z = 5; z <= 11; z += 4) {
      if (rand() < 0.2) continue; // dead tubes
      fluoroPlacements.push({ x, y: HEIGHT - 0.08, z });
    }
  }
  for (let x = 23; x <= 37; x += 4.5) {
    for (let z = 5; z <= 15; z += 4.5) {
      if (rand() < 0.15) continue;
      fluoroPlacements.push({ x, y: HEIGHT + 0.3, z });
    }
  }
  for (let x = 24; x <= 36; x += 5) {
    for (let z = 25; z <= 33; z += 4) {
      if (rand() < 0.25) continue;
      fluoroPlacements.push({ x, y: HEIGHT - 0.08, z });
    }
  }
  for (let x = 46; x <= 54; x += 4) {
    fluoroPlacements.push({ x, y: HEIGHT - 0.08, z: 14 });
  }

  addCeilingLights(root, lights, materials, lighting, fluoroPlacements, {
    panelW: 1.0,
    panelD: 0.4,
    lightEvery: 3,
    color: 0xffe8c0,
    intensity: 0.55,
    distance: 7,
  });

  // Colored party bulbs (wrong shadows — sparse, saturated)
  const partyBulbs: Array<{ x: number; y: number; z: number; color: number; intensity: number }> =
    [
      { x: 7, y: 2.9, z: 8, color: 0xff4040, intensity: 1.4 },
      { x: 12, y: 2.9, z: 6, color: 0x4060ff, intensity: 1.2 },
      { x: 9, y: 2.9, z: 11, color: 0xffe040, intensity: 1.1 },
      { x: 26, y: 3.2, z: 7, color: 0xff6040, intensity: 1.0 },
      { x: 34, y: 3.2, z: 14, color: 0x40a0ff, intensity: 1.15 },
      { x: 30, y: 3.2, z: 10, color: 0xffe060, intensity: 0.7 },
      { x: 28, y: 2.8, z: 29, color: 0xff4080, intensity: 1.3 },
      { x: 34, y: 2.8, z: 27, color: 0x40ff80, intensity: 0.9 },
      { x: 50, y: 2.9, z: 15, color: 0xffa040, intensity: 1.0 },
      { x: 18, y: 2.2, z: 9, color: 0xff6060, intensity: 0.8 },
      { x: 42, y: 2.2, z: 13, color: 0x6080ff, intensity: 0.85 },
    ];

  root.add(
    createBoxInstances(
      materials.lightPanel,
      partyBulbs.length,
      [0.18, 0.18, 0.18],
      (i, d) => {
        const b = partyBulbs[i]!;
        d.position.set(b.x, b.y, b.z);
      },
    ),
  );

  for (const b of partyBulbs) {
    const pl = lighting.point(b.color, b.intensity, 8, 2);
    pl.position.set(b.x, b.y, b.z);
    lights.add(pl);
  }

  lights.add(lighting.ambient(0xb08050, 0.16));

  const exitLight = lighting.point(0xffee66, 3.0, 14, 2);
  exitLight.position.set(50, 2.2, prize.maxZ - 0.6);
  lights.add(exitLight);

  // Enemy spawns — alcoves, pit rim, tube mouths, booth shadows
  const enemySpawns: Vector3[] = [
    new Vector3(5, 0, 12),
    new Vector3(14, 0, 5),
    new Vector3(26, 0, 16),
    new Vector3(37, 0, 5),
    new Vector3(22, 0, 10),
    new Vector3(35, 0, 34),
    new Vector3(25, 0, 26),
    new Vector3(38, 0, 30),
    new Vector3(54, 0, 10),
    new Vector3(46, 0, 19),
    new Vector3(10, 0, 18),
    new Vector3(48, 0, 28),
  ];
  // Extra lurkers
  for (let i = 0; i < 2; i++) {
    enemySpawns.push(new Vector3(28 + rand() * 8, 0, 8 + rand() * 6));
  }

  const spawn: [number, number, number] = [9, 1.7, 4.5];

  const meta: LevelMeta = {
    id: "playplace",
    name: "Closed Playplace",
    objective: "Find EMPLOYEES ONLY. The party ended years ago.",
    fogColor: 0xc8a878,
    fogNear: 3.5,
    fogFar: 24,
    ambient: 0.18,
    spawn,
  };

  return {
    root,
    colliders: batch.colliders,
    lights,
    enemySpawns,
    exitPosition: new Vector3(50, 1.2, prize.maxZ - 0.45),
    meta,
  };
}
