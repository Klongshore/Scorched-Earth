import { describe, expect, it } from "vitest";
import { BABY_MISSILE, FOR_SALE, ITEMS, WEAPONS, forSaleNamed, weaponNamed } from "./constants";
import type { WeaponName } from "./types";

describe("Item catalogue", () => {
  it("has the Shield, Heavy Shield and Parachute, in Shop order", () => {
    expect(ITEMS.map((i) => [i.name, i.kind, i.bundle, i.price])).toEqual([
      ["Shield", "shield", 3, 6_000],
      ["Heavy Shield", "shield", 2, 10_000],
      ["Parachute", "parachute", 5, 3_000],
    ]);
  });

  it("names no Item like a Weapon", () => {
    const weaponNames: string[] = WEAPONS.map((w) => w.name);
    const names = ITEMS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(weaponNames).not.toContain(name);
  });

  it("gives every Item a positive integer Bundle and price, and every Shield Shield Strength", () => {
    for (const item of ITEMS) {
      expect(Number.isInteger(item.bundle) && item.bundle > 0, item.name).toBe(true);
      expect(Number.isInteger(item.price) && item.price > 0, item.name).toBe(true);
      if (item.kind === "shield") expect(item.strength, item.name).toBeGreaterThan(0);
    }
    const strengths = ITEMS.map((i) => (i.kind === "shield" ? i.strength : null));
    expect(strengths).toEqual([50, 100, null]);
  });
});

describe("What the Shop sells", () => {
  it("is the Weapons but the Baby Missile, in catalogue order, then the Items", () => {
    expect(FOR_SALE).toEqual([...WEAPONS.slice(1), ...ITEMS]);
    expect(FOR_SALE).toHaveLength(14);
    expect(FOR_SALE).not.toContain(BABY_MISSILE);
  });

  it("finds every Weapon and Item by name, and throws for an unknown one", () => {
    for (const thing of [...WEAPONS, ...ITEMS]) expect(forSaleNamed(thing.name)).toBe(thing);
    expect(() => forSaleNamed("Battery" as WeaponName)).toThrow();
  });
});

describe("Weapon catalogue", () => {
  it("has unique names", () => {
    const names = WEAPONS.map((w) => w.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("starts with the Baby Missile", () => {
    expect(WEAPONS[0]?.name).toBe("Baby Missile");
  });

  it("gives only the Baby Missile no Bundle and a price of 0", () => {
    for (const w of WEAPONS) {
      if (w.name === "Baby Missile") {
        expect(w.bundle).toBeNull();
        expect(w.price).toBe(0);
      } else {
        expect(Number.isInteger(w.bundle) && (w.bundle as number) > 0, w.name).toBe(true);
        expect(Number.isInteger(w.price) && w.price > 0, w.name).toBe(true);
      }
    }
  });

  it("gives every damaging kind a positive max damage", () => {
    for (const w of WEAPONS) {
      if (w.kind !== "dirt") expect(w.maxDamage, w.name).toBeGreaterThan(0);
    }
  });

  it("looks Weapons up by name", () => {
    for (const w of WEAPONS) expect(weaponNamed(w.name)).toBe(w);
  });

  it("has the blast family's Bundles, prices, radii and damage, in Shop order", () => {
    expect(WEAPONS.slice(0, 4).map((w) => w.name)).toEqual([
      "Baby Missile",
      "Missile",
      "Baby Nuke",
      "Nuke",
    ]);
    const row = (name: WeaponName) => {
      const w = weaponNamed(name);
      return [w.kind, w.bundle, w.price, w.radius, w.kind === "dirt" ? null : w.maxDamage];
    };
    expect(row("Missile")).toEqual(["blast", 5, 1_875, 30, 50]);
    expect(row("Baby Nuke")).toEqual(["blast", 3, 10_000, 45, 70]);
    expect(row("Nuke")).toEqual(["blast", 1, 12_000, 75, 100]);
  });

  it("has the splitters' Bundles, prices, radii and damage, after the blast family", () => {
    expect(WEAPONS.slice(4, 6).map((w) => w.name)).toEqual(["MIRV", "Funky Bomb"]);
    const row = (name: WeaponName) => {
      const w = weaponNamed(name);
      return [w.kind, w.bundle, w.price, w.radius, w.kind === "dirt" ? null : w.maxDamage];
    };
    expect(row("MIRV")).toEqual(["mirv", 3, 10_000, 30, 50]);
    expect(row("Funky Bomb")).toEqual(["funky", 2, 7_000, 30, 50]);
  });

  it("has the Rollers' Bundles, prices, radii and damage, after the splitters", () => {
    expect(WEAPONS.slice(6, 9).map((w) => w.name)).toEqual([
      "Baby Roller",
      "Roller",
      "Heavy Roller",
    ]);
    const row = (name: WeaponName) => {
      const w = weaponNamed(name);
      return [w.kind, w.bundle, w.price, w.radius, w.kind === "dirt" ? null : w.maxDamage];
    };
    expect(row("Baby Roller")).toEqual(["roller", 10, 5_000, 20, 30]);
    expect(row("Roller")).toEqual(["roller", 5, 6000, 30, 50]);
    expect(row("Heavy Roller")).toEqual(["roller", 2, 6_750, 45, 70]);
  });

  it("has the Dirt Weapons' Bundles, prices and radii, last in Shop order", () => {
    expect(WEAPONS.slice(-3).map((w) => w.name)).toEqual(["Dirt Clod", "Dirt Ball", "Ton of Dirt"]);
    const row = (name: WeaponName) => {
      const w = weaponNamed(name);
      return [w.kind, w.bundle, w.price, w.radius];
    };
    expect(row("Dirt Clod")).toEqual(["dirt", 10, 5_000, 20]);
    expect(row("Dirt Ball")).toEqual(["dirt", 5, 5_000, 35]);
    expect(row("Ton of Dirt")).toEqual(["dirt", 2, 6_750, 70]);
  });

  it("throws for a name not in the catalogue", () => {
    expect(() => weaponNamed("Wet Noodle" as WeaponName)).toThrow();
  });

  it("keeps the Baby Missile's numbers", () => {
    expect(BABY_MISSILE).toEqual({
      name: "Baby Missile",
      kind: "blast",
      radius: 20,
      maxDamage: 30,
      bundle: null,
      price: 0,
    });
    expect(BABY_MISSILE).toBe(weaponNamed("Baby Missile"));
  });
});
