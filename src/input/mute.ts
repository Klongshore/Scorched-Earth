/**
 * Call `onToggle` when the Player presses M, or taps `button` (shown on touch screens). M is left
 * alone while a form control has focus, so names can still be typed. Returns a detach function.
 */
export function attachMute(
  target: Window,
  button: HTMLElement | undefined,
  onToggle: () => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "m" && event.key !== "M") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const tagName = (event.target as { tagName?: unknown } | null)?.tagName;
    if (tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA") return;
    event.preventDefault();
    if (!event.repeat) onToggle();
  };
  const onClick = (event: Event): void => {
    event.preventDefault();
    onToggle();
    // Give focus back so Space goes to the game, not to this button.
    (button as { blur?: () => void } | undefined)?.blur?.();
  };
  target.addEventListener("keydown", onKeyDown);
  button?.addEventListener("click", onClick);
  return () => {
    target.removeEventListener("keydown", onKeyDown);
    button?.removeEventListener("click", onClick);
  };
}
