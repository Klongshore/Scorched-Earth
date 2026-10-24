import { describe, expect, it } from "vitest";
import { BABY_MISSILE, WEAPONS, weaponNamed } from "./constants";
import type { WeaponName } from "./types";

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
    expect(row("Missile")).toEqual(["blast", 5, 1875, 30, 50]);
    expect(row("Baby Nuke")).toEqual(["blast", 3, 10_000, 45, 70]);
    expect(row("Nuke")).toEqual(["blast", 1, 12_000, 75, 100]);
  });

  it("has the Dirt Weapons' Bundles, prices and radii, last in Shop order", () => {
    expect(WEAPONS.slice(-3).map((w) => w.name)).toEqual(["Dirt Clod", "Dirt Ball", "Ton of Dirt"]);
    const row = (name: WeaponName) => {
      const w = weaponNamed(name);
      return [w.kind, w.bundle, w.price, w.radius];
    };
    expect(row("Dirt Clod")).toEqual(["dirt", 10, 5000, 20]);
    expect(row("Dirt Ball")).toEqual(["dirt", 5, 5000, 35]);
    expect(row("Ton of Dirt")).toEqual(["dirt", 2, 6750, 70]);
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
