import { centre, clampAim, isAlive } from "./tank";
import type { Terrain } from "./terrain";
import type { Explosion, Tank, Weapon } from "./types";

/** Damage dealt to a Tank whose centre is `distance` from the Explosion centre. */
export function damageAt(weapon: Weapon, distance: number): number {
  if (distance >= weapon.radius) return 0;
  return Math.round(weapon.maxDamage * (1 - distance / weapon.radius));
}

/** Apply an Explosion once: damage every living Tank (including the firer), carve Terrain, clamp aim. */
export function detonate(
  x: number,
  y: number,
  weapon: Weapon,
  terrain: Terrain,
  tanks: Tank[],
): Explosion {
  for (const tank of tanks) {
    if (!isAlive(tank)) continue;
    const c = centre(tank);
    const distance = Math.hypot(c.x - x, c.y - y);
    tank.health = Math.max(0, tank.health - damageAt(weapon, distance));
    clampAim(tank);
  }
  terrain.carveCircle(x, y, weapon.radius);
  return { x, y, radius: weapon.radius, elapsed: 0 };
}
