import * as THREE from "three";
import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  NormalPass,
  RenderPass,
  SMAAEffect,
  SSAOEffect,
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
  private ssao: SSAOEffect;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = true;
    this.renderer.setClearColor(Palette.skyHorizon, 1);

    this.scene = new THREE.Scene();
    // Linear fog: mid-course stays readable, horizon still melts into sky
    this.scene.fog = new THREE.Fog(Palette.skyHorizon, 38, 210);

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
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Half-res normals keep SSAO cheap on mid GPUs
    const normalPass = new NormalPass(this.scene, this.camera, {
      resolutionScale: 0.5,
    });
    this.composer.addPass(normalPass);

    this.ssao = new SSAOEffect(this.camera, normalPass.texture, {
      samples: 18,
      rings: 6,
      intensity: 3.15,
      radius: 0.32,
      bias: 0.015,
      fade: 0.008,
      luminanceInfluence: 0.06,
      minRadiusScale: 0.12,
      worldDistanceThreshold: 80,
      worldDistanceFalloff: 28,
      worldProximityThreshold: 2.0,
      worldProximityFalloff: 0.3,
      resolutionScale: 0.75,
      depthAwareUpsampling: true,
      color: new THREE.Color(0x021820),
    });

    this.bloom = new BloomEffect({
      intensity: 0.18,
      luminanceThreshold: 0.94,
      luminanceSmoothing: 0.32,
      mipmapBlur: true,
      radius: 0.32,
    });

    this.chromatic = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0003, 0.0003),
      radialModulation: true,
      modulationOffset: 0.35,
    });

    const vignette = new VignetteEffect({
      darkness: 0.48,
      offset: 0.26,
    });

    const tone = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
      whitePoint: 2.15,
      middleGrey: 0.3,
    });

    const grade = new HueSaturationEffect({
      saturation: 0.14,
    });

    const contrast = new BrightnessContrastEffect({
      brightness: -0.08,
      contrast: 0.38,
    });

    const smaa = new SMAAEffect();

    // Convolution effects (SSAO / chromatic) cannot share an EffectPass
    this.composer.addPass(new EffectPass(this.camera, this.ssao));
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
    this.composer.addPass(new EffectPass(this.camera, this.chromatic));

    window.addEventListener("resize", this.onResize);
  }

  setSpeedFx(normalizedSpeed: number): void {
    const t = THREE.MathUtils.clamp(normalizedSpeed, 0, 1);
    this.bloom.intensity = 0.16 + t * 0.14;
    const aberration = 0.00012 + t * 0.0006;
    this.chromatic.offset.set(aberration, aberration * 0.85);
    this.ssao.intensity = 2.9 + t * 0.35;
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
