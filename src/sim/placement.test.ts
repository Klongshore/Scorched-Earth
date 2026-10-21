import { describe, expect, it } from "vitest";
import { FIELD_HEIGHT, FIELD_WIDTH, PAD_HALF_WIDTH } from "./constants";
import { placeTanks } from "./placement";
import { Rng } from "./rng";
import { isSupported } from "./tank";
import { generateHills } from "./terrainGen";

function setup(seed: number) {
  const rng = new Rng(seed);
  const terrain = generateHills(rng, FIELD_WIDTH, FIELD_HEIGHT);
  const tanks = placeTanks(rng, terrain, [0, 1]);
  return { terrain, tanks };
}

describe("placeTanks", () => {
  it("places Tanks on opposite halves", () => {
    for (let seed = 0; seed < 20; seed++) {
      const xs = setup(seed).tanks.map((t) => t.x);
      expect(Math.min(...xs)).toBeLessThan(FIELD_WIDTH / 2);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(FIELD_WIDTH / 2);
    }
  });

  it("supports every Tank on a flat pad", () => {
    for (let seed = 0; seed < 20; seed++) {
      const { terrain, tanks } = setup(seed);
      for (const t of tanks) {
        expect(isSupported(t, terrain)).toBe(true);
        for (let x = t.x - PAD_HALF_WIDTH; x <= t.x + PAD_HALF_WIDTH; x++) {
          expect(terrain.surfaceY(x)).toBe(t.y);
        }
      }
    }
  });

  it("is deterministic for a seed", () => {
    expect(setup(7).tanks).toEqual(setup(7).tanks);
  });

  it("does not always put Player 1 on the left", () => {
    const lefts = new Set<number>();
    for (let seed = 0; seed < 20; seed++) {
      const tanks = setup(seed).tanks;
      lefts.add((tanks[0]?.x ?? 0) < (tanks[1]?.x ?? 0) ? 0 : 1);
    }
    expect(lefts.size).toBe(2);
  });
});
