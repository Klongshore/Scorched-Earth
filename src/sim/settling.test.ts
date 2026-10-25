import { describe, expect, it } from "vitest";
import {
  FALL_DAMAGE_PER_PIXEL,
  FALL_SAFE_PIXELS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MAX_HEALTH,
  POWER_PER_HEALTH,
  TANK_HALF_WIDTH,
  TANK_HEIGHT,
} from "./constants";
import { fallDamage, landTanks, settleTick } from "./settling";
import { isSupported, newTank, powerCap } from "./tank";
import { Terrain } from "./terrain";
import type { Tank } from "./types";

const GROUND = 400;

function flat(y = GROUND): Terrain {
  return Terrain.fromSurface(new Array<number>(FIELD_WIDTH).fill(y), FIELD_WIDTH, FIELD_HEIGHT);
}

function tank(overrides: Partial<Tank> = {}): Tank {
  return { ...newTank(0, 320, GROUND), ...overrides };
}

/** Run settleTick until nothing moves; returns the number of ticks that moved something. */
function settle(terrain: Terrain, tanks: Tank[]): number {
  let ticks = 0;
  while (settleTick(terrain, tanks)) {
    ticks++;
    if (ticks > 10_000) throw new Error("Settling never came to rest");
  }
  return ticks;
}

describe("settleTick", () => {
  it("reports no movement when everything is already at rest", () => {
    const t = tank();
    expect(settleTick(flat(), [t])).toBe(false);
    expect(t.y).toBe(GROUND);
  });

  it("drops a Tank over a carved hole until it is supported, with Health unchanged until it lands", () => {
    const terrain = flat();
    const t = tank({ health: 73 });
    terrain.carveCircle(t.x, GROUND, 20);
    expect(isSupported(t, terrain)).toBe(false);
    settle(terrain, [t]);
    expect(t.y).toBeGreaterThan(GROUND);
    expect(isSupported(t, terrain)).toBe(true);
    expect(t.fallen).toBe(t.y - GROUND);
    expect(t.health).toBe(73);
  });

  it("drops a Tank together with the overhang it rests on", () => {
    const terrain = flat();
    // Remove a slab under the Tank's ground, leaving a floating shelf 3 px thick.
    for (let y = GROUND + 3; y < GROUND + 13; y++) {
      for (let x = 300; x <= 340; x++) terrain.set(x, y, false);
    }
    const t = tank();
    settle(terrain, [t]);
    expect(isSupported(t, terrain)).toBe(true);
    expect(t.y).toBe(GROUND + 10);
    expect(t.fallen).toBe(10);
    expect(t.health).toBe(100);
  });

  it("kills a Tank that falls off the bottom of the field", () => {
    const terrain = flat();
    const t = tank();
    for (let x = t.x - TANK_HALF_WIDTH; x <= t.x + TANK_HALF_WIDTH; x++) {
      for (let y = 0; y < FIELD_HEIGHT; y++) terrain.set(x, y, false);
    }
    settle(terrain, [t]);
    expect(t.y).toBe(FIELD_HEIGHT);
    expect(t.health).toBe(0);
  });

  it("kills a Tank pushed below the field", () => {
    const t = tank({ y: FIELD_HEIGHT + 5 });
    settleTick(flat(), [t]);
    expect(t.health).toBe(0);
  });

  it("leaves dead Tanks where they are", () => {
    const terrain = flat();
    const t = tank({ health: 0 });
    terrain.carveCircle(t.x, GROUND, 20);
    settle(terrain, [t]);
    expect(t.y).toBe(GROUND);
  });

  it("rests dirt on a living Tank's roof instead of inside the Tank", () => {
    const terrain = flat();
    const t = tank();
    const roof = t.y - TANK_HEIGHT - 1;
    for (let x = t.x - TANK_HALF_WIDTH; x <= t.x + TANK_HALF_WIDTH; x++)
      terrain.set(x, roof - 20, true);
    settle(terrain, [t]);
    for (let x = t.x - TANK_HALF_WIDTH; x <= t.x + TANK_HALF_WIDTH; x++) {
      expect(terrain.isSolid(x, roof)).toBe(true);
      for (let y = roof + 1; y < t.y; y++) expect(terrain.isSolid(x, y)).toBe(false);
    }
  });

  it("brings dirt on a Tank's roof down with the Tank when it falls", () => {
    const terrain = flat();
    const t = tank();
    const roof = t.y - TANK_HEIGHT - 1;
    terrain.set(t.x, roof, true);
    settle(terrain, [t]);
    expect(terrain.isSolid(t.x, roof)).toBe(true);
    for (let x = t.x - TANK_HALF_WIDTH; x <= t.x + TANK_HALF_WIDTH; x++) {
      for (let y = GROUND; y < GROUND + 10; y++) terrain.set(x, y, false);
    }
    settle(terrain, [t]);
    expect(t.y).toBe(GROUND + 10);
    expect(terrain.isSolid(t.x, t.y - TANK_HEIGHT - 1)).toBe(true);
    expect(terrain.isSolid(t.x, roof)).toBe(false);
  });
});

