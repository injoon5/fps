/**
 * Liquid Glass WebGL2 renderer — fullscreen optical pass over a background.
 *
 * Each frame: physics dt → optical + lighting + body + motion (+ shimmer sync)
 * → set EVERY fragment uniform → draw fullscreen triangle.
 *
 * Pixel space matches the frag: `fragPx = vUv * uResolution` (GL y-up).
 * GlassBody / pointer use CSS top-left → convert with dpr + Y flip on upload.
 */

import { liquidGlassFragSource } from "../shaders/liquidGlass.frag.ts";
import { liquidGlassVertSource } from "../shaders/liquidGlass.vert.ts";
import {
  resolveOpticalUniforms,
  type GlassVariant,
} from "../optics/refraction.ts";
import { resolveLightingUniforms } from "../optics/lighting.ts";
import { GlassBody, type GlassRect } from "../physics/glassBody.ts";
import {
  MotionLight,
  bindDeviceOrientation,
} from "../physics/motionLight.ts";
import { Shimmer } from "../physics/shimmer.ts";
import { BackgroundTexture } from "./background.ts";
import {
  checkGLError,
  createColorFBO,
  createFullscreenTriangleVAO,
  createGL,
  createProgram,
  getUniformLocations,
  resizeCanvasToDisplaySize,
  resizeColorFBO,
  type GL,
} from "./gl.ts";

/** All fragment uniforms — keep in sync with liquidGlass.frag.ts. */
const UNIFORM_NAMES = [
  "uBackground",
  "uResolution",
  "uGlassRect",
  "uCornerN",
  "uBevel",
  "uIOR",
  "uDispersion",
  "uBlur",
  "uThickness",
  "uLightDir",
  "uTime",
  "uPointer",
  "uMaterialize",
  "uTint",
  "uVariant",
  "uDeviceTilt",
  "uKeyDir",
  "uKeyColor",
  "uFillDir",
  "uFillColor",
  "uRimDir",
  "uRimColor",
  "uRoughness",
  "uSpecularIntensity",
  "uRimStrength",
  "uEnvStrength",
  "uEnvSpread",
  "uCausticAmount",
  "uShadowBase",
  "uShadowBlurPx",
  "uShadowOffsetPx",
] as const;

interface GlassEntry {
  id: string;
  body: GlassBody;
  label: string;
}

let glassIdSeq = 0;

/**
 * Draws Apple-like Liquid Glass over a background texture.
 */
