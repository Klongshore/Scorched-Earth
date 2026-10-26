import { describe, expect, it } from "vitest";
import { TAUNT_CHANCE } from "./constants";
import { EPITAPHS, SELF_INFLICTED_EPITAPHS, TAUNTS, pickEpitaph, rollTaunt } from "./lines";
import { Rng } from "./rng";

const POOLS = { EPITAPHS, SELF_INFLICTED_EPITAPHS, TAUNTS };

describe("line pools", () => {
  it("has about 30 Epitaphs, a handful of self-inflicted ones and about 30 Taunts", () => {
    expect(EPITAPHS.length).toBeGreaterThanOrEqual(30);
    expect(SELF_INFLICTED_EPITAPHS.length).toBeGreaterThanOrEqual(3);
    expect(TAUNTS.length).toBeGreaterThanOrEqual(30);
  });

  it.each(Object.entries(POOLS))(
    "keeps every line in %s trimmed, plain ASCII and unique",
    (_, pool) => {
      for (const line of pool) {
        expect(line.trim(), line).toBe(line);
        expect(line, line).toMatch(/^[\x20-\x7e]+$/);
      }
      expect(new Set(pool).size).toBe(pool.length);
    },
  );

  it("never repeats an Epitaph in the self-inflicted pool", () => {
    for (const line of SELF_INFLICTED_EPITAPHS) expect(EPITAPHS).not.toContain(line);
  });
});

describe("pickEpitaph", () => {
  it("draws self-inflicted Epitaphs only for a Tank that destroyed itself", () => {
    const rng = new Rng(1);
    const own = Array.from({ length: 500 }, () => pickEpitaph(rng, true));
    const other = Array.from({ length: 500 }, () => pickEpitaph(rng, false));
    expect(own.some((t) => SELF_INFLICTED_EPITAPHS.includes(t))).toBe(true);
    expect(own.some((t) => EPITAPHS.includes(t))).toBe(true);
    for (const t of other) expect(EPITAPHS).toContain(t);
  });

  it("is reproducible from the flavour Rng", () => {
    const picks = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: 10 }, () => pickEpitaph(rng, true));
    };
    expect(picks(3)).toEqual(picks(3));
  });
});

describe("rollTaunt", () => {
  it("gives a Taunt about one time in four, and nothing otherwise", () => {
    const rng = new Rng(5);
    const rolls = Array.from({ length: 4000 }, () => rollTaunt(rng));
    for (const r of rolls) if (r !== null) expect(TAUNTS).toContain(r);
    const share = rolls.filter((r) => r !== null).length / rolls.length;
    expect(TAUNT_CHANCE).toBe(0.25);
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.3);
  });

  it("picks every Taunt over many rolls", () => {
    const rng = new Rng(2);
    const seen = new Set(Array.from({ length: 4000 }, () => rollTaunt(rng)));
    for (const t of TAUNTS) expect(seen).toContain(t);
  });

  it("is reproducible from the flavour Rng", () => {
    const rolls = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: 20 }, () => rollTaunt(rng));
    };
    expect(rolls(3)).toEqual(rolls(3));
  });
});
