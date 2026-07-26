import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { createAudioDirector } from "./audio/director";
import {
  createCamera,
  createInput,
  createPlayer,
} from "./engine";
import {
  createEnemySystem,
  createHitscanFx,
  createThresholdRifle,
} from "./combat";
import { buildLevel } from "./levels";
import {
  applyAtmosphere,
  createBackroomsMaterialPack,
  createGarageMaterialPack,
  createHotelMaterialPack,
  createMartMaterialPack,
  createOfficeMaterialPack,
  createPlayplaceMaterialPack,
  createPoolroomsMaterialPack,
  createPostFX,
  type LevelMaterialPack,
} from "./rendering";
import type { AABB, LevelId, LevelBuildResult } from "./types";
import { LEVEL_ORDER } from "./types";
import { createHud } from "./ui/hud";

const params = new URLSearchParams(window.location.search);
const captureMode = params.get("capture") === "1";
const captureLevelParam = params.get("level");
const captureLevel: LevelId =
  captureLevelParam === "mart" ||
  captureLevelParam === "hotel" ||
  captureLevelParam === "backrooms" ||
  captureLevelParam === "poolrooms" ||
  captureLevelParam === "office" ||
  captureLevelParam === "garage" ||
  captureLevelParam === "playplace"
    ? captureLevelParam
    : "backrooms";
const captureYaw = Number(params.get("yaw") ?? "0.4");
const capturePitch = Number(params.get("pitch") ?? "-0.08");

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas");
}

const startBtn = document.getElementById("start-btn");
const hud = createHud();
const audio = createAudioDirector();

const renderer = new WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

const scene = new Scene();
const input = createInput(canvas);
const camCtrl = createCamera(window.innerWidth / window.innerHeight);
scene.add(camCtrl.camera);

const player = createPlayer(new Vector3(0, 0, 0));
const postfx = createPostFX(renderer, scene, camCtrl.camera);
const rifle = createThresholdRifle(camCtrl.camera);
const enemies = createEnemySystem();
const fx = createHitscanFx(scene);

let currentLevelId: LevelId = "backrooms";
let levelRoot: LevelBuildResult | null = null;
let colliders: AABB[] = [];
let materialPack: LevelMaterialPack | null = null;
let exitPos = new Vector3();
let running = false;
let damageFlash = 0;
let nearestEnemy = 0;
let exitLockUntil = 0;
let switching = false;

const packs: Record<LevelId, () => LevelMaterialPack> = {
  backrooms: createBackroomsMaterialPack,
  mart: createMartMaterialPack,
  hotel: createHotelMaterialPack,
  poolrooms: createPoolroomsMaterialPack,
  office: createOfficeMaterialPack,
  garage: createGarageMaterialPack,
  playplace: createPlayplaceMaterialPack,
};

rifle.setCallbacks({
  onRecoil: ({ punch }) => {
    camCtrl.addRecoil(punch * 0.085);
    audio.playGunshot();
  },
  onReloadStart: () => {
    audio.playReload();
  },
  onHitEnemy: (_enemy, point, dir) => {
    fx.spawnBlood(point, dir);
    fx.spawnTracer(rifle.getMuzzleWorld(), point);
  },
  onHitWorld: (point, normal) => {
    fx.spawnImpact(point, normal);
    fx.spawnTracer(rifle.getMuzzleWorld(), point);
  },
});

function disposeLevel(): void {
  if (levelRoot) {
    scene.remove(levelRoot.root);
    scene.remove(levelRoot.lights);
    levelRoot.root.traverse((obj) => {
      const mesh = obj as { geometry?: { dispose: () => void }; material?: unknown };
      if (mesh.geometry) mesh.geometry.dispose();
    });
    levelRoot = null;
  }
  enemies.clear(scene);
  materialPack?.dispose();
  materialPack = null;
}

function loadLevel(id: LevelId): void {
  disposeLevel();
  currentLevelId = id;

  materialPack = packs[id]();
  applyAtmosphere(scene, id);
  postfx.setProfile(id);
  audio.setLevel(id);

  const built = buildLevel(id, materialPack);
  levelRoot = built;
  colliders = built.colliders;
  exitPos.copy(built.exitPosition);

  scene.add(built.root);
  scene.add(built.lights);

  const feet = new Vector3(built.meta.spawn[0], 0.05, built.meta.spawn[2]);
  player.respawn(feet);
  player.state.yaw = 0;
  player.state.pitch = 0;

  enemies.spawnFrom(built.enemySpawns, scene);
  hud.setLevel(id, built.meta.objective);
  hud.setHealth(player.state.health, player.state.maxHealth);
  // Sync camera immediately so boot / transitions aren't at origin
  input.update();
  camCtrl.update(0, player.state, input.state);
}

