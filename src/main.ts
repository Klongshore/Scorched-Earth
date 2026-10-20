import { FIELD_HEIGHT, FIELD_WIDTH } from "./sim/constants";

const canvas = document.querySelector<HTMLCanvasElement>("#field");
const context = canvas?.getContext("2d");
if (!context) throw new Error("Canvas #field with a 2D context is required");

context.fillStyle = "#1e3a8a";
context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
