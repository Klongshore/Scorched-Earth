import { describe, expect, it } from "vitest";
import { ANGLE_STEP, POWER_STEP, POWER_STEP_FAST } from "../sim/constants";
import type { RoundAction } from "../sim/round";
import { attachKeyboard } from "./keyboard";

type Listener = (e: KeyboardEvent) => void;

function setup() {
  const listeners = new Set<Listener>();
  const target = {
    addEventListener: (_type: string, l: Listener) => listeners.add(l),
    removeEventListener: (_type: string, l: Listener) => listeners.delete(l),
  } as unknown as Window;
  const actions: RoundAction[] = [];
  let confirms = 0;
  const detach = attachKeyboard(
    target,
    (a) => actions.push(a),
    () => confirms++,
  );
  const press = (key: string, opts: { shiftKey?: boolean; repeat?: boolean } = {}) => {
    let prevented = false;
    const event = {
      key,
      code: key === " " ? "Space" : key,
      shiftKey: opts.shiftKey ?? false,
      repeat: opts.repeat ?? false,
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as KeyboardEvent;
    for (const l of listeners) l(event);
    return prevented;
  };
  return { actions, confirms: () => confirms, press, detach, listeners };
}

describe("attachKeyboard", () => {
  it("maps arrow keys to Angle and Power steps, with Shift for fast Power", () => {
    const k = setup();
    k.press("ArrowLeft");
    k.press("ArrowRight");
    k.press("ArrowUp");
    k.press("ArrowDown");
    k.press("ArrowUp", { shiftKey: true });
    k.press("ArrowDown", { shiftKey: true });
    expect(k.actions).toEqual([
      { kind: "adjustAngle", delta: ANGLE_STEP },
      { kind: "adjustAngle", delta: -ANGLE_STEP },
      { kind: "adjustPower", delta: POWER_STEP },
      { kind: "adjustPower", delta: -POWER_STEP },
      { kind: "adjustPower", delta: POWER_STEP_FAST },
      { kind: "adjustPower", delta: -POWER_STEP_FAST },
    ]);
  });

  it("treats auto-repeat of arrow keys as further steps", () => {
    const k = setup();
    k.press("ArrowUp");
    k.press("ArrowUp", { repeat: true });
    expect(k.actions).toHaveLength(2);
  });

  it("fires once per Space press, ignoring auto-repeat", () => {
    const k = setup();
    k.press(" ");
    k.press(" ", { repeat: true });
    k.press(" ", { repeat: true });
    expect(k.actions).toEqual([{ kind: "fire" }]);
  });

  it("calls onConfirm for Enter", () => {
    const k = setup();
    k.press("Enter");
    expect(k.confirms()).toBe(1);
    expect(k.actions).toEqual([]);
  });

  it("prevents default only for handled keys", () => {
    const k = setup();
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter"]) {
      expect(k.press(key)).toBe(true);
    }
    expect(k.press(" ", { repeat: true })).toBe(true);
    expect(k.press("a")).toBe(false);
  });

  it("detach removes the listener", () => {
    const k = setup();
    k.detach();
    expect(k.listeners.size).toBe(0);
  });
});
