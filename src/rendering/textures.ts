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

/**
 * Wet ceramic pool tile — turquoise/cyan body (#3AA8B5 / #2A8A96) with white grout grid.
 * Slightly irregular glaze + water-spot darkening for liminal poolrooms feel.
 */
export function poolTile(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const tileA: Rgb = { r: 58, g: 168, b: 181 };
  const tileB: Rgb = { r: 42, g: 138, b: 150 };
  const tileDeep: Rgb = { r: 28, g: 110, b: 122 };
  const grout: Rgb = { r: 228, g: 236, b: 238 };
  const height = new Float32Array(size * size);
  const tiles = 8;

  fillImageData(ctx, size, (x, y) => {
    const fx = (x / size) * tiles;
    const fy = (y / size) * tiles;
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const lx = fx - tx;
    const ly = fy - ty;
    const seamX = Math.min(lx, 1 - lx);
    const seamY = Math.min(ly, 1 - ly);
    const seam = Math.min(seamX, seamY);
    const n = fbm(fx * 2.2, fy * 2.2, 18, 501 + tx * 3 + ty * 7);
    const glaze = fbm(fx * 14, fy * 14, 56, 88);
    const wet = Math.pow(Math.max(0, fbm(fx * 1.4, fy * 1.8, 8, 220) - 0.48), 1.4);
    let col = mixRgb(tileA, tileB, n * 0.7 + (tx % 2) * 0.08);
    col = mixRgb(col, tileDeep, wet * 0.55);
    const g = (glaze - 0.5) * 16;
    col = { r: col.r + g * 0.6, g: col.g + g, b: col.b + g * 1.1 };
    if (seam < 0.055) {
      const edge = 1 - seam / 0.055;
      col = mixRgb(col, grout, edge * 0.92);
      height[y * size + x] = 0.12 + n * 0.08;
    } else {
      // Soft bevel near grout
      const bevel = seam < 0.12 ? (0.12 - seam) / 0.12 : 0;
      col = mixRgb(col, grout, bevel * 0.12);
      height[y * size + x] = 0.55 + glaze * 0.2 - wet * 0.25 - bevel * 0.15;
    }
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    // Wet tile = lower roughness in basin centers
    roughnessMap: makeRoughnessTexture(size, height, 0.22, 0.55, aniso, true),
    normalMap: heightToNormalMap(height, size, 3.6, aniso),
    aoMap: makeAoTexture(size, height, 0.4, aniso),
  };
}

/**
 * Vertical poolroom wall tile — larger ceramic grid, pale cyan-teal with white grout.
 * Slightly matte vs floor; waterline staining near "bottom" of tile.
 */
export function poolGroutWall(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const tileA: Rgb = { r: 72, g: 178, b: 188 };
  const tileB: Rgb = { r: 48, g: 148, b: 160 };
  const stain: Rgb = { r: 36, g: 118, b: 128 };
  const grout: Rgb = { r: 236, g: 242, b: 244 };
  const height = new Float32Array(size * size);
  const tilesX = 6;
  const tilesY = 8;

  fillImageData(ctx, size, (x, y) => {
    const fx = (x / size) * tilesX;
    const fy = (y / size) * tilesY;
    const lx = fx - Math.floor(fx);
    const ly = fy - Math.floor(fy);
    const seamX = Math.min(lx, 1 - lx);
    const seamY = Math.min(ly, 1 - ly);
    const seam = Math.min(seamX, seamY);
    const n = fbm(fx * 2, fy * 2, 12, 640);
    const drip = Math.pow(
      Math.max(0, fbm(fx * 3, fy * 1.2 + n * 0.2, 6, 77) - 0.5),
      1.5,
    );
    // Waterline band near bottom of texture (v high)
    const v = y / size;
    const waterline = Math.pow(Math.max(0, v - 0.72) / 0.28, 1.2);
    let col = mixRgb(tileA, tileB, n * 0.65);
    col = mixRgb(col, stain, drip * 0.45 + waterline * 0.35);
    if (seam < 0.048) {
      const edge = 1 - seam / 0.048;
      col = mixRgb(col, grout, edge * 0.95);
      height[y * size + x] = 0.14 + n * 0.06;
    } else {
      height[y * size + x] = 0.5 + n * 0.25 - drip * 0.15 - waterline * 0.1;
    }
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.38, 0.4, aniso, true),
    normalMap: heightToNormalMap(height, size, 3.2, aniso),
    aoMap: makeAoTexture(size, height, 0.35, aniso),
  };
}

/**
 * Low wet concrete ceiling — damp blotches, recessed-light ghosts, cool grey-cyan cast.
 */
export function wetConcrete(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const base: Rgb = { r: 168, g: 178, b: 182 };
  const dark: Rgb = { r: 120, g: 132, b: 138 };
  const damp: Rgb = { r: 96, g: 118, b: 124 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const n = fbm(u * 5, v * 5, 5, 910);
    const fine = fbm(u * 36, v * 36, 36, 44);
    const blotch = Math.pow(Math.max(0, fbm(u * 3, v * 4, 4, 33) - 0.52), 1.35);
    // Soft recessed panel grid
    const px = Math.abs(((u * 4) % 1) - 0.5);
    const pz = Math.abs(((v * 4) % 1) - 0.5);
    const recess = px > 0.42 || pz > 0.42 ? 0.35 : 0;
    let col = mixRgb(base, dark, n * 0.55 + fine * 0.2);
    col = mixRgb(col, damp, blotch * 0.7 + recess * 0.25);
    col = {
      r: col.r + (fine - 0.5) * 12,
      g: col.g + (fine - 0.5) * 14,
      b: col.b + (fine - 0.5) * 16,
    };
    height[y * size + x] = 0.5 + fine * 0.2 - blotch * 0.3 - recess * 0.2;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.72, 0.35, aniso),
    normalMap: heightToNormalMap(height, size, 2.4, aniso),
    aoMap: makeAoTexture(size, height, 0.45, aniso),
  };
}

