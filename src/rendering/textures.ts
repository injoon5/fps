import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from "three";

export type TextureSize = 128 | 256 | 512 | 1024;

export interface ProceduralTextureSet {
  map: CanvasTexture;
  roughnessMap: CanvasTexture;
  normalMap: DataTexture;
  aoMap?: CanvasTexture;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface TextureOpts {
  size?: TextureSize;
  anisotropy?: number;
}

const DEFAULT_SIZE: TextureSize = 512;
const DEFAULT_ANISO = 8;

/** Seeded mulberry32 — deterministic noise for seamless tiles. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Tileable value noise in [0,1]. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x1, y0, seed);
  const v01 = hash2(x0, y1, seed);
  const v11 = hash2(x1, y1, seed);
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  return v00 * (1 - u) * (1 - v) + v10 * u * (1 - v) + v01 * (1 - u) * v + v11 * u * v;
}

function fbm(
  x: number,
  y: number,
  period: number,
  seed: number,
  octaves = 5,
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const p = Math.max(2, Math.floor(period / freq));
    sum += amp * valueNoise(x * freq, y * freq, p, seed + i * 19);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function createCanvas(size: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Failed to get OffscreenCanvas 2d context");
    return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Failed to get canvas 2d context");
  return { canvas, ctx };
}

function canvasToTexture(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: { srgb?: boolean; anisotropy?: number } = {},
): CanvasTexture {
  const tex = new CanvasTexture(canvas as HTMLCanvasElement);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = opts.anisotropy ?? DEFAULT_ANISO;
  if (opts.srgb !== false) {
    tex.colorSpace = SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

function heightToNormalMap(
  height: Float32Array,
  size: number,
  strength = 2.5,
  anisotropy = DEFAULT_ANISO,
): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = height[y * size + ((x - 1 + size) % size)] ?? 0;
      const xr = height[y * size + ((x + 1) % size)] ?? 0;
      const yd = height[((y - 1 + size) % size) * size + x] ?? 0;
      const yu = height[((y + 1) % size) * size + x] ?? 0;
      const dx = (xl - xr) * strength;
      const dy = (yd - yu) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      data[i] = clampByte(((dx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = clampByte(((dy / len) * 0.5 + 0.5) * 255);
      data[i + 2] = clampByte(((1 / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function fillImageData(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  size: number,
  paint: (x: number, y: number, i: number) => [number, number, number, number?],
): ImageData {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [r, g, b, a = 255] = paint(x, y, i);
      d[i] = clampByte(r);
      d[i + 1] = clampByte(g);
      d[i + 2] = clampByte(b);
      d[i + 3] = clampByte(a);
    }
  }
  ctx.putImageData(img, 0, 0);
  return img;
}

function makeRoughnessTexture(
  size: number,
  height: Float32Array,
  base: number,
  variation: number,
  anisotropy: number,
  invert = false,
): CanvasTexture {
  const { canvas, ctx } = createCanvas(size);
  fillImageData(ctx, size, (x, y) => {
    const h = height[y * size + x] ?? 0.5;
    const v = invert ? 1 - h : h;
    const r = clampByte((base + (v - 0.5) * variation) * 255);
    return [r, r, r, 255];
  });
  return canvasToTexture(canvas, { srgb: false, anisotropy });
}

function makeAoTexture(
  size: number,
  height: Float32Array,
  strength: number,
  anisotropy: number,
): CanvasTexture {
  const { canvas, ctx } = createCanvas(size);
  fillImageData(ctx, size, (x, y) => {
    const h = height[y * size + x] ?? 0.5;
    const ao = clampByte((1 - (1 - h) * strength) * 255);
    return [ao, ao, ao, 255];
  });
  return canvasToTexture(canvas, { srgb: false, anisotropy });
}

/**
 * Kane Pixel mono-yellow damp drywall / wallpaper — stained, water-damaged, imperfect.
 * Base ~#D4C48A → #C9B87A with darker vertical drip stains.
 */
export function stainedWallpaper(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const baseA: Rgb = { r: 212, g: 196, b: 138 };
  const baseB: Rgb = { r: 201, g: 184, b: 122 };
  const stain: Rgb = { r: 150, g: 132, b: 88 };
  const mold: Rgb = { r: 118, g: 108, b: 72 };
  const height = new Float32Array(size * size);

  const img = fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const n1 = fbm(u * 8, v * 8, 8, 11);
    const n2 = fbm(u * 32, v * 32, 32, 42);
    const grain = fbm(u * 64, v * 64, 64, 77);
    const drip = Math.pow(
      Math.max(0, fbm(u * 6, v * 2 + n1 * 0.3, 6, 99) - 0.42),
      1.6,
    );
    const blotch = Math.pow(Math.max(0, n1 - 0.55), 1.4);
    let col = mixRgb(baseA, baseB, n1 * 0.65 + n2 * 0.35);
    col = mixRgb(col, stain, drip * 0.85);
    col = mixRgb(col, mold, blotch * 0.55);
    const g = (grain - 0.5) * 18;
    col = { r: col.r + g, g: col.g + g * 0.9, b: col.b + g * 0.7 };
    // Subtle horizontal wallpaper seam every ~1/4
    const seam = Math.abs(((v * 4) % 1) - 0.5);
    if (seam > 0.48) {
      col = mixRgb(col, stain, 0.25);
    }
    height[y * size + x] = n1 * 0.45 + n2 * 0.25 + drip * 0.35 + grain * 0.1;
    return [col.r, col.g, col.b];
  });

  void img;
  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.82, 0.35, aniso),
    normalMap: heightToNormalMap(height, size, 1.8, aniso),
    aoMap: makeAoTexture(size, height, 0.35, aniso),
  };
}

