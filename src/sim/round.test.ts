import { describe, expect, it } from "vitest";
import {
  FIELD_WIDTH,
  MAX_ANGLE,
  MAX_HEALTH,
  MIN_POWER,
  POWER_PER_HEALTH,
  TICK_SECONDS,
  WIND_MAX,
} from "./constants";
import { createPlayers } from "./players";
import { Rng } from "./rng";
import { Round, type RoundAction } from "./round";
import { isSupported } from "./tank";
import type { Tank } from "./types";

const GROUND = 400;

function newRound(seed = 1): Round {
  return new Round(1, createPlayers(["human", "human"]), new Rng(seed));
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
      expect(round.phase).toEqual({ kind: "aiming", thinkRemaining: null });
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

  it("lets a Computer Player fire after its think time", () => {
    const round = new Round(1, createPlayers(["computer", "computer"]), new Rng(3));
    expect(round.phase.kind).toBe("aiming");
    if (round.phase.kind === "aiming") expect(round.phase.thinkRemaining).not.toBeNull();
    round.act({ kind: "fire" });
    expect(round.phase.kind).toBe("aiming");
    runUntil(round, (r) => r.phase.kind !== "aiming");
    expect(round.phase.kind).toBe("flying");
  });
});
