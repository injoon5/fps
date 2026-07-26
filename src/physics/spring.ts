/**
 * Critically-damped / underdamped spring solver for Apple Liquid Glass motion.
 *
 * Integration: semi-implicit (symplectic) Euler — stable for the stiffness
 * ranges UIKit / SwiftUI springs use, with an optional exact analytic step
 * for large dt (e.g. tab resume) via `tickExact`.
 *
 * Presets map to iOS 26 glass feel:
 *   applePress       — instant touch squash (~0.96)
 *   appleRelease     — bouncy settle after lift
 *   appleMorph       — continuous button→menu shared-container morph
 *   appleMaterialize — gel appear / dissolve (lensing, not opacity)
 */

export interface SpringConfig {
  /** Spring constant k (force = −k · x). Higher = snappier. */
  stiffness: number;
  /** Linear damping c (force = −c · v). */
  damping: number;
  /** Optional rest / settle epsilon. */
  precision?: number;
}

export interface SpringState {
  value: number;
  velocity: number;
  target: number;
}

/** Clamp helper used by presets and GlassBody. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Build stiffness / damping from Apple-style response + damping ratio.
 * Mirrors SwiftUI `Spring(response:dampingFraction:)`:
 *   ω = 2π / response
 *   k = ω²
 *   c = 2 ζω
 */
export function springFromResponse(
  response: number,
  dampingFraction: number,
  precision = 0.0005,
): SpringConfig {
  const safeResponse = Math.max(response, 0.001);
  const omega = (2 * Math.PI) / safeResponse;
  return {
    stiffness: omega * omega,
    damping: 2 * dampingFraction * omega,
    precision,
  };
}

/** Damping ratio ζ = c / (2√k). ζ < 1 underdamped, = 1 critical, > 1 over. */
export function dampingRatio(stiffness: number, damping: number): number {
  const omega = Math.sqrt(Math.max(stiffness, 1e-12));
  return damping / (2 * omega);
}

/**
 * Single-DOF spring with mutable target / value / velocity.
 * Semi-implicit Euler by default; `tickExact` for analytic integration.
 */
export class Spring {
  target: number;
  value: number;
  velocity: number;
  stiffness: number;
  damping: number;
  precision: number;

  constructor(
    initial = 0,
    config: SpringConfig = SpringPresets.appleRelease,
  ) {
    this.value = initial;
    this.target = initial;
    this.velocity = 0;
    this.stiffness = config.stiffness;
    this.damping = config.damping;
    this.precision = config.precision ?? 0.0005;
  }

  /** Copy config (presets) onto this spring without touching value. */
  applyConfig(config: SpringConfig): this {
    this.stiffness = config.stiffness;
    this.damping = config.damping;
    if (config.precision !== undefined) {
      this.precision = config.precision;
    }
    return this;
  }

  setTarget(target: number): this {
    this.target = target;
    return this;
  }

  /** Snap immediately — used for first layout / hard resets. */
  snap(value: number, target: number = value): this {
    this.value = value;
    this.target = target;
    this.velocity = 0;
    return this;
  }

  /** Impulse for gel flex (e.g. press kick). */
  impulse(deltaV: number): this {
    this.velocity += deltaV;
    return this;
  }

  get settled(): boolean {
    const dx = this.value - this.target;
    return (
      Math.abs(dx) < this.precision &&
      Math.abs(this.velocity) < this.precision
    );
  }

  /**
   * Semi-implicit Euler:
   *   a = −k (x − target) − c v
   *   v ← v + a Δt
   *   x ← x + v Δt
   * Substeps when dt is large so high-k press springs stay stable.
   */
  tick(dt: number): number {
    if (dt <= 0) return this.value;
    if (this.settled) {
      this.value = this.target;
      this.velocity = 0;
      return this.value;
    }

    // Cap single step; subdivide long frames (background tab, hitch).
    const maxStep = 1 / 120;
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-8) {
      const step = Math.min(remaining, maxStep);
      const x = this.value - this.target;
      const accel = -this.stiffness * x - this.damping * this.velocity;
      this.velocity += accel * step;
      this.value += this.velocity * step;
      remaining -= step;
    }

