/** Shared visual tokens — tropical candy stadium, not purple AI sludge. */
export const Palette = {
  void: 0x021820,
  deepTeal: 0x063a42,
  foam: 0xe8fff8,
  lime: 0x7cff3a,
  hot: 0xff3d6e,
  sun: 0xffc857,
  teal: 0x2ee6c0,
  skyTop: 0x3bb8ff,
  skyHorizon: 0xff9a5c,
  water: 0x0a5a68,
  platform: 0xff6b9d,
  platformAlt: 0x5ce1ff,
  hazard: 0xff3d6e,
  safe: 0x7cff3a,
  wood: 0xd4a574,
  metal: 0xb8c4cc,
} as const;

/** Course extents for lighting / shadow coverage (world Z). */
export const CourseBounds = {
  zNear: 10,
  zFar: -210,
  zCenter: -100,
  xHalf: 22,
} as const;

export const GameConfig = {
  gravity: -28,
  playerRadius: 0.42,
  playerHeight: 1.7,
  walkSpeed: 7.4,
  sprintSpeed: 11.8,
  jumpSpeed: 11.6,
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
  fallKillY: -12,
  checkpointGrace: 0.35,
} as const;
