import { describe, expect, it } from "vitest";
import {
  BABY_MISSILE,
  COMPUTER_THINK_SECONDS,
  COMPUTER_THINK_TICKS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MAX_ANGLE,
  MAX_HEALTH,
  MIN_ANGLE,
  SHOOTER_MAX_ANGLE,
  SHOOTER_MIN_ANGLE,
  SHOOTER_POWER_ERROR,
  TANK_HALF_WIDTH,
  TICK_SECONDS,
  TOSSER_ANGLE,
  TOSSER_FIRST_POWER_ERROR,
  TOSSER_LOST_FACTOR,
  TOSSER_MAX_FACTOR,
  TOSSER_MIN_FACTOR,
  WEAPONS,
  WIND_MAX,
  weaponNamed,
} from "./constants";
import { Inventory } from "./inventory";
import {
  chooseAim,
  chooseTarget,
  chooseWeapon,
  isReachable,
  newComputerMemory,
  shooterAim,
  type Aim,
  type ComputerMemory,
  type Landing,
} from "./personalities";
import { powerToHit } from "./aiming";
import { createPlayers } from "./players";
import { launch, stepProjectile } from "./projectile";
import { Rng } from "./rng";
import { Round } from "./round";
import { centre, powerCap } from "./tank";
import { Terrain } from "./terrain";
import type { PlayerSetup, Tank, Weapon, WeaponName } from "./types";

const HUMAN: PlayerSetup = { kind: "human" };
const MORON: PlayerSetup = { kind: "computer", personality: "moron" };

function tankWithHealth(health: number): Tank {
  return { playerId: 0, x: 100, y: 400, angle: 90, power: 500, health };
}

describe("Moron Personality", () => {
  it("aims within bounds and respects the Health-based Power cap", () => {
    const rng = new Rng(42);
    for (const health of [1, 7, 30, 55, MAX_HEALTH]) {
      const tank = tankWithHealth(health);
      for (let i = 0; i < 500; i++) {
        const aim = chooseAim("moron", tank, [tank], newComputerMemory(), rng);
        expect(Number.isInteger(aim.angle)).toBe(true);
        expect(Number.isInteger(aim.power)).toBe(true);
        expect(aim.angle).toBeGreaterThanOrEqual(MIN_ANGLE);
        expect(aim.angle).toBeLessThanOrEqual(MAX_ANGLE);
        expect(aim.power).toBeGreaterThanOrEqual(0);
        expect(aim.power).toBeLessThanOrEqual(powerCap(tank));
      }
    }
  });

  it("covers the whole Angle range", () => {
    const rng = new Rng(7);
    const tank = tankWithHealth(MAX_HEALTH);
    const angles = new Set<number>();
    for (let i = 0; i < 5000; i++)
      angles.add(chooseAim("moron", tank, [tank], newComputerMemory(), rng).angle);
    expect(angles.has(MIN_ANGLE)).toBe(true);
    expect(angles.has(MAX_ANGLE)).toBe(true);
  });
});

describe("Computer Turn", () => {
  it("shows its chosen aim during a COMPUTER_THINK_SECONDS pause, then fires", () => {
    const seed = 5;
    const round = new Round(1, createPlayers([MORON, MORON]), new Rng(seed));

    // A human Round with the same seed consumes the Rng identically up to the Computer's aim,
    // so the next chooseAim on that Rng is the aim the Computer must have chosen.
    const rng = new Rng(seed);
    const twin = new Round(1, createPlayers([HUMAN, HUMAN]), rng);
    const expected = chooseAim("moron", twin.currentTank(), twin.tanks, newComputerMemory(), rng);

    const tank = round.currentTank();
    expect({ angle: tank.angle, power: tank.power }).toEqual(expected);
    expect(round.phase).toEqual({ kind: "aiming", thinkTicks: COMPUTER_THINK_TICKS });
    expect(round.isComputerThinking).toBe(true);

    // Human input is ignored during the pause.
    round.act({ kind: "adjustAngle", delta: 1 });
    round.act({ kind: "fire" });
    expect(tank.angle).toBe(expected.angle);
    expect(round.phase.kind).toBe("aiming");

    const pauseTicks = Math.round(COMPUTER_THINK_SECONDS / TICK_SECONDS);
    for (let i = 0; i < pauseTicks - 1; i++) round.tick(TICK_SECONDS);
    expect(round.phase.kind).toBe("aiming");
    round.tick(TICK_SECONDS);
    expect(round.phase.kind).toBe("resolving");
    expect(round.isComputerThinking).toBe(false);
  });

  it("is not thinking on a human Turn", () => {
    const round = new Round(1, createPlayers([HUMAN, HUMAN]), new Rng(1));
    expect(round.isComputerThinking).toBe(false);
  });
});

