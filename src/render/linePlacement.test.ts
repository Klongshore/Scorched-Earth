import { describe, expect, it } from "vitest";
import {
  BARREL_LENGTH,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MAX_LINE_LENGTH,
  TANK_HEIGHT,
} from "../sim/constants";
import { EPITAPHS, SELF_INFLICTED_EPITAPHS, TAUNTS } from "../sim/lines";
import { STRIP_HEIGHT } from "./hud";
import { LINE_EDGE, LINE_FONT_SIZE, linePlacement } from "./linePlacement";

// Monospace: every character advances about 0.6em.
const measure = (t: string) => [...t].length * LINE_FONT_SIZE * 0.6;
const ALL_LINES = [...EPITAPHS, ...SELF_INFLICTED_EPITAPHS, ...TAUNTS];
const LONGEST = "W".repeat(MAX_LINE_LENGTH);

describe("linePlacement", () => {
  it("centres a line above the Tank, clear of its barrel and Health", () => {
    const { x, y } = linePlacement("Oops.", { x: 320, y: 300 }, measure);
    expect(x + measure("Oops.") / 2).toBeCloseTo(320.5, 10);
    expect(y).toBeLessThan(300 - TANK_HEIGHT - BARREL_LENGTH);
  });

  it("fits a line of the longest allowed length across the field", () => {
    expect(measure(LONGEST)).toBeLessThanOrEqual(FIELD_WIDTH - 2 * LINE_EDGE);
  });

  it("moves every line sideways to stay inside the field at the left and right edges", () => {
    for (const text of [...ALL_LINES, LONGEST]) {
      for (const tankX of [0, 5, 60, FIELD_WIDTH - 60, FIELD_WIDTH - 5, FIELD_WIDTH - 1]) {
        const { x } = linePlacement(text, { x: tankX, y: 300 }, measure);
        expect(x, `${text} at ${tankX}`).toBeGreaterThanOrEqual(LINE_EDGE);
        expect(x + measure(text), `${text} at ${tankX}`).toBeLessThanOrEqual(
          FIELD_WIDTH - LINE_EDGE,
        );
      }
    }
  });

  it("leaves a line in the middle of the field where it is", () => {
    const text = "I regret nothing!";
    const left = linePlacement(text, { x: 200, y: 300 }, measure);
    const right = linePlacement(text, { x: 210, y: 300 }, measure);
    expect(right.x - left.x).toBe(10);
  });

  it("keeps a line near the top below the HUD strip", () => {
    for (const tankY of [0, 20, STRIP_HEIGHT, 60]) {
      const { y } = linePlacement("Avenge me!", { x: 320, y: tankY }, measure);
      expect(y - LINE_FONT_SIZE).toBeGreaterThanOrEqual(STRIP_HEIGHT);
      expect(y).toBeLessThan(FIELD_HEIGHT);
    }
  });
});
