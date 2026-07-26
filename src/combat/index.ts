/**
 * THRESHOLD combat — hitscan rifle, liminal entities, impact FX.
 *
 * Wire into the main loop:
 *
 * ```ts
 * import {
 *   createThresholdRifle,
 *   createEnemySystem,
 *   createHitscanFx,
 * } from "./combat";
 *
 * const rifle = createThresholdRifle(camera);
 * const enemies = createEnemySystem();
 * const fx = createHitscanFx(scene);
 *
 * rifle.setCallbacks({
 *   onRecoil: ({ pitch, yaw, punch }) => { // screen shake / camera kick },
 *   onFire: (muzzle, dir) => {
 *     // optional: always draw a short tracer toward aim
 *   },
 *   onHitEnemy: (enemy, point, dir) => {
 *     fx.spawnBlood(point, dir);
 *     fx.spawnTracer(rifle.getMuzzleWorld(), point);
 *   },
 *   onHitWorld: (point, normal) => {
 *     fx.spawnImpact(point, normal);
 *     fx.spawnTracer(rifle.getMuzzleWorld(), point);
 *   },
 * });
 *
 * // On level load:
 * enemies.spawnFrom(level.enemySpawns, scene);
 * ctx.enemies = enemies.enemies;
 * ctx.weapon = rifle.state;
 *
 * // Input:
 * if (mouseDown) rifle.tryFire(camera, enemies.enemies, colliders);
 * if (pressedR) rifle.startReload();
 *
 * // Frame:
 * rifle.update(dt, time);
 * enemies.update(dt, time, player, colliders, (dmg) => {
 *   player.health = Math.max(0, player.health - dmg);
 * });
 * fx.update(dt);
 * ```
 */

export {
  createThresholdRifle,
  createViewModel,
  createWeaponState,
  type FireResult,
  type RecoilEvent,
  type ThresholdRifle,
  type WeaponCallbacks,
} from "./weapon";

export {
  clearEnemies,
  createEnemySystem,
  ENEMY_LIMITS,
  spawnEnemies,
  updateEnemies,
  type EnemyAttackCallback,
  type EnemySystem,
} from "./enemies";

export {
  createHitscanFx,
  intersectRayAABB,
  raycastColliders,
  raycastEnemies,
  type HitscanFx,
  type RayHit,
} from "./projectiles";
