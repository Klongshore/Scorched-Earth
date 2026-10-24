import { describe, expect, it } from "vitest";
import {
  BABY_MISSILE,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MONEY_PER_DAMAGE,
  weaponNamed,
} from "./constants";
import { detonate } from "./explosion";
import { emptyLoadout, Inventory } from "./inventory";
import { Match } from "./match";
import { moneyEarned } from "./money";
import { createPlayers } from "./players";
import { Rng } from "./rng";
import { Round } from "./round";
import { absorb, raiseShield } from "./shield";
import { centre, newTank } from "./tank";
import { Terrain } from "./terrain";
import type { PlayerSetup, ShieldName, Tank } from "./types";

const HUMAN: PlayerSetup = { kind: "human" };
const MORON: PlayerSetup = { kind: "computer", personality: "moron" };
const GROUND = 400;

function flat(): Terrain {
  return Terrain.fromSurface(
    new Array<number>(FIELD_WIDTH).fill(GROUND),
    FIELD_WIDTH,
    FIELD_HEIGHT,
  );
}

function shielded(name: ShieldName, strength: number, overrides: Partial<Tank> = {}): Tank {
  return { ...newTank(0, 320, GROUND), shield: { name, strength }, ...overrides };
}

function owning(shields: Partial<Record<ShieldName, number>>): Inventory {
  const inventory = new Inventory();
  for (const [name, n] of Object.entries(shields) as [ShieldName, number][]) {
    inventory.add(name, n);
  }
  return inventory;
}

function finishShop(match: Match): void {
  for (let s = match.currentShopper; s !== null; s = match.currentShopper) match.finishShopping(s);
}

describe("raiseShield", () => {
  it("raises the Heavy Shield first, then the Shield, using one up each time", () => {
    const inventory = owning({ Shield: 1, "Heavy Shield": 1 });
    const tank = newTank(0, 320, GROUND);
    expect(raiseShield(tank, inventory)).toBe(true);
    expect(tank.shield).toEqual({ name: "Heavy Shield", strength: 100 });
    expect(inventory.count("Heavy Shield")).toBe(0);
    tank.shield = null;
    expect(raiseShield(tank, inventory)).toBe(true);
    expect(tank.shield).toEqual({ name: "Shield", strength: 50 });
    expect(inventory.count("Shield")).toBe(0);
  });

  it("is ignored with no Shield owned", () => {
    const tank = newTank(0, 320, GROUND);
    expect(raiseShield(tank, new Inventory())).toBe(false);
    expect(tank.shield).toBeNull();
  });

  it("is ignored while the raised Shield has at least that much Strength", () => {
    const inventory = owning({ Shield: 2 });
    const tank = shielded("Shield", 50);
    expect(raiseShield(tank, inventory)).toBe(false);
    expect(inventory.count("Shield")).toBe(2);
    const heavy = shielded("Heavy Shield", 60);
    expect(raiseShield(heavy, inventory)).toBe(false);
    expect(heavy.shield).toEqual({ name: "Heavy Shield", strength: 60 });
  });

  it("replaces a damaged or weaker Shield", () => {
    const inventory = owning({ Shield: 1, "Heavy Shield": 1 });
    const tank = shielded("Shield", 50);
    expect(raiseShield(tank, inventory)).toBe(true);
    expect(tank.shield).toEqual({ name: "Heavy Shield", strength: 100 });
    const damaged = shielded("Shield", 10);
    expect(raiseShield(damaged, inventory)).toBe(true);
    expect(damaged.shield).toEqual({ name: "Shield", strength: 50 });
  });
});

describe("absorb", () => {
  it("only lowers the Strength for damage below it", () => {
    const tank = shielded("Shield", 50);
    expect(absorb(tank, 30)).toBe(0);
    expect(tank.shield?.strength).toBe(20);
  });

  it("drops the Shield and returns the rest for damage above it", () => {
    const tank = shielded("Shield", 20);
    expect(absorb(tank, 50)).toBe(30);
    expect(tank.shield).toBeNull();
  });

  it("drops the Shield exactly at 0", () => {
    const tank = shielded("Shield", 20);
    expect(absorb(tank, 20)).toBe(0);
    expect(tank.shield).toBeNull();
  });

  it("passes all damage through with no Shield", () => {
    expect(absorb(newTank(0, 320, GROUND), 25)).toBe(25);
  });
});

