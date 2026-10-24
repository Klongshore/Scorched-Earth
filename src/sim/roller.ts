import { FIELD_WIDTH, ROLLER_MAX_SECONDS, ROLLER_SPEED } from "./constants";
import { hitTest } from "./tank";
import type { Terrain } from "./terrain";
import type { Projectile, Tank } from "./types";

export type RollOutcome =
  | { kind: "rolling" }
  | { kind: "lost" } // rolled past either side of the field
  | { kind: "explode"; x: number; y: number };

/**
 * A Roller that has just touched Terrain at (x, y) starts rolling: it snaps to the air cell just
 * above the dirt and heads downhill, or the way it was moving on level ground. Mutates p.
 */
export function startRolling(p: Projectile, x: number, y: number, terrain: Terrain): void {
  const column = Math.floor(x);
  const row = restingRow(terrain, column, Math.floor(y));
  const left = restingRow(terrain, column - 1, row);
  const right = restingRow(terrain, column + 1, row);
  const direction = right > left ? 1 : left > right ? -1 : p.vx < 0 ? -1 : 1;
  p.x = column + 0.5;
  p.y = row + 0.5;
  p.vx = 0;
  p.vy = 0;
  p.rolling = { direction, seconds: 0 };
}

/**
 * Advance a rolling Roller one tick along the surface, column by column, ignoring Wind. It
 * explodes where it is on reaching a rise or a wall, on touching a living Tank, or once it has
 * rolled for ROLLER_MAX_SECONDS. Mutates p.
 */
export function stepRolling(
  p: Projectile,
  terrain: Terrain,
  tanks: readonly Tank[],
  dt: number,
): RollOutcome {
  const rolling = p.rolling;
  if (!rolling) throw new Error("stepRolling needs a rolling Projectile");
  if (touchesTank(p, tanks)) return explodeAt(p);
  rolling.seconds += dt;
  if (rolling.seconds >= ROLLER_MAX_SECONDS) return explodeAt(p);

  const target = p.x + rolling.direction * ROLLER_SPEED * dt;
  while (Math.floor(p.x) !== Math.floor(target)) {
    const next = Math.floor(p.x) + rolling.direction;
    if (next < 0 || next >= FIELD_WIDTH) return { kind: "lost" };
    const row = Math.floor(p.y);
    const nextRow = restingRow(terrain, next, row);
    if (nextRow < row) return explodeAt(p); // a rise or a wall: it has come to rest
    p.x = next + 0.5;
    p.y = nextRow + 0.5;
    if (touchesTank(p, tanks)) return explodeAt(p);
  }
  p.x = target;
  return { kind: "rolling" };
}

function explodeAt(p: Projectile): RollOutcome {
  return { kind: "explode", x: p.x, y: p.y };
}

function touchesTank(p: Projectile, tanks: readonly Tank[]): boolean {
  return tanks.some((t) => hitTest(t, p.x, p.y));
}

/**
 * The air cell resting on dirt in column x nearest row `from`: scanning up out of dirt, or down
 * through air. The floor below the field counts as dirt; outside the field is air.
 */
function restingRow(terrain: Terrain, x: number, from: number): number {
  let row = from;
  if (terrain.isSolid(x, row)) {
    while (terrain.isSolid(x, row)) row--;
    return row;
  }
  while (!terrain.isSolid(x, row + 1)) row++;
  return row;
}
