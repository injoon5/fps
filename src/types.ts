import type { Group, Scene, Vector3 } from "three";

export type LevelId = "backrooms" | "mart" | "hotel";

export interface LevelMeta {
  id: LevelId;
  name: string;
  objective: string;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  ambient: number;
  spawn: [number, number, number];
}

export interface LevelBuildResult {
  root: Group;
  colliders: AABB[];
  lights: Group;
  enemySpawns: Vector3[];
  exitPosition: Vector3;
  meta: LevelMeta;
}

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface EnemyState {
  id: number;
  position: Vector3;
  velocity: Vector3;
  health: number;
  maxHealth: number;
  alive: boolean;
  state: "idle" | "patrol" | "chase" | "attack" | "dead";
  attackCooldown: number;
  mesh: Group;
}

export interface WeaponState {
  name: string;
  ammo: number;
  reserve: number;
  magSize: number;
  fireRate: number;
  damage: number;
  recoil: number;
  reloadTime: number;
  reloading: boolean;
  lastShot: number;
}

export interface PlayerState {
  position: Vector3;
  velocity: Vector3;
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  sprinting: boolean;
  grounded: boolean;
}

export interface GameContext {
  scene: Scene;
  levelId: LevelId;
  colliders: AABB[];
  enemies: EnemyState[];
  player: PlayerState;
  weapon: WeaponState;
  time: number;
  dt: number;
}

export const LEVEL_ORDER: LevelId[] = ["backrooms", "mart", "hotel"];