/**
 * Rough parking-structure concrete — formwork seams, water drip stains, soot.
 * Used for garage walls / columns / low ceilings.
 */
export function garageConcrete(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const base: Rgb = { r: 118, g: 112, b: 104 };
  const dark: Rgb = { r: 78, g: 74, b: 68 };
  const drip: Rgb = { r: 52, g: 48, b: 42 };
  const soot: Rgb = { r: 42, g: 40, b: 38 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const n = fbm(u * 5, v * 5, 5, 501);
    const fine = fbm(u * 28, v * 28, 28, 512);
    const form =
      Math.min(
        Math.abs(((u * 3) % 1) - 0.5),
        Math.abs(((v * 2) % 1) - 0.5),
      ) < 0.02
        ? 1
        : 0;
    const waterDrip = Math.pow(
      Math.max(0, fbm(u * 5, v * 1.4 + n * 0.25, 5, 530) - 0.48),
      1.55,
    );
    const blotch = Math.pow(Math.max(0, n - 0.6), 1.6);
    let col = mixRgb(base, dark, n * 0.55 + fine * 0.2);
    col = mixRgb(col, drip, waterDrip * 0.9);
    col = mixRgb(col, soot, blotch * 0.45);
    if (form > 0) {
      col = mixRgb(col, { r: 62, g: 58, b: 54 }, 0.55);
    }
    const g = (fine - 0.5) * 16;
    col = { r: col.r + g, g: col.g + g * 0.95, b: col.b + g * 0.85 };
    height[y * size + x] =
      0.5 + fine * 0.25 - waterDrip * 0.35 - form * 0.3 - blotch * 0.15;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.88, 0.25, aniso),
    normalMap: heightToNormalMap(height, size, 2.6, aniso),
    aoMap: makeAoTexture(size, height, 0.45, aniso),
  };
}

/**
 * Dark asphalt deck with oil blooms, tire scuffs, and damp patches.
 */
