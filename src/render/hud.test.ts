import { describe, expect, it } from "vitest";
import { Match } from "../sim/match";
import { aimLine, healthLine } from "./hud";

function text(match: Match): string {
  return aimLine(match)
    .map(([t]) => t)
    .join("");
}

describe("aimLine (HUD line 1)", () => {
  it("shows the current Player's name, Angle and Power while aiming", () => {
    const match = new Match({
      players: [{ kind: "human" }, { kind: "human" }],
      rounds: 3,
      seed: 1,
    });
    const { round } = match;
    const tank = round.currentTank();
    const line = text(match);
    expect(line).toContain(round.playerOf(round.currentPlayerId).name);
    expect(line).toContain(`Angle: ${tank.angle}`);
    expect(line).toContain("Round 1/3");
  });

  it("drops the Turn details once the Round is over", () => {
    const match = new Match({
      players: [{ kind: "human" }, { kind: "human" }],
      rounds: 3,
      seed: 1,
    });
    match.round.phase = { kind: "over", result: { kind: "draw" } };
    const line = text(match);
    expect(line).not.toContain("Angle");
    expect(line).not.toContain("Power");
    expect(line).toContain("Wind:");
    expect(line).toContain("Round 1/3");
  });
});

describe("healthLine (HUD line 2)", () => {
  it("shows only the current Player's name and Health while aiming", () => {
    const match = new Match({ playerKinds: ["human", "human"], rounds: 3, seed: 1 });
    const { round } = match;
    const current = round.playerOf(round.currentPlayerId);
    const other = match.players.find((p) => p.id !== current.id);
    round.currentTank().health = 73;
    expect(healthLine(match)).toEqual({
      text: `${current.name}: 73`,
      color: current.color,
      health: 73,
    });
    expect(healthLine(match)?.text).not.toContain(other?.name);
  });

  it("still shows the current Player while a Computer Player is thinking", () => {
    const match = new Match({ playerKinds: ["computer", "computer"], rounds: 1, seed: 1 });
    const { round } = match;
    expect(round.isComputerThinking).toBe(true);
    expect(healthLine(match)?.text).toContain(round.playerOf(round.currentPlayerId).name);
  });

  it("is empty once the Turn's Projectile is fired", () => {
    const match = new Match({ playerKinds: ["human", "human"], rounds: 3, seed: 1 });
    match.round.act({ kind: "fire" });
    expect(match.round.phase.kind).toBe("flying");
    expect(healthLine(match)).toBeNull();
  });

  it("is empty while Settling and once the Round is over", () => {
    const match = new Match({ playerKinds: ["human", "human"], rounds: 3, seed: 1 });
    match.round.phase = { kind: "settling" };
    expect(healthLine(match)).toBeNull();
    match.round.phase = { kind: "over", result: { kind: "draw" } };
    expect(healthLine(match)).toBeNull();
  });
});
