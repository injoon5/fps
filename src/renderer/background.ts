/**
 * Background texture loader + procedural Apple-like wallpaper generator.
 *
 * Refraction only reads as Liquid Glass when the backdrop has rich structure
 * (gradients, photo-like blobs, text-ish bars) for the lens to bend.
 */

import {
  createMutableTexture,
  uploadTexture,
  type GL,
  type TextureSource,
} from "./gl.ts";

export type BackgroundImageSource =
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap;

/**
 * Procedural colorful wallpaper — soft gradients, photo-like blobs, and
 * text-ish bars so chromatic refraction / frost have content to chew on.
 */
export function createProceduralWallpaper(
  width: number,
  height: number,
): HTMLCanvasElement {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context unavailable for procedural wallpaper");
  }

  // Base vertical wash — deep blue → warm peach (iOS wallpaper energy).
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#1a3a6b");
  base.addColorStop(0.35, "#3d6fa8");
  base.addColorStop(0.55, "#c4785a");
  base.addColorStop(0.78, "#e8b07a");
  base.addColorStop(1, "#f2d6b0");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Diagonal cool veil for depth.
  const veil = ctx.createLinearGradient(0, 0, w, h);
  veil.addColorStop(0, "rgba(80, 140, 220, 0.35)");
  veil.addColorStop(0.5, "rgba(255, 180, 120, 0.12)");
  veil.addColorStop(1, "rgba(40, 60, 120, 0.28)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);

  // Photo-like soft blobs (bokeh / landscape suggestion).
  const blobs: Array<{
    x: number;
    y: number;
    r: number;
    color: string;
  }> = [
    { x: 0.18, y: 0.22, r: 0.32, color: "rgba(255, 210, 140, 0.55)" },
    { x: 0.72, y: 0.18, r: 0.28, color: "rgba(120, 180, 255, 0.45)" },
    { x: 0.55, y: 0.55, r: 0.4, color: "rgba(255, 140, 100, 0.35)" },
    { x: 0.3, y: 0.7, r: 0.25, color: "rgba(90, 160, 200, 0.4)" },
    { x: 0.85, y: 0.65, r: 0.22, color: "rgba(255, 230, 180, 0.5)" },
    { x: 0.12, y: 0.55, r: 0.18, color: "rgba(60, 100, 180, 0.4)" },
    { x: 0.48, y: 0.32, r: 0.15, color: "rgba(255, 255, 255, 0.25)" },
  ];

  for (const b of blobs) {
    const cx = b.x * w;
    const cy = b.y * h;
    const radius = b.r * Math.min(w, h);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, b.color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Horizon band — soft landscape cue.
  const horizonY = h * 0.58;
  const land = ctx.createLinearGradient(0, horizonY - h * 0.08, 0, h);
  land.addColorStop(0, "rgba(40, 70, 50, 0)");
  land.addColorStop(0.15, "rgba(50, 90, 60, 0.35)");
  land.addColorStop(0.45, "rgba(30, 55, 40, 0.55)");
  land.addColorStop(1, "rgba(20, 35, 30, 0.7)");
  ctx.fillStyle = land;
  ctx.fillRect(0, horizonY - h * 0.08, w, h - horizonY + h * 0.08);

  // Text-ish bars — dark content for adaptive contact shadow to deepen over.
  const columns = 3;
  const colPad = w * 0.06;
  const colW = (w - colPad * (columns + 1)) / columns;
  const lineH = Math.max(3, Math.round(h * 0.011));
  const gap = lineH * 1.85;

  for (let c = 0; c < columns; c++) {
    const x0 = colPad + c * (colW + colPad);
    const startY = h * (0.12 + (c % 3) * 0.04);
    const lines = 8 + (c % 3) * 3;
    for (let i = 0; i < lines; i++) {
      const y = startY + i * gap;
      if (y > h * 0.52) break;
      const len = colW * (0.55 + ((i * 17 + c * 13) % 40) / 100);
      const alpha = 0.22 + ((i + c) % 5) * 0.06;
      ctx.fillStyle = `rgba(12, 18, 32, ${alpha})`;
      const radius = lineH * 0.45;
      roundRect(ctx, x0, y, len, lineH, radius);
      ctx.fill();
    }

    // Title-weight bar at top of each column.
    ctx.fillStyle = "rgba(10, 14, 28, 0.55)";
    roundRect(ctx, x0, startY - gap * 1.6, colW * 0.7, lineH * 1.6, lineH * 0.5);
    ctx.fill();
  }

  // Lower content cards (UI chrome suggestion).
  const cardY = h * 0.68;
  const cardH = h * 0.22;
  const cardGap = w * 0.03;
  const cardW = (w - colPad * 2 - cardGap * 2) / 3;
  for (let i = 0; i < 3; i++) {
    const x = colPad + i * (cardW + cardGap);
    ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    roundRect(ctx, x, cardY, cardW, cardH, Math.min(18, cardW * 0.08));
    ctx.fill();
    // Mini text lines inside cards.
    for (let j = 0; j < 4; j++) {
      const ly = cardY + cardH * 0.25 + j * (lineH * 2.2);
      const lw = cardW * (0.4 + (j % 3) * 0.15);
      ctx.fillStyle = `rgba(20, 25, 40, ${0.25 + j * 0.05})`;
      roundRect(ctx, x + cardW * 0.1, ly, lw, lineH, lineH * 0.4);
      ctx.fill();
    }
  }

  // Fine grain so frost/blur doesn't look banded.
  const grain = ctx.getImageData(0, 0, w, h);
  const data = grain.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    data[i] = clampByte((data[i] ?? 0) + n);
    data[i + 1] = clampByte((data[i + 1] ?? 0) + n);
    data[i + 2] = clampByte((data[i + 2] ?? 0) + n);
  }
  ctx.putImageData(grain, 0, 0);

  return canvas;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, v | 0));
}

/**
 * Owns a GL texture backed by an image / canvas / procedural wallpaper.
 */
export class BackgroundTexture {
  readonly texture: WebGLTexture;
  private gl: GL;
  private _width = 1;
  private _height = 1;
  private disposed = false;

  constructor(gl: GL) {
    this.gl = gl;
    this.texture = createMutableTexture(gl);
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  /** Upload from an already-decoded image source. */
  setFromSource(source: BackgroundImageSource, flipY = true): void {
    this.assertAlive();
    const size = uploadTexture(this.gl, this.texture, source as TextureSource, flipY);
    this._width = size.width;
    this._height = size.height;
  }

  /** Generate and upload a procedural wallpaper sized to the viewport. */
  setProcedural(width: number, height: number): HTMLCanvasElement {
    const wallpaper = createProceduralWallpaper(width, height);
    this.setFromSource(wallpaper, true);
    return wallpaper;
  }

  /**
   * Load an image URL into the texture. Rejects on network / decode failure.
   */
  async setFromUrl(url: string): Promise<HTMLImageElement> {
    this.assertAlive();
    const img = await loadImage(url);
    this.setFromSource(img, true);
    return img;
  }

  bind(unit = 0): void {
    this.assertAlive();
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteTexture(this.texture);
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("BackgroundTexture has been disposed");
    }
  }
}

/** Promise-based image loader. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