/** Stained acoustic ceiling tiles with grid seams and water spots. */
export function acousticCeilingTile(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const tileBase: Rgb = { r: 186, g: 172, b: 118 };
  const tileDark: Rgb = { r: 148, g: 136, b: 92 };
  const water: Rgb = { r: 110, g: 102, b: 78 };
  const height = new Float32Array(size * size);
  const tiles = 4;

  fillImageData(ctx, size, (x, y) => {
    const fx = (x / size) * tiles;
    const fy = (y / size) * tiles;
    const lx = fx - Math.floor(fx);
    const ly = fy - Math.floor(fy);
    const seamX = Math.min(lx, 1 - lx);
    const seamY = Math.min(ly, 1 - ly);
    const seam = Math.min(seamX, seamY);
    const n = fbm(fx * 3, fy * 3, 12, 55);
    const speck = fbm(fx * 24, fy * 24, 96, 12);
    const stainBlob = Math.pow(Math.max(0, n - 0.58), 1.5);
    let col = mixRgb(tileBase, tileDark, n * 0.7);
    col = mixRgb(col, water, stainBlob * 0.9);
    const g = (speck - 0.5) * 22;
    col = { r: col.r + g, g: col.g + g, b: col.b + g * 0.85 };
    if (seam < 0.04) {
      const edge = 1 - seam / 0.04;
      col = mixRgb(col, { r: 90, g: 82, b: 58 }, edge * 0.75);
      height[y * size + x] = 0.15 + n * 0.1;
    } else {
      height[y * size + x] = 0.45 + n * 0.35 + speck * 0.15 - stainBlob * 0.2;
    }
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.92, 0.2, aniso),
    normalMap: heightToNormalMap(height, size, 3.2, aniso),
    aoMap: makeAoTexture(size, height, 0.55, aniso),
  };
}

