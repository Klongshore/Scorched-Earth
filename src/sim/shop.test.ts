import { describe, expect, it } from "vitest";
import { WEAPONS, weaponNamed } from "./constants";
import { Rng } from "./rng";
import { canAfford, computerShopping } from "./shop";
import type { WeaponName } from "./types";

const cheapest = Math.min(...WEAPONS.filter((w) => w.bundle !== null).map((w) => w.price));

function spent(names: readonly WeaponName[]): number {
  return names.reduce((sum, name) => sum + weaponNamed(name).price, 0);
}

describe("canAfford", () => {
  it("is true only when the Money covers one Bundle", () => {
    const missile = weaponNamed("Missile");
    expect(canAfford(missile, missile.price)).toBe(true);
    expect(canAfford(missile, missile.price - 1)).toBe(false);
  });

  it("is never true for the Baby Missile", () => {
    expect(canAfford(weaponNamed("Baby Missile"), 1_000_000)).toBe(false);
  });
});

describe("computerShopping", () => {
  it("never overspends and stops only when nothing is affordable", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const money = new Rng(seed * 7919).int(0, 100_000);
      const bought = computerShopping(money, new Rng(seed));
      const left = money - spent(bought);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThan(cheapest);
      expect(bought).not.toContain("Baby Missile");
    }
  });

  it("buys nothing when nothing is affordable, without drawing from the Rng", () => {
    const rng = new Rng(5);
    expect(computerShopping(cheapest - 1, rng)).toEqual([]);
    expect(rng.next()).toBe(new Rng(5).next());
  });

  it("is reproducible from a seed", () => {
    expect(computerShopping(60_000, new Rng(9))).toEqual(computerShopping(60_000, new Rng(9)));
  });

  it("buys every Weapon for sale across seeds", () => {
    const seen = new Set<WeaponName>();
    for (let seed = 1; seed <= 50; seed++) {
      for (const name of computerShopping(100_000, new Rng(seed))) seen.add(name);
    }
    expect(seen.size).toBe(WEAPONS.length - 1);
  });
});
