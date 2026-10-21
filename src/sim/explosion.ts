import { centre, clampAim, isAlive } from "./tank";
import type { Terrain } from "./terrain";
import type { Explosion, Tank, Weapon } from "./types";

/** Damage dealt to a Tank whose centre is `distance` from the Explosion centre. */
export function damageAt(weapon: Weapon, distance: number): number {
  if (distance >= weapon.radius) return 0;
  return Math.round(weapon.maxDamage * (1 - distance / weapon.radius));
}

/** Apply an Explosion: damage every living Tank (including the firer), carve Terrain, clamp aim. */
export function detonate(
  x: number,
  y: number,
  weapon: Weapon,
  terrain: Terrain,
  tanks: Tank[],
): Explosion {
  for (const t of tanks) {
    if (!isAlive(t)) continue;
    const c = centre(t);
    const distance = Math.hypot(c.x - x, c.y - y);
    t.health = Math.max(0, t.health - damageAt(weapon, distance));
    clampAim(t);
  }
  terrain.carveCircle(x, y, weapon.radius);
  return { x, y, radius: weapon.radius, elapsed: 0 };
}
