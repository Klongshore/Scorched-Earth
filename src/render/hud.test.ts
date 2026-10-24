import { describe, expect, it } from "vitest";
import { Match } from "../sim/match";
import type { Round } from "../sim/round";
import type { PlayerSetup } from "../sim/types";
import { aimLine, healthLine, statusText, weaponText } from "./hud";

const human: PlayerSetup = { kind: "human" };
const moron: PlayerSetup = { kind: "computer", personality: "moron" };

/** A seeded 3-Round Match past the Shop, so Round 1 is in play. */
function playing(players: PlayerSetup[] = [human, human]): { match: Match; round: Round } {
  const match = new Match({ players, rounds: 3, seed: 1 });
  for (let shopper = match.currentShopper; shopper !== null; shopper = match.currentShopper) {
    match.finishShopping(shopper);
  }
  return { match, round: match.requireRound() };
}

function text(match: Match): string {
  return aimLine(match)
    .map(([t]) => t)
    .join("");
}

describe("aimLine (HUD line 1)", () => {
  it("shows the current Player's name, Angle, Power and Weapon while aiming", () => {
    const { match, round } = playing();
    const tank = round.currentTank();
    tank.angle = 135;
    tank.power = 640;
    expect(text(match)).toBe(
      `${round.playerOf(round.currentPlayerId).name}   Angle: 135   Power: 640/1000   Weapon: Baby Missile`,
    );
  });

  it("shows how many of a bought Weapon are left", () => {
    const { match, round } = playing();
    round.inventoryOf(round.currentPlayerId).add("Missile", 5);
    round.act({ kind: "cycleWeapon", delta: 1 });
    expect(text(match)).toContain("Weapon: Missile ×5");
  });

  it("is empty once the Round is over, and before Round 1", () => {
    const { match, round } = playing();
    round.phase = { kind: "over", result: { kind: "draw" } };
    expect(text(match)).toBe("");
    expect(aimLine(new Match({ players: [human, human], rounds: 3, seed: 1 }))).toEqual([]);
  });
});

describe("weaponText", () => {
  it("gives a count for a limited Weapon and none for the Baby Missile", () => {
    expect(weaponText("Heavy Roller", 10)).toBe("Weapon: Heavy Roller ×10");
    expect(weaponText("Nuke", 1)).toBe("Weapon: Nuke ×1");
    expect(weaponText("Baby Missile", Infinity)).toBe("Weapon: Baby Missile");
  });
});

describe("statusText (right of HUD line 2)", () => {
  it("shows the Wind and the Round, whatever the phase", () => {
    const { match, round } = playing();
    round.wind = -7;
    expect(statusText(match)).toBe("Wind: ←7   Round 1/3");
    round.phase = { kind: "over", result: { kind: "draw" } };
    round.wind = 12;
    expect(statusText(match)).toBe("Wind: →12   Round 1/3");
  });

  it("is empty before Round 1", () => {
    expect(statusText(new Match({ players: [human, human], rounds: 3, seed: 1 }))).toBe("");
  });
});

describe("healthLine (HUD line 2)", () => {
  it("shows only the current Player's name and Health while aiming", () => {
    const { match, round } = playing();
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
    const { match, round } = playing([moron, moron]);
    expect(round.isComputerThinking).toBe(true);
    expect(healthLine(match)?.text).toContain(round.playerOf(round.currentPlayerId).name);
  });

  it("is empty once the Turn's Projectile is fired", () => {
    const { match, round } = playing();
    round.act({ kind: "fire" });
    expect(round.phase.kind).toBe("resolving");
    expect(healthLine(match)).toBeNull();
  });

  it("is empty while Settling, once the Round is over, and before Round 1", () => {
    const { match, round } = playing();
    round.phase = { kind: "settling" };
    expect(healthLine(match)).toBeNull();
    round.phase = { kind: "over", result: { kind: "draw" } };
    expect(healthLine(match)).toBeNull();
    expect(healthLine(new Match({ players: [human, human], rounds: 3, seed: 1 }))).toBeNull();
  });
});
