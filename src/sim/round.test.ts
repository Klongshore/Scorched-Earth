import { describe, expect, it } from "vitest";
import {
  BARREL_LENGTH,
  COMPUTER_THINK_SECONDS,
  DEATH_ANIMATION_KINDS,
  DEATH_ANIMATION_SECONDS,
  EPITAPH_SECONDS,
  EXPLOSION_SECONDS,
  FALL_SAFE_PIXELS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MAX_ANGLE,
  MAX_HEALTH,
  MAX_PLAYERS,
  MIN_POWER,
  MONEY_PER_DAMAGE,
  MONEY_PER_DESTROYED_TANK,
  POWER_PER_HEALTH,
  ROLLER_MAX_SECONDS,
  ROLLER_SPEED,
  TANK_HALF_WIDTH,
  TANK_HEIGHT,
  TICK_SECONDS,
  WEAPONS,
  WIND_MAX,
  weaponNamed,
} from "./constants";
import { damageAt, detonate } from "./explosion";
import { createPlayers } from "./players";
import { Rng } from "./rng";
import { emptyLoadout } from "./inventory";
import { EPITAPHS, SELF_INFLICTED_EPITAPHS } from "./lines";
import { Round, type RoundAction } from "./round";
import { fallDamage } from "./settling";
import { barrelTip, centre, hitTest, isSupported, occupiesCell } from "./tank";
import type { Terrain } from "./terrain";
import type {
  DeathAnimation,
  DeathAnimationKind,
  Explosion,
  PlayerSetup,
  Tank,
  WeaponName,
} from "./types";

const HUMAN: PlayerSetup = { kind: "human" };
const MORON: PlayerSetup = { kind: "computer", personality: "moron" };

const GROUND = 400;

function newRound(seed = 1): Round {
  return new Round(1, createPlayers([HUMAN, HUMAN]), new Rng(seed));
}

function runUntil(round: Round, predicate: (r: Round) => boolean, maxTicks = 20000): void {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(round)) return;
    round.tick(TICK_SECONDS);
  }
  expect.fail(`runUntil hit the ${maxTicks}-tick cap in phase ${round.phase.kind}`);
}

/** Flat Terrain at GROUND, Wind 0, and the Tanks overwritten to the given columns. */
function scenario(
  firerX: number,
  otherX: number,
  seed = 1,
): { round: Round; firer: Tank; other: Tank } {
  const round = newRound(seed);
  round.wind = 0;
  round.terrain.flatten(0, FIELD_WIDTH - 1, GROUND);
  const firer = round.currentTank();
  const other = round.tanks.find((t) => t !== firer) as Tank;
  firer.x = firerX;
  firer.y = GROUND;
  other.x = otherX;
  other.y = GROUND;
  return { round, firer, other };
}

/** Clear a slab `depth` px deep under a Tank, so it falls that far on the next Settling. */
function undercutTank(round: Round, tank: Tank, depth: number): void {
  for (let y = tank.y; y < tank.y + depth; y++) {
    for (let x = tank.x - 20; x <= tank.x + 20; x++) round.terrain.set(x, y, false);
  }
}

/** Fire straight up so the Projectile falls back onto the firer. */
function fireStraightUp(round: Round, firer: Tank): void {
  firer.angle = 90;
  firer.power = Math.min(100, firer.health * POWER_PER_HEALTH);
  round.act({ kind: "fire" });
}

describe("Round", () => {
  it("starts with 2 full-Health Tanks, Wind within ±20, aiming", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const round = newRound(seed);
      expect(round.tanks).toHaveLength(2);
      for (const t of round.tanks) expect(t.health).toBe(MAX_HEALTH);
      expect(Math.abs(round.wind)).toBeLessThanOrEqual(WIND_MAX);
      expect(round.phase).toEqual({ kind: "aiming", thinkTicks: null });
      expect([...round.turnOrder].sort()).toEqual([0, 1]);
    }
  });

  it("adjusts the current Tank's Angle and Power, clamped", () => {
    const round = newRound();
    const tank = round.currentTank();
    round.act({ kind: "adjustAngle", delta: 5 });
    expect(tank.angle).toBe(95);
    round.act({ kind: "adjustAngle", delta: 1000 });
    expect(tank.angle).toBe(MAX_ANGLE);
    round.act({ kind: "adjustPower", delta: -10 });
    expect(tank.power).toBe(490);
    round.act({ kind: "adjustPower", delta: 5000 });
    expect(tank.power).toBe(MAX_HEALTH * POWER_PER_HEALTH);
    round.act({ kind: "adjustPower", delta: -5000 });
    expect(tank.power).toBe(MIN_POWER);
  });

  it("ignores actions outside aiming", () => {
    const round = newRound();
    const tank = round.currentTank();
    round.act({ kind: "fire" });
    expect(round.phase.kind).toBe("resolving");
    const before = { angle: tank.angle, power: tank.power };
    const projectile = round.phase.kind === "resolving" ? round.phase.projectiles[0] : null;
    round.act({ kind: "adjustAngle", delta: 10 });
    round.act({ kind: "adjustPower", delta: 10 });
    round.act({ kind: "fire" });
    expect({ angle: tank.angle, power: tank.power }).toEqual(before);
    expect(round.phase.kind === "resolving" && round.phase.projectiles[0]).toBe(projectile);
  });

  it("returns to aiming with the other Player current after a shot, or ends", () => {
    const round = newRound();
    const first = round.currentPlayerId;
    round.act({ kind: "fire" });
    runUntil(round, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
    if (round.phase.kind === "aiming") expect(round.currentPlayerId).not.toBe(first);
  });

  it("does not change the current Player until Settling finishes", () => {
    const { round, firer } = scenario(200, 450);
    const first = round.currentPlayerId;
    fireStraightUp(round, firer);
    let sawTransition = false;
    let previous = round.phase.kind;
    runUntil(round, (r) => {
      if (previous === "resolving" && r.phase.kind === "settling") {
        sawTransition = true;
        expect(r.currentPlayerId).toBe(first);
      }
      if (r.phase.kind === "settling") expect(r.currentPlayerId).toBe(first);
      previous = r.phase.kind;
      return r.phase.kind === "aiming";
    });
    expect(sawTransition).toBe(true);
    expect(round.currentPlayerId).not.toBe(first);
  });

  it("holds the Projectile, then its Explosion, while resolving; settles once both lists empty", () => {
    const { round, firer } = scenario(200, 450);
    fireStraightUp(round, firer);
    if (round.phase.kind !== "resolving") expect.fail("not resolving after fire");
    expect(round.phase.projectiles).toHaveLength(1);
    expect(round.phase.explosions).toHaveLength(0);
    runUntil(round, (r) => r.phase.kind === "resolving" && r.phase.explosions.length > 0);
    if (round.phase.kind !== "resolving") expect.fail("not resolving after the hit");
    expect(round.phase.projectiles).toHaveLength(0);
    expect(round.phase.explosions).toHaveLength(1);
    let ticks = 0;
    runUntil(round, (r) => {
      if (r.phase.kind === "resolving") ticks++;
      return r.phase.kind !== "resolving";
    });
    expect(round.phase.kind).toBe("settling");
    let agingTicks = 0;
    for (let elapsed = 0; elapsed < EXPLOSION_SECONDS; elapsed += TICK_SECONDS) agingTicks++;
    expect(ticks).toBe(agingTicks);
  });

  it("ends in a Round Win for the firer when the opponent dies", () => {
    const { round, firer, other } = scenario(300, 312);
    other.health = 1;
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({
      kind: "over",
      result: { kind: "win", playerId: firer.playerId },
    });
    expect(firer.health).toBeGreaterThan(0);
    expect(other.health).toBe(0);
  });

  it("ends in a Draw when both Tanks die", () => {
    const { round, firer, other } = scenario(300, 312);
    firer.health = 1;
    other.health = 1;
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({ kind: "over", result: { kind: "draw" } });
  });

  it("gives the opponent the win when a Tank destroys only itself", () => {
    const { round, firer, other } = scenario(150, 500);
    firer.health = 1;
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({
      kind: "over",
      result: { kind: "win", playerId: other.playerId },
    });
    expect(other.health).toBe(MAX_HEALTH);
  });

  it("drops a Tank whose dirt is carved away, and lands its Fall Damage once at rest", () => {
    const { round, other } = scenario(150, 500);
    round.terrain.carveCircle(other.x, other.y + 15, 20);
    expect(isSupported(other, round.terrain)).toBe(false);
    round.phase = { kind: "settling" };
    runUntil(round, (r) => {
      if (r.phase.kind === "settling") expect(other.health).toBe(MAX_HEALTH);
      return r.phase.kind === "aiming";
    });
    const drop = other.y - GROUND;
    expect(drop).toBeGreaterThan(FALL_SAFE_PIXELS);
    expect(isSupported(other, round.terrain)).toBe(true);
    expect(other.health).toBe(MAX_HEALTH - fallDamage(drop));
    expect(other.fallen).toBe(0);
  });

  it("opens a Parachute for a 60 px fall, using exactly one, and lands no Fall Damage", () => {
    const { round, other } = scenario(150, 500);
    const inventory = round.inventoryOf(other.playerId);
    inventory.add("Parachute", 5);
    undercutTank(round, other, 60);
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "aiming");
    expect(other.y).toBe(GROUND + 60);
    expect(other.health).toBe(MAX_HEALTH);
    expect(inventory.count("Parachute")).toBe(4);
    expect(other.parachute).toBe(false);
  });

  it("uses one Parachute for each of two falls in two Turns", () => {
    const { round, firer, other } = scenario(150, 500);
    const inventory = round.inventoryOf(other.playerId);
    inventory.add("Parachute", 5);
    for (const turnOf of [firer, other]) {
      expect(round.currentTank()).toBe(turnOf);
      undercutTank(round, other, 30);
      round.phase = { kind: "settling" };
      runUntil(round, (r) => r.phase.kind === "aiming");
    }
    expect(other.y).toBe(GROUND + 60);
    expect(other.health).toBe(MAX_HEALTH);
    expect(inventory.count("Parachute")).toBe(3);
  });

  it("carries the Parachutes left into the next Round, where they still open", () => {
    const players = createPlayers([HUMAN, HUMAN]);
    const loadout = emptyLoadout(players);
    loadout.inventories[1]?.add("Parachute", 5);
    for (const [number, left] of [
      [1, 4],
      [2, 3],
    ] as const) {
      const round = new Round(number, players, new Rng(1), loadout);
      round.wind = 0;
      round.terrain.flatten(0, FIELD_WIDTH - 1, GROUND);
      const tank = round.tankOf(1);
      tank.x = 500;
      tank.y = GROUND;
      undercutTank(round, tank, 60);
      round.phase = { kind: "settling" };
      runUntil(round, (r) => r.phase.kind === "aiming");
      expect(tank.health).toBe(MAX_HEALTH);
      expect(round.inventoryOf(1).count("Parachute")).toBe(left);
    }
  });

  it("ends the Turn only after dirt on a Tank its Fall Damage destroyed has fallen", () => {
    const { round, other } = scenario(150, 500);
    other.health = 1;
    const roofX = other.x;
    round.terrain.set(roofX, other.y - TANK_HEIGHT - 1, true);
    for (let y = GROUND; y < GROUND + 30; y++) {
      for (let x = other.x - 20; x <= other.x + 20; x++) round.terrain.set(x, y, false);
    }
    round.phase = { kind: "settling" };
    let settlingTicksAfterDeath = 0;
    runUntil(round, (r) => {
      if (other.health === 0 && r.phase.kind === "settling") settlingTicksAfterDeath++;
      return r.phase.kind === "over";
    });
    expect(other.y).toBe(GROUND + 30);
    expect(other.health).toBe(0);
    expect(settlingTicksAfterDeath).toBeGreaterThan(1);
    // The dirt that rode down on its roof fell through it onto the Terrain below.
    expect(round.terrain.isSolid(roofX, other.y - 1)).toBe(true);
    expect(round.terrain.isSolid(roofX, other.y - TANK_HEIGHT - 1)).toBe(false);
  });

  it("leaves a Tank over a Nuke on flat Terrain with 100 - Explosion damage - Fall Damage", () => {
    const { round, firer, other } = scenario(150, 500);
    // A surface higher than GROUND, so the crater stops short of the bottom of the field.
    const surface = 250;
    round.terrain.flatten(0, FIELD_WIDTH - 1, surface);
    firer.y = surface;
    other.y = surface;
    const nuke = weaponNamed("Nuke");
    const explosionY = surface + 40;
    const explosionDamage = damageAt(nuke, Math.hypot(0, centre(other).y - explosionY));
    detonate(other.x, explosionY, nuke, round.terrain, round.tanks);
    expect(other.health).toBe(MAX_HEALTH - explosionDamage);
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "aiming");
    const drop = other.y - surface;
    expect(fallDamage(drop)).toBeGreaterThan(0);
    expect(other.health).toBe(MAX_HEALTH - explosionDamage - fallDamage(drop));
    expect(other.health).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed and actions", () => {
    const actions: RoundAction[] = [
      { kind: "adjustAngle", delta: -30 },
      { kind: "adjustPower", delta: 120 },
      { kind: "fire" },
      { kind: "adjustAngle", delta: 25 },
      { kind: "adjustPower", delta: -80 },
      { kind: "fire" },
      { kind: "adjustAngle", delta: -10 },
      { kind: "fire" },
    ];
    const play = (): Round => {
      const round = newRound(42);
      for (const action of actions) {
        round.act(action);
        runUntil(round, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
      }
      return round;
    };
    const a = play();
    const b = play();
    expect(a.tanks).toEqual(b.tanks);
    expect(a.wind).toBe(b.wind);
    expect(a.turnOrder).toEqual(b.turnOrder);
    expect(a.phase).toEqual(b.phase);
    expect(a.terrain.cells).toEqual(b.terrain.cells);
  });

  it("pauses a Computer Player for COMPUTER_THINK_SECONDS worth of ticks before it fires", () => {
    const round = new Round(1, createPlayers([MORON, MORON]), new Rng(3));
    let ticks = 0;
    while (round.phase.kind === "aiming") {
      round.tick(TICK_SECONDS);
      ticks++;
      if (ticks > 10_000) expect.fail("Computer Player never fired");
    }
    expect(round.phase.kind).toBe("resolving");
    expect(ticks).toBe(Math.round(COMPUTER_THINK_SECONDS / TICK_SECONDS));
  });

  it("lets a Computer Player fire after its think time", () => {
    const round = new Round(1, createPlayers([MORON, MORON]), new Rng(3));
    expect(round.phase.kind).toBe("aiming");
    if (round.phase.kind === "aiming") expect(round.phase.thinkTicks).not.toBeNull();
    round.act({ kind: "fire" });
    expect(round.phase.kind).toBe("aiming");
    runUntil(round, (r) => r.phase.kind !== "aiming");
    expect(round.phase.kind).toBe("resolving");
  });
});

