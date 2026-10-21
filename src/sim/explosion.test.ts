import { describe, expect, it } from "vitest";
import { BABY_MISSILE, FIELD_HEIGHT, FIELD_WIDTH } from "./constants";
import { damageAt, detonate } from "./explosion";
import { centre } from "./tank";
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
    expect(explosion).toEqual({ x: 100, y: GROUND, radius: BABY_MISSILE.radius, elapsed: 0 });
  });
});
