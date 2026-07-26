/**
 * Animated state for a Liquid Glass element — gel position, size, press,
 * thickness, and materialize. All channels ride springs so button→menu morph
 * feels continuous (shared GlassEffectContainer).
 *
 * Thickness grows with size (Apple: larger glass = thicker optical material).
 */

import { thicknessForSize, type GlassVariant } from "../optics/refraction.ts";
import {
  Spring,
  SpringPresets,
  clamp,
  type SpringConfig,
} from "./spring.ts";

/** Axis-aligned glass rect in pixel space (center + full size). */
export interface GlassRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GlassBodyOptions {
  /** Initial rect (center x/y, full width/height). */
  rect?: GlassRect;
  /** Soft corner normal falloff (matches optical cornerN). */
  cornerN?: number;
  /** Glass variant — drives thickness-for-size curve. */
  variant?: GlassVariant;
  /** Start materialized (1) or hidden (0). */
  visible?: boolean;
  /** Rest scale when not pressed. */
  restScale?: number;
  /** Pressed scale target (~0.96 Apple button squash). */
  pressScale?: number;
  /** Override morph spring config. */
  morphSpring?: SpringConfig;
  /** Override materialize spring config. */
  materializeSpring?: SpringConfig;
}

const DEFAULT_RECT: GlassRect = { x: 0, y: 0, w: 120, h: 44 };

/**
 * Liquid glass body — one interactive surface with spring-driven geometry.
 */
export class GlassBody {
  readonly x: Spring;
  readonly y: Spring;
  readonly w: Spring;
  readonly h: Spring;
  readonly cornerN: Spring;
  readonly thickness: Spring;
  readonly scale: Spring;
  readonly materialize: Spring;
  /** Press amount 0–1 (spring). Method `press()` triggers interaction. */
  readonly pressAmount: Spring;

  /** Radiating touch shimmer phase 0→1 after press; advanced in update. */
  shimmerPhase = 0;

  /** Last press location in element-local UV [0,1]² (center = 0.5,0.5). */
  pressUV: [number, number] = [0.5, 0.5];

  /** Whether a finger/pointer is currently down. */
  private pressed = false;

  private variant: GlassVariant;
  private restScale: number;
  private pressScale: number;
  private pressConfig: SpringConfig;
  private releaseConfig: SpringConfig;
  private morphConfig: SpringConfig;

  /** Target corner exponent (animated via cornerN spring). */
  private cornerNTarget: number;