describe("Round earnings", () => {
  const settled = (r: Round): boolean => r.phase.kind === "aiming" || r.phase.kind === "over";

  it("starts every Player at 0", () => {
    expect(newRound().earnings).toEqual([0, 0]);
  });

  it("pays the firer $1,250 for 25 Health removed from another Tank", () => {
    const { round, firer, other } = scenario(300, 300 + BARREL_LENGTH + 2);
    // A Power-0 Projectile drops from the barrel tip into the other Tank, about 3.5 px from its centre.
    other.y = GROUND - 1;
    firer.angle = 0;
    firer.power = 0;
    round.act({ kind: "fire" });
    runUntil(round, settled);
    expect(other.health).toBe(MAX_HEALTH - 25);
    expect(round.earnings[firer.playerId]).toBe(1250);
    expect(round.earnings[other.playerId]).toBe(0);
  });

  it("pays nothing for damage a Shield absorbs, only for the Health removed past it", () => {
    const fireAtShielded = (strength: number) => {
      const { round, firer, other } = scenario(300, 300 + BARREL_LENGTH + 2);
      other.y = GROUND - 1;
      other.shield = { name: "Shield", strength };
      firer.angle = 0;
      firer.power = 0;
      round.act({ kind: "fire" });
      runUntil(round, settled);
      return { round, firer, other };
    };
    // The same 25-damage hit as above, fully absorbed: no Health lost, no Money.
    const full = fireAtShielded(50);
    expect(full.other.health).toBe(MAX_HEALTH);
    expect(full.other.shield?.strength).toBe(25);
    expect(full.round.earnings[full.firer.playerId]).toBe(0);
    // Partly absorbed: 10 to the Shield (dropping it), 15 to Health, paid for the 15.
    const part = fireAtShielded(10);
    expect(part.other.shield).toBeNull();
    expect(part.other.health).toBe(MAX_HEALTH - 15);
    expect(part.round.earnings[part.firer.playerId]).toBe(MONEY_PER_DAMAGE * 15);
  });

  it("pays Fall Damage to a shielded Tank in full, the Shield untouched", () => {
    const { round, firer, other } = scenario(150, 500);
    other.shield = { name: "Heavy Shield", strength: 100 };
    round.terrain.carveCircle(other.x, other.y + 15, 20);
    round.phase = { kind: "settling" };
    runUntil(round, settled);
    const lost = MAX_HEALTH - other.health;
    expect(lost).toBeGreaterThan(0);
    expect(other.shield?.strength).toBe(100);
    expect(round.earnings[firer.playerId]).toBe(MONEY_PER_DAMAGE * lost);
  });

  it("pays $500 + $2,000 for destroying a 10-Health Tank", () => {
    const { round, firer, other } = scenario(300, 312);
    other.health = 10;
    fireStraightUp(round, firer);
    runUntil(round, settled);
    expect(other.health).toBe(0);
    expect(round.earnings[firer.playerId]).toBe(500 + 2000);
  });

  it("pays nothing for damage to the firer's own Tank", () => {
    const { round, firer } = scenario(150, 500);
    fireStraightUp(round, firer);
    runUntil(round, settled);
    expect(firer.health).toBeLessThan(MAX_HEALTH);
    expect(round.earnings).toEqual([0, 0]);
  });

  it("pays the current Player for the Health and the Tank lost by Settling to the bottom", () => {
    const { round, firer, other } = scenario(150, 500);
    round.terrain.carveCircle(other.x, FIELD_HEIGHT - 1, 30);
    for (let y = other.y; y < FIELD_HEIGHT; y++) round.terrain.carveCircle(other.x, y, 12);
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "over");
    expect(other.health).toBe(0);
    expect(round.earnings[firer.playerId]).toBe(
      MONEY_PER_DAMAGE * MAX_HEALTH + MONEY_PER_DESTROYED_TANK,
    );
    expect(round.earnings[other.playerId]).toBe(0);
  });

  it("pays the current Player $50 per point of Fall Damage to another Tank", () => {
    const { round, firer, other } = scenario(150, 500);
    round.terrain.carveCircle(other.x, other.y + 15, 20);
    round.phase = { kind: "settling" };
    runUntil(round, settled);
    const lost = MAX_HEALTH - other.health;
    expect(lost).toBeGreaterThan(0);
    expect(other.health).toBeGreaterThan(0);
    expect(round.earnings[firer.playerId]).toBe(MONEY_PER_DAMAGE * lost);
    expect(round.earnings[other.playerId]).toBe(0);
  });

  it("pays the destroyed-Tank bonus when Fall Damage destroys another Tank", () => {
    const { round, firer, other } = scenario(150, 500);
    other.health = 1;
    round.terrain.carveCircle(other.x, other.y + 15, 20);
    round.phase = { kind: "settling" };
    runUntil(round, settled);
    expect(other.health).toBe(0);
    expect(round.earnings[firer.playerId]).toBe(MONEY_PER_DAMAGE + MONEY_PER_DESTROYED_TANK);
  });

  it("pays the current Player nothing for a fall a Parachute saves", () => {
    const { round, firer, other } = scenario(150, 500);
    round.inventoryOf(other.playerId).add("Parachute", 5);
    undercutTank(round, other, 60);
    round.phase = { kind: "settling" };
    runUntil(round, settled);
    expect(other.health).toBe(MAX_HEALTH);
    expect(round.earnings[firer.playerId]).toBe(0);
    expect(round.earnings).toEqual([0, 0]);
  });

  it("pays nothing for Fall Damage to the current Player's own Tank", () => {
    const { round, firer } = scenario(150, 500);
    round.terrain.carveCircle(firer.x, firer.y + 15, 20);
    round.phase = { kind: "settling" };
    runUntil(round, settled);
    expect(firer.health).toBeLessThan(MAX_HEALTH);
    expect(round.earnings).toEqual([0, 0]);
  });
});

