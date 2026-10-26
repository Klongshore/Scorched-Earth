export type PlayerKind = "human" | "computer";
export type PersonalityName = "moron" | "shooter" | "tosser" | "chooser";

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
  fallen: number; // px fallen during the current Settling; 0 at rest
  parachute: boolean; // a Parachute is open for the current Settling
  shield: RaisedShield | null; // the raised Shield; null once its Shield Strength is gone
}

/** A Shield raised around a Tank: which one, and the Shield Strength it has left. */
export interface RaisedShield {
  readonly name: ShieldName;
  strength: number;
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

export type ShieldName = "Shield" | "Heavy Shield";
export type ItemName = ShieldName | "Parachute";
/** Anything the Shop sells. */
export type ShopName = WeaponName | ItemName;

interface ItemBase {
  readonly bundle: number;
  readonly price: number; // per Bundle
}

export type ShieldItem = ItemBase & {
  readonly name: ShieldName;
  readonly kind: "shield";
  readonly strength: number; // Shield Strength: damage it absorbs before it is gone
};

/** Something sold in the Shop that is not a Weapon. */
export type Item =
  | ShieldItem
  | (ItemBase & { readonly name: "Parachute"; readonly kind: "parachute" });

/** Anything the Shop sells: every Weapon but the Baby Missile, and every Item, each in Bundles. */
export type ForSale = (Weapon | Item) & { readonly bundle: number };

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

/** Health one Tank lost, to an Explosion or to Settling (Fall Damage). */
export interface HealthLoss {
  readonly playerId: number;
  readonly healthRemoved: number; // Health actually removed, never more than the Tank had
  readonly destroyed: boolean; // alive before, dead after
}

export interface Explosion {
  readonly kind: "carve" | "dirt"; // carve removes Terrain; dirt adds it instead
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly hits: readonly HealthLoss[]; // one per Tank whose Health it removed
  elapsed: number; // seconds since it started
}

/** Which of the Death Animations a destroyed Tank plays. */
export type DeathAnimationKind = "fireball" | "sparkShower" | "disintegration" | "popAndSmoke";

/**
 * A destroyed Tank's Death Animation, played where the Tank stood once the Turn has otherwise come
 * to rest. Pure spectacle: it damages no Tank and leaves the Terrain untouched.
 */
export interface DeathAnimation {
  readonly playerId: number; // whose Tank was destroyed
  readonly kind: DeathAnimationKind; // picked from the flavour Rng only
  readonly x: number; // the Tank's column, as Tank.x
  readonly y: number; // the row under the Tank, as Tank.y
  elapsed: number; // seconds since it started
}

/** What an on-screen line is: an Epitaph over a destroyed Tank, or a Taunt over a firing one. */
export type LineKind = "epitaph" | "taunt";

/**
 * A line of text shown for a few seconds above a Player's Tank, wherever that Tank stands. Pure
 * flavour: it never holds up the Round.
 */
export interface Line {
  readonly kind: LineKind;
  readonly playerId: number; // whose Tank it is shown above, in whose colour
  readonly text: string;
  secondsLeft: number; // gone once this reaches 0
}