export function asphaltStains(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const asphalt: Rgb = { r: 48, g: 46, b: 44 };
  const light: Rgb = { r: 68, g: 66, b: 62 };
  const oil: Rgb = { r: 28, g: 26, b: 22 };
  const oilSheen: Rgb = { r: 36, g: 42, b: 38 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const n = fbm(u * 6, v * 6, 6, 601);
    const grit = fbm(u * 48, v * 48, 48, 620);
    const scuff = Math.pow(Math.max(0, fbm(u * 12, v * 3, 12, 640) - 0.52), 1.3);
    const oilBlob = Math.pow(Math.max(0, fbm(u * 4, v * 4, 4, 660) - 0.58), 1.7);
    const damp = Math.pow(Math.max(0, fbm(u * 3, v * 5, 6, 680) - 0.55), 1.4);
    let col = mixRgb(asphalt, light, n * 0.35 + grit * 0.2);
    col = mixRgb(col, { r: 58, g: 56, b: 52 }, scuff * 0.55);
    col = mixRgb(col, oil, oilBlob * 0.95);
    col = mixRgb(col, oilSheen, oilBlob * damp * 0.5);
    col = mixRgb(col, { r: 40, g: 38, b: 36 }, damp * 0.35);
    const g = (grit - 0.5) * 14;
    col = { r: col.r + g, g: col.g + g, b: col.b + g * 0.9 };
    height[y * size + x] =
      0.45 + grit * 0.3 - oilBlob * 0.35 - scuff * 0.1 - damp * 0.12;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.72, 0.4, aniso, true),
    normalMap: heightToNormalMap(height, size, 2.2, aniso),
    aoMap: makeAoTexture(size, height, 0.3, aniso),
  };
}

/**
 * Faded yellow parking stall paint — chalky, cracked edge wear.
 * Use as a thin decal strip material (accent boxes), not full floor.
 */
export function parkingLine(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? 256;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const paint: Rgb = { r: 210, g: 175, b: 40 };
  const worn: Rgb = { r: 150, g: 128, b: 48 };
  const asphaltBleed: Rgb = { r: 70, g: 66, b: 58 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const chip = Math.pow(Math.max(0, fbm(u * 20, v * 20, 20, 701) - 0.62), 1.4);
    const fade = fbm(u * 8, v * 8, 8, 720);
    let col = mixRgb(paint, worn, fade * 0.55);
    if (edge < 0.08) {
      col = mixRgb(col, asphaltBleed, (1 - edge / 0.08) * 0.7);
    }
    col = mixRgb(col, asphaltBleed, chip * 0.85);
    height[y * size + x] = 0.55 + fade * 0.2 - chip * 0.4;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.7, 0.3, aniso),
    normalMap: heightToNormalMap(height, size, 1.6, aniso),
  };
}

/**
 * Gray speckled corporate carpet — dead fluorescent wash, worn aisle paths.
 * Cool gray base with darker traffic lanes and faint green cast.
 */
export function officeCarpet(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const base: Rgb = { r: 118, g: 122, b: 118 };
  const dark: Rgb = { r: 86, g: 90, b: 88 };
  const speck: Rgb = { r: 150, g: 152, b: 146 };
  const stain: Rgb = { r: 72, g: 78, b: 70 };
  const height = new Float32Array(size * size);
  const rng = mulberry32(0x0ff1ce);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const pile = fbm(u * 52, v * 52, 52, 501);
    const wear = fbm(u * 3.5, v * 5.5, 6, 612);
    const aisle =
      Math.pow(Math.max(0, Math.abs(Math.sin(u * Math.PI * 4)) - 0.72), 1.4) +
      Math.pow(Math.max(0, Math.abs(Math.sin(v * Math.PI * 3)) - 0.75), 1.4);
    const damp = Math.pow(Math.max(0, fbm(u * 4, v * 4, 4, 77) - 0.58), 1.5);
    const fiber = rng() * 0.07;
    let col = mixRgb(base, dark, wear * 0.5 + pile * 0.2);
    col = mixRgb(col, speck, Math.pow(pile, 2) * 0.35);
    col = mixRgb(col, dark, Math.min(1, aisle * 2.2) * 0.55);
    col = mixRgb(col, stain, damp * 0.65);
    col = {
      r: col.r + (pile - 0.5) * 16 + fiber * 30,
      g: col.g + (pile - 0.5) * 18 + fiber * 28,
      b: col.b + (pile - 0.5) * 14 + fiber * 22,
    };
    height[y * size + x] = pile * 0.65 + (1 - wear) * 0.2 - aisle * 0.3 - damp * 0.2;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.96, 0.12, aniso, true),
    normalMap: heightToNormalMap(height, size, 4.2, aniso),
    aoMap: makeAoTexture(size, height, 0.38, aniso),
  };
}

/**
 * Cubicle partition fabric — beige-gray weave with vertical seam ribs.
 */
