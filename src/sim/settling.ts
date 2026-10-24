import {
  FALL_DAMAGE_PER_PIXEL,
  FALL_SAFE_PIXELS,
  SETTLE_PASSES_PER_TICK,
  TANK_FALL_PIXELS_PER_TICK,
  TANK_HALF_WIDTH,
} from "./constants";
import { clampAim, isAlive, isSupported, tankCells } from "./tank";
import type { Terrain } from "./terrain";
import type { Tank } from "./types";

/**
 * One tick of Settling: run SETTLE_PASSES_PER_TICK Terrain passes, then drop each unsupported
 * living Tank up to TANK_FALL_PIXELS_PER_TICK px, adding each px to its `fallen`. A Tank that
 * reaches the bottom of the field dies. Fall Damage waits for landTanks, once all is at rest.
 * Dirt rests on a living Tank rather than falling into it.
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
      t.fallen += 1;
      moved = true;
      // Any dirt resting on the Tank falls after it.
      terrain.markUnsettled(t.x - TANK_HALF_WIDTH, t.x + TANK_HALF_WIDTH);
    }
    if (t.y >= terrain.height) t.health = 0;
  }
  return moved;
}

/** The Fall Damage for a fall of `fallen` px. */
export function fallDamage(fallen: number): number {
  return Math.floor(Math.max(0, fallen - FALL_SAFE_PIXELS) * FALL_DAMAGE_PER_PIXEL);
}

/**
 * Call once Settling is at rest. Every living Tank that fell takes its Fall Damage and has its
 * aim clamped. Then every Tank's `fallen` resets to 0. A Tank this destroys marks its columns
 * unsettled so dirt resting on it falls. Returns true if it destroyed any Tank, so Settling must
 * continue.
 */
export function landTanks(terrain: Terrain, tanks: Tank[]): boolean {
  let destroyed = false;
  for (const t of tanks) {
    if (isAlive(t) && t.fallen > 0) {
      t.health = Math.max(0, t.health - fallDamage(t.fallen));
      clampAim(t);
      if (!isAlive(t)) {
        destroyed = true;
        terrain.markUnsettled(t.x - TANK_HALF_WIDTH, t.x + TANK_HALF_WIDTH);
      }
    }
    t.fallen = 0;
  }
  return destroyed;
}
