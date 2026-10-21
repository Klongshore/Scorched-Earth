import { describe, expect, it } from "vitest";
import { MAX_PLAYERS, MIN_PLAYERS, TICK_SECONDS } from "./constants";
import { Match, type MatchSetup } from "./match";
import type { RoundResult } from "./round";
import type { PlayerSetup } from "./types";

const human: PlayerSetup = { kind: "human" };
const moron: PlayerSetup = { kind: "computer", personality: "moron" };

function newMatch(overrides: Partial<MatchSetup> = {}): Match {
  return new Match({ players: [human, human], rounds: 3, seed: 1, ...overrides });
}

/** Force the current Round to end with `result`, record it, and start the next Round if any. */
function finishRound(match: Match, result: RoundResult): void {
  match.round.phase = { kind: "over", result };
  match.recordRoundResult();
  if (!match.isOver()) match.startNextRound();
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
    expect(match.round.number).toBe(1);
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
    expect(match.round.number).toBe(2);
    finishRound(match, draw);
    expect(match.round.number).toBe(3);
  });

  it("refuses to record a Round that is not over, or twice", () => {
    const match = newMatch();
    expect(() => match.recordRoundResult()).toThrow();
    match.round.phase = { kind: "over", result: draw };
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

  it("is reproducible from its seed across Rounds", () => {
    const a = newMatch({ seed: 42 });
    const b = newMatch({ seed: 42 });
    finishRound(a, draw);
    finishRound(b, draw);
    expect(b.round.wind).toBe(a.round.wind);
    expect(b.round.turnOrder).toEqual(a.round.turnOrder);
    expect(b.round.tanks).toEqual(a.round.tanks);
    expect(b.round.terrain.cells).toEqual(a.round.terrain.cells);
  });
});

/** Tick a Match to completion, recording each Round, failing past maxTicks. */
function playOut(match: Match, maxTicks: number): number {
  let ticks = 0;
  while (!match.isOver()) {
    if (ticks++ >= maxTicks) expect.fail(`Match did not finish within ${maxTicks} ticks`);
    match.round.tick(TICK_SECONDS);
    if (match.round.phase.kind === "over") {
      match.recordRoundResult();
      if (!match.isOver()) match.startNextRound();
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

  describe("1-Round Matches of 10 Computer Players finish within the tick budget", () => {
    const shooter: PlayerSetup = { kind: "computer", personality: "shooter" };
    const tosser: PlayerSetup = { kind: "computer", personality: "tosser" };
    const lineups: Record<string, PlayerSetup[]> = {
      Shooters: Array.from({ length: MAX_PLAYERS }, () => shooter),
      Tossers: Array.from({ length: MAX_PLAYERS }, () => tosser),
      "a mix": Array.from(
        { length: MAX_PLAYERS },
        (_, i) => [shooter, tosser, moron][i % 3] as PlayerSetup,
      ),
    };
    for (const [name, players] of Object.entries(lineups)) {
      it(`of ${name}, across 40 seeds`, () => {
        for (let seed = 1; seed <= 40; seed++) {
          const match = new Match({ players, rounds: 1, seed });
          playOut(match, 200_000);
          expect(match.results.length).toBe(1);
        }
      });
    }
  });

  it("plays a seeded Moron-only Match exactly as before Shooter existed", () => {
    // Pinned before Shooter was added: Morons must draw from the Rng exactly as they always have.
    const match = new Match({ players: [moron, moron, moron, moron], rounds: 3, seed: 77 });
    const ticks = playOut(match, 3 * 200_000);
    expect(ticks).toBe(75560);
    expect(match.results).toEqual([win(2), win(0), win(2)]);
    expect(match.round.tanks).toEqual([
      { playerId: 0, x: 256, y: 480, angle: 89, power: 70, health: 0 },
      { playerId: 1, x: 80, y: 362, angle: 93, power: 0, health: 0 },
      { playerId: 2, x: 531, y: 429, angle: 153, power: 123, health: 49 },
      { playerId: 3, x: 425, y: 480, angle: 5, power: 352, health: 0 },
    ]);
  });
});
