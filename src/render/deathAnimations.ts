import { DEATH_ANIMATION_SECONDS, GRAVITY, TANK_HALF_WIDTH, TANK_HEIGHT } from "../sim/constants";
import type { DeathAnimation } from "../sim/types";
import { EXPLOSION_COLORS, HUSK_SHADE, PROJECTILE_COLOR, SMOKE_COLOR } from "./palette";

// Every Death Animation is drawn from its elapsed time alone. Any per-particle variation comes from
// `scatter`, which hashes the animation's own data, so it never touches the simulation's Rng.

const FIREBALL_MAX_RADIUS = 18; // px
const FIREBALL_GROW_FRACTION = 0.3; // of the Death Animation spent swelling to full size

const SPARK_COUNT = 28;
const SPARK_MIN_SPEED = 60; // px/s
const SPARK_MAX_SPEED = 170; // px/s
const SPARK_SPREAD = Math.PI * 0.8; // radians either side of straight up a spark may be thrown
const SPARK_SIZE = 2; // px square
const SPARK_FLASH_FRACTION = 0.1; // of the Death Animation spent showing the bright flash
const SPARK_FLASH_RADIUS = 7; // px

const DRIFT_MAX_SPEED = 40; // px/s a disintegrating pixel drifts at, at most
const DRIFT_RISE = 12; // px/s every disintegrating pixel also rises

const POP_FRACTION = 0.15; // of the Death Animation spent on the bang
const POP_MAX_RADIUS = 9; // px
const POP_RAYS = 8;
const SMOKE_PUFFS = 7;
const SMOKE_RISE = 45; // px/s
const SMOKE_SWAY = 6; // px either side a puff sways as it rises
const SMOKE_MIN_RADIUS = 3; // px
const SMOKE_MAX_RADIUS = 10; // px
const SMOKE_ALPHA = 0.7;

/** Draw a Death Animation of any kind; `color` is the destroyed Tank's Player's colour. */
export function drawDeathAnimation(
  ctx: CanvasRenderingContext2D,
  animation: DeathAnimation,
  color: string,
): void {
  const t = Math.min(1, animation.elapsed / DEATH_ANIMATION_SECONDS);
  ctx.save();
  switch (animation.kind) {
    case "fireball":
      drawFireball(ctx, animation, t);
      break;
    case "sparkShower":
      drawSparkShower(ctx, animation, t);
      break;
    case "disintegration":
      drawDisintegration(ctx, animation, t, color);
      break;
    case "popAndSmoke":
      drawPopAndSmoke(ctx, animation, t);
      break;
  }
  ctx.restore();
}

/**
 * A number in [0, 1) that is always the same for this animation, particle and salt: a hash of the
 * animation's own data (mulberry32's mixing step).
 */
