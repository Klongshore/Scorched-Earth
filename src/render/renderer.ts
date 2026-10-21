import { EXPLOSION_SECONDS, TANK_HALF_WIDTH, TANK_HEIGHT } from "../sim/constants";
import type { Match } from "../sim/match";
import { barrelTip, isAlive } from "../sim/tank";
import type { Terrain } from "../sim/terrain";
import type { Explosion, Tank } from "../sim/types";
import { drawHud } from "./hud";
import {
  DIRT_DEEP,
  DIRT_SURFACE,
  EXPLOSION_COLORS,
  PROJECTILE_COLOR,
  SKY_BOTTOM,
  SKY_TOP,
} from "./palette";

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

  /** Reads the Match and never changes it. The HUD is drawn only while a Round is being played. */
  draw(match: Match, showHud = true): void {
    const round = match.round;
    const terrain = round.terrain;
    this.context.fillStyle = this.sky;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.builtTerrain !== terrain || this.builtVersion !== terrain.version) {
      this.rebuildTerrain(terrain);
    }
    this.context.drawImage(this.terrainCanvas, 0, 0);
    const phase = round.phase;
    for (const tank of round.tanks) {
      if (!isAlive(tank)) continue;
      const color = match.players[tank.playerId]?.color ?? "#ffffff";
      this.drawTank(tank, color);
      if (phase.kind === "aiming" && tank.playerId === round.currentPlayerId) {
        this.drawMarker(tank, color);
      }
    }
    if (phase.kind === "flying") {
      const p = phase.projectile;
      this.context.fillStyle = PROJECTILE_COLOR;
      this.context.fillRect(Math.floor(p.x) - 1, Math.floor(p.y) - 1, 2, 2);
    } else if (phase.kind === "exploding") {
      this.drawExplosion(phase.explosion);
    }
    if (showHud) drawHud(this.context, match, this.canvas.width);
  }

  private drawExplosion(explosion: Explosion): void {
    const ctx = this.context;
    const radius = explosion.radius * Math.min(1, explosion.elapsed / (EXPLOSION_SECONDS / 2));
    ctx.fillStyle =
      EXPLOSION_COLORS[Math.floor(explosion.elapsed * 30) % EXPLOSION_COLORS.length] ?? "#ffffff";
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Small triangle above the Tank whose Turn it is. */
  private drawMarker(tank: Tank, color: string): void {
    const ctx = this.context;
    const y = tank.y - TANK_HEIGHT - 6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tank.x + 0.5 - 3, y - 5);
    ctx.lineTo(tank.x + 0.5 + 3, y - 5);
    ctx.lineTo(tank.x + 0.5, y);
    ctx.closePath();
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
