import { MONEY_PER_DAMAGE, MONEY_PER_DESTROYED_TANK } from "./constants";
import type { Explosion } from "./types";

/**
 * The Money an Explosion earns whoever fired it: paid for Health removed from other Tanks and
 * for each other Tank destroyed. Harming the firer's own Tank earns nothing and costs nothing.
 */
export function moneyEarned(explosion: Explosion, firedBy: number): number {
  let money = 0;
  for (const hit of explosion.hits) {
    if (hit.playerId === firedBy) continue;
    money += MONEY_PER_DAMAGE * hit.healthRemoved;
    if (hit.destroyed) money += MONEY_PER_DESTROYED_TANK;
  }
  return money;
}

/** Money as shown to Players: a dollar sign, a thousands separator and no decimals. */
export function formatMoney(amount: number): string {
  return `$${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
