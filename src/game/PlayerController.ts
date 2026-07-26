import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GameConfig } from "./config";
import type { PhysicsBodyHandle, PhysicsWorld } from "./PhysicsWorld";

export class PlayerController {
  readonly yawObject = new THREE.Object3D();
  readonly pitchObject = new THREE.Object3D();
  readonly eye = new THREE.Object3D();

  private body!: PhysicsBodyHandle;
  private readonly keys = new Set<string>();
  private pitch = 0;
  private yaw = 0;
  private grounded = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private landDip = 0;
  private jumpFovKick = 0;
  private airFallSpeed = 0;
  private bobPhase = 0;
  private spawn = new THREE.Vector3();
  private locked = false;
  private sprinting = false;
  private readonly wish = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly lookQuat = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly ray = new RAPIER.Ray(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: -1, z: 0 },
  );
  private readonly hitPoint = { x: 0, y: 0, z: 0 };
  private readonly platformVel = new THREE.Vector3();

  velocityHorizontal = 0;
  onLand?: (impact: number) => void;
  onJump?: () => void;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly physics: PhysicsWorld;
  private readonly canvas: HTMLCanvasElement;

  constructor(
    camera: THREE.PerspectiveCamera,
    physics: PhysicsWorld,
    canvas: HTMLCanvasElement,
  ) {
    this.camera = camera;
    this.physics = physics;
    this.canvas = canvas;
    this.yawObject.add(this.pitchObject);
    this.pitchObject.add(this.eye);
    this.eye.add(this.camera);
    this.camera.position.set(0, 0, 0);
  }

  spawnAt(position: THREE.Vector3): void {
    this.spawn.copy(position);
    this.body = this.physics.createPlayerCapsule(position);
    this.syncVisuals();
  }

  get rigidBody(): RAPIER.RigidBody {
    return this.body.rigidBody;
  }

  get position(): THREE.Vector3 {
    const t = this.body.rigidBody.translation();
    return this.tmp.set(t.x, t.y, t.z);
  }

  bindInput(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLock);
  }

  requestLock(): void {
    void this.canvas.requestPointerLock();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  setCheckpoint(position: THREE.Vector3): void {
    this.spawn.copy(position);
  }

  respawn(): void {
    this.body.rigidBody.setTranslation(
      { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z },
      true,
    );
    this.body.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.pitch = 0;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.landDip = 0;
    this.jumpFovKick = 0;
    this.airFallSpeed = 0;
    this.platformVel.set(0, 0, 0);
    this.applyLook();
  }

  update(dt: number): { speed: number; fov: number } {
    const safeDt = Math.min(dt, 0.05);
    this.probeGround();

    if (this.grounded) {
      this.coyoteTimer = GameConfig.coyoteTime;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - safeDt);
    }

    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - safeDt);

    const forward = this.keys.has("KeyW") || this.keys.has("ArrowUp");
    const back = this.keys.has("KeyS") || this.keys.has("ArrowDown");
    const left = this.keys.has("KeyA") || this.keys.has("ArrowLeft");
    const right = this.keys.has("KeyD") || this.keys.has("ArrowRight");
    this.sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");

    this.wish.set(0, 0, 0);
    if (forward) this.wish.z -= 1;
    if (back) this.wish.z += 1;
    if (left) this.wish.x -= 1;
    if (right) this.wish.x += 1;
    if (this.wish.lengthSq() > 0) this.wish.normalize();

    this.lookQuat.setFromAxisAngle(this.up, this.yaw);
    this.wish.applyQuaternion(this.lookQuat);

    const targetSpeed = this.sprinting
      ? GameConfig.sprintSpeed
      : GameConfig.walkSpeed;
    const vel = this.body.rigidBody.linvel();

    // Relative to moving platform so carry feels sticky without fighting wish.
    const px = this.platformVel.x;
    const pz = this.platformVel.z;
    let relX = vel.x - px;
    let relZ = vel.z - pz;

    const wishing = this.wish.lengthSq() > 0;
    const desiredX = this.wish.x * targetSpeed;
    const desiredZ = this.wish.z * targetSpeed;

    if (this.grounded) {
      const rate = wishing ? GameConfig.groundAccel : GameConfig.groundDecel;
      relX = THREE.MathUtils.damp(relX, wishing ? desiredX : 0, rate, safeDt);
      relZ = THREE.MathUtils.damp(relZ, wishing ? desiredZ : 0, rate, safeDt);
    } else if (wishing) {
      // Floaty air: accelerate toward wish, preserve momentum when no input.
      const airTarget = Math.min(targetSpeed, GameConfig.airSpeedCap);
      const airDesiredX = this.wish.x * airTarget;
      const airDesiredZ = this.wish.z * airTarget;
      relX = THREE.MathUtils.damp(relX, airDesiredX, GameConfig.airAccel, safeDt);
      relZ = THREE.MathUtils.damp(relZ, airDesiredZ, GameConfig.airAccel, safeDt);
    }

    let newY = vel.y;
    const canJump = this.grounded || this.coyoteTimer > 0;
    if (this.jumpBufferTimer > 0 && canJump) {
      newY = Math.max(newY, GameConfig.jumpSpeed) + Math.max(0, this.platformVel.y);
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.grounded = false;
      this.jumpFovKick = GameConfig.jumpFovPunch;
      this.onJump?.();
    }

    // Inherit platform horizontal (and soft vertical when standing).
    const newX = relX + px;
    const newZ = relZ + pz;
    if (this.grounded && this.platformVel.y !== 0) {
      // Nudge with platform lift so we don't separate on rising movers.
      newY = Math.max(newY, this.platformVel.y);
    }

    this.body.rigidBody.setLinvel({ x: newX, y: newY, z: newZ }, true);

    const horizontal = Math.hypot(newX, newZ);
    this.velocityHorizontal = horizontal;

    // Landing squash + jump FOV recovery.
    this.landDip = THREE.MathUtils.damp(this.landDip, 0, GameConfig.landDipDecay, safeDt);
    this.jumpFovKick = Math.max(
      0,
      this.jumpFovKick - (GameConfig.jumpFovPunch / GameConfig.jumpFovDecay) * safeDt,
    );

    const moving = horizontal > 0.8 && this.grounded;
    if (moving) {
      this.bobPhase +=
        safeDt * GameConfig.headBobFreq * (horizontal / targetSpeed);
    }
    const bob =
      Math.sin(this.bobPhase) * GameConfig.headBobAmp * (moving ? 1 : 0.1);
    const eyeY =
      GameConfig.playerHeight * 0.42 + bob - this.landDip;
    this.eye.position.set(
      Math.cos(this.bobPhase * 0.5) * bob * 0.35,
      eyeY,
      0,
    );

    this.syncVisuals();

    const speedNorm = THREE.MathUtils.clamp(
      horizontal / GameConfig.sprintSpeed,
      0,
      1,
    );
    const sprintBlend =
      this.sprinting && horizontal > 4 ? speedNorm : 0;
    const baseFov = THREE.MathUtils.lerp(
      GameConfig.fov,
      GameConfig.sprintFov,
      sprintBlend,
    );
    const fov = baseFov + this.jumpFovKick;
    return { speed: horizontal, fov };
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLock);
  }

  private probeGround(): void {
    const t = this.body.rigidBody.translation();
    const halfHeight =
      (GameConfig.playerHeight - GameConfig.playerRadius * 2) / 2;
    // Capsule sole is at center - halfHeight - radius; start slightly above it.
    const soleY = t.y - halfHeight - GameConfig.playerRadius;
    this.ray.origin.x = t.x;
    this.ray.origin.y = soleY + GameConfig.groundRaySkin;
    this.ray.origin.z = t.z;
    this.ray.dir.x = 0;
    this.ray.dir.y = -1;
    this.ray.dir.z = 0;

    const maxToi = GameConfig.groundRaySkin + GameConfig.groundRayExtra;
    const hit = this.physics.world.castRayAndGetNormal(
      this.ray,
      maxToi,
      true,
      undefined,
      undefined,
      undefined,
      this.body.rigidBody,
    );

    const vel = this.body.rigidBody.linvel();
    const walkable =
      hit !== null &&
      hit.normal.y >= GameConfig.groundNormalMinY &&
      vel.y <= GameConfig.groundMaxVy;

    const previouslyGrounded = this.grounded;
    this.grounded = walkable;
    this.platformVel.set(0, 0, 0);

    if (!walkable) {
      this.airFallSpeed = Math.max(this.airFallSpeed, -vel.y);
      return;
    }

    if (hit) {
      const parent = hit.collider.parent();
      if (parent && parent.isKinematic()) {
        this.hitPoint.x = this.ray.origin.x;
        this.hitPoint.y = this.ray.origin.y - hit.timeOfImpact;
        this.hitPoint.z = this.ray.origin.z;
        const pv = parent.velocityAtPoint(this.hitPoint);
        this.platformVel.set(pv.x, pv.y, pv.z);
      }
    }

    if (!previouslyGrounded) {
      const impact = Math.max(this.airFallSpeed, Math.max(0, -vel.y));
      this.airFallSpeed = 0;
      if (impact > 0.4) {
        const tImpact = THREE.MathUtils.clamp(impact / 14, 0.3, 1);
        this.landDip = GameConfig.landDipAmp * tImpact;
        this.onLand?.(impact);
      }
    } else {
      this.airFallSpeed = 0;
    }
  }

  private syncVisuals(): void {
    const t = this.body.rigidBody.translation();
    this.yawObject.position.set(t.x, t.y, t.z);
    this.applyLook();
  }

  private applyLook(): void {
    this.yawObject.rotation.y = this.yaw;
    this.pitchObject.rotation.x = this.pitch;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Space" && !this.keys.has("Space") && !e.repeat) {
      this.jumpBufferTimer = GameConfig.jumpBuffer;
    }
    this.keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.yaw -= e.movementX * GameConfig.mouseSensitivity;
    this.pitch -= e.movementY * GameConfig.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.4, 1.4);
  };

  private onPointerLock = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
  };
}