describe("Round Weapons", () => {
  const settled = (r: Round): boolean => r.phase.kind === "aiming" || r.phase.kind === "over";
  const weaponName = (r: Round): string => r.currentWeapon().name;

  it("starts every Turn on the Baby Missile when nothing is bought", () => {
    expect(weaponName(newRound())).toBe("Baby Missile");
  });

  it("cycles both ways through owned Weapons only, never an Item, wrapping round", () => {
    const round = newRound();
    const inventory = round.inventoryOf(round.currentPlayerId);
    inventory.add("Missile", 5);
    inventory.add("Nuke", 1);
    inventory.add("Shield", 3);
    inventory.add("Heavy Shield", 2);
    inventory.add("Parachute", 5);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      round.act({ kind: "cycleWeapon", delta: 1 });
      seen.push(weaponName(round));
    }
    expect(seen).toEqual(["Missile", "Nuke", "Baby Missile", "Missile"]);
    round.act({ kind: "cycleWeapon", delta: -1 });
    expect(weaponName(round)).toBe("Baby Missile");
    round.act({ kind: "cycleWeapon", delta: -1 });
    expect(weaponName(round)).toBe("Nuke");
  });

  it("stays on the Baby Missile when cycling with nothing else owned", () => {
    const round = newRound();
    round.act({ kind: "cycleWeapon", delta: 1 });
    expect(weaponName(round)).toBe("Baby Missile");
    round.act({ kind: "cycleWeapon", delta: -1 });
    expect(weaponName(round)).toBe("Baby Missile");
  });

  it("ignores cycling for a Computer Player", () => {
    const round = new Round(1, createPlayers([MORON, MORON]), new Rng(3));
    round.inventoryOf(round.currentPlayerId).add("Missile", 5);
    round.act({ kind: "cycleWeapon", delta: 1 });
    expect(weaponName(round)).toBe("Baby Missile");
  });

  it("lets a Computer Player choose its Weapon each Turn from what it owns", () => {
    const shooter: PlayerSetup = { kind: "computer", personality: "shooter" };
    const players = createPlayers([shooter, shooter]);
    let nukes = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const loadout = emptyLoadout(players);
      for (const inventory of loadout.inventories) {
        inventory.add("Missile", 5);
        inventory.add("Nuke", 1);
      }
      const round = new Round(1, players, new Rng(seed), loadout);
      const targetId = round.targetOf(round.currentPlayerId);
      const expected =
        targetId === null
          ? "Baby Missile"
          : Math.abs(round.tankOf(targetId).x - round.currentTank().x) > 75
            ? "Nuke"
            : "Missile";
      expect(weaponName(round)).toBe(expected);
      if (expected === "Nuke") nukes++;
    }
    expect(nukes).toBeGreaterThan(0);
  });

  it("lets a Moron fire the Weapons it owns, using them up", () => {
    const players = createPlayers([MORON, MORON]);
    const loadout = emptyLoadout(players);
    for (const inventory of loadout.inventories) inventory.add("Missile", 5);
    const round = new Round(1, players, new Rng(4), loadout);
    runUntil(round, (r) => r.phase.kind === "over", 200_000);
    const left = loadout.inventories.map((i) => i.count("Missile"));
    expect(left.some((n) => n < 5)).toBe(true);
  });

  it("fires the chosen Weapon and uses one; the Baby Missile is never used up", () => {
    const { round, firer } = scenario(150, 500);
    const inventory = round.inventoryOf(firer.playerId);
    inventory.add("Missile", 5);
    round.act({ kind: "cycleWeapon", delta: 1 });
    fireStraightUp(round, firer);
    const phase = round.phase;
    if (phase.kind !== "resolving") return expect.fail("expected resolving");
    expect(phase.projectiles[0]?.weapon.name).toBe("Missile");
    expect(inventory.count("Missile")).toBe(4);

    const second = scenario(150, 500);
    fireStraightUp(second.round, second.firer);
    expect(second.round.inventoryOf(second.firer.playerId).count("Baby Missile")).toBe(Infinity);
  });

  it("starts the next Turn on the last Weapon fired, or the Baby Missile once none is left", () => {
    const { round, firer, other } = scenario(150, 500);
    round.inventoryOf(firer.playerId).add("Missile", 5);
    round.inventoryOf(other.playerId).add("Nuke", 1);
    const fireAway = (tank: Tank, angle: number): void => {
      tank.angle = angle;
      tank.power = 300;
      round.act({ kind: "fire" });
      runUntil(round, settled);
    };
    round.act({ kind: "cycleWeapon", delta: 1 });
    fireAway(firer, 180); // a Missile, to the left
    round.act({ kind: "cycleWeapon", delta: 1 });
    expect(weaponName(round)).toBe("Nuke");
    fireAway(other, 0); // the other Player's only Nuke, to the right
    expect(round.currentPlayerId).toBe(firer.playerId);
    expect(weaponName(round)).toBe("Missile");
    fireAway(firer, 180);
    expect(round.currentPlayerId).toBe(other.playerId);
    expect(weaponName(round)).toBe("Baby Missile");
  });

  it("carries the chosen Weapon and the Inventory into the next Round", () => {
    const players = createPlayers([HUMAN, HUMAN]);
    const loadout = emptyLoadout(players);
    loadout.inventories[0]?.add("Baby Nuke", 3);
    loadout.inventories[1]?.add("Baby Nuke", 3);
    loadout.chosenWeapons[0] = "Baby Nuke";
    loadout.chosenWeapons[1] = "Baby Nuke";
    const round = new Round(2, players, new Rng(1), loadout);
    expect(weaponName(round)).toBe("Baby Nuke");
    expect(round.inventoryOf(round.currentPlayerId).count("Baby Nuke")).toBe(3);
  });

  it("falls back to the Baby Missile at the start of a Turn when the chosen Weapon is gone", () => {
    const players = createPlayers([HUMAN, HUMAN]);
    const loadout = emptyLoadout(players);
    loadout.chosenWeapons[0] = "Nuke";
    loadout.chosenWeapons[1] = "Nuke";
    const round = new Round(1, players, new Rng(1), loadout);
    expect(weaponName(round)).toBe("Baby Missile");
    expect(loadout.chosenWeapons[round.currentPlayerId]).toBe("Baby Missile");
  });

  it("carves a 75-px crater with a Nuke on flat ground", () => {
    const { round, firer } = scenario(300, 600);
    round.inventoryOf(firer.playerId).add("Nuke", 1);
    round.act({ kind: "cycleWeapon", delta: 1 });
    // A Power-0 Projectile drops from the barrel tip straight onto the ground beside the firer.
    firer.angle = 0;
    firer.power = 0;
    round.act({ kind: "fire" });
    runUntil(round, (r) => r.phase.kind === "resolving" && r.phase.explosions.length > 0);
    const phase = round.phase;
    if (phase.kind !== "resolving") return expect.fail("expected resolving");
    const explosion = phase.explosions[0];
    if (!explosion) return expect.fail("expected an Explosion");
    expect(explosion.radius).toBe(75);
    const x = Math.floor(explosion.x);
    const y = Math.floor(explosion.y);
    expect(round.terrain.isSolid(x, y + 73)).toBe(false);
    expect(round.terrain.isSolid(x, y + 77)).toBe(true);
    expect(round.terrain.isSolid(x - 73, y + 1)).toBe(false);
    expect(round.terrain.isSolid(x + 73, y + 1)).toBe(false);
    expect(round.terrain.isSolid(x + 78, y + 1)).toBe(true);
  });
});

