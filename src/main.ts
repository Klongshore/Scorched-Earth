import { Game } from "./game";
import { Renderer } from "./render/renderer";
import { installScaling } from "./render/scale";

const canvas = document.querySelector<HTMLCanvasElement>("#field");
if (!canvas) throw new Error("Canvas #field is required");
const overlay = document.querySelector<HTMLElement>("#overlay");

installScaling(canvas, overlay);
const game = new Game(window, new Renderer(canvas));
game.start();
