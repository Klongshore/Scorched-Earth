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

  it("has the splitters' Bundles, prices, radii and damage, after the blast family", () => {
    expect(WEAPONS.slice(4, 6).map((w) => w.name)).toEqual(["MIRV", "Funky Bomb"]);
    const row = (name: WeaponName) => {
      const w = weaponNamed(name);
      return [w.kind, w.bundle, w.price, w.radius, w.kind === "dirt" ? null : w.maxDamage];
    };
    expect(row("MIRV")).toEqual(["mirv", 3, 10_000, 30, 50]);
    expect(row("Funky Bomb")).toEqual(["funky", 2, 7_000, 30, 50]);
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
