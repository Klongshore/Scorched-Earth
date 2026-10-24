import {
  BABY_MISSILE,
  COMPUTER_THINK_TICKS,
  EXPLOSION_SECONDS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  WIND_MAX,
} from "./constants";
import { detonate } from "./explosion";
import { moneyEarned } from "./money";
import { chooseAim, newComputerMemory, type ComputerMemory, type Landing } from "./personalities";
import { placeTanks } from "./placement";
import { launch, stepProjectile } from "./projectile";
import type { Rng } from "./rng";
import { settleTick } from "./settling";
import { clampAim, isAlive } from "./tank";
import type { Terrain } from "./terrain";
import { generateHills } from "./terrainGen";
import type { Explosion, Player, Projectile, Tank } from "./types";

export type Phase =
  | { kind: "aiming"; thinkTicks: number | null } // ticks left to think; non-null only for Computer Players
  | { kind: "flying"; projectile: Projectile }
  | { kind: "exploding"; explosion: Explosion }
  | { kind: "settling" }
  | { kind: "over"; result: RoundResult };

export type RoundResult = { kind: "win"; playerId: number } | { kind: "draw" };

export type RoundAction =
  | { kind: "adjustAngle"; delta: number }
  | { kind: "adjustPower"; delta: number }
  | { kind: "fire" };

export class Round {
  readonly number: number; // 1-based
  readonly terrain: Terrain;
  readonly tanks: Tank[]; // indexed by playerId
  wind: number; // not readonly: tests set it to 0 for predictable shots
  readonly turnOrder: number[]; // playerIds, shuffled once per Round
  currentIndex: number; // index into turnOrder
  phase: Phase = { kind: "aiming", thinkTicks: null };

  /** Money each Player has earned so far this Round, indexed by playerId. */
  readonly earnings: number[];

  private readonly players: readonly Player[];
  private readonly rng: Rng;
  /** One per Computer Player, keyed by playerId; fresh every Round. */
  private readonly memories = new Map<number, ComputerMemory>();

  constructor(number: number, players: readonly Player[], rng: Rng) {
    this.number = number;
    this.players = players;
    this.rng = rng;
    this.earnings = players.map(() => 0);
    for (const p of players) {
      if (p.kind === "computer") this.memories.set(p.id, newComputerMemory());
    }
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

  /** True while a Computer Player is "thinking": its aim is shown and the shot fires when the timer runs out. */
  get isComputerThinking(): boolean {
    return this.phase.kind === "aiming" && this.phase.thinkTicks !== null;
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
        if (phase.thinkTicks !== null) {
          phase.thinkTicks -= 1;
          if (phase.thinkTicks <= 0) this.fire();
        }
        break;
      case "flying": {
        const p = phase.projectile;
        const outcome = stepProjectile(p, this.wind, this.terrain, this.tanks, dt);
        if (outcome.kind === "lost") {
          this.recordLanding(p.firedBy, { kind: "lost", side: outcome.side });
          this.phase = { kind: "settling" };
        } else if (outcome.kind === "hit") {
          this.recordLanding(p.firedBy, { kind: "hit", x: outcome.x });
          const explosion = detonate(outcome.x, outcome.y, p.weapon, this.terrain, this.tanks);
          this.earn(p.firedBy, moneyEarned(explosion, p.firedBy));
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
      if (!player.personality) throw new Error(`Computer player ${player.id} has no Personality`);
      const aim = chooseAim(
        player.personality,
        tank,
        this.tanks,
        this.requireMemory(player.id),
        this.rng,
      );
      tank.angle = aim.angle;
      tank.power = aim.power;
      clampAim(tank);
      this.phase = { kind: "aiming", thinkTicks: COMPUTER_THINK_TICKS };
    } else {
      this.phase = { kind: "aiming", thinkTicks: null };
    }
  }

  /**
   * The playerId of a Computer Player's Target this Round; null before it picks one, while no
   * opponent is within its reach, or for a Human.
   */
  targetOf(playerId: number): number | null {
    return this.memories.get(playerId)?.targetId ?? null;
  }

  /** What a Computer Player remembers this Round; null for a Human. */
  memoryOf(playerId: number): Readonly<ComputerMemory> | null {
    return this.memories.get(playerId) ?? null;
  }

  private earn(playerId: number, money: number): void {
    this.earnings[playerId] = (this.earnings[playerId] ?? 0) + money;
  }

  /** Remember where a Computer Player's Projectile ended up; a Human's is not recorded. */
  private recordLanding(playerId: number, landing: Landing): void {
    const memory = this.memories.get(playerId);
    if (memory) memory.lastLanding = landing;
  }

  private requireMemory(playerId: number): ComputerMemory {
    const memory = this.memories.get(playerId);
    if (!memory) throw new Error(`No memory for Computer player ${playerId}`);
    return memory;
  }

  tankOf(playerId: number): Tank {
    const tank = this.tanks.find((t) => t.playerId === playerId);
    if (!tank) throw new Error(`No Tank for player ${playerId}`);
    return tank;
  }

  playerOf(playerId: number): Player {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error(`No player ${playerId}`);
    return player;
  }
}
