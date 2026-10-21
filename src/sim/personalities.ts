import { powerToHit } from "./aiming";
import {
  MAX_ANGLE,
  MIN_ANGLE,
  MIN_POWER,
  SHOOTER_MAX_ANGLE,
  SHOOTER_MIN_ANGLE,
  SHOOTER_POWER_ERROR,
  TOSSER_ANGLE,
  TOSSER_FIRST_POWER_ERROR,
  TOSSER_LOST_FACTOR,
  TOSSER_MAX_FACTOR,
  TOSSER_MIN_FACTOR,
} from "./constants";
import type { Rng } from "./rng";
import { isAlive, powerCap } from "./tank";
import type { PersonalityName, Tank } from "./types";

export interface Aim {
  angle: number;
  power: number;
}

/** Where a Computer Player's last Projectile ended up. */
export type Landing = { kind: "hit"; x: number } | { kind: "lost"; side: "left" | "right" };

/**
 * What a Computer Player remembers between its Turns within one Round. Each Round starts
 * a fresh one, because Tanks are recreated every Round.
 */
export interface ComputerMemory {
  targetId: number | null; // playerId of the Target
  lastAim: Aim | null; // the Tosser's last Angle and Power at this Target
  lastLanding: Landing | null;
}

export function newComputerMemory(): ComputerMemory {
  return { targetId: null, lastAim: null, lastLanding: null };
}

/**
 * Keep the remembered Target while its Tank is alive; otherwise pick a random living
 * opponent with rng, remember it, and forget the aim and landing at the old one. Never
 * called once `self` is the only living Tank: the Round has already ended.
 */
export function chooseTarget(
  memory: ComputerMemory,
  self: Tank,
  tanks: readonly Tank[],
  rng: Rng,
): Tank {
  const kept = tanks.find((t) => t.playerId === memory.targetId);
  if (kept && kept !== self && isAlive(kept)) return kept;

  const opponents = tanks.filter((t) => t !== self && isAlive(t));
  if (opponents.length === 0) throw new Error(`Player ${self.playerId} has no living opponent`);
  const target = opponents[rng.int(0, opponents.length - 1)] as Tank;
  memory.targetId = target.playerId;
  memory.lastAim = null;
  memory.lastLanding = null;
  return target;
}

/** Choose a Computer Player's aim for its Turn according to its Personality. */
export function chooseAim(
  personality: PersonalityName,
  self: Tank,
  tanks: readonly Tank[],
  memory: ComputerMemory,
  rng: Rng,
): Aim {
  switch (personality) {
    case "moron":
      // A random Angle and a random Power within the Tank's Health-based cap. It ignores
      // tanks and memory, and must keep drawing exactly these two ints so seeded Matches
      // with only Morons play out as they always have.
      return { angle: rng.int(MIN_ANGLE, MAX_ANGLE), power: rng.int(0, powerCap(self)) };
    case "shooter":
      return shooterAim(self, chooseTarget(memory, self, tanks, rng), rng);
    case "tosser": {
      const aim = tosserAim(self, chooseTarget(memory, self, tanks, rng), memory, rng);
      memory.lastAim = aim;
      return aim;
    }
  }
}

/** Clamp a Power to MIN_POWER..the Tank's Health-based cap. */
function capped(self: Tank, power: number): number {
  return Math.min(powerCap(self), Math.max(MIN_POWER, power));
}

/** `base` degrees above the horizontal, toward the Target: 0° points right. */
function towards(self: Tank, target: Tank, base: number): number {
  return target.x >= self.x ? base : 180 - base;
}

/**
 * The Shooter's aim at `target`: a random Angle in its band toward the Target, and the Power
 * to hit it ignoring Wind and Terrain (or the Power cap if none can), plus up to ±powerError.
 */
export function shooterAim(
  self: Tank,
  target: Tank,
  rng: Rng,
  powerError: number = SHOOTER_POWER_ERROR,
): Aim {
  const angle = towards(self, target, rng.int(SHOOTER_MIN_ANGLE, SHOOTER_MAX_ANGLE));
  const ideal = powerToHit(self, target, angle) ?? powerCap(self);
  const power = Math.round(ideal * (1 + rng.range(-powerError, powerError)));
  return { angle, power: capped(self, power) };
}

/**
 * The Tosser's aim at `target`. Its first Turn at a Target is a rough guess at Shooter's
 * Power; later Turns keep the Angle and correct the Power from where the last Projectile
 * ended up. It never models Wind: the corrections absorb it.
 */
function tosserAim(self: Tank, target: Tank, memory: ComputerMemory, rng: Rng): Aim {
  const { lastAim, lastLanding } = memory;
  if (!lastAim || !lastLanding) {
    const angle = towards(self, target, TOSSER_ANGLE);
    const ideal = powerToHit(self, target, angle) ?? powerCap(self);
    const error = rng.range(-TOSSER_FIRST_POWER_ERROR, TOSSER_FIRST_POWER_ERROR);
    return { angle, power: capped(self, Math.round(ideal * (1 + error))) };
  }
  const factor = Math.min(
    TOSSER_MAX_FACTOR,
    Math.max(TOSSER_MIN_FACTOR, correction(self, target, lastLanding)),
  );
  return { angle: lastAim.angle, power: capped(self, Math.round(lastAim.power * factor)) };
}

/** How much to scale the Power by, from where the last Projectile ended up, before clamping. */
function correction(self: Tank, target: Tank, landing: Landing): number {
  const direction = target.x >= self.x ? 1 : -1;
  if (landing.kind === "lost") {
    const targetSide = direction > 0 ? "right" : "left";
    return landing.side === targetSide ? TOSSER_LOST_FACTOR : TOSSER_MAX_FACTOR;
  }
  // On flat ground range grows with speed², hence the square root. Measured horizontally
  // from the Tosser, in the Target's direction: a hill that stops it short counts as short.
  const want = Math.abs(target.x - self.x);
  const got = (landing.x - self.x) * direction;
  if (got <= 0) return TOSSER_MAX_FACTOR; // landed behind the Tosser
  return Math.sqrt(want / got);
}
