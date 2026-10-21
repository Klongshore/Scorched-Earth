import { describe, expect, it } from "vitest";
import { MAX_ANGLE, MIN_ANGLE } from "./constants";
import { chooseAim } from "./personalities";
import { Rng } from "./rng";
import { powerCap } from "./tank";
import type { Tank } from "./types";

describe("moron", () => {
  it("always aims within bounds and under the Health-based Power cap", () => {
    const rng = new Rng(7);
    const tank: Tank = { playerId: 0, x: 100, y: 400, angle: 90, power: 500, health: 40 };
    for (let i = 0; i < 2000; i++) {
      const aim = chooseAim("moron", tank, rng);
      expect(aim.angle).toBeGreaterThanOrEqual(MIN_ANGLE);
      expect(aim.angle).toBeLessThanOrEqual(MAX_ANGLE);
      expect(aim.power).toBeGreaterThanOrEqual(0);
      expect(aim.power).toBeLessThanOrEqual(powerCap(tank));
    }
  });
});
