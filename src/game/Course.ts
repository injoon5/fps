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

/** Rounded rectangle in Shape space (XY → extruded to Y-up). */
function roundedRectShape(width: number, depth: number, radius: number): THREE.Shape {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(radius, hw * 0.48, hd * 0.48);
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}

/**
 * Fall Guys finals gauntlet — readable, spectacular, fair:
 * start → candy rollers → hex hop → hammers → conveyors → seesaw → stadium finish.
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

  function enableShadows(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  /**
   * Candy-pad ExtrudeGeometry: RoundedRect + bevel for thickness read.
   * Centered on origin; physics AABB stays w×h×d.
   */
  function createBeveledPadGeo(
    w: number,
    d: number,
    h: number,
    cornerRadius?: number,
  ): THREE.BufferGeometry {
    const r = cornerRadius ?? Math.min(w, d) * 0.18;
    const bevel = Math.min(0.26, w * 0.065, d * 0.065, h * 0.42);
    const shape = roundedRectShape(
      Math.max(0.35, w - bevel * 2),
      Math.max(0.35, d - bevel * 2),
      Math.max(0.08, r - bevel),
    );
    const depth = Math.max(0.1, h - bevel * 2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: 0,
      bevelSegments: 4,
      curveSegments: 10,
    });
    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    geo.translate(
      -(bb.min.x + bb.max.x) * 0.5,
      -(bb.min.y + bb.max.y) * 0.5,
      -(bb.min.z + bb.max.z) * 0.5,
    );
    return trackGeo(geo);
  }

  /** Platform builder: beveled pad + contrasting rim lip + underside skirt. */
  function addPlatform(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    material: THREE.Material,
  ): THREE.Group {
    const pad = new THREE.Group();
    pad.position.set(x, y, z);
    group.add(pad);

    const body = new THREE.Mesh(createBeveledPadGeo(w, d, h), material);
    pad.add(body);

    const rimH = Math.min(0.11, h * 0.16);
    const rim = new THREE.Mesh(
      createBeveledPadGeo(w * 1.03, d * 1.03, rimH, Math.min(w, d) * 0.15),
      mats.rim,
    );
    rim.position.y = h * 0.5 + rimH * 0.15;
    pad.add(rim);

    const skirtH = Math.min(0.26, h * 0.4);
    const skirt = new THREE.Mesh(
      createBeveledPadGeo(w * 0.9, d * 0.9, skirtH, Math.min(w, d) * 0.12),
      mats.underside,
    );
    skirt.position.y = -h * 0.42;
    pad.add(skirt);

    enableShadows(pad);

    pos.set(x, y, z);
    half.set(w / 2, h / 2, d / 2);
    quat.identity();
    physics.createStaticBox(pos, half, quat);
    return pad;
  }

  /** Round / hex candy pad with rim torus + underside disc. */
  function addRoundPad(
    x: number,
    y: number,
    z: number,
    radius: number,
    h: number,
    material: THREE.Material,
    segments = 24,
    withPhysics = true,
  ): THREE.Group {
    const segs = Math.max(6, Math.min(32, segments));
    const pad = new THREE.Group();
    pad.position.set(x, y, z);
    group.add(pad);

    const body = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(radius, radius * 0.97, h, segs)),
      material,
    );
    pad.add(body);

    const rim = new THREE.Mesh(
      trackGeo(
        new THREE.TorusGeometry(radius * 0.96, Math.min(0.1, h * 0.14), 8, segs),
      ),
      mats.rim,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = h * 0.48;
    pad.add(rim);

    const skirt = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(radius * 0.88, radius * 0.86, h * 0.35, segs)),
      mats.underside,
    );
    skirt.position.y = -h * 0.4;
    pad.add(skirt);

    enableShadows(pad);

    if (withPhysics) {
      pos.set(x, y, z);
      half.set(radius, h / 2, radius);
      quat.identity();
      physics.createStaticBox(pos, half, quat);
    }
    return pad;
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

  function addStaticCylinder(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    material: THREE.Material,
    segments = 14,
  ): THREE.Mesh {
    const segs = Math.max(6, Math.min(32, segments));
    const mesh = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(radius, radius, height, segs)),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    pos.set(x, y, z);
    half.set(radius, height / 2, radius);
    physics.createStaticBox(pos, half);
    return mesh;
  }

  function addKinematic(
    mesh: THREE.Object3D,
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

  /** Candy roller — capsule shaft + sphere tips + stripe bands. */
  function createCandyRoller(
    length: number,
    radius: number,
    bodyMat: THREE.Material,
    tipMat: THREE.Material,
  ): THREE.Group {
    const roller = new THREE.Group();
    const shaftLen = Math.max(0.25, length - radius * 2.2);
    const shaft = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(radius, shaftLen, 6, 14)),
      bodyMat,
    );
    shaft.rotation.z = Math.PI / 2;
    roller.add(shaft);

    const tipGeo = trackGeo(new THREE.SphereGeometry(radius * 1.2, 14, 12));
    const tipL = new THREE.Mesh(tipGeo, tipMat);
    tipL.position.x = -length / 2 + radius * 0.2;
    roller.add(tipL);
    const tipR = new THREE.Mesh(tipGeo, tipMat);
    tipR.position.x = length / 2 - radius * 0.2;
    roller.add(tipR);

    const bandGeo = trackGeo(
      new THREE.TorusGeometry(radius * 1.04, radius * 0.16, 6, 18),
    );
    for (const bx of [-length * 0.2, 0, length * 0.2]) {
      const band = new THREE.Mesh(bandGeo, tipMat);
      band.rotation.y = Math.PI / 2;
      band.position.x = bx;
      roller.add(band);
    }

    enableShadows(roller);
    return roller;
  }

  /** Rubber hammer — capsule shaft + bulbous sphere head. */
  function createRubberHammer(
    side: number,
    headMat: THREE.Material,
    shaftMat: THREE.Material,
  ): THREE.Group {
    const hammer = new THREE.Group();

    const shaft = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.2, 2.55, 5, 10)),
      shaftMat,
    );
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = side * 0.95;
    hammer.add(shaft);

    const head = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.62, 0.5, 6, 12)),
      headMat,
    );
    head.position.x = -side * 0.8;
    hammer.add(head);

    const bulb = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.8, 14, 12)),
      headMat,
    );
    bulb.position.x = -side * 1.35;
    hammer.add(bulb);

    const face = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.52, 12, 10)),
      mats.neonHot,
    );
    face.position.x = -side * 1.9;
    face.scale.set(0.42, 1.05, 1.05);
    hammer.add(face);

    enableShadows(hammer);
    return hammer;
  }

  /** Slim safe ledge — visual rest between chaos. */
  function addSafeLedge(x: number, y: number, z: number, w = 3.2, d = 2.4): void {
    addPlatform(x, y, z, w, d, 0.55, mats.safe);
    addStaticBox(x, y + 0.4, z, w * 0.88, 0.07, 0.1, mats.neonLime);
  }

  const checkpoints: Checkpoint[] = [];

  /** Checkpoint arch — thick pillars, glowing torus, hanging banners. */
  function addCheckpointGate(
    z: number,
    name: string,
    index: number,
    accent: THREE.MeshStandardMaterial,
    bannerMat: THREE.MeshStandardMaterial,
  ): THREE.Vector3 {
    const cp = new THREE.Vector3(0, 2.15, z);
    checkpoints.push({ name, position: cp, index });

    addPlatform(0, 0, z, 9, 6, 1.0, mats.jellyLime);

    addStaticCylinder(-3.55, 2.75, z, 0.48, 4.5, mats.trim, 16);
    addStaticCylinder(3.55, 2.75, z, 0.48, 4.5, mats.trim, 16);
    addStaticCylinder(-3.55, 2.75, z + 0.02, 0.26, 4.0, accent, 12);
    addStaticCylinder(3.55, 2.75, z + 0.02, 0.26, 4.0, accent, 12);

    addStaticBox(0, 5.15, z, 8.5, 0.55, 0.75, accent);
    addStaticBox(0, 4.78, z + 0.4, 7.6, 0.12, 0.12, mats.neonHot);

    const halo = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(2.35, 0.18, 12, 48)),
      accent,
    );
    halo.position.set(0, 3.15, z);
    halo.rotation.y = Math.PI / 2;
    halo.castShadow = true;
    halo.receiveShadow = true;
    group.add(halo);
    pulseLights.push({ mesh: halo, base: 1.5, speed: 2.4, phase: index });

    for (const side of [-1.55, 1.55]) {
      const pivot = new THREE.Group();
      pivot.position.set(side, 4.95, z + 0.18);
      group.add(pivot);
      const cloth = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(1.4, 2.5)),
        bannerMat,
      );
      cloth.position.y = -1.2;
      cloth.castShadow = true;
      cloth.receiveShadow = true;
      pivot.add(cloth);
      bannerPivots.push(pivot);
    }

    addPlatform(0, 0.55, z + 1.55, 2.4, 0.9, 0.22, accent);
    return cp;
  }

  // ——— START PAD ———
  addRoundPad(0, 0, 0, 5.6, 1.25, mats.jellyLime, 28);
  addStaticBox(0, 0.9, -4.4, 3.4, 0.28, 0.28, mats.neonCyan);
  addSafeLedge(-4.5, 0.9, 1.5, 2.2, 2.0);
  addSafeLedge(4.5, 0.9, 1.5, 2.2, 2.0);

  const spawn = new THREE.Vector3(0, 2.25, 2.8);
  checkpoints.push({ name: "START", position: spawn.clone(), index: 0 });

  const startRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(5.55, 0.13, 10, 48)),
    mats.neonLime,
  );
  startRing.rotation.x = Math.PI / 2;
  startRing.position.set(0, 0.72, 0);
  startRing.castShadow = true;
  startRing.receiveShadow = true;
  group.add(startRing);
  pulseLights.push({ mesh: startRing, base: 1.4, speed: 1.6, phase: 0 });

  addPlatform(0, 0, -11, 4.2, 9, 1.0, mats.jellyPink);
  addStaticBox(0, 0.7, -11, 3.4, 0.1, 0.1, mats.neonHot);

  // ——— SECTION 1: CANDY ROLLERS + SLIM BEAMS ———
  addPlatform(0, 0, -24, 16, 16, 1.05, mats.jellyCyan);

  for (let i = 0; i < 3; i++) {
    const len = 13.5;
    const radius = 0.55;
    const bodyMat = i === 1 ? mats.hazard : mats.hazardWarn;
    const tipMat =
      i === 0 ? mats.rubberHot : i === 1 ? mats.rubberLime : mats.rubberCyan;
    const roller = createCandyRoller(len, radius, bodyMat, tipMat);
    roller.position.set(0, 1.45, -18 - i * 4.2);
    group.add(roller);

    const baseZ = roller.position.z;
    const speed = 0.75 + i * 0.32;
    const phase = i * 1.35;
    const dir = i % 2 === 0 ? 1 : -1;
    addKinematic(roller, len, radius * 2.25, radius * 2.25, (t) => {
      const angle = (t * speed + phase) * dir;
      quat.setFromEuler(euler.set(0, angle, 0));
      roller.quaternion.copy(quat);
      pos.set(0, 1.45, baseZ);
      return { pos, rot: quat };
    });
  }

  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -6.2 : 6.2;
    const slim = new THREE.Group();
    slim.position.set(side, 2.15, -24);
    slim.add(new THREE.Mesh(createBeveledPadGeo(1.05, 10, 0.45, 0.2), mats.jellyPink));
    const lip = new THREE.Mesh(createBeveledPadGeo(1.12, 10.1, 0.08, 0.22), mats.rim);
    lip.position.y = 0.28;
    slim.add(lip);
    enableShadows(slim);
    group.add(slim);

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

  addCheckpointGate(-34, "SPIN ZONE", 1, mats.neonCyan, mats.bannerLime);

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
    const tile = new THREE.Group();
    tile.position.set(hx, 0.4, hz);
    const r = 2.05;
    const h = 0.7;
    const body = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(r, r * 0.95, h, 6)),
      i % 2 === 0 ? mats.jellyCyan : mats.jellyPink,
    );
    tile.add(body);

    const lip = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(r * 0.96, 0.1, 6, 6)),
      i % 3 === 2 ? mats.hazard : mats.rim,
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = h * 0.48;
    tile.add(lip);

    const skirt = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(r * 0.86, r * 0.84, h * 0.35, 6)),
      mats.underside,
    );
    skirt.position.y = -h * 0.4;
    tile.add(skirt);
    enableShadows(tile);
    group.add(tile);

    const baseY = 0.4;
    const spinDir = i % 2 === 0 ? 1 : -1;
    addKinematic(tile, 3.5, h, 3.5, (t) => {
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

  addCheckpointGate(-82, "HEX HOP", 2, mats.neonLime, mats.bannerHot);

  // ——— SECTION 3: RUBBER HAMMER PUNCHERS ———
  addPlatform(0, 0, -96, 11, 20, 1.05, mats.jellyPink);

  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -88 - i * 3.6;
    const homeX = side * 5.4;

    addStaticCylinder(homeX, 1.6, z, 0.88, 2.2, mats.metal, 14);
    addStaticCylinder(homeX, 2.85, z, 0.98, 0.28, mats.hazardWarn, 14);

    const headMat = i % 2 === 0 ? mats.rubberHot : mats.rubberCyan;
    const fist = createRubberHammer(side, headMat, mats.metal);
    fist.position.set(homeX - side * 1.2, 1.55, z);
    group.add(fist);

    const phase = i * 0.85;
    const speed = 1.55 + i * 0.12;
    const reach = 4.6;
    addKinematic(fist, 2.9, 1.65, 1.65, (t) => {
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

  addCheckpointGate(-112, "PUNCHES", 3, mats.neonHot, mats.bannerLime);

  // ——— SECTION 4: CONVEYORS + SLIM BEAMS ———
  addPlatform(0, 0, -118, 5, 4, 1.0, mats.jellyCyan);

  for (let i = 0; i < 3; i++) {
    const bz = -124 - i * 5.5;
    const beltRoot = new THREE.Group();
    beltRoot.position.set(0, 0.85, bz);
    const belt = new THREE.Mesh(createBeveledPadGeo(10, 3.2, 0.55, 0.35), mats.conveyor);
    beltRoot.add(belt);
    const beltLip = new THREE.Mesh(
      createBeveledPadGeo(10.15, 3.35, 0.08, 0.38),
      mats.rim,
    );
    beltLip.position.y = 0.32;
    beltRoot.add(beltLip);
    enableShadows(beltRoot);
    group.add(beltRoot);

    addStaticCylinder(-5.4, 1.3, bz, 0.22, 1.2, mats.hazardWarn, 10);
    addStaticCylinder(5.4, 1.3, bz, 0.22, 1.2, mats.hazardWarn, 10);

    const amp = 3.8 + i * 0.4;
    const speed = 0.7 + i * 0.18;
    const phase = i * 1.1;
    const dir = i % 2 === 0 ? 1 : -1;
    addKinematic(beltRoot, 10, 0.55, 3.2, (t) => {
      const x = Math.sin(t * speed + phase) * amp * dir;
      pos.set(x, 0.85, bz);
      beltRoot.position.copy(pos);
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
    const slim = new THREE.Group();
    slim.position.set(0, 1.1, bz);
    slim.add(
      new THREE.Mesh(
        createBeveledPadGeo(1.15, 4.2, 0.4, 0.22),
        i === 1 ? mats.hazardWarn : mats.jellyLime,
      ),
    );
    const lip = new THREE.Mesh(createBeveledPadGeo(1.22, 4.3, 0.07, 0.24), mats.rim);
    lip.position.y = 0.24;
    slim.add(lip);
    enableShadows(slim);
    group.add(slim);

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

  const seesaw = new THREE.Group();
  seesaw.position.set(0, 1.25, -170);
  seesaw.add(new THREE.Mesh(createBeveledPadGeo(15, 3.4, 0.65, 0.4), mats.wood));
  const plankRim = new THREE.Mesh(createBeveledPadGeo(15.2, 3.55, 0.09, 0.42), mats.rim);
  plankRim.position.y = 0.38;
  seesaw.add(plankRim);
  enableShadows(seesaw);
  group.add(seesaw);

  addStaticCylinder(0, 0.7, -170, 0.65, 1.0, mats.metal, 12);
  addStaticCylinder(0, 1.35, -170, 0.75, 0.22, mats.hazard, 12);

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
    const pad = addRoundPad(
      0,
      0.9,
      bz,
      1.85,
      0.7,
      i === 2 ? mats.finish : mats.jellyLime,
      28,
      false,
    );
    addKinematic(pad, 3.4, 0.7, 3.4, (t) => {
      const x = Math.sin(t * 1.15 + i * 2.1) * 4.2;
      pos.set(x, 0.9, bz);
      pad.position.copy(pos);
      return { pos };
    });
  }

  // ——— FINISH STADIUM ———
  const finishZ = -202;
  addPlatform(0, 0, finishZ, 14, 12, 1.5, mats.finish);

  addPlatform(0, 1.4, finishZ - 2.5, 6, 4, 1.2, mats.jellyLime);
  addPlatform(0, 2.3, finishZ - 3.2, 3.5, 2.8, 1.0, mats.jellyCyan);
  addRoundPad(0, 3.1, finishZ - 3.6, 1.05, 0.7, mats.neonHot, 20);

  addStaticCylinder(-5.5, 4.0, finishZ - 4.5, 0.42, 6.5, mats.jellyPink, 14);
  addStaticCylinder(5.5, 4.0, finishZ - 4.5, 0.42, 6.5, mats.jellyCyan, 14);
  addStaticBox(0, 7.4, finishZ - 4.5, 12, 0.7, 0.7, mats.hazard);
  addStaticBox(0, 6.8, finishZ - 4.2, 11, 0.18, 0.18, mats.neonLime);
  addStaticBox(0, 4.2, finishZ - 4.2, 10.5, 0.12, 0.12, mats.neonCyan);

  const finishHalo = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(4.5, 0.18, 12, 48)),
    mats.neonHot,
  );
  finishHalo.position.set(0, 4.5, finishZ - 4.5);
  finishHalo.rotation.y = Math.PI / 2;
  finishHalo.castShadow = true;
  finishHalo.receiveShadow = true;
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
    cloth.receiveShadow = true;
    pivot.add(cloth);
    bannerPivots.push(pivot);
    addStaticCylinder(b.x, 4.2, b.z, 0.14, 7.5, mats.metal, 10);
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

  // Side rails in frustum-friendly chunks
  for (let z = 0; z > finishZ; z -= 8) {
    const railMat = z % 16 === 0 ? mats.jellyPink : mats.jellyCyan;
    addStaticCylinder(-8.2, 0.35, z, 0.28, 0.55, railMat, 10);
    addStaticCylinder(8.2, 0.35, z, 0.28, 0.55, railMat, 10);
    if (z - 8 > finishZ) {
      addStaticBox(-8.2, 0.35, z - 4, 0.18, 0.18, 7.2, railMat);
      addStaticBox(8.2, 0.35, z - 4, 0.18, 0.18, 7.2, railMat);
    }
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
