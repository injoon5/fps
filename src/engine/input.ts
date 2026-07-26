import type { LevelId } from "../types";

const LEVEL_BY_DIGIT: Readonly<Record<string, LevelId>> = {
  Digit1: "backrooms",
  Digit2: "mart",
  Digit3: "hotel",
  Digit4: "poolrooms",
  Digit5: "office",
  Digit6: "garage",
  Digit7: "playplace",
};

export interface MouseDelta {
  x: number;
  y: number;
}

export interface InputState {
  /** Currently held key codes (KeyboardEvent.code). */
  keys: Set<string>;
  /** Frame mouse movement; refreshed each `update()` call. */
  mouseDelta: MouseDelta;
  /** True while LMB is held and pointer is locked. */
  firing: boolean;
  /** One-frame edge: R pressed this update. */
  reloadPressed: boolean;
  /** One-frame edge: level hotkey this update. */
  levelSwitch: LevelId | null;
  /** True when document pointer lock target is the game canvas. */
  pointerLocked: boolean;
  /** One-frame edge: Space pressed this update. */
  jumpPressed: boolean;
}

export interface InputController {
  state: InputState;
  /** Call once per frame before reading state (swaps deltas / edges). */
  update: () => void;
  dispose: () => void;
}

/**
 * Keyboard + pointer-lock mouse look + fire for canvas `#game`.
 */
export function createInput(canvas: HTMLCanvasElement): InputController {
  const keys = new Set<string>();

  let accumMX = 0;
  let accumMY = 0;
  let pointerLocked = false;
  let mouseDown = false;

  let pendingReload = false;
  let pendingJump = false;
  let pendingLevel: LevelId | null = null;

  const state: InputState = {
    keys,
    mouseDelta: { x: 0, y: 0 },
    firing: false,
    reloadPressed: false,
    levelSwitch: null,
    pointerLocked: false,
    jumpPressed: false,
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) {
      keys.add(e.code);
      return;
    }
    keys.add(e.code);

    switch (e.code) {
      case "KeyR":
        pendingReload = true;
        break;
      case "Space":
        e.preventDefault();
        pendingJump = true;
        break;
      case "Digit1":
      case "Digit2":
      case "Digit3":
      case "Digit4":
      case "Digit5":
      case "Digit6":
      case "Digit7": {
        const next = LEVEL_BY_DIGIT[e.code];
        if (next) pendingLevel = next;
        break;
      }
      default:
        break;
    }
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    keys.delete(e.code);
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (!pointerLocked) return;
    accumMX += e.movementX;
    accumMY += e.movementY;
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (!pointerLocked) {
      void canvas.requestPointerLock();
      return;
    }
    mouseDown = true;
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    mouseDown = false;
  };

  const onPointerLockChange = (): void => {
    pointerLocked = document.pointerLockElement === canvas;
    if (!pointerLocked) {
      mouseDown = false;
    }
  };

  const onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  const onBlur = (): void => {
    keys.clear();
    mouseDown = false;
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("blur", onBlur);

  const update = (): void => {
    state.mouseDelta.x = accumMX;
    state.mouseDelta.y = accumMY;
    accumMX = 0;
    accumMY = 0;

    state.reloadPressed = pendingReload;
    pendingReload = false;

    state.jumpPressed = pendingJump;
    pendingJump = false;

    state.levelSwitch = pendingLevel;
    pendingLevel = null;

    state.pointerLocked = pointerLocked;
    state.firing = pointerLocked && mouseDown;
  };

  const dispose = (): void => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("blur", onBlur);
    keys.clear();
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };

  return { state, update, dispose };
}

/** Convenience: is a movement / action key held? */
export function isKeyDown(state: InputState, code: string): boolean {
  return state.keys.has(code);
}
