import { FIELD_HEIGHT, FIELD_WIDTH } from "../sim/constants";

/** How much to enlarge the field so it fills the window (at least 1). */
export function computeScale(innerWidth: number, innerHeight: number): number {
  return Math.max(1, Math.min(innerWidth / FIELD_WIDTH, innerHeight / FIELD_HEIGHT));
}

/**
 * Size the canvas and overlay to fill the window now and on every window resize, leaving room
 * below for the on-screen controls when they are shown (they match the field's width).
 */
export function installScaling(
  canvas: HTMLCanvasElement,
  overlay: HTMLElement | null,
  controls?: HTMLElement,
): void {
  const apply = (): void => {
    const below = controls?.offsetHeight ?? 0;
    const s = computeScale(window.innerWidth, window.innerHeight - below);
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
