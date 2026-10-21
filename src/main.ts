import { Renderer } from "./render/renderer";
import { installScaling } from "./render/scale";
import { BABY_MISSILE, FIELD_HEIGHT, FIELD_WIDTH, TICK_SECONDS, WIND_MAX } from "./sim/constants";
import { placeTanks } from "./sim/placement";
import { createPlayers } from "./sim/players";
import { launch, stepProjectile } from "./sim/projectile";
import { Rng } from "./sim/rng";
import type { Projectile } from "./sim/types";
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

const wind = rng.range(-WIND_MAX, WIND_MAX);

// Temporary dev driver: Space fires the first Tank, Left/Right adjust its Angle.
let projectile: Projectile | null = null;
window.addEventListener("keydown", (e) => {
  const tank = tanks[0];
  if (!tank) return;
  if (e.key === "ArrowLeft") tank.angle = Math.min(180, tank.angle + 1);
  else if (e.key === "ArrowRight") tank.angle = Math.max(0, tank.angle - 1);
  else if (e.key === " " && !projectile) projectile = launch(tank, BABY_MISSILE);
});

const renderer = new Renderer(canvas);
let last = performance.now();
let accumulator = 0;
function frame(now: number): void {
  accumulator += Math.min((now - last) / 1000, 0.1);
  last = now;
  while (accumulator >= TICK_SECONDS) {
    accumulator -= TICK_SECONDS;
    if (
      projectile &&
      stepProjectile(projectile, wind, terrain, tanks, TICK_SECONDS).kind !== "flying"
    ) {
      projectile = null;
    }
  }
  renderer.draw(terrain, tanks, players, projectile);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
