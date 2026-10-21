import { describe, expect, it } from "vitest";
import { FIELD_HEIGHT, FIELD_WIDTH, TERRAIN_MAX_FRACTION, TERRAIN_MIN_FRACTION } from "./constants";
import { Rng } from "./rng";
import { Terrain } from "./terrain";
import { generateHills } from "./terrainGen";

function flat(y: number): Terrain {
  return Terrain.fromSurface(new Array<number>(FIELD_WIDTH).fill(y), FIELD_WIDTH, FIELD_HEIGHT);
}

describe("Terrain", () => {
  it("fromSurface sets the right cells and surfaceY matches the input", () => {
    const surface = [5, 3, 8, 10];
    const t = Terrain.fromSurface(surface, 4, 10);
    surface.forEach((y, x) => {
      expect(t.surfaceY(x)).toBe(y);
      expect(t.isSolid(x, y)).toBe(true);
      expect(t.isSolid(x, y - 1)).toBe(false);
    });
  });

  it("surfaceY returns height for an empty column", () => {
    expect(new Terrain(4, 10).surfaceY(2)).toBe(10);
  });

  it("treats sides and top as air and the floor as solid", () => {
    const t = new Terrain(10, 10);
    expect(t.isSolid(-1, 5)).toBe(false);
    expect(t.isSolid(10, 5)).toBe(false);
    expect(t.isSolid(5, -1)).toBe(false);
    expect(t.isSolid(5, 10)).toBe(true);
    expect(t.isSolid(5, 500)).toBe(true);
  });

  it("floors float coordinates", () => {
    const t = new Terrain(10, 10);
    t.set(3, 4, true);
    expect(t.isSolid(3.9, 4.9)).toBe(true);
    expect(t.isSolid(4.1, 4.5)).toBe(false);
  });

  it("set ignores out-of-range coordinates", () => {
    const t = new Terrain(10, 10);
    t.set(-1, 0, true);
    t.set(10, 0, true);
    t.set(0, 10, true);
    expect(t.cells.every((c) => c === 0)).toBe(true);
    expect(t.version).toBe(0);
  });

  it("carveCircle clears dirt inside the radius only and bumps version", () => {
    const t = flat(300);
    const before = t.version;
    t.carveCircle(100, 300, 20);
    expect(t.isSolid(100, 310)).toBe(false);
    expect(t.isSolid(100, 330)).toBe(true);
    expect(t.isSolid(130, 310)).toBe(true);
    expect(t.version).toBeGreaterThan(before);
  });

  it("carveCircle that removes nothing does not bump version", () => {
    const t = flat(300);
    const before = t.version;
    t.carveCircle(100, 100, 10);
    expect(t.version).toBe(before);
  });

  it("carveCircle clips at the field edges", () => {
    const t = flat(300);
    t.carveCircle(0, 300, 20);
    expect(t.isSolid(0, 310)).toBe(false);
    expect(t.isSolid(30, 310)).toBe(true);
  });

  it("flatten makes columns solid from y down and clears above", () => {
    const t = flat(300);
    t.flatten(10, 20, 350);
    for (let x = 10; x <= 20; x++) {
      expect(t.surfaceY(x)).toBe(350);
      expect(t.isSolid(x, 349)).toBe(false);
    }
    expect(t.surfaceY(9)).toBe(300);
    expect(t.surfaceY(21)).toBe(300);
    expect(t.version).toBeGreaterThan(0);
  });
});

describe("generateHills", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const a = generateHills(new Rng(7), FIELD_WIDTH, FIELD_HEIGHT);
    const b = generateHills(new Rng(7), FIELD_WIDTH, FIELD_HEIGHT);
    const c = generateHills(new Rng(8), FIELD_WIDTH, FIELD_HEIGHT);
    expect(a.cells).toEqual(b.cells);
    expect(a.cells).not.toEqual(c.cells);
  });

  it("keeps every surface value inside the clamp range", () => {
    for (let seed = 0; seed < 50; seed++) {
      const t = generateHills(new Rng(seed), FIELD_WIDTH, FIELD_HEIGHT);
      for (let x = 0; x < FIELD_WIDTH; x++) {
        const y = t.surfaceY(x);
        expect(y).toBeGreaterThanOrEqual(Math.round(FIELD_HEIGHT * TERRAIN_MIN_FRACTION));
        expect(y).toBeLessThanOrEqual(Math.round(FIELD_HEIGHT * TERRAIN_MAX_FRACTION));
      }
    }
  });
});

describe("settlePass", () => {
  function floored(): Terrain {
    const t = new Terrain(20, 30);
    for (let x = 0; x < 20; x++) for (let y = 20; y < 30; y++) t.set(x, y, true);
    return t;
  }

  it("drops a floating cell to rest in the expected number of passes, then reports no movement", () => {
    const t = floored();
    t.set(5, 10, true);
    for (let i = 0; i < 9; i++) expect(t.settlePass()).toBe(true);
    expect(t.isSolid(5, 19)).toBe(true);
    expect(t.isSolid(5, 10)).toBe(false);
    expect(t.settlePass()).toBe(false);
  });

  it("drops an overhang until it rests on dirt below", () => {
    const t = floored();
    for (let x = 3; x <= 6; x++) for (let y = 5; y <= 7; y++) t.set(x, y, true);
    while (t.settlePass());
    for (let x = 3; x <= 6; x++) {
      expect(t.surfaceY(x)).toBe(17);
      expect(t.isSolid(x, 19)).toBe(true);
    }
  });
});
