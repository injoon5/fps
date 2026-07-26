import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Vector3,
} from "three";
import type { AABB, EnemyState, PlayerState } from "../types";

const MAX_ACTIVE = 16;
const CHASE_RANGE = 22;
const ATTACK_RANGE = 1.65;
const LOSE_RANGE = 30;
const WANDER_SPEED = 1.1;
const CHASE_SPEED = 3.4;
const ATTACK_DAMAGE = 12;
const ATTACK_COOLDOWN = 0.85;
const ENEMY_RADIUS = 0.4;
const ENEMY_HEIGHT = 2.35;
const DEATH_DURATION = 0.85;
const WANDER_RADIUS = 4.5;

const _wish = new Vector3();
const _next = new Vector3();
const _toPlayer = new Vector3();
const _rayOrigin = new Vector3();
const _rayDir = new Vector3();

export type EnemyAttackCallback = (
  damage: number,
  enemy: EnemyState,
) => void;

export interface EnemySystem {
  readonly enemies: EnemyState[];
  spawnFrom: (spawns: Vector3[], scene: Scene) => void;
  update: (
    dt: number,
    time: number,
    player: PlayerState,
    colliders: AABB[],
    onAttack: EnemyAttackCallback,
  ) => void;
  clear: (scene: Scene) => void;
  aliveCount: () => number;
}

let nextId = 1;

// ---------------------------------------------------------------------------
// Minimal AABB slide (duplicated — engine/collision may arrive later)
// ---------------------------------------------------------------------------

