import { describe, expect, it } from "vitest";
import { MAX_PLAYERS } from "./constants";
import { PLAYER_COLORS, createPlayers, playerLook } from "./players";
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

describe("playerLook", () => {
  it("gives the name and colour createPlayers uses, for every Player", () => {
    const setups: PlayerSetup[] = Array.from({ length: MAX_PLAYERS }, () => ({ kind: "human" }));
    for (const player of createPlayers(setups)) {
      expect(playerLook(player.id)).toEqual({ name: player.name, color: player.color });
    }
  });

  it("refuses a Player beyond MAX_PLAYERS", () => {
    expect(() => playerLook(MAX_PLAYERS)).toThrow();
  });
});
