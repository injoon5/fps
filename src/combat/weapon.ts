import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector3,
} from "three";
import type { AABB, EnemyState, WeaponState } from "../types";
import {
  raycastColliders,
  raycastEnemies,
  type RayHit,
} from "./projectiles";

const MAG_SIZE = 30;
const RESERVE_MAX = 120;
const DAMAGE = 25;
const FIRE_RATE = 8;
const FIRE_INTERVAL = 1 / FIRE_RATE;
const RELOAD_TIME = 1.65;
const SPREAD_RAD = 0.028;
const RANGE = 85;
const MUZZLE_FLASH_LIFE = 0.05;
const RECOIL_KICK = 0.045;

const _origin = new Vector3();
const _dir = new Vector3();
const _spreadRight = new Vector3();
const _spreadUp = new Vector3();
const _hitPoint = new Vector3();
const _hitNormal = new Vector3();
const _ejectDir = new Vector3();
const _muzzleWorld = new Vector3();
const _casingPos = new Vector3();

export interface RecoilEvent {
  /** Vertical kick in radians (pitch up). */
  pitch: number;
  /** Horizontal kick in radians. */
  yaw: number;
  /** Normalized punch amount 0–1 for screen shake. */
  punch: number;
}

export interface FireResult {
  fired: boolean;
  hitEnemy: EnemyState | null;
  hitPoint: Vector3 | null;
  hitNormal: Vector3 | null;
  hitWall: boolean;
}

export type WeaponCallbacks = {
  onRecoil?: (event: RecoilEvent) => void;
  onFire?: (muzzleWorld: Vector3, direction: Vector3) => void;
  onHitEnemy?: (enemy: EnemyState, point: Vector3, direction: Vector3) => void;
  onHitWorld?: (point: Vector3, normal: Vector3) => void;
  onMiss?: () => void;
  onReloadStart?: () => void;
  onReloadEnd?: () => void;
  onEmpty?: () => void;
};

export interface ThresholdRifle {
  readonly state: WeaponState;
  readonly viewModel: Group;
  readonly muzzleLocal: Vector3;
  setCallbacks: (callbacks: Partial<WeaponCallbacks>) => void;
  tryFire: (
    camera: PerspectiveCamera,
    enemies: EnemyState[],
    colliders: AABB[],
  ) => FireResult;
  startReload: () => boolean;
  update: (dt: number, time: number) => void;
  /** Parent viewmodel under camera each frame (or once). */
  attachToCamera: (camera: PerspectiveCamera) => void;
  getMuzzleWorld: (out?: Vector3) => Vector3;
  dispose: (scene?: Scene) => void;
}

export function createWeaponState(): WeaponState {
  return {
    name: "Threshold Rifle",
    ammo: MAG_SIZE,
    reserve: RESERVE_MAX,
    magSize: MAG_SIZE,
    fireRate: FIRE_RATE,
    damage: DAMAGE,
    recoil: RECOIL_KICK,
    reloadTime: RELOAD_TIME,
    reloading: false,
    lastShot: -Infinity,
  };
}

/**
 * Procedural first-person gun — black polymer slab with amber accents.
 * Parent under the camera; local offset places it in lower-right FOV.
 */
