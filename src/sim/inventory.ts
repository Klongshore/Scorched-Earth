import { WEAPONS } from "./constants";
import type { Weapon, WeaponName } from "./types";

/**
 * How many of each Weapon a Player owns, kept for the whole Match. The Baby Missile is never
 * stored: every Player always has it without limit.
 */
export class Inventory {
  private readonly counts = new Map<WeaponName, number>();

  /** How many of this Weapon the Player owns; Infinity for the Baby Missile. */
  count(name: WeaponName): number {
    if (name === "Baby Missile") return Infinity;
    return this.counts.get(name) ?? 0;
  }

  /** Add `n` of a Weapon. Throws for the Baby Missile or a count that is not a positive integer. */
  add(name: WeaponName, n: number): void {
    if (name === "Baby Missile") throw new Error("The Baby Missile is never added");
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Cannot add ${n} of ${name}`);
    this.counts.set(name, this.count(name) + n);
  }

  /** Use one up by firing it. Does nothing for the Baby Missile; throws if none are left. */
  useOne(name: WeaponName): void {
    if (name === "Baby Missile") return;
    const count = this.count(name);
    if (count <= 0) throw new Error(`No ${name} left`);
    this.counts.set(name, count - 1);
  }

  /** The Weapons with a count above 0, Baby Missile first, then in catalogue order. */
  owned(): Weapon[] {
    return WEAPONS.filter((w) => this.count(w.name) > 0);
  }
}
