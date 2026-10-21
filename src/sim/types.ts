export type PlayerKind = "human" | "computer";
export type PersonalityName = "moron" | "shooter";

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

export interface Weapon {
  readonly name: string;
  readonly radius: number;
  readonly maxDamage: number;
}

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
