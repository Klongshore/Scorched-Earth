import { BARREL_LENGTH, EXPLOSION_SECONDS, TANK_HALF_WIDTH, TANK_HEIGHT } from "../sim/constants";
import { barrelTip, isAlive } from "../sim/tank";
import type { Terrain } from "../sim/terrain";
import type { Explosion, Tank } from "../sim/types";
import type { Match } from "../sim/match";
import { drawHud } from "./hud";
import {
  DIRT_DEEP,
  DIRT_EXPLOSION_COLORS,
  DIRT_SURFACE,
  EXPLOSION_COLORS,
  HUD_TEXT,
  PROJECTILE_COLOR,
  SKY_BOTTOM,
  SKY_TOP,
} from "./palette";

const TURN_MARKER_GAP = 6;
const TURN_MARKER_SIZE = 4;
const TANK_HEALTH_FONT = "10px monospace";
const TANK_HEALTH_GAP = 2; // px from the tip of a barrel at 90° to the Health baseline

export class Renderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly terrainCanvas: HTMLCanvasElement;
  private readonly terrainContext: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly sky: CanvasGradient;
  private builtTerrain: Terrain | null = null;
  private builtVersion = -1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    this.terrainCanvas = document.createElement("canvas");
    this.terrainCanvas.width = canvas.width;
    this.terrainCanvas.height = canvas.height;
    const terrainContext = this.terrainCanvas.getContext("2d");
    if (!context || !terrainContext) throw new Error("2D canvas context is required");
    this.context = context;
    this.terrainContext = terrainContext;
    this.image = terrainContext.createImageData(canvas.width, canvas.height);
    this.sky = context.createLinearGradient(0, 0, 0, canvas.height);
    this.sky.addColorStop(0, SKY_TOP);
    this.sky.addColorStop(1, SKY_BOTTOM);
  }

  /** Draw only the sky, for when no Round is in play (Setup, or the Shop before Round 1). */
  drawBackdrop(): void {
    this.context.fillStyle = this.sky;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw the Match's current Round and the HUD, or only the backdrop before Round 1 starts.
   * Reads state only; never changes it.
   */
  draw(match: Match): void {
    const { round } = match;
    this.drawBackdrop();
    if (!round) return;
    const { terrain, tanks, phase } = round;
    if (this.builtTerrain !== terrain || this.builtVersion !== terrain.version) {
      this.rebuildTerrain(terrain);
    }
    this.context.drawImage(this.terrainCanvas, 0, 0);
    for (const tank of tanks) {
      if (!isAlive(tank)) continue;
      const { color } = round.playerOf(tank.playerId);
      this.drawTank(tank, color);
      this.drawTankHealth(tank, color);
    }
    if (phase.kind === "aiming") this.drawTurnMarker(round.currentTank());
    if (phase.kind === "resolving") {
      this.context.fillStyle = PROJECTILE_COLOR;
      for (const projectile of phase.projectiles) {
        this.context.fillRect(Math.floor(projectile.x) - 1, Math.floor(projectile.y) - 1, 2, 2);
      }
      for (const explosion of phase.explosions) this.drawExplosion(explosion);
    }
    drawHud(this.context, match);
  }

  /** A small triangle 6 px above the current Player's Tank while aiming. */
  private drawTurnMarker(tank: Tank): void {
    const ctx = this.context;
    const tipY = tank.y - TANK_HEIGHT - TURN_MARKER_GAP;
    const cx = tank.x + 0.5;
    ctx.fillStyle = HUD_TEXT;
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx - TURN_MARKER_SIZE, tipY - TURN_MARKER_SIZE);
    ctx.lineTo(cx + TURN_MARKER_SIZE, tipY - TURN_MARKER_SIZE);
    ctx.closePath();
    ctx.fill();
  }

  /** The Tank's Health, centred above it and high enough that a barrel at 90° never covers it. */
  private drawTankHealth(tank: Tank, color: string): void {
    const ctx = this.context;
    ctx.save();
    ctx.font = TANK_HEALTH_FONT;
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    const baseline = tank.y - TANK_HEIGHT - BARREL_LENGTH - TANK_HEALTH_GAP;
    ctx.fillText(String(tank.health), tank.x + 0.5, baseline);
    ctx.restore();
  }

  private drawExplosion(explosion: Explosion): void {
    const ctx = this.context;
    const grow = Math.min(1, explosion.elapsed / (EXPLOSION_SECONDS / 2));
    const colors = explosion.kind === "dirt" ? DIRT_EXPLOSION_COLORS : EXPLOSION_COLORS;
    ctx.fillStyle = colors[Math.floor(explosion.elapsed * 30) % colors.length] ?? "#ffffff";
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, explosion.radius * grow, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTank(tank: Tank, color: string): void {
    const ctx = this.context;
    const top = tank.y - TANK_HEIGHT;
    const half = TANK_HEIGHT / 2;
    ctx.fillStyle = color;
    ctx.fillRect(tank.x - TANK_HALF_WIDTH, top + half, TANK_HALF_WIDTH * 2 + 1, half);
    ctx.beginPath();
    ctx.arc(tank.x + 0.5, top + half, half, Math.PI, 0);
    ctx.fill();
    const tip = barrelTip(tank);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tank.x + 0.5, top);
    ctx.lineTo(tip.x + 0.5, tip.y);
    ctx.stroke();
  }

  private rebuildTerrain(terrain: Terrain): void {
    const { width, height, cells } = terrain;
    const data = this.image.data;
    for (let y = 0; y < height; y++) {
      const t = y / (height - 1);
      const r = DIRT_SURFACE[0] + (DIRT_DEEP[0] - DIRT_SURFACE[0]) * t;
      const g = DIRT_SURFACE[1] + (DIRT_DEEP[1] - DIRT_SURFACE[1]) * t;
      const b = DIRT_SURFACE[2] + (DIRT_DEEP[2] - DIRT_SURFACE[2]) * t;
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const o = i * 4;
        if (cells[i] === 1) {
          data[o] = r;
          data[o + 1] = g;
          data[o + 2] = b;
          data[o + 3] = 255;
        } else {
          data[o + 3] = 0;
        }
      }
    }
    this.terrainContext.putImageData(this.image, 0, 0);
    this.builtTerrain = terrain;
    this.builtVersion = terrain.version;
  }
}
