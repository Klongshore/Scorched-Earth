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
}

export interface Explosion {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  elapsed: number; // seconds since it started
}
