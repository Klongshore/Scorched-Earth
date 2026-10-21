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

describe("Terrain.settlePass", () => {
  it("drops a single floating cell to the floor, then reports no movement", () => {
    // The floor row y = 20 is the bottom row, so it cannot fall itself.
    const t = new Terrain(10, 21);
    t.set(5, 10, true);
    for (let x = 0; x < 10; x++) t.set(x, 20, true);
    for (let i = 0; i < 9; i++) expect(t.settlePass()).toBe(true);
    expect(t.isSolid(5, 19)).toBe(true);
    expect(t.isSolid(5, 18)).toBe(false);
    const version = t.version;
    expect(t.settlePass()).toBe(false);
    expect(t.version).toBe(version);
  });

  it("drops a whole floating chunk one pixel per pass", () => {
    const t = new Terrain(4, 20);
    for (let y = 5; y < 8; y++) t.set(1, y, true);
    expect(t.settlePass()).toBe(true);
    expect([5, 6, 7, 8].map((y) => t.isSolid(1, y))).toEqual([false, true, true, true]);
  });

  it("lets an overhang fall until it rests on the dirt below", () => {
    const t = flat(400);
    // A 20x5 block floating at rows 300..304, with air underneath down to the ground at 400.
    for (let y = 300; y < 305; y++) for (let x = 100; x < 120; x++) t.set(x, y, true);
    let passes = 0;
    while (t.settlePass()) passes++;
    expect(passes).toBe(95);
    for (let x = 100; x < 120; x++) {
      expect(t.surfaceY(x)).toBe(395);
      for (let y = 395; y < FIELD_HEIGHT; y++) expect(t.isSolid(x, y)).toBe(true);
    }
    expect(t.surfaceY(99)).toBe(400);
    expect(t.surfaceY(120)).toBe(400);
  });
});

describe("Terrain.settlePass after edits", () => {
  it("brings undercut hills fully to rest", () => {
    const t = generateHills(new Rng(3), FIELD_WIDTH, FIELD_HEIGHT);
    expect(t.settlePass()).toBe(false);
    // Undercut the hills so dirt is left hanging, then let it settle.
    t.carveCircle(200, t.surfaceY(200) + 30, 20);
    t.carveCircle(500, t.surfaceY(500) + 25, 15);
    let passes = 0;
    while (t.settlePass()) passes++;
    expect(passes).toBeGreaterThan(0);
    let floating = 0;
    for (let x = 0; x < FIELD_WIDTH; x++) {
      for (let y = 0; y < FIELD_HEIGHT - 1; y++) {
        if (t.isSolid(x, y) && !t.isSolid(x, y + 1)) floating++;
      }
    }
    expect(floating).toBe(0);
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