export function createViewModel(): Group {
  const root = new Group();
  root.name = "threshold-rifle-viewmodel";

  const bodyMat = new MeshStandardMaterial({
    color: new Color(0x0a0a0a),
    roughness: 0.72,
    metalness: 0.35,
    emissive: new Color(0x1a0e00),
    emissiveIntensity: 0.08,
  });
  const accentMat = new MeshStandardMaterial({
    color: new Color(0x2a1800),
    roughness: 0.45,
    metalness: 0.55,
    emissive: new Color(0xff8800),
    emissiveIntensity: 0.35,
  });
  const darkMat = new MeshStandardMaterial({
    color: new Color(0x050505),
    roughness: 0.85,
    metalness: 0.2,
  });

  const receiver = new Mesh(new BoxGeometry(0.08, 0.11, 0.42), bodyMat);
  receiver.position.set(0, -0.02, -0.12);
  root.add(receiver);

  const barrel = new Mesh(new BoxGeometry(0.035, 0.035, 0.38), darkMat);
  barrel.position.set(0, 0.01, -0.42);
  root.add(barrel);

  const mag = new Mesh(new BoxGeometry(0.05, 0.16, 0.08), darkMat);
  mag.position.set(0, -0.12, -0.05);
  root.add(mag);

  const stock = new Mesh(new BoxGeometry(0.06, 0.08, 0.18), bodyMat);
  stock.position.set(0, -0.01, 0.18);
  root.add(stock);

  const grip = new Mesh(new BoxGeometry(0.045, 0.12, 0.06), darkMat);
  grip.position.set(0, -0.1, 0.06);
  grip.rotation.x = 0.35;
  root.add(grip);

  const rail = new Mesh(new BoxGeometry(0.04, 0.02, 0.22), accentMat);
  rail.position.set(0, 0.045, -0.2);
  root.add(rail);

  const sightFront = new Mesh(new BoxGeometry(0.012, 0.04, 0.012), accentMat);
  sightFront.position.set(0, 0.06, -0.48);
  root.add(sightFront);

  const sightRear = new Mesh(new BoxGeometry(0.028, 0.03, 0.012), accentMat);
  sightRear.position.set(0, 0.055, -0.02);
  root.add(sightRear);

  // Muzzle flash mesh (additive quad-ish box)
  const flashMat = new MeshStandardMaterial({
    color: new Color(0xffaa44),
    emissive: new Color(0xffcc66),
    emissiveIntensity: 2.5,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    roughness: 1,
    metalness: 0,
  });
  const flash = new Mesh(new CylinderGeometry(0.02, 0.08, 0.14, 6), flashMat);
  flash.rotation.x = Math.PI / 2;
  flash.position.set(0, 0.01, -0.62);
  flash.visible = false;
  flash.name = "muzzle-flash";
  root.add(flash);

  const muzzleLight = new PointLight(0xff9933, 0, 4, 2);
  muzzleLight.position.set(0, 0.01, -0.62);
  muzzleLight.name = "muzzle-light";
  root.add(muzzleLight);

  // Rest pose in camera space
  root.position.set(0.22, -0.2, -0.42);
  root.rotation.set(0.04, 0.06, -0.02);

  return root;
}