describe("Round splitters", () => {
  const settled = (r: Round): boolean => r.phase.kind === "aiming" || r.phase.kind === "over";

  /** Give the current Human one of `weapon`, their only Weapon but the Baby Missile, and choose it. */
  function arm(round: Round, weapon: WeaponName): void {
    round.inventoryOf(round.currentPlayerId).add(weapon, 1);
    round.act({ kind: "cycleWeapon", delta: 1 });
    expect(round.currentWeapon().name).toBe(weapon);
  }

  /** Fire, run until the Turn ends, and return every Explosion in the order it started. */
  function fireAndCollect(round: Round, tank: Tank, angle: number, power: number): Explosion[] {
    tank.angle = angle;
    tank.power = power;
    round.act({ kind: "fire" });
    const seen = new Set<Explosion>();
    runUntil(round, (r) => {
      if (r.phase.kind === "resolving") for (const e of r.phase.explosions) seen.add(e);
      return settled(r);
    });
    return [...seen];
  }

  it("splits a MIRV fired at 60° into 5 Explosions either side of where a Missile lands", () => {
    const missile = scenario(100, 600);
    arm(missile.round, "Missile");
    const [one] = fireAndCollect(missile.round, missile.firer, 60, 400);
    if (!one) return expect.fail("the Missile did not explode");

    const mirv = scenario(100, 600);
    arm(mirv.round, "MIRV");
    const explosions = fireAndCollect(mirv.round, mirv.firer, 60, 400);
    expect(explosions).toHaveLength(5);
    for (const e of explosions) expect(e.radius).toBe(30);
    const xs = explosions.map((e) => e.x).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(one.x - 20);
    expect(xs[1]).toBeLessThan(one.x - 10);
    expect(xs[2]).toBeCloseTo(one.x, 5);
    expect(xs[3]).toBeGreaterThan(one.x + 10);
    expect(xs[4]).toBeGreaterThan(one.x + 20);
  });

  it("explodes a MIRV that lands before its peak like one Missile", () => {
    const { round, firer } = scenario(100, 600);
    round.terrain.flatten(130, 200, 250); // a cliff in the way
    arm(round, "MIRV");
    const explosions = fireAndCollect(round, firer, 10, 400);
    expect(explosions).toHaveLength(1);
    expect(explosions[0]?.radius).toBe(30);
  });

  it("explodes a Funky Bomb, then 6 to 8 Baby Missile bomblets, reproducibly from the seed", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const run = (): Explosion[] => {
        const { round, firer } = scenario(150, 600, seed);
        arm(round, "Funky Bomb");
        return fireAndCollect(round, firer, 60, 400);
      };
      const explosions = run();
      expect(explosions.length).toBeGreaterThanOrEqual(1 + 6);
      expect(explosions.length).toBeLessThanOrEqual(1 + 8);
      expect(explosions[0]?.radius).toBe(30);
      for (const e of explosions.slice(1)) expect(e.radius).toBe(20);
      expect(run().map((e) => [e.x, e.y])).toEqual(explosions.map((e) => [e.x, e.y]));
      counts.add(explosions.length - 1);
    }
    expect(counts.size).toBeGreaterThan(1);
  });

  it("ends the Turn only after the last bomblet's Explosion and Settling", () => {
    const { round, firer } = scenario(150, 600);
    arm(round, "Funky Bomb");
    firer.angle = 60;
    firer.power = 400;
    round.act({ kind: "fire" });
    const first = round.currentPlayerId;
    const seen = new Set<Explosion>();
    let seenAtSettling = -1;
    runUntil(round, (r) => {
      if (r.phase.kind === "resolving") for (const e of r.phase.explosions) seen.add(e);
      if (r.phase.kind === "settling") {
        if (seenAtSettling < 0) seenAtSettling = seen.size;
        expect(r.currentPlayerId).toBe(first);
      }
      return settled(r);
    });
    expect(seen.size).toBeGreaterThanOrEqual(7);
    expect(seenAtSettling).toBe(seen.size);
  });

  it("credits damage from MIRV pieces and Funky Bomb bomblets to the firer", () => {
    // Find where the MIRV's leftmost piece lands, then stand the other Tank there.
    const dry = scenario(100, 600);
    arm(dry.round, "MIRV");
    const pieceX = Math.min(...fireAndCollect(dry.round, dry.firer, 60, 400).map((e) => e.x));
    const mirv = scenario(100, Math.round(pieceX));
    arm(mirv.round, "MIRV");
    const pieces = fireAndCollect(mirv.round, mirv.firer, 60, 400);
    // The pieces' Explosions pay, and so does the Fall Damage from the crater: each exactly once.
    const removed = pieces
      .flatMap((e) => e.hits)
      .filter((h) => h.playerId === mirv.other.playerId)
      .reduce((sum, h) => sum + h.healthRemoved, 0);
    expect(removed).toBeGreaterThan(0);
    const fell = MAX_HEALTH - removed - mirv.other.health;
    expect(fell).toBeGreaterThan(0);
    expect(mirv.other.health).toBeGreaterThan(0);
    expect(mirv.round.earnings[mirv.firer.playerId]).toBe(MONEY_PER_DAMAGE * (removed + fell));

    // Bomblets scatter at random: across seeds, some must hit the other Tank standing beside
    // the Funky Bomb's crater, beyond the Funky Bomb's own reach.
    let bombletMoney = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const dryFunky = scenario(150, 600, seed);
      arm(dryFunky.round, "Funky Bomb");
      const [funky] = fireAndCollect(dryFunky.round, dryFunky.firer, 60, 400);
      if (!funky) return expect.fail("the Funky Bomb did not explode");

      const { round, firer, other } = scenario(150, Math.round(funky.x) + 45, seed);
      arm(round, "Funky Bomb");
      const explosions = fireAndCollect(round, firer, 60, 400);
      expect(explosions[0]?.hits.some((h) => h.playerId === other.playerId)).toBe(false);
      // Every point the other Tank lost, to Explosions or to Settling, pays once.
      const expected =
        MONEY_PER_DAMAGE * (MAX_HEALTH - other.health) +
        (other.health === 0 ? MONEY_PER_DESTROYED_TANK : 0);
      expect(explosions.length).toBeGreaterThan(0);
      expect(round.earnings[firer.playerId]).toBe(expected);
      bombletMoney += expected;
    }
    expect(bombletMoney).toBeGreaterThan(0);
  });
});

describe("Round with 10 Players", () => {
  const tenHumans = (seed = 1): Round =>
    new Round(1, createPlayers(Array.from({ length: MAX_PLAYERS }, () => HUMAN)), new Rng(seed));

  /** End the current Turn without firing: nothing needs Settling, so it ends on the next tick. */
  function endTurn(round: Round): void {
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
  }

  it("starts with one full-Health Tank per Player", () => {
    const round = tenHumans();
    expect(round.tanks.map((t) => t.playerId)).toEqual([...Array(MAX_PLAYERS).keys()]);
    for (const t of round.tanks) expect(t.health).toBe(MAX_HEALTH);
  });

  it("holds every Player exactly once in the Turn order", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const order = tenHumans(seed).turnOrder;
      expect(order).toHaveLength(MAX_PLAYERS);
      expect([...order].sort((a, b) => a - b)).toEqual([...Array(MAX_PLAYERS).keys()]);
    }
  });

  it("gives every living Player a Turn in order, skipping destroyed Tanks", () => {
    const round = tenHumans();
    const order = round.turnOrder;
    const dead = new Set([order[1], order[2], order[5], order[9]]);
    for (const id of dead) round.tankOf(id as number).health = 0;

    const seen: number[] = [round.currentPlayerId];
    for (let i = 0; i < 6; i++) {
      endTurn(round);
      seen.push(round.currentPlayerId);
    }
    const living = order.filter((id) => !dead.has(id));
    expect(seen).toEqual([...living, living[0]]);
  });

  it("ends in a Round Win once only one Tank survives", () => {
    const round = tenHumans();
    const survivor = round.turnOrder[4] as number;
    for (const t of round.tanks) if (t.playerId !== survivor) t.health = 0;
    endTurn(round);
    expect(round.phase).toEqual({ kind: "over", result: { kind: "win", playerId: survivor } });
  });

  it("keeps going while two Tanks survive", () => {
    const round = tenHumans();
    const [a, b] = [round.turnOrder[3] as number, round.turnOrder[7] as number];
    for (const t of round.tanks) if (t.playerId !== a && t.playerId !== b) t.health = 0;
    endTurn(round);
    expect(round.phase.kind).toBe("aiming");
    expect([a, b]).toContain(round.currentPlayerId);
  });

  it("ends in a Draw when no Tank survives", () => {
    const round = tenHumans();
    for (const t of round.tanks) t.health = 0;
    endTurn(round);
    expect(round.phase).toEqual({ kind: "over", result: { kind: "draw" } });
  });
});

