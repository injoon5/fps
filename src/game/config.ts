/** Shared visual tokens — tropical candy stadium, not purple AI sludge. */
export const Palette = {
  void: 0x021820,
  deepTeal: 0x054048,
  foam: 0xf4fff8,
  lime: 0x9dff45,
  hot: 0xff2d6f,
  sun: 0xffd24a,
  teal: 0x2af0c8,
  skyTop: 0x4ec8ff,
  skyHorizon: 0xff8a4a,
  water: 0x087a88,
  platform: 0xff4d9a,
  platformAlt: 0x3de8ff,
  hazard: 0xff2d6f,
  safe: 0x9dff45,
  wood: 0xe0a060,
  metal: 0xc4d0d8,
} as const;

/** Course extents for lighting / shadow coverage (world Z). */
export const CourseBounds = {
  zNear: 10,
  zFar: -210,
  zCenter: -100,
  xHalf: 22,
} as const;

export const GameConfig = {
  gravity: -16.5,
  playerRadius: 0.42,
  playerHeight: 1.7,
  walkSpeed: 5.2,
  sprintSpeed: 8.0,
  jumpSpeed: 10.4,
  /** Ground accel toward wish (1/s exponential). Higher = snappier. */
  groundAccel: 22,
  /** Ground stop/friction when no wish (1/s). */
  groundDecel: 28,
  /** Air accel toward wish (1/s). Lower = floatier. */
  airAccel: 6.5,
  /** Max air speed you can accelerate up to (wish cap still applies via accel). */
  airSpeedCap: 9.5,
  mouseSensitivity: 0.0022,
  fov: 78,
  sprintFov: 88,
  /** Extra FOV kick on jump, decays over jumpFovDecay seconds. */
  jumpFovPunch: 6.5,
  jumpFovDecay: 0.22,
  /** Camera eye dip on land (meters), scales with impact. */
  landDipAmp: 0.11,
  landDipDecay: 9,
  headBobAmp: 0.04,
  headBobFreq: 11.5,
  /** How long after leaving ground you can still jump. */
  coyoteTime: 0.08,
  /** How early a jump press is remembered. */
  jumpBuffer: 0.1,
  /** Skin inset above capsule sole for foot ray origin. */
  groundRaySkin: 0.08,
  /** Extra cast length below the sole. */
  groundRayExtra: 0.18,
  /** Min upward normal.y to count as walkable (rejects walls). */
  groundNormalMinY: 0.45,
  /** Max downward/upward vertical speed still considered grounded. */
  groundMaxVy: 2.2,
  fallKillY: -1.25,
  checkpointGrace: 0.35,
} as const;