export function createThresholdRifle(
  camera: PerspectiveCamera,
  initial?: Partial<WeaponState>,
): ThresholdRifle {
  const state = createWeaponState();
  if (initial) {
    Object.assign(state, initial);
  }

  const viewModel = createViewModel();
  camera.add(viewModel);

  const muzzleLocal = new Vector3(0, 0.01, -0.62);
  const callbacks: WeaponCallbacks = {};

  let reloadTimer = 0;
  let flashTimer = 0;
  let bobTime = 0;
  let recoilPitch = 0;
  let recoilYaw = 0;

  const flash = viewModel.getObjectByName("muzzle-flash") as Mesh | undefined;
  const muzzleLight = viewModel.getObjectByName("muzzle-light") as
    | PointLight
    | undefined;
  const flashMat = flash?.material as MeshStandardMaterial | undefined;

  const casingPool: Mesh[] = [];
  const activeCasings: {
    mesh: Mesh;
    life: number;
    vx: number;
    vy: number;
    vz: number;
  }[] = [];

  function getCasing(): Mesh {
    const existing = casingPool.pop();
    if (existing) {
      existing.visible = true;
      return existing;
    }
    const mesh = new Mesh(
      new CylinderGeometry(0.006, 0.006, 0.02, 5),
      new MeshStandardMaterial({
        color: 0xc4a35a,
        metalness: 0.85,
        roughness: 0.35,
        emissive: 0x331800,
        emissiveIntensity: 0.15,
      }),
    );
    mesh.castShadow = false;
    return mesh;
  }

  function ejectCasing(worldPos: Vector3, cameraRight: Vector3): void {
    const mesh = getCasing();
    mesh.position.copy(worldPos);
    mesh.quaternion.copy(camera.quaternion);
    const scene = findScene(camera);
    if (scene) {
      scene.add(mesh);
    } else {
      camera.add(mesh);
    }
    _ejectDir.copy(cameraRight).multiplyScalar(1.2 + Math.random() * 0.6);
    _ejectDir.y += 1.4 + Math.random() * 0.8;
    activeCasings.push({
      mesh,
      life: 0.55 + Math.random() * 0.25,
      vx: _ejectDir.x + (Math.random() - 0.5) * 0.4,
      vy: _ejectDir.y,
      vz: _ejectDir.z + (Math.random() - 0.5) * 0.4,
    });
  }

  function getMuzzleWorld(out: Vector3 = new Vector3()): Vector3 {
    return viewModel.localToWorld(out.copy(muzzleLocal));
  }

  function setCallbacks(next: Partial<WeaponCallbacks>): void {
    Object.assign(callbacks, next);
  }

  function attachToCamera(cam: PerspectiveCamera): void {
    if (viewModel.parent !== cam) {
      cam.add(viewModel);
    }
  }

  function startReload(): boolean {
    if (state.reloading) return false;
    if (state.ammo >= state.magSize) return false;
    if (state.reserve <= 0) return false;

    state.reloading = true;
    reloadTimer = state.reloadTime;
    callbacks.onReloadStart?.();
    return true;
  }

  function finishReload(): void {
    const need = state.magSize - state.ammo;
    const take = Math.min(need, state.reserve);
    state.ammo += take;
    state.reserve -= take;
    state.reloading = false;
    reloadTimer = 0;
    callbacks.onReloadEnd?.();
  }

  function tryFire(
    cam: PerspectiveCamera,
    enemies: EnemyState[],
    colliders: AABB[],
  ): FireResult {
    const empty: FireResult = {
      fired: false,
      hitEnemy: null,
      hitPoint: null,
      hitNormal: null,
      hitWall: false,
    };

    if (state.reloading) return empty;
    if (state.ammo <= 0) {
      callbacks.onEmpty?.();
      startReload();
      return empty;
    }

    const now =
      typeof performance !== "undefined" ? performance.now() / 1000 : 0;
    if (now - state.lastShot < FIRE_INTERVAL) return empty;

    state.lastShot = now;
    state.ammo -= 1;

    // Spread in camera basis
    cam.getWorldPosition(_origin);
    cam.getWorldDirection(_dir);
    _spreadRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _spreadUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const sx = (Math.random() * 2 - 1) * SPREAD_RAD;
    const sy = (Math.random() * 2 - 1) * SPREAD_RAD;
    _dir.addScaledVector(_spreadRight, sx).addScaledVector(_spreadUp, sy).normalize();

    const enemyHit = raycastEnemies(_origin, _dir, enemies, RANGE);
    const wallHit = raycastColliders(_origin, _dir, colliders, RANGE);

    let best: RayHit | null = null;
    let hitEnemy: EnemyState | null = null;
    let hitWall = false;

    if (enemyHit && wallHit) {
      if (enemyHit.distance <= wallHit.distance) {
        best = enemyHit;
        hitEnemy = enemyHit.enemy;
      } else {
        best = wallHit;
        hitWall = true;
      }
    } else if (enemyHit) {
      best = enemyHit;
      hitEnemy = enemyHit.enemy;
    } else if (wallHit) {
      best = wallHit;
      hitWall = true;
    }

    // Muzzle FX
    flashTimer = MUZZLE_FLASH_LIFE;
    if (flash) flash.visible = true;
    if (flashMat) flashMat.opacity = 1;
    if (muzzleLight) muzzleLight.intensity = 6;

    recoilPitch = RECOIL_KICK * (0.75 + Math.random() * 0.5);
    recoilYaw = (Math.random() * 2 - 1) * RECOIL_KICK * 0.35;
    callbacks.onRecoil?.({
      pitch: recoilPitch,
      yaw: recoilYaw,
      punch: 0.7 + Math.random() * 0.3,
    });

    const muzzleWorld = getMuzzleWorld(_muzzleWorld);
    callbacks.onFire?.(muzzleWorld.clone(), _dir.clone());

    // Shell casing
    _casingPos.copy(muzzleWorld).addScaledVector(_spreadRight, 0.05);
    ejectCasing(_casingPos, _spreadRight);

    if (best) {
      _hitPoint.copy(best.point);
      _hitNormal.copy(best.normal);

      if (hitEnemy && hitEnemy.alive) {
        hitEnemy.health -= state.damage;
        if (hitEnemy.health <= 0) {
          hitEnemy.health = 0;
          hitEnemy.alive = false;
          hitEnemy.state = "dead";
        }
        callbacks.onHitEnemy?.(hitEnemy, _hitPoint.clone(), _dir.clone());
      } else if (hitWall) {
        callbacks.onHitWorld?.(_hitPoint.clone(), _hitNormal.clone());
      }
    } else {
      callbacks.onMiss?.();
    }

    if (state.ammo <= 0) {
      startReload();
    }

    return {
      fired: true,
      hitEnemy,
      hitPoint: best ? _hitPoint.clone() : null,
      hitNormal: best ? _hitNormal.clone() : null,
      hitWall,
    };
  }

  function update(dt: number, time: number): void {
    bobTime = time;
    const breathe = Math.sin(bobTime * 1.7) * 0.004;
    const idleYaw = Math.sin(bobTime * 1.1) * 0.006;

    // Settle recoil on viewmodel
    recoilPitch *= Math.exp(-12 * dt);
    recoilYaw *= Math.exp(-10 * dt);

    viewModel.position.set(0.22, -0.2 + breathe, -0.42);
    viewModel.rotation.set(
      0.04 + recoilPitch * 2.2,
      0.06 + recoilYaw + idleYaw,
      -0.02 + recoilYaw * 0.4,
    );

    if (state.reloading) {
      reloadTimer -= dt;
      // Reload dip
      viewModel.position.y -= 0.08 * Math.min(1, (state.reloadTime - reloadTimer) * 2);
      viewModel.rotation.x += 0.25;
      if (reloadTimer <= 0) {
        finishReload();
      }
    }

    if (flashTimer > 0) {
      flashTimer -= dt;
      const t = Math.max(0, flashTimer / MUZZLE_FLASH_LIFE);
      if (flashMat) flashMat.opacity = t;
      if (muzzleLight) muzzleLight.intensity = 6 * t;
      if (flash) {
        flash.scale.setScalar(0.7 + (1 - t) * 0.8);
        flash.rotation.z += dt * 18;
      }
      if (flashTimer <= 0) {
        if (flash) flash.visible = false;
        if (flashMat) flashMat.opacity = 0;
        if (muzzleLight) muzzleLight.intensity = 0;
      }
    }

    // Casings
    for (let i = activeCasings.length - 1; i >= 0; i--) {
      const c = activeCasings[i];
      if (!c) continue;
      c.life -= dt;
      c.vy -= 9.5 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += dt * 14;
      c.mesh.rotation.z += dt * 10;
      if (c.life <= 0) {
        c.mesh.visible = false;
        c.mesh.removeFromParent();
        casingPool.push(c.mesh);
        activeCasings.splice(i, 1);
      }
    }
  }

  function dispose(scene?: Scene): void {
    viewModel.removeFromParent();
    for (const c of activeCasings) {
      c.mesh.removeFromParent();
    }
    activeCasings.length = 0;
    for (const m of casingPool) {
      m.geometry.dispose();
      const mat = m.material;
      if (!Array.isArray(mat)) mat.dispose();
    }
    casingPool.length = 0;
    viewModel.traverse((obj) => {
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
    void scene;
  }

  return {
    state,
    viewModel,
    muzzleLocal,
    setCallbacks,
    tryFire,
    startReload,
    update,
    attachToCamera,
    getMuzzleWorld,
    dispose,
  };
}

function findScene(obj: Object3D): Scene | null {
  let current: Object3D | null = obj;
  while (current) {
    if ((current as Scene).isScene === true) {
      return current as Scene;
    }
    current = current.parent;
  }
  return null;
}
