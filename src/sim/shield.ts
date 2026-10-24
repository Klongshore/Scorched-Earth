import type { Inventory } from "./inventory";
import type { Tank } from "./types";

/**
 * Raise the strongest Shield in the Inventory on the Tank at full Shield Strength, using one up
 * and replacing any Shield already raised. Ignored (returns false) when none is owned or the
 * raised Shield already has at least that much Shield Strength. Never draws a random number.
 */
export function raiseShield(tank: Tank, inventory: Inventory): boolean {
  const shield = inventory.strongestShield();
  if (!shield) return false;
  if (tank.shield && tank.shield.strength >= shield.strength) return false;
  inventory.useOne(shield.name);
  tank.shield = { name: shield.name, strength: shield.strength };
  return true;
}

/**
 * Take `damage` off the Tank's Shield first. Returns the damage left over for Health. Drops the
 * Shield once its Shield Strength reaches 0.
 */
export function absorb(tank: Tank, damage: number): number {
  const shield = tank.shield;
  if (!shield || damage <= 0) return damage;
  const absorbed = Math.min(shield.strength, damage);
  shield.strength -= absorbed;
  if (shield.strength <= 0) tank.shield = null;
  return damage - absorbed;
}
