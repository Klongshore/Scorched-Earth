import { describe, expect, it } from "vitest";
import { computeScale } from "./scale";

describe("computeScale", () => {
  it("fills the window, limited by whichever side runs out first", () => {
    expect(computeScale(1600, 1000)).toBeCloseTo(1000 / 480);
    expect(computeScale(1024, 768 - 80)).toBeCloseTo(688 / 480);
    expect(computeScale(768, 1024)).toBeCloseTo(1.2);
  });

  it("never shrinks the field below its own size", () => {
    expect(computeScale(320, 240)).toBe(1);
  });
});
