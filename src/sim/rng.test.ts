import { describe, expect, it } from "vitest";
import { Rng } from "./rng";

const draw = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.next());

describe("Rng", () => {
  it("gives the same first 10 values for the same seed", () => {
    expect(draw(new Rng(42), 10)).toEqual(draw(new Rng(42), 10));
  });

  it("gives different sequences for different seeds", () => {
    expect(draw(new Rng(1), 10)).not.toEqual(draw(new Rng(2), 10));
  });

  it("next() stays in [0, 1)", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(-20, 20) stays in bounds and hits both ends over 10,000 draws", () => {
    const rng = new Rng(123);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 10_000; i++) {
      const v = rng.int(-20, 20);
      expect(v).toBeGreaterThanOrEqual(-20);
      expect(v).toBeLessThanOrEqual(20);
      expect(Number.isInteger(v)).toBe(true);
      if (v === -20) sawMin = true;
      if (v === 20) sawMax = true;
    }
    expect(sawMin).toBe(true);
    expect(sawMax).toBe(true);
  });

  it("range(min, max) stays in [min, max)", () => {
    const rng = new Rng(5);
    for (let i = 0; i < 1_000; i++) {
      const v = rng.range(3, 4);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(4);
    }
  });

  it("pick returns an item of the list, from one int draw", () => {
    const items = ["a", "b", "c", "d"];
    const picker = new Rng(11);
    const drawer = new Rng(11);
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i++) {
      const v = picker.pick(items);
      expect(v).toBe(items[drawer.int(0, items.length - 1)]);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual(items);
  });

  it("pick throws on an empty list", () => {
    expect(() => new Rng(1).pick([])).toThrow();
  });

  it("shuffle returns a permutation without mutating its input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...input];
    const out = new Rng(9).shuffle(input);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((a, b) => a - b)).toEqual(copy);
  });

  it("shuffle is deterministic for a given seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(new Rng(3).shuffle(items)).toEqual(new Rng(3).shuffle(items));
  });
});
