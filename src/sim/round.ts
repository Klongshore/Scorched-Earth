import {
  BABY_MISSILE,
  COMPUTER_THINK_SECONDS,
  EXPLOSION_SECONDS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  WIND_MAX,
} from "./constants";
import { detonate } from "./explosion";
import { placeTanks } from "./placement";
import { launch, stepProjectile } from "./projectile";
import type { Rng } from "./rng";
import { settleTick } from "./settling";
import { clampAim, isAlive } from "./tank";
import type { Terrain } from "./terrain";
import { generateHills } from "./terrainGen";
import type { Explosion, Player, Projectile, Tank } from "./types";

export type Phase =
  | { kind: "aiming"; thinkRemaining: number | null } // thinkRemaining is non-null only for Computer Players
  | { kind: "flying"; projectile: Projectile }
  | { kind: "exploding"; explosion: Explosion }
  | { kind: "settling" }
  | { kind: "over"; result: RoundResult };

export type RoundResult = { kind: "win"; playerId: number } | { kind: "draw" };

export type RoundAction =
  | { kind: "adjustAngle"; delta: number }
  | { kind: "adjustPower"; delta: number }
  | { kind: "fire" };

/** Stub Computer Player aim until the Moron Personality exists (Milestone 8). */
function chooseAim(): { angle: number; power: number } {
  return { angle: 90, power: 0 };
}

export class Round {
  readonly number: number; // 1-based
  readonly terrain: Terrain;
  readonly tanks: Tank[]; // indexed by playerId
  wind: number; // not readonly: tests set it to 0 for predictable shots
  readonly turnOrder: number[]; // playerIds, shuffled once per Round
  currentIndex: number; // index into turnOrder
  phase: Phase = { kind: "aiming", thinkRemaining: null };

  private readonly players: readonly Player[];
  private readonly rng: Rng;

  constructor(number: number, players: readonly Player[], rng: Rng) {
    this.number = number;
    this.players = players;
    this.rng = rng;
    const playerIds = players.map((p) => p.id);
    this.terrain = generateHills(rng, FIELD_WIDTH, FIELD_HEIGHT);
    this.tanks = placeTanks(rng, this.terrain, playerIds);
    this.wind = rng.int(-WIND_MAX, WIND_MAX);
    this.turnOrder = rng.shuffle(playerIds);
    this.currentIndex = 0;
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
    if (this.playerOf(this.currentPlayerId).kind !== "human") return;
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
        const p = phase.projectile;
        const outcome = stepProjectile(p, this.wind, this.terrain, this.tanks, dt);
        if (outcome.kind === "lost") {
          this.phase = { kind: "settling" };
        } else if (outcome.kind === "hit") {
          const explosion = detonate(outcome.x, outcome.y, p.weapon, this.terrain, this.tanks);
          this.phase = { kind: "exploding", explosion };
        }
        break;
      }
      case "exploding":
        phase.explosion.elapsed += dt;
        if (phase.explosion.elapsed >= EXPLOSION_SECONDS) this.phase = { kind: "settling" };
        break;
      case "settling":
        // The Turn only ends once all dirt and Tanks are at rest.
        if (!settleTick(this.terrain, this.tanks)) this.endTurn();
        break;
      case "over":
        break;
    }
  }

  private fire(): void {
    this.phase = { kind: "flying", projectile: launch(this.currentTank(), BABY_MISSILE) };
  }

  private endTurn(): void {
    const alive = this.tanks.filter(isAlive);
    const [survivor] = alive;
    if (!survivor) {
      this.phase = { kind: "over", result: { kind: "draw" } };
      return;
    }
    if (alive.length === 1) {
      this.phase = { kind: "over", result: { kind: "win", playerId: survivor.playerId } };
      return;
    }
    do {
      this.currentIndex = (this.currentIndex + 1) % this.turnOrder.length;
    } while (!isAlive(this.currentTank()));
    this.beginTurn();
  }

  private beginTurn(): void {
    const player = this.playerOf(this.currentPlayerId);
    if (player.kind === "computer") {
      const tank = this.currentTank();
      const aim = chooseAim();
      tank.angle = aim.angle;
      tank.power = aim.power;
      clampAim(tank);
      this.phase = { kind: "aiming", thinkRemaining: COMPUTER_THINK_SECONDS };
    } else {
      this.phase = { kind: "aiming", thinkRemaining: null };
    }
  }

  private tankOf(playerId: number): Tank {
    const tank = this.tanks.find((t) => t.playerId === playerId);
    if (!tank) throw new Error(`No Tank for player ${playerId}`);
    return tank;
  }

  private playerOf(playerId: number): Player {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error(`No player ${playerId}`);
    return player;
  }
}
