import { WEAPONS } from "./constants";
import type { Rng } from "./rng";
import type { Weapon, WeaponName } from "./types";

/** Whether a Player with `money` can buy one Bundle of `weapon`. Never true for the Baby Missile. */
export function canAfford(weapon: Weapon, money: number): boolean {
  return weapon.bundle !== null && weapon.price <= money;
}

/**
 * A Computer Player's whole Shop visit: keep buying one random affordable Bundle, chosen with
 * rng, until none is affordable. Returns the names bought, in order. Same rule for every
 * Personality. Always ends, because every Bundle has a positive price.
 */
export function computerShopping(money: number, rng: Rng): WeaponName[] {
  const bought: WeaponName[] = [];
  let left = money;
  for (;;) {
    const affordable = WEAPONS.filter((w) => canAfford(w, left));
    if (affordable.length === 0) return bought;
    const weapon = affordable[rng.int(0, affordable.length - 1)] as Weapon;
    bought.push(weapon.name);
    left -= weapon.price;
  }
}
