import {
  BABY_MISSILE,
  COMPUTER_THINK_TICKS,
  EXPLOSION_SECONDS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  FUNKY_BOMBLET_WEAPON,
  FUNKY_MAX_ANGLE,
  FUNKY_MAX_BOMBLETS,
  FUNKY_MAX_SPEED,
  FUNKY_MIN_ANGLE,
  FUNKY_MIN_BOMBLETS,
  FUNKY_MIN_SPEED,
  MIRV_PIECES,
  MIRV_PIECE_WEAPON,
  MIRV_SPREAD,
  WIND_MAX,
  weaponNamed,
} from "./constants";
import { detonate } from "./explosion";
import { emptyLoadout, inventoryIn, type Inventory, type Loadout } from "./inventory";
import { moneyEarned } from "./money";
import {
  chooseAim,
  chooseWeapon,
  newComputerMemory,
  type ComputerMemory,
  type Landing,
} from "./personalities";
import { placeTanks } from "./placement";
import { launch, stepProjectile } from "./projectile";
import { startRolling, stepRolling } from "./roller";
import type { Rng } from "./rng";
import { settleTick } from "./settling";
import { clampAim, hitTest, isAlive } from "./tank";
import type { Terrain } from "./terrain";
import { generateHills } from "./terrainGen";
import type { Explosion, Player, Projectile, Tank, Weapon, WeaponName } from "./types";

export type Phase =
  | { kind: "aiming"; thinkTicks: number | null } // ticks left to think; non-null only for Computer Players
  // Everything in the air: Projectiles still flying and Explosions still showing.
  | { kind: "resolving"; projectiles: Projectile[]; explosions: Explosion[] }
  | { kind: "settling" }
  | { kind: "over"; result: RoundResult };

export type RoundResult = { kind: "win"; playerId: number } | { kind: "draw" };

export type RoundAction =
  | { kind: "adjustAngle"; delta: number }
  | { kind: "adjustPower"; delta: number }
  | { kind: "cycleWeapon"; delta: 1 | -1 } // step through the Weapons the Player owns
  | { kind: "fire" };

export class Round {
  readonly number: number; // 1-based
  readonly terrain: Terrain;
  readonly tanks: Tank[]; // indexed by playerId
  wind: number; // not readonly: tests set it to 0 for predictable flights
  readonly turnOrder: number[]; // playerIds, shuffled once per Round
  currentIndex: number; // index into turnOrder
  phase: Phase = { kind: "aiming", thinkTicks: null };

  /** Money each Player has earned so far this Round, indexed by playerId. */
  readonly earnings: number[];

  private readonly players: readonly Player[];
  private readonly rng: Rng;
  private readonly loadout: Loadout;
  /** One per Computer Player, keyed by playerId; fresh every Round. */
  private readonly memories = new Map<number, ComputerMemory>();
  /**
   * The Projectile whose first landing the firer remembers: the one launched from the barrel, or
   * a split MIRV's middle piece. Null once it has landed or been lost.
   */
  private barrelProjectile: Projectile | null = null;

