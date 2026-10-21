import { describe, expect, it } from "vitest";
import { DEFAULT_ROUNDS, MAX_ROUNDS, MIN_ROUNDS } from "../sim/constants";
import { clampRounds } from "./screens";

describe("clampRounds", () => {
  it("keeps valid Round counts", () => {
    expect(clampRounds("1")).toBe(1);
    expect(clampRounds("10")).toBe(10);
    expect(clampRounds(99)).toBe(99);
  });

  it("clamps out-of-range counts to MIN_ROUNDS..MAX_ROUNDS", () => {
    expect(clampRounds("0")).toBe(MIN_ROUNDS);
    expect(clampRounds("-5")).toBe(MIN_ROUNDS);
    expect(clampRounds("100")).toBe(MAX_ROUNDS);
    expect(clampRounds(1e9)).toBe(MAX_ROUNDS);
  });

  it("rounds fractions to a whole number of Rounds", () => {
    expect(clampRounds("2.4")).toBe(2);
    expect(clampRounds("2.6")).toBe(3);
  });

  it("falls back to the default for empty or non-numeric input", () => {
    expect(clampRounds("")).toBe(DEFAULT_ROUNDS);
    expect(clampRounds("abc")).toBe(DEFAULT_ROUNDS);
    expect(clampRounds(NaN)).toBe(DEFAULT_ROUNDS);
  });
});
