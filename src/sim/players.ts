import type { Player, PlayerSetup } from "./types";

/** One colour per Player, MAX_PLAYERS long; each stands out against the sky and the dirt. */
export const PLAYER_COLORS = [
  "#ff5050", // red
  "#50a0ff", // blue
  "#50e050", // green
  "#ffe040", // yellow
  "#e060ff", // violet
  "#40e0e0", // cyan
  "#ff9030", // orange
  "#ff80c0", // pink
  "#e0e0e0", // white
  "#a0ff80", // lime
] as const;

/** One Player per setup, in order; a Computer Player takes its setup's Personality. */
export function createPlayers(setups: readonly PlayerSetup[]): Player[] {
  return setups.map((setup, id) => {
    const color = PLAYER_COLORS[id];
    if (color === undefined) throw new Error(`No colour for Player ${id + 1}`);
    return {
      id,
      name: `Player ${id + 1}`,
      color,
      kind: setup.kind,
      personality: setup.kind === "computer" ? setup.personality : null,
    };
  });
}
