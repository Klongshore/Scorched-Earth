import { describe, expect, it } from "vitest";
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

  it("lists owned Weapons with the Baby Missile first, then in catalogue order", () => {
    const inventory = new Inventory();
    inventory.add("Nuke", 1);
    inventory.add("Missile", 5);
    expect(inventory.owned().map((w) => w.name)).toEqual(["Baby Missile", "Missile", "Nuke"]);
    inventory.useOne("Nuke");
    expect(inventory.owned().map((w) => w.name)).toEqual(["Baby Missile", "Missile"]);
  });
});
