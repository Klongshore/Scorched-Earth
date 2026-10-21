import { Renderer } from "./render/renderer";
import { installScaling } from "./render/scale";
import { FIELD_HEIGHT, FIELD_WIDTH } from "./sim/constants";
import { placeTanks } from "./sim/placement";
import { createPlayers } from "./sim/players";
import { Rng } from "./sim/rng";
import { generateHills } from "./sim/terrainGen";

const canvas = document.querySelector<HTMLCanvasElement>("#field");
if (!canvas) throw new Error("Canvas #field is required");

installScaling(canvas, document.querySelector<HTMLElement>("#overlay"));

// ?seed=N reproduces a field; otherwise each reload picks a new one.
const seedParam = new URLSearchParams(window.location.search).get("seed");
const seed =
  seedParam !== null && seedParam !== "" ? Number(seedParam) : Math.floor(Math.random() * 2 ** 32);
const rng = new Rng(seed);
const terrain = generateHills(rng, FIELD_WIDTH, FIELD_HEIGHT);
const players = createPlayers(["human", "human"]);
const tanks = placeTanks(
  rng,
  terrain,
  players.map((p) => p.id),
);

const renderer = new Renderer(canvas);
function frame(): void {
  renderer.draw(terrain, tanks, players);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
