// Field
export const FIELD_WIDTH = 640;
export const FIELD_HEIGHT = 480;

// Simulation
export const TICK_SECONDS = 1 / 60;
export const MAX_TICKS_PER_FRAME = 5;

// Firing
export const MIN_ANGLE = 0;
export const MAX_ANGLE = 180;
export const MIN_POWER = 0;
export const MAX_POWER = 1000;
export const POWER_PER_HEALTH = 10; // Power cap = Health * POWER_PER_HEALTH
export const POWER_STEP = 1;
export const POWER_STEP_FAST = 10; // with Shift
export const ANGLE_STEP = 1;
export const START_ANGLE = 90;
export const START_POWER = 500;

// Physics
export const GRAVITY = 280; // px/s², downward
export const POWER_TO_SPEED = 0.6; // px/s per Power unit
export const WIND_MAX = 20;
export const WIND_ACCELERATION_PER_UNIT = 2; // px/s² per Wind unit

// Tank
export const MAX_HEALTH = 100;
export const TANK_HALF_WIDTH = 7;
export const TANK_HEIGHT = 8;
export const BARREL_LENGTH = 12;
export const PAD_HALF_WIDTH = 10; // flattened ground each side of a Tank
export const TANK_FALL_PIXELS_PER_TICK = 2;

// Weapons
export const BABY_MISSILE = { name: "Baby Missile", radius: 20, maxDamage: 30 } as const;

// Explosion and Settling
export const EXPLOSION_SECONDS = 0.5;
export const SETTLE_PASSES_PER_TICK = 2;

// Terrain generation
export const TERRAIN_BASE_FRACTION = 0.65; // mean surface height as a fraction of FIELD_HEIGHT from the top
export const TERRAIN_MIN_FRACTION = 0.3;
export const TERRAIN_MAX_FRACTION = 0.92;
export const TERRAIN_HARMONICS = 4;
export const TERRAIN_MAX_AMPLITUDE = 70;

// Placement
export const PLACEMENT_EDGE_MARGIN = 24;
export const PLACEMENT_MAX_JITTER = 40;

// Match
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const DEFAULT_PLAYERS = 2;
export const DEFAULT_ROUNDS = 10;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 99;

// Computer Players
export const COMPUTER_THINK_SECONDS = 1.5;

// Shooter
export const SHOOTER_MIN_ANGLE = 30; // degrees above the horizontal, toward the Target
export const SHOOTER_MAX_ANGLE = 60;
export const SHOOTER_POWER_ERROR = 0.05; // ±5%
