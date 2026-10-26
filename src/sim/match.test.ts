import { describe, expect, it, vi } from "vitest";
import { FOR_SALE, MAX_PLAYERS, MIN_PLAYERS, TICK_SECONDS, forSaleNamed } from "./constants";
import { emptyLoadout } from "./inventory";
import { Match, type MatchSetup } from "./match";
import { createPlayers } from "./players";
import { Rng } from "./rng";
import { Round, type RoundResult } from "./round";
import { newTank } from "./tank";
import type { Line, PlayerSetup, ShopName } from "./types";

// These tests describe play from a $2,000 start; keep them independent of the tuned constant.
vi.mock("./constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./constants")>()),
  STARTING_MONEY: 2_000,
}));

const human: PlayerSetup = { kind: "human" };
const moron: PlayerSetup = { kind: "computer", personality: "moron" };

/** A Match past the Shop, with Round 1 started. */
function newMatch(overrides: Partial<MatchSetup> = {}): Match {
  const match = new Match({ players: [human, human], rounds: 3, seed: 1, ...overrides });
  skipShop(match);
  return match;
}

/** Every Human leaves the Shop without buying anything. */
function skipShop(match: Match): void {
  for (let shopper = match.currentShopper; shopper !== null; shopper = match.currentShopper) {
    match.finishShopping(shopper);
  }
}

/** Force the current Round to end with `result`, record it, and start the next Round if any. */
function finishRound(match: Match, result: RoundResult): void {
  match.requireRound().phase = { kind: "over", result };
  match.recordRoundResult();
  if (!match.isOver()) {
    match.startNextRound();
    skipShop(match);
  }
}

/**
 * Every Death Animation and line a Round shows, in order, as it is ticked to its end with every
 * Human firing straight up as soon as their Turn begins.
 */
function flavourOf(round: Round, maxTicks = 200_000): string[] {
  const log: string[] = [];
  const seen = new Set<Readonly<Line>>();
  let dying = false;
  for (let ticks = 0; round.phase.kind !== "over"; ticks++) {
    if (ticks >= maxTicks) expect.fail(`Round did not finish within ${maxTicks} ticks`);
    if (round.phase.kind === "aiming") {
      round.currentTank().angle = 90;
      round.act({ kind: "fire" });
    }
    round.tick(TICK_SECONDS);
    for (const line of round.lines) {
      if (seen.has(line)) continue;
      seen.add(line);
      log.push(`${line.kind} ${line.playerId}: ${line.text}`);
    }
    const { phase } = round;
    if (phase.kind === "dying" && !dying) {
      for (const a of phase.animations) log.push(`animation ${a.playerId}: ${a.kind}`);
    }
    dying = phase.kind === "dying";
  }
  return log;
}

const win = (playerId: number): RoundResult => ({ kind: "win", playerId });
const draw: RoundResult = { kind: "draw" };