/** Damp mottled backrooms carpet ~#A89968 with matted wear paths. */
export function dampCarpet(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const base: Rgb = { r: 168, g: 153, b: 104 };
  const dark: Rgb = { r: 120, g: 108, b: 72 };
  const wet: Rgb = { r: 96, g: 88, b: 58 };
  const height = new Float32Array(size * size);
  const rng = mulberry32(0xc4a7);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const pile = fbm(u * 48, v * 48, 48, 33);
    const wear = fbm(u * 4, v * 4, 4, 71);
    const damp = Math.pow(Math.max(0, fbm(u * 3, v * 5, 6, 18) - 0.5), 1.3);
    const fiber = rng() * 0.08;
    let col = mixRgb(base, dark, wear * 0.55 + pile * 0.25);
    col = mixRgb(col, wet, damp * 0.7);
    col = {
      r: col.r + (pile - 0.5) * 28 + fiber * 40,
      g: col.g + (pile - 0.5) * 24 + fiber * 30,
      b: col.b + (pile - 0.5) * 18 + fiber * 20,
    };
    height[y * size + x] = pile * 0.7 + (1 - wear) * 0.2 - damp * 0.25;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.95, 0.15, aniso, true),
    normalMap: heightToNormalMap(height, size, 4.5, aniso),
    aoMap: makeAoTexture(size, height, 0.4, aniso),
  };
}

/** Polished warehouse / Costco concrete with subtle aggregate and scuffs. */
export function concreteFloor(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const base: Rgb = { r: 148, g: 150, b: 152 };
  const dark: Rgb = { r: 112, g: 114, b: 118 };
  const agg: Rgb = { r: 170, g: 168, b: 162 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const n = fbm(u * 6, v * 6, 6, 201);
    const fine = fbm(u * 40, v * 40, 40, 88);
    const scuff = Math.pow(Math.max(0, fbm(u * 10, v * 2, 10, 44) - 0.55), 1.2);
    const crack = Math.pow(
      Math.max(0, Math.abs(fbm(u * 2, v * 8, 8, 9) - 0.5) * 2 - 0.82),
      0.5,
    );
    let col = mixRgb(base, dark, n * 0.6);
    col = mixRgb(col, agg, fine * 0.35);
    col = mixRgb(col, { r: 90, g: 92, b: 96 }, scuff * 0.5);
    if (crack > 0.1) {
      col = mixRgb(col, { r: 70, g: 72, b: 76 }, crack);
    }
    height[y * size + x] = 0.55 + fine * 0.2 - scuff * 0.15 - crack * 0.4;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.35, 0.45, aniso, true),
    normalMap: heightToNormalMap(height, size, 2.0, aniso),
    aoMap: makeAoTexture(size, height, 0.25, aniso),
  };
}

/** Brushed warehouse shelving / metal uprights with worn paint. */
export function warehouseMetal(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const steel: Rgb = { r: 156, g: 160, b: 168 };
  const rust: Rgb = { r: 120, g: 88, b: 62 };
  const paint: Rgb = { r: 72, g: 78, b: 88 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const brush = fbm(u * 2, v * 64, 64, 120);
    const wear = fbm(u * 8, v * 8, 8, 66);
    const rustSpot = Math.pow(Math.max(0, wear - 0.62), 1.8);
    let col = mixRgb(steel, paint, wear * 0.4);
    col = {
      r: col.r + (brush - 0.5) * 30,
      g: col.g + (brush - 0.5) * 30,
      b: col.b + (brush - 0.5) * 34,
    };
    col = mixRgb(col, rust, rustSpot * 0.85);
    // Yellow price-rail accent strip (thin horizontal band)
    if (v > 0.46 && v < 0.54) {
      const accent: Rgb = { r: 210, g: 170, b: 40 };
      col = mixRgb(col, accent, 0.55 + brush * 0.2);
    }
    height[y * size + x] = brush * 0.5 + (1 - wear) * 0.3 - rustSpot * 0.2;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.45, 0.5, aniso),
    normalMap: heightToNormalMap(height, size, 2.8, aniso),
  };
}

