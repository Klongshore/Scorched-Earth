import { BABY_MISSILE, SHIELDS, WEAPONS } from "./constants";
import type { Player, ShieldItem, ShopName, Weapon, WeaponName } from "./types";

/**
 * How many of each Weapon and Item a Player owns, kept for the whole Match. The Baby Missile is
 * never counted: every Player always has it without limit.
 */
export class Inventory {
  private readonly counts = new Map<ShopName, number>();

  /** How many of this Weapon or Item the Player owns; Infinity for the Baby Missile. */
  count(name: ShopName): number {
    if (name === BABY_MISSILE.name) return Infinity;
    return this.counts.get(name) ?? 0;
  }

  /**
   * Add `n` of a Weapon or Item. Throws for the Baby Missile or a count that is not a positive
   * integer.
   */
  add(name: ShopName, n: number): void {
    if (name === BABY_MISSILE.name) throw new Error("The Baby Missile is never added");
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Cannot add ${n} of ${name}`);
    this.counts.set(name, this.count(name) + n);
  }

  /**
   * Use one up, by firing a Weapon or using an Item. Does nothing for the Baby Missile; throws if
   * none are left.
   */
  useOne(name: ShopName): void {
    if (name === BABY_MISSILE.name) return;
    const count = this.count(name);
    if (count <= 0) throw new Error(`No ${name} left`);
    this.counts.set(name, count - 1);
  }

  /**
   * The Weapons with a count above 0, Baby Missile first, then in catalogue order. Never an
   * Item: this feeds Tab cycling and Computer Weapon choice.
   */
  owned(): Weapon[] {
    return WEAPONS.filter((w) => this.count(w.name) > 0);
  }

  /** The owned Shield with the most Shield Strength, or null when none is owned. */
  strongestShield(): ShieldItem | null {
    let best: ShieldItem | null = null;
    for (const shield of SHIELDS) {
      if (this.count(shield.name) <= 0) continue;
      if (!best || shield.strength > best.strength) best = shield;
    }
    return best;
  }
}

/**
 * What the Match lends each Round, both indexed by playerId and kept for the whole Match: every
 * Player's Inventory, and the Weapon each Player last chose (the Round updates it in place).
 */
export interface Loadout {
  readonly inventories: readonly Inventory[];
  readonly chosenWeapons: WeaponName[];
}

/** A Loadout with nothing bought: every Player holds only the Baby Missile. */
export function emptyLoadout(players: readonly Player[]): Loadout {
  return {
    inventories: players.map(() => new Inventory()),
    chosenWeapons: players.map(() => BABY_MISSILE.name),
  };
}

/** A Player's Inventory in a Loadout; throws for a playerId it does not hold. */
export function inventoryIn(loadout: Loadout, playerId: number): Inventory {
  const inventory = loadout.inventories[playerId];
  if (!inventory) throw new Error(`No Inventory for player ${playerId}`);
  return inventory;
}
