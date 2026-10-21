import { describe, expect, it } from "vitest";
import { TICK_SECONDS } from "./constants";
import { Match, type MatchSetup } from "./match";
import type { RoundResult } from "./round";

function newMatch(overrides: Partial<MatchSetup> = {}): Match {
  return new Match({ playerKinds: ["human", "human"], rounds: 3, seed: 1, ...overrides });
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
    const match = newMatch({ playerKinds: ["human", "computer"] });
    expect(match.players.map((p) => p.kind)).toEqual(["human", "computer"]);
    expect(match.totalRounds).toBe(3);
    expect(match.roundWins).toEqual([0, 0]);
    expect(match.results).toEqual([]);
    expect(match.round.number).toBe(1);
    expect(match.isOver()).toBe(false);
  });

  it("rejects Round counts outside 1..99", () => {
    expect(() => newMatch({ rounds: 0 })).toThrow();
    expect(() => newMatch({ rounds: 100 })).toThrow();
    expect(() => newMatch({ rounds: 1.5 })).toThrow();
    expect(() => newMatch({ rounds: 1 })).not.toThrow();
    expect(() => newMatch({ rounds: 99 })).not.toThrow();
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

describe("Match integration", () => {
  it("runs a Computer-vs-Computer, 3-Round Match to completion purely by ticking", () => {
    const match = new Match({ playerKinds: ["computer", "computer"], rounds: 3, seed: 2024 });
    const maxTicks = 3 * 200_000;
    let ticks = 0;
    while (!match.isOver()) {
      if (ticks++ >= maxTicks) expect.fail(`Match did not finish within ${maxTicks} ticks`);
      match.round.tick(TICK_SECONDS);
      if (match.round.phase.kind === "over") {
        match.recordRoundResult();
        if (!match.isOver()) match.startNextRound();
      }
    }
    expect(match.results.length).toBe(3);
    expect(match.roundWins.reduce((a, b) => a + b, 0)).toBe(
      match.results.filter((r) => r.kind === "win").length,
    );
  });
});
