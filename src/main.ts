import { Renderer } from "./render/renderer";
import { installScaling } from "./render/scale";
import { ANGLE_STEP, POWER_STEP, POWER_STEP_FAST, TICK_SECONDS } from "./sim/constants";
import { createPlayers } from "./sim/players";
import { Rng } from "./sim/rng";
import { Round } from "./sim/round";

const canvas = document.querySelector<HTMLCanvasElement>("#field");
if (!canvas) throw new Error("Canvas #field is required");

installScaling(canvas, document.querySelector<HTMLElement>("#overlay"));

// ?seed=N reproduces a Round; otherwise each reload picks a new one.
const seedParam = new URLSearchParams(window.location.search).get("seed");
const seed =
  seedParam !== null && seedParam !== "" ? Number(seedParam) : Math.floor(Math.random() * 2 ** 32);
const players = createPlayers(["human", "human"]);
const round = new Round(1, players, new Rng(seed));

// Temporary dev driver until Milestone 10: Left/Right Angle, Up/Down Power (Shift = fast), Space fires.
window.addEventListener("keydown", (e) => {
  const powerStep = e.shiftKey ? POWER_STEP_FAST : POWER_STEP;
  if (e.key === "ArrowLeft") round.act({ kind: "adjustAngle", delta: ANGLE_STEP });
  else if (e.key === "ArrowRight") round.act({ kind: "adjustAngle", delta: -ANGLE_STEP });
  else if (e.key === "ArrowUp") round.act({ kind: "adjustPower", delta: powerStep });
  else if (e.key === "ArrowDown") round.act({ kind: "adjustPower", delta: -powerStep });
  else if (e.key === " ") round.act({ kind: "fire" });
});

const renderer = new Renderer(canvas);
let last = performance.now();
let accumulator = 0;
function frame(now: number): void {
  accumulator += Math.min((now - last) / 1000, 0.1);
  last = now;
  while (accumulator >= TICK_SECONDS) {
    accumulator -= TICK_SECONDS;
    round.tick(TICK_SECONDS);
  }
  const { phase } = round;
  renderer.draw(
    round.terrain,
    round.tanks,
    players,
    phase.kind === "flying" ? phase.projectile : null,
    phase.kind === "exploding" ? phase.explosion : null,
  );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
