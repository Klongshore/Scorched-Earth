import type { Player, PlayerSetup } from "./types";

export const PLAYER_COLORS = ["#ff5050", "#50a0ff"] as const;

/** One Player per setup, in order; a Computer Player takes its setup's Personality. */
export function createPlayers(setups: readonly PlayerSetup[]): Player[] {
  return setups.map((setup, id) => ({
    id,
    name: `Player ${id + 1}`,
    color: PLAYER_COLORS[id] ?? "#ffffff",
    kind: setup.kind,
    personality: setup.kind === "computer" ? setup.personality : null,
  }));
}
