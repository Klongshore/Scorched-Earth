import { ANGLE_STEP, POWER_STEP, POWER_STEP_FAST } from "../sim/constants";
import type { RoundAction } from "../sim/round";

/** Map a key press to an aiming action, or null if the key does not aim. */
function aimActionFor(event: KeyboardEvent): RoundAction | null {
  const powerStep = event.shiftKey ? POWER_STEP_FAST : POWER_STEP;
  switch (event.key) {
    case "ArrowLeft":
      return { kind: "adjustAngle", delta: ANGLE_STEP }; // the barrel turns left
    case "ArrowRight":
      return { kind: "adjustAngle", delta: -ANGLE_STEP };
    case "ArrowUp":
      return { kind: "adjustPower", delta: powerStep };
    case "ArrowDown":
      return { kind: "adjustPower", delta: -powerStep };
    default:
      return null;
  }
}

const FORM_CONTROLS = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON"]);

/** True when the key press belongs to a focused form control (e.g. on the Setup screen). */
function isFormControl(target: EventTarget | null): boolean {
  const tagName = (target as { tagName?: unknown } | null)?.tagName;
  return typeof tagName === "string" && FORM_CONTROLS.has(tagName);
}

/**
 * Translate keydown events into Round actions. Each event, including OS auto-repeat,
 * is one step, except Space, which fires once per press. Arrow keys and Space are left
 * alone while a form control has focus, so the overlay screens stay keyboard-usable;
 * Enter always confirms. Returns a detach function.
 */
export function attachKeyboard(
  target: Window,
  onAction: (a: RoundAction) => void,
  onConfirm: () => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      onConfirm();
      return;
    }
    if (isFormControl(event.target)) return;
    if (event.code === "Space" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) onAction({ kind: "fire" });
      return;
    }
    const action = aimActionFor(event);
    if (action) {
      event.preventDefault();
      onAction(action);
    }
  };
  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}
