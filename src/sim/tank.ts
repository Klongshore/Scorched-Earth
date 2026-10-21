import {
  BARREL_LENGTH,
  MAX_ANGLE,
  MIN_ANGLE,
  MIN_POWER,
  POWER_PER_HEALTH,
  TANK_HALF_WIDTH,
  TANK_HEIGHT,
} from "./constants";
import type { Terrain } from "./terrain";
import type { Tank } from "./types";

export function isAlive(t: Tank): boolean {
  return t.health > 0;
}

export function powerCap(t: Tank): number {
  return t.health * POWER_PER_HEALTH;
}

export function clampAim(t: Tank): void {
  t.angle = Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, t.angle));
  t.power = Math.min(powerCap(t), Math.max(MIN_POWER, t.power));
}

export function centre(t: Tank): { x: number; y: number } {
  return { x: t.x, y: t.y - TANK_HEIGHT / 2 };
}

export function barrelTip(t: Tank): { x: number; y: number } {
  const radians = (t.angle * Math.PI) / 180;
  return {
    x: t.x + BARREL_LENGTH * Math.cos(radians),
    y: t.y - TANK_HEIGHT - BARREL_LENGTH * Math.sin(radians),
  };
}

export function hitTest(t: Tank, px: number, py: number): boolean {
  if (!isAlive(t)) return false;
  return (
    px >= t.x - TANK_HALF_WIDTH &&
    px <= t.x + TANK_HALF_WIDTH &&
    py >= t.y - TANK_HEIGHT &&
    py < t.y
  );
}

export function isSupported(t: Tank, terrain: Terrain): boolean {
  for (let x = t.x - TANK_HALF_WIDTH; x <= t.x + TANK_HALF_WIDTH; x++) {
    if (terrain.isSolid(x, t.y)) return true;
  }
  return false;
}
