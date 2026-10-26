import { BARREL_LENGTH, FIELD_WIDTH, TANK_HEIGHT } from "../sim/constants";
import { STRIP_HEIGHT } from "./hud";

/** Epitaphs and Taunts: slightly larger than the 10 px Health number above each Tank. */
export const LINE_FONT_SIZE = 12;
export const LINE_FONT = `${LINE_FONT_SIZE}px monospace`;
/** Least gap in px between a line and the left or right edge of the field, or the HUD strip. */
export const LINE_EDGE = 4;
/** px from the tip of a barrel at 90° to a line's baseline, clearing the Health number. */
const LINE_CLEARANCE = 16;

/**
 * Where to draw a line of text above a Tank, measuring it with `measure`: its left edge and
 * baseline. Centred over the Tank, it is moved sideways to stay inside the field at the left and
 * right edges, and down to stay below the HUD strip.
 */
export function linePlacement(
  text: string,
  tank: { readonly x: number; readonly y: number },
  measure: (text: string) => number,
): { x: number; y: number } {
  const width = measure(text);
  const centred = tank.x + 0.5 - width / 2;
  const x = Math.max(LINE_EDGE, Math.min(centred, FIELD_WIDTH - LINE_EDGE - width));
  const above = tank.y - TANK_HEIGHT - BARREL_LENGTH - LINE_CLEARANCE;
  const y = Math.max(above, STRIP_HEIGHT + LINE_EDGE + LINE_FONT_SIZE);
  return { x, y };
}