async function switchLevel(id: LevelId): Promise<void> {
  if (switching) return;
  switching = true;
  const labels: Record<LevelId, string> = {
    backrooms: "NOCLIPPING → YELLOW ZONE",
    mart: "NOCLIPPING → AISLE ZERO",
    hotel: "NOCLIPPING → SOFT LOBBY",
    poolrooms: "NOCLIPPING → POOL THRESHOLD",
    office: "NOCLIPPING → INFINITE OFFICE",
    garage: "NOCLIPPING → SODIUM DECK",
    playplace: "NOCLIPPING → CLOSED PLAYPLACE",
  };
  await hud.showTransition(labels[id]);
  loadLevel(id);
  exitLockUntil = performance.now() + 2500;
  switching = false;
}

function checkExit(): void {
  if (switching || performance.now() < exitLockUntil) return;
  const p = player.state.position;
  const dx = p.x - exitPos.x;
  const dz = p.z - exitPos.z;
  if (dx * dx + dz * dz < 2.8 * 2.8) {
    const idx = LEVEL_ORDER.indexOf(currentLevelId);
    const next = LEVEL_ORDER[(idx + 1) % LEVEL_ORDER.length]!;
    void switchLevel(next);
  }
}

function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camCtrl.camera.aspect = w / h;
  camCtrl.camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  postfx.resize(w, h, renderer.getPixelRatio());
}

window.addEventListener("resize", onResize);

let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  if (!running) {
    postfx.render(dt);
    return;
  }

  input.update();

  if (input.state.levelSwitch) {
    void switchLevel(input.state.levelSwitch);
  }

  player.update(dt, input.state, colliders);
  camCtrl.update(dt, player.state, input.state);

  if (input.state.firing) {
    rifle.tryFire(camCtrl.camera, enemies.enemies, colliders);
  }
  if (input.state.reloadPressed) {
    rifle.startReload();
  }

  rifle.update(dt, time);
  enemies.update(dt, time, player.state, colliders, (dmg) => {
    const left = player.takeDamage(dmg);
    camCtrl.addDamagePunch(0.08 + dmg * 0.004);
    damageFlash = Math.min(1, damageFlash + 0.45);
    audio.playHurt();
    hud.setHealth(left, player.state.maxHealth);
    if (left <= 0) {
      player.heal(100);
      if (levelRoot) {
        const feet = new Vector3(
          levelRoot.meta.spawn[0],
          0.05,
          levelRoot.meta.spawn[2],
        );
        player.respawn(feet);
      }
      hud.setHealth(player.state.health, player.state.maxHealth);
    }
  });
  fx.update(dt);

  // Proximity dread
  nearestEnemy = 0;
  for (const e of enemies.enemies) {
    if (!e.alive) continue;
    const d = e.position.distanceTo(player.state.position);
    const intensity = Math.max(0, 1 - d / 18);
    if (intensity > nearestEnemy) nearestEnemy = intensity;
  }
  audio.playEntityNear(nearestEnemy);

  const hSpeed = Math.hypot(player.state.velocity.x, player.state.velocity.z);
  audio.setMoving(hSpeed > 1.2 && player.state.grounded, player.state.sprinting);

  damageFlash = Math.max(0, damageFlash - dt * 1.8);
  hud.setDamageFlash(damageFlash);
  hud.setAmmo(rifle.state);

  if (!captureMode) checkExit();
  postfx.render(dt);
}

requestAnimationFrame(frame);

async function startGame(): Promise<void> {
  await audio.resume();
  loadLevel("backrooms");
  hud.show();
  running = true;
  canvas!.requestPointerLock();
}

startBtn?.addEventListener("click", () => {
  void startGame();
});

if (captureMode) {
  const boot = document.getElementById("boot-screen");
  if (boot) {
    boot.classList.add("hidden");
    boot.style.display = "none";
  }
  document.getElementById("hud")?.classList.add("hidden");
  loadLevel(captureLevel);
  player.state.yaw = Number.isFinite(captureYaw) ? captureYaw : 0.4;
  player.state.pitch = Number.isFinite(capturePitch) ? capturePitch : -0.08;
  input.update();
  camCtrl.update(0, player.state, input.state);
  running = true;
  player.update = () => {
    /* capture freeze */
  };
  // Signal ready for headless capture
  document.documentElement.dataset.captureReady = "1";
} else {
  loadLevel("backrooms");
  running = false;
}
