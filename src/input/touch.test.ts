import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANGLE_STEP, POWER_STEP, POWER_STEP_FAST } from "../sim/constants";
import { HOLD_DELAY_MS, HOLD_INTERVAL_MS, HoldRepeater, TOUCH_GROUPS } from "./touch";

describe("TOUCH_GROUPS", () => {
  const controls = TOUCH_GROUPS.flatMap((g) => g.controls);

  it("offers every Round action a key does, with Angle and Power repeating while held", () => {
    expect(controls.map((c) => [c.action, c.repeats])).toEqual([
      [{ kind: "adjustAngle", delta: ANGLE_STEP }, true],
      [{ kind: "adjustAngle", delta: -ANGLE_STEP }, true],
      [{ kind: "adjustPower", delta: -POWER_STEP_FAST }, true],
      [{ kind: "adjustPower", delta: -POWER_STEP }, true],
      [{ kind: "adjustPower", delta: POWER_STEP }, true],
      [{ kind: "adjustPower", delta: POWER_STEP_FAST }, true],
      [{ kind: "cycleWeapon", delta: -1 }, false],
      [{ kind: "cycleWeapon", delta: 1 }, false],
      [{ kind: "raiseShield" }, false],
      [{ kind: "fire" }, false],
    ]);
  });
});

describe("HoldRepeater", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const repeater = () => new HoldRepeater(globalThis as unknown as Window);

  it("steps once on press, then repeats after the hold delay until released", () => {
    const r = repeater();
    let steps = 0;
    r.press(() => steps++);
    expect(steps).toBe(1);
    vi.advanceTimersByTime(HOLD_DELAY_MS - 1);
    expect(steps).toBe(1);
    vi.advanceTimersByTime(1 + 3 * HOLD_INTERVAL_MS);
    expect(steps).toBe(4);
    r.release();
    vi.advanceTimersByTime(10 * HOLD_INTERVAL_MS);
    expect(steps).toBe(4);
  });

  it("a quick tap steps exactly once", () => {
    const r = repeater();
    let steps = 0;
    r.press(() => steps++);
    r.release();
    vi.advanceTimersByTime(HOLD_DELAY_MS + 10 * HOLD_INTERVAL_MS);
    expect(steps).toBe(1);
  });

  it("a new press replaces the hold already running", () => {
    const r = repeater();
    const steps: string[] = [];
    r.press(() => steps.push("a"));
    vi.advanceTimersByTime(HOLD_DELAY_MS + HOLD_INTERVAL_MS);
    r.press(() => steps.push("b"));
    vi.advanceTimersByTime(HOLD_DELAY_MS + HOLD_INTERVAL_MS);
    r.release();
    expect(steps).toEqual(["a", "a", "b", "b"]);
  });
});
