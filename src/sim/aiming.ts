import { GRAVITY, POWER_TO_SPEED } from "./constants";
import { barrelTip, centre } from "./tank";
import type { Tank } from "./types";

/**
 * The Power that lands a Projectile fired at `angle` from `self` on `target`'s centre,
 * ignoring Wind and Terrain. null when no Power can reach it at that Angle.
 */
export function powerToHit(self: Tank, target: Tank, angle: number): number | null {
  // The barrel tip depends on the Angle: work it out on a copy so `self` is unchanged.
  const tip = barrelTip({ ...self, angle });
  const goal = centre(target);
  const dx = goal.x - tip.x;
  const dy = goal.y - tip.y; // y points down
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const denominator = 2 * cos * cos * (dy + dx * Math.tan(radians));
  // The Target is on or above the barrel's line (or behind it), so no speed reaches it.
  if (!(denominator > 0)) return null;
  const speed = Math.sqrt((GRAVITY * dx * dx) / denominator);
  return Math.round(speed / POWER_TO_SPEED);
}
