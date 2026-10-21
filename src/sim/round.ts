import {
  BABY_MISSILE,
  COMPUTER_THINK_SECONDS,
  EXPLOSION_SECONDS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  SETTLE_PASSES_PER_TICK,
  TANK_FALL_PIXELS_PER_TICK,
  WIND_MAX,
} from "./constants";
import { detonate } from "./explosion";
import { chooseAim } from "./personalities";
import { placeTanks } from "./placement";
import { launch, stepProjectile } from "./projectile";
import type { Rng } from "./rng";
import { clampAim, isAlive, isSupported } from "./tank";
import type { Terrain } from "./terrain";
import { generateHills } from "./terrainGen";
import type { Explosion, Player, Projectile, Tank } from "./types";

export type RoundResult = { kind: "win"; playerId: number } | { kind: "draw" };

export type Phase =
  | { kind: "aiming"; thinkRemaining: number | null } // thinkRemaining is non-null only for Computer Players
  | { kind: "flying"; projectile: Projectile }
  | { kind: "exploding"; explosion: Explosion }
  | { kind: "settling" }
  | { kind: "over"; result: RoundResult };

export type RoundAction =
  | { kind: "adjustAngle"; delta: number }
  | { kind: "adjustPower"; delta: number }
  | { kind: "fire" };

export class Round {
  readonly number: number; // 1-based
  readonly terrain: Terrain;
  readonly tanks: Tank[];
  wind: number; // not readonly: tests set it to 0 for predictable shots
  readonly turnOrder: number[]; // playerIds, shuffled once per Round
  currentIndex = 0; // index into turnOrder
  phase: Phase = { kind: "aiming", thinkRemaining: null };

  constructor(
    number: number,
    private readonly players: readonly Player[],
    private readonly rng: Rng,
  ) {
    this.number = number;
    this.terrain = generateHills(rng, FIELD_WIDTH, FIELD_HEIGHT);
    const playerIds = players.map((p) => p.id);
    this.tanks = placeTanks(rng, this.terrain, playerIds);
    this.wind = rng.int(-WIND_MAX, WIND_MAX);
    this.turnOrder = rng.shuffle(playerIds);
    this.beginTurn();
  }

  get currentPlayerId(): number {
    return this.turnOrder[this.currentIndex] as number;
  }

  currentTank(): Tank {
    return this.tankOf(this.currentPlayerId);
  }

  /** Apply a human action. Ignored unless phase is "aiming" and the current Player is human. */
  act(action: RoundAction): void {
    if (this.phase.kind !== "aiming") return;
    if (this.players[this.currentPlayerId]?.kind !== "human") return;
    const tank = this.currentTank();
    switch (action.kind) {
      case "adjustAngle":
        tank.angle += action.delta;
        clampAim(tank);
        break;
      case "adjustPower":
        tank.power += action.delta;
        clampAim(tank);
        break;
      case "fire":
        this.fire();
        break;
    }
  }

  /** Advance the simulation by one tick. */
  tick(dt: number): void {
    const phase = this.phase;
    switch (phase.kind) {
      case "aiming":
        if (phase.thinkRemaining !== null) {
          phase.thinkRemaining -= dt;
          if (phase.thinkRemaining <= 0) this.fire();
        }
        break;
      case "flying": {
        const outcome = stepProjectile(phase.projectile, this.wind, this.terrain, this.tanks, dt);
        if (outcome.kind === "lost") {
          this.phase = { kind: "settling" };
        } else if (outcome.kind === "hit") {
          const explosion = detonate(
            outcome.x,
            outcome.y,
            phase.projectile.weapon,
            this.terrain,
            this.tanks,
          );
          this.phase = { kind: "exploding", explosion };
        }
        break;
      }
      case "exploding":
        phase.explosion.elapsed += dt;
        if (phase.explosion.elapsed >= EXPLOSION_SECONDS) this.phase = { kind: "settling" };
        break;
      case "settling":
        this.settle();
        break;
      case "over":
        break;
    }
  }

  private fire(): void {
    this.phase = { kind: "flying", projectile: launch(this.currentTank(), BABY_MISSILE) };
  }

  private settle(): void {
    let moved = false;
    for (let i = 0; i < SETTLE_PASSES_PER_TICK; i++) {
      if (this.terrain.settlePass()) moved = true;
    }
    for (const tank of this.tanks) {
      if (!isAlive(tank)) continue;
      for (let i = 0; i < TANK_FALL_PIXELS_PER_TICK && !isSupported(tank, this.terrain); i++) {
        tank.y++;
        moved = true;
        if (tank.y >= FIELD_HEIGHT) {
          tank.health = 0; // fell off the bottom of the field; no other fall damage
          break;
        }
      }
    }
    if (!moved) this.endTurn();
  }

  private endTurn(): void {
    const alive = this.tanks.filter(isAlive);
    if (alive.length === 0) {
      this.phase = { kind: "over", result: { kind: "draw" } };
      return;
    }
    if (alive.length === 1) {
      this.phase = { kind: "over", result: { kind: "win", playerId: (alive[0] as Tank).playerId } };
      return;
    }
    do {
      this.currentIndex = (this.currentIndex + 1) % this.turnOrder.length;
    } while (!isAlive(this.currentTank()));
    this.beginTurn();
  }

  private beginTurn(): void {
    const player = this.players[this.currentPlayerId];
    const tank = this.currentTank();
    if (player?.kind === "computer" && player.personality !== null) {
      const aim = chooseAim(player.personality, tank, this.rng);
      tank.angle = aim.angle;
      tank.power = aim.power;
      clampAim(tank);
      this.phase = { kind: "aiming", thinkRemaining: COMPUTER_THINK_SECONDS };
    } else {
      this.phase = { kind: "aiming", thinkRemaining: null };
    }
  }

  private tankOf(playerId: number): Tank {
    return this.tanks.find((t) => t.playerId === playerId) as Tank;
  }
}
