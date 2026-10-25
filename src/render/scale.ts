import { FIELD_HEIGHT, FIELD_WIDTH } from "../sim/constants";

/**
 * How much to enlarge the field to fit the window (at least 1). `whole` keeps it to whole-number
 * multiples, so every field pixel is the same size; otherwise the field fills the window.
 */
export function computeScale(innerWidth: number, innerHeight: number, whole = true): number {
  const fit = Math.min(innerWidth / FIELD_WIDTH, innerHeight / FIELD_HEIGHT);
  return Math.max(1, whole ? Math.floor(fit) : fit);
}

/**
 * Size the canvas and overlay now and on every window resize, leaving room below for the
 * on-screen controls when they are shown (they match the field's width). With the controls
 * shown, as on a tablet, the field fills the screen; otherwise it grows in whole-number steps.
 */
export function installScaling(
  canvas: HTMLCanvasElement,
  overlay: HTMLElement | null,
  controls?: HTMLElement,
): void {
  const apply = (): void => {
    const below = controls?.offsetHeight ?? 0;
    const s = computeScale(window.innerWidth, window.innerHeight - below, below === 0);
    const width = `${Math.floor(FIELD_WIDTH * s)}px`;
    for (const el of [canvas, overlay]) {
      if (!el) continue;
      el.style.width = width;
      el.style.height = `${Math.floor(FIELD_HEIGHT * s)}px`;
    }
    if (controls) controls.style.width = width;
  };
  apply();
  window.addEventListener("resize", apply);
}
