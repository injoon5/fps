import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from "three";
import type { AABB, EnemyState } from "../types";

const _invDir = new Vector3();
const _toCenter = new Vector3();
const _tmp = new Vector3();

export interface RayHit {
  point: Vector3;
  normal: Vector3;
  distance: number;
  enemy: EnemyState | null;
}

const ENEMY_HIT_RADIUS = 0.55;
const ENEMY_HIT_HEIGHT = 2.4;

/**
 * Ray vs AABB (slab method). Returns distance along ray or null.
 */
export function intersectRayAABB(
  origin: Vector3,
  dir: Vector3,
  box: AABB,
): { t: number; normal: Vector3 } | null {
  _invDir.set(
    dir.x !== 0 ? 1 / dir.x : dir.x >= 0 ? Infinity : -Infinity,
    dir.y !== 0 ? 1 / dir.y : dir.y >= 0 ? Infinity : -Infinity,
    dir.z !== 0 ? 1 / dir.z : dir.z >= 0 ? Infinity : -Infinity,
  );

  let tmin: number;
  let tmax: number;
  let tymin: number;
  let tymax: number;
  let tzmin: number;
  let tzmax: number;

  if (_invDir.x >= 0) {
    tmin = (box.minX - origin.x) * _invDir.x;
    tmax = (box.maxX - origin.x) * _invDir.x;
  } else {
    tmin = (box.maxX - origin.x) * _invDir.x;
    tmax = (box.minX - origin.x) * _invDir.x;
  }

  if (_invDir.y >= 0) {
    tymin = (box.minY - origin.y) * _invDir.y;
    tymax = (box.maxY - origin.y) * _invDir.y;
  } else {
    tymin = (box.maxY - origin.y) * _invDir.y;
    tymax = (box.minY - origin.y) * _invDir.y;
  }

  if (tmin > tymax || tymin > tmax) return null;
  if (tymin > tmin) tmin = tymin;
  if (tymax < tmax) tmax = tymax;

  if (_invDir.z >= 0) {
    tzmin = (box.minZ - origin.z) * _invDir.z;
    tzmax = (box.maxZ - origin.z) * _invDir.z;
  } else {
    tzmin = (box.maxZ - origin.z) * _invDir.z;
    tzmax = (box.minZ - origin.z) * _invDir.z;
  }

  if (tmin > tzmax || tzmin > tmax) return null;
  if (tzmin > tmin) tmin = tzmin;
  if (tzmax < tmax) tmax = tzmax;

  if (tmax < 0) return null;
  const t = tmin >= 0 ? tmin : tmax;
  if (t < 0) return null;

  const point = _tmp.copy(origin).addScaledVector(dir, t);
  const normal = new Vector3();
  const eps = 1e-3;
  if (Math.abs(point.x - box.minX) < eps) normal.set(-1, 0, 0);
  else if (Math.abs(point.x - box.maxX) < eps) normal.set(1, 0, 0);
  else if (Math.abs(point.y - box.minY) < eps) normal.set(0, -1, 0);
  else if (Math.abs(point.y - box.maxY) < eps) normal.set(0, 1, 0);
  else if (Math.abs(point.z - box.minZ) < eps) normal.set(0, 0, -1);
  else if (Math.abs(point.z - box.maxZ) < eps) normal.set(0, 0, 1);
  else normal.set(-dir.x, -dir.y, -dir.z).normalize();

  return { t, normal };
}

export function raycastColliders(
  origin: Vector3,
  dir: Vector3,
  colliders: AABB[],
  maxDist: number,
): RayHit | null {
  let bestT = maxDist;
  let bestNormal: Vector3 | null = null;
  let bestPoint: Vector3 | null = null;

  for (const box of colliders) {
    const hit = intersectRayAABB(origin, dir, box);
    if (!hit) continue;
    if (hit.t > 0 && hit.t < bestT) {
      bestT = hit.t;
      bestNormal = hit.normal;
      bestPoint = origin.clone().addScaledVector(dir, hit.t);
    }
  }

  if (!bestPoint || !bestNormal) return null;
  return {
    point: bestPoint,
    normal: bestNormal,
    distance: bestT,
    enemy: null,
  };
}