  constructor(
    number: number,
    players: readonly Player[],
    rng: Rng,
    loadout: Loadout = emptyLoadout(players),
  ) {
    this.number = number;
    this.players = players;
    this.rng = rng;
    this.loadout = loadout;
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

  /** True while a Computer Player is "thinking": its aim is shown and it fires when the timer runs out. */
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
      case "cycleWeapon":
        this.cycleWeapon(action.delta);
        break;
      case "fire":
        this.fire();
        break;
    }
  }

  /** The Weapon the current Player will fire. */
  currentWeapon(): Weapon {
    return weaponNamed(this.chosenWeaponOf(this.currentPlayerId));
  }

  /** The Inventory of a Player, kept by the Match for the whole Match. */
  inventoryOf(playerId: number): Inventory {
    return inventoryIn(this.loadout, playerId);
  }

  private chosenWeaponOf(playerId: number): WeaponName {
    return this.loadout.chosenWeapons[playerId] ?? BABY_MISSILE.name;
  }

  /** Step through the current Player's owned Weapons, wrapping round at either end. */
  private cycleWeapon(delta: 1 | -1): void {
    const playerId = this.currentPlayerId;
    const owned = this.inventoryOf(playerId).owned();
    const index = owned.findIndex((w) => w.name === this.chosenWeaponOf(playerId));
    const next = owned[(index + delta + owned.length) % owned.length];
    if (next) this.loadout.chosenWeapons[playerId] = next.name;
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
      case "resolving":
        this.resolveTick(phase.projectiles, phase.explosions, dt);
        if (phase.projectiles.length === 0 && phase.explosions.length === 0) {
          this.phase = { kind: "settling" };
        }
        break;
      case "settling":
        // The Turn only ends once all dirt and Tanks are at rest.
        if (!settleTick(this.terrain, this.tanks)) this.endTurn();
        break;
      case "over":
        break;
    }
  }

  /** Launch the chosen Weapon, using one up (the Baby Missile is never used up). */
  private fire(): void {
    const weapon = this.currentWeapon();
    this.inventoryOf(this.currentPlayerId).useOne(weapon.name);
    const projectile = launch(this.currentTank(), weapon);
    this.barrelProjectile = projectile;
    this.phase = { kind: "resolving", projectiles: [projectile], explosions: [] };
  }

  /**
   * One tick of everything in the air. Explosions already showing age first, so one born this
   * tick starts at elapsed 0; then every Projectile steps. A MIRV that starts falling splits into
   * its pieces; each Projectile that lands becomes an Explosion, and a Funky Bomb's also throws
   * its bomblets. New Projectiles first step on the next tick. Both lists are edited in place.
   */
  private resolveTick(projectiles: Projectile[], explosions: Explosion[], dt: number): void {
    for (const explosion of explosions) explosion.elapsed += dt;
    keepWhere(explosions, (e) => e.elapsed < EXPLOSION_SECONDS);

    const flying = projectiles.splice(0);
    for (const p of flying) {
      if (p.rolling) {
        // A rolling Roller already had its landing recorded where it first touched down.
        const roll = stepRolling(p, this.terrain, this.tanks, dt);
        if (roll.kind === "rolling") projectiles.push(p);
        else if (roll.kind === "explode") explosions.push(this.explode(p, roll.x, roll.y));
        continue;
      }
      const outcome = stepProjectile(p, this.wind, this.terrain, this.tanks, dt);
      if (outcome.kind === "flying") {
        if (p.weapon.kind === "mirv" && p.vy >= 0) projectiles.push(...this.splitMirv(p));
        else projectiles.push(p);
      } else if (outcome.kind === "lost") {
        this.landed(p, { kind: "lost", side: outcome.side });
      } else {
        this.landed(p, { kind: "hit", x: outcome.x });
        const onTank = this.tanks.some((t) => hitTest(t, outcome.x, outcome.y));
        if (p.weapon.kind === "roller" && !onTank) {
          startRolling(p, outcome.x, outcome.y, this.terrain);
          projectiles.push(p);
        } else {
          // A MIRV that lands before it splits explodes as one of its pieces.
          const weapon = p.weapon.kind === "mirv" ? weaponNamed(MIRV_PIECE_WEAPON) : p.weapon;
          explosions.push(this.explode(p, outcome.x, outcome.y, weapon));
          if (weapon.kind === "funky")
            projectiles.push(...this.funkyBomblets(p, outcome.x, outcome.y));
        }
      }
    }
  }

  /** A MIRV's pieces: same place and vertical speed, sideways speed spread evenly around its own. */
  private splitMirv(mirv: Projectile): Projectile[] {
    const weapon = weaponNamed(MIRV_PIECE_WEAPON);
    const middle = (MIRV_PIECES - 1) / 2;
    const pieces = Array.from({ length: MIRV_PIECES }, (_, i) => ({
      x: mirv.x,
      y: mirv.y,
      vx: mirv.vx + (i - middle) * MIRV_SPREAD,
      vy: mirv.vy,
      weapon,
      firedBy: mirv.firedBy,
    }));
    // The MIRV itself never lands, so the firer remembers its middle piece instead.
    if (this.barrelProjectile === mirv) this.barrelProjectile = pieces[Math.floor(middle)] ?? null;
    return pieces;
  }

  /** A Funky Bomb's bomblets, thrown from the centre of its crater at random Angles and speeds. */
  private funkyBomblets(funky: Projectile, x: number, y: number): Projectile[] {
    const weapon = weaponNamed(FUNKY_BOMBLET_WEAPON);
    const count = this.rng.int(FUNKY_MIN_BOMBLETS, FUNKY_MAX_BOMBLETS);
    return Array.from({ length: count }, () => {
      const radians = (this.rng.range(FUNKY_MIN_ANGLE, FUNKY_MAX_ANGLE) * Math.PI) / 180;
      const speed = this.rng.range(FUNKY_MIN_SPEED, FUNKY_MAX_SPEED);
      return {
        x,
        y,
        vx: speed * Math.cos(radians),
        vy: -speed * Math.sin(radians), // y points down
        weapon,
        firedBy: funky.firedBy,
      };
    });
  }

  /** A Projectile has landed or been lost; the firer remembers it only if it came from the barrel. */
  private landed(p: Projectile, landing: Landing): void {
    if (p !== this.barrelProjectile) return;
    this.barrelProjectile = null;
    this.recordLanding(p.firedBy, landing);
  }

  /** Detonate a Weapon (the Projectile's own by default) at (x, y), crediting its firer's earnings. */
  private explode(p: Projectile, x: number, y: number, weapon: Weapon = p.weapon): Explosion {
    const explosion = detonate(x, y, weapon, this.terrain, this.tanks);
    this.earn(p.firedBy, moneyEarned(explosion, p.firedBy));
    return explosion;
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
    // Each Turn starts on the last Weapon chosen, or the Baby Missile once none of it is left.
    if (this.inventoryOf(player.id).count(this.chosenWeaponOf(player.id)) <= 0) {
      this.loadout.chosenWeapons[player.id] = BABY_MISSILE.name;
    }
    if (player.kind === "computer") {
      const tank = this.currentTank();
      if (!player.personality) throw new Error(`Computer player ${player.id} has no Personality`);
      const memory = this.requireMemory(player.id);
      const aim = chooseAim(player.personality, tank, this.tanks, memory, this.rng);
      // After the aim, so the aim's draws keep their order.
      const target = this.tanks.find((t) => t.playerId === memory.targetId) ?? null;
      this.loadout.chosenWeapons[player.id] = chooseWeapon(
        player.personality,
        tank,
        target,
        this.inventoryOf(player.id),
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

/** Remove, in place, every item that fails the test, keeping the rest in order. */
function keepWhere<T>(items: T[], keep: (item: T) => boolean): void {
  let kept = 0;
  for (const item of items) if (keep(item)) items[kept++] = item;
  items.length = kept;
}
