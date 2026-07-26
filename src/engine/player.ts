import { Vector3 } from "three";
import type { AABB, PlayerState } from "../types";
import { moveAndCollide } from "./collision";
import type { InputState } from "./input";

/** Capsule radius (XZ). */
export const PLAYER_RADIUS = 0.35;
/** Full capsule height (feet → crown). */
export const PLAYER_HEIGHT = 1.8;
/** Camera / eye offset from feet. */
export const EYE_HEIGHT = 1.65;

const WALK_SPEED = 6.8;
const SPRINT_SPEED = 11.2;
const GROUND_ACCEL = 55;
const AIR_ACCEL = 14;
const GROUND_FRICTION = 12;
const AIR_FRICTION = 1.2;
const GRAVITY = 24;
const JUMP_SPEED = 7.8;
const MOUSE_SENS = 0.00215;
const MAX_PITCH = Math.PI * 0.5 - 0.01;
const MAX_HEALTH = 100;

const _wish = new Vector3();
const _forward = new Vector3();
const _right = new Vector3();

export interface PlayerController {
  state: PlayerState;
  update: (dt: number, input: InputState, colliders: AABB[]) => void;
  takeDamage: (amount: number) => number;
  heal: (amount: number) => number;
  /** Teleport feet to spawn; clears velocity. */
  respawn: (spawn: Vector3) => void;
}

export function createPlayer(spawn: Vector3): PlayerController {
  const state: PlayerState = {
    position: spawn.clone(),
    velocity: new Vector3(),
    yaw: 0,
    pitch: 0,
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    sprinting: false,
    grounded: true,
  };

  const update = (dt: number, input: InputState, colliders: AABB[]): void => {
    const safeDt = dt > 0.05 ? 0.05 : dt < 0 ? 0 : dt;
    if (safeDt === 0) return;

    applyLook(state, input);

    const wantsSprint =
      input.keys.has("ShiftLeft") || input.keys.has("ShiftRight");
    const onGround = state.grounded;

    // Wish direction from WASD in yaw space
    let ix = 0;
    let iz = 0;
    if (input.keys.has("KeyW") || input.keys.has("ArrowUp")) iz -= 1;
    if (input.keys.has("KeyS") || input.keys.has("ArrowDown")) iz += 1;
    if (input.keys.has("KeyA") || input.keys.has("ArrowLeft")) ix -= 1;
    if (input.keys.has("KeyD") || input.keys.has("ArrowRight")) ix += 1;

    const lenSq = ix * ix + iz * iz;
    if (lenSq > 0) {
      const inv = 1 / Math.sqrt(lenSq);
      ix *= inv;
      iz *= inv;
    }

    const sinY = Math.sin(state.yaw);
    const cosY = Math.cos(state.yaw);
    // Forward is -Z in Three.js yaw-around-Y
    _forward.set(-sinY, 0, -cosY);
    _right.set(cosY, 0, -sinY);

    _wish.set(0, 0, 0);
    _wish.addScaledVector(_right, ix);
    _wish.addScaledVector(_forward, iz);
    if (_wish.lengthSq() > 0) _wish.normalize();

    const canSprint = wantsSprint && onGround && iz < 0 && lenSq > 0;
    state.sprinting = canSprint;
    const maxSpeed = canSprint ? SPRINT_SPEED : WALK_SPEED;

    // Friction before accel (Quake order) — snappy stop + clean redirects
    applyFriction(
      state.velocity,
      onGround ? GROUND_FRICTION : AIR_FRICTION,
      safeDt,
      onGround,
      lenSq > 0,
    );

    accelerate(
      state.velocity,
      _wish,
      maxSpeed,
      onGround ? GROUND_ACCEL : AIR_ACCEL,
      safeDt,
    )

    // Jump
    if (input.jumpPressed && onGround) {
      state.velocity.y = JUMP_SPEED;
      state.grounded = false;
    }

    // Gravity
    state.velocity.y -= GRAVITY * safeDt;

    const { grounded } = moveAndCollide(
      state.position,
      state.velocity,
      safeDt,
      PLAYER_RADIUS,
      PLAYER_HEIGHT,
      colliders,
    );
    state.grounded = grounded;
  };

  const takeDamage = (amount: number): number => {
    if (amount <= 0) return state.health;
    state.health = Math.max(0, state.health - amount);
    return state.health;
  };

  const heal = (amount: number): number => {
    if (amount <= 0) return state.health;
    state.health = Math.min(state.maxHealth, state.health + amount);
    return state.health;
  };

  const respawn = (at: Vector3): void => {
    state.position.copy(at);
    state.velocity.set(0, 0, 0);
    state.health = state.maxHealth;
    state.grounded = true;
    state.sprinting = false;
    state.pitch = 0;
  };

  return { state, update, takeDamage, heal, respawn };
}

function applyLook(state: PlayerState, input: InputState): void {
  if (!input.pointerLocked) return;
  state.yaw -= input.mouseDelta.x * MOUSE_SENS;
  state.pitch -= input.mouseDelta.y * MOUSE_SENS;
  if (state.pitch > MAX_PITCH) state.pitch = MAX_PITCH;
  if (state.pitch < -MAX_PITCH) state.pitch = -MAX_PITCH;
}

/**
 * Quake / Doom-style accelerate toward wishdir up to maxSpeed.
 */
function accelerate(
  velocity: Vector3,
  wishDir: Vector3,
  maxSpeed: number,
  accel: number,
  dt: number,
): void {
  if (wishDir.lengthSq() < 1e-8) return;

  const currentSpeed = velocity.x * wishDir.x + velocity.z * wishDir.z;
  const addSpeed = maxSpeed - currentSpeed;
  if (addSpeed <= 0) return;

  let accelSpeed = accel * maxSpeed * dt;
  if (accelSpeed > addSpeed) accelSpeed = addSpeed;

  velocity.x += wishDir.x * accelSpeed;
  velocity.z += wishDir.z * accelSpeed;
}

function applyFriction(
  velocity: Vector3,
  friction: number,
  dt: number,
  grounded: boolean,
  hasWish: boolean,
): void {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < 1e-4) {
    velocity.x = 0;
    velocity.z = 0;
    return;
  }

  // Lighter friction while steering on ground so accel can redirect cleanly
  const frictionMul = grounded && hasWish ? 0.55 : 1;
  const control = grounded && speed < 1.5 ? 1.5 : speed;
  const drop = control * friction * frictionMul * dt;
  const newSpeed = speed - drop;
  if (newSpeed <= 0) {
    velocity.x = 0;
    velocity.z = 0;
    return;
  }
  const scale = newSpeed / speed;
  velocity.x *= scale;
  velocity.z *= scale;
}