export class LiquidGlassRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: GL;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uniforms: Record<string, WebGLUniformLocation | null>;
  private background: BackgroundTexture;

  private glasses = new Map<string, GlassEntry>();
  private primaryId: string | null = null;

  private motionLight: MotionLight;
  private shimmer: Shimmer;
  private unbindOrientation: (() => void) | null = null;

  private variant: GlassVariant = "regular";
  /** Optional IOR override (undefined → variant default from optics). */
  private iorOverride: number | undefined;
  private running = false;
  private raf = 0;
  private lastTime = 0;
  private time = 0;
  private disposed = false;

  /** Ping-pong FBOs when compositing multiple glass bodies. */
  private fboA: ReturnType<typeof createColorFBO> | null = null;
  private fboB: ReturnType<typeof createColorFBO> | null = null;

  private pointerDown = false;
  private dragOffset: [number, number] = [0, 0];
  private dragId: string | null = null;
  private dragMoved = false;
  private dragOrigin: [number, number] = [0, 0];
  /** Fired on pointer-up when a glass was pressed without meaningful drag. */
  private glassTapHandler: ((id: string, body: GlassBody) => void) | null =
    null;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerLeave: (e: PointerEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = createGL(canvas);
    this.program = createProgram(
      this.gl,
      liquidGlassVertSource,
      liquidGlassFragSource,
    );
    this.vao = createFullscreenTriangleVAO(this.gl);
    this.uniforms = getUniformLocations(this.gl, this.program, UNIFORM_NAMES);
    this.background = new BackgroundTexture(this.gl);

    const css = this.cssSize();
    this.motionLight = new MotionLight({ viewport: [css.w, css.h] });
    this.shimmer = new Shimmer();

    // Default primary glass centered in the canvas.
    const primary = new GlassBody({
      rect: {
        x: css.w * 0.5,
        y: css.h * 0.5,
        w: Math.min(280, css.w * 0.42),
        h: Math.min(160, css.h * 0.22),
      },
      variant: this.variant,
      visible: true,
    });
    this.primaryId = this.addGlass(primary, "primary");

    // Procedural wallpaper so refraction has structure immediately.
    this.ensureDrawingBuffer();
    this.background.setProcedural(
      this.canvas.width || 800,
      this.canvas.height || 600,
    );

    this.boundPointerDown = (e) => this.onPointerDown(e);
    this.boundPointerMove = (e) => this.onPointerMove(e);
    this.boundPointerUp = (e) => this.onPointerUp(e);
    this.boundPointerLeave = (e) => this.onPointerUp(e);

    canvas.addEventListener("pointerdown", this.boundPointerDown);
    canvas.addEventListener("pointermove", this.boundPointerMove);
    canvas.addEventListener("pointerup", this.boundPointerUp);
    canvas.addEventListener("pointercancel", this.boundPointerUp);
    canvas.addEventListener("pointerleave", this.boundPointerLeave);
    canvas.style.touchAction = "none";

    if (typeof window !== "undefined") {
      this.unbindOrientation = bindDeviceOrientation(this.motionLight);
    }

    checkGLError(this.gl, "LiquidGlassRenderer.init");
  }

  // ---------------------------------------------------------------------------
  // Background
  // ---------------------------------------------------------------------------

  async setBackgroundFromUrl(url: string): Promise<void> {
    this.assertAlive();
    await this.background.setFromUrl(url);
  }

  setBackgroundFromCanvas(
    source: HTMLCanvasElement | HTMLImageElement,
  ): void {
    this.assertAlive();
    this.background.setFromSource(source, true);
  }

  /** Replace backdrop with a fresh procedural wallpaper at current buffer size. */
  useProceduralBackground(): void {
    this.assertAlive();
    this.ensureDrawingBuffer();
    this.background.setProcedural(this.canvas.width, this.canvas.height);
  }

  getBackground(): BackgroundTexture {
    return this.background;
  }

  // ---------------------------------------------------------------------------
  // Variant / glass management
  // ---------------------------------------------------------------------------

  setVariant(variant: "regular" | "clear"): void {
    this.variant = variant;
    for (const entry of this.glasses.values()) {
      entry.body.setVariant(variant);
    }
  }

  getVariant(): GlassVariant {
    return this.variant;
  }

  /** Current IOR (override if set, else variant optical default). */
  getIOR(): number {
    if (this.iorOverride !== undefined) return this.iorOverride;
    return this.variant === "clear" ? 1.5 : 1.48;
  }

  /** Override index of refraction (clamped to optical range). */
  setIOR(ior: number): void {
    const lo = 1.45;
    const hi = 1.52;
    this.iorOverride = Math.min(hi, Math.max(lo, ior));
  }

  addGlass(body: GlassBody, label = "glass"): string {
    this.assertAlive();
    body.setVariant(this.variant);
    const id = `glass-${++glassIdSeq}-${label}`;
    this.glasses.set(id, { id, body, label });
    if (this.primaryId === null) {
      this.primaryId = id;
    }
    return id;
  }

  removeGlass(id: string): void {
    if (!this.glasses.delete(id)) return;
    if (this.primaryId === id) {
      const next = this.glasses.keys().next();
      this.primaryId = next.done ? null : (next.value ?? null);
    }
  }

  getPrimary(): GlassBody | null {
    if (!this.primaryId) return null;
    return this.glasses.get(this.primaryId)?.body ?? null;
  }

  setPrimary(id: string): void {
    if (!this.glasses.has(id)) {
      throw new Error(`Unknown glass id: ${id}`);
    }
    this.primaryId = id;
  }

  getGlass(id: string): GlassBody | undefined {
    return this.glasses.get(id)?.body;
  }

  listGlasses(): ReadonlyArray<{ id: string; label: string; body: GlassBody }> {
    return [...this.glasses.values()].map(({ id, label, body }) => ({
      id,
      label,
      body,
    }));
  }

  getMotionLight(): MotionLight {
    return this.motionLight;
  }

  getShimmer(): Shimmer {
    return this.shimmer;
  }

  /** Register a tap handler (press + release without drag). */
  onGlassTap(handler: ((id: string, body: GlassBody) => void) | null): void {
    this.glassTapHandler = handler;
  }

  // ---------------------------------------------------------------------------
  // Public interaction helpers (keyboard / buttons)
  // ---------------------------------------------------------------------------

  morphPrimaryTo(rect: GlassRect, cornerN?: number): void {
    this.getPrimary()?.morphTo(rect, cornerN);
  }

  setPrimaryTargetRect(rect: GlassRect, cornerN?: number): void {
    this.getPrimary()?.setTargetRect(rect, cornerN);
  }

  snapPrimaryTo(rect: GlassRect, cornerN?: number): void {
    this.getPrimary()?.snapTo(rect, cornerN);
  }

  pressPrimary(localUV?: readonly [number, number]): void {
    const body = this.getPrimary();
    if (!body) return;
    body.press(localUV);
    this.shimmer.trigger(localUV ?? body.pressUV);
  }

  releasePrimary(): void {
    this.getPrimary()?.release();
    this.shimmer.release();
  }

  showPrimary(): void {
    this.getPrimary()?.show();
  }

  hidePrimary(): void {
    this.getPrimary()?.hide();
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  start(): void {
    this.assertAlive();
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  /** Render a single frame (visual tests / stills). Advances physics by ~1/60s. */
  renderFrame(): void {
    this.assertAlive();
    this.frame(1 / 60);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();

    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    this.canvas.removeEventListener("pointermove", this.boundPointerMove);
    this.canvas.removeEventListener("pointerup", this.boundPointerUp);
    this.canvas.removeEventListener("pointercancel", this.boundPointerUp);
    this.canvas.removeEventListener("pointerleave", this.boundPointerLeave);
    this.unbindOrientation?.();
    this.unbindOrientation = null;

    this.background.dispose();
    const gl = this.gl;
    if (this.fboA) {
      gl.deleteFramebuffer(this.fboA.fbo);
      gl.deleteTexture(this.fboA.texture);
      this.fboA = null;
    }
    if (this.fboB) {
      gl.deleteFramebuffer(this.fboB.fbo);
      gl.deleteTexture(this.fboB.texture);
      this.fboB = null;
    }
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    this.glasses.clear();
    this.primaryId = null;
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  private frame(dt: number): void {
    this.ensureDrawingBuffer();
    const css = this.cssSize();
    this.motionLight.setViewport(css.w, css.h);

    this.time += dt;
    this.motionLight.update(dt);

    for (const entry of this.glasses.values()) {
      entry.body.update(dt);
    }

    const primary = this.getPrimary();
    if (primary) {
      const u = primary.toUniforms();
      this.shimmer.syncFromPress(u.pressUV, u.shimmerPhase, u.press);
    } else {
      this.shimmer.update(dt);
    }

    const entries = [...this.glasses.values()].filter(
      (e) => e.body.materialize.value > 0.001 || e.body.isVisible,
    );

    // Sort primary last so extras sit underneath when multi-pass compositing.
    entries.sort((a, b) => {
      if (a.id === this.primaryId) return 1;
      if (b.id === this.primaryId) return -1;
      return 0;
    });

    if (entries.length === 0) {
      this.blitBackgroundOnly();
      return;
    }

    if (entries.length === 1) {
      const only = entries[0];
      if (!only) return;
      this.drawGlassPass(only.body, this.background.texture, null);
      return;
    }

    this.ensureFBOs(this.canvas.width, this.canvas.height);
    if (!this.fboA || !this.fboB) return;

    let readTex = this.background.texture;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;
      const isLast = i === entries.length - 1;
      const write = i % 2 === 0 ? this.fboA : this.fboB;
      this.drawGlassPass(entry.body, readTex, isLast ? null : write);
      if (!isLast) {
        readTex = write.texture;
      }
    }
  }

  private blitBackgroundOnly(): void {
    // Frag always composites glass; force a fully dematerialized stub so the
    // background passes through unchanged (no glasses registered / all hidden).
    const stub = new GlassBody({
      rect: { x: -1e6, y: -1e6, w: 1, h: 1 },
      visible: false,
    });
    stub.materialize.snap(0);
    this.drawGlassPass(stub, this.background.texture, null);
  }

  /**
   * One fullscreen optical pass.
   * @param sourceTex  background (or prior composite)
   * @param target     null → default framebuffer; else color FBO
   */
  private drawGlassPass(
    body: GlassBody,
    sourceTex: WebGLTexture,
    target: ReturnType<typeof createColorFBO> | null,
  ): void {
    const gl = this.gl;
    const dpr = this.devicePixelRatio();
    const bufW = this.canvas.width;
    const bufH = this.canvas.height;
    const resolution: [number, number] = [bufW, bufH];

    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, bufW, bufH);

    const bodyU = body.toUniforms();
    // glassRectUniform is CSS px (center + half-size). Convert to device px, Y-flip.
    const [cxCss, cyCss, hwCss, hhCss] = bodyU.glassRect;
    const glassRect: [number, number, number, number] = [
      cxCss * dpr,
      bufH - cyCss * dpr,
      hwCss * dpr,
      hhCss * dpr,
    ];

    const optical = resolveOpticalUniforms({
      variant: this.variant,
      halfSizePx: [hwCss, hhCss],
      resolution,
      materialize: bodyU.materialize,
      overrides: {
        thickness: bodyU.thickness,
        cornerN: bodyU.cornerN,
        ...(this.iorOverride !== undefined ? { ior: this.iorOverride } : {}),
      },
    });

    // Device tilt from motion pointer UV (and orientation already in MotionLight).
    const [pu, pv] = this.motionLight.getPointerUV();
    const deviceTilt: [number, number] = [(pu - 0.5) * 2, (pv - 0.5) * 2];

    const lighting = resolveLightingUniforms({
      variant: this.variant,
      deviceTilt,
    });

    const lightDir = this.motionLight.getLightDir();
    const [ptrXCss, ptrYCss] = this.motionLight.getPointerPx();
    const pointerPx: [number, number] = [
      ptrXCss * dpr,
      bufH - ptrYCss * dpr,
    ];

    // Blur: optics blurPx → UV via / min(width, height). Scale px by dpr so
    // frost radius tracks CSS intent in device framebuffer space.
    const minDim = Math.max(1, Math.min(bufW, bufH));
    const blurUv = (optical.blurPx * dpr) / minDim;

    // Shadow blur / offset are CSS px in lighting helpers → device px + Y flip.
    const shadowBlurPx = lighting.shadowBlurPx * dpr;
    const shadowOffsetPx: [number, number] = [
      lighting.shadowOffsetPx[0] * dpr,
      -lighting.shadowOffsetPx[1] * dpr,
    ];
    const bevelPx = optical.bevelPx * dpr;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    this.set1i("uBackground", 0);

    this.set2f("uResolution", resolution[0], resolution[1]);
    this.set4f(
      "uGlassRect",
      glassRect[0],
      glassRect[1],
      glassRect[2],
      glassRect[3],
    );
    this.set1f("uCornerN", optical.cornerN);
    this.set1f("uBevel", bevelPx);
    this.set1f("uIOR", optical.ior);
    this.set1f("uDispersion", optical.dispersion);
    this.set1f("uBlur", blurUv);
    this.set1f("uThickness", optical.thickness);
    this.set3f("uLightDir", lightDir[0], lightDir[1], lightDir[2]);
    this.set1f("uTime", this.time);
    this.set2f("uPointer", pointerPx[0], pointerPx[1]);
    this.set1f("uMaterialize", optical.materialize);
    this.set4f(
      "uTint",
      optical.tint[0],
      optical.tint[1],
      optical.tint[2],
      optical.tint[3],
    );
    this.set1f("uVariant", optical.variant);

    this.set2f("uDeviceTilt", lighting.deviceTilt[0], lighting.deviceTilt[1]);
    this.set3f("uKeyDir", lighting.keyDir[0], lighting.keyDir[1], lighting.keyDir[2]);
    this.set3f(
      "uKeyColor",
      lighting.keyColor[0],
      lighting.keyColor[1],
      lighting.keyColor[2],
    );
    this.set3f("uFillDir", lighting.fillDir[0], lighting.fillDir[1], lighting.fillDir[2]);
    this.set3f(
      "uFillColor",
      lighting.fillColor[0],
      lighting.fillColor[1],
      lighting.fillColor[2],
    );
    this.set3f("uRimDir", lighting.rimDir[0], lighting.rimDir[1], lighting.rimDir[2]);
    this.set3f(
      "uRimColor",
      lighting.rimColor[0],
      lighting.rimColor[1],
      lighting.rimColor[2],
    );
    this.set1f("uRoughness", lighting.roughness);
    this.set1f("uSpecularIntensity", lighting.specularIntensity);
    this.set1f("uRimStrength", lighting.rimStrength);
    this.set1f("uEnvStrength", lighting.envStrength);
    this.set1f("uEnvSpread", lighting.envSpread);
    this.set1f("uCausticAmount", lighting.causticAmount);

    this.set1f("uShadowBase", lighting.shadowBase);
    this.set1f("uShadowBlurPx", shadowBlurPx);
    this.set2f("uShadowOffsetPx", shadowOffsetPx[0], shadowOffsetPx[1]);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  // ---------------------------------------------------------------------------
  // Pointer
  // ---------------------------------------------------------------------------

  private canvasCssPoint(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  /** Topmost glass under CSS point, or null. */
  private hitTest(x: number, y: number): GlassEntry | null {
    const entries = [...this.glasses.values()];
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (!entry) continue;
      const { body } = entry;
      if (body.materialize.value < 0.05) continue;
      const [cx, cy, hw, hh] = body.glassRectUniform;
      if (Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh) {
        return entry;
      }
    }
    return null;
  }

  private localUV(x: number, y: number, body: GlassBody): [number, number] {
    const [cx, cy, hw, hh] = body.glassRectUniform;
    const u = hw > 0 ? (x - cx) / (hw * 2) + 0.5 : 0.5;
    const v = hh > 0 ? (y - cy) / (hh * 2) + 0.5 : 0.5;
    return [
      Math.min(1, Math.max(0, u)),
      Math.min(1, Math.max(0, v)),
    ];
  }

  private onPointerDown(e: PointerEvent): void {
    const [x, y] = this.canvasCssPoint(e);
    this.motionLight.onPointerMove(x, y);
    const hit = this.hitTest(x, y);
    if (!hit) {
      this.pointerDown = false;
      this.dragId = null;
      return;
    }
    this.pointerDown = true;
    this.dragId = hit.id;
    this.dragMoved = false;
    this.dragOrigin = [x, y];
    this.primaryId = hit.id;
    this.dragOffset = [x - hit.body.x.value, y - hit.body.y.value];
    const uv = this.localUV(x, y, hit.body);
    hit.body.press(uv);
    this.shimmer.trigger(uv);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore — capture is best-effort
    }
    e.preventDefault();
  }

  private onPointerMove(e: PointerEvent): void {
    const [x, y] = this.canvasCssPoint(e);
    this.motionLight.onPointerMove(x, y);
    if (!this.pointerDown || !this.dragId) return;
    const entry = this.glasses.get(this.dragId);
    if (!entry) return;
    if (
      !this.dragMoved &&
      Math.hypot(x - this.dragOrigin[0], y - this.dragOrigin[1]) > 4
    ) {
      this.dragMoved = true;
    }
    entry.body.setTargetRect({
      x: x - this.dragOffset[0],
      y: y - this.dragOffset[1],
      w: entry.body.w.target,
      h: entry.body.h.target,
    });
  }

  private onPointerUp(_e: PointerEvent): void {
    if (!this.pointerDown) return;
    const id = this.dragId;
    const moved = this.dragMoved;
    const entry = id ? this.glasses.get(id) : undefined;
    this.pointerDown = false;
    this.dragId = null;
    this.dragMoved = false;
    entry?.body.release();
    this.shimmer.release();
    if (entry && !moved) {
      this.glassTapHandler?.(entry.id, entry.body);
    }
  }

  // ---------------------------------------------------------------------------
  // GL uniform helpers
  // ---------------------------------------------------------------------------

  private loc(name: string): WebGLUniformLocation | null {
    return this.uniforms[name] ?? null;
  }

  private set1i(name: string, v: number): void {
    const loc = this.loc(name);
    if (loc) this.gl.uniform1i(loc, v);
  }

  private set1f(name: string, v: number): void {
    const loc = this.loc(name);
    if (loc) this.gl.uniform1f(loc, v);
  }

  private set2f(name: string, x: number, y: number): void {
    const loc = this.loc(name);
    if (loc) this.gl.uniform2f(loc, x, y);
  }

  private set3f(name: string, x: number, y: number, z: number): void {
    const loc = this.loc(name);
    if (loc) this.gl.uniform3f(loc, x, y, z);
  }

  private set4f(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
  ): void {
    const loc = this.loc(name);
    if (loc) this.gl.uniform4f(loc, x, y, z, w);
  }

  // ---------------------------------------------------------------------------
  // Sizing / FBO
  // ---------------------------------------------------------------------------

  private devicePixelRatio(): number {
    return typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  }

  private cssSize(): { w: number; h: number } {
    const w = this.canvas.clientWidth || this.canvas.width || 800;
    const h = this.canvas.clientHeight || this.canvas.height || 600;
    return { w, h };
  }

  private ensureDrawingBuffer(): void {
    const dpr = this.devicePixelRatio();
    resizeCanvasToDisplaySize(this.canvas, dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private ensureFBOs(width: number, height: number): void {
    const gl = this.gl;
    if (!this.fboA) {
      this.fboA = createColorFBO(gl, width, height);
    } else {
      resizeColorFBO(gl, this.fboA, width, height);
    }
    if (!this.fboB) {
      this.fboB = createColorFBO(gl, width, height);
    } else {
      resizeColorFBO(gl, this.fboB, width, height);
    }
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("LiquidGlassRenderer has been disposed");
    }
  }
}
