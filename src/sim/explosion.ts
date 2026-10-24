import { centre, clampAim, isAlive } from "./tank";
import type { Terrain } from "./terrain";
import type { Explosion, ExplosionHit, Tank, Weapon } from "./types";

/** Damage dealt to a Tank whose centre is `distance` from the Explosion centre. */
export function damageAt(weapon: Weapon, distance: number): number {
  switch (weapon.kind) {
    case "blast":
      if (distance >= weapon.radius) return 0;
      return Math.round(weapon.maxDamage * (1 - distance / weapon.radius));
    default:
      throw new Error(`Explosions for ${weapon.kind} Weapons are not built yet`);
  }
}

/**
 * Apply an Explosion: damage every living Tank (including the firer), carve Terrain, clamp aim.
 * The Explosion reports the Health it actually removed from each Tank and which it destroyed.
 */
export function detonate(
  x: number,
  y: number,
  weapon: Weapon,
  terrain: Terrain,
  tanks: Tank[],
): Explosion {
  const hits: ExplosionHit[] = [];
  for (const t of tanks) {
    if (!isAlive(t)) continue;
    const c = centre(t);
    const distance = Math.hypot(c.x - x, c.y - y);
    const before = t.health;
    t.health = Math.max(0, t.health - damageAt(weapon, distance));
    clampAim(t);
    const healthRemoved = before - t.health;
    if (healthRemoved > 0) {
      hits.push({ playerId: t.playerId, healthRemoved, destroyed: !isAlive(t) });
    }
  }
  terrain.carveCircle(x, y, weapon.radius);
  return { x, y, radius: weapon.radius, hits, elapsed: 0 };
}
