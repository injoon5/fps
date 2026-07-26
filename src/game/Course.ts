import * as THREE from "three";
import type { PhysicsWorld } from "./PhysicsWorld";
import { MaterialLibrary } from "./materials";
import { Palette } from "./config";

export type Checkpoint = {
  name: string;
  position: THREE.Vector3;
  index: number;
};

export type CourseHandles = {
  group: THREE.Group;
  spawn: THREE.Vector3;
  checkpoints: Checkpoint[];
  finishZone: THREE.Box3;
  update: (t: number, dt: number, physics: PhysicsWorld) => void;
  dispose: () => void;
};

type Mover = {
  mesh: THREE.Object3D;
  bodyIndex: number;
  update: (t: number) => { pos: THREE.Vector3; rot?: THREE.Quaternion };
};

type PulseLight = {
  mesh: THREE.Mesh;
  base: number;
  speed: number;
  phase: number;
};

/**
 * Fall Guys finals gauntlet — readable, spectacular, fair:
 * start → spin bars → hex hop → punches → conveyors/beams → seesaw → stadium finish.
 */
export function buildCourse(
  scene: THREE.Scene,
  physics: PhysicsWorld,
  mats: MaterialLibrary,
): CourseHandles {
  const group = new THREE.Group();
  scene.add(group);

  const movers: Mover[] = [];
  const kinematicBodies: ReturnType<PhysicsWorld["createKinematicBox"]>[] = [];
  const disposables: THREE.BufferGeometry[] = [];
  const extraMats: THREE.Material[] = [];
  const pulseLights: PulseLight[] = [];
  const bannerPivots: THREE.Object3D[] = [];

  const pos = new THREE.Vector3();
  const half = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();

  function trackGeo(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    disposables.push(geo);
    return geo;
  }

  function addStaticBox(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    material: THREE.Material,
    rotY = 0,
  ): THREE.Mesh {
    const geo = trackGeo(new THREE.BoxGeometry(sx, sy, sz));
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    pos.set(x, y, z);
    half.set(sx / 2, sy / 2, sz / 2);
    quat.setFromEuler(euler.set(0, rotY, 0));
    physics.createStaticBox(pos, half, quat);
    return mesh;
  }

  function addPlatform(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    material: THREE.Material,
  ): THREE.Mesh {
    return addStaticBox(x, y, z, w, h, d, material);
  }

  function addKinematic(
    mesh: THREE.Mesh,
    sx: number,
    sy: number,
    sz: number,
    update: Mover["update"],
  ): void {
    const p = mesh.position;
    pos.set(p.x, p.y, p.z);
    half.set(sx / 2, sy / 2, sz / 2);
    const body = physics.createKinematicBox(pos, half);
    const bodyIndex = kinematicBodies.length;
    kinematicBodies.push(body);
    movers.push({ mesh, bodyIndex, update });
  }

  function addMesh(
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(trackGeo(geo), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  /** Slim safe ledge — visual rest between chaos. */
  function addSafeLedge(x: number, y: number, z: number, w = 3.2, d = 2.4): void {
    addPlatform(x, y, z, w, d, 0.55, mats.safe);
    addStaticBox(x, y + 0.45, z, w * 0.92, 0.08, 0.12, mats.neonLime);
  }

  const checkpoints: Checkpoint[] = [];

  /** Ceremonial neon checkpoint gate / arch. */
  function addCheckpointGate(
    z: number,
    name: string,
    index: number,
    accent: THREE.MeshStandardMaterial,
  ): THREE.Vector3 {
    const cp = new THREE.Vector3(0, 2.15, z);
    checkpoints.push({ name, position: cp, index });

    addPlatform(0, 0, z, 9, 6, 1.0, mats.jellyLime);

    addStaticBox(-3.6, 2.6, z, 0.55, 4.2, 0.55, mats.trim);
    addStaticBox(3.6, 2.6, z, 0.55, 4.2, 0.55, mats.trim);
    addStaticBox(0, 4.9, z, 8.2, 0.45, 0.55, accent);
    addStaticBox(-3.6, 2.6, z + 0.35, 0.18, 3.6, 0.18, accent);
    addStaticBox(3.6, 2.6, z + 0.35, 0.18, 3.6, 0.18, accent);
    addStaticBox(0, 4.55, z + 0.35, 7.4, 0.14, 0.14, mats.neonHot);

    const halo = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(2.4, 0.07, 8, 40)),
      accent,
    );
    halo.position.set(0, 3.2, z);
    halo.rotation.y = Math.PI / 2;
    group.add(halo);
    pulseLights.push({ mesh: halo, base: 1.2, speed: 2.4, phase: index });

    addStaticBox(0, 0.72, z + 1.6, 2.2, 0.12, 0.7, accent);
    return cp;
  }

  // ——— START PAD ———
  addPlatform(0, 0, 0, 11, 11, 1.25, mats.jellyLime);
  addStaticBox(0, 0.9, -4.4, 3.4, 0.28, 0.28, mats.neonCyan);
  addSafeLedge(-4.5, 0.9, 1.5, 2.2, 2.0);
  addSafeLedge(4.5, 0.9, 1.5, 2.2, 2.0);

  const spawn = new THREE.Vector3(0, 2.25, 2.8);
  checkpoints.push({ name: "START", position: spawn.clone(), index: 0 });

  const startRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(5.4, 0.09, 8, 48)),
    mats.neonLime,
  );
  startRing.rotation.x = Math.PI / 2;
  startRing.position.set(0, 0.72, 0);
  group.add(startRing);
  pulseLights.push({ mesh: startRing, base: 1.4, speed: 1.6, phase: 0 });

  addPlatform(0, 0, -11, 4.2, 9, 1.0, mats.jellyPink);
  addStaticBox(0, 0.7, -11, 3.4, 0.1, 0.1, mats.neonHot);

  // ——— SECTION 1: SPINNING BARS + SLIM BEAMS ———
  addPlatform(0, 0, -24, 16, 16, 1.05, mats.jellyCyan);

  for (let i = 0; i < 3; i++) {
    const len = 13.5;
    const beam = addMesh(
      new THREE.BoxGeometry(len, 0.95, 1.15),
      i === 1 ? mats.hazard : mats.hazardWarn,
      0,
      1.45,
      -18 - i * 4.2,
    );
    const tipL = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.9, 1.15, 1.35)),
      mats.neonHot,
    );
    tipL.position.set(-len / 2 + 0.2, 0, 0);
    beam.add(tipL);
    const tipR = tipL.clone();
    tipR.position.x = len / 2 - 0.2;
    beam.add(tipR);

    const baseZ = beam.position.z;
    const speed = 0.75 + i * 0.32;
    const phase = i * 1.35;
    const dir = i % 2 === 0 ? 1 : -1;
    addKinematic(beam, len, 0.95, 1.15, (t) => {
      const angle = (t * speed + phase) * dir;
      quat.setFromEuler(euler.set(0, angle, 0));
      beam.quaternion.copy(quat);
      pos.set(0, 1.45, baseZ);
      return { pos, rot: quat };
    });
  }

  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -6.2 : 6.2;
    const slim = addMesh(
      new THREE.BoxGeometry(1.05, 0.45, 10),
      mats.jellyPink,
      side,
      2.15,
      -24,
    );
    const baseY = 2.15;
    addKinematic(slim, 1.05, 0.45, 10, (t) => {
      const bob = Math.sin(t * 1.1 + i * Math.PI) * 0.18;
      pos.set(side, baseY + bob, -24);
      slim.position.copy(pos);
      return { pos };
    });
  }

  addSafeLedge(-6.5, 0.85, -30, 2.6, 2.2);
  addSafeLedge(6.5, 0.85, -30, 2.6, 2.2);

  addCheckpointGate(-34, "SPIN ZONE", 1, mats.neonCyan);

  // ——— SECTION 2: SPINNING HEX HOP ———
  addPlatform(0, 0, -40, 5.5, 4, 1.0, mats.jellyPink);

  const hexLayout = [
    [-3.6, -46],
    [3.6, -46],
    [0, -52],
    [-4.2, -58],
    [4.2, -58],
    [0, -64],
    [-3.2, -70],
    [3.4, -70],
    [0, -76],
  ] as const;

  hexLayout.forEach(([hx, hz], i) => {
    const tile = addMesh(
      new THREE.CylinderGeometry(2.05, 2.05, 0.65, 6),
      i % 2 === 0 ? mats.jellyCyan : mats.jellyPink,
      hx,
      0.4,
      hz,
    );
    if (i % 3 === 2) {
      const rim = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(2.05, 0.08, 6, 6)),
        mats.hazard,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.38;
      tile.add(rim);
    }
    const baseY = 0.4;
    const spinDir = i % 2 === 0 ? 1 : -1;
    addKinematic(tile, 3.5, 0.65, 3.5, (t) => {
      const bob = Math.sin(t * 1.35 + i * 0.75) * 0.5;
      const spin = t * (0.55 + (i % 3) * 0.15) * spinDir;
      pos.set(hx, baseY + bob, hz);
      tile.position.y = pos.y;
      quat.setFromEuler(euler.set(0, spin, 0));
      tile.quaternion.copy(quat);
      return { pos, rot: quat };
    });
  });

  addSafeLedge(0, 0.9, -61, 2.8, 2.0);

  addCheckpointGate(-82, "HEX HOP", 2, mats.neonLime);

  // ——— SECTION 3: PUNCHERS ———
  addPlatform(0, 0, -96, 11, 20, 1.05, mats.jellyPink);

  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -88 - i * 3.6;
    const homeX = side * 5.4;

    addStaticBox(homeX, 1.6, z, 1.4, 2.2, 1.6, mats.metal);
    addStaticBox(homeX, 2.85, z, 1.5, 0.2, 1.7, mats.hazardWarn);

    const fist = addMesh(
      new THREE.BoxGeometry(2.6, 1.5, 1.5),
      mats.hazard,
      homeX - side * 1.2,
      1.55,
      z,
    );
    const face = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.2, 1.35, 1.35)),
      mats.neonHot,
    );
    face.position.x = -side * 1.25;
    fist.add(face);

    const shaft = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 3.2, 10)),
      mats.metal,
    );
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = side * 1.4;
    fist.add(shaft);

    const phase = i * 0.85;
    const speed = 1.55 + i * 0.12;
    const reach = 4.6;
    addKinematic(fist, 2.6, 1.5, 1.5, (t) => {
      const wave = Math.sin(t * speed + phase);
      const punch = wave > 0 ? wave * wave : wave * 0.45;
      const x = homeX - side * (1.2 + punch * reach);
      pos.set(x, 1.55, z);
      fist.position.copy(pos);
      return { pos };
    });
  }

  addSafeLedge(-4.8, 0.9, -96, 2.4, 2.6);
  addSafeLedge(4.8, 0.9, -96, 2.4, 2.6);

  addCheckpointGate(-112, "PUNCHES", 3, mats.neonHot);

  // ——— SECTION 4: CONVEYORS + SLIM BEAMS ———
  addPlatform(0, 0, -118, 5, 4, 1.0, mats.jellyCyan);

  for (let i = 0; i < 3; i++) {
    const bz = -124 - i * 5.5;
    const belt = addMesh(
      new THREE.BoxGeometry(10, 0.55, 3.2),
      mats.conveyor,
      0,
      0.85,
      bz,
    );
    addStaticBox(-5.4, 1.3, bz, 0.35, 1.2, 3.0, mats.hazardWarn);
    addStaticBox(5.4, 1.3, bz, 0.35, 1.2, 3.0, mats.hazardWarn);

    const amp = 3.8 + i * 0.4;
    const speed = 0.7 + i * 0.18;
    const phase = i * 1.1;
    const dir = i % 2 === 0 ? 1 : -1;
    addKinematic(belt, 10, 0.55, 3.2, (t) => {
      const x = Math.sin(t * speed + phase) * amp * dir;
      pos.set(x, 0.85, bz);
      belt.position.copy(pos);
      const mat = belt.material;
      if (mat instanceof THREE.MeshStandardMaterial && mat.map) {
        mat.map.offset.y = (t * 0.6 * dir) % 1;
      }
      return { pos };
    });
  }

  addPlatform(0, 0, -142, 4, 3.5, 1.0, mats.jellyPink);
  const beamZs = [-146, -151, -156] as const;
  beamZs.forEach((bz, i) => {
    const slim = addMesh(
      new THREE.BoxGeometry(1.15, 0.4, 4.2),
      i === 1 ? mats.hazardWarn : mats.jellyLime,
      0,
      1.1,
      bz,
    );
    const sway = 1.8 + i * 0.35;
    const speed = 0.9 + i * 0.2;
    addKinematic(slim, 1.15, 0.4, 4.2, (t) => {
      const x = Math.sin(t * speed + i) * sway;
      const y = 1.1 + Math.sin(t * 1.4 + i * 0.5) * 0.12;
      pos.set(x, y, bz);
      slim.position.copy(pos);
      quat.setFromEuler(euler.set(0, 0, Math.sin(t * speed) * 0.08));
      slim.quaternion.copy(quat);
      return { pos, rot: quat };
    });

    if (i < 2) {
      const lx = i % 2 === 0 ? -3.2 : 3.2;
      addSafeLedge(lx, 0.95, bz - 2.2, 2.2, 1.8);
    }
  });

  // ——— SECTION 5: SEE-SAW ———
  addPlatform(0, 0, -162, 4.5, 4, 1.0, mats.jellyCyan);

  const seesaw = addMesh(
    new THREE.BoxGeometry(15, 0.65, 3.4),
    mats.wood,
    0,
    1.25,
    -170,
  );
  addStaticBox(0, 0.7, -170, 1.2, 1.0, 1.2, mats.metal);
  addStaticBox(0, 1.35, -170, 1.4, 0.2, 1.4, mats.hazard);

  addKinematic(seesaw, 15, 0.65, 3.4, (t) => {
    const tilt = Math.sin(t * 0.8) * 0.32;
    euler.set(0, 0, tilt);
    quat.setFromEuler(euler);
    seesaw.quaternion.copy(quat);
    pos.set(0, 1.25, -170);
    return { pos, rot: quat };
  });

  // ——— FINAL APPROACH ———
  for (let i = 0; i < 3; i++) {
    const bz = -180 - i * 5;
    const pad = addMesh(
      new THREE.BoxGeometry(3.4, 0.65, 3.4),
      i === 2 ? mats.finish : mats.jellyLime,
      0,
      0.9,
      bz,
    );
    addKinematic(pad, 3.4, 0.65, 3.4, (t) => {
      const x = Math.sin(t * 1.15 + i * 2.1) * 4.2;
      pos.set(x, 0.9, bz);
      pad.position.copy(pos);
      return { pos };
    });
  }

  // ——— FINISH STADIUM ———
  const finishZ = -202;
  addPlatform(0, 0, finishZ, 14, 12, 1.5, mats.finish);

  addStaticBox(0, 1.4, finishZ - 2.5, 6, 1.2, 4, mats.jellyLime);
  addStaticBox(0, 2.3, finishZ - 3.2, 3.5, 1.0, 2.8, mats.jellyCyan);
  addStaticBox(0, 3.1, finishZ - 3.6, 2.0, 0.7, 1.8, mats.neonHot);

  addStaticBox(-5.5, 4.0, finishZ - 4.5, 0.7, 6.5, 0.7, mats.jellyPink);
  addStaticBox(5.5, 4.0, finishZ - 4.5, 0.7, 6.5, 0.7, mats.jellyCyan);
  addStaticBox(0, 7.4, finishZ - 4.5, 12, 0.7, 0.7, mats.hazard);
  addStaticBox(0, 6.8, finishZ - 4.2, 11, 0.18, 0.18, mats.neonLime);
  addStaticBox(0, 4.2, finishZ - 4.2, 10.5, 0.12, 0.12, mats.neonCyan);

  const finishHalo = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(4.5, 0.12, 10, 48)),
    mats.neonHot,
  );
  finishHalo.position.set(0, 4.5, finishZ - 4.5);
  finishHalo.rotation.y = Math.PI / 2;
  group.add(finishHalo);
  pulseLights.push({ mesh: finishHalo, base: 1.5, speed: 2.0, phase: 4 });

  const bannerSpecs: Array<{
    x: number;
    z: number;
    mat: THREE.MeshStandardMaterial;
  }> = [
    { x: -7.5, z: finishZ + 2, mat: mats.bannerHot },
    { x: 7.5, z: finishZ + 2, mat: mats.bannerLime },
    { x: -7.5, z: finishZ - 3, mat: mats.bannerLime },
    { x: 7.5, z: finishZ - 3, mat: mats.bannerHot },
  ];
  for (let bi = 0; bi < bannerSpecs.length; bi++) {
    const b = bannerSpecs[bi]!;
    const pivot = new THREE.Group();
    pivot.position.set(b.x, 5.5, b.z);
    group.add(pivot);
    const cloth = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(2.4, 4.5)),
      b.mat,
    );
    cloth.position.y = -1.8;
    cloth.castShadow = true;
    pivot.add(cloth);
    bannerPivots.push(pivot);
    addStaticBox(b.x, 4.2, b.z, 0.2, 7.5, 0.2, mats.metal);
  }

  for (let i = 0; i < 4; i++) {
    const glowMat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? Palette.lime : Palette.hot,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    extraMats.push(glowMat);
    const disc = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(1.1, 24)), glowMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(
      (i % 2 === 0 ? -3 : 3) * (i < 2 ? 1 : 1.4),
      0.82,
      finishZ + (i < 2 ? 2 : -1),
    );
    group.add(disc);
    pulseLights.push({
      mesh: disc,
      base: 0.35,
      speed: 3 + i * 0.4,
      phase: i * 0.7,
    });
  }

  const finishZone = new THREE.Box3(
    new THREE.Vector3(-6, 0, finishZ - 6),
    new THREE.Vector3(6, 8, finishZ + 4),
  );

  for (let z = 0; z > finishZ; z -= 8) {
    const railMat = z % 16 === 0 ? mats.jellyPink : mats.jellyCyan;
    addStaticBox(-8.2, 0.35, z, 0.45, 0.45, 6, railMat);
    addStaticBox(8.2, 0.35, z, 0.45, 0.45, 6, railMat);
  }

  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();

  return {
    group,
    spawn,
    checkpoints,
    finishZone,
    update(t, _dt, phys) {
      startRing.rotation.z = t * 0.45;
      finishHalo.rotation.z = t * 0.55;

      for (const p of pulseLights) {
        const mat = p.mesh.material;
        const pulse = p.base + Math.sin(t * p.speed + p.phase) * 0.35;
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissiveIntensity = Math.max(0.4, pulse);
        } else if (mat instanceof THREE.MeshBasicMaterial) {
          mat.opacity = Math.max(0.12, pulse);
        }
      }

      for (let i = 0; i < bannerPivots.length; i++) {
        const pivot = bannerPivots[i]!;
        pivot.rotation.y = Math.sin(t * 1.8 + i) * 0.12;
        pivot.rotation.z = Math.sin(t * 2.2 + i * 0.7) * 0.05;
      }

      for (const mover of movers) {
        const { pos: p, rot } = mover.update(t);
        tmpPos.copy(p);
        if (rot) tmpQuat.copy(rot);
        else tmpQuat.identity();
        phys.setKinematicPose(
          kinematicBodies[mover.bodyIndex]!.rigidBody,
          tmpPos,
          rot ? tmpQuat : undefined,
        );
      }
    },
    dispose() {
      for (const g of disposables) g.dispose();
      for (const m of extraMats) m.dispose();
      scene.remove(group);
    },
  };
}
