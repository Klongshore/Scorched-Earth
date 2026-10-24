import { FOR_SALE } from "./constants";
import type { Rng } from "./rng";
import type { ForSale, ShopName } from "./types";

/** Whether a Player with `money` can buy one Bundle of `thing`. Never true for the Baby Missile. */
export function canAfford(thing: ForSale, money: number): boolean {
  return thing.bundle !== null && thing.price <= money;
}

/**
 * A Computer Player's whole Shop visit: keep buying one random affordable Bundle of a Weapon or
 * Item, chosen with rng, until none is affordable. Returns the names bought, in order. Same rule
 * for every Personality. Always ends, because every Bundle has a positive price.
 */
export function computerShopping(money: number, rng: Rng): ShopName[] {
  const bought: ShopName[] = [];
  let left = money;
  for (;;) {
    const affordable = FOR_SALE.filter((thing) => canAfford(thing, left));
    if (affordable.length === 0) return bought;
    const thing = affordable[rng.int(0, affordable.length - 1)] as ForSale;
    bought.push(thing.name);
    left -= thing.price;
  }
}
