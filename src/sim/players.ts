import type { Player, PlayerKind } from "./types";

export const PLAYER_COLORS = ["#ff5050", "#50a0ff"] as const;

export function createPlayers(kinds: readonly PlayerKind[]): Player[] {
  return kinds.map((kind, id) => ({
    id,
    name: `Player ${id + 1}`,
    color: PLAYER_COLORS[id] ?? "#ffffff",
    kind,
    personality: kind === "computer" ? "moron" : null,
  }));
}