/** Capsule-ish hit: vertical cylinder around enemy torso. */
export function raycastEnemies(
  origin: Vector3,
  dir: Vector3,
  enemies: EnemyState[],
  maxDist: number,
): RayHit | null {
  let bestT = maxDist;
  let bestEnemy: EnemyState | null = null;
  let bestPoint: Vector3 | null = null;

  for (const enemy of enemies) {
    if (!enemy.alive || enemy.state === "dead") continue;

    const px = enemy.position.x;
    const pz = enemy.position.z;
    const y0 = enemy.position.y;
    const y1 = enemy.position.y + ENEMY_HIT_HEIGHT;

    // Ray-cylinder (infinite) then clamp Y
    const ox = origin.x - px;
    const oz = origin.z - pz;
    const a = dir.x * dir.x + dir.z * dir.z;
    const b = 2 * (ox * dir.x + oz * dir.z);
    const c = ox * ox + oz * oz - ENEMY_HIT_RADIUS * ENEMY_HIT_RADIUS;

    let tHit: number | null = null;
    if (a < 1e-8) {
      // Ray nearly vertical — check if inside radius
      if (c <= 0) {
        const ty0 = (y0 - origin.y) / (dir.y || 1e-8);
        const ty1 = (y1 - origin.y) / (dir.y || 1e-8);
        const tEnter = Math.min(ty0, ty1);
        const tExit = Math.max(ty0, ty1);
        if (tExit >= 0 && tEnter < bestT) {
          tHit = Math.max(0, tEnter);
        }
      }
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        const t0 = (-b - s) / (2 * a);
        const t1 = (-b + s) / (2 * a);
        for (const t of [t0, t1]) {
          if (t < 0 || t >= bestT) continue;
          const y = origin.y + dir.y * t;
          if (y >= y0 && y <= y1) {
            tHit = t;
            break;
          }
        }
      }
    }

    // Also test expanded AABB as fallback for glancing angles
    if (tHit === null) {
      const box: AABB = {
        minX: px - ENEMY_HIT_RADIUS,
        maxX: px + ENEMY_HIT_RADIUS,
        minY: y0,
        maxY: y1,
        minZ: pz - ENEMY_HIT_RADIUS,
        maxZ: pz + ENEMY_HIT_RADIUS,
      };
      const aabbHit = intersectRayAABB(origin, dir, box);
      if (aabbHit && aabbHit.t > 0 && aabbHit.t < bestT) {
        tHit = aabbHit.t;
      }
    }

    if (tHit !== null && tHit < bestT) {
      bestT = tHit;
      bestEnemy = enemy;
      bestPoint = origin.clone().addScaledVector(dir, tHit);
    }
  }

  if (!bestEnemy || !bestPoint) return null;

  _toCenter.set(
    bestPoint.x - bestEnemy.position.x,
    0,
    bestPoint.z - bestEnemy.position.z,
  );
  if (_toCenter.lengthSq() < 1e-6) {
    _toCenter.set(-dir.x, 0, -dir.z);
  }
  _toCenter.normalize();

  return {
    point: bestPoint,
    normal: _toCenter.clone(),
    distance: bestT,
    enemy: bestEnemy,
  };
}

// ---------------------------------------------------------------------------
// Hitscan FX — impact decals, ichor particles, tracer lines
// ---------------------------------------------------------------------------

const IMPACT_POOL = 24;
const IMPACT_LIFE = 4.5;
const TRACER_POOL = 16;
const TRACER_LIFE = 0.08;
const BLOOD_POOL = 20;
const BLOOD_PARTICLES = 14;
const BLOOD_LIFE = 0.55;

interface ImpactSlot {
  mesh: Mesh;
  life: number;
  active: boolean;
}

