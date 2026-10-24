import { describe, expect, it } from "vitest";
import {
  BARREL_LENGTH,
  COMPUTER_THINK_SECONDS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MAX_ANGLE,
  MAX_HEALTH,
  MAX_PLAYERS,
  MIN_POWER,
  POWER_PER_HEALTH,
  TICK_SECONDS,
  WIND_MAX,
} from "./constants";
import { createPlayers } from "./players";
import { Rng } from "./rng";
import { Round, type RoundAction } from "./round";
import { isSupported } from "./tank";
import type { PlayerSetup, Tank } from "./types";

const HUMAN: PlayerSetup = { kind: "human" };
const MORON: PlayerSetup = { kind: "computer", personality: "moron" };

const GROUND = 400;

function newRound(seed = 1): Round {
  return new Round(1, createPlayers([HUMAN, HUMAN]), new Rng(seed));
}

function runUntil(round: Round, predicate: (r: Round) => boolean, maxTicks = 20000): void {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(round)) return;
    round.tick(TICK_SECONDS);
  }
  expect.fail(`runUntil hit the ${maxTicks}-tick cap in phase ${round.phase.kind}`);
}

/** Flat Terrain at GROUND, Wind 0, and the Tanks overwritten to the given columns. */
function scenario(firerX: number, otherX: number): { round: Round; firer: Tank; other: Tank } {
  const round = newRound();
  round.wind = 0;
  round.terrain.flatten(0, FIELD_WIDTH - 1, GROUND);
  const firer = round.currentTank();
  const other = round.tanks.find((t) => t !== firer) as Tank;
  firer.x = firerX;
  firer.y = GROUND;
  other.x = otherX;
  other.y = GROUND;
  return { round, firer, other };
}

/** Fire straight up so the Projectile falls back onto the firer. */
function fireStraightUp(round: Round, firer: Tank): void {
  firer.angle = 90;
  firer.power = Math.min(100, firer.health * POWER_PER_HEALTH);
  round.act({ kind: "fire" });
}

