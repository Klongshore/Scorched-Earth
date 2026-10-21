import { describe, expect, it } from "vitest";
import { Match } from "../sim/match";
import { aimLine } from "./hud";

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
