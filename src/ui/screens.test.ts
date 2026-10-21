import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYERS,
  DEFAULT_ROUNDS,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
} from "../sim/constants";
import { createPlayers } from "../sim/players";
import {
  DEFAULT_PLAYERS_SETUP,
  PLAYER_COUNTS,
  PLAYER_OPTIONS,
  clampRounds,
  optionValue,
  resizePlayerChoices,
  setupChoiceFrom,
} from "./screens";

describe("Player choices on the Setup screen", () => {
  it("offers Human, Moron and Shooter", () => {
    expect(PLAYER_OPTIONS.map((o) => o.label)).toEqual(["Human", "Moron", "Shooter"]);
    expect(PLAYER_OPTIONS.map((o) => o.setup)).toEqual([
      { kind: "human" },
      { kind: "computer", personality: "moron" },
      { kind: "computer", personality: "shooter" },
    ]);
  });

  it("starts a Match with the chosen Shooters", () => {
    const shooter = optionValue({ kind: "computer", personality: "shooter" });
    expect(setupChoiceFrom(["human", shooter, shooter], "2").players).toEqual([
      { kind: "human" },
      { kind: "computer", personality: "shooter" },
      { kind: "computer", personality: "shooter" },
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

describe("Player count on the Setup screen", () => {
  const human = optionValue({ kind: "human" });
  const moron = optionValue({ kind: "computer", personality: "moron" });

  it("offers 2 to 10 Players, defaulting to 2", () => {
    expect(PLAYER_COUNTS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(PLAYER_COUNTS[0]).toBe(MIN_PLAYERS);
    expect(PLAYER_COUNTS.at(-1)).toBe(MAX_PLAYERS);
    expect(DEFAULT_PLAYERS_SETUP).toHaveLength(DEFAULT_PLAYERS);
  });

  it("adds Moron rows at the end when raised, keeping existing choices", () => {
    const five = resizePlayerChoices([moron, human], 5);
    expect(five).toEqual([moron, human, moron, moron, moron]);
  });

  it("removes rows from the end when lowered, keeping the first choices", () => {
    const five = [human, moron, human, human, moron];
    expect(resizePlayerChoices(five, 3)).toEqual([human, moron, human]);
  });

  it("goes from 2 to 5 rows and back to 3 keeping the first 3 choices", () => {
    const start = DEFAULT_PLAYERS_SETUP.map(optionValue);
    const five = resizePlayerChoices(start, 5);
    expect(five).toHaveLength(5);
    const edited = [five[0], five[1], human, five[3], five[4]] as string[];
    expect(resizePlayerChoices(edited, 3)).toEqual([human, moron, human]);
  });

  it("starts a 10-Player Match with every choice in order", () => {
    const values = resizePlayerChoices([human, human], MAX_PLAYERS);
    const choice = setupChoiceFrom(values, "1");
    expect(choice.players).toHaveLength(MAX_PLAYERS);
    expect(choice.players.slice(0, 3)).toEqual([
      { kind: "human" },
      { kind: "human" },
      { kind: "computer", personality: "moron" },
    ]);
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
