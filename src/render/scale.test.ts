import { describe, expect, it } from "vitest";
import { computeScale } from "./scale";

describe("computeScale", () => {
  it("grows in whole-number steps by default", () => {
    expect(computeScale(1920, 1080)).toBe(2);
    expect(computeScale(1279, 2000)).toBe(1);
  });

  it("fills the window when whole-number steps aren't required", () => {
    expect(computeScale(1024, 768 - 80, false)).toBeCloseTo(688 / 480);
    expect(computeScale(768, 1024, false)).toBeCloseTo(1.2);
  });

  it("never shrinks the field below its own size", () => {
    expect(computeScale(320, 240)).toBe(1);
    expect(computeScale(320, 240, false)).toBe(1);
  });
});