describe("Round Targets", () => {
  const SHOOTER: PlayerSetup = { kind: "computer", personality: "shooter" };

  /** End the current Turn without firing: nothing needs Settling, so it ends on the next tick. */
  function endTurn(round: Round): void {
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
  }

  function untilTurnOf(round: Round, playerId: number): void {
    for (let i = 0; i < 20; i++) {
      if (round.currentPlayerId === playerId) return;
      endTurn(round);
    }
    expect.fail(`Player ${playerId} never got a Turn`);
  }

  it("gives a Computer Player no Target before its first Turn, and a Human none at all", () => {
    const round = new Round(1, createPlayers([HUMAN, SHOOTER, SHOOTER, SHOOTER]), new Rng(12));
    for (const id of [1, 2, 3]) {
      if (id !== round.currentPlayerId) expect(round.targetOf(id)).toBeNull();
    }
    expect(round.targetOf(0)).toBeNull();
  });

  it("keeps a Shooter's Target across Turns while it is alive", () => {
    const round = new Round(1, createPlayers([SHOOTER, HUMAN, HUMAN, HUMAN]), new Rng(31));
    untilTurnOf(round, 0);
    const target = round.targetOf(0);
    expect(target).not.toBeNull();
    expect(target).not.toBe(0);
    for (let cycle = 0; cycle < 3; cycle++) {
      endTurn(round);
      untilTurnOf(round, 0);
      expect(round.targetOf(0)).toBe(target);
    }
  });

  it("picks a new living Target once the Target's Tank is destroyed", () => {
    const round = new Round(1, createPlayers([SHOOTER, HUMAN, HUMAN, HUMAN]), new Rng(31));
    untilTurnOf(round, 0);
    const first = round.targetOf(0) as number;
    round.tankOf(first).health = 0;
    endTurn(round);
    untilTurnOf(round, 0);
    const second = round.targetOf(0);
    expect(second).not.toBeNull();
    expect([first, 0]).not.toContain(second);
    expect(round.tankOf(second as number).health).toBeGreaterThan(0);
  });

  it("starts every Round with no Target", () => {
    const players = createPlayers([SHOOTER, SHOOTER, SHOOTER]);
    const rng = new Rng(8);
    const first = new Round(1, players, rng);
    for (let i = 0; i < 3; i++) endTurn(first);
    for (const id of [0, 1, 2]) expect(first.targetOf(id)).not.toBeNull();
    const second = new Round(2, players, rng);
    for (const id of [0, 1, 2]) {
      if (id !== second.currentPlayerId) expect(second.targetOf(id)).toBeNull();
    }
  });

  it("aims a Shooter toward its Target as its Turn begins", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const round = new Round(1, createPlayers([SHOOTER, SHOOTER, SHOOTER]), new Rng(seed));
      const self = round.currentTank();
      const target = round.tankOf(round.targetOf(self.playerId) as number);
      expect(target).not.toBe(self);
      expect(self.angle < 90).toBe(target.x > self.x);
      expect(self.power).toBeLessThanOrEqual(self.health * POWER_PER_HEALTH);
    }
  });
});

describe("Round Landings", () => {
  const TOSSER: PlayerSetup = { kind: "computer", personality: "tosser" };

  /** A Round of two Computer Players on flat Terrain at Wind 0, the firer at `firerX`. */
  function computerScenario(firerX: number, seed = 3, weapon: WeaponName = "Baby Missile") {
    const players = createPlayers([MORON, MORON]);
    const loadout = emptyLoadout(players);
    for (const p of players) {
      if (weapon !== "Baby Missile") loadout.inventories[p.id]?.add(weapon, 1);
      loadout.chosenWeapons[p.id] = weapon;
    }
    const round = new Round(1, players, new Rng(seed), loadout);
    round.wind = 0;
    round.terrain.flatten(0, FIELD_WIDTH - 1, GROUND);
    const firer = round.currentTank();
    const other = round.tanks.find((t) => t !== firer) as Tank;
    firer.x = firerX;
    firer.y = GROUND;
    other.x = firerX < FIELD_WIDTH / 2 ? FIELD_WIDTH - 40 : 40;
    other.y = GROUND;
    return { round, firer };
  }

  /** Override the Computer Player's aim during its pause, then fly until the Projectile ends. */
  function fireAndFinish(round: Round, firer: Tank, angle: number, power: number): void {
    firer.angle = angle;
    firer.power = power;
    runUntil(round, (r) => r.phase.kind === "resolving");
    runUntil(round, (r) => r.phase.kind !== "resolving");
  }

  it("records where a Computer Player's Projectile hit", () => {
    const { round, firer } = computerScenario(200);
    fireAndFinish(round, firer, 90, 100);
    const landing = round.memoryOf(firer.playerId)?.lastLanding;
    expect(landing?.kind).toBe("hit");
    expect(landing?.kind === "hit" && landing.x).toBeCloseTo(200, 5);
  });

  it("records the side a lost Projectile left by", () => {
    const right = computerScenario(100);
    fireAndFinish(right.round, right.firer, 20, 1000);
    expect(right.round.memoryOf(right.firer.playerId)?.lastLanding).toEqual({
      kind: "lost",
      side: "right",
    });

    const left = computerScenario(540);
    fireAndFinish(left.round, left.firer, 160, 1000);
    expect(left.round.memoryOf(left.firer.playerId)?.lastLanding).toEqual({
      kind: "lost",
      side: "left",
    });
  });

  /** Like fireAndFinish, but returns every Explosion in the order it started. */
  function fireAndCollect(round: Round, firer: Tank, angle: number, power: number): Explosion[] {
    firer.angle = angle;
    firer.power = power;
    runUntil(round, (r) => r.phase.kind === "resolving");
    const seen = new Set<Explosion>();
    runUntil(round, (r) => {
      if (r.phase.kind === "resolving") for (const e of r.phase.explosions) seen.add(e);
      return r.phase.kind !== "resolving";
    });
    return [...seen];
  }

  it("records a split MIRV's middle piece's landing", () => {
    const { round, firer } = computerScenario(100, 3, "MIRV");
    const explosions = fireAndCollect(round, firer, 60, 400);
    expect(explosions).toHaveLength(5);
    const middle = explosions.map((e) => e.x).sort((a, b) => a - b)[2];
    expect(round.memoryOf(firer.playerId)?.lastLanding).toEqual({ kind: "hit", x: middle });
  });

  it("records a Funky Bomb's own landing, not any bomblet's", () => {
    const { round, firer } = computerScenario(150, 3, "Funky Bomb");
    const [funky, ...bomblets] = fireAndCollect(round, firer, 60, 400);
    expect(bomblets.length).toBeGreaterThanOrEqual(6);
    expect(round.memoryOf(firer.playerId)?.lastLanding).toEqual({ kind: "hit", x: funky?.x });
  });

  it("keeps no memory for a Human", () => {
    const round = new Round(1, createPlayers([HUMAN, TOSSER]), new Rng(1));
    expect(round.memoryOf(0)).toBeNull();
  });

  it("starts every Round with no Tosser aim or landing", () => {
    const players = createPlayers([TOSSER, TOSSER, TOSSER]);
    const rng = new Rng(8);
    const first = new Round(1, players, rng);
    for (let i = 0; i < 3; i++) {
      runUntil(first, (r) => r.phase.kind === "resolving");
      runUntil(first, (r) => r.phase.kind === "aiming" || r.phase.kind === "over");
      if (first.phase.kind === "over") break;
    }
    const remembered = [0, 1, 2].map((id) => first.memoryOf(id));
    expect(remembered.some((m) => m?.lastAim && m.lastLanding)).toBe(true);

    const second = new Round(2, players, rng);
    for (const id of [0, 1, 2]) {
      if (id === second.currentPlayerId) continue;
      expect(second.memoryOf(id)).toEqual({ targetId: null, lastAim: null, lastLanding: null });
    }
  });
});

