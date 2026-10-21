import { Game } from "./game";
import { Renderer } from "./render/renderer";
import { installScaling } from "./render/scale";

const canvas = document.querySelector<HTMLCanvasElement>("#field");
const overlay = document.querySelector<HTMLElement>("#overlay");
if (!canvas || !overlay) throw new Error("Canvas #field and #overlay are required");

installScaling(canvas, overlay);
new Game(new Renderer(canvas), overlay).start();
