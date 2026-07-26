import {
  ShaderMaterial,
  Vector2,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { LevelId } from "../types";

export type PostFXProfileId = LevelId;

export interface PostFXHandle {
  composer: EffectComposer;
  setProfile: (levelId: PostFXProfileId) => void;
  render: (deltaSeconds?: number) => void;
  resize: (width: number, height: number, pixelRatio?: number) => void;
  dispose: () => void;
  getProfile: () => PostFXProfileId;
}

interface GradeParams {
  /** Lift toward sickly yellow / cool / warm. */
  tint: [number, number, number];
  saturation: number;
  contrast: number;
  brightness: number;
  vignette: number;
  vignetteSoftness: number;
  grain: number;
  aberration: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
}

const PROFILES: Record<PostFXProfileId, GradeParams> = {
  backrooms: {
    // Desaturate greens, push amber/yellow
    tint: [1.08, 0.98, 0.72],
    saturation: 0.72,
    contrast: 1.08,
    brightness: -0.02,
    vignette: 0.55,
    vignetteSoftness: 0.45,
    grain: 0.14,
    aberration: 0.0018,
    bloomStrength: 0.38,
    bloomRadius: 0.55,
    bloomThreshold: 0.72,
  },
  mart: {
    // Cool fluorescent white-blue wash
    tint: [0.88, 0.96, 1.12],
    saturation: 0.55,
    contrast: 1.12,
    brightness: 0.01,
    vignette: 0.42,
    vignetteSoftness: 0.5,
    grain: 0.09,
    aberration: 0.0012,
    bloomStrength: 0.55,
    bloomRadius: 0.65,
    bloomThreshold: 0.62,
  },
  hotel: {
    // Warm muted taupe — soft, quiet
    tint: [1.05, 0.96, 0.88],
    saturation: 0.65,
    contrast: 1.04,
    brightness: -0.01,
    vignette: 0.48,
    vignetteSoftness: 0.55,
    grain: 0.08,
    aberration: 0.0009,
    bloomStrength: 0.28,
    bloomRadius: 0.45,
    bloomThreshold: 0.78,
  },
};

/**
 * Combined found-footage pass: film grain, vignette, slight chromatic aberration,
 * and per-level color grade (sickly yellow / cool fluorescent / warm hotel).
 */
const FoundFootageShader = {
  name: "FoundFootageShader",
  uniforms: {
    tDiffuse: { value: null as unknown },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uTintR: { value: 1 },
    uTintG: { value: 1 },
    uTintB: { value: 1 },
    uSaturation: { value: 0.7 },
    uContrast: { value: 1 },
    uBrightness: { value: 0 },
    uVignette: { value: 0.5 },
    uVignetteSoftness: { value: 0.5 },
    uGrain: { value: 0.1 },
    uAberration: { value: 0.0015 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uTintR;
    uniform float uTintG;
    uniform float uTintB;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uBrightness;
    uniform float uVignette;
    uniform float uVignetteSoftness;
    uniform float uGrain;
    uniform float uAberration;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float filmGrain(vec2 uv, float t) {
      float n = hash(uv * uResolution * 0.5 + fract(t * 17.13) * 100.0);
      float n2 = hash(uv * uResolution * 1.7 - fract(t * 9.7) * 50.0);
      return (n + n2) * 0.5;
    }

    void main() {
      vec2 uv = vUv;
      vec2 center = uv - 0.5;
      float dist = length(center);

      // Slight chromatic aberration — documentary lens, not cyberpunk
      vec2 dir = center * uAberration * (1.0 + dist * 1.5);
      float r = texture2D(tDiffuse, uv + dir).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - dir).b;
      vec3 color = vec3(r, g, b);

      // Color grade
      color *= vec3(uTintR, uTintG, uTintB);

      // Desaturate (kill greens toward yellow via tint already; further mute)
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      // Extra green channel pull-down for backrooms-feel when sat low
      float greenPull = mix(1.0, 0.92, 1.0 - uSaturation);
      color.g *= greenPull;
      color = mix(vec3(luma), color, uSaturation);

      color = (color - 0.5) * uContrast + 0.5 + uBrightness;

      // Soft vignette
      float vig = smoothstep(
        uVignetteSoftness,
        1.0 - uVignette * 0.35,
        1.0 - dist * (0.85 + uVignette)
      );
      color *= mix(1.0 - uVignette * 0.85, 1.0, vig);

      // Film / VHS grain
      float grain = filmGrain(uv, uTime);
      color += (grain - 0.5) * uGrain;

      // Subtle scanline shimmer (very restrained)
      float scan = sin(uv.y * uResolution.y * 1.5 + uTime * 6.0) * 0.004 * uGrain * 8.0;
      color += scan;

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

function applyGradeToPass(pass: ShaderPass, grade: GradeParams): void {
  const u = pass.uniforms;
  u["uTintR"]!.value = grade.tint[0];
  u["uTintG"]!.value = grade.tint[1];
  u["uTintB"]!.value = grade.tint[2];
  u["uSaturation"]!.value = grade.saturation;
  u["uContrast"]!.value = grade.contrast;
  u["uBrightness"]!.value = grade.brightness;
  u["uVignette"]!.value = grade.vignette;
  u["uVignetteSoftness"]!.value = grade.vignetteSoftness;
  u["uGrain"]!.value = grade.grain;
  u["uAberration"]!.value = grade.aberration;
}

export interface CreatePostFXOptions {
  /** Enable SMAA antialiasing pass (recommended). */
  smaa?: boolean;
}

/**
 * Found-footage post pipeline: render → bloom → grade/grain/vignette → SMAA → output.
 */
export function createPostFX(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  options: CreatePostFXOptions = {},
): PostFXHandle {
  const size = new Vector2();
  renderer.getSize(size);
  const pixelRatio = renderer.getPixelRatio();
  const w = Math.floor(size.x * pixelRatio);
  const h = Math.floor(size.y * pixelRatio);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new Vector2(w, h),
    PROFILES.backrooms.bloomStrength,
    PROFILES.backrooms.bloomRadius,
    PROFILES.backrooms.bloomThreshold,
  );
  composer.addPass(bloomPass);

  const gradePass = new ShaderPass(FoundFootageShader);
  gradePass.uniforms["uResolution"]!.value.set(w, h);
  applyGradeToPass(gradePass, PROFILES.backrooms);
  composer.addPass(gradePass);

  let smaaPass: SMAAPass | null = null;
  if (options.smaa !== false) {
    smaaPass = new SMAAPass(w, h);
    composer.addPass(smaaPass);
  }

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  let profile: PostFXProfileId = "backrooms";
  let elapsed = 0;

  const setProfile = (levelId: PostFXProfileId): void => {
    profile = levelId;
    const grade = PROFILES[levelId];
    applyGradeToPass(gradePass, grade);
    bloomPass.strength = grade.bloomStrength;
    bloomPass.radius = grade.bloomRadius;
    bloomPass.threshold = grade.bloomThreshold;
  };

  const render = (deltaSeconds = 1 / 60): void => {
    elapsed += deltaSeconds;
    gradePass.uniforms["uTime"]!.value = elapsed;
    composer.render(deltaSeconds);
  };

  const resize = (
    width: number,
    height: number,
    pr: number = renderer.getPixelRatio(),
  ): void => {
    composer.setPixelRatio(pr);
    composer.setSize(width, height);
    const rw = Math.floor(width * pr);
    const rh = Math.floor(height * pr);
    bloomPass.resolution.set(rw, rh);
    gradePass.uniforms["uResolution"]!.value.set(rw, rh);
    smaaPass?.setSize(rw, rh);
  };

  const dispose = (): void => {
    composer.dispose();
    const mat = gradePass.material;
    if (mat instanceof ShaderMaterial) {
      mat.dispose();
    }
  };

  return {
    composer,
    setProfile,
    render,
    resize,
    dispose,
    getProfile: () => profile,
  };
}

export { PROFILES as POSTFX_PROFILES };
