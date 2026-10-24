import {
  BARREL_LENGTH,
  MAX_ANGLE,
  MAX_HEALTH,
  MIN_ANGLE,
  MIN_POWER,
  POWER_PER_HEALTH,
  TANK_HALF_WIDTH,
  TANK_HEIGHT,
  START_ANGLE,
  START_POWER,
} from "./constants";
import type { CellRect, Terrain } from "./terrain";
import type { Tank } from "./types";

/** A Tank at full Health with the starting aim, at rest. The one source of a new Tank's defaults. */
export function newTank(playerId: number, x: number, y: number): Tank {
  return {
    playerId,
    x,
    y,
    angle: START_ANGLE,
    power: START_POWER,
    health: MAX_HEALTH,
    fallen: 0,
    parachute: false,
  };
}

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

/**
 * The Terrain cells a Tank covers: columns x - TANK_HALF_WIDTH to x + TANK_HALF_WIDTH, rows
 * y - TANK_HEIGHT to y - 1. Dirt never fills or settles into a living Tank's cells.
 */
export function tankCells(t: Tank): CellRect {
  return {
    x0: t.x - TANK_HALF_WIDTH,
    x1: t.x + TANK_HALF_WIDTH,
    y0: t.y - TANK_HEIGHT,
    y1: t.y - 1,
  };
}

/** True if a living Tank covers the Terrain cell (x, y); see tankCells. */
export function occupiesCell(t: Tank, x: number, y: number): boolean {
  if (!isAlive(t)) return false;
  const r = tankCells(t);
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

export function isSupported(t: Tank, terrain: Terrain): boolean {
  for (let x = t.x - TANK_HALF_WIDTH; x <= t.x + TANK_HALF_WIDTH; x++) {
    if (terrain.isSolid(x, t.y)) return true;
  }
  return false;
}
