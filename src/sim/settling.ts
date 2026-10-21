import { SETTLE_PASSES_PER_TICK, TANK_FALL_PIXELS_PER_TICK } from "./constants";
import { isAlive, isSupported } from "./tank";
import type { Terrain } from "./terrain";
import type { Tank } from "./types";

/**
 * One tick of Settling: run SETTLE_PASSES_PER_TICK Terrain passes, then drop each unsupported
 * living Tank up to TANK_FALL_PIXELS_PER_TICK px. A Tank that reaches the bottom of the field dies;
 * there is no other fall damage. Returns true if any dirt or Tank moved, false once all is at rest.
 */
export function settleTick(terrain: Terrain, tanks: Tank[]): boolean {
  let moved = false;
  for (let i = 0; i < SETTLE_PASSES_PER_TICK; i++) {
    if (terrain.settlePass()) moved = true;
  }
  for (const t of tanks) {
    if (!isAlive(t)) continue;
    for (let i = 0; i < TANK_FALL_PIXELS_PER_TICK && !isSupported(t, terrain); i++) {
      t.y += 1;
      moved = true;
    }
    if (t.y >= terrain.height) t.health = 0;
  }
  return moved;
}
