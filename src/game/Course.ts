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

/**
 * Fall Guys–inspired first-person gauntlet:
 * start pad → spinning beams → hex tiles → hammers → see-saw → finish.
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

  const pos = new THREE.Vector3();
  const half = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();

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
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    disposables.push(geo);
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

  function addRoundedPlatform(
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

  // ——— START ———
  addRoundedPlatform(0, 0, 0, 10, 10, 1.2, mats.jellyLime);
  addStaticBox(0, 0.85, -4.2, 3.2, 0.35, 0.35, mats.trim);

  const spawn = new THREE.Vector3(0, 2.2, 2.5);
  const checkpoints: Checkpoint[] = [
    { name: "START", position: spawn.clone(), index: 0 },
  ];

  // Bridge to spinning section
  addRoundedPlatform(0, 0, -10, 4, 8, 1.0, mats.jellyPink);

  // ——— SPINNING BEAMS ———
  addRoundedPlatform(0, 0, -22, 14, 14, 1.0, mats.jellyCyan);
  for (let i = 0; i < 3; i++) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.9, 1.1),
      i === 1 ? mats.hazard : mats.jellyPink,
    );
    disposables.push(beam.geometry);
    beam.position.set(0, 1.4, -18 - i * 4);
    beam.castShadow = true;
    beam.receiveShadow = true;
    group.add(beam);
    const baseZ = beam.position.z;
    const speed = 0.9 + i * 0.35;
    const phase = i * 1.2;
    addKinematic(beam, 12, 0.9, 1.1, (t) => {
      const angle = t * speed + phase;
      quat.setFromEuler(euler.set(0, angle, 0));
      beam.quaternion.copy(quat);
      pos.set(0, 1.4, baseZ);
      return { pos, rot: quat };
    });
  }

  // Checkpoint 1
  const cp1 = new THREE.Vector3(0, 2.2, -28);
  checkpoints.push({ name: "SPIN ZONE", position: cp1, index: 1 });
  addStaticBox(0, 1.1, -28, 0.4, 1.6, 0.4, mats.trim);
  addStaticBox(0, 2.1, -28, 1.4, 0.25, 0.25, mats.jellyLime);

  // ——— HEX / TILE HOP ———
  addRoundedPlatform(0, 0, -34, 6, 4, 1.0, mats.jellyPink);
  const hexPositions = [
    [-3.5, -40],
    [3.5, -40],
    [0, -46],
    [-4, -52],
    [4, -52],
    [0, -58],
    [-3, -64],
    [3.5, -64],
    [0, -70],
  ] as const;

  hexPositions.forEach(([hx, hz], i) => {
    const tile = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 0.7, 6),
      i % 2 === 0 ? mats.jellyCyan : mats.jellyPink,
    );
    disposables.push(tile.geometry);
    const baseY = 0.35;
    tile.position.set(hx, baseY, hz);
    tile.castShadow = true;
    tile.receiveShadow = true;
    group.add(tile);
    addKinematic(tile, 3.6, 0.7, 3.6, (t) => {
      const bob = Math.sin(t * 1.4 + i * 0.8) * 0.55;
      pos.set(hx, baseY + bob, hz);
      tile.position.y = pos.y;
      tile.rotation.y = t * 0.25 * (i % 2 === 0 ? 1 : -1);
      quat.setFromEuler(euler.set(0, tile.rotation.y, 0));
      return { pos, rot: quat };
    });
  });

  // Checkpoint 2
  addRoundedPlatform(0, 0, -78, 8, 8, 1.0, mats.jellyLime);
  const cp2 = new THREE.Vector3(0, 2.2, -78);
  checkpoints.push({ name: "HEX HOP", position: cp2, index: 2 });

  // ——— HAMMERS ———
  addRoundedPlatform(0, 0, -92, 10, 18, 1.0, mats.jellyPink);
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set((i % 2 === 0 ? -1.5 : 1.5) * 2, 3.2, -86 - i * 4);
    group.add(pivot);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 5.5, 12),
      mats.metal,
    );
    disposables.push(shaft.geometry);
    shaft.position.y = -1.2;
    shaft.castShadow = true;
    pivot.add(shaft);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.4, 1.4),
      mats.hazard,
    );
    disposables.push(head.geometry);
    head.position.set(0, -3.6, 0);
    head.castShadow = true;
    pivot.add(head);

    // Approximate with kinematic head box for collision
    const hammerProxy = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.4, 1.4),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    disposables.push(hammerProxy.geometry);
    group.add(hammerProxy);
    const base = pivot.position.clone();
    const side = i % 2 === 0 ? 1 : -1;
    const speed = 1.3 + i * 0.15;
    addKinematic(hammerProxy, 2.4, 1.4, 1.4, (t) => {
      const swing = Math.sin(t * speed) * 1.1 * side;
      pivot.rotation.z = swing;
      // Place proxy at hammer head world pos
      head.getWorldPosition(pos);
      hammerProxy.position.copy(pos);
      hammerProxy.quaternion.copy(head.getWorldQuaternion(quat));
      return { pos: hammerProxy.position, rot: hammerProxy.quaternion };
    });
    void base;
  }

  // Checkpoint 3
  addRoundedPlatform(0, 0, -108, 8, 6, 1.0, mats.jellyCyan);
  const cp3 = new THREE.Vector3(0, 2.2, -108);
  checkpoints.push({ name: "HAMMERS", position: cp3, index: 3 });

  // ——— SEE-SAW + FINAL RUN ———
  addRoundedPlatform(0, 0, -116, 4, 4, 1.0, mats.jellyPink);

  const seesaw = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.7, 3.5),
    mats.wood,
  );
  disposables.push(seesaw.geometry);
  seesaw.position.set(0, 1.2, -126);
  seesaw.castShadow = true;
  seesaw.receiveShadow = true;
  group.add(seesaw);
  addKinematic(seesaw, 16, 0.7, 3.5, (t) => {
    const tilt = Math.sin(t * 0.85) * 0.35;
    euler.set(0, 0, tilt);
    quat.setFromEuler(euler);
    seesaw.quaternion.copy(quat);
    pos.set(0, 1.2, -126);
    return { pos, rot: quat };
  });

  // Moving finish approach platforms
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.7, 3.5),
      mats.jellyLime,
    );
    disposables.push(p.geometry);
    const bz = -136 - i * 5;
    p.position.set(0, 0.8, bz);
    p.castShadow = true;
    p.receiveShadow = true;
    group.add(p);
    addKinematic(p, 3.5, 0.7, 3.5, (t) => {
      const x = Math.sin(t * 1.2 + i * 2) * 4.5;
      pos.set(x, 0.8, bz);
      p.position.copy(pos);
      return { pos };
    });
  }

  // Finish podium
  addRoundedPlatform(0, 0, -158, 12, 10, 1.4, mats.finish);
  addStaticBox(0, 2.2, -161, 8, 2.8, 0.5, mats.trim);
  // Finish arch
  addStaticBox(-4.5, 3.5, -161, 0.6, 5, 0.6, mats.jellyPink);
  addStaticBox(4.5, 3.5, -161, 0.6, 5, 0.6, mats.jellyCyan);
  addStaticBox(0, 6.2, -161, 10, 0.6, 0.6, mats.hazard);

  const finishZone = new THREE.Box3(
    new THREE.Vector3(-5, 0, -163),
    new THREE.Vector3(5, 6, -155),
  );

  // Decorative side rails along course
  for (let z = 0; z > -160; z -= 8) {
    const railMat = z % 16 === 0 ? mats.jellyPink : mats.jellyCyan;
    addStaticBox(-7.5, 0.4, z, 0.5, 0.5, 6, railMat);
    addStaticBox(7.5, 0.4, z, 0.5, 0.5, 6, railMat);
  }

  // Neon edge strips on start
  const neon = new THREE.Mesh(
    new THREE.TorusGeometry(5.2, 0.08, 8, 48),
    new THREE.MeshStandardMaterial({
      color: Palette.lime,
      emissive: Palette.lime,
      emissiveIntensity: 1.2,
      roughness: 0.3,
    }),
  );
  disposables.push(neon.geometry);
  neon.rotation.x = Math.PI / 2;
  neon.position.set(0, 0.65, 0);
  group.add(neon);

  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();

  return {
    group,
    spawn,
    checkpoints,
    finishZone,
    update(t, _dt, phys) {
      neon.rotation.z = t * 0.4;
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
      scene.remove(group);
    },
  };
}