describe("Round", () => {
  it("starts with 2 full-Health Tanks, Wind within ±20, aiming", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const round = newRound(seed);
      expect(round.tanks).toHaveLength(2);
      for (const t of round.tanks) expect(t.health).toBe(MAX_HEALTH);
      expect(Math.abs(round.wind)).toBeLessThanOrEqual(WIND_MAX);
      expect(round.phase).toEqual({ kind: "aiming", thinkTicks: null });
      expect([...round.turnOrder].sort()).toEqual([0, 1]);
    }
  });

  it("adjusts the current Tank's Angle and Power, clamped", () => {
    const round = newRound();
    const tank = round.currentTank();
    round.act({ kind: "adjustAngle", delta: 5 });
    expect(tank.angle).toBe(95);
    round.act({ kind: "adjustAngle", delta: 1000 });
    expect(tank.angle).toBe(MAX_ANGLE);
    round.act({ kind: "adjustPower", delta: -10 });
    expect(tank.power).toBe(490);
    round.act({ kind: "adjustPower", delta: 5000 });
    expect(tank.power).toBe(MAX_HEALTH * POWER_PER_HEALTH);
    round.act({ kind: "adjustPower", delta: -5000 });
    expect(tank.power).toBe(MIN_POWER);
  });

  it("ignores actions outside aiming", () => {
    const round = newRound();
    const tank = round.currentTank();
    round.act({ kind: "fire" });
    expect(round.phase.kind).toBe("flying");
    const before = { angle: tank.angle, power: tank.power };
    const projectile = round.phase.kind === "flying" ? round.phase.projectile : null;
    round.act({ kind: "adjustAngle", delta: 10 });
    round.act({ kind: "adjustPower", delta: 10 });
    round.act({ kind: "fire" });
    expect({ angle: tank.angle, power: tank.power }).toEqual(before);
    expect(round.phase.kind === "flying" && round.phase.projectile).toBe(projectile);
  });

  it("returns to aiming with the other Player current after a shot, or ends", () => {
    const round = newRound();
    const first = round.currentPlayerId;
    round.act({ kind: "fire" });
    runUntil(round, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
    if (round.phase.kind === "aiming") expect(round.currentPlayerId).not.toBe(first);
  });

  it("does not change the current Player until Settling finishes", () => {
    const { round, firer } = scenario(200, 450);
    const first = round.currentPlayerId;
    fireStraightUp(round, firer);
    let sawTransition = false;
    let previous = round.phase.kind;
    runUntil(round, (r) => {
      if (previous === "exploding" && r.phase.kind === "settling") {
        sawTransition = true;
        expect(r.currentPlayerId).toBe(first);
      }
      if (r.phase.kind === "settling") expect(r.currentPlayerId).toBe(first);
      previous = r.phase.kind;
      return r.phase.kind === "aiming";
    });
    expect(sawTransition).toBe(true);
    expect(round.currentPlayerId).not.toBe(first);
  });

  it("ends in a Round Win for the firer when the opponent dies", () => {
    const { round, firer, other } = scenario(300, 312);
    other.health = 1;
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({
      kind: "over",
      result: { kind: "win", playerId: firer.playerId },
    });
    expect(firer.health).toBeGreaterThan(0);
    expect(other.health).toBe(0);
  });

  it("ends in a Draw when both Tanks die", () => {
    const { round, firer, other } = scenario(300, 312);
    firer.health = 1;
    other.health = 1;
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({ kind: "over", result: { kind: "draw" } });
  });

  it("gives the opponent the win when a Tank destroys only itself", () => {
    const { round, firer, other } = scenario(150, 500);
    firer.health = 1;
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({
      kind: "over",
      result: { kind: "win", playerId: other.playerId },
    });
    expect(other.health).toBe(MAX_HEALTH);
  });

  it("drops a Tank whose dirt is carved away, with no fall damage", () => {
    const { round, other } = scenario(150, 500);
    round.terrain.carveCircle(other.x, other.y + 15, 20);
    expect(isSupported(other, round.terrain)).toBe(false);
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "aiming");
    expect(other.y).toBeGreaterThan(GROUND);
    expect(isSupported(other, round.terrain)).toBe(true);
    expect(other.health).toBe(MAX_HEALTH);
  });

  it("is deterministic for the same seed and actions", () => {
    const actions: RoundAction[] = [
      { kind: "adjustAngle", delta: -30 },
      { kind: "adjustPower", delta: 120 },
      { kind: "fire" },
      { kind: "adjustAngle", delta: 25 },
      { kind: "adjustPower", delta: -80 },
      { kind: "fire" },
      { kind: "adjustAngle", delta: -10 },
      { kind: "fire" },
    ];
    const play = (): Round => {
      const round = newRound(42);
      for (const action of actions) {
        round.act(action);
        runUntil(round, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
      }
      return round;
    };
    const a = play();
    const b = play();
    expect(a.tanks).toEqual(b.tanks);
    expect(a.wind).toBe(b.wind);
    expect(a.turnOrder).toEqual(b.turnOrder);
    expect(a.phase).toEqual(b.phase);
    expect(a.terrain.cells).toEqual(b.terrain.cells);
  });

  it("pauses a Computer Player for COMPUTER_THINK_SECONDS worth of ticks before it fires", () => {
    const round = new Round(1, createPlayers([MORON, MORON]), new Rng(3));
    let ticks = 0;
    while (round.phase.kind === "aiming") {
      round.tick(TICK_SECONDS);
      ticks++;
      if (ticks > 10_000) expect.fail("Computer Player never fired");
    }
    expect(round.phase.kind).toBe("flying");
    expect(ticks).toBe(Math.round(COMPUTER_THINK_SECONDS / TICK_SECONDS));
  });

  it("lets a Computer Player fire after its think time", () => {
    const round = new Round(1, createPlayers([MORON, MORON]), new Rng(3));
    expect(round.phase.kind).toBe("aiming");
    if (round.phase.kind === "aiming") expect(round.phase.thinkTicks).not.toBeNull();
    round.act({ kind: "fire" });
    expect(round.phase.kind).toBe("aiming");
    runUntil(round, (r) => r.phase.kind !== "aiming");
    expect(round.phase.kind).toBe("flying");
  });
});

describe("Round earnings", () => {
  const settled = (r: Round): boolean => r.phase.kind === "aiming" || r.phase.kind === "over";

  it("starts every Player at 0", () => {
    expect(newRound().earnings).toEqual([0, 0]);
  });

  it("pays the firer $1,250 for 25 Health removed from another Tank", () => {
    const { round, firer, other } = scenario(300, 300 + BARREL_LENGTH + 2);
    // A Power-0 shot drops from the barrel tip into the other Tank, about 3.5 px from its centre.
    other.y = GROUND - 1;
    firer.angle = 0;
    firer.power = 0;
    round.act({ kind: "fire" });
    runUntil(round, settled);
    expect(other.health).toBe(MAX_HEALTH - 25);
    expect(round.earnings[firer.playerId]).toBe(1250);
    expect(round.earnings[other.playerId]).toBe(0);
  });

  it("pays $500 + $2,000 for destroying a 10-Health Tank", () => {
    const { round, firer, other } = scenario(300, 312);
    other.health = 10;
    fireStraightUp(round, firer);
    runUntil(round, settled);
    expect(other.health).toBe(0);
    expect(round.earnings[firer.playerId]).toBe(500 + 2000);
  });

  it("pays nothing for damage to the firer's own Tank", () => {
    const { round, firer } = scenario(150, 500);
    fireStraightUp(round, firer);
    runUntil(round, settled);
    expect(firer.health).toBeLessThan(MAX_HEALTH);
    expect(round.earnings).toEqual([0, 0]);
  });

  it("pays no one when a Tank dies by Settling to the bottom", () => {
    const { round, other } = scenario(150, 500);
    round.terrain.carveCircle(other.x, FIELD_HEIGHT - 1, 30);
    for (let y = other.y; y < FIELD_HEIGHT; y++) round.terrain.carveCircle(other.x, y, 12);
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "over");
    expect(other.health).toBe(0);
    expect(round.earnings).toEqual([0, 0]);
  });
});

