import { describe, expect, it } from "vitest";
import {
  BABY_MISSILE,
  COMPUTER_THINK_SECONDS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MAX_ANGLE,
  MAX_HEALTH,
  MIN_ANGLE,
  SHOOTER_MAX_ANGLE,
  SHOOTER_MIN_ANGLE,
  SHOOTER_POWER_ERROR,
  TICK_SECONDS,
  TOSSER_ANGLE,
  TOSSER_FIRST_POWER_ERROR,
  TOSSER_LOST_FACTOR,
  TOSSER_MAX_FACTOR,
  TOSSER_MIN_FACTOR,
} from "./constants";
import {
  chooseAim,
  chooseTarget,
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
import type { PlayerSetup, Tank } from "./types";

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
    expect(round.phase).toEqual({ kind: "aiming", thinkRemaining: COMPUTER_THINK_SECONDS });
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
    expect(round.phase.kind).toBe("flying");
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
      const target = chooseTarget(memory, self, tanks, rng) as Tank;
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
      picked.add((chooseTarget(newComputerMemory(), self, tanks, rng) as Tank).playerId);
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
      expect(chooseTarget(memory, self, tanks, rng)?.playerId).toBe(4);
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
      const target = chooseTarget(memory, self, tanks, rng) as Tank;
      expect([2, 4]).toContain(target.playerId);
      expect(memory).toEqual({ targetId: target.playerId, lastAim: null, lastLanding: null });
    }
  });

  it("throws when no opponent is alive", () => {
    const tanks = fiveTanks();
    for (const t of tanks.slice(1)) t.health = 0;
    expect(() => chooseTarget(newComputerMemory(), tanks[0] as Tank, tanks, new Rng(1))).toThrow();
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
      const target = chooseTarget(memory, self, tanks, rng);
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
    expect(chooseTarget(memory, self, tanks, new Rng(1))).toBeNull();
    expect(memory).toEqual(newComputerMemory());
  });
});

describe("isReachable", () => {
  it("is true when the Power to hit at 45° is within the Power cap", () => {
    const self = tankAt(0, 100, 60);
    const near = tankAt(1, 400);
    const needed = powerToHit(self, near, 45) as number;
    expect(isReachable(self, near)).toBe(needed <= powerCap(self));
    expect(isReachable(self, near)).toBe(true);
    expect(isReachable({ ...self, health: Math.floor((needed - 1) / 10) }, near)).toBe(false);
  });

  it("aims at 45° toward the Target, on either side", () => {
    const self = tankAt(0, 320, 60);
    expect(isReachable(self, tankAt(1, 60))).toBe(isReachable(self, tankAt(1, 580)));
    expect(isReachable(self, tankAt(1, 60))).toBe(true);
  });

  it("is false for a Target no Power can reach at 45°", () => {
    const self = tankAt(0, 300);
    expect(isReachable(self, tankAt(1, 302, MAX_HEALTH, GROUND - 200))).toBe(false);
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

  it("falls back to the Power cap for a Target well above the barrel's line", () => {
    const self = tankAt(0, 300, 70);
    const target = tankAt(1, 320, MAX_HEALTH, GROUND - 200);
    const rng = new Rng(6);
    for (let i = 0; i < 50; i++) {
      expect(shooterAim(self, target, rng, 0).power).toBe(powerCap(self));
      const power = shooterAim(self, target, rng).power;
      expect(power).toBeLessThanOrEqual(powerCap(self));
      expect(power).toBeGreaterThanOrEqual(Math.floor(powerCap(self) * (1 - SHOOTER_POWER_ERROR)));
    }
  });

  it("fires at its Power cap when damaged too badly to reach", () => {
    const self = tankAt(0, 30, 5);
    const target = tankAt(1, 610);
    expect(shooterAim(self, target, new Rng(1), 0).power).toBe(powerCap(self));
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
    for (let i = 0; i < 300; i++) {
      const selfX = rng.int(20, FIELD_WIDTH - 20);
      const targetX = rng.int(20, FIELD_WIDTH - 20);
      if (selfX === targetX) continue;
      const { self, target, tanks, memory } = tosserAt(selfX, targetX, rng.int(1, MAX_HEALTH));
      if (!isReachable(self, target)) continue; // aims like a Moron instead
      const aim = chooseAim("tosser", self, tanks, memory, rng);
      const angle = targetX > selfX ? TOSSER_ANGLE : 180 - TOSSER_ANGLE;
      expect(aim.angle).toBe(angle);
      expect(Number.isInteger(aim.power)).toBe(true);
      const ideal = powerToHit(self, target, angle) ?? powerCap(self);
      expect(aim.power).toBeGreaterThanOrEqual(
        Math.min(powerCap(self), Math.floor(ideal * (1 - TOSSER_FIRST_POWER_ERROR))),
      );
      expect(aim.power).toBeLessThanOrEqual(Math.ceil(ideal * (1 + TOSSER_FIRST_POWER_ERROR)));
      expect(aim.power).toBeLessThanOrEqual(powerCap(self));
      expect(memory.lastAim).toEqual(aim);
    }
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
        if (outcome.kind !== "flying") return { outcome, x: p.x };
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

    for (const wind of [-15, 0, 15]) {
      it(`ends within the Baby Missile's radius of a stationary Target within ${TURNS} Turns at Wind ${wind}`, () => {
        for (const [selfX, targetX] of pairs) {
          for (let seed = 0; seed < 20; seed++) {
            const { self, target, tanks, memory } = tosserAt(selfX, targetX);
            const rng = new Rng(seed);
            const c = centre(target);
            const distances: number[] = [];
            for (let turn = 0; turn < TURNS; turn++) {
              const aim = chooseAim("tosser", self, tanks, memory, rng);
              const { outcome, x } = fly(self, target, aim, wind);
              if (outcome.kind === "hit") {
                memory.lastLanding = { kind: "hit", x: outcome.x };
                distances.push(Math.hypot(outcome.x - c.x, outcome.y - c.y));
              } else {
                memory.lastLanding = { kind: "lost", side: x < 0 ? "left" : "right" };
                distances.push(Infinity);
              }
            }
            const where = `${selfX} to ${targetX}, seed ${seed}: ${distances.map((d) => d.toFixed(1)).join(", ")}`;
            // Each landing is no further than the one before (once within the radius it may
            // wobble inside it), and the last is within the Baby Missile's radius.
            for (let i = 1; i < TURNS; i++) {
              expect(distances[i], where).toBeLessThanOrEqual(
                Math.max(distances[i - 1] as number, BABY_MISSILE.radius),
              );
            }
            expect(distances[TURNS - 1], where).toBeLessThanOrEqual(BABY_MISSILE.radius);
          }
        }
      });
    }
  });
});
