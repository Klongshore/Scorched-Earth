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
  const press = (
    key: string,
    opts: { shiftKey?: boolean; repeat?: boolean; target?: { tagName: string } } = {},
  ) => {
    let prevented = false;
    const event = {
      key,
      code: key === " " ? "Space" : key,
      shiftKey: opts.shiftKey ?? false,
      repeat: opts.repeat ?? false,
      target: opts.target ?? null,
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

  it("confirms once per Enter press, ignoring auto-repeat", () => {
    const k = setup();
    k.press("Enter");
    expect(k.press("Enter", { repeat: true })).toBe(true);
    k.press("Enter", { repeat: true });
    expect(k.confirms()).toBe(1);
  });

  it("prevents default only for handled keys", () => {
    const k = setup();
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter"]) {
      expect(k.press(key)).toBe(true);
    }
    expect(k.press(" ", { repeat: true })).toBe(true);
    expect(k.press("a")).toBe(false);
  });

  it("leaves arrows and Space to a focused form control but still confirms on Enter", () => {
    const k = setup();
    for (const tagName of ["SELECT", "INPUT", "BUTTON"]) {
      for (const key of ["ArrowUp", "ArrowLeft", " "]) {
        expect(k.press(key, { target: { tagName } })).toBe(false);
      }
      expect(k.press("Enter", { target: { tagName } })).toBe(true);
    }
    expect(k.actions).toEqual([]);
    expect(k.confirms()).toBe(3);
  });

  it("steps through Weapons with Tab and back with Shift+Tab", () => {
    const k = setup();
    expect(k.press("Tab")).toBe(true);
    expect(k.press("Tab", { shiftKey: true })).toBe(true);
    expect(k.actions).toEqual([
      { kind: "cycleWeapon", delta: 1 },
      { kind: "cycleWeapon", delta: -1 },
    ]);
  });

  it("leaves Tab to a focused form control, so it still moves focus", () => {
    const k = setup();
    for (const tagName of ["SELECT", "INPUT", "BUTTON"]) {
      expect(k.press("Tab", { target: { tagName } })).toBe(false);
      expect(k.press("Tab", { shiftKey: true, target: { tagName } })).toBe(false);
    }
    expect(k.actions).toEqual([]);
  });

  it("raises a Shield once per S press, either case, ignoring auto-repeat", () => {
    const k = setup();
    expect(k.press("s")).toBe(true);
    expect(k.press("s", { repeat: true })).toBe(true);
    expect(k.press("S", { shiftKey: true })).toBe(true);
    expect(k.press("S", { shiftKey: true, repeat: true })).toBe(true);
    expect(k.actions).toEqual([{ kind: "raiseShield" }, { kind: "raiseShield" }]);
  });

  it("leaves S to a focused form control", () => {
    const k = setup();
    for (const tagName of ["INPUT", "SELECT", "TEXTAREA", "BUTTON"]) {
      expect(k.press("s", { target: { tagName } })).toBe(false);
      expect(k.press("S", { target: { tagName } })).toBe(false);
    }
    expect(k.actions).toEqual([]);
  });

  it("detach removes the listener", () => {
    const k = setup();
    k.detach();
    expect(k.listeners.size).toBe(0);
  });
});