describe("Round Rollers", () => {
  const ROLLER = weaponNamed("Roller");

  /**
   * A Round of two Humans at Wind 0 on Terrain whose surface row in column x is surface(x), with
   * the current Player's Tank at column firerX and the other at otherX.
   */
  function rollerScenario(surface: (x: number) => number, firerX: number, otherX: number) {
    const round = newRound();
    round.wind = 0;
    for (let x = 0; x < FIELD_WIDTH; x++) round.terrain.flatten(x, x, surface(x));
    const firer = round.currentTank();
    const other = round.tanks.find((t) => t !== firer) as Tank;
    firer.x = firerX;
    firer.y = surface(firerX);
    other.x = otherX;
    other.y = surface(otherX);
    return { round, firer, other };
  }

  /** Drop a Roller fired by the current Player from (x, y) with sideways speed vx. */
  function drop(round: Round, x: number, y: number, vx = 0): void {
    const projectile = { x, y, vx, vy: 0, weapon: ROLLER, firedBy: round.currentPlayerId };
    round.phase = { kind: "resolving", projectiles: [projectile], explosions: [] };
  }

  /** Run until the Turn ends, returning every Explosion seen on the way. */
  function explosionsUntilTurnEnds(round: Round): Explosion[] {
    const seen = new Set<Explosion>();
    runUntil(round, (r) => {
      if (r.phase.kind === "resolving") for (const e of r.phase.explosions) seen.add(e);
      return r.phase.kind === "aiming" || r.phase.kind === "over";
    });
    return [...seen];
  }

  it("rolls to the bottom of a V-shaped valley and explodes there", () => {
    const { round } = rollerScenario((x) => 400 - Math.abs(x - 320), 40, 600);
    drop(round, 250.5, 100);
    const explosions = explosionsUntilTurnEnds(round);
    expect(explosions).toHaveLength(1);
    expect(explosions[0]?.x).toBeCloseTo(320.5, 0);
    expect(explosions[0]?.y).toBeGreaterThan(395);
    // It went down the slope, not back up the near side.
    expect(round.terrain.isSolid(320, 405)).toBe(false);
  });

  it("explodes on touching a Tank it rolls toward", () => {
    const { round, other } = rollerScenario(() => GROUND, 40, 300);
    drop(round, 250.5, 300, 10);
    const explosions = explosionsUntilTurnEnds(round);
    expect(explosions).toHaveLength(1);
    expect(explosions[0]?.x).toBeGreaterThanOrEqual(other.x - 8);
    expect(explosions[0]?.x).toBeLessThanOrEqual(other.x - 6);
    expect(other.health).toBeLessThan(MAX_HEALTH);
  });

  it("is lost off a slope down to the field's edge, with no Explosion and no earnings", () => {
    const slope = (x: number): number => (x < 320 ? 200 + Math.floor((320 - x) / 2) : 200);
    const { round } = rollerScenario(slope, 400, 600);
    const version = round.terrain.version;
    drop(round, 200.5, 100);
    expect(explosionsUntilTurnEnds(round)).toEqual([]);
    expect(round.earnings).toEqual([0, 0]);
    for (const t of round.tanks) expect(t.health).toBe(MAX_HEALTH);
    expect(round.terrain.version).toBe(version);
  });

  it("explodes at once on hitting a Tank in mid-air", () => {
    const { round, firer, other } = rollerScenario(() => GROUND, 40, 300);
    drop(round, 300.5, 200);
    const explosions = explosionsUntilTurnEnds(round);
    expect(explosions).toHaveLength(1);
    expect(explosions[0]?.x).toBeCloseTo(300.5, 5);
    expect(explosions[0]?.y).toBeLessThan(GROUND - TANK_HEIGHT + 1);
    expect(other.health).toBeLessThan(MAX_HEALTH);
    expect(round.earnings[firer.playerId]).toBeGreaterThan(0);
  });

  it("explodes after the maximum rolling time on a long flat plain", () => {
    const { round } = rollerScenario(() => GROUND, 20, 620);
    drop(round, 60.5, GROUND - 2, 1);
    const explosions = explosionsUntilTurnEnds(round);
    expect(explosions).toHaveLength(1);
    const expected = 60.5 + ROLLER_SPEED * ROLLER_MAX_SECONDS;
    expect(Math.abs((explosions[0]?.x ?? 0) - expected)).toBeLessThan(3);
  });

  it("rolls the way it was moving on level ground", () => {
    const { round } = rollerScenario(() => GROUND, 580, 620);
    drop(round, 540.5, GROUND - 2, -1);
    const [explosion] = explosionsUntilTurnEnds(round);
    const expected = 540.5 - ROLLER_SPEED * ROLLER_MAX_SECONDS;
    expect(Math.abs((explosion?.x ?? 0) - expected)).toBeLessThan(3);
  });

  it("is fired from the Inventory like any Weapon", () => {
    const { round, firer } = rollerScenario(() => GROUND, 100, 600);
    round.inventoryOf(firer.playerId).add("Roller", 5);
    round.act({ kind: "cycleWeapon", delta: 1 });
    expect(round.currentWeapon().name).toBe("Roller");
    firer.angle = 0;
    firer.power = 100;
    round.act({ kind: "fire" });
    expect(round.inventoryOf(firer.playerId).count("Roller")).toBe(4);
    const explosions = explosionsUntilTurnEnds(round);
    expect(explosions).toHaveLength(1);
    expect(explosions[0]?.radius).toBe(ROLLER.radius);
  });

  it("leaves a Tosser remembering where it first touched down, not where it stopped", () => {
    const TOSSER: PlayerSetup = { kind: "computer", personality: "tosser" };
    const players = createPlayers([TOSSER, TOSSER]);
    const loadout = emptyLoadout(players);
    for (const inventory of loadout.inventories) inventory.add("Roller", 5);
    loadout.chosenWeapons.fill("Roller");
    const round = new Round(1, players, new Rng(3), loadout);
    round.wind = 0;
    round.terrain.flatten(0, FIELD_WIDTH - 1, GROUND);
    const firer = round.currentTank();
    const other = round.tanks.find((t) => t !== firer) as Tank;
    firer.x = 100;
    firer.y = GROUND;
    other.x = 600;
    other.y = GROUND;
    firer.angle = 60;
    firer.power = 300;
    runUntil(round, (r) => r.phase.kind === "resolving");
    expect(round.currentWeapon().name).toBe("Roller");

    const seen: { touchdown?: number; explodedAt?: number } = {};
    runUntil(round, (r) => {
      if (r.phase.kind !== "resolving") return true;
      const [p] = r.phase.projectiles;
      if (p?.rolling && seen.touchdown === undefined) seen.touchdown = p.x;
      const [e] = r.phase.explosions;
      if (e) seen.explodedAt = e.x;
      return false;
    });
    const { touchdown, explodedAt } = seen;
    if (touchdown === undefined || explodedAt === undefined) return expect.fail("expected a roll");
    expect(explodedAt - touchdown).toBeGreaterThan(50);
    const landing = round.memoryOf(firer.playerId)?.lastLanding;
    expect(landing?.kind).toBe("hit");
    expect(Math.abs((landing?.kind === "hit" ? landing.x : 0) - touchdown)).toBeLessThanOrEqual(1);
  });
});

describe("Round with Dirt Weapons", () => {
  /** Give the current Player one of a Weapon and choose it. */
  function choose(round: Round, name: WeaponName): void {
    round.inventoryOf(round.currentPlayerId).add(name, 1);
    for (let i = 0; i < WEAPONS.length && round.currentWeapon().name !== name; i++) {
      round.act({ kind: "cycleWeapon", delta: 1 });
    }
    expect(round.currentWeapon().name).toBe(name);
  }

  const turnOver = (r: Round): boolean => r.phase.kind === "aiming" || r.phase.kind === "over";

  /** Every cell a Tank covers is air, and dirt touches it on its left, right and top. */
  function expectEncased(terrain: Terrain, t: Tank): void {
    for (let x = t.x - TANK_HALF_WIDTH; x <= t.x + TANK_HALF_WIDTH; x++) {
      for (let y = t.y - TANK_HEIGHT; y < t.y; y++) {
        expect(occupiesCell(t, x, y)).toBe(true);
        expect(terrain.isSolid(x, y), `dirt inside the Tank at ${x},${y}`).toBe(false);
      }
      expect(terrain.isSolid(x, t.y - TANK_HEIGHT - 1), `no dirt above column ${x}`).toBe(true);
    }
    for (let y = t.y - TANK_HEIGHT; y < t.y; y++) {
      expect(terrain.isSolid(t.x - TANK_HALF_WIDTH - 1, y)).toBe(true);
      expect(terrain.isSolid(t.x + TANK_HALF_WIDTH + 1, y)).toBe(true);
    }
  }

  /** Solid cells with air below them that no living Tank fills. */
  function hangingCells(round: Round): number {
    let hanging = 0;
    for (let x = 0; x < FIELD_WIDTH; x++) {
      for (let y = 0; y < FIELD_HEIGHT - 1; y++) {
        if (!round.terrain.isSolid(x, y) || round.terrain.isSolid(x, y + 1)) continue;
        if (round.tanks.some((t) => occupiesCell(t, x, y + 1))) continue;
        hanging++;
      }
    }
    return hanging;
  }

  it("leaves a mound and no crater with a Dirt Ball on flat ground, and no one loses Health", () => {
    const { round, firer, other } = scenario(100, 500);
    choose(round, "Dirt Ball");
    const before = round.terrain.cells.slice();
    firer.angle = 60;
    firer.power = 300;
    round.act({ kind: "fire" });
    runUntil(round, (r) => r.phase.kind === "resolving" && r.phase.explosions.length > 0);
    if (round.phase.kind !== "resolving") return expect.fail("expected resolving");
    expect(round.phase.explosions[0]?.kind).toBe("dirt");
    runUntil(round, turnOver);

    let added = 0;
    let removed = 0;
    round.terrain.cells.forEach((cell, i) => {
      if (cell === 1 && before[i] === 0) added++;
      if (cell === 0 && before[i] === 1) removed++;
    });
    expect(added).toBeGreaterThan(0);
    expect(removed).toBe(0);
    expect(firer.health).toBe(MAX_HEALTH);
    expect(other.health).toBe(MAX_HEALTH);
    expect(round.earnings).toEqual([0, 0]);
  });

  it("buries a Tank under a Ton of Dirt: no dirt inside it, dirt all around it", () => {
    const { round, firer } = scenario(200, 500);
    choose(round, "Ton of Dirt");
    fireStraightUp(round, firer);
    runUntil(round, turnOver);
    expect(firer.health).toBe(MAX_HEALTH);
    expect(firer.y).toBe(GROUND);
    expectEncased(round.terrain, firer);
  });

  it("lets a buried Tank fire: a Baby Missile explodes at the barrel tip and carves its way out", () => {
    const { round, firer } = scenario(200, 500);
    const c = centre(firer);
    round.terrain.fillCircle(c.x, c.y, weaponNamed("Dirt Ball").radius, (x, y) =>
      occupiesCell(firer, x, y),
    );
    expectEncased(round.terrain, firer);
    const tip = barrelTip({ ...firer, angle: 90 });
    fireStraightUp(round, firer);
    round.tick(TICK_SECONDS);
    if (round.phase.kind !== "resolving") return expect.fail("expected resolving");
    expect(round.phase.projectiles).toHaveLength(0);
    const [explosion] = round.phase.explosions;
    if (!explosion) return expect.fail("expected an Explosion");
    expect(explosion.kind).toBe("carve");
    expect(Math.hypot(explosion.x - tip.x, explosion.y - tip.y)).toBeLessThan(2);
    expect(firer.health).toBeLessThan(MAX_HEALTH);
    runUntil(round, turnOver);
    for (let y = firer.y - TANK_HEIGHT - 1; y >= 0; y--) {
      expect(round.terrain.isSolid(firer.x, y), `dirt above the barrel at row ${y}`).toBe(false);
    }
  });

  it("Settles dirt added in mid-air before the Turn ends", () => {
    const { round, firer } = scenario(200, 500);
    // Stand the firer on a narrow column of dirt 100 px above the ground.
    round.terrain.flatten(190, 210, GROUND - 100);
    firer.y = GROUND - 100;
    choose(round, "Dirt Ball");
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "resolving" && r.phase.explosions.length > 0);
    expect(hangingCells(round)).toBeGreaterThan(0);
    runUntil(round, turnOver);
    expect(hangingCells(round)).toBe(0);
    expect(round.terrain.surfaceY(225)).toBeLessThan(GROUND);
  });
});