export function officeCubicleFabric(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const base: Rgb = { r: 168, g: 162, b: 148 };
  const dark: Rgb = { r: 132, g: 128, b: 116 };
  const rib: Rgb = { r: 112, g: 108, b: 98 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const weave =
      0.5 +
      0.5 *
        Math.sin(u * Math.PI * 48) *
        Math.sin(v * Math.PI * 32 + Math.sin(u * 20) * 0.3);
    const n = fbm(u * 14, v * 14, 14, 880);
    const stain = Math.pow(Math.max(0, n - 0.62), 1.6);
    // Vertical panel seam / frame shadow every quarter
    const seamU = Math.abs(((u * 4) % 1) - 0.5);
    const seam = seamU > 0.47 ? (seamU - 0.47) / 0.03 : 0;
    let col = mixRgb(base, dark, weave * 0.45 + n * 0.3);
    col = mixRgb(col, rib, seam * 0.9);
    col = mixRgb(col, { r: 100, g: 98, b: 88 }, stain * 0.5);
    // Soft horizontal top-rail wear
    if (v > 0.9) {
      col = mixRgb(col, dark, 0.35);
    }
    height[y * size + x] = weave * 0.5 + n * 0.25 - seam * 0.4;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.88, 0.22, aniso),
    normalMap: heightToNormalMap(height, size, 2.6, aniso),
    aoMap: makeAoTexture(size, height, 0.3, aniso),
  };
}

/**
 * Drop-ceiling acoustic tile — cooler gray-white, grid seams, water rings.
 */
export function dropCeilingTile(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const tileBase: Rgb = { r: 198, g: 200, b: 194 };
  const tileDark: Rgb = { r: 168, g: 172, b: 166 };
  const water: Rgb = { r: 130, g: 138, b: 128 };
  const mold: Rgb = { r: 108, g: 118, b: 108 };
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
    const n = fbm(fx * 3, fy * 3, 12, 911);
    const speck = fbm(fx * 28, fy * 28, 112, 44);
    const stainBlob = Math.pow(Math.max(0, n - 0.56), 1.45);
    const ring = Math.pow(
      Math.max(0, 0.12 - Math.abs(Math.hypot(lx - 0.5, ly - 0.5) - 0.28)),
      0.6,
    );
    let col = mixRgb(tileBase, tileDark, n * 0.65);
    col = mixRgb(col, water, stainBlob * 0.85);
    col = mixRgb(col, mold, ring * stainBlob * 1.2);
    const g = (speck - 0.5) * 18;
    col = { r: col.r + g, g: col.g + g * 1.05, b: col.b + g * 0.9 };
    if (seam < 0.035) {
      const edge = 1 - seam / 0.035;
      col = mixRgb(col, { r: 92, g: 96, b: 94 }, edge * 0.8);
      height[y * size + x] = 0.12 + n * 0.1;
    } else {
      height[y * size + x] = 0.5 + n * 0.3 + speck * 0.12 - stainBlob * 0.22;
    }
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.93, 0.18, aniso),
    normalMap: heightToNormalMap(height, size, 3.0, aniso),
    aoMap: makeAoTexture(size, height, 0.5, aniso),
  };
}

/**
 * Beige corporate wallpaper — flat, faintly striped, coffee stains at 3am.
 */
export function beigeWallpaper(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const baseA: Rgb = { r: 196, g: 186, b: 164 };
  const baseB: Rgb = { r: 178, g: 170, b: 150 };
  const stain: Rgb = { r: 148, g: 136, b: 112 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const stripe = 0.5 + 0.5 * Math.sin(u * Math.PI * 10);
    const n1 = fbm(u * 7, v * 7, 7, 331);
    const n2 = fbm(u * 28, v * 28, 28, 442);
    const drip = Math.pow(
      Math.max(0, fbm(u * 5, v * 2.2 + n1 * 0.25, 5, 550) - 0.48),
      1.5,
    );
    const blotch = Math.pow(Math.max(0, n1 - 0.6), 1.4);
    let col = mixRgb(baseA, baseB, stripe * 0.35 + n1 * 0.45 + n2 * 0.2);
    col = mixRgb(col, stain, drip * 0.7);
    col = mixRgb(col, { r: 130, g: 128, b: 110 }, blotch * 0.45);
    // Chair-rail / wainscot hint
    if (v > 0.62 && v < 0.66) {
      col = mixRgb(col, darkenRgb(baseB, 0.85), 0.55);
    }
    height[y * size + x] = n1 * 0.4 + stripe * 0.2 + drip * 0.25 + n2 * 0.1;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.84, 0.28, aniso),
    normalMap: heightToNormalMap(height, size, 1.5, aniso),
    aoMap: makeAoTexture(size, height, 0.28, aniso),
  };
}

