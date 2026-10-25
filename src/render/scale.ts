import { FIELD_HEIGHT, FIELD_WIDTH } from "../sim/constants";

/** Largest whole-number multiple of the field that fits the window (at least 1). */
export function computeScale(innerWidth: number, innerHeight: number): number {
  return Math.max(1, Math.floor(Math.min(innerWidth / FIELD_WIDTH, innerHeight / FIELD_HEIGHT)));
}

/**
 * Size the canvas and overlay in whole-number steps now and on every window resize, leaving
 * room below for the on-screen controls when they are shown (they match the field's width).
 */
export function installScaling(
  canvas: HTMLCanvasElement,
  overlay: HTMLElement | null,
  controls?: HTMLElement,
): void {
  const apply = (): void => {
    const below = controls?.offsetHeight ?? 0;
    const s = computeScale(window.innerWidth, window.innerHeight - below);
    for (const el of [canvas, overlay]) {
      if (!el) continue;
      el.style.width = `${FIELD_WIDTH * s}px`;
      el.style.height = `${FIELD_HEIGHT * s}px`;
    }
    if (controls) controls.style.width = `${FIELD_WIDTH * s}px`;
  };
  apply();
  window.addEventListener("resize", apply);
}
