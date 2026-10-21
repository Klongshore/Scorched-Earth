import { ANGLE_STEP, POWER_STEP, POWER_STEP_FAST } from "../sim/constants";
import type { RoundAction } from "../sim/round";

/** Form controls keep their own keys (arrows in a select, Enter on a button). */
function isFormControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement
  );
}

function actionFor(event: KeyboardEvent): RoundAction | null {
  const power = event.shiftKey ? POWER_STEP_FAST : POWER_STEP;
  switch (event.key) {
    case "ArrowLeft":
      return { kind: "adjustAngle", delta: ANGLE_STEP };
    case "ArrowRight":
      return { kind: "adjustAngle", delta: -ANGLE_STEP };
    case "ArrowUp":
      return { kind: "adjustPower", delta: power };
    case "ArrowDown":
      return { kind: "adjustPower", delta: -power };
    case " ":
    case "Spacebar":
      return event.repeat ? null : { kind: "fire" };
    default:
      return null;
  }
}

const HANDLED_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  " ",
  "Spacebar",
  "Enter",
]);

/** Each keydown (including OS auto-repeat, except for Space) is one step. Returns detach. */
export function attachKeyboard(
  target: Window,
  onAction: (a: RoundAction) => void,
  onConfirm: () => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (isFormControl(event.target) || !HANDLED_KEYS.has(event.key)) return;
    event.preventDefault();
    if (event.key === "Enter") {
      if (!event.repeat) onConfirm();
      return;
    }
    const action = actionFor(event);
    if (action) onAction(action);
  };
  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}
