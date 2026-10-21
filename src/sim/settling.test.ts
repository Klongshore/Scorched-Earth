import { describe, expect, it } from "vitest";
import { FIELD_HEIGHT, FIELD_WIDTH, TANK_HALF_WIDTH } from "./constants";
import { settleTick } from "./settling";
import { isSupported } from "./tank";
import { Terrain } from "./terrain";
import type { Tank } from "./types";

const GROUND = 400;

function flat(y = GROUND): Terrain {
  return Terrain.fromSurface(new Array<number>(FIELD_WIDTH).fill(y), FIELD_WIDTH, FIELD_HEIGHT);
}

function tank(overrides: Partial<Tank> = {}): Tank {
  return { playerId: 0, x: 320, y: GROUND, angle: 90, power: 500, health: 100, ...overrides };
}

/** Run settleTick until nothing moves; returns the number of ticks that moved something. */
function settle(terrain: Terrain, tanks: Tank[]): number {
  let ticks = 0;
  while (settleTick(terrain, tanks)) {
    ticks++;
    if (ticks > 10_000) throw new Error("Settling never came to rest");
  }
  return ticks;
}

describe("settleTick", () => {
  it("reports no movement when everything is already at rest", () => {
    const t = tank();
    expect(settleTick(flat(), [t])).toBe(false);
    expect(t.y).toBe(GROUND);
  });

  it("drops a Tank over a carved hole until it is supported, with Health unchanged", () => {
    const terrain = flat();
    const t = tank({ health: 73 });
    terrain.carveCircle(t.x, GROUND, 20);
    expect(isSupported(t, terrain)).toBe(false);
    settle(terrain, [t]);
    expect(t.y).toBeGreaterThan(GROUND);
    expect(isSupported(t, terrain)).toBe(true);
    expect(t.health).toBe(73);
  });

  it("drops a Tank together with the overhang it rests on", () => {
    const terrain = flat();
    // Remove a slab under the Tank's ground, leaving a floating shelf 3 px thick.
    for (let y = GROUND + 3; y < GROUND + 13; y++) {
      for (let x = 300; x <= 340; x++) terrain.set(x, y, false);
    }
    const t = tank();
    settle(terrain, [t]);
    expect(isSupported(t, terrain)).toBe(true);
    expect(t.y).toBe(GROUND + 10);
    expect(t.health).toBe(100);
  });

  it("kills a Tank that falls off the bottom of the field", () => {
    const terrain = flat();
    const t = tank();
    for (let x = t.x - TANK_HALF_WIDTH; x <= t.x + TANK_HALF_WIDTH; x++) {
      for (let y = 0; y < FIELD_HEIGHT; y++) terrain.set(x, y, false);
    }
    settle(terrain, [t]);
    expect(t.y).toBe(FIELD_HEIGHT);
    expect(t.health).toBe(0);
  });

  it("kills a Tank pushed below the field", () => {
    const t = tank({ y: FIELD_HEIGHT + 5 });
    settleTick(flat(), [t]);
    expect(t.health).toBe(0);
  });

  it("leaves dead Tanks where they are", () => {
    const terrain = flat();
    const t = tank({ health: 0 });
    terrain.carveCircle(t.x, GROUND, 20);
    settle(terrain, [t]);
    expect(t.y).toBe(GROUND);
  });
});