describe("Moron Rng use", () => {
  it("draws one int for the Angle and one for the Power, nothing else", () => {
    const self = tankWithHealth(60);
    const other: Tank = { ...tankWithHealth(MAX_HEALTH), playerId: 1, x: 500 };
    const rng = new Rng(99);
    const twin = new Rng(99);
    const aim = chooseAim("moron", self, [self, other], newComputerMemory(), rng);
    expect(aim).toEqual({ angle: twin.int(MIN_ANGLE, MAX_ANGLE), power: twin.int(0, 600) });
    expect(rng.next()).toBe(twin.next());
  });

  it("leaves the memory without a Target", () => {
    const self = tankWithHealth(MAX_HEALTH);
    const other: Tank = { ...self, playerId: 1, x: 500 };
    const memory = newComputerMemory();
    chooseAim("moron", self, [self, other], memory, new Rng(3));
    expect(memory.targetId).toBeNull();
  });
});

const GROUND = 400;

function tankAt(playerId: number, x: number, health = MAX_HEALTH, y = GROUND): Tank {
  return { playerId, x, y, angle: 90, power: 500, health };
}

/** Five Tanks spread across the field, indexed by playerId. */
function fiveTanks(): Tank[] {
  return [60, 180, 300, 420, 560].map((x, id) => tankAt(id, x));
}

describe("chooseTarget", () => {
  it("starts with no Target", () => {
    expect(newComputerMemory()).toEqual({ targetId: null, lastAim: null, lastLanding: null });
  });

  it("picks a living opponent, never itself or a destroyed Tank", () => {
    const rng = new Rng(11);
    for (let i = 0; i < 300; i++) {
      const tanks = fiveTanks();
      const self = tanks[rng.int(0, 4)] as Tank;
      for (const t of tanks) if (t !== self && rng.next() < 0.5) t.health = 0;
      if (!tanks.some((t) => t !== self && t.health > 0)) continue;
      const memory = newComputerMemory();
      const target = chooseTarget(memory, self, tanks, rng, "shooter") as Tank;
      expect(target).not.toBe(self);
      expect(target.health).toBeGreaterThan(0);
      expect(memory.targetId).toBe(target.playerId);
    }
  });

  it("can pick any living opponent", () => {
    const tanks = fiveTanks();
    const self = tanks[2] as Tank;
    const rng = new Rng(4);
    const picked = new Set<number>();
    for (let i = 0; i < 200; i++)
      picked.add((chooseTarget(newComputerMemory(), self, tanks, rng, "shooter") as Tank).playerId);
    expect([...picked].sort()).toEqual([0, 1, 3, 4]);
  });

  it("keeps its Target while it is alive, even when another opponent is closer", () => {
    const tanks = fiveTanks();
    const self = tanks[0] as Tank;
    const memory: ComputerMemory = {
      targetId: 4,
      lastAim: { angle: 45, power: 400 },
      lastLanding: { kind: "hit", x: 250 },
    };
    const kept = structuredClone(memory);
    const rng = new Rng(8);
    const twin = new Rng(8);
    for (let turn = 0; turn < 10; turn++) {
      (tanks[4] as Tank).health -= 5;
      expect(chooseTarget(memory, self, tanks, rng, "shooter")?.playerId).toBe(4);
    }
    expect(memory).toEqual(kept);
    // Keeping the Target draws nothing from the Rng.
    expect(rng.next()).toBe(twin.next());
  });

  it("picks a new living opponent once its Target's Tank is destroyed", () => {
    const rng = new Rng(21);
    for (let i = 0; i < 50; i++) {
      const tanks = fiveTanks();
      const self = tanks[1] as Tank;
      const memory: ComputerMemory = {
        targetId: 3,
        lastAim: { angle: 45, power: 400 },
        lastLanding: { kind: "hit", x: 250 },
      };
      (tanks[3] as Tank).health = 0;
      (tanks[0] as Tank).health = 0;
      const target = chooseTarget(memory, self, tanks, rng, "shooter") as Tank;
      expect([2, 4]).toContain(target.playerId);
      expect(memory).toEqual({ targetId: target.playerId, lastAim: null, lastLanding: null });
    }
  });

  it("throws when no opponent is alive", () => {
    const tanks = fiveTanks();
    for (const t of tanks.slice(1)) t.health = 0;
    expect(() =>
      chooseTarget(newComputerMemory(), tanks[0] as Tank, tanks, new Rng(1), "shooter"),
    ).toThrow();
  });

  it("switches to a reachable living opponent once its Target is out of reach", () => {
    const rng = new Rng(13);
    for (let i = 0; i < 50; i++) {
      // At 30 Health (Power cap 300) the Tank at 60 reaches 180 but not 420 or 560.
      const tanks = fiveTanks();
      const self = tankAt(0, 60, 30);
      tanks[0] = self;
      (tanks[2] as Tank).health = 0;
      const memory: ComputerMemory = {
        targetId: 4,
        lastAim: { angle: 45, power: 300 },
        lastLanding: { kind: "hit", x: 300 },
      };
      const target = chooseTarget(memory, self, tanks, rng, "shooter");
      expect(target?.playerId).toBe(1);
      expect(memory).toEqual({ targetId: 1, lastAim: null, lastLanding: null });
    }
  });

  it("returns null and forgets its Target when no living opponent is reachable", () => {
    const tanks = fiveTanks();
    const self = tankAt(2, 300, 5);
    tanks[2] = self;
    const memory: ComputerMemory = {
      targetId: 4,
      lastAim: { angle: 45, power: 50 },
      lastLanding: { kind: "hit", x: 320 },
    };
    expect(chooseTarget(memory, self, tanks, new Rng(1), "shooter")).toBeNull();
    expect(memory).toEqual(newComputerMemory());
  });
});

