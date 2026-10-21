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

/**
 * Translate keydown events into Round actions. Each event, including OS auto-repeat,
 * is one step, except Space, which fires once per press. Returns a detach function.
 */
export function attachKeyboard(
  target: Window,
  onAction: (a: RoundAction) => void,
  onConfirm: () => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Space" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) onAction({ kind: "fire" });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onConfirm();
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
