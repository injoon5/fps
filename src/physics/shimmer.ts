/**
 * Touch-point shimmer for interactive Liquid Glass.
 *
 * On press, a radial highlight blooms at the contact point and expands
 * outward like Apple's interactive glass illumination — a soft ring that
 * radiates then settles with the press spring.
 */

import { clamp } from "./spring.ts";

export interface ShimmerUniforms {
  /** Center in element-local UV [0,1]². */
  shimmerCenter: [number, number];
  /** Peak intensity 0–1. */
  shimmerStrength: number;
  /** Ring radius in UV units (0 ≈ point, ~0.7 ≈ near full element). */
  shimmerRadius: number;
}

export interface ShimmerOptions {
  /** Peak strength at press onset. */
  peakStrength?: number;
  /** How fast the ring expands (UV units / sec). */
  expandSpeed?: number;
  /** Max ring radius in local UV. */
  maxRadius?: number;
  /** Fade duration after release (seconds). */
  fadeDuration?: number;
  /** Ring soft width as a fraction of radius (for shader falloff cue). */
  ringWidth?: number;
}

/**
 * Radiating press illumination driven by press location + phase.
 */
export class Shimmer {
  center: [number, number] = [0.5, 0.5];
  strength = 0;
  radius = 0;

  private peakStrength: number;
  private expandSpeed: number;
  private maxRadius: number;
  private fadeDuration: number;
  private ringWidth: number;

  private active = false;
  private releasing = false;
  private age = 0;
  private releaseAge = 0;
  private strengthAtRelease = 0;

  constructor(options: ShimmerOptions = {}) {
    this.peakStrength = options.peakStrength ?? 0.85;
    this.expandSpeed = options.expandSpeed ?? 1.35;
    this.maxRadius = options.maxRadius ?? 0.72;
    this.fadeDuration = options.fadeDuration ?? 0.55;
    this.ringWidth = options.ringWidth ?? 0.22;
  }

  /**
   * Fire shimmer at a local UV (0–1 in glass element space).
   * Call from GlassBody.press / pointer down.
   */
  trigger(localUV: readonly [number, number] = [0.5, 0.5]): void {
    this.center = [
      clamp(localUV[0], 0, 1),
      clamp(localUV[1], 0, 1),
    ];
    this.active = true;
    this.releasing = false;
    this.age = 0;
    this.releaseAge = 0;
    this.radius = 0.02;
    this.strength = this.peakStrength;
    this.strengthAtRelease = this.peakStrength;
  }

  /** Begin fade — call on pointer up. Ring may keep expanding while fading. */
  release(): void {
    if (!this.active && this.strength <= 0) return;
    this.releasing = true;
    this.releaseAge = 0;
    this.strengthAtRelease = this.strength;
  }

  /**
   * Drive from an external phase (e.g. GlassBody.shimmerPhase) and press
   * amount. Useful when GlassBody owns timing.
   *
   * @param centerUV  press location
   * @param phase     0→1 expand progress
   * @param press     0→1 press spring value (boosts strength while held)
   */
  syncFromPress(
    centerUV: readonly [number, number],
    phase: number,
    press: number,
  ): void {
    this.center = [
      clamp(centerUV[0], 0, 1),
      clamp(centerUV[1], 0, 1),
    ];
    const p = clamp(phase, 0, 1);
    // Ease-out expand so the ring races then softens.
    const eased = 1 - (1 - p) * (1 - p);
    this.radius = mix(0.04, this.maxRadius, eased);

    // Strength: strong at onset, holds with press, decays as phase completes.
    const envelope = Math.sin(Math.min(p, 1) * Math.PI);
    const held = clamp(press, 0, 1);
    this.strength = this.peakStrength * mix(envelope, 1, held * 0.55) *
      mix(1, 0.35, eased * (1 - held));
    this.active = this.strength > 0.01;
    this.releasing = held < 0.05 && p > 0.2;
  }

  /** Advance self-timed shimmer (when not using syncFromPress). */
  update(dt: number): void {
    if (!this.active && this.strength <= 0) {
      this.strength = 0;
      this.radius = 0;
      return;
    }

    const t = Math.min(Math.max(dt, 0), 0.1);
    this.age += t;

    // Expand ring while active.
    this.radius = clamp(
      this.radius + this.expandSpeed * t,
      0,
      this.maxRadius,
    );

    if (this.releasing) {
      this.releaseAge += t;
      const fade = clamp(1 - this.releaseAge / this.fadeDuration, 0, 1);
      // Smoothstep fade.
      const s = fade * fade * (3 - 2 * fade);
      this.strength = this.strengthAtRelease * s;
      if (fade <= 0) {
        this.active = false;
        this.releasing = false;
        this.strength = 0;
      }
    } else if (this.active) {
      // While held: slight decay from peak so it doesn't blow out.
      const sustain = 0.55 + 0.45 * Math.exp(-this.age * 1.8);
      this.strength = this.peakStrength * sustain;
    }
  }

  /** Uniform payload for the fragment shader. */
  getUniforms(): ShimmerUniforms {
    return {
      shimmerCenter: [this.center[0], this.center[1]],
      shimmerStrength: this.strength,
      shimmerRadius: this.radius,
    };
  }

  /** Soft ring width hint (UV) for shader falloff. */
  get ringSoftness(): number {
    return Math.max(this.radius * this.ringWidth, 0.04);
  }

  /**
   * Evaluate radial highlight falloff at a local UV — useful for CPU previews.
   * Returns 0–1 illumination.
   */
  sample(localUV: readonly [number, number]): number {
    if (this.strength <= 0.001) return 0;
    const dx = localUV[0] - this.center[0];
    const dy = localUV[1] - this.center[1];
    const d = Math.hypot(dx, dy);
    const soft = this.ringSoftness;
    // Expanding ring: peak near radius, soft interior fill.
    const ring = 1 - clamp(Math.abs(d - this.radius) / soft, 0, 1);
    const fill = 1 - clamp(d / Math.max(this.radius, 1e-3), 0, 1);
    const raw = Math.max(ring, fill * 0.35);
    const shaped = raw * raw * (3 - 2 * raw);
    return shaped * this.strength;
  }
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * One-shot helper: build shimmer uniforms from GlassBody-like state
 * without owning a Shimmer instance.
 */
export function shimmerUniformsFromPress(state: {
  pressUV: readonly [number, number];
  shimmerPhase: number;
  press: number;
  peakStrength?: number;
  maxRadius?: number;
}): ShimmerUniforms {
  const shimmer = new Shimmer({
    peakStrength: state.peakStrength,
    maxRadius: state.maxRadius,
  });
  shimmer.syncFromPress(state.pressUV, state.shimmerPhase, state.press);
  return shimmer.getUniforms();
}
