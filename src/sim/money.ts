import { MONEY_PER_DAMAGE, MONEY_PER_DESTROYED_TANK } from "./constants";
import type { ExplosionHit } from "./types";

/**
 * The Money a list of hits earns `firedBy` (for an Explosion, its hits and whoever fired it): paid
 * for Health removed from other Tanks and for each other Tank destroyed. Harming `firedBy`'s own
 * Tank earns nothing and costs nothing.
 */
export function moneyEarned(hits: readonly ExplosionHit[], firedBy: number): number {
  let money = 0;
  for (const hit of hits) {
    if (hit.playerId === firedBy) continue;
    money += MONEY_PER_DAMAGE * hit.healthRemoved;
    if (hit.destroyed) money += MONEY_PER_DESTROYED_TANK;
  }
  return money;
}
