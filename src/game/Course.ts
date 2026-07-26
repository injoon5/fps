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
  const floatingDress: Array<{
    mesh: THREE.Object3D;
    baseY: number;
    phase: number;
    speed: number;
  }> = [];

  const pos = new THREE.Vector3();
  const half = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();

  function trackGeo(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    disposables.push(geo);
    return geo;
  }

  // Shared prop geometries — densify without geo thrash
  const blobGeo = trackGeo(new THREE.CircleGeometry(1, 24));
  const ringPropGeo = trackGeo(new THREE.TorusGeometry(0.85, 0.22, 10, 28));
  const coneGeo = trackGeo(new THREE.ConeGeometry(0.38, 0.95, 10));
  const balloonGeo = trackGeo(new THREE.SphereGeometry(0.42, 12, 10));
  const stringGeo = trackGeo(new THREE.CapsuleGeometry(0.018, 1.35, 3, 6));
  const billboardGeo = trackGeo(new THREE.PlaneGeometry(2.2, 1.4));
  const chevronPlaneGeo = trackGeo(new THREE.PlaneGeometry(1.35, 1.35));
  const railEndGeo = trackGeo(new THREE.SphereGeometry(0.22, 10, 8));
  const railPostGeo = trackGeo(new THREE.CapsuleGeometry(0.22, 0.55, 4, 8));

  function enableShadows(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  /** Soft contact blob under a pad — dual disc for grounded AO read. */
  function addBlobShadow(parent: THREE.Object3D, radius: number, y = -0.52): void {
    const soft = new THREE.Mesh(blobGeo, mats.blobShadow);
    soft.rotation.x = -Math.PI / 2;
    soft.position.y = y;
    soft.scale.setScalar(radius);
    soft.castShadow = false;
    soft.receiveShadow = false;
    soft.renderOrder = -2;
    parent.add(soft);

    const core = new THREE.Mesh(blobGeo, mats.blobShadowCore);
    core.rotation.x = -Math.PI / 2;
    core.position.y = y + 0.01;
    core.scale.setScalar(radius * 0.52);
    core.castShadow = false;
    core.receiveShadow = false;
    core.renderOrder = -1;
    parent.add(core);
  }

  /** Chevron arrow decal on pad top. */
  function addChevron(
    parent: THREE.Object3D,
    y: number,
    tex: THREE.Texture,
    scale = 1,
    rotY = 0,
  ): void {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    extraMats.push(mat);
    const decal = new THREE.Mesh(chevronPlaneGeo, mat);
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = rotY;
    decal.position.y = y;
    decal.scale.setScalar(scale);
    decal.castShadow = false;
    decal.receiveShadow = false;
    parent.add(decal);
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

  /** Platform builder: beveled pad + contrasting rim lip + underside skirt + blob. */
  function addPlatform(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    material: THREE.Material,
    opts: { chevron?: boolean; blob?: boolean } = {},
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

    // Darker, slightly larger underside for AO skirt read
    const skirtH = Math.min(0.32, h * 0.48);
    const skirt = new THREE.Mesh(
      createBeveledPadGeo(w * 0.94, d * 0.94, skirtH, Math.min(w, d) * 0.12),
      mats.underside,
    );
    skirt.position.y = -h * 0.48;
    pad.add(skirt);

    if (opts.blob !== false) {
      addBlobShadow(pad, Math.max(w, d) * 0.55, -h * 0.55 - 0.02);
    }
    if (opts.chevron) {
      const tex =
        material === mats.jellyPink
          ? mats.chevronHot
          : material === mats.jellyLime || material === mats.safe
            ? mats.chevronLime
            : mats.chevronDecal;
      addChevron(pad, h * 0.52 + 0.02, tex, Math.min(w, d) * 0.28);
    }

    enableShadows(pad);

    pos.set(x, y, z);
    half.set(w / 2, h / 2, d / 2);
    quat.identity();
    physics.createStaticBox(pos, half, quat);
    return pad;
  }

  /** Round / hex candy pad with rim torus + underside disc + blob. */
  function addRoundPad(
    x: number,
    y: number,
    z: number,
    radius: number,
    h: number,
    material: THREE.Material,
    segments = 24,
    withPhysics = true,
    opts: { chevron?: boolean; blob?: boolean } = {},
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
      trackGeo(new THREE.CylinderGeometry(radius * 0.9, radius * 0.88, h * 0.42, segs)),
      mats.underside,
    );
    skirt.position.y = -h * 0.45;
    pad.add(skirt);

    if (opts.blob !== false) {
      addBlobShadow(pad, radius * 1.05, -h * 0.55 - 0.02);
    }
    if (opts.chevron) {
      addChevron(pad, h * 0.52 + 0.02, mats.chevronLime, radius * 0.55);
    }

    enableShadows(pad);

    if (withPhysics) {
      pos.set(x, y, z);
      half.set(radius, h / 2, radius);
      quat.identity();
      physics.createStaticBox(pos, half, quat);
    }
    return pad;
  }

  /**
   * Visual candy beam — capsule + end spheres, never bare BoxGeometry.
   * Thin bars → capsule; chunky slabs → beveled extrude.
   */
  function addStaticBox(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    material: THREE.Material,
    rotY = 0,
  ): THREE.Mesh | THREE.Group {
    const minDim = Math.min(sx, sy, sz);
    const maxDim = Math.max(sx, sy, sz);
    let mesh: THREE.Mesh | THREE.Group;

    if (minDim <= 0.4 && maxDim >= minDim * 2.5) {
      // Neon / rail bar → capsule + end spheres along longest axis
      const radius = minDim * 0.55;
      let length = maxDim - radius * 2;
      if (length < 0.05) length = 0.05;
      const bar = new THREE.Group();
      const shaft = new THREE.Mesh(
        trackGeo(new THREE.CapsuleGeometry(radius, length, 5, 10)),
        material,
      );
      const tipGeo = trackGeo(new THREE.SphereGeometry(radius * 1.15, 10, 8));
      const tipA = new THREE.Mesh(tipGeo, material);
      const tipB = new THREE.Mesh(tipGeo, material);
      if (sx >= sy && sx >= sz) {
        shaft.rotation.z = Math.PI / 2;
        tipA.position.x = -maxDim / 2 + radius * 0.15;
        tipB.position.x = maxDim / 2 - radius * 0.15;
      } else if (sz >= sx && sz >= sy) {
        shaft.rotation.x = Math.PI / 2;
        tipA.position.z = -maxDim / 2 + radius * 0.15;
        tipB.position.z = maxDim / 2 - radius * 0.15;
      } else {
        tipA.position.y = -maxDim / 2 + radius * 0.15;
        tipB.position.y = maxDim / 2 - radius * 0.15;
      }
      bar.add(shaft, tipA, tipB);
      mesh = bar;
    } else {
      mesh = new THREE.Mesh(createBeveledPadGeo(sx, sz, sy), material);
    }

    mesh.position.set(x, y, z);
    mesh.rotation.y += rotY;
    enableShadows(mesh);
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
    addPlatform(x, y, z, w, d, 0.55, mats.safe, { chevron: true });
    addStaticBox(x, y + 0.4, z, w * 0.88, 0.07, 0.1, mats.neonLime);
  }

  /** Candy side rail — capsule post + tube + end spheres (no bare boxes). */
  function addCandyRailChunk(x: number, zCenter: number, mat: THREE.Material): void {
    const chunk = new THREE.Group();
    chunk.position.set(x, 0, zCenter);

    const post = new THREE.Mesh(railPostGeo, mat);
    post.position.set(0, 0.42, 4);
    chunk.add(post);

    const post2 = new THREE.Mesh(railPostGeo, mat);
    post2.position.set(0, 0.42, -4);
    chunk.add(post2);

    const tube = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.16, 7.2, 4, 8)),
      mat,
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.72, 0);
    chunk.add(tube);

    const tipA = new THREE.Mesh(railEndGeo, mat);
    tipA.position.set(0, 0.72, 3.7);
    chunk.add(tipA);
    const tipB = new THREE.Mesh(railEndGeo, mat);
    tipB.position.set(0, 0.72, -3.7);
    chunk.add(tipB);

    enableShadows(chunk);
    group.add(chunk);
    addBlobShadow(chunk, 0.7, 0.02);
  }

  /** Inflatable ring prop (shared torus geo). */
  function addInflatableRing(
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    scale = 1,
    float = false,
  ): void {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    const ring = new THREE.Mesh(ringPropGeo, mat);
    ring.scale.setScalar(scale);
    ring.rotation.x = Math.PI / 2 + (float ? 0.35 : 0.08);
    root.add(ring);
    enableShadows(root);
    group.add(root);
    if (float) {
      floatingDress.push({ mesh: root, baseY: y, phase: x + z, speed: 0.9 });
    } else {
      addBlobShadow(root, 0.95 * scale, -0.55);
    }
  }

  /** Stack of traffic cones. */
  function addConeStack(x: number, z: number, count = 3): void {
    for (let i = 0; i < count; i++) {
      const cone = new THREE.Mesh(coneGeo, i % 2 === 0 ? mats.coneWarn : mats.hazardWarn);
      cone.position.set(x + (i % 2) * 0.08, 0.48 + i * 0.72, z + i * 0.05);
      enableShadows(cone);
      group.add(cone);
    }
    const base = new THREE.Group();
    base.position.set(x, 0.2, z);
    group.add(base);
    addBlobShadow(base, 0.7, 0);
  }

  /** Balloon cluster — spheres + capsule strings. */
  function addBalloonCluster(x: number, z: number, count = 3): void {
    const matsList = [mats.inflatableHot, mats.inflatableCyan, mats.inflatableSun];
    for (let i = 0; i < count; i++) {
      const root = new THREE.Group();
      const bx = x + (i - (count - 1) * 0.5) * 0.55;
      const by = 2.4 + (i % 3) * 0.35;
      root.position.set(bx, by, z + Math.sin(i) * 0.2);
      const ball = new THREE.Mesh(balloonGeo, matsList[i % matsList.length]!);
      root.add(ball);
      const str = new THREE.Mesh(stringGeo, mats.metal);
      str.position.y = -0.95;
      root.add(str);
      enableShadows(root);
      group.add(root);
      floatingDress.push({
        mesh: root,
        baseY: by,
        phase: i * 1.7 + z * 0.01,
        speed: 1.1 + i * 0.15,
      });
    }
  }

  /** Side billboard on capsule posts. */
  function addBillboard(x: number, z: number, mat: THREE.Material): void {
    const board = new THREE.Group();
    board.position.set(x, 2.6, z);
    const panel = new THREE.Mesh(billboardGeo, mat);
    panel.position.y = 0.9;
    board.add(panel);
    const postL = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.08, 3.2, 4, 6)),
      mats.metal,
    );
    postL.position.set(-0.85, 0, 0.05);
    board.add(postL);
    const postR = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.08, 3.2, 4, 6)),
      mats.metal,
    );
    postR.position.set(0.85, 0, 0.05);
    board.add(postR);
    // Face inward toward course
    board.rotation.y = x > 0 ? -0.35 : 0.35;
    enableShadows(board);
    group.add(board);
    addBlobShadow(board, 1.1, -2.55);
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

    addPlatform(0, 0, z, 9, 6, 1.0, mats.jellyLime, { chevron: true });

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
    pulseLights.push({ mesh: halo, base: 0.95, speed: 2.4, phase: index });

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

    addPlatform(0, 0.55, z + 1.55, 2.4, 0.9, 0.22, accent, { chevron: true });
    return cp;
  }

  // ——— START PAD ———
  addRoundPad(0, 0, 0, 5.6, 1.25, mats.jellyLime, 28, true, { chevron: true });
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
  pulseLights.push({ mesh: startRing, base: 0.9, speed: 1.6, phase: 0 });

  addPlatform(0, 0, -11, 4.2, 9, 1.0, mats.jellyPink, { chevron: true });
  addStaticBox(0, 0.7, -11, 3.4, 0.1, 0.1, mats.neonHot);

  // ——— SECTION 1: CANDY ROLLERS + SLIM BEAMS ———
  addPlatform(0, 0, -24, 16, 16, 1.05, mats.jellyCyan, { chevron: true });

  // Static contact discs under each candy roller (pad-anchored, not kinematic)
  for (let i = 0; i < 3; i++) {
    const discRoot = new THREE.Group();
    discRoot.position.set(0, 0.56, -18 - i * 4.2);
    group.add(discRoot);
    addBlobShadow(discRoot, 7.2, 0.02);
  }

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
  addPlatform(0, 0, -40, 5.5, 4, 1.0, mats.jellyPink, { chevron: true });

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
      trackGeo(new THREE.CylinderGeometry(r * 0.9, r * 0.88, h * 0.42, 6)),
      mats.underside,
    );
    skirt.position.y = -h * 0.45;
    tile.add(skirt);
    addBlobShadow(tile, r * 1.05, -h * 0.55);
    addChevron(
      tile,
      h * 0.52 + 0.02,
      i % 2 === 0 ? mats.chevronDecal : mats.chevronHot,
      0.85,
    );
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
  addPlatform(0, 0, -96, 11, 20, 1.05, mats.jellyPink, { chevron: true });

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
  addPlatform(0, 0, -118, 5, 4, 1.0, mats.jellyCyan, { chevron: true });

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

  addPlatform(0, 0, -142, 4, 3.5, 1.0, mats.jellyPink, { chevron: true });
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
  addPlatform(0, 0, -162, 4.5, 4, 1.0, mats.jellyCyan, { chevron: true });

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
  addPlatform(0, 0, finishZ, 14, 12, 1.5, mats.finish, { chevron: true });

  addPlatform(0, 1.4, finishZ - 2.5, 6, 4, 1.2, mats.jellyLime, { chevron: true });
  addPlatform(0, 2.3, finishZ - 3.2, 3.5, 2.8, 1.0, mats.jellyCyan, { chevron: true });
  addRoundPad(0, 3.1, finishZ - 3.6, 1.05, 0.7, mats.neonHot, 20, true, {
    chevron: false,
  });

  addStaticCylinder(-5.5, 4.0, finishZ - 4.5, 0.42, 6.5, mats.jellyPink, 14);
  addStaticCylinder(5.5, 4.0, finishZ - 4.5, 0.42, 6.5, mats.jellyCyan, 14);
  addStaticBox(0, 7.4, finishZ - 4.5, 12, 0.7, 0.7, mats.hazard);
  addStaticBox(0, 6.8, finishZ - 4.2, 11, 0.22, 0.22, mats.neonLime);
  addStaticBox(0, 4.2, finishZ - 4.2, 10.5, 0.16, 0.16, mats.neonCyan);

  // Outer arch rings — neon pop without white-wash
  const finishHalo = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(4.5, 0.22, 14, 56)),
    mats.neonHot,
  );
  finishHalo.position.set(0, 4.5, finishZ - 4.5);
  finishHalo.rotation.y = Math.PI / 2;
  finishHalo.castShadow = true;
  finishHalo.receiveShadow = true;
  group.add(finishHalo);
  pulseLights.push({ mesh: finishHalo, base: 1.0, speed: 2.35, phase: 4 });

  const finishHaloOuter = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(5.35, 0.1, 10, 48)),
    mats.neonLime,
  );
  finishHaloOuter.position.set(0, 4.5, finishZ - 4.5);
  finishHaloOuter.rotation.y = Math.PI / 2;
  group.add(finishHaloOuter);
  pulseLights.push({ mesh: finishHaloOuter, base: 0.95, speed: 1.8, phase: 1.2 });

  // Soft glow discs behind arch
  for (let i = 0; i < 3; i++) {
    const glow = new THREE.MeshBasicMaterial({
      color: i === 1 ? Palette.sun : i === 0 ? Palette.hot : Palette.lime,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    extraMats.push(glow);
    const disc = new THREE.Mesh(
      trackGeo(new THREE.CircleGeometry(2.2 + i * 0.7, 32)),
      glow,
    );
    disc.position.set(0, 4.5, finishZ - 4.8 - i * 0.15);
    disc.rotation.y = Math.PI;
    group.add(disc);
    pulseLights.push({
      mesh: disc,
      base: 0.14 + i * 0.03,
      speed: 2.2 + i * 0.4,
      phase: i,
    });
  }

  // Finish podium particle burst zone
  const burstCount = 280;
  const burstGeo = new THREE.BufferGeometry();
  disposables.push(burstGeo);
  const burstPos = new Float32Array(burstCount * 3);
  const burstCol = new Float32Array(burstCount * 3);
  const burstPhase = new Float32Array(burstCount);
  const burstSpeed = new Float32Array(burstCount);
  const burstPalette = [
    new THREE.Color(Palette.lime),
    new THREE.Color(Palette.hot),
    new THREE.Color(Palette.sun),
    new THREE.Color(Palette.teal),
    new THREE.Color(0xffffff),
  ];
  for (let i = 0; i < burstCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 5.5;
    burstPos[i * 3] = Math.cos(a) * r;
    burstPos[i * 3 + 1] = Math.random() * 6;
    burstPos[i * 3 + 2] = finishZ - 2 + Math.sin(a) * r * 0.6;
    const c = burstPalette[i % burstPalette.length]!;
    burstCol[i * 3] = c.r;
    burstCol[i * 3 + 1] = c.g;
    burstCol[i * 3 + 2] = c.b;
    burstPhase[i] = Math.random() * Math.PI * 2;
    burstSpeed[i] = 1.2 + Math.random() * 2.4;
  }
  burstGeo.setAttribute("position", new THREE.BufferAttribute(burstPos, 3));
  burstGeo.setAttribute("color", new THREE.BufferAttribute(burstCol, 3));
  const burstMat = new THREE.PointsMaterial({
    size: 0.45,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.NormalBlending,
    sizeAttenuation: true,
  });
  extraMats.push(burstMat);
  const finishBurst = new THREE.Points(burstGeo, burstMat);
  finishBurst.frustumCulled = false;
  group.add(finishBurst);

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

  // Candy side rails — capsule posts + tubes + end spheres
  for (let z = 0; z > finishZ; z -= 8) {
    const railMat = z % 16 === 0 ? mats.jellyPink : mats.jellyCyan;
    if (z - 8 > finishZ) {
      addCandyRailChunk(-8.4, z - 4, railMat);
      addCandyRailChunk(8.4, z - 4, railMat);
    }
  }

  // ——— SET DRESSING DENSITY (sides of course) ———
  const dressZs = [
    -2, -6, -10, -14, -18, -22, -26, -30, -34, -38, -42, -48, -52, -56, -60, -66,
    -70, -74, -80, -86, -92, -98, -104, -108, -114, -120, -126, -132, -140, -148,
    -154, -160, -166, -172, -178, -186, -192, -198,
  ];
  for (let di = 0; di < dressZs.length; di++) {
    const dz = dressZs[di]!;
    const side = di % 2 === 0 ? -1 : 1;
    const xNear = side * 9.6;
    const xMid = side * 11.4;
    const xFar = side * 13.2;
    const ringMat =
      di % 3 === 0
        ? mats.inflatableHot
        : di % 3 === 1
          ? mats.inflatableCyan
          : mats.inflatableSun;

    addInflatableRing(xNear, 0.85, dz, ringMat, 1.15 + (di % 3) * 0.15);
    addInflatableRing(xMid, 1.1, dz + 1.8, ringMat, 0.85, false);
    addInflatableRing(
      xFar,
      2.6 + (di % 4) * 0.45,
      dz - 1.2,
      ringMat,
      0.8 + (di % 2) * 0.25,
      true,
    );

    addConeStack(side * 9.0, dz + 1.1, 2 + (di % 3));
    if (di % 2 === 0) {
      addBalloonCluster(side * 11.8, dz - 0.6, 3 + (di % 2));
    }
    if (di % 3 === 0) {
      addBillboard(
        side * 14.2,
        dz,
        di % 6 === 0 ? mats.bannerHot : mats.bannerLime,
      );
    }
  }

  // Start-pad hero dressing — must read in first FP frame
  addInflatableRing(-7.2, 1.0, 1.5, mats.inflatableHot, 1.4);
  addInflatableRing(7.2, 1.0, 1.5, mats.inflatableCyan, 1.4);
  addInflatableRing(-6.8, 2.8, -2, mats.inflatableSun, 1.1, true);
  addInflatableRing(6.8, 3.0, -3, mats.inflatableHot, 1.0, true);
  addConeStack(-6.4, 3.2, 4);
  addConeStack(6.4, 3.2, 4);
  addBalloonCluster(-7.5, 0.5, 4);
  addBalloonCluster(7.5, 0.5, 4);
  addBillboard(-12.5, -8, mats.bannerHot);
  addBillboard(12.5, -8, mats.bannerLime);
  addBillboard(-13, -24, mats.bannerLime);
  addBillboard(13, -24, mats.bannerHot);

  // Extra floating rings flanking mid-course for spectacle density
  for (let i = 0; i < 12; i++) {
    const z = -12 - i * 15;
    addInflatableRing(
      -9.8 - (i % 3) * 0.5,
      3.6 + (i % 2) * 0.8,
      z,
      i % 2 === 0 ? mats.inflatableHot : mats.inflatableCyan,
      1.25,
      true,
    );
    addInflatableRing(
      9.8 + (i % 3) * 0.5,
      3.2 + ((i + 1) % 2) * 0.9,
      z - 3,
      i % 2 === 0 ? mats.inflatableSun : mats.inflatableHot,
      1.1,
      true,
    );
  }

  // Ground-level candy arches flanking rollers / hammers
  for (const z of [-20, -26, -90, -100, -128, -168]) {
    for (const side of [-1, 1] as const) {
      const arch = new THREE.Group();
      arch.position.set(side * 10.5, 0, z);
      const postA = new THREE.Mesh(
        trackGeo(new THREE.CapsuleGeometry(0.28, 2.4, 5, 8)),
        side < 0 ? mats.inflatableHot : mats.inflatableCyan,
      );
      postA.position.set(-0.9, 1.4, 0);
      arch.add(postA);
      const postB = new THREE.Mesh(
        trackGeo(new THREE.CapsuleGeometry(0.28, 2.4, 5, 8)),
        side < 0 ? mats.inflatableHot : mats.inflatableCyan,
      );
      postB.position.set(0.9, 1.4, 0);
      arch.add(postB);
      const top = new THREE.Mesh(ringPropGeo, mats.inflatableSun);
      top.scale.set(1.4, 1.4, 1.4);
      top.position.y = 2.85;
      top.rotation.x = Math.PI / 2;
      arch.add(top);
      enableShadows(arch);
      group.add(arch);
      addBlobShadow(arch, 1.4, 0.05);
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
      finishHaloOuter.rotation.z = -t * 0.4;

      for (const p of pulseLights) {
        const mat = p.mesh.material;
        const pulse = p.base * 0.45 + Math.sin(t * p.speed + p.phase) * 0.08;
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissiveIntensity = Math.max(0.12, Math.min(0.4, pulse));
        } else if (mat instanceof THREE.MeshBasicMaterial) {
          mat.opacity = Math.max(0.06, Math.min(0.16, pulse * 0.35));
        }
      }

      for (let i = 0; i < floatingDress.length; i++) {
        const d = floatingDress[i]!;
        d.mesh.position.y = d.baseY + Math.sin(t * d.speed + d.phase) * 0.35;
        d.mesh.rotation.y = t * 0.4 + d.phase * 0.2;
        d.mesh.rotation.z = Math.sin(t * 0.7 + d.phase) * 0.15;
      }

      // Podium spectacle — upward confetti fountain
      const bp = finishBurst.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < burstCount; i++) {
        const ph = burstPhase[i]!;
        const spd = burstSpeed[i]!;
        let y = bp.getY(i) + 0.035 * spd;
        let x = bp.getX(i) + Math.sin(t * 2.2 + ph) * 0.02;
        let z = bp.getZ(i) + Math.cos(t * 1.8 + ph) * 0.015;
        if (y > 9.5) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 5.5;
          x = Math.cos(a) * r;
          y = 0.9 + Math.random() * 1.2;
          z = finishZ - 2 + Math.sin(a) * r * 0.6;
        }
        bp.setXYZ(i, x, y, z);
      }
      bp.needsUpdate = true;
      burstMat.size = 0.55 + Math.sin(t * 3.5) * 0.22;
      burstMat.opacity = 0.75 + Math.sin(t * 2.1) * 0.2;

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