function enemyAABB(x: number, y: number, z: number): AABB {
  return {
    minX: x - ENEMY_RADIUS,
    maxX: x + ENEMY_RADIUS,
    minY: y,
    maxY: y + ENEMY_HEIGHT,
    minZ: z - ENEMY_RADIUS,
    maxZ: z + ENEMY_RADIUS,
  };
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

function collidesAt(
  x: number,
  y: number,
  z: number,
  colliders: AABB[],
): boolean {
  const self = enemyAABB(x, y, z);
  for (const c of colliders) {
    if (aabbOverlap(self, c)) return true;
  }
  return false;
}

/** Axis-separated wall slide for XZ movement. */
function slideMove(
  pos: Vector3,
  dx: number,
  dz: number,
  colliders: AABB[],
): void {
  const y = pos.y;
  if (!collidesAt(pos.x + dx, y, pos.z, colliders)) {
    pos.x += dx;
  }
  if (!collidesAt(pos.x, y, pos.z + dz, colliders)) {
    pos.z += dz;
  }
}

/** Cheap LOS: sample along segment against colliders (XZ+Y torso). */
function hasLineOfSight(
  from: Vector3,
  to: Vector3,
  colliders: AABB[],
): boolean {
  _rayOrigin.set(from.x, from.y + 1.4, from.z);
  _rayDir.set(to.x - from.x, to.y + 1.2 - (from.y + 1.4), to.z - from.z);
  const dist = _rayDir.length();
  if (dist < 0.01) return true;
  _rayDir.multiplyScalar(1 / dist);

  const steps = Math.min(24, Math.ceil(dist / 0.45));
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * dist;
    const x = _rayOrigin.x + _rayDir.x * t;
    const y = _rayOrigin.y + _rayDir.y * t;
    const z = _rayOrigin.z + _rayDir.z * t;
    for (const c of colliders) {
      if (
        x >= c.minX &&
        x <= c.maxX &&
        y >= c.minY &&
        y <= c.maxY &&
        z >= c.minZ &&
        z <= c.maxZ
      ) {
        return false;
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Visual — tall thin distorted humanoid (Kane Pixel / bacteria silhouette)
// ---------------------------------------------------------------------------

function createEnemyMesh(seed: number): Group {
  const root = new Group();
  root.name = "threshold-entity";

  const flesh = new MeshStandardMaterial({
    color: new Color(0x060606),
    roughness: 0.92,
    metalness: 0.05,
    emissive: new Color(0x0a0600),
    emissiveIntensity: 0.15,
  });
  const bone = new MeshStandardMaterial({
    color: new Color(0x101010),
    roughness: 0.8,
    metalness: 0.1,
    emissive: new Color(0x1a0c00),
    emissiveIntensity: 0.2,
  });
  const eyeMat = new MeshStandardMaterial({
    color: new Color(0x000000),
    emissive: new Color(0xff7700),
    emissiveIntensity: 2.8,
    roughness: 0.4,
    metalness: 0.2,
  });

  const lean = ((seed % 7) - 3) * 0.04;
  const stretch = 1.05 + (seed % 5) * 0.06;

  // Torso — elongated, slightly twisted
  const torso = new Mesh(new BoxGeometry(0.38, 0.9 * stretch, 0.22), flesh);
  torso.position.set(lean, 1.15, 0);
  torso.rotation.z = lean * 1.5;
  torso.rotation.x = 0.08;
  torso.name = "torso";
  root.add(torso);

  // Extra rib slab (wrong anatomy)
  const ribs = new Mesh(new BoxGeometry(0.42, 0.2, 0.28), bone);
  ribs.position.set(-lean * 0.5, 1.35, 0.02);
  ribs.rotation.z = -lean;
  root.add(ribs);

  // Head — too small / off-center
  const head = new Mesh(new BoxGeometry(0.22, 0.32, 0.2), flesh);
  head.position.set(lean * 2, 1.75 * stretch, 0.02);
  head.rotation.z = lean * 2;
  head.scale.set(0.9, 1.15, 0.75);
  head.name = "head";
  root.add(head);

  // Eyes — uneven amber voids
  const eyeL = new Mesh(new BoxGeometry(0.045, 0.02, 0.02), eyeMat);
  eyeL.position.set(-0.05 + lean, 1.78 * stretch, 0.11);
  eyeL.name = "eye-l";
  root.add(eyeL);
  const eyeR = new Mesh(new BoxGeometry(0.06, 0.015, 0.02), eyeMat.clone());
  eyeR.position.set(0.07 + lean, 1.76 * stretch, 0.1);
  eyeR.scale.set(1, 1.4, 1);
  eyeR.name = "eye-r";
  root.add(eyeR);

  // Neck stalk
  const neck = new Mesh(new CapsuleGeometry(0.04, 0.18, 2, 4), bone);
  neck.position.set(lean * 1.2, 1.55, 0);
  root.add(neck);

  // Arms — too long, asymmetric
  const armL = new Mesh(new BoxGeometry(0.08, 1.1, 0.08), flesh);
  armL.position.set(-0.32, 1.0, 0.05);
  armL.rotation.z = 0.25 + lean;
  armL.rotation.x = 0.15;
  armL.name = "arm-l";
  root.add(armL);

  const armR = new Mesh(new BoxGeometry(0.07, 1.35, 0.07), flesh);
  armR.position.set(0.3, 0.85, -0.02);
  armR.rotation.z = -0.4 - lean;
  armR.rotation.x = -0.2;
  armR.name = "arm-r";
  root.add(armR);

  // Legs — spindly, wrong proportions
  const legL = new Mesh(new BoxGeometry(0.1, 1.05, 0.1), bone);
  legL.position.set(-0.12, 0.5, 0.02);
  legL.rotation.z = 0.08;
  legL.name = "leg-l";
  root.add(legL);

  const legR = new Mesh(new BoxGeometry(0.09, 0.95, 0.09), bone);
  legR.position.set(0.14, 0.48, -0.03);
  legR.rotation.z = -0.12;
  legR.rotation.x = 0.05;
  legR.name = "leg-r";
  root.add(legR);

  // Lower trailing filament (bacteria feel)
  const trail = new Mesh(new CapsuleGeometry(0.03, 0.5, 2, 4), flesh);
  trail.position.set(lean * 3, 0.35, -0.15);
  trail.rotation.x = 0.9;
  trail.name = "trail";
  root.add(trail);

  root.scale.set(1, stretch, 1);
  return root;
}

function createEnemy(spawn: Vector3, scene: Scene): EnemyState {
  const id = nextId++;
  const maxHealth = 80 + Math.floor(Math.random() * 41); // 80–120
  const mesh = createEnemyMesh(id * 17 + Math.floor(spawn.x * 3));
  mesh.position.copy(spawn);
  scene.add(mesh);

  return {
    id,
    position: spawn.clone(),
    velocity: new Vector3(),
    health: maxHealth,
    maxHealth,
    alive: true,
    state: "idle",
    attackCooldown: 0,
    mesh,
  };
}

interface EnemyExtras {
  home: Vector3;
  wanderTarget: Vector3;
  wanderTimer: number;
  deathTimer: number;
  twitchPhase: number;
  removed: boolean;
}

const extras = new WeakMap<EnemyState, EnemyExtras>();

function getExtras(enemy: EnemyState): EnemyExtras {
  let e = extras.get(enemy);
  if (!e) {
    e = {
      home: enemy.position.clone(),
      wanderTarget: enemy.position.clone(),
      wanderTimer: 0,
      deathTimer: 0,
      twitchPhase: Math.random() * Math.PI * 2,
      removed: false,
    };
    extras.set(enemy, e);
  }
  return e;
}

function pickWanderTarget(enemy: EnemyState, ex: EnemyExtras): void {
  const a = Math.random() * Math.PI * 2;
  const r = 1.2 + Math.random() * WANDER_RADIUS;
  ex.wanderTarget.set(
    ex.home.x + Math.cos(a) * r,
    enemy.position.y,
    ex.home.z + Math.sin(a) * r,
  );
  ex.wanderTimer = 2 + Math.random() * 3.5;
}

function faceDirection(mesh: Group, dx: number, dz: number, dt: number): void {
  if (dx * dx + dz * dz < 1e-6) return;
  const targetYaw = Math.atan2(dx, dz);
  let yaw = mesh.rotation.y;
  let diff = targetYaw - yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  mesh.rotation.y = yaw + diff * Math.min(1, dt * 6);
}

function animateIdleTwitch(
  enemy: EnemyState,
  ex: EnemyExtras,
  time: number,
  intensity: number,
): void {
  ex.twitchPhase += 0.02;
  const t = time * 3.1 + ex.twitchPhase;
  const j = intensity;

  const head = enemy.mesh.getObjectByName("head");
  const armL = enemy.mesh.getObjectByName("arm-l");
  const armR = enemy.mesh.getObjectByName("arm-r");
  const torso = enemy.mesh.getObjectByName("torso");
  const trail = enemy.mesh.getObjectByName("trail");
  const eyeL = enemy.mesh.getObjectByName("eye-l");
  const eyeR = enemy.mesh.getObjectByName("eye-r");

  if (head) {
    head.rotation.y = Math.sin(t * 1.7) * 0.15 * j;
    head.rotation.z = Math.sin(t * 2.3) * 0.08 * j;
    head.position.y =
      head.userData["baseY"] !== undefined
        ? (head.userData["baseY"] as number)
        : head.position.y;
    if (head.userData["baseY"] === undefined) {
      head.userData["baseY"] = head.position.y;
    }
    head.position.y =
      (head.userData["baseY"] as number) + Math.sin(t * 5.5) * 0.02 * j;
  }
  if (armL) {
    armL.rotation.x = 0.15 + Math.sin(t * 2.1) * 0.25 * j;
    armL.rotation.z = 0.25 + Math.sin(t * 1.4) * 0.12 * j;
  }
  if (armR) {
    armR.rotation.x = -0.2 + Math.sin(t * 2.6 + 1) * 0.35 * j;
    armR.rotation.z = -0.4 + Math.cos(t * 1.9) * 0.18 * j;
  }
  if (torso) {
    torso.rotation.y = Math.sin(t * 0.9) * 0.06 * j;
  }
  if (trail) {
    trail.rotation.x = 0.9 + Math.sin(t * 4.2) * 0.2 * j;
  }
  // Eye flicker
  if (eyeL && eyeL instanceof Mesh) {
    const mat = eyeL.material as MeshStandardMaterial;
    mat.emissiveIntensity = 2.2 + Math.sin(t * 11) * 0.9 + Math.random() * 0.3 * j;
  }
  if (eyeR && eyeR instanceof Mesh) {
    const mat = eyeR.material as MeshStandardMaterial;
    mat.emissiveIntensity = 1.8 + Math.sin(t * 13 + 2) * 1.1;
  }

  // Occasional hard twitch
  if (Math.random() < 0.008 * j) {
    enemy.mesh.position.x += (Math.random() - 0.5) * 0.08;
    enemy.mesh.position.z += (Math.random() - 0.5) * 0.08;
    enemy.mesh.rotation.z = (Math.random() - 0.5) * 0.12;
  } else {
    enemy.mesh.rotation.z *= 0.85;
  }
}

function updateDeath(enemy: EnemyState, ex: EnemyExtras, dt: number, scene: Scene): void {
  ex.deathTimer += dt;
  const t = Math.min(1, ex.deathTimer / DEATH_DURATION);
  const scale = 1 - t * t;
  enemy.mesh.scale.set(scale * (1 + t * 0.3), scale * (1 - t * 0.5), scale);
  enemy.mesh.rotation.y += dt * 2.5;
  enemy.mesh.position.y = enemy.position.y - t * 0.4;

  enemy.mesh.traverse((obj) => {
    if (obj instanceof Mesh) {
      const mat = obj.material;
      if (!Array.isArray(mat) && "opacity" in mat) {
        mat.transparent = true;
        mat.opacity = 1 - t;
        if ("emissiveIntensity" in mat) {
          (mat as MeshStandardMaterial).emissiveIntensity *= 0.92;
        }
      }
    }
  });

  if (t >= 1 && !ex.removed) {
    ex.removed = true;
    scene.remove(enemy.mesh);
    disposeEnemyMesh(enemy.mesh);
  }
}

function disposeEnemyMesh(mesh: Group): void {
  mesh.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else {
        mat.dispose();
      }
    }
  });
}

function setState(enemy: EnemyState, next: EnemyState["state"]): void {
  if (enemy.state === next) return;
  enemy.state = next;
}

function updateOne(
  enemy: EnemyState,
  dt: number,
  time: number,
  player: PlayerState,
  colliders: AABB[],
  onAttack: EnemyAttackCallback,
  scene: Scene,
): void {
  const ex = getExtras(enemy);

  if (!enemy.alive || enemy.state === "dead") {
    if (enemy.state !== "dead") setState(enemy, "dead");
    enemy.alive = false;
    updateDeath(enemy, ex, dt, scene);
    return;
  }

  if (enemy.health <= 0) {
    enemy.alive = false;
    setState(enemy, "dead");
    updateDeath(enemy, ex, dt, scene);
    return;
  }

  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

  _toPlayer.set(
    player.position.x - enemy.position.x,
    0,
    player.position.z - enemy.position.z,
  );
  const dist = _toPlayer.length();
  const los =
    dist < CHASE_RANGE &&
    hasLineOfSight(enemy.position, player.position, colliders);

  // State transitions — dead already returned; TS narrows state to live
  const prior = enemy.state;
  switch (prior) {
    case "idle":
    case "patrol": {
      if (los && dist < CHASE_RANGE) {
        setState(enemy, "chase");
      } else if (prior === "idle") {
        setState(enemy, "patrol");
        pickWanderTarget(enemy, ex);
      }
      break;
    }
    case "chase": {
      if (dist <= ATTACK_RANGE && los) {
        setState(enemy, "attack");
      } else if (dist > LOSE_RANGE || (!los && dist > CHASE_RANGE * 0.6)) {
        setState(enemy, "patrol");
        pickWanderTarget(enemy, ex);
      }
      break;
    }
    case "attack": {
      if (dist > ATTACK_RANGE * 1.35) {
        setState(enemy, los ? "chase" : "patrol");
      }
      break;
    }
    default: {
      const _exhaustive: never = prior;
      return _exhaustive;
    }
  }

  switch (enemy.state) {
    case "idle": {
      enemy.velocity.set(0, 0, 0);
      animateIdleTwitch(enemy, ex, time, 0.7);
      break;
    }
    case "patrol": {
      ex.wanderTimer -= dt;
      _wish.set(
        ex.wanderTarget.x - enemy.position.x,
        0,
        ex.wanderTarget.z - enemy.position.z,
      );
      const wDist = _wish.length();
      if (wDist < 0.4 || ex.wanderTimer <= 0) {
        pickWanderTarget(enemy, ex);
      } else {
        _wish.multiplyScalar(1 / wDist);
        const step = WANDER_SPEED * dt;
        slideMove(enemy.position, _wish.x * step, _wish.z * step, colliders);
        enemy.velocity.set(_wish.x * WANDER_SPEED, 0, _wish.z * WANDER_SPEED);
        faceDirection(enemy.mesh, _wish.x, _wish.z, dt);
      }
      animateIdleTwitch(enemy, ex, time, 1);
      break;
    }
    case "chase": {
      if (dist > 0.01) {
        _wish.copy(_toPlayer).multiplyScalar(1 / dist);
        const step = CHASE_SPEED * dt;
        slideMove(enemy.position, _wish.x * step, _wish.z * step, colliders);
        enemy.velocity.set(_wish.x * CHASE_SPEED, 0, _wish.z * CHASE_SPEED);
        faceDirection(enemy.mesh, _wish.x, _wish.z, dt);
      }
      animateIdleTwitch(enemy, ex, time, 1.6);
      break;
    }
    case "attack": {
      enemy.velocity.set(0, 0, 0);
      faceDirection(enemy.mesh, _toPlayer.x, _toPlayer.z, dt);
      animateIdleTwitch(enemy, ex, time, 2.2);
      const armR = enemy.mesh.getObjectByName("arm-r");
      if (armR) {
        armR.rotation.x = -1.2 + Math.sin(time * 20) * 0.15;
      }
      if (enemy.attackCooldown <= 0 && dist <= ATTACK_RANGE * 1.1) {
        enemy.attackCooldown = ATTACK_COOLDOWN;
        onAttack(ATTACK_DAMAGE, enemy);
      }
      break;
    }
    default: {
      const _exhaustive: never = enemy.state;
      return _exhaustive;
    }
  }

  // Sync mesh to logical position (jitter applied on top in twitch)
  _next.copy(enemy.position);
  enemy.mesh.position.x = _next.x;
  enemy.mesh.position.z = _next.z;
  enemy.mesh.position.y = _next.y;
}

export function createEnemySystem(): EnemySystem {
  const enemies: EnemyState[] = [];
  let boundScene: Scene | null = null;

  function spawnFrom(spawns: Vector3[], scene: Scene): void {
    boundScene = scene;
    // Clear previous
    clear(scene);

    const count = Math.min(MAX_ACTIVE, spawns.length);
    // Spread across provided points; if fewer spawns, reuse with offset
    for (let i = 0; i < count; i++) {
      const base = spawns[i % spawns.length];
      if (!base) continue;
      const offset =
        i < spawns.length
          ? 0
          : ((i / spawns.length) | 0) * 0.8;
      const pos = base.clone();
      if (offset > 0) {
        pos.x += Math.cos(i * 2.4) * offset;
        pos.z += Math.sin(i * 2.4) * offset;
      }
      enemies.push(createEnemy(pos, scene));
    }
  }

  function update(
    dt: number,
    time: number,
    player: PlayerState,
    colliders: AABB[],
    onAttack: EnemyAttackCallback,
  ): void {
    const scene = boundScene;
    if (!scene) return;

    for (const enemy of enemies) {
      updateOne(enemy, dt, time, player, colliders, onAttack, scene);
    }

    // Compact fully removed dead
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e) continue;
      const ex = extras.get(e);
      if (ex?.removed) {
        enemies.splice(i, 1);
      }
    }
  }

  function clear(scene: Scene): void {
    for (const e of enemies) {
      scene.remove(e.mesh);
      disposeEnemyMesh(e.mesh);
    }
    enemies.length = 0;
    boundScene = scene;
  }

  function aliveCount(): number {
    let n = 0;
    for (const e of enemies) {
      if (e.alive && e.state !== "dead") n += 1;
    }
    return n;
  }

  return {
    enemies,
    spawnFrom,
    update,
    clear,
    aliveCount,
  };
}

