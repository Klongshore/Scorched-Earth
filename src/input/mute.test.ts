import { describe, expect, it } from "vitest";
import { attachMute } from "./mute";

describe("attachMute", () => {
  it("toggles on a button click and hands focus back by blurring the button", () => {
    const listeners: Record<string, (e: Event) => void> = {};
    let blurred = 0;
    const button = {
      addEventListener: (type: string, fn: (e: Event) => void) => (listeners[type] = fn),
      removeEventListener: () => {},
      blur: () => blurred++,
    } as unknown as HTMLElement;
    const target = {
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as Window;
    let toggles = 0;
    attachMute(target, button, () => toggles++);
    listeners["click"]?.({ preventDefault: () => {} } as Event);
    expect(toggles).toBe(1);
    expect(blurred).toBe(1);
  });
});