describe("Match", () => {
  it("creates the Players and Round 1", () => {
    const match = newMatch({ players: [human, moron] });
    expect(match.players.map((p) => p.kind)).toEqual(["human", "computer"]);
    expect(match.players.map((p) => p.personality)).toEqual([null, "moron"]);
    expect(match.totalRounds).toBe(3);
    expect(match.roundWins).toEqual([0, 0]);
    expect(match.results).toEqual([]);
    expect(match.requireRound().number).toBe(1);
    expect(match.isOver()).toBe(false);
  });

  it("creates one Player per setup, in order, with that setup's kind and Personality", () => {
    const match = newMatch({ players: [moron, human] });
    expect(match.players.map((p) => [p.id, p.name, p.kind, p.personality])).toEqual([
      [0, "Player 1", "computer", "moron"],
      [1, "Player 2", "human", null],
    ]);
  });

  it("rejects Round counts outside 1..99", () => {
    expect(() => newMatch({ rounds: 0 })).toThrow();
    expect(() => newMatch({ rounds: 100 })).toThrow();
    expect(() => newMatch({ rounds: 1.5 })).toThrow();
    expect(() => newMatch({ rounds: 1 })).not.toThrow();
    expect(() => newMatch({ rounds: 99 })).not.toThrow();
  });

  it("rejects Player counts outside 2..10", () => {
    const players = (n: number): PlayerSetup[] => Array.from({ length: n }, () => human);
    expect(() => newMatch({ players: players(MIN_PLAYERS - 1) })).toThrow(/Players/);
    expect(() => newMatch({ players: players(MAX_PLAYERS + 1) })).toThrow(/Players/);
    expect(() => newMatch({ players: players(MIN_PLAYERS) })).not.toThrow();
    expect(() => newMatch({ players: players(MAX_PLAYERS) })).not.toThrow();
    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(10);
  });

  it("tallies Round Wins and Draws", () => {
    const match = newMatch({ rounds: 4 });
    finishRound(match, win(1));
    finishRound(match, draw);
    finishRound(match, win(1));
    finishRound(match, win(0));
    expect(match.results).toEqual([win(1), draw, win(1), win(0)]);
    expect(match.roundWins).toEqual([1, 2]);
  });

  it("numbers Rounds consecutively", () => {
    const match = newMatch();
    finishRound(match, draw);
    expect(match.requireRound().number).toBe(2);
    finishRound(match, draw);
    expect(match.requireRound().number).toBe(3);
  });

  it("refuses to record a Round that is not over, or twice", () => {
    const match = newMatch();
    expect(() => match.recordRoundResult()).toThrow();
    match.requireRound().phase = { kind: "over", result: draw };
    match.recordRoundResult();
    expect(() => match.recordRoundResult()).toThrow();
    expect(match.results).toHaveLength(1);
  });

  it("refuses to start the next Round before recording the current one", () => {
    const match = newMatch();
    expect(() => match.startNextRound()).toThrow();
  });

  it("is over after totalRounds recorded results, then refuses another Round", () => {
    const match = newMatch({ rounds: 3 });
    finishRound(match, win(0));
    finishRound(match, draw);
    expect(match.isOver()).toBe(false);
    finishRound(match, win(1));
    expect(match.isOver()).toBe(true);
    expect(() => match.startNextRound()).toThrow();
  });

  it("orders standings by Round Wins descending, then by id", () => {
    const match = newMatch({ rounds: 3 });
    finishRound(match, win(1));
    finishRound(match, win(1));
    finishRound(match, win(0));
    expect(match.standings().map((s) => [s.player.id, s.roundWins])).toEqual([
      [1, 2],
      [0, 1],
    ]);

    const tied = newMatch({ rounds: 2 });
    finishRound(tied, win(1));
    finishRound(tied, win(0));
    expect(tied.standings().map((s) => [s.player.id, s.roundWins])).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it("names the single Player with the most Round Wins as winner", () => {
    const match = newMatch({ rounds: 3 });
    finishRound(match, win(1));
    finishRound(match, draw);
    finishRound(match, draw);
    expect(match.winner()).toBe(match.players[1]);
  });

  it("has no winner when the top is tied", () => {
    const allDraws = newMatch({ rounds: 2 });
    finishRound(allDraws, draw);
    finishRound(allDraws, draw);
    expect(allDraws.winner()).toBeNull();

    const split = newMatch({ rounds: 2 });
    finishRound(split, win(0));
    finishRound(split, win(1));
    expect(split.winner()).toBeNull();
  });

  it("starts every Player with $2,000 and nothing earned", () => {
    const match = newMatch({ players: [human, human, human] });
    expect(match.money).toEqual([2000, 2000, 2000]);
    expect(match.earnedThisRound).toEqual([0, 0, 0]);
  });

  it("adds the Round's earnings, plus $5,000 for the Round Win", () => {
    const match = newMatch();
    match.requireRound().earnings[0] = 1250;
    match.requireRound().earnings[1] = 2500;
    finishRound(match, win(1));
    expect(match.earnedThisRound).toEqual([1250, 7500]);
    expect(match.money).toEqual([3250, 9500]);
  });

  it("pays no Round Win bonus for a Draw", () => {
    const match = newMatch();
    match.requireRound().earnings[0] = 500;
    finishRound(match, draw);
    expect(match.earnedThisRound).toEqual([500, 0]);
    expect(match.money).toEqual([2500, 2000]);
  });

  it("carries Money into later Rounds and replaces what was earned each Round", () => {
    const match = newMatch();
    match.requireRound().earnings[0] = 1000;
    finishRound(match, win(0));
    expect(match.requireRound().earnings).toEqual([0, 0]);
    match.requireRound().earnings[1] = 300;
    finishRound(match, draw);
    expect(match.earnedThisRound).toEqual([0, 300]);
    expect(match.money).toEqual([8000, 2300]);
  });

  it("never lets Money decide standings or the winner", () => {
    const match = newMatch({ rounds: 1 });
    match.requireRound().earnings[0] = 100_000;
    finishRound(match, win(1));
    expect(match.money[0]).toBeGreaterThan(match.money[1] ?? 0);
    expect(match.standings().map((s) => s.player.id)).toEqual([1, 0]);
    expect(match.winner()?.id).toBe(1);
  });

  it("is reproducible from its seed across Rounds", () => {
    const a = newMatch({ seed: 42 });
    const b = newMatch({ seed: 42 });
    finishRound(a, draw);
    finishRound(b, draw);
    expect(b.requireRound().wind).toBe(a.requireRound().wind);
    expect(b.requireRound().turnOrder).toEqual(a.requireRound().turnOrder);
    expect(b.requireRound().tanks).toEqual(a.requireRound().tanks);
    expect(b.requireRound().terrain.cells).toEqual(a.requireRound().terrain.cells);
  });

  it("shows the same Death Animations, Epitaphs and Taunts in every Round for the same seed", () => {
    const flavourOfMatch = (seed: number): string[] => {
      const match = newMatch({ players: [moron, moron], seed });
      const log: string[] = [];
      while (!match.isOver()) {
        log.push(...flavourOf(match.requireRound()));
        match.recordRoundResult();
        if (!match.isOver()) {
          match.startNextRound();
          skipShop(match);
        }
      }
      return log;
    };
    const log = flavourOfMatch(42);
    expect(flavourOfMatch(42)).toEqual(log);
    expect(log.some((entry) => entry.startsWith("epitaph"))).toBe(true);
    expect(log.some((entry) => entry.startsWith("taunt"))).toBe(true);
    expect(log.some((entry) => entry.startsWith("animation"))).toBe(true);
  });

  it("draws flavour from its own stream, not one seeded like the simulation's", () => {
    const players = createPlayers([human, human]);
    const match = newMatch({ seed: 42 });
    const mirrored = new Round(1, players, new Rng(42), emptyLoadout(players), new Rng(42));
    // The same Round as far as the simulation goes...
    expect(mirrored.tanks).toEqual(match.requireRound().tanks);
    expect(mirrored.terrain.cells).toEqual(match.requireRound().terrain.cells);
    // ...but not the same flavour.
    expect(flavourOf(mirrored)).not.toEqual(flavourOf(match.requireRound()));
  });
});

describe("Match Shop", () => {
  const shopping = (players: PlayerSetup[]): Match => new Match({ players, rounds: 3, seed: 1 });

  it("opens the Shop before Round 1 for the Humans only, in Player order", () => {
    const match = shopping([moron, human, moron, human]);
    expect(match.round).toBeNull();
    expect(match.stage).toEqual({ kind: "shopping", shoppers: [1, 3] });
    expect(match.currentShopper).toBe(1);
    match.finishShopping(1);
    expect(match.round).toBeNull();
    expect(match.currentShopper).toBe(3);
    match.finishShopping(3);
    expect(match.currentShopper).toBeNull();
    expect(match.stage).toEqual({ kind: "playing" });
    expect(match.requireRound().number).toBe(1);
  });

  it("starts an all-Computer Match's Round at once", () => {
    const match = shopping([moron, moron]);
    expect(match.stage).toEqual({ kind: "playing" });
    expect(match.currentShopper).toBeNull();
    expect(match.requireRound().number).toBe(1);
  });

  it("lets every Computer Player shop before any Human's Shop screen", () => {
    const match = shopping([moron, human, moron]);
    expect(match.currentShopper).toBe(1);
    // $2,000 buys exactly one Bundle of Missiles, the only Weapon that cheap.
    expect(match.money).toEqual([125, 2000, 125]);
    expect(match.inventoryOf(0).count("Missile")).toBe(5);
    expect(match.inventoryOf(1).count("Missile")).toBe(0);
    expect(match.inventoryOf(2).count("Missile")).toBe(5);
  });

  it("lets Computer Players shop again before every later Round, spending what they earned", () => {
    const match = shopping([moron, moron]);
    match.requireRound().earnings[0] = 40_000;
    finishRound(match, win(0));
    const cheapest = Math.min(...FOR_SALE.map((forSale) => forSale.price));
    expect(match.money[0]).toBeGreaterThanOrEqual(0);
    expect(match.money[0]).toBeLessThan(cheapest);
    const inventory = match.inventoryOf(0);
    expect(FOR_SALE.some((forSale) => inventory.count(forSale.name) > 0)).toBe(true);
  });

  it("lets Computer Players buy Items, which never join their owned Weapons", () => {
    const itemNames: ShopName[] = ["Shield", "Heavy Shield", "Parachute"];
    let itemsBought = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const match = new Match({ players: [moron, moron], rounds: 3, seed });
      match.requireRound().earnings[0] = 100_000;
      finishRound(match, win(0));
      const inventory = match.inventoryOf(0);
      for (const name of itemNames) itemsBought += inventory.count(name);
      for (const weapon of inventory.owned()) expect(itemNames).not.toContain(weapon.name);
    }
    expect(itemsBought).toBeGreaterThan(0);
  });

  it("sells a Parachute Bundle like any other", () => {
    const match = shopping([human, human]);
    const parachute = forSaleNamed("Parachute");
    match.money[0] = parachute.price;
    match.buy(0, "Parachute");
    expect(match.money[0]).toBe(0);
    expect(match.inventoryOf(0).count("Parachute")).toBe(parachute.bundle);
    expect(() => match.buy(0, "Parachute")).toThrow();
  });

  it("refuses an Item the shopper cannot afford", () => {
    const match = shopping([human, human]);
    const heavy = forSaleNamed("Heavy Shield");
    match.money[0] = heavy.price - 1;
    expect(() => match.buy(0, "Heavy Shield")).toThrow();
    expect(match.money[0]).toBe(heavy.price - 1);
    expect(match.inventoryOf(0).count("Heavy Shield")).toBe(0);
  });

  it("deducts the price and adds the Bundle on each purchase", () => {
    const match = shopping([human, human]);
    match.buy(0, "Missile");
    expect(match.money[0]).toBe(2000 - 1875);
    expect(match.inventoryOf(0).count("Missile")).toBe(5);
    expect(match.money[1]).toBe(2000);
  });

  it("refuses a purchase the shopper cannot afford", () => {
    const match = shopping([human, human]);
    expect(() => match.buy(0, "Nuke")).toThrow();
    match.buy(0, "Missile");
    expect(() => match.buy(0, "Missile")).toThrow();
    expect(match.money[0]).toBe(125);
    expect(match.inventoryOf(0).count("Missile")).toBe(5);
  });

  it("refuses the Baby Missile, which is never sold", () => {
    const match = shopping([human, human]);
    expect(() => match.buy(0, "Baby Missile")).toThrow();
  });

  it("refuses to buy or finish out of turn", () => {
    const match = shopping([human, human]);
    expect(() => match.buy(1, "Missile")).toThrow();
    expect(() => match.finishShopping(1)).toThrow();
    match.finishShopping(0);
    match.finishShopping(1);
    expect(() => match.buy(0, "Missile")).toThrow();
    expect(() => match.finishShopping(0)).toThrow();
  });

  it("opens the Shop again before every later Round", () => {
    const match = shopping([moron, human]);
    match.finishShopping(1);
    match.requireRound().phase = { kind: "over", result: win(0) };
    match.recordRoundResult();
    match.startNextRound();
    expect(match.stage).toEqual({ kind: "shopping", shoppers: [1] });
    expect(() => match.startNextRound()).toThrow();
    expect(() => match.recordRoundResult()).toThrow();
    match.finishShopping(1);
    expect(match.requireRound().number).toBe(2);
  });

  it("carries Money and the Inventory across Rounds, even for a destroyed Tank", () => {
    const match = shopping([human, human]);
    match.money[0] = 2000 + forSaleNamed("Shield").price + forSaleNamed("Parachute").price;
    match.buy(0, "Shield");
    match.buy(0, "Parachute");
    match.buy(0, "Missile");
    match.finishShopping(0);
    match.finishShopping(1);
    const round = match.requireRound();
    round.tankOf(0).health = 0;
    round.phase = { kind: "over", result: win(1) };
    match.recordRoundResult();
    match.startNextRound();
    expect(match.money).toEqual([125, 7000]);
    expect(match.inventoryOf(0).count("Missile")).toBe(5);
    // One Shield went up at the start of Round 1.
    expect(match.inventoryOf(0).count("Shield")).toBe(forSaleNamed("Shield").bundle - 1);
    expect(match.inventoryOf(0).count("Parachute")).toBe(forSaleNamed("Parachute").bundle);
    expect(match.currentShopper).toBe(0);
    match.finishShopping(0);
    match.buy(1, "Missile");
    expect(match.money[1]).toBe(7000 - 1875);
  });

  it("lends the Round the Match's Inventories, so firing uses them up", () => {
    const match = shopping([human, human]);
    const shopper = 0;
    match.buy(shopper, "Missile");
    match.finishShopping(0);
    match.finishShopping(1);
    const round = match.requireRound();
    expect(round.inventoryOf(shopper)).toBe(match.inventoryOf(shopper));
  });
});

/**
 * Tick a Match to completion, recording each Round, failing past maxTicks. `afterShop` runs
 * whenever the Shop has just closed and after the last Round is recorded.
 */
function playOut(match: Match, maxTicks: number, afterShop: () => void = () => {}): number {
  let ticks = 0;
  afterShop();
  while (!match.isOver()) {
    if (ticks++ >= maxTicks) expect.fail(`Match did not finish within ${maxTicks} ticks`);
    const round = match.requireRound();
    round.tick(TICK_SECONDS);
    if (round.phase.kind === "over") {
      match.recordRoundResult();
      if (!match.isOver()) match.startNextRound();
      afterShop();
    }
  }
  return ticks;
}

describe("Match integration", () => {
  it("runs a 10-Moron, 2-Round Match to completion purely by ticking", () => {
    const players = Array.from({ length: MAX_PLAYERS }, () => moron);
    const match = new Match({ players, rounds: 2, seed: 2024 });
    playOut(match, 2 * 200_000);
    expect(match.results.length).toBe(2);
    expect(match.standings()).toHaveLength(MAX_PLAYERS);
  });

  it("runs a Computer-vs-Computer, 3-Round Match to completion purely by ticking", () => {
    const match = new Match({ players: [moron, moron], rounds: 3, seed: 2024 });
    playOut(match, 3 * 200_000);
    expect(match.results.length).toBe(3);
    expect(match.roundWins.reduce((a, b) => a + b, 0)).toBe(
      match.results.filter((r) => r.kind === "win").length,
    );
  });

  it("runs a Match of Shooters and Morons to completion purely by ticking", () => {
    const shooter: PlayerSetup = { kind: "computer", personality: "shooter" };
    const match = new Match({
      players: [shooter, moron, shooter, shooter, moron],
      rounds: 3,
      seed: 2024,
    });
    playOut(match, 3 * 200_000);
    expect(match.results.length).toBe(3);
  });

  it("runs a Match of Tossers, Shooters and Morons to completion purely by ticking", () => {
    const shooter: PlayerSetup = { kind: "computer", personality: "shooter" };
    const tosser: PlayerSetup = { kind: "computer", personality: "tosser" };
    const match = new Match({
      players: [tosser, shooter, moron, tosser, tosser],
      rounds: 3,
      seed: 2024,
    });
    playOut(match, 3 * 200_000);
    expect(match.results.length).toBe(3);
  });

  describe("3-Round Matches of 10 Computer Players, shopping and firing what they bought, finish within the tick budget", () => {
    const shooter: PlayerSetup = { kind: "computer", personality: "shooter" };
    const tosser: PlayerSetup = { kind: "computer", personality: "tosser" };
    const lineups: Record<string, PlayerSetup[]> = {
      Morons: Array.from({ length: MAX_PLAYERS }, () => moron),
      Shooters: Array.from({ length: MAX_PLAYERS }, () => shooter),
      Tossers: Array.from({ length: MAX_PLAYERS }, () => tosser),
      "a mix": Array.from(
        { length: MAX_PLAYERS },
        (_, i) => [shooter, tosser, moron][i % 3] as PlayerSetup,
      ),
    };
    for (const [name, players] of Object.entries(lineups)) {
      it(`of ${name}, across 40 seeds, with Money never negative`, () => {
        for (let seed = 1; seed <= 40; seed++) {
          const match = new Match({ players, rounds: 3, seed });
          playOut(match, 3 * 200_000, () => {
            for (const money of match.money) expect(money).toBeGreaterThanOrEqual(0);
          });
          expect(match.results.length).toBe(3);
        }
      });
    }
  });

  it("plays seeded Moron-only Rounds holding only the Baby Missile exactly as before Shooter existed", () => {
    // Pinned before Shooter was added: Morons must draw from the Rng exactly as they always have.
    // Re-pinned when Fall Damage was added, since it changes how Rounds play out.
    // Rounds are played directly, sharing one Rng as a Match does, because a Match now lets its
    // Computer Players shop, which draws from the Rng too.
    // Death Animations only add time at the end of a Turn, so ticks spent dying are not counted.
    const players = createPlayers([moron, moron, moron, moron]);
    const rng = new Rng(77);
    let ticks = 0;
    let dyingTicks = 0;
    const results: RoundResult[] = [];
    let round: Round | null = null;
    for (let number = 1; number <= 3; number++) {
      round = new Round(number, players, rng);
      while (round.phase.kind !== "over") {
        if (round.phase.kind === "dying") dyingTicks++;
        else ticks++;
        round.tick(TICK_SECONDS);
      }
      results.push(round.phase.result);
    }
    expect(ticks).toBe(72269);
    expect(dyingTicks).toBeGreaterThan(0);
    expect(results).toEqual([win(2), win(0), win(3)]);
    expect(round?.tanks).toEqual([
      { ...newTank(0, 231, 421), angle: 161, power: 0, health: 0 },
      { ...newTank(1, 437, 395), angle: 47, power: 0, health: 0 },
      { ...newTank(2, 66, 418), angle: 23, power: 0, health: 0 },
      { ...newTank(3, 595, 343), angle: 84, power: 140, health: 27 },
    ]);
  });
});