interface TracerSlot {
  mesh: Mesh;
  life: number;
  active: boolean;
}

interface BloodSlot {
  points: Points;
  velocities: Float32Array;
  life: number;
  active: boolean;
}

export interface HitscanFx {
  readonly root: Group;
  spawnImpact: (point: Vector3, normal: Vector3) => void;
  spawnBlood: (point: Vector3, direction: Vector3) => void;
  spawnTracer: (from: Vector3, to: Vector3) => void;
  update: (dt: number) => void;
  clear: () => void;
  dispose: () => void;
}

export function createHitscanFx(scene: Scene): HitscanFx {
  const root = new Group();
  root.name = "hitscan-fx";
  scene.add(root);

  const impactMat = new MeshBasicMaterial({
    color: 0x1a1008,
    transparent: true,
    opacity: 0.85,
    side: DoubleSide,
    depthWrite: false,
  });
  const impactBurnMat = new MeshBasicMaterial({
    color: 0xff6600,
    transparent: true,
    opacity: 0.55,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const impacts: ImpactSlot[] = [];
  for (let i = 0; i < IMPACT_POOL; i++) {
    const geo = new BufferGeometry();
    const s = 0.12 + (i % 3) * 0.03;
    const positions = new Float32Array([
      -s,
      -s,
      0,
      s,
      -s,
      0,
      s,
      s,
      0,
      -s,
      -s,
      0,
      s,
      s,
      0,
      -s,
      s,
      0,
    ]);
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    const mesh = new Mesh(geo, i % 2 === 0 ? impactMat.clone() : impactBurnMat.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    root.add(mesh);
    impacts.push({ mesh, life: 0, active: false });
  }

  const tracerMat = new MeshBasicMaterial({
    color: 0xffaa55,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const tracers: TracerSlot[] = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new BufferGeometry();
    geo.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(6), 3),
    );
    const mesh = new Mesh(geo, tracerMat.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    root.add(mesh);
    tracers.push({ mesh, life: 0, active: false });
  }

  const bloodMat = new PointsMaterial({
    color: new Color(0x4a0008),
    size: 0.07,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const ichorMat = new PointsMaterial({
    color: new Color(0x221800),
    size: 0.05,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    sizeAttenuation: true,
    blending: AdditiveBlending,
  });

  const bloods: BloodSlot[] = [];
  for (let i = 0; i < BLOOD_POOL; i++) {
    const positions = new Float32Array(BLOOD_PARTICLES * 3);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    const points = new Points(geo, i % 3 === 0 ? ichorMat.clone() : bloodMat.clone());
    points.visible = false;
    points.frustumCulled = false;
    root.add(points);
    bloods.push({
      points,
      velocities: new Float32Array(BLOOD_PARTICLES * 3),
      life: 0,
      active: false,
    });
  }

  let impactCursor = 0;
  let tracerCursor = 0;
  let bloodCursor = 0;

  function spawnImpact(point: Vector3, normal: Vector3): void {
    const slot = impacts[impactCursor % IMPACT_POOL];
    impactCursor += 1;
    if (!slot) return;

    slot.active = true;
    slot.life = IMPACT_LIFE;
    slot.mesh.visible = true;
    slot.mesh.position.copy(point).addScaledVector(normal, 0.02);
    slot.mesh.lookAt(
      point.x + normal.x,
      point.y + normal.y,
      point.z + normal.z,
    );
    const mat = slot.mesh.material as MeshBasicMaterial;
    mat.opacity = mat.blending === AdditiveBlending ? 0.65 : 0.9;
  }

  function spawnTracer(from: Vector3, to: Vector3): void {
    const slot = tracers[tracerCursor % TRACER_POOL];
    tracerCursor += 1;
    if (!slot) return;

    slot.active = true;
    slot.life = TRACER_LIFE;
    slot.mesh.visible = true;
    const pos = slot.mesh.geometry.getAttribute("position") as BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    const mat = slot.mesh.material as MeshBasicMaterial;
    mat.opacity = 0.95;
  }

  function spawnBlood(point: Vector3, direction: Vector3): void {
    const slot = bloods[bloodCursor % BLOOD_POOL];
    bloodCursor += 1;
    if (!slot) return;

    slot.active = true;
    slot.life = BLOOD_LIFE;
    slot.points.visible = true;
    const pos = slot.points.geometry.getAttribute("position") as BufferAttribute;
    const vel = slot.velocities;

    for (let i = 0; i < BLOOD_PARTICLES; i++) {
      pos.setXYZ(
        i,
        point.x + (Math.random() - 0.5) * 0.08,
        point.y + (Math.random() - 0.5) * 0.08,
        point.z + (Math.random() - 0.5) * 0.08,
      );
      const spread = 1.8 + Math.random() * 2.2;
      vel[i * 3] = -direction.x * spread + (Math.random() - 0.5) * 1.5;
      vel[i * 3 + 1] = Math.random() * 2.2 + 0.4;
      vel[i * 3 + 2] = -direction.z * spread + (Math.random() - 0.5) * 1.5;
    }
    pos.needsUpdate = true;
    const mat = slot.points.material as PointsMaterial;
    mat.opacity = 0.95;
  }

  function update(dt: number): void {
    for (const slot of impacts) {
      if (!slot.active) continue;
      slot.life -= dt;
      const mat = slot.mesh.material as MeshBasicMaterial;
      const fade = Math.max(0, slot.life / IMPACT_LIFE);
      mat.opacity = fade * (mat.blending === AdditiveBlending ? 0.65 : 0.9);
      if (slot.life <= 0) {
        slot.active = false;
        slot.mesh.visible = false;
      }
    }

    for (const slot of tracers) {
      if (!slot.active) continue;
      slot.life -= dt;
      const mat = slot.mesh.material as MeshBasicMaterial;
      mat.opacity = Math.max(0, slot.life / TRACER_LIFE) * 0.95;
      if (slot.life <= 0) {
        slot.active = false;
        slot.mesh.visible = false;
      }
    }

    for (const slot of bloods) {
      if (!slot.active) continue;
      slot.life -= dt;
      const pos = slot.points.geometry.getAttribute("position") as BufferAttribute;
      const vel = slot.velocities;
      for (let i = 0; i < BLOOD_PARTICLES; i++) {
        const ix = i * 3;
        const vx = vel[ix] ?? 0;
        let vy = vel[ix + 1] ?? 0;
        const vz = vel[ix + 2] ?? 0;
        vy -= 9 * dt;
        vel[ix + 1] = vy;
        const x = (pos.getX(i) as number) + vx * dt;
        const y = (pos.getY(i) as number) + vy * dt;
        const z = (pos.getZ(i) as number) + vz * dt;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
      const mat = slot.points.material as PointsMaterial;
      mat.opacity = Math.max(0, slot.life / BLOOD_LIFE) * 0.95;
      if (slot.life <= 0) {
        slot.active = false;
        slot.points.visible = false;
      }
    }
  }

  function clear(): void {
    for (const slot of impacts) {
      slot.active = false;
      slot.mesh.visible = false;
    }
    for (const slot of tracers) {
      slot.active = false;
      slot.mesh.visible = false;
    }
    for (const slot of bloods) {
      slot.active = false;
      slot.points.visible = false;
    }
  }

  function dispose(): void {
    clear();
    root.removeFromParent();
    for (const slot of impacts) {
      slot.mesh.geometry.dispose();
      (slot.mesh.material as MeshBasicMaterial).dispose();
    }
    for (const slot of tracers) {
      slot.mesh.geometry.dispose();
      (slot.mesh.material as MeshBasicMaterial).dispose();
    }
    for (const slot of bloods) {
      slot.points.geometry.dispose();
      (slot.points.material as PointsMaterial).dispose();
    }
  }

  return {
    root,
    spawnImpact,
    spawnBlood,
    spawnTracer,
    update,
    clear,
    dispose,
  };
}
