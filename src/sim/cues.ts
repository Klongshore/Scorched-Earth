import type { Weapon, WeaponName } from "./types";

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
  | { readonly kind: "rollEnded"; readonly x: number };

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
