import { Game, seedFromQuery } from "./game";
import { Renderer } from "./render/renderer";
import { installScaling } from "./render/scale";

const canvas = document.querySelector<HTMLCanvasElement>("#field");
if (!canvas) throw new Error("Canvas #field is required");
const overlay = document.querySelector<HTMLElement>("#overlay");
if (!overlay) throw new Error("Overlay #overlay is required");

installScaling(canvas, overlay);
// ?seed=N reproduces a Match; otherwise each Match is seeded from the wall clock.
const game = new Game(window, new Renderer(canvas), overlay, {
  seed: seedFromQuery(window.location.search),
});
game.start();
