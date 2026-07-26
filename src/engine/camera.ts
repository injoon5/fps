import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { PlayerState } from "../types";
import type { InputState } from "./input";
import { EYE_HEIGHT } from "./player";

const DEFAULT_FOV = 75;
const SPRINT_FOV = 82;
const FOV_LERP = 8;

/** Kane Pixel stillness bias — restrained documentary bob. */
const BOB_FREQ = 7.2;
const BOB_AMP_Y = 0.012;
const BOB_AMP_X = 0.007;
const BOB_SPRINT_MUL = 1.35;

const RECOIL_RECOVERY = 14;
const SWAY_AMOUNT = 0.00035;
const SWAY_MAX = 0.025;
const SWAY_RETURN = 10;

const PUNCH_RECOVERY = 9;

const _lookTarget = new Vector3();
const _eye = new Vector3();

export interface CameraController {
  camera: PerspectiveCamera;
  update: (dt: number, player: PlayerState, input: InputState) => void;
  addRecoil: (amount: number) => void;
  /** Upward/back punch when taking damage. */
  addDamagePunch: (amount?: number) => void;
  dispose: () => void;
}

export function createCamera(aspect = 1): CameraController {
  const camera = new PerspectiveCamera(DEFAULT_FOV, aspect, 0.05, 400);

  let bobPhase = 0;
  let recoilPitch = 0;
  let swayYaw = 0;
  let swayPitch = 0;
  let punchPitch = 0;
  let punchRoll = 0;
  let currentFov = DEFAULT_FOV;

  const update = (dt: number, player: PlayerState, input: InputState): void => {
    const safeDt = dt > 0.05 ? 0.05 : dt < 0 ? 0 : dt;

    // Horizontal speed for bob gating
    const hx = player.velocity.x;
    const hz = player.velocity.z;
    const hSpeed = Math.hypot(hx, hz);
    const moving = player.grounded && hSpeed > 0.8;

    if (moving) {
      const speedNorm = MathUtils.clamp(hSpeed / 11.2, 0.35, 1.2);
      bobPhase += BOB_FREQ * speedNorm * safeDt;
    } else {
      // Ease phase toward rest so bob doesn't pop
      bobPhase *= Math.exp(-6 * safeDt);
    }

    const sprintMul = player.sprinting ? BOB_SPRINT_MUL : 1;
    const bobFade = moving ? 1 : 0;
    const bobY = Math.sin(bobPhase * 2) * BOB_AMP_Y * sprintMul * bobFade;
    const bobX = Math.cos(bobPhase) * BOB_AMP_X * sprintMul * bobFade;

    // Recoil recovery
    recoilPitch = damp(recoilPitch, 0, RECOIL_RECOVERY, safeDt);

    // Weapon sway from mouse (very subtle)
    if (input.pointerLocked) {
      swayYaw += input.mouseDelta.x * SWAY_AMOUNT;
      swayPitch += input.mouseDelta.y * SWAY_AMOUNT;
    }
    swayYaw = MathUtils.clamp(swayYaw, -SWAY_MAX, SWAY_MAX);
    swayPitch = MathUtils.clamp(swayPitch, -SWAY_MAX, SWAY_MAX);
    swayYaw = damp(swayYaw, 0, SWAY_RETURN, safeDt);
    swayPitch = damp(swayPitch, 0, SWAY_RETURN, safeDt);

    punchPitch = damp(punchPitch, 0, PUNCH_RECOVERY, safeDt);
    punchRoll = damp(punchRoll, 0, PUNCH_RECOVERY, safeDt);

    // Eye position
    _eye.set(
      player.position.x + bobX,
      player.position.y + EYE_HEIGHT + bobY,
      player.position.z,
    );
    camera.position.copy(_eye);

    // Look: yaw / pitch + kick offsets
    const yaw = player.yaw + swayYaw;
    const pitch = player.pitch + recoilPitch + punchPitch + swayPitch;

    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    // Forward in Three.js Y-up
    _lookTarget.set(
      camera.position.x - sy * cp,
      camera.position.y + sp,
      camera.position.z - cy * cp,
    );
    camera.lookAt(_lookTarget);
    camera.rotation.z = punchRoll;

    // FOV breathe on sprint
    const targetFov = player.sprinting ? SPRINT_FOV : DEFAULT_FOV;
    currentFov = damp(currentFov, targetFov, FOV_LERP, safeDt);
    camera.fov = currentFov;
    camera.updateProjectionMatrix();
  };

  const addRecoil = (amount: number): void => {
    if (amount <= 0) return;
    recoilPitch += amount;
    if (recoilPitch > 0.35) recoilPitch = 0.35;
  };

  const addDamagePunch = (amount = 0.08): void => {
    if (amount <= 0) return;
    punchPitch -= amount * 0.65;
    punchRoll += (Math.random() * 2 - 1) * amount * 0.5;
  };

  const dispose = (): void => {
    // PerspectiveCamera has no GPU resources beyond what renderer owns
  };

  return { camera, update, addRecoil, addDamagePunch, dispose };
}

/** Sync an existing camera once (no bob/recoil) — useful for boot / cutaways. */
export function syncCameraToPlayer(
  camera: PerspectiveCamera,
  player: PlayerState,
): void {
  camera.position.set(
    player.position.x,
    player.position.y + EYE_HEIGHT,
    player.position.z,
  );

  const cy = Math.cos(player.yaw);
  const sy = Math.sin(player.yaw);
  const cp = Math.cos(player.pitch);
  const sp = Math.sin(player.pitch);

  _lookTarget.set(
    camera.position.x - sy * cp,
    camera.position.y + sp,
    camera.position.z - cy * cp,
  );
  camera.lookAt(_lookTarget);
  camera.rotation.z = 0;
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return MathUtils.damp(current, target, lambda, dt);
}
