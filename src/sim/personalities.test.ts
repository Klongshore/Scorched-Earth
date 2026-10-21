import { describe, expect, it } from "vitest";
import {
  COMPUTER_THINK_SECONDS,
  MAX_ANGLE,
  MAX_HEALTH,
  MIN_ANGLE,
  TICK_SECONDS,
} from "./constants";
import { chooseAim } from "./personalities";
import { createPlayers } from "./players";
import { Rng } from "./rng";
import { Round } from "./round";
import { powerCap } from "./tank";
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
        const aim = chooseAim("moron", tank, rng);
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
    for (let i = 0; i < 5000; i++) angles.add(chooseAim("moron", tank, rng).angle);
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
    const expected = chooseAim("moron", twin.currentTank(), rng);

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
