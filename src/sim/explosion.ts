import { TANK_HALF_WIDTH } from "./constants";
import { absorb } from "./shield";
import { centre, clampAim, isAlive, occupiesCell } from "./tank";
import type { Terrain } from "./terrain";
import type { Explosion, HealthLoss, Tank, Weapon } from "./types";

/** Damage dealt to a Tank whose centre is `distance` from the Explosion centre. */
export function damageAt(weapon: Weapon, distance: number): number {
  switch (weapon.kind) {
    case "blast":
    case "mirv":
    case "funky":
    case "roller":
      if (distance >= weapon.radius) return 0;
      return Math.round(weapon.maxDamage * (1 - distance / weapon.radius));
    case "dirt":
      return 0; // a Dirt Weapon damages no one
  }
}

/**
 * Apply an Explosion: damage every living Tank (including the firer), carve Terrain, clamp aim.
 * A raised Shield absorbs a Tank's damage before its Health. The Explosion reports the Health it
 * actually removed from each Tank and which it destroyed.
 * A Dirt Weapon instead fills its circle with dirt around every living Tank and damages no one.
 */
export function detonate(
  x: number,
  y: number,
  weapon: Weapon,
  terrain: Terrain,
  tanks: Tank[],
): Explosion {
  if (weapon.kind === "dirt") {
    terrain.fillCircle(x, y, weapon.radius, (cx, cy) => tanks.some((t) => occupiesCell(t, cx, cy)));
    return { kind: "dirt", x, y, radius: weapon.radius, hits: [], elapsed: 0 };
  }
  const hits: HealthLoss[] = [];
  for (const t of tanks) {
    if (!isAlive(t)) continue;
    const c = centre(t);
    const distance = Math.hypot(c.x - x, c.y - y);
    const before = t.health;
    // A Shield absorbs first, so Money is paid only for Health actually removed.
    t.health = Math.max(0, t.health - absorb(t, damageAt(weapon, distance)));
    clampAim(t);
    const healthRemoved = before - t.health;
    if (healthRemoved > 0) {
      hits.push({ playerId: t.playerId, healthRemoved, destroyed: !isAlive(t) });
    }
    // Dirt resting on a destroyed Tank falls through it.
    if (!isAlive(t)) terrain.markUnsettled(t.x - TANK_HALF_WIDTH, t.x + TANK_HALF_WIDTH);
  }
  terrain.carveCircle(x, y, weapon.radius);
  return { kind: "carve", x, y, radius: weapon.radius, hits, elapsed: 0 };
}