describe("Round with 10 Players", () => {
  const tenHumans = (seed = 1): Round =>
    new Round(1, createPlayers(Array.from({ length: MAX_PLAYERS }, () => HUMAN)), new Rng(seed));

  /** End the current Turn without firing: nothing needs Settling, so it ends on the next tick. */
  function endTurn(round: Round): void {
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
  }

  it("starts with one full-Health Tank per Player", () => {
    const round = tenHumans();
    expect(round.tanks.map((t) => t.playerId)).toEqual([...Array(MAX_PLAYERS).keys()]);
    for (const t of round.tanks) expect(t.health).toBe(MAX_HEALTH);
  });

  it("holds every Player exactly once in the Turn order", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const order = tenHumans(seed).turnOrder;
      expect(order).toHaveLength(MAX_PLAYERS);
      expect([...order].sort((a, b) => a - b)).toEqual([...Array(MAX_PLAYERS).keys()]);
    }
  });

  it("gives every living Player a Turn in order, skipping destroyed Tanks", () => {
    const round = tenHumans();
    const order = round.turnOrder;
    const dead = new Set([order[1], order[2], order[5], order[9]]);
    for (const id of dead) round.tankOf(id as number).health = 0;

    const seen: number[] = [round.currentPlayerId];
    for (let i = 0; i < 6; i++) {
      endTurn(round);
      seen.push(round.currentPlayerId);
    }
    const living = order.filter((id) => !dead.has(id));
    expect(seen).toEqual([...living, living[0]]);
  });

  it("ends in a Round Win once only one Tank survives", () => {
    const round = tenHumans();
    const survivor = round.turnOrder[4] as number;
    for (const t of round.tanks) if (t.playerId !== survivor) t.health = 0;
    endTurn(round);
    expect(round.phase).toEqual({ kind: "over", result: { kind: "win", playerId: survivor } });
  });

  it("keeps going while two Tanks survive", () => {
    const round = tenHumans();
    const [a, b] = [round.turnOrder[3] as number, round.turnOrder[7] as number];
    for (const t of round.tanks) if (t.playerId !== a && t.playerId !== b) t.health = 0;
    endTurn(round);
    expect(round.phase.kind).toBe("aiming");
    expect([a, b]).toContain(round.currentPlayerId);
  });

  it("ends in a Draw when no Tank survives", () => {
    const round = tenHumans();
    for (const t of round.tanks) t.health = 0;
    endTurn(round);
    expect(round.phase).toEqual({ kind: "over", result: { kind: "draw" } });
  });
});

