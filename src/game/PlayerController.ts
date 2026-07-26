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
  private bobPhase = 0;
  private spawn = new THREE.Vector3();
  private locked = false;
  private sprinting = false;
  private readonly wish = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly lookQuat = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  velocityHorizontal = 0;
  onLand?: () => void;
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
    this.applyLook();
  }

  update(dt: number): { speed: number; fov: number } {
    this.probeGround();

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
    const control = this.grounded ? 1 : GameConfig.airControl;
    const vel = this.body.rigidBody.linvel();

    const damp = 18 * control;
    const desiredX = this.wish.x * targetSpeed;
    const desiredZ = this.wish.z * targetSpeed;
    const newX = THREE.MathUtils.damp(vel.x, desiredX, damp, dt);
    const newZ = THREE.MathUtils.damp(vel.z, desiredZ, damp, dt);

    let newY = vel.y;
    if (this.keys.has("Space") && this.grounded) {
      newY = GameConfig.jumpSpeed;
      this.grounded = false;
      this.onJump?.();
    }

    this.body.rigidBody.setLinvel({ x: newX, y: newY, z: newZ }, true);

    const horizontal = Math.hypot(newX, newZ);
    this.velocityHorizontal = horizontal;

    const moving = horizontal > 0.8 && this.grounded;
    if (moving) {
      this.bobPhase +=
        dt * GameConfig.headBobFreq * (horizontal / targetSpeed);
    }
    const bob =
      Math.sin(this.bobPhase) * GameConfig.headBobAmp * (moving ? 1 : 0.12);
    const eyeY = GameConfig.playerHeight * 0.42 + bob;
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
    const fov = THREE.MathUtils.lerp(
      GameConfig.fov,
      GameConfig.sprintFov,
      this.sprinting && horizontal > 4 ? speedNorm : 0,
    );

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
    this.ray.origin.x = t.x;
    this.ray.origin.y = t.y;
    this.ray.origin.z = t.z;
    const maxToi = GameConfig.playerRadius + 0.22;
    const hit = this.physics.world.castRay(this.ray, maxToi, true);
    const wasGrounded = this.grounded;
    this.grounded = hit !== null && this.body.rigidBody.linvel().y <= 0.35;
    if (this.grounded && !wasGrounded) this.onLand?.();
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
