import {
  MAX_HEALTH,
  PAD_HALF_WIDTH,
  PLACEMENT_EDGE_MARGIN,
  PLACEMENT_MAX_JITTER,
  START_ANGLE,
  START_POWER,
} from "./constants";
import type { Rng } from "./rng";
import type { Terrain } from "./terrain";
import type { Tank } from "./types";

/** Places one Tank per player on a flattened pad; returns Tanks in `playerIds` order. */
export function placeTanks(rng: Rng, terrain: Terrain, playerIds: readonly number[]): Tank[] {
  const n = playerIds.length;
  const width = terrain.width;
  const jitter = Math.min(PLACEMENT_MAX_JITTER, width / (4 * n));
  const slotOwners = rng.shuffle(playerIds);

  const byPlayer = new Map<number, Tank>();
  slotOwners.forEach((playerId, slot) => {
    const raw = Math.round((width * (slot + 0.5)) / n + rng.range(-jitter, jitter));
    const x = Math.min(width - 1 - PLACEMENT_EDGE_MARGIN, Math.max(PLACEMENT_EDGE_MARGIN, raw));
    const groundY = terrain.surfaceY(x);
    terrain.flatten(x - PAD_HALF_WIDTH, x + PAD_HALF_WIDTH, groundY);
    byPlayer.set(playerId, {
      playerId,
      x,
      y: groundY,
      angle: START_ANGLE,
      power: START_POWER,
      health: MAX_HEALTH,
    });
  });
  return playerIds.map((id) => byPlayer.get(id) as Tank);
}
