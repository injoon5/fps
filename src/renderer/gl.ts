/**
 * WebGL2 helpers for the Liquid Glass renderer.
 */

export type GL = WebGL2RenderingContext;

export class GLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GLError";
  }
}

/** Acquire a WebGL2 context with sensible defaults for 2D compositing. */
export function createGL(
  canvas: HTMLCanvasElement,
  attrs: WebGLContextAttributes = {},
): GL {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
    ...attrs,
  });
  if (!gl) {
    throw new GLError("WebGL2 is not available on this canvas / browser");
  }
  return gl;
}

/**
 * Compile a GLSL ES 3.00 shader. On failure, logs and throws the FULL info log.
 */
export function compileShader(
  gl: GL,
  type: GL["VERTEX_SHADER"] | GL["FRAGMENT_SHADER"],
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new GLError("gl.createShader returned null");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!ok) {
    const info = gl.getShaderInfoLog(shader) ?? "(no info log)";
    const kind = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
    // CRITICAL: never swallow — full log for debugging optical stack.
    console.error(`[LiquidGlass] ${kind} shader compile failed:\n${info}`);
    console.error(`[LiquidGlass] ${kind} source:\n${source}`);
    gl.deleteShader(shader);
    throw new GLError(`${kind} shader compile failed:\n${info}`);
  }
  return shader;
}

/** Link a program from compiled vertex + fragment shaders. */
export function linkProgram(
  gl: GL,
  vert: WebGLShader,
  frag: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new GLError("gl.createProgram returned null");
  }
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  const ok = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!ok) {
    const info = gl.getProgramInfoLog(program) ?? "(no info log)";
    console.error(`[LiquidGlass] program link failed:\n${info}`);
    gl.deleteProgram(program);
    throw new GLError(`program link failed:\n${info}`);
  }
  return program;
}

/** Compile + link a complete program from source strings. */
export function createProgram(
  gl: GL,
  vertSource: string,
  fragSource: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  try {
    return linkProgram(gl, vs, fs);
  } finally {
    // Shaders can be detached/deleted after successful link; keep attached
    // for easier debugging of info logs — delete them to free GPU memory.
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }
}

export interface TextureOptions {
  /** Flip Y on upload (images / canvas are top-left; GL is bottom-left). */
  flipY?: boolean;
  /** Wrap mode — default CLAMP_TO_EDGE. */
  wrap?: number;
  /** Min/mag filter — default LINEAR. */
  filter?: number;
  /** Internal format — default RGBA8. */
  internalFormat?: number;
  format?: number;
  type?: number;
}

/** Create an empty 2D texture (or from optional pixel source). */
export function createTexture(
  gl: GL,
  width = 1,
  height = 1,
  options: TextureOptions = {},
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) {
    throw new GLError("gl.createTexture returned null");
  }

  const wrap = options.wrap ?? gl.CLAMP_TO_EDGE;
  const filter = options.filter ?? gl.LINEAR;
  const internalFormat = options.internalFormat ?? gl.RGBA8;
  const format = options.format ?? gl.RGBA;
  const type = options.type ?? gl.UNSIGNED_BYTE;

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, options.flipY ?? false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, Math.max(1, width), Math.max(1, height));
  // texStorage2D allocates immutable storage — callers upload via texSubImage2D.
  // For a 1×1 placeholder we also allow mutable path when width/height are set
  // after creation via uploadTexture.
  void format;
  void type;
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/**
 * Create a mutable 2D texture suitable for repeated uploads (backgrounds, FBOs).
 * Uses texImage2D (not texStorage) so size can change.
 */
export function createMutableTexture(
  gl: GL,
  options: TextureOptions = {},
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) {
    throw new GLError("gl.createTexture returned null");
  }
  const wrap = options.wrap ?? gl.CLAMP_TO_EDGE;
  const filter = options.filter ?? gl.LINEAR;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  // 1×1 magenta placeholder so sampling before upload is obvious.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 0, 255, 255]),
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export type TextureSource =
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas
  | ImageData;

