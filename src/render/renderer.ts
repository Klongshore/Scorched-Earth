import {
  BARREL_LENGTH,
  DEATH_ANIMATION_SECONDS,
  EXPLOSION_SECONDS,
  shieldNamed,
  TANK_HALF_WIDTH,
  TANK_HEIGHT,
} from "../sim/constants";
import { centre, barrelTip, isAlive, isSupported } from "../sim/tank";
import type { Terrain } from "../sim/terrain";
import type { DeathAnimation, Explosion, Tank } from "../sim/types";
import type { Match } from "../sim/match";
import { drawHud } from "./hud";
import {
  DIRT_DEEP,
  DIRT_EXPLOSION_COLORS,
  DIRT_SURFACE,
  EXPLOSION_COLORS,
  HUD_TEXT,
  HUSK_SHADE,
  PROJECTILE_COLOR,
  SKY_BOTTOM,
  SKY_TOP,
} from "./palette";

const TURN_MARKER_GAP = 6;
const TURN_MARKER_SIZE = 4;
const TANK_HEALTH_FONT = "10px monospace";
const TANK_HEALTH_GAP = 2; // px from the tip of a barrel at 90° to the Health baseline
const SHIELD_RADIUS = 14; // px from the Tank centre to the Shield bubble
const SHIELD_LINE_WIDTH = 1;
const SHIELD_MAX_ALPHA = 1; // a Shield at its full Shield Strength
const SHIELD_MIN_ALPHA = 0.2; // a Shield about to be gone, still visible
const CANOPY_RADIUS = 5; // the Parachute canopy is a half-disc 10 px across
const CANOPY_CLEARANCE = 3; // px from the tip of a barrel at 90° to the canopy's flat edge
const CANOPY_LINE_SPREAD = 2; // px either side of the Tank's centre where the lines meet its top
const CANOPY_LINE_WIDTH = 1;
const FIREBALL_MAX_RADIUS = 18; // px
const FIREBALL_GROW_FRACTION = 0.3; // of the Death Animation spent swelling to full size

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
      const { color } = round.playerOf(tank.playerId);
      if (round.isHusk(tank.playerId)) {
        this.drawHusk(tank, color);
        continue;
      }
      if (!isAlive(tank)) continue;
      this.drawTank(tank, color);
      this.drawShield(tank, color);
      // The canopy sits where the Health is drawn, so it hides the Health while it is open.
      if (tank.parachute && !isSupported(tank, terrain)) this.drawCanopy(tank, color);
      else this.drawTankHealth(tank, color);
    }
    if (phase.kind === "aiming") this.drawTurnMarker(round.currentTank());
    if (phase.kind === "resolving") {
      this.context.fillStyle = PROJECTILE_COLOR;
      for (const projectile of phase.projectiles) {
        this.context.fillRect(Math.floor(projectile.x) - 1, Math.floor(projectile.y) - 1, 2, 2);
      }
      for (const explosion of phase.explosions) this.drawExplosion(explosion);
    }
    if (phase.kind === "dying") {
      for (const animation of phase.animations) this.drawFireball(animation);
    }
    drawHud(this.context, match);
  }

  /** A destroyed Tank waiting for its Death Animation: the Tank, darkened, with no Health. */
  private drawHusk(tank: Tank, color: string): void {
    this.drawTank(tank, color);
    this.drawTank(tank, HUSK_SHADE);
  }

  /**
   * The fireball Death Animation, from its elapsed time alone: a flickering ball that swells over
   * its first part, then fades as it shrinks back.
   */
  private drawFireball(animation: DeathAnimation): void {
    const ctx = this.context;
    const t = Math.min(1, animation.elapsed / DEATH_ANIMATION_SECONDS);
    const grow = Math.min(1, t / FIREBALL_GROW_FRACTION);
    const fade = t <= FIREBALL_GROW_FRACTION ? 1 : (1 - t) / (1 - FIREBALL_GROW_FRACTION);
    const radius = FIREBALL_MAX_RADIUS * grow * (0.5 + 0.5 * fade);
    const cx = animation.x + 0.5;
    const cy = animation.y - TANK_HEIGHT / 2;
    const flicker = Math.floor(animation.elapsed * 30);
    ctx.save();
    ctx.globalAlpha = fade;
    EXPLOSION_COLORS.forEach((_, ring) => {
      // Outer rings first; each ring's colour cycles so the ball flickers.
      const color = EXPLOSION_COLORS[(ring + flicker) % EXPLOSION_COLORS.length] ?? "#ffffff";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (1 - ring / EXPLOSION_COLORS.length), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
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

  /** A circle round a shielded Tank in its Player's colour, fading as its Shield Strength drops. */
  private drawShield(tank: Tank, color: string): void {
    const { shield } = tank;
    if (!shield) return;
    const left = Math.min(1, Math.max(0, shield.strength / shieldNamed(shield.name).strength));
    const ctx = this.context;
    const c = centre(tank);
    ctx.save();
    ctx.globalAlpha = SHIELD_MIN_ALPHA + (SHIELD_MAX_ALPHA - SHIELD_MIN_ALPHA) * left;
    ctx.strokeStyle = color;
    ctx.lineWidth = SHIELD_LINE_WIDTH;
    ctx.beginPath();
    ctx.arc(c.x + 0.5, c.y, SHIELD_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** An open Parachute: a half-disc above the Tank, with a line down to each side of the Tank's top. */
  private drawCanopy(tank: Tank, color: string): void {
    const ctx = this.context;
    const cx = tank.x + 0.5;
    const topY = tank.y - TANK_HEIGHT;
    const edgeY = topY - BARREL_LENGTH - CANOPY_CLEARANCE;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, edgeY, CANOPY_RADIUS, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = CANOPY_LINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(cx - CANOPY_RADIUS, edgeY);
    ctx.lineTo(cx - CANOPY_LINE_SPREAD, topY);
    ctx.moveTo(cx + CANOPY_RADIUS, edgeY);
    ctx.lineTo(cx + CANOPY_LINE_SPREAD, topY);
    ctx.stroke();
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
