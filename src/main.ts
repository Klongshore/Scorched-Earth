import { Game, seedFromQuery } from "./game";
import { Renderer } from "./render/renderer";
import { installScaling } from "./render/scale";

const canvas = document.querySelector<HTMLCanvasElement>("#field");
if (!canvas) throw new Error("Canvas #field is required");
const overlay = document.querySelector<HTMLElement>("#overlay");
if (!overlay) throw new Error("Overlay #overlay is required");
// Shown only on touch screens (see style.css); the field scales to fit above it.
const touchControls = document.querySelector<HTMLElement>("#touch-controls") ?? undefined;

// ?seed=N reproduces a Match; otherwise each Match is seeded from the wall clock.
const game = new Game(window, new Renderer(canvas), overlay, {
  seed: seedFromQuery(window.location.search),
  touchControls,
});
game.start();
// After start(), so the on-screen controls hold their buttons when their height is measured.
installScaling(canvas, overlay, touchControls);
