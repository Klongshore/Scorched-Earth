import { describe, expect, it } from "vitest";
import {
  BABY_MISSILE,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  TANK_HALF_WIDTH,
  TICK_SECONDS,
} from "./constants";
import { launch, stepProjectile, type ProjectileOutcome } from "./projectile";
import { Terrain } from "./terrain";
import type { Projectile, Tank } from "./types";

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

function flyUntilDone(
  p: Projectile,
  wind: number,
  terrain: Terrain,
  tanks: readonly Tank[],
): ProjectileOutcome {
  for (let i = 0; i < 10_000; i++) {
    const outcome = stepProjectile(p, wind, terrain, tanks, TICK_SECONDS);
    if (outcome.kind !== "flying") return outcome;
  }
  throw new Error("Projectile never finished");
}

function landingX(outcome: ProjectileOutcome): number {
  if (outcome.kind !== "hit") throw new Error(`expected hit, got ${outcome.kind}`);
  return outcome.x;
}

describe("projectile", () => {
  it("lands within 1 px of its start x when fired at 90° with no Wind", () => {
    const p = launch(tank(), BABY_MISSILE);
    expect(Math.abs(landingX(flyUntilDone(p, 0, flat(), [])) - p.x)).toBeLessThan(1);
  });

  it("lands mirror-symmetrically at 45° and 135°", () => {
    const right = landingX(
      flyUntilDone(launch(tank({ angle: 45, power: 400 }), BABY_MISSILE), 0, flat(), []),
    );
    const left = landingX(
      flyUntilDone(launch(tank({ angle: 135, power: 400 }), BABY_MISSILE), 0, flat(), []),
    );
    expect(right - 320).toBeGreaterThan(100);
    expect(Math.abs(right - 320 - (320 - left))).toBeLessThanOrEqual(2);
  });

  it("is pushed right by positive Wind and left by negative Wind", () => {
    const start = launch(tank(), BABY_MISSILE).x;
    expect(landingX(flyUntilDone(launch(tank(), BABY_MISSILE), 20, flat(), []))).toBeGreaterThan(
      start,
    );
    expect(landingX(flyUntilDone(launch(tank(), BABY_MISSILE), -20, flat(), []))).toBeLessThan(
      start,
    );
  });

  it("is lost when fired off the side", () => {
    const p = launch(tank({ x: 630, angle: 0 }), BABY_MISSILE);
    expect(flyUntilDone(p, 0, flat(), []).kind).toBe("lost");
  });

  it("does not tunnel through a 1-px wall at high speed", () => {
    const terrain = flat();
    for (let y = 200; y < GROUND; y++) terrain.set(400, y, true);
    const p = launch(tank({ x: 300, y: 300, angle: 0, power: 1000 }), BABY_MISSILE);
    const outcome = flyUntilDone(p, 0, terrain, []);
    expect(outcome.kind).toBe("hit");
    expect(landingX(outcome)).toBeLessThan(401);
  });

  it("hits a Tank inside its hitbox", () => {
    const shot = (): Projectile => launch(tank({ x: 100, angle: 45 }), BABY_MISSILE);
    const target = tank({
      playerId: 1,
      x: Math.round(landingX(flyUntilDone(shot(), 0, flat(), []))),
    });
    const outcome = flyUntilDone(shot(), 0, flat(), [target]);
    expect(outcome.kind).toBe("hit");
    if (outcome.kind === "hit") {
      expect(Math.abs(outcome.x - target.x)).toBeLessThanOrEqual(TANK_HALF_WIDTH);
      expect(outcome.y).toBeLessThan(GROUND);
    }
  });
});
