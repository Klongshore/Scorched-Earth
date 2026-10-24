import { describe, expect, it } from "vitest";
import {
  BABY_MISSILE,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  TANK_HALF_WIDTH,
  TANK_HEIGHT,
  weaponNamed,
} from "./constants";
import { settleTick } from "./settling";
import { damageAt, detonate } from "./explosion";
import { centre, occupiesCell } from "./tank";
import { Terrain } from "./terrain";
import type { Tank } from "./types";

const GROUND = 400;

function flat(): Terrain {
  return Terrain.fromSurface(
    new Array<number>(FIELD_WIDTH).fill(GROUND),
    FIELD_WIDTH,
    FIELD_HEIGHT,
  );
}

function tank(overrides: Partial<Tank> = {}): Tank {
  return { playerId: 0, x: 320, y: GROUND, angle: 90, power: 500, health: 100, ...overrides };
}

describe("damageAt", () => {
  it("gives 30 at distance 0, 15 at 10, and 0 at 20 and beyond", () => {
    expect(damageAt(BABY_MISSILE, 0)).toBe(30);
    expect(damageAt(BABY_MISSILE, 10)).toBe(15);
    expect(damageAt(BABY_MISSILE, 20)).toBe(0);
    expect(damageAt(BABY_MISSILE, 25)).toBe(0);
    expect(damageAt(BABY_MISSILE, 1000)).toBe(0);
  });

  it("gives 0 for a Dirt Weapon, even at distance 0", () => {
    expect(damageAt(weaponNamed("Ton of Dirt"), 0)).toBe(0);
  });
});

describe("detonate", () => {
  it("takes a direct hit on a Tank centre from Health 100 to 70", () => {
    const t = tank();
    const c = centre(t);
    detonate(c.x, c.y, BABY_MISSILE, flat(), [t]);
    expect(t.health).toBe(70);
  });

  it("leaves a Tank 25 px away untouched", () => {
    const t = tank();
    const c = centre(t);
    detonate(c.x + 25, c.y, BABY_MISSILE, flat(), [t]);
    expect(t.health).toBe(100);
  });

  it("damages the firer (self-damage)", () => {
    const firer = tank({ playerId: 0 });
    const other = tank({ playerId: 1, x: 500 });
    const c = centre(firer);
    detonate(c.x, c.y, BABY_MISSILE, flat(), [firer, other]);
    expect(firer.health).toBe(70);
    expect(other.health).toBe(100);
  });

  it("never takes Health below 0", () => {
    const t = tank({ health: 10, power: 100 });
    const c = centre(t);
    detonate(c.x, c.y, BABY_MISSILE, flat(), [t]);
    expect(t.health).toBe(0);
  });

  it("clamps Power to the new Health-based cap", () => {
    const t = tank({ health: 70, power: 900 });
    const c = centre(t);
    detonate(c.x, c.y, BABY_MISSILE, flat(), [t]);
    expect(t.health).toBe(40);
    expect(t.power).toBe(400);
  });

  it("carves a crater and returns the Explosion", () => {
    const terrain = flat();
    const before = terrain.version;
    const explosion = detonate(100, GROUND, BABY_MISSILE, terrain, []);
    expect(terrain.isSolid(100, GROUND + 10)).toBe(false);
    expect(terrain.isSolid(100, GROUND + 30)).toBe(true);
    expect(terrain.version).toBeGreaterThan(before);
    expect(explosion).toEqual({
      kind: "carve",
      x: 100,
      y: GROUND,
      radius: BABY_MISSILE.radius,
      hits: [],
      elapsed: 0,
    });
  });

  it("deals a Nuke's 100 at its centre and carves a 75-px crater", () => {
    const nuke = weaponNamed("Nuke");
    expect(damageAt(nuke, 0)).toBe(100);
    const t = tank();
    const c = centre(t);
    const terrain = flat();
    detonate(c.x, c.y, nuke, terrain, [t]);
    expect(t.health).toBe(0);
    expect(terrain.isSolid(c.x, c.y + 73)).toBe(false);
    expect(terrain.isSolid(c.x, c.y + 77)).toBe(true);
  });

  it("reports the Health actually removed from each Tank and which it destroyed", () => {
    const hurt = tank({ playerId: 0 });
    const killed = tank({ playerId: 1, x: 325, health: 10 });
    const missed = tank({ playerId: 2, x: 500 });
    const dead = tank({ playerId: 3, x: 320, health: 0 });
    const c = centre(hurt);
    const explosion = detonate(c.x, c.y, BABY_MISSILE, flat(), [hurt, killed, missed, dead]);
    expect(explosion.hits).toEqual([
      { playerId: 0, healthRemoved: 30, destroyed: false },
      { playerId: 1, healthRemoved: 10, destroyed: true },
    ]);
  });

  it("fills a Dirt Weapon's circle with dirt, damages no one and keeps living Tanks clear", () => {
    const dirtBall = weaponNamed("Dirt Ball");
    const t = tank();
    const dead = tank({ playerId: 1, x: 340, health: 0 });
    const terrain = flat();
    const c = centre(t);
    const explosion = detonate(c.x, c.y, dirtBall, terrain, [t, dead]);
    expect(explosion).toEqual({
      kind: "dirt",
      x: c.x,
      y: c.y,
      radius: dirtBall.radius,
      hits: [],
      elapsed: 0,
    });
    expect(t.health).toBe(100);
    expect(terrain.isSolid(c.x, c.y - 20)).toBe(true);
    expect(terrain.isSolid(c.x, c.y - 40)).toBe(false);
    for (let x = 0; x < FIELD_WIDTH; x++) {
      for (let y = 0; y < FIELD_HEIGHT; y++) {
        if (occupiesCell(t, x, y)) expect(terrain.isSolid(x, y)).toBe(false);
      }
    }
    // A destroyed Tank is not kept clear.
    expect(terrain.isSolid(dead.x, dead.y - 1)).toBe(true);
  });

  it("lets dirt resting on a Tank it destroys fall through it", () => {
    const terrain = flat();
    const t = tank({ health: 5 });
    const roof = t.y - TANK_HEIGHT - 1;
    const edge = t.x - TANK_HALF_WIDTH;
    terrain.set(edge, roof, true);
    expect(settleTick(terrain, [t])).toBe(false);
    const c = centre(t);
    detonate(c.x + 15, c.y, BABY_MISSILE, terrain, [t]);
    expect(t.health).toBe(0);
    while (settleTick(terrain, [t])) {
      // let it fall
    }
    expect(terrain.isSolid(edge, roof)).toBe(false);
    expect(terrain.isSolid(edge, GROUND - 1)).toBe(true);
  });
});
