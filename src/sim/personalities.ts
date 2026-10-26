import { powerToHit } from "./aiming";
import {
  BABY_MISSILE,
  CHOOSER_POWER_ERROR,
  SPOILER_POWER_ERROR,
  GRAVITY,
  MAX_ANGLE,
  MIN_ANGLE,
  MIN_POWER,
  POWER_TO_SPEED,
  SHOOTER_MAX_ANGLE,
  SHOOTER_MIN_ANGLE,
  SHOOTER_POWER_ERROR,
  TOSSER_ANGLE,
  TOSSER_FIRST_POWER_ERROR,
  TOSSER_LOST_FACTOR,
  TOSSER_MAX_FACTOR,
  TOSSER_MIN_FACTOR,
  WIND_ACCELERATION_PER_UNIT,
} from "./constants";
import type { Inventory } from "./inventory";
import type { Rng } from "./rng";
import { barrelTip, centre, isAlive, powerCap } from "./tank";
import type { PersonalityName, Tank, Weapon, WeaponName } from "./types";

export interface Aim {
  angle: number;
  power: number;
}

/** A Personality that aims at a Target: every one but Moron and Unknown. */
export type TargetingPersonality = Exclude<PersonalityName, "moron" | "unknown">;

/** A Personality that acts directly: Unknown has resolved to one of these. */
export type ActingPersonality = Exclude<PersonalityName, "unknown">;

/** What an Unknown can become, in the order the pick indexes them. */
export const UNKNOWN_OUTCOMES: readonly TargetingPersonality[] = [
  "poolshark",
  "chooser",
  "spoiler",
  "cyborg",
];

/** Pick what an Unknown becomes for a Round: one `int` draw from rng. */
export function resolveUnknown(rng: Rng): TargetingPersonality {
  return UNKNOWN_OUTCOMES[rng.int(0, UNKNOWN_OUTCOMES.length - 1)] as TargetingPersonality;
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
  /** What an Unknown became this Round; null for every other Personality. */
  resolved: TargetingPersonality | null;
}

export function newComputerMemory(): ComputerMemory {
  return { targetId: null, lastAim: null, lastLanding: null, resolved: null };
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
  const bases = personality === "tosser" ? TOSSER_ANGLES : SHOOTER_BAND;
  const aims: Aim[] = [];
  for (const base of bases) {
    const angle = towards(self, target, base);
    const power = powerWithinCap(self, target, angle);
    if (power !== null) aims.push({ angle, power });
  }
  return aims;
}

/**
 * What makes one Personality different from another. To add a Personality, add its name to
 * PersonalityName, then one entry to RULES below: nothing else in this module changes.
 */
interface PersonalityRules {
  /** Whether it keeps its Target across Turns, rather than choosing again every Turn. */
  readonly keepsTarget: boolean;
  /** Whether `self` can hit `target` the way this Personality fires, ignoring Terrain. */
  reachable(self: Tank, target: Tank, wind: number): boolean;
  /** Pick the Target from `candidates`: living, reachable opponents in Player order; never empty. */
  selectTarget(
    self: Tank,
    candidates: readonly Tank[],
    rng: Rng,
    humanIds: ReadonlySet<number>,
  ): Tank;
  /** Its aim at `target`, which `selectTarget` chose and so is in reach. */
  aim(self: Tank, target: Tank, memory: ComputerMemory, rng: Rng, wind: number): Aim;
}

/** The lowest-Health candidate, Shield ignored; ties go to the earliest, with no draw. */
function weakestTarget(_self: Tank, candidates: readonly Tank[]): Tank {
  return candidates.reduce((weakest, t) => (t.health < weakest.health ? t : weakest));
}

/** The weakest human Player's candidate if any, else the weakest candidate. */
function weakestHumanTarget(
  self: Tank,
  candidates: readonly Tank[],
  _rng: Rng,
  humanIds: ReadonlySet<number>,
): Tank {
  const humans = candidates.filter((t) => humanIds.has(t.playerId));
  return weakestTarget(self, humans.length > 0 ? humans : candidates);
}