describe("Round Death Animations", () => {
  const settled = (r: Round): boolean => r.phase.kind === "aiming" || r.phase.kind === "over";

  /** Ticks a Death Animation lasts, aged the same way as an Explosion. */
  function dyingTicks(): number {
    let ticks = 0;
    for (let elapsed = 0; elapsed < DEATH_ANIMATION_SECONDS; elapsed += TICK_SECONDS) ticks++;
    return ticks;
  }

  /** Flat Terrain at GROUND, Wind 0, and three Humans' Tanks moved to these columns, in Turn order. */
  function threeTanks(xs: readonly [number, number, number]): {
    round: Round;
    tanks: [Tank, Tank, Tank];
  } {
    const round = new Round(1, createPlayers([HUMAN, HUMAN, HUMAN]), new Rng(1));
    round.wind = 0;
    round.terrain.flatten(0, FIELD_WIDTH - 1, GROUND);
    const tanks = round.turnOrder.map((id) => round.tankOf(id)) as [Tank, Tank, Tank];
    tanks.forEach((t, i) => {
      t.x = xs[i] as number;
      t.y = GROUND;
    });
    return { round, tanks };
  }

  /** The Round's Death Animations; fails unless it is in the dying phase. */
  function animationsOf(round: Round): DeathAnimation[] {
    const { phase } = round;
    if (phase.kind !== "dying") return expect.fail(`${phase.kind}, not dying`);
    return phase.animations;
  }

  /** Give the current Human one MIRV, choose it, and fire it at 60° with 400 Power. */
  function fireMirv(round: Round, firer: Tank): void {
    round.inventoryOf(firer.playerId).add("MIRV", 1);
    round.act({ kind: "cycleWeapon", delta: 1 });
    firer.angle = 60;
    firer.power = 400;
    round.act({ kind: "fire" });
  }

  it("enters the dying phase after Settling, with one Death Animation where the Tank stood", () => {
    const { round, firer, other } = scenario(300, 312);
    other.health = 1;
    fireStraightUp(round, firer);
    const phases: string[] = [];
    runUntil(round, (r) => {
      if (phases.at(-1) !== r.phase.kind) phases.push(r.phase.kind);
      return r.phase.kind === "dying";
    });
    expect(phases).toEqual(["resolving", "settling", "dying"]);
    expect(round.currentPlayerId).toBe(firer.playerId);
    expect(animationsOf(round)).toEqual([
      { playerId: other.playerId, kind: expect.any(String), x: other.x, y: other.y, elapsed: 0 },
    ]);
  });

  it("starts the next Turn only once the Death Animation's duration has passed", () => {
    const { round, tanks } = threeTanks([150, 300, 162]);
    const [firer, , victim] = tanks;
    victim.health = 1;
    fireStraightUp(round, firer);
    // The Baby Missile lands on the firer, 12 px from the victim; the third Tank is out of reach.
    runUntil(round, (r) => r.phase.kind === "dying");
    let ticks = 0;
    runUntil(round, (r) => {
      if (r.phase.kind === "dying") {
        ticks++;
        expect(r.currentPlayerId).toBe(firer.playerId);
      }
      return r.phase.kind !== "dying";
    });
    expect(ticks).toBe(dyingTicks());
    expect(round.phase.kind).toBe("aiming");
    expect(round.currentPlayerId).not.toBe(firer.playerId);
  });

  it("ages every Death Animation by each tick's time", () => {
    const { round, other } = scenario(150, 500);
    other.health = 0;
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "dying");
    round.tick(TICK_SECONDS);
    round.tick(TICK_SECONDS);
    expect(animationsOf(round)[0]?.elapsed).toBeCloseTo(2 * TICK_SECONDS, 10);
  });

  it("never enters the dying phase when no Tank was destroyed", () => {
    const { round, firer } = scenario(150, 500);
    fireStraightUp(round, firer);
    const phases = new Set<string>();
    runUntil(round, (r) => {
      phases.add(r.phase.kind);
      return r.phase.kind === "aiming";
    });
    expect(firer.health).toBeLessThan(MAX_HEALTH);
    expect(phases.has("dying")).toBe(false);
    expect(round.currentPlayerId).not.toBe(firer.playerId);
  });

  it("ends the Round in a win only after the final Death Animation", () => {
    const { round, firer, other } = scenario(300, 312);
    other.health = 1;
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "dying");
    let ticks = 0;
    runUntil(round, (r) => {
      if (r.phase.kind === "dying") ticks++;
      return r.phase.kind === "over";
    });
    expect(ticks).toBe(dyingTicks());
    expect(round.phase).toEqual({
      kind: "over",
      result: { kind: "win", playerId: firer.playerId },
    });
  });

  it("animates both Tanks of a Draw together, then ends in the Draw", () => {
    const { round, firer, other } = scenario(300, 312);
    firer.health = 1;
    other.health = 1;
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "dying");
    expect(
      animationsOf(round)
        .map((a) => a.playerId)
        .sort(),
    ).toEqual([0, 1]);
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({ kind: "over", result: { kind: "draw" } });
  });

  it("animates a Tank destroyed by an Explosion and one destroyed by Fall Damage together", () => {
    const { round, tanks } = threeTanks([150, 162, 500]);
    const [firer, shot, faller] = tanks;
    shot.health = 1;
    faller.health = 1;
    undercutTank(round, faller, 30);
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "dying");
    expect(
      animationsOf(round)
        .map((a) => a.playerId)
        .sort(),
    ).toEqual([shot.playerId, faller.playerId].sort());
    expect(firer.health).toBeGreaterThan(0);
  });

  it("animates a Tank that sank to the bottom of the field", () => {
    const { round, other } = scenario(150, 500);
    for (let y = other.y; y < FIELD_HEIGHT; y++) round.terrain.carveCircle(other.x, y, 12);
    round.phase = { kind: "settling" };
    runUntil(round, (r) => r.phase.kind === "dying");
    expect(other.health).toBe(0);
    expect(animationsOf(round).map((a) => a.playerId)).toEqual([other.playerId]);
  });

  it("animates every Tank a MIRV's pieces destroy together", () => {
    // Find where the MIRV's outermost pieces land, then stand a 1-Health Tank under each.
    const dry = threeTanks([100, 620, 630]);
    fireMirv(dry.round, dry.tanks[0]);
    const xs: number[] = [];
    runUntil(dry.round, (r) => {
      if (r.phase.kind === "resolving") {
        for (const e of r.phase.explosions) if (!xs.includes(e.x)) xs.push(e.x);
      }
      return settled(r);
    });
    const left = Math.round(Math.min(...xs));
    const right = Math.round(Math.max(...xs));

    const { round, tanks } = threeTanks([100, left, right]);
    const [firer, a, b] = tanks;
    a.health = 1;
    b.health = 1;
    fireMirv(round, firer);
    runUntil(round, (r) => r.phase.kind !== "resolving" && r.phase.kind !== "settling");
    expect(
      animationsOf(round)
        .map((x) => x.playerId)
        .sort(),
    ).toEqual([a.playerId, b.playerId].sort());
  });

  it("reports a destroyed Tank as a husk until its Death Animation starts, then as gone", () => {
    const { round, firer, other } = scenario(300, 312);
    other.health = 1;
    expect(round.isHusk(other.playerId)).toBe(false);
    expect(round.isGone(other.playerId)).toBe(false);
    fireStraightUp(round, firer);
    runUntil(round, () => other.health === 0);
    runUntil(round, (r) => {
      if (r.phase.kind !== "dying") {
        expect(r.isHusk(other.playerId)).toBe(true);
        expect(r.isGone(other.playerId)).toBe(false);
      }
      return r.phase.kind === "dying";
    });
    expect(round.isHusk(other.playerId)).toBe(false);
    expect(round.isGone(other.playerId)).toBe(true);
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.isHusk(other.playerId)).toBe(false);
    expect(round.isGone(other.playerId)).toBe(true);
    // A living Tank is neither.
    expect(round.isHusk(firer.playerId)).toBe(false);
    expect(round.isGone(firer.playerId)).toBe(false);
  });

  it("never lets a husk be hit", () => {
    const { round, firer, other } = scenario(300, 312);
    other.health = 1;
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.isHusk(other.playerId));
    const c = centre(other);
    expect(hitTest(other, c.x, c.y)).toBe(false);
  });

  it("changes no Health, Shield, Terrain or earnings while dying", () => {
    const { round, tanks } = threeTanks([150, 300, 162]);
    const [firer, survivor, victim] = tanks;
    victim.health = 1;
    survivor.shield = { name: "Heavy Shield", strength: 10 };
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "dying");
    const before = {
      tanks: structuredClone(round.tanks),
      cells: [...round.terrain.cells],
      version: round.terrain.version,
      earnings: [...round.earnings],
    };
    runUntil(round, (r) => r.phase.kind !== "dying");
    expect(round.tanks).toEqual(before.tanks);
    expect([...round.terrain.cells]).toEqual(before.cells);
    expect(round.terrain.version).toBe(before.version);
    expect(round.earnings).toEqual(before.earnings);
  });

  it("ignores actions while dying", () => {
    const { round, tanks } = threeTanks([150, 300, 162]);
    const [firer, , victim] = tanks;
    victim.health = 1;
    fireStraightUp(round, firer);
    runUntil(round, (r) => r.phase.kind === "dying");
    const angle = firer.angle;
    round.act({ kind: "adjustAngle", delta: 10 });
    round.act({ kind: "fire" });
    expect(firer.angle).toBe(angle);
    expect(round.phase.kind).toBe("dying");
  });
});

