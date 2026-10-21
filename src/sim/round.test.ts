import { describe, expect, it } from "vitest";
import {
  COMPUTER_THINK_SECONDS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MAX_HEALTH,
  TICK_SECONDS,
  WIND_MAX,
} from "./constants";
import { createPlayers } from "./players";
import { Rng } from "./rng";
import { Round } from "./round";
import { isSupported } from "./tank";
import type { Tank } from "./types";

function newRound(seed = 1, kinds: ("human" | "computer")[] = ["human", "human"]): Round {
  return new Round(1, createPlayers(kinds), new Rng(seed));
}

function runUntil(round: Round, predicate: (r: Round) => boolean, maxTicks = 20000): void {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(round)) return;
    round.tick(TICK_SECONDS);
  }
  throw new Error("runUntil hit the tick cap");
}

/** Flat ground at row 400, no Wind, firer and target side by side. Returns [firer, other]. */
function flatScenario(round: Round, gap = 10): [Tank, Tank] {
  round.wind = 0;
  round.terrain.flatten(0, FIELD_WIDTH - 1, 400);
  const firer = round.currentTank();
  const other = round.tanks.find((t) => t !== firer) as Tank;
  firer.x = 100;
  firer.y = 400;
  other.x = 100 + gap;
  other.y = 400;
  firer.power = 0; // straight up and straight back down onto the firer
  firer.angle = 90;
  return [firer, other];
}

describe("Round", () => {
  it("starts with 2 full-Health Tanks, bounded Wind, and aiming", () => {
    const round = newRound();
    expect(round.tanks).toHaveLength(2);
    expect(round.tanks.every((t) => t.health === MAX_HEALTH)).toBe(true);
    expect(Math.abs(round.wind)).toBeLessThanOrEqual(WIND_MAX);
    expect(round.phase.kind).toBe("aiming");
  });

  it("adjusts and clamps aim for a human", () => {
    const round = newRound();
    const tank = round.currentTank();
    round.act({ kind: "adjustAngle", delta: 5 });
    expect(tank.angle).toBe(95);
    round.act({ kind: "adjustAngle", delta: 500 });
    expect(tank.angle).toBe(180);
    round.act({ kind: "adjustPower", delta: 10 });
    expect(tank.power).toBe(510);
    round.act({ kind: "adjustPower", delta: -5000 });
    expect(tank.power).toBe(0);
    round.act({ kind: "adjustPower", delta: 5000 });
    expect(tank.power).toBe(1000);
  });

  it("ignores actions outside aiming", () => {
    const round = newRound();
    round.act({ kind: "fire" });
    expect(round.phase.kind).toBe("flying");
    const tank = round.currentTank();
    const angle = tank.angle;
    round.act({ kind: "adjustAngle", delta: 10 });
    round.act({ kind: "fire" });
    expect(tank.angle).toBe(angle);
    expect(round.phase.kind).toBe("flying");
  });

  it("returns to aiming with the other Player after a shot", () => {
    const round = newRound();
    flatScenario(round, 100);
    const first = round.currentPlayerId;
    round.act({ kind: "fire" });
    runUntil(round, (r) => r.phase.kind === "aiming");
    expect(round.currentPlayerId).not.toBe(first);
  });

  it("keeps the same Player until Settling is complete", () => {
    const round = newRound();
    flatScenario(round, 100);
    const first = round.currentIndex;
    round.act({ kind: "fire" });
    runUntil(round, (r) => r.phase.kind === "exploding");
    runUntil(round, (r) => r.phase.kind === "settling");
    expect(round.currentIndex).toBe(first);
  });

  it("gives the firer a Round Win when it kills the opponent", () => {
    const round = newRound();
    const [firer, other] = flatScenario(round);
    other.health = 1;
    round.act({ kind: "fire" });
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({
      kind: "over",
      result: { kind: "win", playerId: firer.playerId },
    });
  });

  it("is a Draw when no Tank survives", () => {
    const round = newRound();
    const [firer, other] = flatScenario(round);
    firer.health = 1;
    other.health = 1;
    round.act({ kind: "fire" });
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({ kind: "over", result: { kind: "draw" } });
  });

  it("gives the opponent the win when a Player only kills itself", () => {
    const round = newRound();
    const [firer, other] = flatScenario(round, 200);
    firer.health = 1;
    round.act({ kind: "fire" });
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({
      kind: "over",
      result: { kind: "win", playerId: other.playerId },
    });
  });

  it("drops a Tank into a crater with no damage", () => {
    const round = newRound();
    const [firer] = flatScenario(round, 200);
    round.terrain.carveCircle(firer.x, 405, 12);
    expect(isSupported(firer, round.terrain)).toBe(false);
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "aiming");
    expect(isSupported(firer, round.terrain)).toBe(true);
    expect(firer.y).toBeGreaterThan(400);
    expect(firer.health).toBe(MAX_HEALTH);
  });

  it("kills a Tank pushed below the field", () => {
    const round = newRound();
    const [firer] = flatScenario(round, 200);
    round.terrain.flatten(0, FIELD_WIDTH - 1, 470);
    firer.y = 470;
    round.terrain.carveCircle(firer.x, 475, 15);
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "over");
    expect(firer.health).toBe(0);
    expect(firer.y).toBeGreaterThanOrEqual(FIELD_HEIGHT);
  });

  it("settles floating dirt before the Turn ends", () => {
    const round = newRound();
    flatScenario(round, 100);
    round.terrain.set(300, 100, true);
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "aiming");
    expect(round.terrain.isSolid(300, 100)).toBe(false);
    expect(round.terrain.isSolid(300, 399)).toBe(true);
  });

  it("is deterministic for the same seed and actions", () => {
    const play = (): Round => {
      const round = newRound(42);
      for (let i = 0; i < 4; i++) {
        round.act({ kind: "adjustAngle", delta: 10 * (i + 1) });
        round.act({ kind: "adjustPower", delta: 25 });
        round.act({ kind: "fire" });
        runUntil(round, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
        if (round.phase.kind === "over") break;
      }
      return round;
    };
    const a = play();
    const b = play();
    expect(a.tanks).toEqual(b.tanks);
    expect(a.wind).toBe(b.wind);
    expect(a.currentIndex).toBe(b.currentIndex);
    expect(Array.from(a.terrain.cells)).toEqual(Array.from(b.terrain.cells));
  });
});

describe("Round with a Computer Player", () => {
  it("shows its aim while thinking, then fires after the pause", () => {
    const round = newRound(3, ["computer", "computer"]);
    const tank = round.currentTank();
    expect(round.phase).toEqual({ kind: "aiming", thinkRemaining: COMPUTER_THINK_SECONDS });
    const { angle, power } = tank;
    let ticks = 0;
    while (round.phase.kind === "aiming") {
      round.tick(TICK_SECONDS);
      ticks++;
      expect(ticks).toBeLessThan(200);
    }
    expect(ticks).toBeGreaterThanOrEqual(179);
    expect(ticks).toBeLessThanOrEqual(181);
    expect(round.phase.kind).toBe("flying");
    expect(tank.angle).toBe(angle);
    expect(tank.power).toBe(power);
  });

  it("ignores human actions during the pause", () => {
    const round = newRound(3, ["computer", "computer"]);
    const tank = round.currentTank();
    const angle = tank.angle;
    round.act({ kind: "adjustAngle", delta: 5 });
    round.act({ kind: "fire" });
    expect(tank.angle).toBe(angle);
    expect(round.phase.kind).toBe("aiming");
  });
});
