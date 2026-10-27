import type { DeathAnimationKind, Weapon, WeaponName } from "./types";

/**
 * Something that happened in a Round, recorded for the game loop to turn into a Sound Effect.
 * Cues are write-only from the simulation's side: nothing in a Round reads them back, and
 * recording one never draws from the simulation's Rng (ADR 0003). Later cues are added to this
 * union.
 */
export type Cue =
  /** A Tank launched a Weapon from the barrel at column `x`. */
  | {
      readonly kind: "fired";
      readonly weapon: WeaponName;
      readonly weaponKind: Weapon["kind"];
      readonly x: number;
    }
  /** An Explosion began at (x, y); `explosion` is "dirt" for a Dirt Weapon, which adds dirt. */
  | {
      readonly kind: "exploded";
      readonly explosion: "carve" | "dirt";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
    }
  /** A Tank lost Health and survived; (x, y) is where it stands. */
  | { readonly kind: "tankHit"; readonly x: number; readonly y: number }
  /** A Tank was destroyed and its Death Animation of this kind began at (x, y). */
  | {
      readonly kind: "tankDestroyed";
      readonly animation: DeathAnimationKind;
      readonly x: number;
      readonly y: number;
    }
  /** The Round ended with one Tank standing. */
  | { readonly kind: "roundWon" }
  /** The Round ended with no Tank standing. */
  | { readonly kind: "roundDraw" }
  /** Settling moved `amount` cells of dirt this tick. Recorded only while dirt moves, never at rest. */
  | { readonly kind: "dirtMoving"; readonly amount: number }
  /** A Tank at column `x` landed after a fall, taking `fallDamage` (0 under a Parachute). */
  | { readonly kind: "tankLanded"; readonly x: number; readonly fallDamage: number }
  /** A Tank's Parachute opened at column `x`. */
  | { readonly kind: "parachuteOpened"; readonly x: number }
  /** A Shield went up around the Tank at column `x`. */
  | { readonly kind: "shieldRaised"; readonly x: number }
  /** A Shield absorbed Explosion damage and still stands, around the Tank at (x, y). */
  | { readonly kind: "shieldHit"; readonly x: number; readonly y: number }
  /** A Shield's Shield Strength ran out, leaving the Tank at (x, y) exposed. */
  | { readonly kind: "shieldBroken"; readonly x: number; readonly y: number }
  /** A Projectile took to the air at column `x`: its flight sound starts (or joins in). */
  | { readonly kind: "launched"; readonly x: number }
  /** A Projectile's flight ended, landed, lost or replaced by pieces: its flight sound stops. */
  | { readonly kind: "landed"; readonly x: number }
  /** A MIRV split into its pieces at (x, y). */
  | { readonly kind: "split"; readonly x: number; readonly y: number }
  /** A Funky Bomb scattered its bomblets from (x, y). */
  | { readonly kind: "scattered"; readonly x: number; readonly y: number }
  /** A Roller touched Terrain at column `x` and began rolling. */
  | { readonly kind: "rollStarted"; readonly x: number }
  /** A rolling Roller stopped rolling (it exploded or rolled off the field). */
  | { readonly kind: "rollEnded"; readonly x: number }
  /**
   * Once per tick while any Projectile is in the air (`loop` "flight") or any Roller is rolling
   * ("roll"): the mean column of that group, so its loop can follow it across the field.
   */
  | { readonly kind: "loopAt"; readonly loop: "flight" | "roll"; readonly x: number };

/** The cues recorded since the last drain, oldest first. */
export class CueBuffer {
  private cues: Cue[] = [];

  record(cue: Cue): void {
    this.cues.push(cue);
  }

  /** Hand over every cue recorded so far and forget them. */
  drain(): Cue[] {
    const drained = this.cues;
    this.cues = [];
    return drained;
  }
}