/** Every integer Angle in the Shooter's band, toward `target`. */
function shooterBand(self: Tank, target: Tank): number[] {
  const angles: number[] = [];
  for (let a = SHOOTER_MIN_ANGLE; a <= SHOOTER_MAX_ANGLE; a++) {
    angles.push(target.x >= self.x ? a : 180 - a);
  }
  return angles;
}

/** Whether `angle` needs a Power within `self`'s cap to hit `target`. */
function feasible(self: Tank, target: Tank, angle: number): boolean {
  const power = powerToHit(self, target, angle);
  return power !== null && power <= powerCap(self);
}

describe("isReachable", () => {
  for (const personality of ["shooter", "tosser"] as const) {
    it(`is true for a ${personality} exactly when some Angle in the Shooter's band hits within its Power cap`, () => {
      const rng = new Rng(31);
      let reachable = 0;
      for (let i = 0; i < 2000; i++) {
        const self = tankAt(
          0,
          rng.int(20, FIELD_WIDTH - 20),
          rng.int(1, MAX_HEALTH),
          rng.int(200, 460),
        );
        const target = tankAt(1, rng.int(20, FIELD_WIDTH - 20), MAX_HEALTH, rng.int(200, 460));
        const expected = shooterBand(self, target).some((a) => feasible(self, target, a));
        expect(isReachable(self, target, personality)).toBe(expected);
        if (expected) reachable++;
      }
      expect(reachable).toBeGreaterThan(0);
      expect(reachable).toBeLessThan(2000);
    });
  }

  it("counts a Target that only Angles other than 45° can hit within the Power cap", () => {
    // Close and well above: on or above the 45° line, but a steeper Angle clears it.
    const self = tankAt(0, 300);
    const target = tankAt(1, 340, MAX_HEALTH, GROUND - 50);
    expect(powerToHit(self, target, 45)).toBeNull();
    expect(feasible(self, target, SHOOTER_MAX_ANGLE)).toBe(true);
    expect(isReachable(self, target, "shooter")).toBe(true);
    expect(isReachable(self, target, "tosser")).toBe(true);
  });

  it("aims toward the Target, on either side", () => {
    const self = tankAt(0, 320, 60);
    expect(isReachable(self, tankAt(1, 60), "shooter")).toBe(true);
    expect(isReachable(self, tankAt(1, 580), "shooter")).toBe(true);
    expect(isReachable(self, tankAt(1, 60), "tosser")).toBe(true);
  });

  it("is false for a Target no Angle in the band can reach", () => {
    const self = tankAt(0, 300);
    const above = tankAt(1, 302, MAX_HEALTH, GROUND - 200);
    expect(isReachable(self, above, "shooter")).toBe(false);
    expect(isReachable(self, above, "tosser")).toBe(false);
    const weak = tankAt(0, 30, 5);
    expect(isReachable(weak, tankAt(1, 610), "shooter")).toBe(false);
  });
});

describe("Shooter and Tosser with no reachable opponent", () => {
  for (const personality of ["shooter", "tosser"] as const) {
    it(`a ${personality} aims like a Moron: any Angle, and Power within its cap`, () => {
      const rng = new Rng(17);
      const angles = new Set<number>();
      for (let i = 0; i < 2000; i++) {
        const tanks = fiveTanks();
        const self = tankAt(0, 60, 5);
        tanks[0] = self;
        const memory = newComputerMemory();
        const aim = chooseAim(personality, self, tanks, memory, rng);
        expect(Number.isInteger(aim.angle)).toBe(true);
        expect(aim.angle).toBeGreaterThanOrEqual(MIN_ANGLE);
        expect(aim.angle).toBeLessThanOrEqual(MAX_ANGLE);
        expect(aim.power).toBeGreaterThanOrEqual(0);
        expect(aim.power).toBeLessThanOrEqual(powerCap(self));
        expect(memory).toEqual(newComputerMemory());
        angles.add(aim.angle);
      }
      expect(angles.has(MIN_ANGLE)).toBe(true);
      expect(angles.has(MAX_ANGLE)).toBe(true);
    });
  }
});

