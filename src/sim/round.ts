import {
  BABY_MISSILE,
  COMPUTER_THINK_TICKS,
  DEATH_ANIMATION_SECONDS,
  EPITAPH_SECONDS,
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
  TAUNT_SECONDS,
  WIND_MAX,
  weaponNamed,
} from "./constants";
import { detonate } from "./explosion";
import { emptyLoadout, inventoryIn, type Inventory, type Loadout } from "./inventory";
import { pickEpitaph } from "./lines";
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
import { Rng } from "./rng";
import { landTanks, settleTick } from "./settling";
import { raiseShield } from "./shield";
import { clampAim, hitTest, isAlive } from "./tank";
import type { Terrain } from "./terrain";
import { generateHills } from "./terrainGen";
import type {
  DeathAnimation,
  Explosion,
  HealthLoss,
  Line,
  LineKind,
  Player,
  Projectile,
  Tank,
  Weapon,
  WeaponName,
} from "./types";

/** How long each kind of line stays on screen, in seconds. */
const LINE_SECONDS: Readonly<Record<LineKind, number>> = {
  epitaph: EPITAPH_SECONDS,
  taunt: TAUNT_SECONDS,
};

export type Phase =
  | { kind: "aiming"; thinkTicks: number | null } // ticks left to think; non-null only for Computer Players
  // Everything in the air: Projectiles still flying and Explosions still showing.
  | { kind: "resolving"; projectiles: Projectile[]; explosions: Explosion[] }
  | { kind: "settling" }
  // Every Tank destroyed this Turn plays its Death Animation together; the Turn ends once all finish.
  | { kind: "dying"; animations: DeathAnimation[] }
  | { kind: "over"; result: RoundResult };

export type RoundResult = { kind: "win"; playerId: number } | { kind: "draw" };