/** A random candidate, as the Shooter and Tosser have always chosen: one `int` draw. */
function randomTarget(_self: Tank, candidates: readonly Tank[], rng: Rng): Tank {
  return candidates[rng.int(0, candidates.length - 1)] as Tank;
}

/** The nearest candidate by horizontal distance; candidates are in Player order, so ties go to the lowest id. */
function nearestTarget(self: Tank, candidates: readonly Tank[]): Tank {
  let best = candidates[0] as Tank;
  for (const t of candidates) {
    if (Math.abs(t.x - self.x) < Math.abs(best.x - self.x)) best = t;
  }
  return best;
}

/** The Players who are human, when a caller does not say: none. */
const NO_HUMANS: ReadonlySet<number> = new Set();

const RULES: Record<TargetingPersonality, PersonalityRules> = {
  shooter: {
    keepsTarget: true,
    reachable: (self, target) => feasibleAims(self, target, "shooter").length > 0,
    selectTarget: randomTarget,
    aim: (self, target, _memory, rng) => shooterAim(self, target, rng),
  },
  poolshark: {
    keepsTarget: false,
    reachable: (self, target) => feasibleAims(self, target, "poolshark").length > 0,
    selectTarget: nearestTarget,
    aim: (self, target, _memory, rng) => shooterAim(self, target, rng),
  },
  tosser: {
    keepsTarget: true,
    reachable: (self, target) => feasibleAims(self, target, "tosser").length > 0,
    selectTarget: randomTarget,
    aim: (self, target, memory, rng) => {
      const aim = tosserAim(self, target, memory, rng);
      memory.lastAim = aim;
      return aim;
    },
  },
  chooser: {
    keepsTarget: false,
    reachable: (self, target, wind) => windFeasibleAims(self, target, wind).length > 0,
    selectTarget: weakestTarget,
    aim: (self, target, _memory, rng, wind) =>
      windAim(self, target, wind, rng, CHOOSER_POWER_ERROR),
  },
  spoiler: {
    keepsTarget: false,
    reachable: (self, target, wind) => windFeasibleAims(self, target, wind).length > 0,
    selectTarget: weakestTarget,
    aim: (self, target, _memory, rng, wind) =>
      windAim(self, target, wind, rng, SPOILER_POWER_ERROR),
  },
  cyborg: {
    keepsTarget: false,
    reachable: (self, target, wind) => windFeasibleAims(self, target, wind).length > 0,
    selectTarget: weakestHumanTarget,
    aim: (self, target, _memory, rng, wind) => windAim(self, target, wind, rng, 0),
  },
};

/**
 * Whether `self` can reach `target` the way `personality` fires: some Angle it would use
 * toward the Target hits it, ignoring Terrain, with a Power within `self`'s cap. Only the
 * Personalities that allow for Wind look at `wind`.
 */
export function isReachable(
  self: Tank,
  target: Tank,
  personality: TargetingPersonality,
  wind: number = 0,
): boolean {
  return RULES[personality].reachable(self, target, wind);
}

/**
 * Keep the remembered Target while its Tank is alive and reachable, if the Personality keeps
 * its Target; otherwise choose among the reachable living opponents by the Personality's own
 * rule, remember it, and forget the aim and landing at the old one. With no reachable living
 * opponent, forget the Target and return null. Never called once `self` is the only living
 * Tank: the Round has already ended.
 */
