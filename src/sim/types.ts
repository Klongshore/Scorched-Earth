export type PlayerKind = "human" | "computer";
export type PersonalityName = "moron" | "shooter" | "tosser";

/** What the Setup screen asks for, one per Player. */
export type PlayerSetup = { kind: "human" } | { kind: "computer"; personality: PersonalityName };

export interface Player {
  readonly id: number; // index into Match.players
  readonly name: string; // "Player 1", "Player 2"
  readonly color: string; // CSS colour, used by the renderer only
  readonly kind: PlayerKind;
  readonly personality: PersonalityName | null; // non-null iff kind === "computer"
}

export interface Tank {
  readonly playerId: number;
  x: number; // integer centre column
  y: number; // ground row (see Tank geometry)
  angle: number; // integer degrees
  power: number; // integer
  health: number; // integer 0..100
}

export type WeaponName =
  | "Baby Missile"
  | "Missile"
  | "Baby Nuke"
  | "Nuke"
  | "MIRV"
  | "Funky Bomb"
  | "Baby Roller"
  | "Roller"
  | "Heavy Roller"
  | "Dirt Clod"
  | "Dirt Ball"
  | "Ton of Dirt";

interface WeaponBase {
  readonly name: WeaponName;
  readonly radius: number;
  readonly bundle: number | null; // null only for the Baby Missile: never bought, never used up
  readonly price: number; // per Bundle
}

/** A Weapon, keyed on how it behaves. */
export type Weapon =
  | (WeaponBase & { readonly kind: "blast"; readonly maxDamage: number })
  | (WeaponBase & { readonly kind: "mirv"; readonly maxDamage: number }) // splits at the top of its arc
  | (WeaponBase & { readonly kind: "funky"; readonly maxDamage: number }) // scatters bomblets on landing
  | (WeaponBase & { readonly kind: "roller"; readonly maxDamage: number })
  | (WeaponBase & { readonly kind: "dirt" }); // adds dirt, damages no one

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly weapon: Weapon;
  readonly firedBy: number; // playerId
  /** Set once a Roller has touched Terrain: which way it rolls and how long it has rolled. */
  rolling?: { direction: -1 | 1; seconds: number } | null;
}

/** What an Explosion did to one Tank it damaged. */
export interface ExplosionHit {
  readonly playerId: number;
  readonly healthRemoved: number; // Health actually removed, never more than the Tank had
  readonly destroyed: boolean; // alive before, dead after
}

export interface Explosion {
  readonly kind: "blast" | "dirt"; // dirt adds Terrain instead of removing it
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly hits: readonly ExplosionHit[]; // one per Tank whose Health it removed
  elapsed: number; // seconds since it started
}
