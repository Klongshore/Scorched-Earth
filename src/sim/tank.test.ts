import { describe, expect, it } from "vitest";
import { TANK_HALF_WIDTH, TANK_HEIGHT } from "./constants";
import { Terrain } from "./terrain";
import { barrelTip, clampAim, hitTest, isSupported, powerCap } from "./tank";
import type { Tank } from "./types";

function tank(overrides: Partial<Tank> = {}): Tank {
  return { playerId: 0, x: 100, y: 300, angle: 90, power: 500, health: 100, ...overrides };
}

describe("tank", () => {
  it("caps Power at 1000 at full Health and 400 at Health 40", () => {
    expect(powerCap(tank())).toBe(1000);
    expect(powerCap(tank({ health: 40 }))).toBe(400);
  });

  it("clampAim reduces Power 700 to 400 at Health 40", () => {
    const t = tank({ health: 40, power: 700 });
    clampAim(t);
    expect(t.power).toBe(400);
  });

  it("clampAim keeps Angle within 0..180", () => {
    const t = tank({ angle: 200 });
    clampAim(t);
    expect(t.angle).toBe(180);
  });

  it("puts the barrel tip right of the hitbox at 0° and above it at 90°", () => {
    const t = tank();
    expect(barrelTip({ ...t, angle: 0 }).x).toBeGreaterThan(t.x + TANK_HALF_WIDTH);
    expect(barrelTip({ ...t, angle: 90 }).y).toBeLessThan(t.y - TANK_HEIGHT);
  });

  it("hits inside the hitbox but never for a dead Tank", () => {
    const t = tank();
    expect(hitTest(t, t.x, t.y - 1)).toBe(true);
    expect(hitTest(t, t.x, t.y)).toBe(false);
    expect(hitTest(tank({ health: 0 }), t.x, t.y - 1)).toBe(false);
  });

  it("is supported only when dirt is under it", () => {
    const terrain = new Terrain(640, 480);
    expect(isSupported(tank(), terrain)).toBe(false);
    terrain.flatten(0, 639, 300);
    expect(isSupported(tank(), terrain)).toBe(true);
  });
});