function darkenRgb(c: Rgb, factor: number): Rgb {
  return { r: c.r * factor, g: c.g * factor, b: c.b * factor };
}

/**
 * Soft-play foam padding — faded primary vinyl over porous foam,
 * scuffed seams and hand-wipe dirt from a thousand birthday parties.
 */
export function softPlayFoam(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const foamA: Rgb = { r: 198, g: 72, b: 68 };
  const foamB: Rgb = { r: 168, g: 58, b: 56 };
  const seam: Rgb = { r: 90, g: 70, b: 62 };
  const dirt: Rgb = { r: 120, g: 100, b: 82 };
  const height = new Float32Array(size * size);
  const panels = 4;

  fillImageData(ctx, size, (x, y) => {
    const fx = (x / size) * panels;
    const fy = (y / size) * panels;
    const lx = fx - Math.floor(fx);
    const ly = fy - Math.floor(fy);
    const seamX = Math.min(lx, 1 - lx);
    const seamY = Math.min(ly, 1 - ly);
    const edge = Math.min(seamX, seamY);
    const n = fbm(fx * 4, fy * 4, 16, 501);
    const pore = fbm(fx * 28, fy * 28, 112, 512);
    const wipe = Math.pow(Math.max(0, fbm(fx * 3, fy * 8, 12, 520) - 0.52), 1.4);
    let col = mixRgb(foamA, foamB, n * 0.65 + pore * 0.2);
    // Panel index tint — faded red / blue / yellow rotation
    const panelId = (Math.floor(fx) + Math.floor(fy) * 2) % 3;
    if (panelId === 1) {
      col = mixRgb(col, { r: 62, g: 96, b: 168 }, 0.72);
    } else if (panelId === 2) {
      col = mixRgb(col, { r: 198, g: 168, b: 52 }, 0.7);
    }
    col = mixRgb(col, dirt, wipe * 0.55);
    const g = (pore - 0.5) * 16;
    col = { r: col.r + g, g: col.g + g * 0.9, b: col.b + g * 0.75 };
    if (edge < 0.06) {
      const t = 1 - edge / 0.06;
      col = mixRgb(col, seam, t * 0.7);
      height[y * size + x] = 0.2 + n * 0.1;
    } else {
      height[y * size + x] = 0.5 + pore * 0.35 - wipe * 0.15;
    }
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.78, 0.28, aniso),
    normalMap: heightToNormalMap(height, size, 2.6, aniso),
    aoMap: makeAoTexture(size, height, 0.4, aniso),
  };
}

/**
 * Ball-pit plastic — glossy primary shells with scuffed specular wear.
 */
export function ballpitPlastic(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const shell: Rgb = { r: 220, g: 210, b: 200 };
  const scratch: Rgb = { r: 160, g: 150, b: 140 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const n = fbm(u * 10, v * 10, 10, 601);
    const fine = fbm(u * 48, v * 48, 48, 611);
    const swirl = 0.5 + 0.5 * Math.sin(u * Math.PI * 6 + v * 8 + n * 2);
    const scuff = Math.pow(Math.max(0, fine - 0.58), 1.3);
    let col = mixRgb(shell, scratch, n * 0.35 + swirl * 0.15);
    col = mixRgb(col, { r: 130, g: 120, b: 110 }, scuff * 0.55);
    // Injection-mold seam ring
    const ring = Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.32);
    if (ring < 0.02) {
      col = mixRgb(col, scratch, 0.45);
    }
    height[y * size + x] = 0.55 + fine * 0.25 - scuff * 0.2 - (ring < 0.02 ? 0.15 : 0);
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.28, 0.55, aniso, true),
    normalMap: heightToNormalMap(height, size, 1.6, aniso),
  };
}

/**
 * Primary soft-play wall panels — faded red / blue / yellow laminate
 * with sticker ghosts and grease at kid-height.
 */
