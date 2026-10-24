import { SETTLE_PASSES_PER_TICK, TANK_FALL_PIXELS_PER_TICK, TANK_HALF_WIDTH } from "./constants";
import { isAlive, isSupported, tankCells } from "./tank";
import type { Terrain } from "./terrain";
import type { Tank } from "./types";

/**
 * One tick of Settling: run SETTLE_PASSES_PER_TICK Terrain passes, then drop each unsupported
 * living Tank up to TANK_FALL_PIXELS_PER_TICK px. A Tank that reaches the bottom of the field dies;
 * there is no other fall damage. Dirt rests on a living Tank rather than falling into it.
 * Returns true if any dirt or Tank moved, false once all is at rest.
 */
export function settleTick(terrain: Terrain, tanks: Tank[]): boolean {
  let moved = false;
  const blockers = tanks.filter(isAlive).map(tankCells);
  for (let i = 0; i < SETTLE_PASSES_PER_TICK; i++) {
    if (terrain.settlePass(blockers)) moved = true;
  }
  for (const t of tanks) {
    if (!isAlive(t)) continue;
    for (let i = 0; i < TANK_FALL_PIXELS_PER_TICK && !isSupported(t, terrain); i++) {
      t.y += 1;
      moved = true;
      // Any dirt resting on the Tank falls after it.
      terrain.markUnsettled(t.x - TANK_HALF_WIDTH, t.x + TANK_HALF_WIDTH);
    }
    if (t.y >= terrain.height) t.health = 0;
  }
  return moved;
}