  constructor(options: GlassBodyOptions = {}) {
    const rect = options.rect ?? DEFAULT_RECT;
    this.variant = options.variant ?? "regular";
    this.restScale = options.restScale ?? 1;
    this.pressScale = options.pressScale ?? 0.96;
    this.cornerNTarget = options.cornerN ?? 1.8;

    this.morphConfig = options.morphSpring ?? SpringPresets.appleMorph;
    this.pressConfig = SpringPresets.applePress;
    this.releaseConfig = SpringPresets.appleRelease;
    const matConfig =
      options.materializeSpring ?? SpringPresets.appleMaterialize;

    const visible = options.visible ?? true;

    this.x = new Spring(rect.x, this.morphConfig);
    this.y = new Spring(rect.y, this.morphConfig);
    this.w = new Spring(rect.w, this.morphConfig);
    this.h = new Spring(rect.h, this.morphConfig);
    this.cornerN = new Spring(this.cornerNTarget, this.morphConfig);
    this.cornerN.setTarget(this.cornerNTarget);

    const thick = this.computeThickness(rect.w, rect.h);
    this.thickness = new Spring(thick, this.morphConfig);
    this.thickness.setTarget(thick);

    this.scale = new Spring(this.restScale, this.releaseConfig);
    this.scale.setTarget(this.restScale);

    this.pressAmount = new Spring(0, this.releaseConfig);
    this.pressAmount.setTarget(0);

    const m0 = visible ? 1 : 0;
    this.materialize = new Spring(m0, matConfig);
    this.materialize.setTarget(m0);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  get isPressed(): boolean {
    return this.pressed;
  }

  get isVisible(): boolean {
    return this.materialize.target > 0.5 || this.materialize.value > 0.01;
  }

  /** Current animated rect (unscaled). */
  get rect(): GlassRect {
    return {
      x: this.x.value,
      y: this.y.value,
      w: this.w.value,
      h: this.h.value,
    };
  }

  /** Half-size in px — matches shader `uGlassRect.zw`. */
  get halfSize(): [number, number] {
    return [this.w.value * 0.5, this.h.value * 0.5];
  }

  /** Center + half-size payload for `uGlassRect`. */
  get glassRectUniform(): [number, number, number, number] {
    const [hw, hh] = this.halfSize;
    const s = this.scale.value;
    return [this.x.value, this.y.value, hw * s, hh * s];
  }

  // ---------------------------------------------------------------------------
  // Targets / interaction
  // ---------------------------------------------------------------------------

  setVariant(variant: GlassVariant): void {
    this.variant = variant;
    this.syncThicknessTarget();
  }

  setCornerN(n: number): void {
    this.cornerNTarget = n;
    this.cornerN.applyConfig(this.morphConfig).setTarget(n);
  }

  /**
   * Retarget geometry without a full morph impulse — for drag follow /
   * continuous layout. Uses morph spring.
   */
  setTargetRect(rect: GlassRect, cornerN?: number): void {
    this.applyMorphTargets(rect, cornerN);
  }

  /**
   * Morph into a new size/position (button → menu). Same springs as
   * setTargetRect but intended for discrete shared-element transitions;
   * optional velocity kick keeps the gel feeling continuous.
   */
  morphTo(rect: GlassRect, cornerN?: number): void {
    this.applyMorphTargets(rect, cornerN);
    // Tiny coherent velocity so large jumps don't feel teleported.
    const kick = 0.15;
    this.w.impulse((rect.w - this.w.value) * kick);
    this.h.impulse((rect.h - this.h.value) * kick);
  }

  /** Instant layout snap (first frame / resize hard-reset). */
  snapTo(rect: GlassRect, cornerN?: number): void {
    if (cornerN !== undefined) {
      this.cornerNTarget = cornerN;
      this.cornerN.snap(cornerN);
    }
    this.x.snap(rect.x);
    this.y.snap(rect.y);
    this.w.snap(rect.w);
    this.h.snap(rect.h);
    const thick = this.computeThickness(rect.w, rect.h);
    this.thickness.snap(thick);
  }

  // ---------------------------------------------------------------------------
  // Press / release — instant response, gel flex
  // ---------------------------------------------------------------------------

  /**
   * Begin press. Optional local UV of the touch (0–1 in element space).
   * Switches scale spring to snappy applePress and kicks shimmer.
   */
  pressAt(localUV: readonly [number, number] = [0.5, 0.5]): void {
    this.pressUV = [
      clamp(localUV[0], 0, 1),
      clamp(localUV[1], 0, 1),
    ];
    this.pressed = true;
    this.shimmerPhase = 0;

    this.scale.applyConfig(this.pressConfig).setTarget(this.pressScale);
    this.pressAmount.applyConfig(this.pressConfig).setTarget(1);
    // Instant gel response — small inward velocity so squash isn't delayed.
    this.scale.impulse(-1.8);
    this.pressAmount.impulse(6);
  }

  /** Begin press (task API). Optional local UV of the contact point. */
  press(localUV?: readonly [number, number]): void {
    this.pressAt(localUV ?? this.pressUV);
  }

  /** Lift — bouncy settle back to rest scale. */
  release(): void {
    if (!this.pressed && this.pressAmount.target === 0) return;
    this.pressed = false;
    this.scale.applyConfig(this.releaseConfig).setTarget(this.restScale);
    this.pressAmount.applyConfig(this.releaseConfig).setTarget(0);
    // Rebound kick — Apple buttons overshoot slightly past 1.0.
    this.scale.impulse(1.2);
  }

  // ---------------------------------------------------------------------------
  // Materialize
  // ---------------------------------------------------------------------------

  show(): void {
    this.materialize
      .applyConfig(SpringPresets.appleMaterialize)
      .setTarget(1);
  }

  hide(): void {
    this.materialize
      .applyConfig(SpringPresets.appleMaterialize)
      .setTarget(0);
    if (this.pressed) this.release();
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  /**
   * Advance all springs. `dt` in seconds.
   * Shimmer phase runs while pressed or during the post-press ring expand.
   */
  update(dt: number): void {
    const t = Math.min(Math.max(dt, 0), 0.1);

    this.x.tick(t);
    this.y.tick(t);
    this.w.tick(t);
    this.h.tick(t);
    this.cornerN.tick(t);
    this.thickness.tick(t);
    this.scale.tick(t);
    this.pressAmount.tick(t);
    this.materialize.tick(t);

    // Keep thickness chasing live size (morph mid-flight).
    this.syncThicknessTarget();

    // Shimmer: quick rise on press, then ring expands / fades on hold+release.
    if (this.pressed || this.pressAmount.value > 0.02 || this.shimmerPhase < 1) {
      const speed = this.pressed ? 2.8 : 1.6;
      this.shimmerPhase = clamp(this.shimmerPhase + t * speed, 0, 1);
    }
  }

  /** Snapshot of values useful for uploading uniforms. */
  toUniforms(): {
    glassRect: [number, number, number, number];
    cornerN: number;
    thickness: number;
    scale: number;
    materialize: number;
    press: number;
    shimmerPhase: number;
    pressUV: [number, number];
  } {
    return {
      glassRect: this.glassRectUniform,
      cornerN: this.cornerN.value,
      thickness: this.thickness.value,
      scale: this.scale.value,
      materialize: this.materialize.value,
      press: this.pressAmount.value,
      shimmerPhase: this.shimmerPhase,
      pressUV: [this.pressUV[0], this.pressUV[1]],
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private applyMorphTargets(rect: GlassRect, cornerN?: number): void {
    const cfg = this.morphConfig;
    this.x.applyConfig(cfg).setTarget(rect.x);
    this.y.applyConfig(cfg).setTarget(rect.y);
    this.w.applyConfig(cfg).setTarget(Math.max(1, rect.w));
    this.h.applyConfig(cfg).setTarget(Math.max(1, rect.h));
    if (cornerN !== undefined) {
      this.cornerNTarget = cornerN;
      this.cornerN.applyConfig(cfg).setTarget(cornerN);
    }
    this.syncThicknessTarget();
  }

  private syncThicknessTarget(): void {
    const tw = Math.max(this.w.target, 1);
    const th = Math.max(this.h.target, 1);
    const thick = this.computeThickness(tw, th);
    this.thickness.applyConfig(this.morphConfig).setTarget(thick);
  }

  /**
   * Apple: larger morphing surfaces get thicker material.
   * Uses shorter half-extent so buttons stay thin and menus thicken.
   */
  private computeThickness(fullW: number, fullH: number): number {
    const shorterHalf = Math.min(fullW, fullH) * 0.5;
    return thicknessForSize(shorterHalf, this.variant);
  }
}
