import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  GRAVITY,
  POWER_TO_SPEED,
  WIND_ACCELERATION_PER_UNIT,
} from "./constants";
import { barrelTip, hitTest } from "./tank";
import type { Terrain } from "./terrain";
import type { Projectile, Tank, Weapon } from "./types";

export type ProjectileOutcome =
  | { kind: "flying" }
  | { kind: "lost"; side: "left" | "right" } // left through that side of the field
  | { kind: "hit"; x: number; y: number }; // touched Terrain, the floor, or a living Tank

/** Spawns at the barrel tip. y points down, so upward velocity is negative. */
export function launch(t: Tank, weapon: Weapon): Projectile {
  const tip = barrelTip(t);
  const radians = (t.angle * Math.PI) / 180;
  const speed = t.power * POWER_TO_SPEED;
  return {
    x: tip.x,
    y: tip.y,
    vx: speed * Math.cos(radians),
    vy: -speed * Math.sin(radians),
    weapon,
    firedBy: t.playerId,
  };
}

/** Advance one tick. Mutates p. */
export function stepProjectile(
  p: Projectile,
  wind: number,
  terrain: Terrain,
  tanks: readonly Tank[],
  dt: number,
): ProjectileOutcome {
  p.vx += wind * WIND_ACCELERATION_PER_UNIT * dt;
  p.vy += GRAVITY * dt;
  const dx = p.vx * dt;
  const dy = p.vy * dt;
  // Sub-step so the Projectile never tunnels through thin dirt.
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let i = 0; i < n; i++) {
    p.x += dx / n;
    p.y += dy / n;
    if (p.x < 0) return { kind: "lost", side: "left" };
    if (p.x >= FIELD_WIDTH) return { kind: "lost", side: "right" };
    if (p.y < 0) continue; // the top of the field is open
    if (tanks.some((t) => hitTest(t, p.x, p.y)) || terrain.isSolid(p.x, p.y)) {
      return { kind: "hit", x: p.x, y: Math.min(p.y, FIELD_HEIGHT - 1) };
    }
  }
  return { kind: "flying" };
}
