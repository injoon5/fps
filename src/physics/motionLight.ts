/**
 * Motion-driven specular lighting for Liquid Glass.
 *
 * Tracks pointer position and (when available) device orientation, then
 * smoothly follows with a spring so the highlight drifts like Apple glass.
 * Idle autodrama keeps specular alive when the user isn't moving.
 */

import { Spring, SpringPresets, clamp } from "./spring.ts";

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface MotionLightOptions {
  /** Base light direction before tilt (will be normalized). */
  baseLight?: Readonly<Vec3>;
  /** Max XY tilt from pointer (radians-ish scale on light xy). */
  pointerTilt?: number;
  /** Max tilt contribution from device orientation. */
  orientationTilt?: number;
  /** Autodrama amplitude when idle (subtle breathing). */
  autodramaAmp?: number;
  /** Autodrama frequency in Hz. */
  autodramaHz?: number;
  /** Seconds without input before full autodrama. */
  idleDelay?: number;
  /** Viewport size for pointer→UV (updated via setViewport). */
  viewport?: Vec2;
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Specular light director — pointer + gyroscope → smooth lightDir.
 */
export class MotionLight {
  /** Smoothed pointer in UV [0,1]² (origin bottom-left-ish; y up optional). */
  private pointerU = new Spring(0.5, SpringPresets.appleMorph);
  private pointerV = new Spring(0.5, SpringPresets.appleMorph);

  /** Orientation-derived tilt springs (radians → light bias). */
  private orientX = new Spring(0, SpringPresets.appleMorph);
  private orientY = new Spring(0, SpringPresets.appleMorph);

  private baseLight: Vec3;
  private pointerTilt: number;
  private orientationTilt: number;
  private autodramaAmp: number;
  private autodramaHz: number;
  private idleDelay: number;

  private viewport: Vec2 = [1, 1];
  private time = 0;
  private idleTimer = 0;
  private hasOrientation = false;

  /** EMA fallback blend (used lightly with springs for extra smoothness). */
  private emaLight: Vec3;

  constructor(options: MotionLightOptions = {}) {
    this.baseLight = normalize3(
      options.baseLight
        ? [options.baseLight[0], options.baseLight[1], options.baseLight[2]]
        : [0.35, 0.75, 0.55],
    );
    this.pointerTilt = options.pointerTilt ?? 0.28;
    this.orientationTilt = options.orientationTilt ?? 0.22;
    this.autodramaAmp = options.autodramaAmp ?? 0.045;
    this.autodramaHz = options.autodramaHz ?? 0.11;
    this.idleDelay = options.idleDelay ?? 1.4;
    this.emaLight = [...this.baseLight];

    if (options.viewport) {
      this.setViewport(options.viewport[0], options.viewport[1]);
    }

    // Slightly snappier follow than menu morph — specular should feel alive.
    const follow = SpringPresets.appleRelease;
    this.pointerU.applyConfig(follow);
    this.pointerV.applyConfig(follow);
    this.orientX.applyConfig(SpringPresets.appleMorph);
    this.orientY.applyConfig(SpringPresets.appleMorph);
  }

  setViewport(width: number, height: number): void {
    this.viewport = [Math.max(1, width), Math.max(1, height)];
  }

  setBaseLight(dir: Readonly<Vec3>): void {
    this.baseLight = normalize3([dir[0], dir[1], dir[2]]);
  }

  /**
   * Pointer move in CSS / canvas pixel coordinates (origin top-left).
   * Converts to UV with y flipped so +v is up (matches NDC-ish lighting).
   */
  onPointerMove(x: number, y: number): void {
    const u = clamp(x / this.viewport[0], 0, 1);
    const v = clamp(1 - y / this.viewport[1], 0, 1);
    this.pointerU.setTarget(u);
    this.pointerV.setTarget(v);
    this.idleTimer = 0;
  }

  /** Direct UV set (already normalized). */
  onPointerUV(u: number, v: number): void {
    this.pointerU.setTarget(clamp(u, 0, 1));
    this.pointerV.setTarget(clamp(v, 0, 1));
    this.idleTimer = 0;
  }

  /**
   * DeviceOrientationEvent handler. beta (front-back) / gamma (left-right)
   * in degrees. No-ops safely when values are null.
   */
  onDeviceOrientation(
    beta: number | null,
    gamma: number | null,
    _alpha?: number | null,
  ): void {
    if (beta === null || gamma === null) return;
    this.hasOrientation = true;
    // Map ±45° → ±1, soft clamp.
    const x = clamp(gamma / 45, -1, 1);
    const y = clamp(beta / 45, -1, 1);
    this.orientX.setTarget(x);
    this.orientY.setTarget(y);
    this.idleTimer = 0;
  }

  /** Whether orientation listeners have delivered at least one sample. */
  get orientationAvailable(): boolean {
    return this.hasOrientation;
  }

  /**
   * Advance springs + idle timer. Call once per frame.
   */
  update(dt: number): void {
    const t = Math.min(Math.max(dt, 0), 0.1);
    this.time += t;
    this.idleTimer += t;

    this.pointerU.tick(t);
    this.pointerV.tick(t);
    this.orientX.tick(t);
    this.orientY.tick(t);

    // EMA on final light for extra gel smoothness.
    const raw = this.computeLightRaw();
    const alpha = 1 - Math.exp(-12 * t);
    this.emaLight = [
      mix(this.emaLight[0], raw[0], alpha),
      mix(this.emaLight[1], raw[1], alpha),
      mix(this.emaLight[2], raw[2], alpha),
    ];
    this.emaLight = normalize3(this.emaLight);
  }

  /** Smoothed light direction (unit vector). */
  getLightDir(): Vec3 {
    return [this.emaLight[0], this.emaLight[1], this.emaLight[2]];
  }

  /** Smoothed pointer UV [u, v] in 0–1. */
  getPointerUV(): Vec2 {
    return [this.pointerU.value, this.pointerV.value];
  }

  /** Pointer in pixel space (origin top-left), matching canvas coords. */
  getPointerPx(): Vec2 {
    return [
      this.pointerU.value * this.viewport[0],
      (1 - this.pointerV.value) * this.viewport[1],
    ];
  }

  // ---------------------------------------------------------------------------

  private computeLightRaw(): Vec3 {
    const [u, v] = [this.pointerU.value, this.pointerV.value];
    // Pointer offset from center → tilt.
    const px = (u - 0.5) * 2;
    const py = (v - 0.5) * 2;

    let lx = this.baseLight[0] + px * this.pointerTilt;
    let ly = this.baseLight[1] + py * this.pointerTilt;
    let lz = this.baseLight[2];

    if (this.hasOrientation) {
      lx += this.orientX.value * this.orientationTilt;
      ly += this.orientY.value * this.orientationTilt;
    }

    // Idle autodrama — Apple glass specular never sits perfectly still.
    const idleBlend = clamp(
      (this.idleTimer - this.idleDelay) / 1.2,
      0,
      1,
    );
    if (idleBlend > 0 && this.autodramaAmp > 0) {
      const w = this.time * this.autodramaHz * Math.PI * 2;
      // Two incommensurate frequencies → organic drift, not a circle.
      const ax =
        Math.sin(w) * 0.65 + Math.sin(w * 0.37 + 1.1) * 0.35;
      const ay =
        Math.cos(w * 0.81 + 0.4) * 0.55 + Math.sin(w * 1.17) * 0.45;
      const amp = this.autodramaAmp * idleBlend;
      lx += ax * amp;
      ly += ay * amp;
    }

    // Keep Z dominant so the highlight stays on the front face.
    lz = Math.max(lz, 0.35);
    return normalize3([lx, ly, lz]);
  }
}

/**
 * Attach window deviceorientation → MotionLight when the API exists.
 * Returns an unsubscribe function. Requires a user gesture on iOS.
 */
export function bindDeviceOrientation(light: MotionLight): () => void {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    return () => undefined;
  }

  const handler = (ev: DeviceOrientationEvent) => {
    light.onDeviceOrientation(ev.beta, ev.gamma, ev.alpha);
  };

  window.addEventListener("deviceorientation", handler);
  return () => window.removeEventListener("deviceorientation", handler);
}
