import { describe, expect, it } from "vitest";
import { BABY_MISSILE, MAX_HEALTH } from "./constants";
import { damageAt, detonate } from "./explosion";
import { centre } from "./tank";
import { Terrain } from "./terrain";
import type { Tank } from "./types";

function tank(x: number, health = MAX_HEALTH): Tank {
  return { playerId: 0, x, y: 400, angle: 90, power: 500, health };
}

function flatTerrain(): Terrain {
  return Terrain.fromSurface(new Array<number>(640).fill(400), 640, 480);
}

describe("damageAt", () => {
  it("falls off linearly with distance", () => {
    expect(damageAt(BABY_MISSILE, 0)).toBe(30);
    expect(damageAt(BABY_MISSILE, 10)).toBe(15);
    expect(damageAt(BABY_MISSILE, 20)).toBe(0);
    expect(damageAt(BABY_MISSILE, 50)).toBe(0);
  });
});

describe("detonate", () => {
  it("takes 30 off a direct hit and leaves a Tank 25 px away untouched", () => {
    const near = tank(100);
    const far = tank(125);
    const c = centre(near);
    detonate(c.x, c.y, BABY_MISSILE, flatTerrain(), [near, far]);
    expect(near.health).toBe(70);
    expect(far.health).toBe(MAX_HEALTH);
  });

  it("damages the firer too", () => {
    const own = tank(100);
    const c = centre(own);
    detonate(c.x, c.y, BABY_MISSILE, flatTerrain(), [own]);
    expect(own.health).toBeLessThan(MAX_HEALTH);
  });

  it("never takes Health below 0", () => {
    const weak = tank(100, 10);
    const c = centre(weak);
    detonate(c.x, c.y, BABY_MISSILE, flatTerrain(), [weak]);
    expect(weak.health).toBe(0);
  });

  it("clamps Power to the new Health-based cap", () => {
    const hurt = tank(100, 70);
    hurt.power = 900;
    const c = centre(hurt);
    detonate(c.x + 18, c.y, BABY_MISSILE, flatTerrain(), [hurt]); // 18 px away: 3 damage
    expect(hurt.health).toBe(67);
    expect(hurt.power).toBe(670);
    const weak = tank(300, 40);
    weak.power = 900;
    const w = centre(weak);
    detonate(w.x + 20, w.y, BABY_MISSILE, flatTerrain(), [weak]);
    expect(weak.power).toBe(400);
  });

  it("carves a crater once at impact", () => {
    const terrain = flatTerrain();
    const explosion = detonate(100, 400, BABY_MISSILE, terrain, []);
    expect(terrain.isSolid(100, 410)).toBe(false);
    expect(terrain.isSolid(100, 430)).toBe(true);
    expect(explosion.elapsed).toBe(0);
    expect(explosion.radius).toBe(BABY_MISSILE.radius);
  });
});
