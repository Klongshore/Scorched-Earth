import { FIELD_HEIGHT, FIELD_WIDTH } from "../sim/constants";

/** Largest whole-number multiple of the field that fits the window (at least 1). */
export function computeScale(innerWidth: number, innerHeight: number): number {
  return Math.max(1, Math.floor(Math.min(innerWidth / FIELD_WIDTH, innerHeight / FIELD_HEIGHT)));
}

/** Size the canvas and overlay in whole-number steps now and on every window resize. */
export function installScaling(canvas: HTMLCanvasElement, overlay: HTMLElement | null): void {
  const apply = (): void => {
    const s = computeScale(window.innerWidth, window.innerHeight);
    for (const el of [canvas, overlay]) {
      if (!el) continue;
      el.style.width = `${FIELD_WIDTH * s}px`;
      el.style.height = `${FIELD_HEIGHT * s}px`;
    }
  };
  apply();
  window.addEventListener("resize", apply);
}
