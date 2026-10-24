import { describe, expect, it } from "vitest";
import { powerToHit } from "./aiming";
import {
  BABY_MISSILE,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  SHOOTER_MAX_ANGLE,
  SHOOTER_MIN_ANGLE,
  TICK_SECONDS,
} from "./constants";
import { launch, stepProjectile } from "./projectile";
import { centre, newTank } from "./tank";
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

function tank(playerId: number, x: number, y = GROUND): Tank {
  return newTank(playerId, x, y);
}

/** Fire `self` at `angle` and `power` through the real Projectile step on flat Terrain, Wind 0. */
function landing(self: Tank, target: Tank, angle: number, power: number): { x: number; y: number } {
  const terrain = flat();
  const p = launch({ ...self, angle, power }, BABY_MISSILE);
  for (let i = 0; i < 10_000; i++) {
    const outcome = stepProjectile(p, 0, terrain, [self, target], TICK_SECONDS);
    if (outcome.kind === "hit") return outcome;
    if (outcome.kind === "lost") throw new Error("Projectile left the field");
  }
  throw new Error("Projectile never finished");
}

const COLUMNS = [30, 100, 200, 320, 450, 540, 610];

describe("powerToHit", () => {
  it("lands within the Baby Missile's radius of the Target's centre on flat Terrain, Wind 0", () => {
    for (const fromX of COLUMNS) {
      for (const toX of COLUMNS) {
        if (fromX === toX) continue;
        const self = tank(0, fromX);
        const target = tank(1, toX);
        for (let angle = SHOOTER_MIN_ANGLE; angle <= SHOOTER_MAX_ANGLE; angle += 5) {
          const aimed = toX > fromX ? angle : 180 - angle;
          const power = powerToHit(self, target, aimed);
          expect(power).not.toBeNull();
          const hit = landing(self, target, aimed, power as number);
          const c = centre(target);
          expect(Math.hypot(hit.x - c.x, hit.y - c.y)).toBeLessThanOrEqual(BABY_MISSILE.radius);
        }
      }
    }
  });

  it("returns an integer Power", () => {
    const power = powerToHit(tank(0, 100), tank(1, 400), 45);
    expect(Number.isInteger(power)).toBe(true);
  });

  it("returns null for a Target well above the barrel's line", () => {
    const self = tank(0, 300);
    expect(powerToHit(self, tank(1, 320, GROUND - 200), 30)).toBeNull();
    expect(powerToHit(self, tank(1, 280, GROUND - 200), 150)).toBeNull();
  });

  it("returns null when the Angle points away from the Target", () => {
    expect(powerToHit(tank(0, 100), tank(1, 400), 135)).toBeNull();
  });

  it("does not change the Tank", () => {
    const self = tank(0, 100);
    const before = { ...self };
    powerToHit(self, tank(1, 400), 40);
    expect(self).toEqual(before);
  });
});
