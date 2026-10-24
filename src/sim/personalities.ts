import { powerToHit } from "./aiming";
import {
  BABY_MISSILE,
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
import type { Inventory } from "./inventory";
import type { Rng } from "./rng";
import { isAlive, powerCap } from "./tank";
import type { PersonalityName, Tank, Weapon, WeaponName } from "./types";

export interface Aim {
  angle: number;
  power: number;
}

/** A Personality that aims at a Target: every one but Moron. */
export type TargetingPersonality = Exclude<PersonalityName, "moron">;

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

/** The Shooter's band, SHOOTER_MIN_ANGLE..SHOOTER_MAX_ANGLE, in degrees above the horizontal. */
const SHOOTER_BAND: readonly number[] = Array.from(
  { length: SHOOTER_MAX_ANGLE - SHOOTER_MIN_ANGLE + 1 },
  (_, i) => SHOOTER_MIN_ANGLE + i,
);

/** The Tosser's first-Turn choices, best first: TOSSER_ANGLE, then the Shooter's band nearest it. */
const TOSSER_ANGLES: readonly number[] = [
  TOSSER_ANGLE,
  ...SHOOTER_BAND.filter((a) => a !== TOSSER_ANGLE).sort(
    (a, b) => Math.abs(a - TOSSER_ANGLE) - Math.abs(b - TOSSER_ANGLE) || a - b,
  ),
];

/**
 * The Power to hit `target` from `self` at `angle`, ignoring Wind and Terrain, or null when
 * no Power within `self`'s cap can.
 */
function powerWithinCap(self: Tank, target: Tank, angle: number): number | null {
  const power = powerToHit(self, target, angle);
  return power !== null && power <= powerCap(self) ? power : null;
}

/**
 * The Angles toward `target` that `personality` would fire at it and that hit it within the
 * Power cap, ignoring Wind and Terrain, in that Personality's order of preference.
 */
function feasibleAims(self: Tank, target: Tank, personality: TargetingPersonality): Aim[] {
  const bases = personality === "shooter" ? SHOOTER_BAND : TOSSER_ANGLES;
  const aims: Aim[] = [];
  for (const base of bases) {
    const angle = towards(self, target, base);
    const power = powerWithinCap(self, target, angle);
    if (power !== null) aims.push({ angle, power });
  }
  return aims;
}

/**
 * Whether `self` can reach `target` the way `personality` fires: some Angle it would use
 * toward the Target hits it, ignoring Wind and Terrain, with a Power within `self`'s cap.
 */
export function isReachable(self: Tank, target: Tank, personality: TargetingPersonality): boolean {
  return feasibleAims(self, target, personality).length > 0;
}

/**
 * Keep the remembered Target while its Tank is alive and reachable; otherwise pick a random
 * reachable living opponent with rng, remember it, and forget the aim and landing at the old
 * one. With no reachable living opponent, forget the Target and return null. Never called
 * once `self` is the only living Tank: the Round has already ended.
 */
export function chooseTarget(
  memory: ComputerMemory,
  self: Tank,
  tanks: readonly Tank[],
  rng: Rng,
  personality: TargetingPersonality,
): Tank | null {
  const kept = tanks.find((t) => t.playerId === memory.targetId);
  if (kept && kept !== self && isAlive(kept) && isReachable(self, kept, personality)) return kept;

  const opponents = tanks.filter((t) => t !== self && isAlive(t));
  if (opponents.length === 0) throw new Error(`Player ${self.playerId} has no living opponent`);
  const reachable = opponents.filter((t) => isReachable(self, t, personality));
  const target =
    reachable.length === 0 ? null : (reachable[rng.int(0, reachable.length - 1)] as Tank);
  memory.targetId = target?.playerId ?? null;
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
  if (personality === "moron") return moronAim(self, rng);
  // With no reachable opponent, firing at random eventually hits someone or itself, so the
  // Round still ends.
  const target = chooseTarget(memory, self, tanks, rng, personality);
  if (!target) return moronAim(self, rng);
  switch (personality) {
    case "shooter":
      return shooterAim(self, target, rng);
    case "tosser": {
      const aim = tosserAim(self, target, memory, rng);
      memory.lastAim = aim;
      return aim;
    }
  }
}

/** A Weapon that damages Tanks: every kind but Dirt. */
type DamagingWeapon = Exclude<Weapon, { kind: "dirt" }>;

function isDamaging(weapon: Weapon): weapon is DamagingWeapon {
  return weapon.kind !== "dirt";
}

/**
 * The Weapon a Computer Player fires this Turn, from what it owns. Call after chooseAim, so the
 * aim draws keep their order.
 *
 * - Moron: a random owned Weapon, drawing from rng only when it owns more than the Baby
 *   Missile, so Morons that never shopped draw exactly as they always have.
 * - Shooter and Tosser: the owned Weapon with the highest max damage, ties broken by catalogue
 *   order, never a Dirt Weapon nor one whose radius reaches back to its own Tank (at least
 *   the horizontal distance to the Target). With no Target, or nothing suitable, the Baby
 *   Missile. They never draw from rng.
 */
export function chooseWeapon(
  personality: PersonalityName,
  self: Tank,
  target: Tank | null,
  inventory: Pick<Inventory, "owned">,
  rng: Rng,
): WeaponName {
  const owned = inventory.owned();
  if (personality === "moron") {
    if (owned.length <= 1) return BABY_MISSILE.name;
    return (owned[rng.int(0, owned.length - 1)] as Weapon).name;
  }
  if (!target) return BABY_MISSILE.name;
  const distance = Math.abs(target.x - self.x);
  let best: DamagingWeapon | null = null;
  for (const weapon of owned) {
    if (!isDamaging(weapon) || weapon.radius >= distance) continue;
    if (!best || weapon.maxDamage > best.maxDamage) best = weapon;
  }
  return best?.name ?? BABY_MISSILE.name;
}

/**
 * A random Angle and a random Power within the Tank's Health-based cap. Moron must keep
 * drawing exactly these two ints so seeded Matches with only Morons play out as they always
 * have.
 */
function moronAim(self: Tank, rng: Rng): Aim {
  return { angle: rng.int(MIN_ANGLE, MAX_ANGLE), power: rng.int(0, powerCap(self)) };
}

/** Clamp a Power to MIN_POWER..the Tank's Health-based cap. */
function capped(self: Tank, power: number): number {
  return Math.min(powerCap(self), Math.max(MIN_POWER, power));
}

/** `base` degrees above the horizontal, toward the Target: 0° points right. */
function towards(self: Tank, target: Tank, base: number): number {
  return target.x >= self.x ? base : 180 - base;
}

/** `aim`'s Angle, with its Power off by a random factor of up to ±`error`, within the cap. */
function withPowerError(self: Tank, aim: Aim, error: number, rng: Rng): Aim {
  const power = Math.round(aim.power * (1 + rng.range(-error, error)));
  return { angle: aim.angle, power: capped(self, power) };
}

/**
 * The Shooter's aim at `target`: a random Angle among those in its band toward the Target
 * that can hit it within the Power cap, and the Power to hit it ignoring Wind and Terrain,
 * plus up to ±powerError. Throws if no such Angle exists: chooseTarget only picks Targets in
 * reach.
 */
export function shooterAim(
  self: Tank,
  target: Tank,
  rng: Rng,
  powerError: number = SHOOTER_POWER_ERROR,
): Aim {
  const aims = feasibleAims(self, target, "shooter");
  if (aims.length === 0) throw new Error(`Player ${target.playerId} is out of reach`);
  return withPowerError(self, aims[rng.int(0, aims.length - 1)] as Aim, powerError, rng);
}

/**
 * The Tosser's aim at `target`. Its first Turn at a Target is a rough guess at Shooter's
 * Power, at TOSSER_ANGLE or else the nearest Angle in the Shooter's band that reaches. Later
 * Turns keep the Angle and correct the Power from where the last Projectile ended up, until
 * that Angle needs more than the Power cap (it took damage), when it starts over. It never
 * models Wind: the corrections absorb it.
 */
function tosserAim(self: Tank, target: Tank, memory: ComputerMemory, rng: Rng): Aim {
  const { lastAim, lastLanding } = memory;
  if (!lastAim || !lastLanding || powerWithinCap(self, target, lastAim.angle) === null) {
    const [first] = feasibleAims(self, target, "tosser");
    if (!first) throw new Error(`Player ${target.playerId} is out of reach`);
    return withPowerError(self, first, TOSSER_FIRST_POWER_ERROR, rng);
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