describe("Round Death Animation kinds", () => {
  /** Both Tanks of a two-Human Round already destroyed, from these seeds; their kinds by Player. */
  function kindsWhenBothDie(seed: number, flavourSeed: number): DeathAnimationKind[] {
    const players = createPlayers([HUMAN, HUMAN]);
    const round = new Round(1, players, new Rng(seed), emptyLoadout(players), new Rng(flavourSeed));
    for (const t of round.tanks) t.health = 0;
    round.phase = { kind: "settling" };
    let kinds: DeathAnimationKind[] = [];
    runUntil(round, ({ phase }) => {
      if (phase.kind !== "dying") return false;
      kinds = [...phase.animations].sort((a, b) => a.playerId - b.playerId).map((a) => a.kind);
      return true;
    });
    expect(kinds).toHaveLength(2);
    return kinds;
  }

  it("picks every Death Animation's kind from the four kinds", () => {
    for (let flavourSeed = 1; flavourSeed <= 20; flavourSeed++) {
      for (const kind of kindsWhenBothDie(1, flavourSeed)) {
        expect(DEATH_ANIMATION_KINDS).toContain(kind);
      }
    }
  });

  it("picks the same kinds for the same deaths from the same seeds", () => {
    for (let flavourSeed = 1; flavourSeed <= 20; flavourSeed++) {
      expect(kindsWhenBothDie(3, flavourSeed)).toEqual(kindsWhenBothDie(3, flavourSeed));
    }
  });

  it("picks every kind over many flavour seeds", () => {
    const seen = new Set<DeathAnimationKind>();
    for (let flavourSeed = 1; flavourSeed <= 50; flavourSeed++) {
      for (const kind of kindsWhenBothDie(1, flavourSeed)) seen.add(kind);
    }
    expect([...seen].sort()).toEqual([...DEATH_ANIMATION_KINDS].sort());
  });

  it("picks kinds from the flavour Rng only: the simulation seed never changes them", () => {
    for (let flavourSeed = 1; flavourSeed <= 20; flavourSeed++) {
      expect(kindsWhenBothDie(1, flavourSeed)).toEqual(kindsWhenBothDie(99, flavourSeed));
    }
  });
});

describe("Round Epitaphs", () => {
  /** Ticks until something counted down by each tick's time from `seconds` runs out. */
  function ticksFor(seconds: number): number {
    let ticks = 0;
    for (let left = seconds; left > 0; left -= TICK_SECONDS) ticks++;
    return ticks;
  }

  /** Flat Terrain, Wind 0, the firer at 300 and the other Tank 12 px away, with this flavour seed. */
  function closeRound(flavourSeed: number): { round: Round; firer: Tank; other: Tank } {
    const players = createPlayers([HUMAN, HUMAN]);
    const round = new Round(1, players, new Rng(1), emptyLoadout(players), new Rng(flavourSeed));
    round.wind = 0;
    round.terrain.flatten(0, FIELD_WIDTH - 1, GROUND);
    const firer = round.currentTank();
    const other = round.tanks.find((t) => t !== firer) as Tank;
    firer.x = 300;
    firer.y = GROUND;
    other.x = 312;
    other.y = GROUND;
    return { round, firer, other };
  }

  /** The firer's Baby Missile lands on itself and destroys the chosen Tanks. */
  function shootAndDestroy(flavourSeed: number, firerDies: boolean, otherDies: boolean) {
    const scene = closeRound(flavourSeed);
    if (firerDies) scene.firer.health = 1;
    if (otherDies) scene.other.health = 1;
    fireStraightUp(scene.round, scene.firer);
    return scene;
  }

  it("adds one Epitaph per destroyed Tank as its Death Animation starts", () => {
    const { round } = shootAndDestroy(1, true, true);
    runUntil(round, (r) => {
      if (r.phase.kind !== "dying") expect(r.lines).toEqual([]);
      return r.phase.kind === "dying";
    });
    expect(round.lines.map((l) => l.playerId).sort()).toEqual([0, 1]);
    for (const line of round.lines) {
      expect(line.kind).toBe("epitaph");
      expect(line.secondsLeft).toBe(EPITAPH_SECONDS);
      expect([...EPITAPHS, ...SELF_INFLICTED_EPITAPHS]).toContain(line.text);
    }
  });

  it("counts Epitaphs down every tick, after the Round is over too, then removes them", () => {
    const { round, other } = shootAndDestroy(1, false, true);
    runUntil(round, (r) => r.phase.kind === "dying");
    const [epitaph] = round.lines;
    expect(epitaph?.playerId).toBe(other.playerId);
    let ticks = 0;
    runUntil(round, (r) => {
      if (r.lines.length === 0) return true;
      ticks++;
      return false;
    });
    expect(ticks).toBe(ticksFor(EPITAPH_SECONDS));
    expect(ticksFor(EPITAPH_SECONDS)).toBeGreaterThan(ticksFor(DEATH_ANIMATION_SECONDS));
    expect(round.phase.kind).toBe("over");
  });

  it("never holds up the next Turn", () => {
    const { round, firer } = shootAndDestroy(1, false, true);
    runUntil(round, (r) => r.phase.kind === "over");
    expect(round.phase).toEqual({
      kind: "over",
      result: { kind: "win", playerId: firer.playerId },
    });
    expect(round.lines).toHaveLength(1);
    expect(round.lines[0]?.secondsLeft).toBeCloseTo(
      EPITAPH_SECONDS - ticksFor(DEATH_ANIMATION_SECONDS) * TICK_SECONDS,
      10,
    );
  });

  it("can give a self-inflicted Epitaph only to a Tank that destroyed itself", () => {
    const selfTexts = new Set<string>();
    const otherTexts = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const own = shootAndDestroy(seed, true, false);
      runUntil(own.round, (r) => r.phase.kind === "dying");
      for (const l of own.round.lines) selfTexts.add(l.text);
      const other = shootAndDestroy(seed, false, true);
      runUntil(other.round, (r) => r.phase.kind === "dying");
      for (const l of other.round.lines) otherTexts.add(l.text);
    }
    expect(SELF_INFLICTED_EPITAPHS.some((t) => selfTexts.has(t))).toBe(true);
    expect(SELF_INFLICTED_EPITAPHS.some((t) => otherTexts.has(t))).toBe(false);
  });

  it("gives the same Epitaphs from the same seeds", () => {
    const texts = (flavourSeed: number): string[] => {
      const { round } = shootAndDestroy(flavourSeed, true, true);
      runUntil(round, (r) => r.phase.kind === "dying");
      return round.lines.map((l) => `${l.playerId}:${l.text}`);
    };
    expect(texts(7)).toEqual(texts(7));
    const varied = new Set(Array.from({ length: 20 }, (_, i) => texts(i + 1).join("|")));
    expect(varied.size).toBeGreaterThan(1);
  });

  it("leaves the outcome as the simulation Rng alone decides it, whatever the flavour seed", () => {
    const outcome = (flavourSeed: number) => {
      const { round } = shootAndDestroy(flavourSeed, false, true);
      runUntil(round, (r) => r.phase.kind === "over");
      return { phase: round.phase, tanks: round.tanks, earnings: round.earnings };
    };
    expect(outcome(1)).toEqual(outcome(2));
  });
});