    if (this.settled) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }

  /**
   * Exact analytic step for the linear damped harmonic oscillator.
   * Prefer for large dt or when frame hitch would otherwise overshoot.
   */
  tickExact(dt: number): number {
    if (dt <= 0) return this.value;
    const k = this.stiffness;
    const c = this.damping;
    if (k <= 1e-12) {
      // Pure damping toward target.
      const decay = Math.exp(-c * dt);
      const x = this.value - this.target;
      this.value = this.target + x * decay;
      this.velocity *= decay;
      return this.value;
    }

    const omega = Math.sqrt(k);
    const zeta = c / (2 * omega);
    const x0 = this.value - this.target;
    const v0 = this.velocity;

    if (Math.abs(zeta - 1) < 1e-4) {
      // Critically damped: (A + B t) e^(−ω t)
      const A = x0;
      const B = v0 + omega * x0;
      const e = Math.exp(-omega * dt);
      this.value = this.target + (A + B * dt) * e;
      this.velocity = (B * (1 - omega * dt) - A * omega) * e;
    } else if (zeta < 1) {
      // Underdamped: e^(−ζωt) (A cos ωd t + B sin ωd t)
      const wd = omega * Math.sqrt(1 - zeta * zeta);
      const A = x0;
      const B = (v0 + zeta * omega * x0) / wd;
      const e = Math.exp(-zeta * omega * dt);
      const cos = Math.cos(wd * dt);
      const sin = Math.sin(wd * dt);
      this.value = this.target + e * (A * cos + B * sin);
      this.velocity =
        e *
        ((B * wd - A * zeta * omega) * cos -
          (A * wd + B * zeta * omega) * sin);
    } else {
      // Overdamped
      const wd = omega * Math.sqrt(zeta * zeta - 1);
      const r1 = -zeta * omega + wd;
      const r2 = -zeta * omega - wd;
      const denom = r2 - r1;
      const A = (v0 - r2 * x0) / denom;
      const B = x0 - A;
      const e1 = Math.exp(r1 * dt);
      const e2 = Math.exp(r2 * dt);
      this.value = this.target + A * e1 + B * e2;
      this.velocity = A * r1 * e1 + B * r2 * e2;
    }

    if (this.settled) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }
}

/**
 * Apple Liquid Glass spring presets.
 *
 * Tuned by feel against iOS glass buttons / menus:
 * - Press is near-critical and fast (gel flex, no mush).
 * - Release is underdamped so the surface rebounds past 1.0 briefly.
 * - Morph uses a longer response so size changes feel continuous
 *   (GlassEffectContainer shared morph).
 * - Materialize eases lensing strength in/out without opacity pops.
 */
export const SpringPresets = {
  /** Snappy scale-down on touch — target typically 0.96. */
  applePress: springFromResponse(0.22, 0.92, 0.0004),

  /** Bouncy settle after release — slight overshoot past rest. */
  appleRelease: springFromResponse(0.38, 0.68, 0.0004),

  /** Larger morphing menus / button→popover continuous reshape. */
  appleMorph: springFromResponse(0.55, 0.86, 0.0008),

  /** Materialize / dematerialize lensing ramp. */
  appleMaterialize: springFromResponse(0.48, 0.9, 0.0005),
} as const satisfies Record<string, SpringConfig>;

export type SpringPresetName = keyof typeof SpringPresets;

/** Convenience factory from a named preset. */
export function createSpring(
  initial = 0,
  preset: SpringPresetName | SpringConfig = "appleRelease",
): Spring {
  const config =
    typeof preset === "string" ? SpringPresets[preset] : preset;
  return new Spring(initial, config);
}
