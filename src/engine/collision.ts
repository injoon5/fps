import { Vector3 } from "three";
import type { AABB } from "../types";

/** Reused scratch — do not retain across frames from outside. */
const _expanded: AABB = {
  minX: 0,
  maxX: 0,
  minY: 0,
  maxY: 0,
  minZ: 0,
  maxZ: 0,
};

export function pointInAABB(
  x: number,
  y: number,
  z: number,
  box: AABB,
): boolean {
  return (
    x >= box.minX &&
    x <= box.maxX &&
    y >= box.minY &&
    y <= box.maxY &&
    z >= box.minZ &&
    z <= box.maxZ
  );
}

/** Axis-aligned overlap test (inclusive). */
export function aabbOverlaps(a: AABB, b: AABB): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
  );
}

/**
 * Vertical capsule (XZ circle + Y extent) vs AABB.
 * Capsule stands on `feetY` with total height `height` and radius `radius`.
 */
export function capsuleIntersectsAABB(
  x: number,
  feetY: number,
  z: number,
  radius: number,
  height: number,
  box: AABB,
): boolean {
  const closestX = clamp(x, box.minX, box.maxX);
  const closestZ = clamp(z, box.minZ, box.maxZ);
  const dx = x - closestX;
  const dz = z - closestZ;
  if (dx * dx + dz * dz > radius * radius) return false;

  const capMinY = feetY;
  const capMaxY = feetY + height;
  return capMinY <= box.maxY && capMaxY >= box.minY;
}

export interface CollisionResult {
  grounded: boolean;
}

/**
 * Push a player capsule out of solid AABBs and kill velocity into penetrations.
 * Mutates `position` and `velocity`. Uses iterative axis separation + wall slide.
 * Position is at feet; capsule extends `height` upward with `radius` in XZ.
 */
export function resolvePlayerCollisions(
  position: Vector3,
  radius: number,
  height: number,
  colliders: AABB[],
  velocity: Vector3,
): CollisionResult {
  let grounded = false;

  if (colliders.length === 0) {
    return { grounded };
  }

  // Broad-phase pad for early reject (radius + small slack)
  const pad = radius + 0.05;

  // Multiple passes catch corner cases without tunneling at moderate speeds
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box === undefined) continue;

      // Early reject
      if (
        position.x + pad < box.minX ||
        position.x - pad > box.maxX ||
        position.y + height < box.minY ||
        position.y > box.maxY ||
        position.z + pad < box.minZ ||
        position.z - pad > box.maxZ
      ) {
        continue;
      }

      if (!capsuleOverlapsExpanded(position, radius, height, box)) {
        continue;
      }

      const resolved = separateCapsuleFromAABB(
        position,
        radius,
        height,
        box,
        velocity,
      );
      if (resolved.grounded) grounded = true;
    }
  }

  // Snap grounding probe — short downward feeler
  if (!grounded && velocity.y <= 0) {
    grounded = probeGround(position, radius, height, colliders, 0.08);
  }

  if (grounded && velocity.y < 0) {
    velocity.y = 0;
  }

  return { grounded };
}

/**
 * Sweep-integrated move: advance by velocity*dt with substeps to reduce tunneling.
 * Mutates position/velocity; returns grounding.
 */
export function moveAndCollide(
  position: Vector3,
  velocity: Vector3,
  dt: number,
  radius: number,
  height: number,
  colliders: AABB[],
  maxStepSpeed = 0.35,
): CollisionResult {
  const speed =
    Math.abs(velocity.x) + Math.abs(velocity.y) + Math.abs(velocity.z);
  const stepDist = speed * dt;
  const steps = Math.max(1, Math.ceil(stepDist / maxStepSpeed));
  const subDt = dt / steps;

  let grounded = false;
  for (let s = 0; s < steps; s++) {
    position.x += velocity.x * subDt;
    position.y += velocity.y * subDt;
    position.z += velocity.z * subDt;
    const result = resolvePlayerCollisions(
      position,
      radius,
      height,
      colliders,
      velocity,
    );
    grounded = result.grounded;
  }

  return { grounded };
}

function capsuleOverlapsExpanded(
  position: Vector3,
  radius: number,
  height: number,
  box: AABB,
): boolean {
  expandAABB(_expanded, box, radius, 0);
  // Y uses full capsule slab; XZ already expanded so point-in-box on center works
  return (
    position.x >= _expanded.minX &&
    position.x <= _expanded.maxX &&
    position.y + height >= box.minY &&
    position.y <= box.maxY &&
    position.z >= _expanded.minZ &&
    position.z <= _expanded.maxZ
  );
}

