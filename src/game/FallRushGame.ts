import * as THREE from "three";
import { GameConfig } from "./config";
import { RendererPipeline } from "./RendererPipeline";
import { PhysicsWorld } from "./PhysicsWorld";
import { PlayerController } from "./PlayerController";
import { MaterialLibrary } from "./materials";
import { buildEnvironment } from "./environment";
import { buildCourse, type CourseHandles } from "./Course";
import { GameAudio } from "./Audio";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export class FallRushGame {
  private readonly pipeline: RendererPipeline;
  private readonly physics = new PhysicsWorld();
  private readonly mats = new MaterialLibrary();
  private readonly audio = new GameAudio();
  private player!: PlayerController;
  private course!: CourseHandles;
  private env!: ReturnType<typeof buildEnvironment>;

  private readonly overlay = $("overlay");
  private readonly finishOverlay = $("finish");
  private readonly hud = $("hud");
  private readonly timerEl = $("timer");
  private readonly checkpointEl = $("checkpoint");
  private readonly speedEl = $("speed");
  private readonly finishTimeEl = $("finish-time");
  private readonly vignette = $("damage-vignette");
  private readonly pauseHint = $("pause-hint");

  private running = false;
  private finished = false;
  private startMs = 0;
  private elapsedMs = 0;
  private checkpointIndex = 0;
  private anim = 0;
  private time = 0;
  private disposed = false;
  private checkpointToastTimer = 0;
  /** Temporary cinematic fly path for screenshots / attract polish. */
  private debugFly = false;
  /** When true, attract loop won't overwrite an explicit capture camera. */
  private cameraLocked = false;
  private readonly playerBox = new THREE.Box3();
  private readonly playerSize = new THREE.Vector3(0.5, 1.6, 0.5);

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.pipeline = new RendererPipeline(canvas);
  }

  async init(): Promise<void> {
    await this.physics.init();

    this.env = buildEnvironment(this.pipeline.scene);
    this.course = buildCourse(this.pipeline.scene, this.physics, this.mats);

    this.player = new PlayerController(
      this.pipeline.camera,
      this.physics,
      this.canvas,
    );
    this.pipeline.scene.add(this.player.yawObject);
    this.player.spawnAt(this.course.spawn);
    this.player.bindInput();
    this.player.onJump = () => this.audio.jump();
    this.player.onLand = (impact) => this.audio.land(impact);

    $("start-btn").addEventListener("click", () => void this.start());
    $("retry-btn").addEventListener("click", () => void this.retry());
    document.addEventListener("pointerlockchange", this.onLockChange);

    // Capture / QA hook: window.__FALL_RUSH__.enableDebugFly()
    (
      window as Window & {
        __FALL_RUSH__?: {
          enableDebugFly: () => void;
          setCamera: (x: number, y: number, z: number, lx: number, ly: number, lz: number) => void;
          hideUi: () => void;
          startGame: () => void;
        };
      }
    ).__FALL_RUSH__ = {
      enableDebugFly: () => {
        this.debugFly = true;
        this.cameraLocked = false;
        this.running = false;
        this.finished = false;
        this.overlay.classList.add("hidden");
        this.finishOverlay.classList.add("hidden");
        this.hud.classList.add("hidden");
      },
      setCamera: (x, y, z, lx, ly, lz) => {
        this.debugFly = false;
        this.cameraLocked = true;
        this.running = false;
        const cam = this.pipeline.camera;
        cam.position.set(x, y, z);
        cam.lookAt(lx, ly, lz);
        this.pipeline.setFov(58);
        this.pipeline.setSpeedFx(0.32);
      },
      hideUi: () => {
        this.overlay.classList.add("hidden");
        this.finishOverlay.classList.add("hidden");
        this.hud.classList.add("hidden");
        this.pauseHint.classList.add("hidden");
      },
      startGame: () => {
        this.cameraLocked = false;
        this.debugFly = false;
        void this.start();
      },
    };

    this.loop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.anim);
    window.clearTimeout(this.checkpointToastTimer);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.player?.dispose();
    this.course?.dispose();
    this.env?.dispose();
    this.mats.dispose();
    this.physics.dispose();
    this.audio.dispose();
    this.pipeline.dispose();
  }

  private async start(): Promise<void> {
    await this.audio.unlock();
    this.cameraLocked = false;
    this.debugFly = false;
    this.overlay.classList.add("hidden");
    this.finishOverlay.classList.add("hidden");
    this.finishOverlay.classList.remove("celebrate");
    this.hud.classList.remove("hidden", "paused");
    this.pauseHint.classList.add("hidden");
    this.finished = false;
    this.running = true;
    this.startMs = performance.now();
    this.elapsedMs = 0;
    this.checkpointIndex = 0;
    this.checkpointEl.textContent = this.course.checkpoints[0]!.name;
    this.checkpointEl.classList.remove("toast");
    this.player.respawn();
    this.player.setCheckpoint(this.course.spawn);
    this.player.requestLock();
  }

  private async retry(): Promise<void> {
    this.player.setCheckpoint(this.course.spawn);
    this.checkpointIndex = 0;
    await this.start();
  }

  private onLockChange = (): void => {
    if (!this.running || this.finished) return;
    if (document.pointerLockElement !== this.canvas) {
      this.hud.classList.add("paused");
      this.pauseHint.classList.remove("hidden");
    } else {
      this.hud.classList.remove("paused");
      this.pauseHint.classList.add("hidden");
    }
  };

  private loop = (): void => {
    this.anim = requestAnimationFrame(this.loop);
    if (this.disposed) return;

    const dt = this.pipeline.render();
    this.time += dt;

    this.mats.update(this.time);
    this.env.update(this.time, this.pipeline.camera.position);
    this.course.update(this.time, dt, this.physics);

    if (this.running && !this.finished) {
      if (this.player.isLocked) {
        const { speed, fov } = this.player.update(dt);
        this.physics.step();
        // re-sync after physics
        const t = this.player.rigidBody.translation();
        this.player.yawObject.position.set(t.x, t.y, t.z);

        this.pipeline.setFov(fov);
        this.pipeline.setSpeedFx(speed / GameConfig.sprintSpeed);
        this.speedEl.innerHTML = `${speed.toFixed(0)} <span>m/s</span>`;

        this.elapsedMs = performance.now() - this.startMs;
        this.timerEl.textContent = formatTime(this.elapsedMs);

        this.checkFall(t.y);
        this.checkCheckpoints(t.x, t.y, t.z);
        this.checkFinish(t.x, t.y, t.z);
      } else {
        this.physics.step();
      }
    } else {
      // Attract / debug fly: showcase lit pads + contact shadows down the course
      if (!this.running) {
        this.updateAttractCamera();
      }
      this.physics.step();
    }
  };

  private updateAttractCamera(): void {
    if (this.cameraLocked) return;

    const cam = this.pipeline.camera;
    const t = this.time;

    if (this.debugFly) {
      // Slow cinematic dolly along -Z so screenshots catch soft shadows on pads
      const z = 6 - ((t * 9) % 200);
      const x = Math.sin(t * 0.35) * 4.5;
      const y = 7.5 + Math.sin(t * 0.45) * 1.2;
      cam.position.set(x, y, z);
      cam.lookAt(Math.sin(t * 0.2) * 1.5, 1.2, z - 18);
      this.pipeline.setFov(56);
      this.pipeline.setSpeedFx(0.35);
      return;
    }

    // Title attract: low three-quarter over start pad looking down the lit course
    const sway = Math.sin(t * 0.28);
    cam.position.set(
      9.5 + sway * 2.2,
      6.8 + Math.sin(t * 0.5) * 0.55,
      7.5 + Math.cos(t * 0.22) * 1.8,
    );
    cam.lookAt(0.4, 1.1, -16 - Math.sin(t * 0.18) * 4);
    this.pipeline.setFov(58);
    this.pipeline.setSpeedFx(0.28);
  }

  private checkFall(y: number): void {
    if (y > GameConfig.fallKillY) return;
    this.flashDamage();
    this.audio.fall();
    this.player.respawn();
  }

  private checkCheckpoints(x: number, y: number, z: number): void {
    const next = this.course.checkpoints[this.checkpointIndex + 1];
    if (!next) return;
    const d = next.position.distanceTo(new THREE.Vector3(x, y, z));
    if (d < 3.2) {
      this.checkpointIndex = next.index;
      this.player.setCheckpoint(next.position.clone().setY(next.position.y));
      this.checkpointEl.textContent = next.name;
      this.flashCheckpointToast();
      this.audio.checkpoint();
    }
  }

  private checkFinish(x: number, y: number, z: number): void {
    this.playerBox.setFromCenterAndSize(
      new THREE.Vector3(x, y, z),
      this.playerSize,
    );
    if (!this.course.finishZone.intersectsBox(this.playerBox)) return;
    this.finished = true;
    this.running = false;
    document.exitPointerLock();
    this.pauseHint.classList.add("hidden");
    this.hud.classList.remove("paused");
    this.finishTimeEl.textContent = formatTime(this.elapsedMs);
    this.finishOverlay.classList.add("celebrate");
    this.finishOverlay.classList.remove("hidden");
    this.hud.classList.add("hidden");
    this.audio.finish();
  }

  private flashCheckpointToast(): void {
    this.checkpointEl.classList.remove("toast");
    // Force reflow so the toast animation retriggers on rapid advances
    void this.checkpointEl.offsetWidth;
    this.checkpointEl.classList.add("toast");
    window.clearTimeout(this.checkpointToastTimer);
    this.checkpointToastTimer = window.setTimeout(() => {
      this.checkpointEl.classList.remove("toast");
    }, 700);
  }

  private flashDamage(): void {
    this.vignette.classList.add("active");
    window.setTimeout(() => this.vignette.classList.remove("active"), 280);
  }
}
