import type { Weapon, WeaponName } from "./types";

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
/** Every Weapon, in Shop order. */
export const WEAPONS: readonly Weapon[] = [
  { name: "Baby Missile", kind: "blast", bundle: null, price: 0, radius: 20, maxDamage: 30 },
  { name: "Missile", kind: "blast", bundle: 5, price: 1875, radius: 30, maxDamage: 50 },
  { name: "Baby Nuke", kind: "blast", bundle: 3, price: 10_000, radius: 45, maxDamage: 70 },
  { name: "Nuke", kind: "blast", bundle: 1, price: 12_000, radius: 75, maxDamage: 100 },
  { name: "MIRV", kind: "mirv", bundle: 3, price: 10_000, radius: 30, maxDamage: 50 },
  { name: "Funky Bomb", kind: "funky", bundle: 2, price: 7_000, radius: 30, maxDamage: 50 },
];

/** The Weapon with this name; throws for a name not in WEAPONS. */
export function weaponNamed(name: WeaponName): Weapon {
  const weapon = WEAPONS.find((w) => w.name === name);
  if (!weapon) throw new Error(`No Weapon named ${name}`);
  return weapon;
}

export const BABY_MISSILE = weaponNamed("Baby Missile");

// Splitters
export const MIRV_PIECES = 5; // what a MIRV splits into at the top of its arc
export const MIRV_PIECE_WEAPON: WeaponName = "Missile"; // also what an unsplit MIRV explodes as
export const MIRV_SPREAD = 30; // px/s of sideways speed between neighbouring pieces
export const FUNKY_MIN_BOMBLETS = 6;
export const FUNKY_MAX_BOMBLETS = 8;
export const FUNKY_BOMBLET_WEAPON: WeaponName = "Baby Missile";
export const FUNKY_MIN_ANGLE = 30; // degrees, 0 = right, 180 = left
export const FUNKY_MAX_ANGLE = 150;
export const FUNKY_MIN_SPEED = 100; // px/s
export const FUNKY_MAX_SPEED = 250;

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

// Money
export const STARTING_MONEY = 2000;
export const MONEY_PER_DAMAGE = 50; // per point of Health removed from another Tank
export const MONEY_PER_DESTROYED_TANK = 2000; // per other Tank an Explosion destroys
export const MONEY_PER_ROUND_WIN = 5000;

// Computer Players
export const COMPUTER_THINK_SECONDS = 1.5;
export const COMPUTER_THINK_TICKS = Math.round(COMPUTER_THINK_SECONDS / TICK_SECONDS);

// Shooter
export const SHOOTER_MIN_ANGLE = 30; // degrees above the horizontal, toward the Target
export const SHOOTER_MAX_ANGLE = 60;
export const SHOOTER_POWER_ERROR = 0.05; // ±5%

// Tosser
export const TOSSER_ANGLE = 45; // degrees above the horizontal, toward the Target
export const TOSSER_FIRST_POWER_ERROR = 0.25; // ±25%, on its first Turn at a Target
export const TOSSER_LOST_FACTOR = 0.8; // Power correction after a Projectile lost on the Target's side
export const TOSSER_MIN_FACTOR = 0.5;
export const TOSSER_MAX_FACTOR = 1.5;
