import { describe, expect, it } from "vitest";
import { DEFAULT_ROUNDS, MAX_ROUNDS, MIN_ROUNDS } from "../sim/constants";
import { createPlayers } from "../sim/players";
import {
  DEFAULT_PLAYERS_SETUP,
  PLAYER_OPTIONS,
  clampRounds,
  optionValue,
  setupChoiceFrom,
} from "./screens";

describe("Player choices on the Setup screen", () => {
  it("offers Human and Moron", () => {
    expect(PLAYER_OPTIONS.map((o) => o.label)).toEqual(["Human", "Moron"]);
    expect(PLAYER_OPTIONS.map((o) => o.setup)).toEqual([
      { kind: "human" },
      { kind: "computer", personality: "moron" },
    ]);
  });

  it("gives every option a distinct value", () => {
    const values = PLAYER_OPTIONS.map((o) => optionValue(o.setup));
    expect(new Set(values).size).toBe(values.length);
  });

  it("defaults to 2 Players: Player 1 Human and Player 2 Moron", () => {
    expect(DEFAULT_PLAYERS_SETUP).toEqual([
      { kind: "human" },
      { kind: "computer", personality: "moron" },
    ]);
  });

  it("reports one choice per Player, in order, with the Round count clamped", () => {
    const moron = optionValue({ kind: "computer", personality: "moron" });
    const human = optionValue({ kind: "human" });
    expect(setupChoiceFrom([moron, human], "100")).toEqual({
      players: [{ kind: "computer", personality: "moron" }, { kind: "human" }],
      rounds: MAX_ROUNDS,
    });
  });

  it("rejects an option value it does not offer", () => {
    expect(() => setupChoiceFrom(["computer"], "3")).toThrow();
  });

  it("gives Humans no Personality and every Computer Player one", () => {
    const players = createPlayers(PLAYER_OPTIONS.map((o) => o.setup));
    for (const player of players) {
      if (player.kind === "human") expect(player.personality).toBeNull();
      else expect(player.personality).not.toBeNull();
    }
  });
});

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
