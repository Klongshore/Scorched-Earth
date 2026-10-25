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

/** The chosen Weapon as HUD line 1 shows it: its name and how many are left, if limited. */
export function weaponText(name: string, count: number): string {
  return Number.isFinite(count) ? `Weapon: ${name} ×${count}` : `Weapon: ${name}`;
}

/**
 * HUD line 1: the current Player's name, Angle, Power and chosen Weapon, only while they are
 * aiming, so a finished Turn or a finished Round never looks like a live Turn.
 */
export function aimLine(match: Match): Piece[] {
  const { round } = match;
  if (!round || round.phase.kind !== "aiming") return [];
  const player = round.playerOf(round.currentPlayerId);
  const tank = round.currentTank();
  const weapon = round.currentWeapon();
  const weaponCount = round.inventoryOf(player.id).count(weapon.name);
  return [
    [player.name, player.color],
    [
      `   Angle: ${tank.angle}   Power: ${tank.power}/${powerCap(tank)}   ${weaponText(weapon.name, weaponCount)}`,
      HUD_TEXT,
    ],
  ];
}

/**
 * The Wind and the Round, right-aligned on HUD line 2: line 1 has no room left for them at
 * 640 px once it shows the chosen Weapon.
 */
export function statusText(match: Match): string {
  const { round } = match;
  if (!round) return "";
  return `Wind: ${windText(round.wind)}   Round ${round.number}/${match.totalRounds}`;
}

export interface HealthLine {
  text: string;
  color: string;
  health: number;
  shield: number | null; // the current Tank's Shield Strength; null with no Shield raised
}

/**
 * HUD line 2: only the current Player's name, Health and Shield Strength, and only while they are
 * aiming.
 * Every Tank's Health is drawn above the Tank itself, so the HUD never lists every Player.
 */
export function healthLine(match: Match): HealthLine | null {
  const { round } = match;
  if (!round || round.phase.kind !== "aiming") return null;
  const player = round.playerOf(round.currentPlayerId);
  const { health, shield } = round.currentTank();
  return {
    text: `${player.name}: ${health}`,
    color: player.color,
    health,
    shield: shield?.strength ?? null,
  };
}

/** HUD line 2's text after the Health bar: the Shield Strength and the thinking marker. */
export function afterHealthBar(line: HealthLine, thinking: boolean): Piece[] {
  const after: Piece[] = [];
  if (line.shield !== null) after.push([`  Shield ${line.shield}`, line.color]);
  if (thinking) after.push(["  (thinking…)", HUD_TEXT]);
  return after;
}

/**
 * Where HUD line 2 is laid out on a canvas `width` px wide, measuring text with `measure`: the
 * right edge of the left-hand run (name, Health, Health bar, Shield, thinking marker) and the left
 * edge of the right-aligned Wind and Round. They fit while leftEnd < statusStart.
 */
export function line2Layout(
  line: HealthLine,
  thinking: boolean,
  status: string,
  width: number,
  measure: (text: string) => number,
): { leftEnd: number; statusStart: number } {
  const run = (pieces: readonly Piece[]) => pieces.reduce((w, [t]) => w + measure(t), 0);
  const barX = LEFT + measure(`${line.text} `);
  return {
    leftEnd: barX + BAR_WIDTH + run(afterHealthBar(line, thinking)),
    statusStart: width - LEFT - measure(status),
  };
}

export function drawHud(ctx: CanvasRenderingContext2D, match: Match): void {
  const { round } = match;
  if (!round) return;
  ctx.save();
  ctx.fillStyle = HUD_STRIP;
  ctx.fillRect(0, 0, ctx.canvas.width, STRIP_HEIGHT);
  ctx.font = FONT;

  drawRun(ctx, aimLine(match), LEFT, LINE_1_Y);

  const line2 = healthLine(match);
  if (line2) {
    const x = drawRun(ctx, [[`${line2.text} `, line2.color]], LEFT, LINE_2_Y);
    const barTop = LINE_2_Y - BAR_HEIGHT;
    ctx.fillStyle = HUD_BAR_BACKGROUND;
    ctx.fillRect(x, barTop, BAR_WIDTH, BAR_HEIGHT);
    ctx.fillStyle = line2.color;
    ctx.fillRect(x, barTop, Math.round((BAR_WIDTH * line2.health) / MAX_HEALTH), BAR_HEIGHT);
    // Line 1 has no room left at 640 px, so the Shield and thinking marker follow the Health bar.
    drawRun(ctx, afterHealthBar(line2, round.isComputerThinking), x + BAR_WIDTH, LINE_2_Y);
  }
  ctx.fillStyle = HUD_TEXT;
  ctx.textAlign = "right";
  ctx.fillText(statusText(match), ctx.canvas.width - LEFT, LINE_2_Y);
  ctx.restore();
}