export function primaryWallPanel(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const red: Rgb = { r: 186, g: 64, b: 58 };
  const blue: Rgb = { r: 58, g: 92, b: 158 };
  const yellow: Rgb = { r: 188, g: 158, b: 48 };
  const grease: Rgb = { r: 110, g: 98, b: 78 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const band = Math.floor(u * 3) % 3;
    let col = band === 0 ? red : band === 1 ? blue : yellow;
    const n = fbm(u * 8, v * 8, 8, 701);
    const fade = fbm(u * 3, v * 3, 3, 710);
    col = mixRgb(col, { r: 160, g: 148, b: 120 }, fade * 0.35);
    // Kid-height grease smear band
    if (v > 0.35 && v < 0.62) {
      const smear = Math.pow(Math.max(0, fbm(u * 14, v * 4, 14, 720) - 0.45), 1.2);
      col = mixRgb(col, grease, smear * 0.55);
    }
    // Sticker ghost rectangles
    const sx = ((u * 5) % 1);
    const sy = ((v * 4) % 1);
    if (sx > 0.7 && sx < 0.92 && sy > 0.55 && sy < 0.82 && n > 0.48) {
      col = mixRgb(col, { r: 200, g: 190, b: 170 }, 0.4);
    }
    // Vertical panel seam
    const seamU = Math.abs(((u * 3) % 1) - 0.5);
    if (seamU > 0.47) {
      col = mixRgb(col, grease, 0.35);
    }
    height[y * size + x] = 0.5 + n * 0.25 - (seamU > 0.47 ? 0.2 : 0);
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.72, 0.3, aniso),
    normalMap: heightToNormalMap(height, size, 1.5, aniso),
    aoMap: makeAoTexture(size, height, 0.3, aniso),
  };
}

/**
 * Stained 90s fun-center carpet — loud geometric diamonds / zigzags,
 * now sun-faded and soda-stained into unease.
 */
export function stainedFunCarpet(opts: TextureOpts = {}): ProceduralTextureSet {
  const size = opts.size ?? DEFAULT_SIZE;
  const aniso = opts.anisotropy ?? DEFAULT_ANISO;
  const { canvas, ctx } = createCanvas(size);
  const navy: Rgb = { r: 48, g: 58, b: 98 };
  const teal: Rgb = { r: 42, g: 110, b: 108 };
  const coral: Rgb = { r: 168, g: 72, b: 68 };
  const gold: Rgb = { r: 168, g: 138, b: 58 };
  const stain: Rgb = { r: 72, g: 62, b: 48 };
  const height = new Float32Array(size * size);

  fillImageData(ctx, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    // Diamond lattice
    const dx = Math.abs(((u * 8) % 1) - 0.5);
    const dy = Math.abs(((v * 8) % 1) - 0.5);
    const diamond = dx + dy;
    // Zigzag stripe overlay
    const zig = Math.abs(((v * 6 + Math.sin(u * Math.PI * 8) * 0.15) % 1) - 0.5);
    const pile = fbm(u * 40, v * 40, 40, 801);
    const wear = fbm(u * 4, v * 5, 5, 810);
    const soda = Math.pow(Math.max(0, fbm(u * 5, v * 5, 5, 820) - 0.58), 1.5);

    let col: Rgb;
    if (diamond < 0.28) {
      col = mixRgb(coral, gold, (diamond / 0.28) * 0.5 + pile * 0.2);
    } else if (zig < 0.12) {
      col = teal;
    } else {
      col = mixRgb(navy, teal, wear * 0.4);
    }
    col = mixRgb(col, stain, soda * 0.7 + wear * 0.2);
    col = {
      r: col.r + (pile - 0.5) * 18,
      g: col.g + (pile - 0.5) * 16,
      b: col.b + (pile - 0.5) * 12,
    };
    // Sun-fade toward yellowed nostalgia
    col = mixRgb(col, { r: 180, g: 160, b: 110 }, 0.12 + wear * 0.1);
    height[y * size + x] = pile * 0.65 + (1 - diamond) * 0.15 - soda * 0.2;
    return [col.r, col.g, col.b];
  });

  return {
    map: canvasToTexture(canvas, { anisotropy: aniso }),
    roughnessMap: makeRoughnessTexture(size, height, 0.94, 0.16, aniso, true),
    normalMap: heightToNormalMap(height, size, 3.6, aniso),
    aoMap: makeAoTexture(size, height, 0.38, aniso),
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