/** Convenience: spawn and return the live array (also usable without system). */
export function spawnEnemies(
  scene: Scene,
  spawns: Vector3[],
  maxCount: number = MAX_ACTIVE,
): EnemyState[] {
  const list: EnemyState[] = [];
  const count = Math.min(maxCount, Math.max(spawns.length, 0), MAX_ACTIVE);
  for (let i = 0; i < count; i++) {
    const base = spawns[i];
    if (!base) continue;
    list.push(createEnemy(base.clone(), scene));
  }
  return list;
}

export function updateEnemies(
  enemies: EnemyState[],
  player: PlayerState,
  colliders: AABB[],
  dt: number,
  time: number,
  onAttack: EnemyAttackCallback,
  scene: Scene,
): void {
  for (const enemy of enemies) {
    updateOne(enemy, dt, time, player, colliders, onAttack, scene);
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e) continue;
    const ex = extras.get(e);
    if (ex?.removed) enemies.splice(i, 1);
  }
}

export function clearEnemies(scene: Scene, enemies: EnemyState[]): void {
  for (const e of enemies) {
    scene.remove(e.mesh);
    disposeEnemyMesh(e.mesh);
  }
  enemies.length = 0;
}

export const ENEMY_LIMITS = {
  maxActive: MAX_ACTIVE,
  chaseRange: CHASE_RANGE,
  attackRange: ATTACK_RANGE,
  attackDamage: ATTACK_DAMAGE,
} as const;