describe("detonate with Shields", () => {
  it("leaves Health 100 and Shield 20 after a Baby Missile at the centre of a Shield (50)", () => {
    const t = shielded("Shield", 50);
    const c = centre(t);
    const explosion = detonate(c.x, c.y, BABY_MISSILE, flat(), [t]);
    expect(t.health).toBe(100);
    expect(t.shield?.strength).toBe(20);
    expect(explosion.hits).toEqual([]);
  });

  it("leaves Health 50 and no Shield after a Nuke at the centre of a Shield (50)", () => {
    const t = shielded("Shield", 50);
    const c = centre(t);
    detonate(c.x, c.y, weaponNamed("Nuke"), flat(), [t]);
    expect(t.health).toBe(50);
    expect(t.shield).toBeNull();
  });

  it("shields a Tank from its own Weapon too", () => {
    const t = shielded("Heavy Shield", 100);
    const c = centre(t);
    detonate(c.x, c.y, weaponNamed("Missile"), flat(), [t]);
    expect(t.health).toBe(100);
    expect(t.shield?.strength).toBe(50);
  });

  it("pays nothing for a Missile a Shield fully absorbs", () => {
    const t = shielded("Shield", 50, { playerId: 1 });
    const c = centre(t);
    const { hits } = detonate(c.x, c.y, weaponNamed("Missile"), flat(), [t]);
    expect(moneyEarned(hits, 0)).toBe(0);
  });

  it("pays for 30 Health removed through a Shield, never for what it absorbed", () => {
    const t = shielded("Shield", 20, { playerId: 1 });
    const c = centre(t);
    const { hits } = detonate(c.x, c.y, weaponNamed("Missile"), flat(), [t]);
    expect(t.health).toBe(70);
    expect(moneyEarned(hits, 0)).toBe(30 * MONEY_PER_DAMAGE);
  });

  it("leaves a Shield untouched by a Dirt Weapon", () => {
    const t = shielded("Shield", 50);
    const c = centre(t);
    detonate(c.x, c.y, weaponNamed("Ton of Dirt"), flat(), [t]);
    expect(t.shield).toEqual({ name: "Shield", strength: 50 });
    expect(t.health).toBe(100);
  });
});

describe("Shields at Round start", () => {
  it("raises every owner's strongest Shield before the first Turn, Human or Computer", () => {
    const players = createPlayers([HUMAN, MORON, HUMAN, MORON]);
    const loadout = emptyLoadout(players);
    loadout.inventories[0]?.add("Shield", 3);
    loadout.inventories[0]?.add("Heavy Shield", 2);
    loadout.inventories[1]?.add("Shield", 3);
    const round = new Round(1, players, new Rng(1), loadout);
    expect(round.tankOf(0).shield).toEqual({ name: "Heavy Shield", strength: 100 });
    expect(round.tankOf(1).shield).toEqual({ name: "Shield", strength: 50 });
    expect(round.tankOf(2).shield).toBeNull();
    expect(round.tankOf(3).shield).toBeNull();
    expect(loadout.inventories[0]?.count("Heavy Shield")).toBe(1);
    expect(loadout.inventories[0]?.count("Shield")).toBe(3);
    expect(loadout.inventories[1]?.count("Shield")).toBe(2);
  });

  it("doesn't carry a raised Shield into the next Round, but does carry the Inventory", () => {
    const match = new Match({ players: [HUMAN, HUMAN], rounds: 3, seed: 1 });
    match.inventoryOf(0).add("Shield", 3);
    finishShop(match);
    const round1 = match.requireRound();
    expect(round1.tankOf(0).shield?.strength).toBe(50);
    expect(match.inventoryOf(0).count("Shield")).toBe(2);
    round1.tankOf(0).shield = { name: "Shield", strength: 5 };
    round1.tankOf(1).health = 0;
    round1.phase = { kind: "over", result: { kind: "win", playerId: 0 } };
    match.recordRoundResult();
    match.startNextRound();
    finishShop(match);
    const round2 = match.requireRound();
    expect(round2).not.toBe(round1);
    expect(round2.tankOf(0).shield).toEqual({ name: "Shield", strength: 50 });
    expect(round2.tankOf(1).shield).toBeNull();
    expect(match.inventoryOf(0).count("Shield")).toBe(1);
  });

  it("leaves a Moron that owns no Shield drawing exactly as before", () => {
    const players = createPlayers([MORON, MORON, HUMAN]);
    const bareRng = new Rng(9);
    const bare = new Round(1, players, bareRng);
    const loadout = emptyLoadout(players);
    loadout.inventories[2]?.add("Heavy Shield", 2);
    const rng = new Rng(9);
    const withShields = new Round(1, players, rng, loadout);
    const tanks = (r: Round) => r.tanks.map((t) => [t.x, t.y, t.angle, t.power, t.health]);
    expect(tanks(withShields)).toEqual(tanks(bare));
    expect(withShields.turnOrder).toEqual(bare.turnOrder);
    expect(withShields.wind).toBe(bare.wind);
    expect(rng.next()).toBe(bareRng.next());
  });
});