export function chooseTarget(
  memory: ComputerMemory,
  self: Tank,
  tanks: readonly Tank[],
  rng: Rng,
  personality: TargetingPersonality,
  wind: number = 0,
  humanIds: ReadonlySet<number> = NO_HUMANS,
): Tank | null {
  const rules = RULES[personality];
  const kept = tanks.find((t) => t.playerId === memory.targetId);
  if (
    rules.keepsTarget &&
    kept &&
    kept !== self &&
    isAlive(kept) &&
    rules.reachable(self, kept, wind)
  ) {
    return kept;
  }

  const opponents = tanks.filter((t) => t !== self && isAlive(t));
  if (opponents.length === 0) throw new Error(`Player ${self.playerId} has no living opponent`);
  const reachable = opponents.filter((t) => rules.reachable(self, t, wind));
  const target = reachable.length === 0 ? null : rules.selectTarget(self, reachable, rng, humanIds);
  memory.targetId = target?.playerId ?? null;
  memory.lastAim = null;
  memory.lastLanding = null;
  return target;
}

/** Choose a Computer Player's aim for its Turn according to its Personality. */
export function chooseAim(
  personality: ActingPersonality,
  self: Tank,
  tanks: readonly Tank[],
  memory: ComputerMemory,
  rng: Rng,
  wind: number = 0,
  humanIds: ReadonlySet<number> = NO_HUMANS,
): Aim {
  if (personality === "moron") return moronAim(self, rng);
  // With no reachable opponent, firing at random eventually hits someone or itself, so the
  // Round still ends.
  const target = chooseTarget(memory, self, tanks, rng, personality, wind, humanIds);
  if (!target) return moronAim(self, rng);
  return RULES[personality].aim(self, target, memory, rng, wind);
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
 * - Every other Personality: the owned Weapon with the highest max damage, ties broken by catalogue
 *   order, never a Dirt Weapon nor one whose radius reaches back to its own Tank (at least
 *   the horizontal distance to the Target). With no Target, or nothing suitable, the Baby
 *   Missile. They never draw from rng.
 */
export function chooseWeapon(
  personality: ActingPersonality,
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
 * The Power that lands a Projectile fired at `angle` from `self` on `target`'s centre once
 * Wind has pushed it, ignoring Terrain, or null when no Power can. Wind is a steady sideways
 * acceleration, so the flight is a parabola with a sideways drift: solve for the flight time
 * from the vertical equation, then for the speed from the horizontal one.
 */
function powerToHitInWind(self: Tank, target: Tank, angle: number, wind: number): number | null {
  const tip = barrelTip({ ...self, angle });
  const goal = centre(target);
  const dx = goal.x - tip.x;
  const dy = goal.y - tip.y; // y points down
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const tan = Math.tan(radians);
  const drift = wind * WIND_ACCELERATION_PER_UNIT;
  const flightSquared = (2 * (dy + dx * tan)) / (GRAVITY + drift * tan);
  if (!(flightSquared > 0)) return null;
  const flight = Math.sqrt(flightSquared);
  const speed = (dx / flight - 0.5 * drift * flight) / cos;
  return speed > 0 ? Math.round(speed / POWER_TO_SPEED) : null;
}

/** The Shooter's Angles toward `target` that hit it through `wind` within the Power cap. */
function windFeasibleAims(self: Tank, target: Tank, wind: number): Aim[] {
  const aims: Aim[] = [];
  for (const base of SHOOTER_BAND) {
    const angle = towards(self, target, base);
    const power = powerToHitInWind(self, target, angle, wind);
    if (power !== null && power <= powerCap(self)) aims.push({ angle, power });
  }
  return aims;
}

/**
 * An aim at `target` that allows for `wind`: a random Angle among the Shooter's band toward
 * it that can hit it through the Wind within the Power cap, and the Power to do so ignoring
 * Terrain, plus up to ±powerError. Pass the Personality's error constant, so Spoiler and
 * Cyborg can reuse this with theirs. Throws if no such Angle exists: chooseTarget only picks
 * Targets in reach.
 */
export function windAim(self: Tank, target: Tank, wind: number, rng: Rng, powerError: number): Aim {
  const aims = windFeasibleAims(self, target, wind);
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
