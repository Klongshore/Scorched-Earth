import { describe, expect, it } from "vitest";
import { MONEY_PER_DAMAGE, MONEY_PER_DESTROYED_TANK } from "./constants";
import { moneyEarned } from "./money";
import type { Explosion, ExplosionHit } from "./types";

function explosion(...hits: ExplosionHit[]): Explosion {
  return { kind: "carve", x: 0, y: 0, radius: 20, hits, elapsed: 0 };
}

describe("moneyEarned", () => {
  it("pays per point of Health removed from another Tank", () => {
    const e = explosion({ playerId: 1, healthRemoved: 25, destroyed: false });
    expect(moneyEarned(e, 0)).toBe(25 * MONEY_PER_DAMAGE);
    expect(moneyEarned(e, 0)).toBe(1250);
  });

  it("adds a bonus for each other Tank destroyed", () => {
    const e = explosion(
      { playerId: 1, healthRemoved: 10, destroyed: true },
      { playerId: 2, healthRemoved: 4, destroyed: true },
    );
    expect(moneyEarned(e, 0)).toBe(14 * MONEY_PER_DAMAGE + 2 * MONEY_PER_DESTROYED_TANK);
  });

  it("pays nothing, and costs nothing, for harming the firer's own Tank", () => {
    const e = explosion(
      { playerId: 0, healthRemoved: 30, destroyed: true },
      { playerId: 1, healthRemoved: 5, destroyed: false },
    );
    expect(moneyEarned(e, 0)).toBe(250);
    expect(moneyEarned(explosion(), 0)).toBe(0);
  });
});