describe("Round Targets", () => {
  const SHOOTER: PlayerSetup = { kind: "computer", personality: "shooter" };

  /** End the current Turn without firing: nothing needs Settling, so it ends on the next tick. */
  function endTurn(round: Round): void {
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
  }

  function untilTurnOf(round: Round, playerId: number): void {
    for (let i = 0; i < 20; i++) {
      if (round.currentPlayerId === playerId) return;
      endTurn(round);
    }
    expect.fail(`Player ${playerId} never got a Turn`);
  }

  it("gives a Computer Player no Target before its first Turn, and a Human none at all", () => {
    const round = new Round(1, createPlayers([HUMAN, SHOOTER, SHOOTER, SHOOTER]), new Rng(12));
    for (const id of [1, 2, 3]) {
      if (id !== round.currentPlayerId) expect(round.targetOf(id)).toBeNull();
    }
    expect(round.targetOf(0)).toBeNull();
  });

  it("keeps a Shooter's Target across Turns while it is alive", () => {
    const round = new Round(1, createPlayers([SHOOTER, HUMAN, HUMAN, HUMAN]), new Rng(31));
    untilTurnOf(round, 0);
    const target = round.targetOf(0);
    expect(target).not.toBeNull();
    expect(target).not.toBe(0);
    for (let cycle = 0; cycle < 3; cycle++) {
      endTurn(round);
      untilTurnOf(round, 0);
      expect(round.targetOf(0)).toBe(target);
    }
  });

  it("picks a new living Target once the Target's Tank is destroyed", () => {
    const round = new Round(1, createPlayers([SHOOTER, HUMAN, HUMAN, HUMAN]), new Rng(31));
    untilTurnOf(round, 0);
    const first = round.targetOf(0) as number;
    round.tankOf(first).health = 0;
    endTurn(round);
    untilTurnOf(round, 0);
    const second = round.targetOf(0);
    expect(second).not.toBeNull();
    expect([first, 0]).not.toContain(second);
    expect(round.tankOf(second as number).health).toBeGreaterThan(0);
  });

  it("starts every Round with no Target", () => {
    const players = createPlayers([SHOOTER, SHOOTER, SHOOTER]);
    const rng = new Rng(8);
    const first = new Round(1, players, rng);
    for (let i = 0; i < 3; i++) endTurn(first);
    for (const id of [0, 1, 2]) expect(first.targetOf(id)).not.toBeNull();
    const second = new Round(2, players, rng);
    for (const id of [0, 1, 2]) {
      if (id !== second.currentPlayerId) expect(second.targetOf(id)).toBeNull();
    }
  });

  it("aims a Shooter toward its Target as its Turn begins", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const round = new Round(1, createPlayers([SHOOTER, SHOOTER, SHOOTER]), new Rng(seed));
      const self = round.currentTank();
      const target = round.tankOf(round.targetOf(self.playerId) as number);
      expect(target).not.toBe(self);
      expect(self.angle < 90).toBe(target.x > self.x);
      expect(self.power).toBeLessThanOrEqual(self.health * POWER_PER_HEALTH);
    }
  });
});

describe("Round Landings", () => {
  const TOSSER: PlayerSetup = { kind: "computer", personality: "tosser" };

  /** A Round of two Computer Players on flat Terrain at Wind 0, the firer at `firerX`. */
  function computerScenario(firerX: number, seed = 3) {
    const round = new Round(1, createPlayers([MORON, MORON]), new Rng(seed));
    round.wind = 0;
    round.terrain.flatten(0, FIELD_WIDTH - 1, GROUND);
    const firer = round.currentTank();
    const other = round.tanks.find((t) => t !== firer) as Tank;
    firer.x = firerX;
    firer.y = GROUND;
    other.x = firerX < FIELD_WIDTH / 2 ? FIELD_WIDTH - 40 : 40;
    other.y = GROUND;
    return { round, firer };
  }

  /** Override the Computer Player's aim during its pause, then fly until the Projectile ends. */
  function fireAndFinish(round: Round, firer: Tank, angle: number, power: number): void {
    firer.angle = angle;
    firer.power = power;
    runUntil(round, (r) => r.phase.kind === "flying");
    runUntil(round, (r) => r.phase.kind !== "flying");
  }

  it("records where a Computer Player's Projectile hit", () => {
    const { round, firer } = computerScenario(200);
    fireAndFinish(round, firer, 90, 100);
    const landing = round.memoryOf(firer.playerId)?.lastLanding;
    expect(landing?.kind).toBe("hit");
    expect(landing?.kind === "hit" && landing.x).toBeCloseTo(200, 5);
  });

  it("records the side a lost Projectile left by", () => {
    const right = computerScenario(100);
    fireAndFinish(right.round, right.firer, 20, 1000);
    expect(right.round.memoryOf(right.firer.playerId)?.lastLanding).toEqual({
      kind: "lost",
      side: "right",
    });

    const left = computerScenario(540);
    fireAndFinish(left.round, left.firer, 160, 1000);
    expect(left.round.memoryOf(left.firer.playerId)?.lastLanding).toEqual({
      kind: "lost",
      side: "left",
    });
  });

  it("keeps no memory for a Human", () => {
    const round = new Round(1, createPlayers([HUMAN, TOSSER]), new Rng(1));
    expect(round.memoryOf(0)).toBeNull();
  });

  it("starts every Round with no Tosser aim or landing", () => {
    const players = createPlayers([TOSSER, TOSSER, TOSSER]);
    const rng = new Rng(8);
    const first = new Round(1, players, rng);
    for (let i = 0; i < 3; i++) {
      runUntil(first, (r) => r.phase.kind === "flying");
      runUntil(first, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
      if (first.phase.kind === "over") break;
    }
    const remembered = [0, 1, 2].map((id) => first.memoryOf(id));
    expect(remembered.some((m) => m?.lastAim && m.lastLanding)).toBe(true);

    const second = new Round(2, players, rng);
    for (const id of [0, 1, 2]) {
      if (id === second.currentPlayerId) continue;
      expect(second.memoryOf(id)).toEqual({ targetId: null, lastAim: null, lastLanding: null });
    }
  });
});
