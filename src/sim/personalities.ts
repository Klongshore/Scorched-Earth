import { powerToHit } from "./aiming";
import {
  MAX_ANGLE,
  MIN_ANGLE,
  MIN_POWER,
  SHOOTER_MAX_ANGLE,
  SHOOTER_MIN_ANGLE,
  SHOOTER_POWER_ERROR,
} from "./constants";
import type { Rng } from "./rng";
import { isAlive, powerCap } from "./tank";
import type { PersonalityName, Tank } from "./types";

export interface Aim {
  angle: number;
  power: number;
}

/**
 * What a Computer Player remembers between its Turns within one Round. Each Round starts
 * a fresh one, because Tanks are recreated every Round.
 */
export interface ComputerMemory {
  targetId: number | null; // playerId of the Target
}

export function newComputerMemory(): ComputerMemory {
  return { targetId: null };
}

/**
 * Keep the remembered Target while its Tank is alive; otherwise pick a random living
 * opponent with rng and remember it. Never called once `self` is the only living Tank:
 * the Round has already ended.
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
  }
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
  const base = rng.int(SHOOTER_MIN_ANGLE, SHOOTER_MAX_ANGLE);
  // Angle 0° points right, so a Target on the left needs 180° minus the base.
  const angle = target.x >= self.x ? base : 180 - base;
  const cap = powerCap(self);
  const ideal = powerToHit(self, target, angle) ?? cap;
  const power = Math.round(ideal * (1 + rng.range(-powerError, powerError)));
  return { angle, power: Math.min(cap, Math.max(MIN_POWER, power)) };
}