/** Soft hotel cream wallpaper with faint damask / vertical stripe. */
export function hotelWallpaper(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const cream: Rgb = { r: 228, g: 218, b: 200 };
  const taupe: Rgb = { r: 198, g: 186, b: 168 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const stripe = 0.5 + 0.5 * Math.sin(u * Math.PI * 8);
    const damask =
      0.5 +
      0.5 *
        Math.sin(u * Math.PI * 16) *
        Math.sin(v * Math.PI * 16 + Math.sin(u * 12));
    const n = fbm(u * 10, v * 10, 10, 301);
    const pattern = stripe * 0.35 + damask * 0.25 + n * 0.4;
    let col = mixRgb(cream, taupe, pattern * 0.55);
    const stain = Math.pow(Math.max(0, n - 0.68), 1.5);
    col = mixRgb(col, { r: 180, g: 168, b: 148 }, stain * 0.6);
    height[y * size + x] = pattern * 0.4 + n * 0.3;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.78, 0.25, aniso),
    normalMap: heightToNormalMap(height, size, 1.4, aniso),
    aoMap: makeAoTexture(size, height, 0.2, aniso),
  };
}

/** Soft warm taupe hotel carpet with repeating low-contrast motif. */
export function hotelCarpet(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const base: Rgb = { r: 148, g: 132, b: 112 };
  const light: Rgb = { r: 168, g: 152, b: 130 };
  const dark: Rgb = { r: 112, g: 98, b: 82 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const motif =
      0.5 +
      0.5 *
        Math.cos(u * Math.PI * 6) *
        Math.cos(v * Math.PI * 6 + Math.sin(u * Math.PI * 4) * 0.5);
    const pile = fbm(u * 40, v * 40, 40, 410);
    const wear = fbm(u * 3, v * 5, 5, 222);
    let col = mixRgb(base, light, motif * 0.45);
    col = mixRgb(col, dark, wear * 0.35 + (1 - pile) * 0.15);
    col = {
      r: col.r + (pile - 0.5) * 20,
      g: col.g + (pile - 0.5) * 18,
      b: col.b + (pile - 0.5) * 14,
    };
    height[y * size + x] = pile * 0.65 + motif * 0.2;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.92, 0.18, aniso, true),
    normalMap: heightToNormalMap(height, size, 3.8, aniso),
    aoMap: makeAoTexture(size, height, 0.35, aniso),
  };
}

/** Dark wood / brass accent strip for hotel trim. */
export function hotelWood(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? 256;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const wood: Rgb = { r: 78, g: 52, b: 36 };
  const grainC: Rgb = { r: 110, g: 78, b: 48 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const grain = fbm(u * 2 + Math.sin(v * 20) * 0.05, v * 48, 48, 77);
    const ring = 0.5 + 0.5 * Math.sin(u * Math.PI * 14 + grain * 3);
    let col = mixRgb(wood, grainC, grain * 0.55 + ring * 0.25);
    height[y * size + x] = grain;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.55, 0.35, aniso),
    normalMap: heightToNormalMap(height, size, 2.2, aniso),
  };
}

/** Fluorescent diffuser panel — slightly green-white milky plastic. */
export function fluorescentDiffuser(opts: TextureOpts = {}): CanvasTexture {
  const size = opts.size ?? 256;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const n = fbm(u * 6, v * 6, 6, 5);
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const falloff = Math.min(1, edge * 8);
    const g = 235 + n * 12;
    const r = 228 + n * 8;
    const b = 218 + n * 10;
    const dim = 0.55 + falloff * 0.45;
    return [r * dim, g * dim, b * dim * 0.95];
  });
  const tex = canvasToTexture(canvas, { anisotropy: aniso });
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

/** Flat emissive white for light panels (no mip shimmer). */
export function emissivePanelTexture(color: Rgb = { r: 240, g: 248, b: 235 }): DataTexture {
  const data = new Uint8Array([
    clampByte(color.r),
    clampByte(color.g),
    clampByte(color.b),
    255,
  ]);
  const tex = new DataTexture(data, 1, 1, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function configureRepeat(
  textures: ProceduralTextureSet,
  repeatX: number,
  repeatY: number,
): void {
  const apply = (t: Texture | undefined): void => {
    if (!t) return;
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.needsUpdate = true;
  };
  apply(textures.map);
  apply(textures.roughnessMap);
  apply(textures.normalMap);
  apply(textures.aoMap);
}

export function disposeTextureSet(set: ProceduralTextureSet): void {
  set.map.dispose();
  set.roughnessMap.dispose();
  set.normalMap.dispose();
  set.aoMap?.dispose();
}
