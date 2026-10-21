import { Renderer } from "./render/renderer";
import { installScaling } from "./render/scale";
import { FIELD_HEIGHT, FIELD_WIDTH } from "./sim/constants";
import { Rng } from "./sim/rng";
import { generateHills } from "./sim/terrainGen";

const canvas = document.querySelector<HTMLCanvasElement>("#field");
if (!canvas) throw new Error("Canvas #field is required");

installScaling(canvas, document.querySelector<HTMLElement>("#overlay"));

// ?seed=N reproduces a field; otherwise each reload picks a new one.
const seedParam = new URLSearchParams(window.location.search).get("seed");
const seed =
  seedParam !== null && seedParam !== "" ? Number(seedParam) : Math.floor(Math.random() * 2 ** 32);
const terrain = generateHills(new Rng(seed), FIELD_WIDTH, FIELD_HEIGHT);

const renderer = new Renderer(canvas);
function frame(): void {
  renderer.draw(terrain);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
