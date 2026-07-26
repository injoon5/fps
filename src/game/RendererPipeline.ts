import * as THREE from "three";
import {
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
import { Palette } from "./config";

/**
 * Stable post stack only — no SSAO/NormalPass/chromatic.
 * Half-res AO + separate convolution passes were causing intermittent
 * half-framebuffer white/grey blocks on some GPUs.
 */
export class RendererPipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly clock = new THREE.Clock();
  private bloom: BloomEffect;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = true;
    this.renderer.setClearColor(Palette.skyHorizon, 1);
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xffb070, 55, 260);

    this.camera = new THREE.PerspectiveCamera(
      78,
      window.innerWidth / window.innerHeight,
      0.08,
      420,
    );

    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    });
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new BloomEffect({
      intensity: 0.16,
      luminanceThreshold: 0.95,
      luminanceSmoothing: 0.5,
      mipmapBlur: true,
      radius: 0.32,
    });

    const vignette = new VignetteEffect({
      darkness: 0.28,
      offset: 0.4,
    });

    const tone = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
      whitePoint: 4.0,
      middleGrey: 0.35,
    });

    const grade = new HueSaturationEffect({
      saturation: 0.26,
    });

    const contrast = new BrightnessContrastEffect({
      brightness: 0.03,
      contrast: 0.14,
    });

    const smaa = new SMAAEffect();

    // Single EffectPass — no convolution siblings, no half-res buffers
    this.composer.addPass(
      new EffectPass(
        this.camera,
        this.bloom,
        grade,
        contrast,
        tone,
        vignette,
        smaa,
      ),
    );

    window.addEventListener("resize", this.onResize);
  }

  setSpeedFx(normalizedSpeed: number): void {
    const t = THREE.MathUtils.clamp(normalizedSpeed, 0, 1);
    this.bloom.intensity = 0.14 + t * 0.08;
  }

  setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) < 0.05) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  render(): number {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.composer.render(dt);
    return dt;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    this.composer.dispose();
    this.renderer.dispose();
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
  };
}