export type RoundAction =
  | { kind: "adjustAngle"; delta: number }
  | { kind: "adjustPower"; delta: number }
  | { kind: "cycleWeapon"; delta: 1 | -1 } // step through the Weapons the Player owns
  | { kind: "raiseShield" } // replace the raised Shield with the strongest owned one
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
  /**
   * Randomness for cosmetic choices only (ADR 0003); nothing that can affect the outcome draws
   * from it.
   */
  readonly flavourRng: Rng;
  private readonly loadout: Loadout;
  /** One per Computer Player, keyed by playerId; fresh every Round. */
  private readonly memories = new Map<number, ComputerMemory>();
  /**
   * The Projectile whose first landing the firer remembers: the one launched from the barrel, or
   * a split MIRV's middle piece. Null once it has landed or been lost.
   */
  private barrelProjectile: Projectile | null = null;
  /**
   * Every Tank's Health, indexed like `tanks`, as Settling began: after every Explosion was over.
   * Null outside Settling.
   */
  private healthBeforeSettling: number[] | null = null;
  /** playerIds of destroyed Tanks whose Death Animation has started: gone from the field. */
  private readonly gone = new Set<number>();
  /** Every line on screen, oldest first. */
  private readonly shownLines: Line[] = [];

  constructor(
    number: number,
    players: readonly Player[],
    rng: Rng,
    loadout: Loadout = emptyLoadout(players),
    flavourRng: Rng = new Rng(0),
  ) {
    this.number = number;
    this.players = players;
    this.rng = rng;
    this.flavourRng = flavourRng;
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
    // Every owner's strongest Shield goes up before the first Turn, in Player order.
    for (const p of players) raiseShield(this.tankOf(p.id), this.inventoryOf(p.id));
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
      case "raiseShield":
        // Stays aiming: the Turn goes on with the same Player.
        raiseShield(tank, this.inventoryOf(this.currentPlayerId));
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

  /**
   * Every Epitaph and Taunt on screen, oldest first, each shown above its Player's Tank. Read only:
   * they count down on every tick, in every phase, and never hold up the Round.
   */
  get lines(): readonly Readonly<Line>[] {
    return this.shownLines;
  }

  /** Advance the simulation by one tick. */
  tick(dt: number): void {
    // Lines age first, so one added this tick starts with its full time.
    for (const line of this.shownLines) line.secondsLeft -= dt;
    keepWhere(this.shownLines, (l) => l.secondsLeft > 0);
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
        // The Turn only ends once all dirt and Tanks are at rest. Fall Damage lands then; if it
        // destroys a Tank, the dirt on that Tank falls and Settling goes on. Health is recorded
        // on Settling's first tick, before anything moves, and paid for once all is at rest.
        this.healthBeforeSettling ??= this.tanks.map((t) => t.health);
        if (
          !settleTick(this.terrain, this.tanks, (id) => this.useParachute(id)) &&
          !landTanks(this.terrain, this.tanks)
        ) {
          this.paySettling(this.healthBeforeSettling);
          this.healthBeforeSettling = null;
          this.startDying();
        }
        break;
      case "dying":
        for (const animation of phase.animations) animation.elapsed += dt;
        if (phase.animations.every((a) => a.elapsed >= DEATH_ANIMATION_SECONDS)) this.endTurn();
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
    this.earn(p.firedBy, moneyEarned(explosion.hits, p.firedBy));
    return explosion;
  }

  /**
   * All Settling happens during someone's Turn, so the current Player earns, by the same Money
   * rule as Explosions, for the Health Settling removed: Fall Damage and sinking to the bottom of
   * the field alike. Harm to their own Tank pays nothing.
   */
  private paySettling(healthBefore: readonly number[]): void {
    const losses: HealthLoss[] = [];
    this.tanks.forEach((t, i) => {
      const before = healthBefore[i] ?? t.health;
      if (t.health >= before) return;
      losses.push({
        playerId: t.playerId,
        healthRemoved: before - t.health,
        destroyed: !isAlive(t),
      });
    });
    this.earn(this.currentPlayerId, moneyEarned(losses, this.currentPlayerId));
  }

  /** Use up one of a Player's Parachutes; false if they own none. */
  private useParachute(playerId: number): boolean {
    const inventory = this.inventoryOf(playerId);
    if (inventory.count("Parachute") <= 0) return false;
    inventory.useOne("Parachute");
    return true;
  }

  /**
   * True while a Player's Tank is a husk: destroyed this Turn and still on the field, its Death
   * Animation not yet started.
   */
  isHusk(playerId: number): boolean {
    return !isAlive(this.tankOf(playerId)) && !this.gone.has(playerId);
  }

  /** True once a Player's Tank has been destroyed and its Death Animation has started. */
  isGone(playerId: number): boolean {
    return this.gone.has(playerId);
  }

  /**
   * Everything else is at rest: every husk starts its Death Animation together or, with none, the
   * Turn ends now.
   */
  private startDying(): void {
    const husks = this.tanks.filter((t) => this.isHusk(t.playerId));
    if (husks.length === 0) {
      this.endTurn();
      return;
    }
    this.phase = { kind: "dying", animations: husks.map((t) => this.startDeathAnimation(t)) };
  }

  /**
   * A husk's Death Animation starts where it stands, with its Epitaph, and its Tank is gone from
   * then on. Destroyed in its own Player's Turn, it destroyed itself.
   */
  private startDeathAnimation(tank: Tank): DeathAnimation {
    this.gone.add(tank.playerId);
    const selfInflicted = tank.playerId === this.currentPlayerId;
    this.say("epitaph", tank.playerId, pickEpitaph(this.flavourRng, selfInflicted));
    return { playerId: tank.playerId, x: tank.x, y: tank.y, elapsed: 0 };
  }

  /** Show a line above a Player's Tank for as long as its kind lasts. */
  private say(kind: LineKind, playerId: number, text: string): void {
    this.shownLines.push({ kind, playerId, text, secondsLeft: LINE_SECONDS[kind] });
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
      // Only once its Shield is gone, never replacing a damaged one. Draws nothing from rng.
      if (!tank.shield) raiseShield(tank, this.inventoryOf(player.id));
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