/** Clear a slab `depth` px deep under the Tank's columns, leaving a shelf `shelf` px thick. */
function undercut(terrain: Terrain, t: Tank, shelf: number, depth: number): void {
  for (let y = GROUND + shelf; y < GROUND + shelf + depth; y++) {
    for (let x = t.x - 20; x <= t.x + 20; x++) terrain.set(x, y, false);
  }
}

describe("fallDamage", () => {
  it("is 0 up to FALL_SAFE_PIXELS, then FALL_DAMAGE_PER_PIXEL per px beyond it, rounded down", () => {
    expect(fallDamage(0)).toBe(0);
    expect(fallDamage(FALL_SAFE_PIXELS)).toBe(0);
    for (const fallen of [FALL_SAFE_PIXELS + 1, FALL_SAFE_PIXELS + 7, 70, 300]) {
      expect(fallDamage(fallen)).toBe(
        Math.floor((fallen - FALL_SAFE_PIXELS) * FALL_DAMAGE_PER_PIXEL),
      );
    }
  });
});

describe("landTanks", () => {
  it("lands a Tank's Fall Damage once Settling is at rest, not before, and resets its fall", () => {
    const terrain = flat();
    const t = tank();
    terrain.carveCircle(t.x, GROUND + 25, 30);
    while (settleTick(terrain, [t])) expect(t.health).toBe(MAX_HEALTH);
    const drop = t.y - GROUND;
    expect(drop).toBeGreaterThan(FALL_SAFE_PIXELS);
    expect(landTanks(terrain, [t])).toBe(false);
    expect(t.health).toBe(MAX_HEALTH - fallDamage(drop));
    expect(t.health).toBeLessThan(MAX_HEALTH);
    expect(t.fallen).toBe(0);
    // Landing again does no more damage.
    landTanks(terrain, [t]);
    expect(t.health).toBe(MAX_HEALTH - fallDamage(drop));
  });

  it("ignores a raised Shield: full Fall Damage to Health, Shield Strength unchanged", () => {
    const terrain = flat();
    const t = tank({ shield: { name: "Heavy Shield", strength: 100 } });
    terrain.carveCircle(t.x, GROUND + 25, 30);
    settle(terrain, [t]);
    const drop = t.y - GROUND;
    expect(fallDamage(drop)).toBeGreaterThan(0);
    landTanks(terrain, [t]);
    expect(t.health).toBe(MAX_HEALTH - fallDamage(drop));
    expect(t.shield).toEqual({ name: "Heavy Shield", strength: 100 });
  });

  it("does no damage for a drop within FALL_SAFE_PIXELS", () => {
    const terrain = flat();
    const t = tank();
    undercut(terrain, t, 0, FALL_SAFE_PIXELS);
    settle(terrain, [t]);
    expect(t.y).toBe(GROUND + FALL_SAFE_PIXELS);
    landTanks(terrain, [t]);
    expect(t.health).toBe(MAX_HEALTH);
    expect(t.fallen).toBe(0);
  });

  it("counts a Tank riding down on Settling dirt as one fall", () => {
    const terrain = flat();
    const t = tank();
    undercut(terrain, t, 3, 40);
    let ticks = 0;
    while (settleTick(terrain, [t])) ticks++;
    // The drop came over many ticks, each well within FALL_SAFE_PIXELS.
    expect(ticks).toBeGreaterThan(1);
    expect(t.y).toBe(GROUND + 40);
    expect(t.fallen).toBe(40);
    landTanks(terrain, [t]);
    expect(t.health).toBe(MAX_HEALTH - fallDamage(40));
  });

  it("lowers the Power cap and clamps Power", () => {
    const terrain = flat();
    const t = tank({ power: MAX_HEALTH * POWER_PER_HEALTH });
    undercut(terrain, t, 0, 60);
    settle(terrain, [t]);
    landTanks(terrain, [t]);
    expect(t.health).toBe(MAX_HEALTH - fallDamage(60));
    expect(t.power).toBe(powerCap(t));
    expect(t.power).toBe((MAX_HEALTH - fallDamage(60)) * POWER_PER_HEALTH);
  });

  it("destroys a Tank its Fall Damage empties, and lets the dirt on it fall", () => {
    const terrain = flat();
    const t = tank({ health: 1 });
    const roof = t.y - TANK_HEIGHT - 1;
    terrain.set(t.x, roof, true);
    undercut(terrain, t, 0, 30);
    settle(terrain, [t]);
    expect(t.y).toBe(GROUND + 30);
    expect(terrain.isSolid(t.x, t.y - TANK_HEIGHT - 1)).toBe(true);
    expect(landTanks(terrain, [t])).toBe(true);
    expect(t.health).toBe(0);
    // Settling is not over: the dirt on the destroyed Tank now falls through it.
    expect(settle(terrain, [t])).toBeGreaterThan(0);
    expect(terrain.isSolid(t.x, t.y - 1)).toBe(true);
    expect(terrain.isSolid(t.x, t.y - TANK_HEIGHT - 1)).toBe(false);
    expect(landTanks(terrain, [t])).toBe(false);
  });

  it("does no Fall Damage to a Tank that reached the bottom, which is destroyed anyway", () => {
    const terrain = flat();
    const t = tank();
    for (let x = t.x - TANK_HALF_WIDTH; x <= t.x + TANK_HALF_WIDTH; x++) {
      for (let y = 0; y < FIELD_HEIGHT; y++) terrain.set(x, y, false);
    }
    settle(terrain, [t]);
    expect(t.health).toBe(0);
    expect(t.fallen).toBe(FIELD_HEIGHT - GROUND);
    expect(landTanks(terrain, [t])).toBe(false);
    expect(t.fallen).toBe(0);
  });
});

