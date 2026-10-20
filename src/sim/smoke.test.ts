import { describe, expect, it } from "vitest";
import { FIELD_HEIGHT, FIELD_WIDTH } from "./constants";

describe("smoke", () => {
  it("uses the 640x480 logical field", () => {
    expect([FIELD_WIDTH, FIELD_HEIGHT]).toEqual([640, 480]);
  });
});