function flat(): Terrain {
  return Terrain.fromSurface(
    new Array<number>(FIELD_WIDTH).fill(GROUND),
    FIELD_WIDTH,
    FIELD_HEIGHT,
  );
}

/** Where a Projectile fired with `aim` from `self` hits, on flat Terrain with Wind 0. */
function landing(self: Tank, target: Tank, aim: { angle: number; power: number }) {
  const terrain = flat();
  const p = launch({ ...self, ...aim }, BABY_MISSILE);
  for (let i = 0; i < 10_000; i++) {
    const outcome = stepProjectile(p, 0, terrain, [self, target], TICK_SECONDS);
    if (outcome.kind === "hit") return outcome;
    if (outcome.kind === "lost") throw new Error("Projectile left the field");
  }
  throw new Error("Projectile never finished");
}

describe("Shooter Personality", () => {
  it("aims toward its Target inside its Angle band, within the Power cap", () => {
    const rng = new Rng(5);
    for (let i = 0; i < 500; i++) {
      const tanks = fiveTanks();
      for (const t of tanks) {
        t.x = rng.int(20, FIELD_WIDTH - 20);
        t.health = rng.int(1, MAX_HEALTH);
      }
      const self = tanks[rng.int(0, 4)] as Tank;
      const memory = newComputerMemory();
      const aim = chooseAim("shooter", self, tanks, memory, rng);
      if (memory.targetId === null) continue; // no reachable opponent: aims like a Moron
      const target = tanks[memory.targetId] as Tank;
      expect(target).not.toBe(self);
      expect(Number.isInteger(aim.angle)).toBe(true);
      expect(Number.isInteger(aim.power)).toBe(true);
      const band = target.x >= self.x ? aim.angle : 180 - aim.angle;
      expect(band).toBeGreaterThanOrEqual(SHOOTER_MIN_ANGLE);
      expect(band).toBeLessThanOrEqual(SHOOTER_MAX_ANGLE);
      if (target.x !== self.x) expect(aim.angle < 90).toBe(target.x > self.x);
      expect(aim.power).toBeGreaterThanOrEqual(0);
      expect(aim.power).toBeLessThanOrEqual(powerCap(self));
    }
  });

  it("keeps its Target across Turns", () => {
    const tanks = fiveTanks();
    const self = tanks[2] as Tank;
    const memory = newComputerMemory();
    const rng = new Rng(17);
    chooseAim("shooter", self, tanks, memory, rng);
    const first = memory.targetId;
    for (let turn = 0; turn < 10; turn++) chooseAim("shooter", self, tanks, memory, rng);
    expect(memory.targetId).toBe(first);
  });

  it("with no error, lands within the Baby Missile's radius across a grid of Tank positions", () => {
    const columns = [30, 110, 220, 320, 430, 530, 610];
    const rng = new Rng(2);
    for (const fromX of columns) {
      for (const toX of columns) {
        if (fromX === toX) continue;
        const self = tankAt(0, fromX);
        const target = tankAt(1, toX);
        for (let i = 0; i < 5; i++) {
          const hit = landing(self, target, shooterAim(self, target, rng, 0));
          const c = centre(target);
          expect(Math.hypot(hit.x - c.x, hit.y - c.y)).toBeLessThanOrEqual(BABY_MISSILE.radius);
        }
      }
    }
  });

  it("stays within its Power error of the ideal Power", () => {
    const self = tankAt(0, 100);
    const target = tankAt(1, 450);
    for (let seed = 0; seed < 200; seed++) {
      // The same seed picks the same Angle, so the only difference is the error.
      const ideal = shooterAim(self, target, new Rng(seed), 0);
      const aim = shooterAim(self, target, new Rng(seed));
      expect(aim.angle).toBe(ideal.angle);
      expect(Math.abs(aim.power - ideal.power)).toBeLessThanOrEqual(
        Math.ceil(ideal.power * SHOOTER_POWER_ERROR),
      );
    }
  });

  it("only fires an Angle whose Power to hit is within its cap, and that Power before error", () => {
    const rng = new Rng(12);
    let checked = 0;
    for (let i = 0; i < 2000; i++) {
      const self = tankAt(0, rng.int(20, FIELD_WIDTH - 20), rng.int(1, MAX_HEALTH));
      const target = tankAt(1, rng.int(20, FIELD_WIDTH - 20));
      if (!isReachable(self, target, "shooter")) continue;
      const aim = shooterAim(self, target, rng, 0);
      expect(feasible(self, target, aim.angle)).toBe(true);
      expect(aim.power).toBe(powerToHit(self, target, aim.angle));
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("with no error, hits any Target it can reach, even when damaged", () => {
    const rng = new Rng(14);
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const selfX = rng.int(20, FIELD_WIDTH - 20);
      const targetX = rng.int(20, FIELD_WIDTH - 20);
      if (Math.abs(selfX - targetX) < 2 * TANK_HALF_WIDTH) continue;
      const self = tankAt(0, selfX, rng.int(1, MAX_HEALTH));
      const target = tankAt(1, targetX);
      if (!isReachable(self, target, "shooter")) continue;
      const hit = landing(self, target, shooterAim(self, target, rng, 0));
      const c = centre(target);
      expect(Math.hypot(hit.x - c.x, hit.y - c.y)).toBeLessThanOrEqual(BABY_MISSILE.radius);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);

    // At 66 Health the Tank at 600 is in reach from 30 only at Angles near 45°.
    const self = tankAt(0, 30, 66);
    const target = tankAt(1, 600);
    for (let i = 0; i < 50; i++) {
      const hit = landing(self, target, shooterAim(self, target, rng, 0));
      const c = centre(target);
      expect(Math.hypot(hit.x - c.x, hit.y - c.y)).toBeLessThanOrEqual(BABY_MISSILE.radius);
    }
  });

  it("picks among the Angles in its band that can hit, not just one", () => {
    // At 66 Health only Angles near 45° reach the Tank at 600 from 30.
    const self = tankAt(0, 30, 66);
    const target = tankAt(1, 600);
    const usable = shooterBand(self, target).filter((a) => feasible(self, target, a));
    expect(usable.length).toBeGreaterThan(1);
    expect(usable.length).toBeLessThan(SHOOTER_MAX_ANGLE - SHOOTER_MIN_ANGLE + 1);
    const rng = new Rng(6);
    const picked = new Set<number>();
    for (let i = 0; i < 500; i++) picked.add(shooterAim(self, target, rng, 0).angle);
    expect([...picked].sort((a, b) => a - b)).toEqual(usable);
  });

  it("refuses to aim at a Target it cannot reach", () => {
    const self = tankAt(0, 30, 5);
    expect(() => shooterAim(self, tankAt(1, 610), new Rng(1))).toThrow();
  });

  it("does not change its Tank or its Target's", () => {
    const tanks = fiveTanks();
    const before = tanks.map((t) => ({ ...t }));
    chooseAim("shooter", tanks[0] as Tank, tanks, newComputerMemory(), new Rng(3));
    expect(tanks).toEqual(before);
  });
});

describe("Tosser Personality", () => {
  /** A Tosser at `selfX` whose memory already holds the Tank at `targetX` as its Target. */
  function tosserAt(selfX: number, targetX: number, health = MAX_HEALTH) {
    const self = tankAt(0, selfX, health);
    const target = tankAt(1, targetX);
    const memory: ComputerMemory = { ...newComputerMemory(), targetId: 1 };
    return { self, target, tanks: [self, target], memory };
  }

  /** The Power of a later Turn, after firing `lastPower` that ended up as `lastLanding`. */
  function correctedPower(
    selfX: number,
    targetX: number,
    lastLanding: Landing,
    lastPower = 400,
  ): number {
    const { self, tanks, memory } = tosserAt(selfX, targetX);
    const angle = targetX >= selfX ? TOSSER_ANGLE : 180 - TOSSER_ANGLE;
    memory.lastAim = { angle, power: lastPower };
    memory.lastLanding = lastLanding;
    const aim = chooseAim("tosser", self, tanks, memory, new Rng(1));
    expect(aim.angle).toBe(angle);
    return aim.power;
  }

  it("first aims at TOSSER_ANGLE toward its Target, near Shooter's Power and within the cap", () => {
    const rng = new Rng(9);
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const selfX = rng.int(20, FIELD_WIDTH - 20);
      const targetX = rng.int(20, FIELD_WIDTH - 20);
      if (selfX === targetX) continue;
      const { self, target, tanks, memory } = tosserAt(selfX, targetX, rng.int(1, MAX_HEALTH));
      const angle = targetX > selfX ? TOSSER_ANGLE : 180 - TOSSER_ANGLE;
      if (!feasible(self, target, angle)) continue; // covered by the next test
      const aim = chooseAim("tosser", self, tanks, memory, rng);
      expect(aim.angle).toBe(angle);
      expect(Number.isInteger(aim.power)).toBe(true);
      const ideal = powerToHit(self, target, angle) as number;
      expect(aim.power).toBeGreaterThanOrEqual(
        Math.min(powerCap(self), Math.floor(ideal * (1 - TOSSER_FIRST_POWER_ERROR))),
      );
      expect(aim.power).toBeLessThanOrEqual(Math.ceil(ideal * (1 + TOSSER_FIRST_POWER_ERROR)));
      expect(aim.power).toBeLessThanOrEqual(powerCap(self));
      expect(memory.lastAim).toEqual(aim);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("first aims at the Angle in the Shooter's band nearest TOSSER_ANGLE that can hit, when TOSSER_ANGLE can't", () => {
    // Close and well above: TOSSER_ANGLE is on or above the line to it, steeper Angles clear it.
    const { self, target, tanks, memory } = tosserAt(300, 340);
    target.y = GROUND - 50;
    expect(feasible(self, target, TOSSER_ANGLE)).toBe(false);
    const nearest = shooterBand(self, target)
      .filter((a) => feasible(self, target, a))
      .sort((a, b) => Math.abs(a - TOSSER_ANGLE) - Math.abs(b - TOSSER_ANGLE))[0] as number;
    const aim = chooseAim("tosser", self, tanks, memory, new Rng(3));
    expect(aim.angle).toBe(nearest);
    const ideal = powerToHit(self, target, nearest) as number;
    expect(Math.abs(aim.power - ideal)).toBeLessThanOrEqual(
      Math.ceil(ideal * TOSSER_FIRST_POWER_ERROR),
    );
  });

  it("starts over with a fresh guess once its kept Angle needs more than its Power cap", () => {
    // Damaged to 66 Health, TOSSER_ANGLE still reaches the Tank at 600 from 30, but 30° does not.
    const { self, target, tanks, memory } = tosserAt(30, 600, 66);
    expect(feasible(self, target, SHOOTER_MIN_ANGLE)).toBe(false);
    expect(feasible(self, target, TOSSER_ANGLE)).toBe(true);
    memory.lastAim = { angle: SHOOTER_MIN_ANGLE, power: powerCap(self) };
    memory.lastLanding = { kind: "hit", x: 400 };
    const aim = chooseAim("tosser", self, tanks, memory, new Rng(5));
    expect(aim.angle).toBe(TOSSER_ANGLE);
    expect(memory.lastAim).toEqual(aim);
    expect(memory.targetId).toBe(1);
  });

  it("lowers its Power after landing past the Target", () => {
    const factor = Math.sqrt(300 / 380);
    expect(correctedPower(100, 400, { kind: "hit", x: 480 })).toBe(Math.round(400 * factor));
    expect(correctedPower(500, 200, { kind: "hit", x: 120 })).toBe(Math.round(400 * factor));
  });

  it("raises its Power after landing short of the Target", () => {
    expect(correctedPower(100, 400, { kind: "hit", x: 300 })).toBe(
      Math.round(400 * Math.sqrt(300 / 200)),
    );
    expect(correctedPower(500, 200, { kind: "hit", x: 350 })).toBe(
      Math.round(400 * Math.sqrt(300 / 150)),
    );
  });

  it("clamps its correction to TOSSER_MIN_FACTOR..TOSSER_MAX_FACTOR", () => {
    expect(correctedPower(100, 400, { kind: "hit", x: 110 })).toBe(400 * TOSSER_MAX_FACTOR);
    expect(correctedPower(100, 120, { kind: "hit", x: 600 })).toBe(400 * TOSSER_MIN_FACTOR);
  });

  it("raises its Power by TOSSER_MAX_FACTOR after landing behind itself", () => {
    expect(correctedPower(300, 500, { kind: "hit", x: 250 })).toBe(400 * TOSSER_MAX_FACTOR);
    expect(correctedPower(300, 100, { kind: "hit", x: 330 })).toBe(400 * TOSSER_MAX_FACTOR);
  });

  it("lowers its Power by TOSSER_LOST_FACTOR after a Projectile lost on the Target's side", () => {
    expect(correctedPower(100, 400, { kind: "lost", side: "right" })).toBe(
      400 * TOSSER_LOST_FACTOR,
    );
    expect(correctedPower(500, 200, { kind: "lost", side: "left" })).toBe(400 * TOSSER_LOST_FACTOR);
  });

  it("raises its Power by TOSSER_MAX_FACTOR after a Projectile lost on the other side", () => {
    expect(correctedPower(100, 400, { kind: "lost", side: "left" })).toBe(400 * TOSSER_MAX_FACTOR);
    expect(correctedPower(500, 200, { kind: "lost", side: "right" })).toBe(400 * TOSSER_MAX_FACTOR);
  });

  it("never exceeds its Power cap", () => {
    const { self, tanks, memory } = tosserAt(100, 400, 60);
    memory.lastAim = { angle: TOSSER_ANGLE, power: 550 };
    memory.lastLanding = { kind: "hit", x: 150 };
    expect(chooseAim("tosser", self, tanks, memory, new Rng(1)).power).toBe(powerCap(self));
  });

  it("remembers the aim it fires, and draws nothing from the Rng on later Turns", () => {
    const { self, tanks, memory } = tosserAt(100, 400);
    memory.lastAim = { angle: TOSSER_ANGLE, power: 400 };
    memory.lastLanding = { kind: "hit", x: 300 };
    const rng = new Rng(4);
    const twin = new Rng(4);
    const aim = chooseAim("tosser", self, tanks, memory, rng);
    expect(memory.lastAim).toEqual(aim);
    expect(rng.next()).toBe(twin.next());
  });

  it("starts over with a fresh guess when its Target changes", () => {
    const { self, target, memory } = tosserAt(100, 400);
    const other = tankAt(2, 550);
    memory.lastAim = { angle: TOSSER_ANGLE, power: 900 };
    memory.lastLanding = { kind: "hit", x: 200 };
    target.health = 0;
    const aim = chooseAim("tosser", self, [self, target, other], memory, new Rng(2));
    expect(memory.targetId).toBe(2);
    expect(memory.lastLanding).toBeNull();
    const ideal = powerToHit(self, other, TOSSER_ANGLE) as number;
    expect(Math.abs(aim.power - ideal)).toBeLessThanOrEqual(
      Math.ceil(ideal * TOSSER_FIRST_POWER_ERROR),
    );
  });

  it("does not change its Tank or its Target's", () => {
    const tanks = fiveTanks();
    const before = tanks.map((t) => ({ ...t }));
    chooseAim("tosser", tanks[0] as Tank, tanks, newComputerMemory(), new Rng(3));
    expect(tanks).toEqual(before);
  });

  describe("convergence on flat Terrain", () => {
    const TURNS = 4;

    /** Fly `aim` from `self` with real Projectile steps, without detonating. */
    function fly(self: Tank, target: Tank, aim: Aim, wind: number) {
      const terrain = flat();
      const p = launch({ ...self, ...aim }, BABY_MISSILE);
      for (let i = 0; i < 10_000; i++) {
        const outcome = stepProjectile(p, wind, terrain, [self, target], TICK_SECONDS);
        if (outcome.kind !== "flying") return outcome;
      }
      throw new Error("Projectile never finished");
    }

    const pairs: [number, number][] = [
      [60, 300],
      [100, 520],
      [300, 560],
      [580, 120],
      [450, 200],
      [320, 80],
    ];

    /** Play TURNS Turns at a stationary Target; how far from its centre each one ended up. */
    function playTurns(selfX: number, targetX: number, wind: number, seed: number): number[] {
      const { self, target, tanks, memory } = tosserAt(selfX, targetX);
      const rng = new Rng(seed);
      const c = centre(target);
      const distances: number[] = [];
      for (let turn = 0; turn < TURNS; turn++) {
        const aim = chooseAim("tosser", self, tanks, memory, rng);
        const outcome = fly(self, target, aim, wind);
        if (outcome.kind === "hit") {
          memory.lastLanding = { kind: "hit", x: outcome.x };
          distances.push(Math.hypot(outcome.x - c.x, outcome.y - c.y));
        } else {
          memory.lastLanding = { kind: "lost", side: outcome.side };
          distances.push(Infinity);
        }
      }
      return distances;
    }

    /**
     * Each landing is no further than the one before (once within the radius it may wobble
     * inside it), and the last is within the Baby Missile's radius.
     */
    function expectConverges(distances: number[], where: string): void {
      const label = `${where}: ${distances.map((d) => d.toFixed(1)).join(", ")}`;
      for (let i = 1; i < TURNS; i++) {
        expect(distances[i], label).toBeLessThanOrEqual(
          Math.max(distances[i - 1] as number, BABY_MISSILE.radius),
        );
      }
      expect(distances[TURNS - 1], label).toBeLessThanOrEqual(BABY_MISSILE.radius);
    }

    for (const wind of [-15, 0, 15]) {
      it(`ends within the Baby Missile's radius of a stationary Target within ${TURNS} Turns at Wind ${wind}`, () => {
        for (const [selfX, targetX] of pairs) {
          for (let seed = 0; seed < 20; seed++) {
            expectConverges(
              playTurns(selfX, targetX, wind, seed),
              `${selfX} to ${targetX}, seed ${seed}`,
            );
          }
        }
      });
    }

    it(`also converges against the strongest headwind, Wind ±${WIND_MAX} from the Target`, () => {
      // A headwind this strong slows the Projectile but, at the Tosser's Angles on flat ground,
      // never turns it back: it still lands short on the Target's side, so the usual
      // correction from a short landing applies.
      for (const [selfX, targetX] of pairs) {
        const wind = targetX > selfX ? -WIND_MAX : WIND_MAX;
        for (let seed = 0; seed < 20; seed++) {
          expectConverges(
            playTurns(selfX, targetX, wind, seed),
            `${selfX} to ${targetX}, Wind ${wind}, seed ${seed}`,
          );
        }
      }
    });
  });
});

describe("Computer Players choose Weapons", () => {
  const self: Tank = { playerId: 0, x: 300, y: 400, angle: 90, power: 500, health: MAX_HEALTH };
  const targetAt = (x: number): Tank => ({ ...self, playerId: 1, x });

  function inventoryOf(bundles: Partial<Record<WeaponName, number>>): Inventory {
    const inventory = new Inventory();
    for (const [name, n] of Object.entries(bundles)) inventory.add(name as WeaponName, n);
    return inventory;
  }

  /** An Inventory owning exactly these Weapons and the Baby Missile, catalogue or not. */
  function stubInventory(weapons: readonly Weapon[]): Pick<Inventory, "owned"> {
    return { owned: () => [BABY_MISSILE, ...weapons] };
  }

  const dirt: Weapon = { name: "Ton of Dirt", kind: "dirt", bundle: 2, price: 6750, radius: 5 };

  describe("Moron", () => {
    it("fires the Baby Missile without drawing from the Rng when it owns nothing else", () => {
      const rng = new Rng(3);
      expect(chooseWeapon("moron", self, null, new Inventory(), rng)).toBe("Baby Missile");
      expect(rng.next()).toBe(new Rng(3).next());
    });

    it("fires each Weapon it owns over many Turns", () => {
      const inventory = inventoryOf({ Missile: 5, "Baby Nuke": 3, Nuke: 1 });
      const rng = new Rng(11);
      const fired = new Set<WeaponName>();
      for (let i = 0; i < 200; i++) fired.add(chooseWeapon("moron", self, null, inventory, rng));
      expect([...fired].sort()).toEqual(["Baby Missile", "Baby Nuke", "Missile", "Nuke"]);
    });
  });

  for (const personality of ["shooter", "tosser"] as const) {
    describe(personality, () => {
      it("fires the Nuke at a far Target and a Missile at a Target closer than 75 px", () => {
        const inventory = inventoryOf({ Missile: 5, Nuke: 1 });
        const rng = new Rng(1);
        expect(chooseWeapon(personality, self, targetAt(500), inventory, rng)).toBe("Nuke");
        expect(chooseWeapon(personality, self, targetAt(360), inventory, rng)).toBe("Missile");
        expect(chooseWeapon(personality, self, targetAt(240), inventory, rng)).toBe("Missile");
      });

      it("falls back to the Baby Missile when every Weapon it owns would reach itself", () => {
        const inventory = inventoryOf({ Missile: 5, Nuke: 1 });
        const close = targetAt(self.x + 25);
        expect(chooseWeapon(personality, self, close, inventory, new Rng(1))).toBe("Baby Missile");
      });

      it("fires the Baby Missile with no Target", () => {
        const inventory = inventoryOf({ Missile: 5, Nuke: 1 });
        expect(chooseWeapon(personality, self, null, inventory, new Rng(1))).toBe("Baby Missile");
      });

      it("breaks ties in max damage by catalogue order", () => {
        const twin: Weapon = { ...weaponNamed("Missile"), name: "Roller" };
        const inventory = stubInventory([weaponNamed("Missile"), twin]);
        const far = targetAt(500);
        expect(chooseWeapon(personality, self, far, inventory, new Rng(1))).toBe("Missile");
      });

      it("never fires a Dirt Weapon, even when it owns nothing else", () => {
        const inventory = stubInventory([dirt]);
        for (const x of [50, 290, 320, 600]) {
          const target = targetAt(x);
          expect(chooseWeapon(personality, self, target, inventory, new Rng(1))).toBe(
            "Baby Missile",
          );
        }
      });

      it("never fires a real Dirt Weapon, whatever else of the catalogue it owns", () => {
        const dirtOnly = inventoryOf({ "Dirt Clod": 10, "Dirt Ball": 5, "Ton of Dirt": 2 });
        const everything = new Inventory();
        for (const w of WEAPONS) if (w.bundle !== null) everything.add(w.name, w.bundle);
        for (const inventory of [dirtOnly, everything]) {
          for (let x = 0; x < FIELD_WIDTH; x += 10) {
            const name = chooseWeapon(personality, self, targetAt(x), inventory, new Rng(1));
            expect(weaponNamed(name).kind).not.toBe("dirt");
          }
        }
      });

      it("makes no Rng draws", () => {
        const rng = new Rng(8);
        chooseWeapon(personality, self, targetAt(500), inventoryOf({ Nuke: 1 }), rng);
        expect(rng.next()).toBe(new Rng(8).next());
      });
    });
  }
});
