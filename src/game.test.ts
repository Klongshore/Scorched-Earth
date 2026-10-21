import { describe, expect, it } from "vitest";
import { FrameLoop, advance, seedFromQuery } from "./game";
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

  it("caps ticks per frame and catches up at most 0.25 s of backlog after a long pause", () => {
    const first = run(0, 10);
    expect(first.dts).toHaveLength(MAX_TICKS_PER_FRAME);
    expect(first.next).toBeCloseTo(0.25 - MAX_TICKS_PER_FRAME * TICK_SECONDS);
    let accumulator = first.next;
    let ticks = first.dts.length;
    for (let frame = 0; frame < 10; frame++) {
      const next = run(accumulator, 0);
      ticks += next.dts.length;
      accumulator = next.next;
    }
    // 0.25 s is 15 ticks; floating-point rounding may leave the last one in the accumulator.
    expect(ticks).toBeGreaterThanOrEqual(14);
    expect(ticks).toBeLessThanOrEqual(15);
    expect(accumulator).toBeLessThan(TICK_SECONDS);
  });

  it("ignores negative frame times", () => {
    const { dts, next } = run(0, -1);
    expect(dts).toEqual([]);
    expect(next).toBe(0);
  });
});

describe("seedFromQuery", () => {
  it("reads ?seed=N as an unsigned 32-bit seed", () => {
    expect(seedFromQuery("?seed=42")).toBe(42);
    expect(seedFromQuery("?foo=1&seed=7")).toBe(7);
    expect(seedFromQuery("?seed=-1")).toBe(0xffffffff);
  });

  it("returns undefined when the seed is missing or not a number", () => {
    expect(seedFromQuery("")).toBeUndefined();
    expect(seedFromQuery("?seed=")).toBeUndefined();
    expect(seedFromQuery("?seed=abc")).toBeUndefined();
  });
});

function fakeScheduler() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  return {
    pending,
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancelAnimationFrame: (id: number) => {
      pending.delete(id);
    },
    /** Run every callback pending now, as the browser does for one frame. */
    runFrame(now: number) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb(now);
    },
  };
}

describe("FrameLoop", () => {
  it("reports seconds since the previous frame, starting from 0", () => {
    const scheduler = fakeScheduler();
    const frames: number[] = [];
    const loop = new FrameLoop(scheduler, (s) => frames.push(s));
    loop.start();
    scheduler.runFrame(1000);
    scheduler.runFrame(1016);
    expect(frames).toEqual([0, 0.016]);
  });

  it("stop cancels the pending frame", () => {
    const scheduler = fakeScheduler();
    const frames: number[] = [];
    const loop = new FrameLoop(scheduler, (s) => frames.push(s));
    loop.start();
    loop.stop();
    expect(scheduler.pending.size).toBe(0);
    scheduler.runFrame(1000);
    expect(frames).toEqual([]);
  });

  it("runs a single loop after stop(); start() in the same frame, timing afresh", () => {
    const scheduler = fakeScheduler();
    const frames: number[] = [];
    const loop = new FrameLoop(scheduler, (s) => frames.push(s));
    loop.start();
    scheduler.runFrame(1000);
    loop.stop();
    loop.start();
    loop.start();
    expect(scheduler.pending.size).toBe(1);
    scheduler.runFrame(60_000);
    expect(frames).toEqual([0, 0]);
    expect(scheduler.pending.size).toBe(1);
  });

  it("stays stopped when stopped from inside a frame", () => {
    const scheduler = fakeScheduler();
    let count = 0;
    const loop = new FrameLoop(scheduler, () => {
      count++;
      loop.stop();
    });
    loop.start();
    scheduler.runFrame(1000);
    scheduler.runFrame(2000);
    expect(count).toBe(1);
    expect(scheduler.pending.size).toBe(0);
  });
});
