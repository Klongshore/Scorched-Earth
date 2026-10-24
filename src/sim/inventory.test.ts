import { describe, expect, it } from "vitest";
import { forSaleNamed } from "./constants";
import { Inventory } from "./inventory";

describe("Inventory", () => {
  it("starts empty except for the unlimited Baby Missile", () => {
    const inventory = new Inventory();
    expect(inventory.count("Baby Missile")).toBe(Infinity);
    expect(inventory.count("Missile")).toBe(0);
    expect(inventory.count("Nuke")).toBe(0);
    expect(inventory.owned().map((w) => w.name)).toEqual(["Baby Missile"]);
  });

  it("counts what is added", () => {
    const inventory = new Inventory();
    inventory.add("Missile", 5);
    inventory.add("Missile", 5);
    inventory.add("Nuke", 1);
    expect(inventory.count("Missile")).toBe(10);
    expect(inventory.count("Nuke")).toBe(1);
  });

  it("refuses to add the Baby Missile, or a count that is not a positive integer", () => {
    const inventory = new Inventory();
    expect(() => inventory.add("Baby Missile", 1)).toThrow();
    expect(() => inventory.add("Missile", 0)).toThrow();
    expect(() => inventory.add("Missile", 1.5)).toThrow();
  });

  it("uses one up at a time, and throws when none are left", () => {
    const inventory = new Inventory();
    inventory.add("Baby Nuke", 2);
    inventory.useOne("Baby Nuke");
    expect(inventory.count("Baby Nuke")).toBe(1);
    inventory.useOne("Baby Nuke");
    expect(inventory.count("Baby Nuke")).toBe(0);
    expect(() => inventory.useOne("Baby Nuke")).toThrow();
    expect(() => inventory.useOne("Nuke")).toThrow();
  });

  it("never uses up the Baby Missile", () => {
    const inventory = new Inventory();
    inventory.useOne("Baby Missile");
    expect(inventory.count("Baby Missile")).toBe(Infinity);
  });

  it("counts Items, uses them up, and never lists them among the owned Weapons", () => {
    const inventory = new Inventory();
    inventory.add("Parachute", 5);
    inventory.add("Shield", 3);
    inventory.add("Heavy Shield", 2);
    inventory.useOne("Parachute");
    expect(inventory.count("Parachute")).toBe(4);
    expect(inventory.count("Shield")).toBe(3);
    expect(inventory.count("Heavy Shield")).toBe(2);
    expect(inventory.owned().map((w) => w.name)).toEqual(["Baby Missile"]);
  });

  it("reports the owned Shield with the most Shield Strength", () => {
    const inventory = new Inventory();
    expect(inventory.strongestShield()).toBeNull();
    inventory.add("Parachute", 5);
    expect(inventory.strongestShield()).toBeNull();
    inventory.add("Shield", 1);
    expect(inventory.strongestShield()?.name).toBe("Shield");
    inventory.add("Heavy Shield", 1);
    expect(inventory.strongestShield()?.name).toBe("Heavy Shield");
    inventory.useOne("Heavy Shield");
    expect(inventory.strongestShield()).toBe(forSaleNamed("Shield"));
    inventory.useOne("Shield");
    expect(inventory.strongestShield()).toBeNull();
  });

  it("lists owned Weapons with the Baby Missile first, then in catalogue order", () => {
    const inventory = new Inventory();
    inventory.add("Nuke", 1);
    inventory.add("Missile", 5);
    expect(inventory.owned().map((w) => w.name)).toEqual(["Baby Missile", "Missile", "Nuke"]);
    inventory.useOne("Nuke");
    expect(inventory.owned().map((w) => w.name)).toEqual(["Baby Missile", "Missile"]);
  });
});
