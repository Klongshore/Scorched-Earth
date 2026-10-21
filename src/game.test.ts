import { describe, expect, it } from "vitest";
import { advance } from "./game";
import { MAX_TICKS_PER_FRAME, TICK_SECONDS } from "./sim/constants";

function run(accumulator: number, frameSeconds: number) {
  const dts: number[] = [];
  const next = advance(accumulator, frameSeconds, (dt) => dts.push(dt));
  return { next, dts };
}

describe("advance (fixed-timestep loop)", () => {
  it("only ever ticks by TICK_SECONDS", () => {
    const { dts } = run(0, 3.5 * TICK_SECONDS);
    expect(dts).toEqual([TICK_SECONDS, TICK_SECONDS, TICK_SECONDS]);
  });

  it("carries the remainder to the next frame", () => {
    const first = run(0, 1.5 * TICK_SECONDS);
    expect(first.dts).toHaveLength(1);
    const second = run(first.next, 0.5 * TICK_SECONDS);
    expect(second.dts).toHaveLength(1);
  });

  it("ticks nothing for a frame shorter than a tick", () => {
    const { dts, next } = run(0, TICK_SECONDS / 2);
    expect(dts).toEqual([]);
    expect(next).toBeCloseTo(TICK_SECONDS / 2);
  });

  it("caps ticks per frame and drops the backlog after a long pause", () => {
    const { dts, next } = run(0, 10);
    expect(dts).toHaveLength(MAX_TICKS_PER_FRAME);
    expect(next).toBeLessThanOrEqual(TICK_SECONDS);
  });
});
