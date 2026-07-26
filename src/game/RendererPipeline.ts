import * as THREE from "three";
import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
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

export class RendererPipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly clock = new THREE.Clock();
  private bloom: BloomEffect;
  private chromatic: ChromaticAberrationEffect;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(Palette.skyTop);
    this.scene.fog = new THREE.FogExp2(Palette.skyHorizon, 0.012);

    this.camera = new THREE.PerspectiveCamera(
      78,
      window.innerWidth / window.innerHeight,
      0.08,
      420,
    );

    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new BloomEffect({
      intensity: 0.55,
      luminanceThreshold: 0.72,
      luminanceSmoothing: 0.35,
      mipmapBlur: true,
      radius: 0.55,
    });

    this.chromatic = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.00035, 0.00035),
      radialModulation: true,
      modulationOffset: 0.35,
    });

    const vignette = new VignetteEffect({
      darkness: 0.42,
      offset: 0.38,
    });

    const tone = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
      whitePoint: 4.2,
    });

    const grade = new HueSaturationEffect({
      saturation: 0.12,
    });

    const contrast = new BrightnessContrastEffect({
      brightness: 0.02,
      contrast: 0.08,
    });

    const smaa = new SMAAEffect();

    this.composer.addPass(
      new EffectPass(
        this.camera,
        this.bloom,
        this.chromatic,
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
    this.bloom.intensity = 0.45 + t * 0.55;
    const aberration = 0.0003 + t * 0.0012;
    this.chromatic.offset.set(aberration, aberration * 0.85);
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  };
}
