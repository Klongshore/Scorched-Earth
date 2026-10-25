import { ANGLE_STEP, POWER_STEP, POWER_STEP_FAST } from "../sim/constants";
import type { RoundAction } from "../sim/round";

/** One on-screen button: the same Round action as its key, optionally repeating while held. */
export interface TouchControl {
  readonly label: string;
  readonly action: RoundAction;
  /** Repeat while held, like a held arrow key; otherwise act once per tap. */
  readonly repeats: boolean;
  readonly className?: string;
}

/** A captioned row of buttons, e.g. "Angle" with ◀ and ▶. */
export interface TouchGroup {
  readonly caption: string;
  readonly controls: readonly TouchControl[];
}

/** The on-screen controls, in display order: each button does what its key does. */
export const TOUCH_GROUPS: readonly TouchGroup[] = [
  {
    caption: "Angle",
    controls: [
      { label: "◀", action: { kind: "adjustAngle", delta: ANGLE_STEP }, repeats: true },
      { label: "▶", action: { kind: "adjustAngle", delta: -ANGLE_STEP }, repeats: true },
    ],
  },
  {
    caption: "Power",
    controls: [
      { label: "−10", action: { kind: "adjustPower", delta: -POWER_STEP_FAST }, repeats: true },
      { label: "−", action: { kind: "adjustPower", delta: -POWER_STEP }, repeats: true },
      { label: "+", action: { kind: "adjustPower", delta: POWER_STEP }, repeats: true },
      { label: "+10", action: { kind: "adjustPower", delta: POWER_STEP_FAST }, repeats: true },
    ],
  },
  {
    caption: "Weapon",
    controls: [
      { label: "◀", action: { kind: "cycleWeapon", delta: -1 }, repeats: false },
      { label: "▶", action: { kind: "cycleWeapon", delta: 1 }, repeats: false },
    ],
  },
  {
    caption: "Shield",
    controls: [{ label: "Raise", action: { kind: "raiseShield" }, repeats: false }],
  },
  {
    caption: "",
    controls: [{ label: "FIRE", action: { kind: "fire" }, repeats: false, className: "fire" }],
  },
];

/** How long a held button waits before repeating, then how often it repeats (like key repeat). */
export const HOLD_DELAY_MS = 400;
export const HOLD_INTERVAL_MS = 50;

type Timers = {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
};

/**
 * Runs a step once on press and, while still held, again every HOLD_INTERVAL_MS after
 * HOLD_DELAY_MS. Only one hold runs at a time; pressing again replaces it.
 */
export class HoldRepeater {
  private delay: unknown = null;
  private interval: unknown = null;

  constructor(private readonly timers: Timers) {}

  press(step: () => void): void {
    this.release();
    step();
    this.delay = this.timers.setTimeout(() => {
      this.delay = null;
      this.interval = this.timers.setInterval(step, HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }

  release(): void {
    if (this.delay !== null) this.timers.clearTimeout(this.delay);
    if (this.interval !== null) this.timers.clearInterval(this.interval);
    this.delay = null;
    this.interval = null;
  }
}

/**
 * Fill `container` with the on-screen controls, for playing on a touch screen. The buttons never
 * take focus, so a keyboard keeps working alongside them. Returns a detach function.
 */
export function attachTouchControls(
  container: HTMLElement,
  onAction: (a: RoundAction) => void,
): () => void {
  const repeater = new HoldRepeater(window);
  const release = (): void => repeater.release();
  const groups = TOUCH_GROUPS.map((group) => {
    const box = document.createElement("div");
    box.className = "touch-group";
    const caption = document.createElement("span");
    caption.className = "touch-caption";
    caption.textContent = group.caption;
    const buttons = document.createElement("div");
    buttons.className = "touch-buttons";
    for (const control of group.controls) buttons.append(touchButton(control, onAction, repeater));
    box.append(caption, buttons);
    return box;
  });
  container.replaceChildren(...groups);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  window.addEventListener("blur", release);
  return () => {
    release();
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
    window.removeEventListener("blur", release);
    container.replaceChildren();
  };
}

function touchButton(
  control: TouchControl,
  onAction: (a: RoundAction) => void,
  repeater: HoldRepeater,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.tabIndex = -1;
  button.textContent = control.label;
  if (control.className) button.className = control.className;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault(); // keep focus where it is, and no text selection or zoom
    if (control.repeats) repeater.press(() => onAction(control.action));
    else onAction(control.action);
  });
  button.addEventListener("pointerleave", () => repeater.release());
  button.addEventListener("contextmenu", (event) => event.preventDefault()); // long-press menu
  return button;
}
