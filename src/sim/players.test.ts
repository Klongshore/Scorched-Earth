import { describe, expect, it } from "vitest";
import { MAX_PLAYERS } from "./constants";
import { PLAYER_COLORS, createPlayers } from "./players";
import type { PlayerSetup } from "./types";

describe("Player colours", () => {
  it("has one distinct colour per Player, up to MAX_PLAYERS", () => {
    expect(PLAYER_COLORS).toHaveLength(MAX_PLAYERS);
    expect(new Set(PLAYER_COLORS).size).toBe(MAX_PLAYERS);
  });

  it("keeps red and blue for Players 1 and 2", () => {
    expect(PLAYER_COLORS.slice(0, 2)).toEqual(["#ff5050", "#50a0ff"]);
  });

  it("gives each of 10 Players their own colour and name, in order", () => {
    const setups: PlayerSetup[] = Array.from({ length: MAX_PLAYERS }, () => ({ kind: "human" }));
    const players = createPlayers(setups);
    expect(players.map((p) => p.color)).toEqual([...PLAYER_COLORS]);
    expect(players.map((p) => p.name)).toEqual(
      Array.from({ length: MAX_PLAYERS }, (_, i) => `Player ${i + 1}`),
    );
  });
});
