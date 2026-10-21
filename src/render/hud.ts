import { MAX_HEALTH } from "../sim/constants";
import type { Round } from "../sim/round";
import { powerCap } from "../sim/tank";
import type { Player } from "../sim/types";
import { HUD_BAR_BACKGROUND, HUD_STRIP, HUD_TEXT } from "./palette";

/** What the renderer and HUD read about the Match being played. A Match satisfies it. */
export interface MatchView {
  readonly players: readonly Player[];
  readonly totalRounds: number;
  readonly round: Round;
}

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

function aimLine(match: MatchView): Piece[] {
  const { round, players } = match;
  const player = players[round.currentPlayerId];
  const tank = round.currentTank();
  const thinking =
    round.phase.kind === "aiming" && round.phase.thinkRemaining !== null ? "   (thinking…)" : "";
  return [
    [player?.name ?? "?", player?.color ?? HUD_TEXT],
    [
      `   Angle: ${tank.angle}   Power: ${tank.power}/${powerCap(tank)}` +
        `   Wind: ${windText(round.wind)}   Round ${round.number}/${match.totalRounds}${thinking}`,
      HUD_TEXT,
    ],
  ];
}

/** Until the Round results screen exists, line 1 announces the result once the Round is over. */
function resultLine(match: MatchView): Piece[] | null {
  const { round, players } = match;
  if (round.phase.kind !== "over") return null;
  const result = round.phase.result;
  if (result.kind === "draw") return [[`Round ${round.number} is a draw   (Enter)`, HUD_TEXT]];
  const winner = players[result.playerId];
  return [
    [winner?.name ?? "?", winner?.color ?? HUD_TEXT],
    [` wins Round ${round.number}!   (Enter)`, HUD_TEXT],
  ];
}

export function drawHud(ctx: CanvasRenderingContext2D, match: MatchView): void {
  const { round, players } = match;
  ctx.save();
  ctx.fillStyle = HUD_STRIP;
  ctx.fillRect(0, 0, ctx.canvas.width, STRIP_HEIGHT);
  ctx.font = FONT;

  drawRun(ctx, resultLine(match) ?? aimLine(match), LEFT, LINE_1_Y);

  let x = LEFT;
  for (const player of players) {
    const health = round.tanks.find((t) => t.playerId === player.id)?.health ?? 0;
    x = drawRun(ctx, [[`${player.name}: ${health} `, player.color]], x, LINE_2_Y);
    const barTop = LINE_2_Y - BAR_HEIGHT;
    ctx.fillStyle = HUD_BAR_BACKGROUND;
    ctx.fillRect(x, barTop, BAR_WIDTH, BAR_HEIGHT);
    ctx.fillStyle = player.color;
    ctx.fillRect(x, barTop, Math.round((BAR_WIDTH * health) / MAX_HEALTH), BAR_HEIGHT);
    x += BAR_WIDTH + PLAYER_GAP;
  }
  ctx.restore();
}