/** Upload an image / canvas / ImageData into an existing mutable texture. */
export function uploadTexture(
  gl: GL,
  texture: WebGLTexture,
  source: TextureSource,
  flipY = true,
): { width: number; height: number } {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  const width = textureSourceWidth(source);
  const height = textureSourceHeight(source);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { width, height };
}

function textureSourceWidth(source: TextureSource): number {
  if ("naturalWidth" in source && source.naturalWidth) {
    return source.naturalWidth;
  }
  if ("width" in source && typeof source.width === "number") {
    return source.width;
  }
  return 1;
}

function textureSourceHeight(source: TextureSource): number {
  if ("naturalHeight" in source && source.naturalHeight) {
    return source.naturalHeight;
  }
  if ("height" in source && typeof source.height === "number") {
    return source.height;
  }
  return 1;
}

/**
 * Fullscreen triangle VAO — no attributes; vertex shader uses `gl_VertexID`.
 * Returns the VAO (bind before drawArrays(TRIANGLES, 0, 3)).
 */
export function createFullscreenTriangleVAO(gl: GL): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) {
    throw new GLError("gl.createVertexArray returned null");
  }
  gl.bindVertexArray(vao);
  // No buffers / attributes — gl_VertexID drives the clip-space triangle.
  gl.bindVertexArray(null);
  return vao;
}

/**
 * Match canvas drawing buffer to CSS size × devicePixelRatio.
 * Returns true if the buffer was resized.
 */
export function resizeCanvasToDisplaySize(
  canvas: HTMLCanvasElement,
  dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
): boolean {
  const cssW = canvas.clientWidth || canvas.width || 1;
  const cssH = canvas.clientHeight || canvas.height || 1;
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}

/** Throw if the GL error flag is set (call after suspicious ops). */
export function checkGLError(gl: GL, label = ""): void {
  const err = gl.getError();
  if (err === gl.NO_ERROR) return;
  const names: Record<number, string> = {
    [gl.INVALID_ENUM]: "INVALID_ENUM",
    [gl.INVALID_VALUE]: "INVALID_VALUE",
    [gl.INVALID_OPERATION]: "INVALID_OPERATION",
    [gl.INVALID_FRAMEBUFFER_OPERATION]: "INVALID_FRAMEBUFFER_OPERATION",
    [gl.OUT_OF_MEMORY]: "OUT_OF_MEMORY",
    [gl.CONTEXT_LOST_WEBGL]: "CONTEXT_LOST_WEBGL",
  };
  const name = names[err] ?? `0x${err.toString(16)}`;
  throw new GLError(`WebGL error ${name}${label ? ` @ ${label}` : ""}`);
}

/** Cache of active uniform locations for a program. */
export function getUniformLocations(
  gl: GL,
  program: WebGLProgram,
  names: readonly string[],
): Record<string, WebGLUniformLocation | null> {
  const out: Record<string, WebGLUniformLocation | null> = {};
  for (const name of names) {
    out[name] = gl.getUniformLocation(program, name);
  }
  return out;
}

/** Create a color-attachment FBO + texture pair for ping-pong compositing. */
export function createColorFBO(
  gl: GL,
  width: number,
  height: number,
): { fbo: WebGLFramebuffer; texture: WebGLTexture; width: number; height: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const texture = createMutableTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  const fbo = gl.createFramebuffer();
  if (!fbo) {
    throw new GLError("gl.createFramebuffer returned null");
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new GLError(`Framebuffer incomplete: 0x${status.toString(16)}`);
  }
  return { fbo, texture, width: w, height: h };
}

export function resizeColorFBO(
  gl: GL,
  target: { fbo: WebGLFramebuffer; texture: WebGLTexture; width: number; height: number },
  width: number,
  height: number,
): void {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (target.width === w && target.height === h) return;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  target.width = w;
  target.height = h;
}
