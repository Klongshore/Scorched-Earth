import { MAX_HEALTH } from "../sim/constants";
import type { Match } from "../sim/match";
import { powerCap } from "../sim/tank";
import { HUD_BAR_BACKGROUND, HUD_STRIP, HUD_TEXT } from "./palette";

const FONT = "14px monospace";
const STRIP_HEIGHT = 36;
const LINE_1_Y = 14;
const LINE_2_Y = 30;
const LEFT = 8;
const BAR_WIDTH = 50;
const BAR_HEIGHT = 8;
const PLAYER_GAP = 24;

type Piece = readonly [text: string, color: string];

function windText(wind: number): string {
  const arrow = wind > 0 ? "→" : wind < 0 ? "←" : "";
  return `${arrow}${Math.abs(wind)}`;
}

/** Draw coloured text pieces left to right from x; returns the x after the last piece. */
function drawRun(
  ctx: CanvasRenderingContext2D,
  pieces: readonly Piece[],
  x: number,
  y: number,
): number {
  for (const [text, color] of pieces) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    x += ctx.measureText(text).width;
  }
  return x;
}

/**
 * HUD line 1. The current Player's name, Angle and Power show only while they are aiming,
 * so a finished shot or a finished Round never looks like a live Turn.
 */
export function aimLine(match: Match): Piece[] {
  const { round } = match;
  const status = `Wind: ${windText(round.wind)}   Round ${round.number}/${match.totalRounds}`;
  if (round.phase.kind !== "aiming") return [[status, HUD_TEXT]];
  const player = round.playerOf(round.currentPlayerId);
  const tank = round.currentTank();
  return [
    [player.name, player.color],
    [`   Angle: ${tank.angle}   Power: ${tank.power}/${powerCap(tank)}   ${status}`, HUD_TEXT],
  ];
}

export function drawHud(ctx: CanvasRenderingContext2D, match: Match): void {
  const { round, players } = match;
  ctx.save();
  ctx.fillStyle = HUD_STRIP;
  ctx.fillRect(0, 0, ctx.canvas.width, STRIP_HEIGHT);
  ctx.font = FONT;

  drawRun(ctx, aimLine(match), LEFT, LINE_1_Y);

  let x = LEFT;
  for (const player of players) {
    const { health } = round.tankOf(player.id);
    x = drawRun(ctx, [[`${player.name}: ${health} `, player.color]], x, LINE_2_Y);
    const barTop = LINE_2_Y - BAR_HEIGHT;
    ctx.fillStyle = HUD_BAR_BACKGROUND;
    ctx.fillRect(x, barTop, BAR_WIDTH, BAR_HEIGHT);
    ctx.fillStyle = player.color;
    ctx.fillRect(x, barTop, Math.round((BAR_WIDTH * health) / MAX_HEALTH), BAR_HEIGHT);
    x += BAR_WIDTH + PLAYER_GAP;
  }
  // Line 1 has no room left at 640 px, so the thinking marker sits right-aligned on line 2.
  if (round.isComputerThinking) {
    ctx.fillStyle = HUD_TEXT;
    ctx.textAlign = "right";
    ctx.fillText("(thinking…)", ctx.canvas.width - LEFT, LINE_2_Y);
  }
  ctx.restore();
}