function expandAABB(
  out: AABB,
  box: AABB,
  xzPad: number,
  yPad: number,
): void {
  out.minX = box.minX - xzPad;
  out.maxX = box.maxX + xzPad;
  out.minY = box.minY - yPad;
  out.maxY = box.maxY + yPad;
  out.minZ = box.minZ - xzPad;
  out.maxZ = box.maxZ + xzPad;
}

interface SeparateResult {
  grounded: boolean;
}

function separateCapsuleFromAABB(
  position: Vector3,
  radius: number,
  height: number,
  box: AABB,
  velocity: Vector3,
): SeparateResult {
  // Minkowski: treat player as point vs AABB expanded by radius in XZ
  expandAABB(_expanded, box, radius, 0);

  const pMinY = position.y;
  const pMaxY = position.y + height;

  // Y overlap against unexpanded box (feet-to-head)
  const yOverlap = Math.min(pMaxY, box.maxY) - Math.max(pMinY, box.minY);
  if (yOverlap <= 0) return { grounded: false };

  // Point-in-expanded-XZ?
  const insideX =
    position.x >= _expanded.minX && position.x <= _expanded.maxX;
  const insideZ =
    position.z >= _expanded.minZ && position.z <= _expanded.maxZ;
  if (!insideX || !insideZ) return { grounded: false };

  // Penetration depths to each face of expanded XZ box + Y faces of solid
  const penPosX = _expanded.maxX - position.x;
  const penNegX = position.x - _expanded.minX;
  const penPosZ = _expanded.maxZ - position.z;
  const penNegZ = position.z - _expanded.minZ;
  const penPosY = box.maxY - position.y; // push up (stand on top)
  const penNegY = pMaxY - box.minY; // push down (hit ceiling)

  // Pick minimum penetration axis (stable slide)
  let minPen = penPosX;
  let axis: 0 | 1 | 2 = 0; // 0=x, 1=y, 2=z
  let sign = 1;

  if (penNegX < minPen) {
    minPen = penNegX;
    axis = 0;
    sign = -1;
  }
  if (penPosZ < minPen) {
    minPen = penPosZ;
    axis = 2;
    sign = 1;
  }
  if (penNegZ < minPen) {
    minPen = penNegZ;
    axis = 2;
    sign = -1;
  }
  // Prefer ground/ceiling only when clearly smaller — bias slightly toward Y for floors
  const yBias = 0.002;
  if (penPosY + yBias < minPen) {
    minPen = penPosY;
    axis = 1;
    sign = 1;
  }
  if (penNegY < minPen) {
    minPen = penNegY;
    axis = 1;
    sign = -1;
  }

  if (minPen <= 0 || minPen > radius * 2 + height) {
    return { grounded: false };
  }

  let grounded = false;

  switch (axis) {
    case 0:
      position.x += sign * minPen;
      if (sign > 0 && velocity.x < 0) velocity.x = 0;
      if (sign < 0 && velocity.x > 0) velocity.x = 0;
      break;
    case 1:
      position.y += sign * minPen;
      if (sign > 0) {
        grounded = true;
        if (velocity.y < 0) velocity.y = 0;
      } else if (velocity.y > 0) {
        velocity.y = 0;
      }
      break;
    case 2:
      position.z += sign * minPen;
      if (sign > 0 && velocity.z < 0) velocity.z = 0;
      if (sign < 0 && velocity.z > 0) velocity.z = 0;
      break;
    default: {
      const _exhaustive: never = axis;
      void _exhaustive;
      break;
    }
  }

  return { grounded };
}

function probeGround(
  position: Vector3,
  radius: number,
  height: number,
  colliders: AABB[],
  skin: number,
): boolean {
  const probeY = position.y - skin;
  for (let i = 0; i < colliders.length; i++) {
    const box = colliders[i];
    if (box === undefined) continue;
    if (!capsuleIntersectsAABB(position.x, probeY, position.z, radius, height, box)) {
      continue;
    }
    // Standing on top face?
    if (
      position.y >= box.maxY - skin - 0.02 &&
      position.y <= box.maxY + skin &&
      position.x >= box.minX - radius &&
      position.x <= box.maxX + radius &&
      position.z >= box.minZ - radius &&
      position.z <= box.maxZ + radius
    ) {
      position.y = box.maxY;
      return true;
    }
  }
  return false;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
