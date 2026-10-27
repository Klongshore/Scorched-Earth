import type { Cue } from "../sim/cues";
import type { DeathAnimationKind, Weapon } from "../sim/types";

/**
 * Which Sound Effect to play. Later cues add more names. Each name is synthesized by the audio
 * module; this module only decides which, how loud and where.
 */
export type SoundName =
  | "launch"
  | "blast"
  | "thud"
  | "hit"
  | "destroyFireball"
  | "destroySparks"
  | "destroyDisintegrate"
  | "destroyPop"
  | "roundWin"
  | "roundDraw"
  | "rumble"
  | "landing"
  | "parachute"
  | "shieldUp"
  | "shieldHit"
  | "shieldBreak"
  | "launchMirv"
  | "launchFunky"
  | "launchRoller"
  | "launchDirt"
  | "split" // a MIRV breaking up
  | "scatter" // a Funky Bomb throwing out bomblets
  | "rollStart"; // a Roller touching down and starting to roll

export interface SoundPlan {
  readonly sound: SoundName;
  /** Loudness, 0 (silent) to 1 (full). */
  readonly gain: number;
  /** Stereo position, -1 (hard left) to 1 (hard right). */
  readonly pan: number;
  /** How big the event is, 0 to 1 (from blast radius); the synthesis uses it for depth and length. */
  readonly size: number;
}

/** Blast radius treated as the biggest there is (the Nuke's). */
const BIGGEST_RADIUS = 75;
const LAUNCH_GAIN = 0.35;
const EVENT_GAIN = 0.5;
const MIN_GAIN = 0.25;
const MAX_GAIN = 1;
const SHIELD_GAIN = 0.5;
const THUD_GAIN_SCALE = 0.7;
const HIT_GAIN = 0.6;
const DESTROY_GAIN = 0.9;
const STING_GAIN = 0.7;

const DESTROY_SOUNDS: Record<DeathAnimationKind, SoundName> = {
  fireball: "destroyFireball",
  sparkShower: "destroySparks",
  disintegration: "destroyDisintegrate",
  popAndSmoke: "destroyPop",
};
/** Dirt cells moving in one tick treated as the loudest rumble. */
const LOUDEST_DIRT_MOVE = 400;
const RUMBLE_MAX_GAIN = 0.6;
const LANDING_GAIN = 0.3;
const PARACHUTE_GAIN = 0.35;
/** Fall Damage treated as the hardest landing. */
const HARDEST_FALL_DAMAGE = 50;

const LAUNCH_SOUNDS: Readonly<Record<Weapon["kind"], SoundName>> = {
  blast: "launch",
  mirv: "launchMirv",
  funky: "launchFunky",
  roller: "launchRoller",
  dirt: "launchDirt",
};

/** Pan from a column: the left edge is -1, the right edge is 1. */
export function panAt(x: number, fieldWidth: number): number {
  return Math.max(-1, Math.min(1, (x / fieldWidth) * 2 - 1));
}

/** Pure: which Sound Effect a cue calls for, or null for silence. */
export function planSound(cue: Cue, fieldWidth: number): SoundPlan | null {
  switch (cue.kind) {
    case "fired":
      return {
        sound: LAUNCH_SOUNDS[cue.weaponKind],
        gain: LAUNCH_GAIN,
        pan: panAt(cue.x, fieldWidth),
        size: 0,
      };
    case "split":
      return { sound: "split", gain: EVENT_GAIN, pan: panAt(cue.x, fieldWidth), size: 0 };
    case "scattered":
      return { sound: "scatter", gain: EVENT_GAIN, pan: panAt(cue.x, fieldWidth), size: 0 };
    case "rollStarted":
      return { sound: "rollStart", gain: EVENT_GAIN, pan: panAt(cue.x, fieldWidth), size: 0 };
    // The flight whistle and the rolling rumble last as long as they last: the SoundPlayer starts
    // and stops them, so there is no one-shot to plan.
    case "launched":
    case "landed":
    case "rollEnded":
      return null;
    case "exploded": {
      const size = Math.max(0, Math.min(1, cue.radius / BIGGEST_RADIUS));
      // A modest curve: small blasts stay audible, big ones are clearly louder.
      const gain = MIN_GAIN + (MAX_GAIN - MIN_GAIN) * Math.sqrt(size);
      const dirt = cue.explosion === "dirt";
      return {
        sound: dirt ? "thud" : "blast",
        gain: dirt ? gain * THUD_GAIN_SCALE : gain,
        pan: panAt(cue.x, fieldWidth),
        size,
      };
    }
    case "tankHit":
      return { sound: "hit", gain: HIT_GAIN, pan: panAt(cue.x, fieldWidth), size: 0 };
    case "tankDestroyed":
      return {
        sound: DESTROY_SOUNDS[cue.animation],
        gain: DESTROY_GAIN,
        pan: panAt(cue.x, fieldWidth),
        size: 0.5,
      };
    case "roundWon":
      return { sound: "roundWin", gain: STING_GAIN, pan: 0, size: 0 };
    case "roundDraw":
      return { sound: "roundDraw", gain: STING_GAIN, pan: 0, size: 0 };
    case "dirtMoving": {
      const size = Math.max(0, Math.min(1, cue.amount / LOUDEST_DIRT_MOVE));
      // One rumble for the whole field: centred, and louder the more dirt moves.
      return { sound: "rumble", gain: RUMBLE_MAX_GAIN * Math.sqrt(size), pan: 0, size };
    }
    case "tankLanded": {
      const size = Math.max(0, Math.min(1, cue.fallDamage / HARDEST_FALL_DAMAGE));
      return {
        sound: "landing",
        gain: LANDING_GAIN + (MAX_GAIN - LANDING_GAIN) * Math.sqrt(size),
        pan: panAt(cue.x, fieldWidth),
        size,
      };
    }
    case "parachuteOpened":
      return { sound: "parachute", gain: PARACHUTE_GAIN, pan: panAt(cue.x, fieldWidth), size: 0 };
    case "shieldRaised":
      return { sound: "shieldUp", gain: SHIELD_GAIN, pan: panAt(cue.x, fieldWidth), size: 0 };
    case "shieldHit":
      return { sound: "shieldHit", gain: SHIELD_GAIN, pan: panAt(cue.x, fieldWidth), size: 0 };
    case "shieldBroken":
      return { sound: "shieldBreak", gain: SHIELD_GAIN, pan: panAt(cue.x, fieldWidth), size: 0 };
  }
}