describe("Parachutes", () => {
  /** An openParachute that hands out `owned` Parachutes and records every ask. */
  function parachutes(owned: number): { open: (id: number) => boolean; asks: number[] } {
    const asks: number[] = [];
    let left = owned;
    return {
      asks,
      open: (id) => {
        asks.push(id);
        if (left <= 0) return false;
        left--;
        return true;
      },
    };
  }

  function settleWith(terrain: Terrain, tanks: Tank[], open: (id: number) => boolean): void {
    let ticks = 0;
    while (settleTick(terrain, tanks, open)) {
      if (++ticks > 10_000) throw new Error("Settling never came to rest");
    }
  }

  it("opens one on a 60 px fall, using exactly one, and cancels the Fall Damage", () => {
    const terrain = flat();
    const t = tank();
    undercut(terrain, t, 0, 60);
    const p = parachutes(5);
    let openedAt: number | null = null;
    while (settleTick(terrain, [t], p.open)) {
      if (t.parachute && openedAt === null) openedAt = t.fallen;
    }
    expect(t.fallen).toBe(60);
    expect(p.asks).toEqual([t.playerId]);
    expect(openedAt).toBeGreaterThan(FALL_SAFE_PIXELS);
    expect(openedAt).toBeLessThanOrEqual(FALL_SAFE_PIXELS + 2);
    landTanks(terrain, [t]);
    expect(t.health).toBe(MAX_HEALTH);
    expect(t.fallen).toBe(0);
    expect(t.parachute).toBe(false);
  });

  it("never asks for one on a drop within FALL_SAFE_PIXELS", () => {
    const terrain = flat();
    const t = tank();
    undercut(terrain, t, 0, FALL_SAFE_PIXELS);
    const p = parachutes(5);
    settleWith(terrain, [t], p.open);
    expect(t.fallen).toBe(FALL_SAFE_PIXELS);
    expect(p.asks).toEqual([]);
    expect(t.parachute).toBe(false);
  });

  it("asks only once per fall when the Player owns none, and the full Fall Damage lands", () => {
    const terrain = flat();
    const t = tank();
    undercut(terrain, t, 0, 60);
    const p = parachutes(0);
    settleWith(terrain, [t], p.open);
    expect(p.asks).toEqual([t.playerId]);
    landTanks(terrain, [t]);
    expect(t.health).toBe(MAX_HEALTH - fallDamage(60));
  });

  it("asks again for the next fall once the last one has landed", () => {
    const terrain = flat();
    const t = tank();
    const p = parachutes(5);
    undercut(terrain, t, 0, 30);
    settleWith(terrain, [t], p.open);
    landTanks(terrain, [t]);
    for (let y = t.y; y < t.y + 30; y++) {
      for (let x = t.x - 20; x <= t.x + 20; x++) terrain.set(x, y, false);
    }
    settleWith(terrain, [t], p.open);
    landTanks(terrain, [t]);
    expect(t.y).toBe(GROUND + 60);
    expect(p.asks).toEqual([t.playerId, t.playerId]);
    expect(t.health).toBe(MAX_HEALTH);
  });

  it("does not save a Tank that falls to the bottom of the field", () => {
    const terrain = flat();
    const t = tank();
    for (let x = t.x - TANK_HALF_WIDTH; x <= t.x + TANK_HALF_WIDTH; x++) {
      for (let y = 0; y < FIELD_HEIGHT; y++) terrain.set(x, y, false);
    }
    const p = parachutes(5);
    settleWith(terrain, [t], p.open);
    expect(p.asks).toEqual([t.playerId]);
    expect(t.health).toBe(0);
    landTanks(terrain, [t]);
    expect(t.health).toBe(0);
    expect(t.parachute).toBe(false);
  });
});