function scatter(animation: DeathAnimation, particle: number, salt: number): number {
  let h = Math.imul(animation.playerId + 1, 0x9e3779b1);
  h ^= Math.imul(animation.x + 1, 0x85ebca6b);
  h ^= Math.imul(animation.y + 1, 0xc2b2ae35);
  h = (h + Math.imul(particle + 1, 0x27d4eb2f) + salt * 0x165667b1) >>> 0;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

/** The centre of the Tank the animation replaces. */
function middle(animation: DeathAnimation): { x: number; y: number } {
  return { x: animation.x + 0.5, y: animation.y - TANK_HEIGHT / 2 };
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
  ctx.fill();
}

/** A flickering ball that swells over its first part, then fades as it shrinks back. */
function drawFireball(ctx: CanvasRenderingContext2D, animation: DeathAnimation, t: number): void {
  const grow = Math.min(1, t / FIREBALL_GROW_FRACTION);
  const fade = t <= FIREBALL_GROW_FRACTION ? 1 : (1 - t) / (1 - FIREBALL_GROW_FRACTION);
  const radius = FIREBALL_MAX_RADIUS * grow * (0.5 + 0.5 * fade);
  const c = middle(animation);
  const flicker = Math.floor(animation.elapsed * 30);
  ctx.globalAlpha = fade;
  EXPLOSION_COLORS.forEach((_, ring) => {
    // Outer rings first; each ring's colour cycles so the ball flickers.
    ctx.fillStyle = EXPLOSION_COLORS[(ring + flicker) % EXPLOSION_COLORS.length] ?? "#ffffff";
    disc(ctx, c.x, c.y, radius * (1 - ring / EXPLOSION_COLORS.length));
  });
}

/** A brief flash, then sparks thrown up and out that fall under gravity and fade. */
function drawSparkShower(
  ctx: CanvasRenderingContext2D,
  animation: DeathAnimation,
  t: number,
): void {
  const c = middle(animation);
  const seconds = animation.elapsed;
  if (t < SPARK_FLASH_FRACTION) {
    ctx.globalAlpha = 1 - t / SPARK_FLASH_FRACTION;
    ctx.fillStyle = PROJECTILE_COLOR;
    disc(ctx, c.x, c.y, SPARK_FLASH_RADIUS);
  }
  ctx.globalAlpha = 1 - t;
  for (let i = 0; i < SPARK_COUNT; i++) {
    const angle = -Math.PI / 2 + (scatter(animation, i, 1) * 2 - 1) * SPARK_SPREAD;
    const speed = SPARK_MIN_SPEED + scatter(animation, i, 2) * (SPARK_MAX_SPEED - SPARK_MIN_SPEED);
    const x = c.x + Math.cos(angle) * speed * seconds;
    const y = c.y + Math.sin(angle) * speed * seconds + 0.5 * GRAVITY * seconds * seconds;
    const colorIndex = Math.floor(scatter(animation, i, 3) * EXPLOSION_COLORS.length);
    ctx.fillStyle = EXPLOSION_COLORS[colorIndex] ?? "#ffffff";
    ctx.fillRect(Math.round(x), Math.round(y), SPARK_SIZE, SPARK_SIZE);
  }
}

/** Offsets from (x, y) of every pixel of a Tank's body and dome, without its barrel. */
const TANK_PIXELS: readonly { dx: number; dy: number }[] = (() => {
  const pixels: { dx: number; dy: number }[] = [];
  const half = TANK_HEIGHT / 2;
  for (let dy = -TANK_HEIGHT; dy < 0; dy++) {
    for (let dx = -TANK_HALF_WIDTH; dx <= TANK_HALF_WIDTH; dx++) {
      const inBody = dy >= -half;
      const fromDome = Math.hypot(dx, dy + 0.5 + half);
      if (inBody || fromDome <= half) pixels.push({ dx, dy });
    }
  }
  return pixels;
})();

/** The darkened Tank's pixels drift apart, each its own way, and fade. */
function drawDisintegration(
  ctx: CanvasRenderingContext2D,
  animation: DeathAnimation,
  t: number,
  color: string,
): void {
  const seconds = animation.elapsed;
  ctx.globalAlpha = 1 - t;
  TANK_PIXELS.forEach(({ dx, dy }, i) => {
    const angle = scatter(animation, i, 4) * Math.PI * 2;
    const speed = scatter(animation, i, 5) * DRIFT_MAX_SPEED;
    // Each pixel lingers a moment before it drifts, so the Tank crumbles rather than bursts.
    const start = scatter(animation, i, 6) * 0.3 * DEATH_ANIMATION_SECONDS;
    const moving = Math.max(0, seconds - start);
    const x = Math.round(animation.x + dx + Math.cos(angle) * speed * moving);
    const y = Math.round(animation.y + dy + Math.sin(angle) * speed * moving - DRIFT_RISE * moving);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = HUSK_SHADE;
    ctx.fillRect(x, y, 1, 1);
  });
}

/** A small bang with rays, then a plume of grey puffs that rise, swell and fade. */
function drawPopAndSmoke(
  ctx: CanvasRenderingContext2D,
  animation: DeathAnimation,
  t: number,
): void {
  const c = middle(animation);
  if (t < POP_FRACTION) {
    const p = t / POP_FRACTION;
    const radius = POP_MAX_RADIUS * p;
    ctx.globalAlpha = 1 - p * 0.5;
    ctx.fillStyle = EXPLOSION_COLORS[0];
    disc(ctx, c.x, c.y, radius);
    ctx.strokeStyle = PROJECTILE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < POP_RAYS; i++) {
      const angle = (i / POP_RAYS) * Math.PI * 2;
      ctx.moveTo(c.x + Math.cos(angle) * radius, c.y + Math.sin(angle) * radius);
      ctx.lineTo(c.x + Math.cos(angle) * radius * 1.6, c.y + Math.sin(angle) * radius * 1.6);
    }
    ctx.stroke();
  }
  ctx.fillStyle = SMOKE_COLOR;
  const smokeSeconds = DEATH_ANIMATION_SECONDS * (1 - POP_FRACTION);
  for (let i = 0; i < SMOKE_PUFFS; i++) {
    // Puffs leave one after another once the bang is over, each living to the end.
    const start = POP_FRACTION * 0.5 + (i / SMOKE_PUFFS) * (1 - POP_FRACTION) * 0.6;
    if (t < start) continue;
    const age = ((t - start) * DEATH_ANIMATION_SECONDS) / smokeSeconds; // 0 → about 1
    const sway = Math.sin(age * Math.PI * 2 + scatter(animation, i, 7) * Math.PI * 2) * SMOKE_SWAY;
    const x = c.x + sway * age;
    const y = c.y - SMOKE_RISE * (t - start) * DEATH_ANIMATION_SECONDS;
    const radius = SMOKE_MIN_RADIUS + (SMOKE_MAX_RADIUS - SMOKE_MIN_RADIUS) * Math.min(1, age);
    ctx.globalAlpha = SMOKE_ALPHA * Math.max(0, 1 - t) * (0.6 + 0.4 * scatter(animation, i, 8));
    disc(ctx, x, y, radius);
  }
}
