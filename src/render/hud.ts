import { powerCap } from "../sim/tank";
import type { Match } from "../sim/match";
import { HUD_TEXT } from "./palette";

const STRIP_HEIGHT = 36;
const HEALTH_BAR_WIDTH = 50;

interface Segment {
  text: string;
  color: string;
}

function drawSegments(ctx: CanvasRenderingContext2D, segments: Segment[], y: number): number {
  let x = 6;
  for (const segment of segments) {
    ctx.fillStyle = segment.color;
    ctx.fillText(segment.text, x, y);
    x += ctx.measureText(segment.text).width;
  }
  return x;
}

export function drawHud(ctx: CanvasRenderingContext2D, match: Match, width: number): void {
  const round = match.round;
  const player = match.players[round.currentPlayerId];
  const tank = round.currentTank();
  if (!player) return;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, width, STRIP_HEIGHT);
  ctx.font = "14px monospace";
  ctx.textBaseline = "alphabetic";

  const arrow = round.wind > 0 ? "→" : round.wind < 0 ? "←" : "";
  const thinking = round.phase.kind === "aiming" && round.phase.thinkRemaining !== null;
  const line1: Segment[] = [
    { text: player.name, color: player.color },
    {
      text: `   Angle: ${tank.angle}   Power: ${tank.power}/${powerCap(tank)}   Wind: ${arrow}${Math.abs(round.wind)}   Round ${round.number}/${match.totalRounds}`,
      color: HUD_TEXT,
    },
  ];
  if (thinking) line1.push({ text: "   (thinking…)", color: HUD_TEXT });
  drawSegments(ctx, line1, 14);

  let x = 6;
  for (const p of match.players) {
    const health = round.tanks.find((t) => t.playerId === p.id)?.health ?? 0;
    const label = `${p.name}: ${health}`;
    ctx.fillStyle = p.color;
    ctx.fillText(label, x, 30);
    x += ctx.measureText(label).width + 6;
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(x, 22, HEALTH_BAR_WIDTH, 8);
    ctx.fillStyle = p.color;
    ctx.fillRect(x, 22, (HEALTH_BAR_WIDTH * health) / 100, 8);
    x += HEALTH_BAR_WIDTH + 20;
  }
  ctx.restore();
}
