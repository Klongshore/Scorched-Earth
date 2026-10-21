import { describe, expect, it } from "vitest";
import { TICK_SECONDS } from "./constants";
import { clampRounds, Match } from "./match";

function newMatch(rounds = 3): Match {
  return new Match({ playerKinds: ["human", "computer"], rounds, seed: 5 });
}

function force(match: Match, result: { kind: "win"; playerId: number } | { kind: "draw" }): void {
  match.round.phase = { kind: "over", result };
  match.recordRoundResult();
}

describe("Match", () => {
  it("tallies wins and draws", () => {
    const match = newMatch(4);
    force(match, { kind: "win", playerId: 0 });
    match.startNextRound();
    force(match, { kind: "draw" });
    match.startNextRound();
    force(match, { kind: "win", playerId: 1 });
    expect(match.roundWins).toEqual([1, 1]);
    expect(match.results).toHaveLength(3);
  });

  it("is over after the configured number of results, and refuses another Round", () => {
    const match = newMatch(2);
    force(match, { kind: "draw" });
    expect(match.isOver()).toBe(false);
    match.startNextRound();
    expect(match.round.number).toBe(2);
    force(match, { kind: "draw" });
    expect(match.isOver()).toBe(true);
    expect(() => match.startNextRound()).toThrow();
  });

  it("refuses to record a Round that is not over", () => {
    expect(() => newMatch().recordRoundResult()).toThrow();
  });

  it("has no winner on a tie and orders standings by Round Wins then id", () => {
    const match = newMatch(3);
    force(match, { kind: "win", playerId: 1 });
    expect(match.winner()?.id).toBe(1);
    expect(match.standings().map((s) => s.player.id)).toEqual([1, 0]);
    match.startNextRound();
    force(match, { kind: "win", playerId: 0 });
    expect(match.winner()).toBeNull();
    expect(match.standings().map((s) => s.player.id)).toEqual([0, 1]);
  });

  it("clamps the Round count", () => {
    expect(clampRounds(0)).toBe(1);
    expect(clampRounds(500)).toBe(99);
    expect(clampRounds(Number.NaN)).toBe(10);
    expect(clampRounds(7.4)).toBe(7);
  });

  it("runs a Computer-vs-Computer Match to completion purely by ticking", () => {
    const match = new Match({ playerKinds: ["computer", "computer"], rounds: 3, seed: 11 });
    let ticks = 0;
    while (!match.isOver()) {
      if (match.round.phase.kind === "over") {
        match.recordRoundResult();
        if (!match.isOver()) match.startNextRound();
        continue;
      }
      match.round.tick(TICK_SECONDS);
      expect(++ticks).toBeLessThan(3 * 200000);
    }
    expect(match.results).toHaveLength(3);
  });
});
