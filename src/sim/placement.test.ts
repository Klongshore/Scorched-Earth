import { describe, expect, it } from "vitest";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MAX_PLAYERS,
  PAD_HALF_WIDTH,
  PLACEMENT_EDGE_MARGIN,
  TANK_HALF_WIDTH,
} from "./constants";
import { placeTanks } from "./placement";
import { Rng } from "./rng";
import { isSupported } from "./tank";
import { generateHills } from "./terrainGen";

function setup(seed: number, playerIds: readonly number[] = [0, 1]) {
  const rng = new Rng(seed);
  const terrain = generateHills(rng, FIELD_WIDTH, FIELD_HEIGHT);
  const tanks = placeTanks(rng, terrain, playerIds);
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

  describe("with 10 Players", () => {
    const tenIds = Array.from({ length: MAX_PLAYERS }, (_, i) => i);

    it("places one Tank per Player, in Player order", () => {
      expect(setup(1, tenIds).tanks.map((t) => t.playerId)).toEqual(tenIds);
    });

    it("keeps every Tank within the field's edge margin", () => {
      for (let seed = 0; seed < 20; seed++) {
        for (const t of setup(seed, tenIds).tanks) {
          expect(t.x).toBeGreaterThanOrEqual(PLACEMENT_EDGE_MARGIN);
          expect(t.x).toBeLessThanOrEqual(FIELD_WIDTH - 1 - PLACEMENT_EDGE_MARGIN);
        }
      }
    });

    it("never overlaps two Tank hitboxes", () => {
      for (let seed = 0; seed < 20; seed++) {
        const xs = setup(seed, tenIds)
          .tanks.map((t) => t.x)
          .sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) {
          // Hitboxes span x - TANK_HALF_WIDTH .. x + TANK_HALF_WIDTH inclusive.
          expect((xs[i] as number) - (xs[i - 1] as number)).toBeGreaterThan(2 * TANK_HALF_WIDTH);
        }
      }
    });

    it("supports every Tank on its own flat pad", () => {
      for (let seed = 0; seed < 20; seed++) {
        const { terrain, tanks } = setup(seed, tenIds);
        for (const t of tanks) {
          expect(isSupported(t, terrain)).toBe(true);
          for (let x = t.x - PAD_HALF_WIDTH; x <= t.x + PAD_HALF_WIDTH; x++) {
            expect(terrain.surfaceY(x)).toBe(t.y);
          }
        }
      }
    });
  });
});
