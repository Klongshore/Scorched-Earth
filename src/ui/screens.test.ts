import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYERS,
  DEFAULT_ROUNDS,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
} from "../sim/constants";
import { Match } from "../sim/match";
import { createPlayers } from "../sim/players";
import {
  DEFAULT_PLAYERS_SETUP,
  PLAYER_COUNTS,
  PLAYER_OPTIONS,
  clampRounds,
  moveShopFocus,
  optionValue,
  resizePlayerChoices,
  roundResultsRows,
  settleShopFocus,
  setupChoiceFrom,
  shopView,
  startOnce,
  type ShopRow,
} from "./screens";

describe("Player choices on the Setup screen", () => {
  it("offers Human, Moron, Shooter and Tosser", () => {
    expect(PLAYER_OPTIONS.map((o) => o.label)).toEqual(["Human", "Moron", "Shooter", "Tosser"]);
    expect(PLAYER_OPTIONS.map((o) => o.setup)).toEqual([
      { kind: "human" },
      { kind: "computer", personality: "moron" },
      { kind: "computer", personality: "shooter" },
      { kind: "computer", personality: "tosser" },
    ]);
  });

  it("starts a Match with the chosen Tossers", () => {
    const tosser = optionValue({ kind: "computer", personality: "tosser" });
    expect(setupChoiceFrom([tosser, "human"], "2").players).toEqual([
      { kind: "computer", personality: "tosser" },
      { kind: "human" },
    ]);
  });

  it("starts a Match with the chosen Shooters", () => {
    const shooter = optionValue({ kind: "computer", personality: "shooter" });
    expect(setupChoiceFrom(["human", shooter, shooter], "2").players).toEqual([
      { kind: "human" },
      { kind: "computer", personality: "shooter" },
      { kind: "computer", personality: "shooter" },
    ]);
  });

  it("gives every option a distinct value", () => {
    const values = PLAYER_OPTIONS.map((o) => optionValue(o.setup));
    expect(new Set(values).size).toBe(values.length);
  });

  it("defaults to 2 Players: Player 1 Human and Player 2 Moron", () => {
    expect(DEFAULT_PLAYERS_SETUP).toEqual([
      { kind: "human" },
      { kind: "computer", personality: "moron" },
    ]);
  });

  it("reports one choice per Player, in order, with the Round count clamped", () => {
    const moron = optionValue({ kind: "computer", personality: "moron" });
    const human = optionValue({ kind: "human" });
    expect(setupChoiceFrom([moron, human], "100")).toEqual({
      players: [{ kind: "computer", personality: "moron" }, { kind: "human" }],
      rounds: MAX_ROUNDS,
    });
  });

  it("rejects an option value it does not offer", () => {
    expect(() => setupChoiceFrom(["computer"], "3")).toThrow();
  });

  it("gives Humans no Personality and every Computer Player one", () => {
    const players = createPlayers(PLAYER_OPTIONS.map((o) => o.setup));
    for (const player of players) {
      if (player.kind === "human") expect(player.personality).toBeNull();
      else expect(player.personality).not.toBeNull();
    }
  });
});

describe("Player count on the Setup screen", () => {
  const human = optionValue({ kind: "human" });
  const moron = optionValue({ kind: "computer", personality: "moron" });

  it("offers 2 to 10 Players, defaulting to 2", () => {
    expect(PLAYER_COUNTS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(PLAYER_COUNTS[0]).toBe(MIN_PLAYERS);
    expect(PLAYER_COUNTS.at(-1)).toBe(MAX_PLAYERS);
    expect(DEFAULT_PLAYERS_SETUP).toHaveLength(DEFAULT_PLAYERS);
  });

  it("adds Moron rows at the end when raised, keeping existing choices", () => {
    const five = resizePlayerChoices([moron, human], 5);
    expect(five).toEqual([moron, human, moron, moron, moron]);
  });

  it("removes rows from the end when lowered, keeping the first choices", () => {
    const five = [human, moron, human, human, moron];
    expect(resizePlayerChoices(five, 3)).toEqual([human, moron, human]);
  });

  it("goes from 2 to 5 rows and back to 3 keeping the first 3 choices", () => {
    const start = DEFAULT_PLAYERS_SETUP.map(optionValue);
    const five = resizePlayerChoices(start, 5);
    expect(five).toHaveLength(5);
    const edited = [five[0], five[1], human, five[3], five[4]] as string[];
    expect(resizePlayerChoices(edited, 3)).toEqual([human, moron, human]);
  });

  it("starts a 10-Player Match with every choice in order", () => {
    const values = resizePlayerChoices([human, human], MAX_PLAYERS);
    const choice = setupChoiceFrom(values, "1");
    expect(choice.players).toHaveLength(MAX_PLAYERS);
    expect(choice.players.slice(0, 3)).toEqual([
      { kind: "human" },
      { kind: "human" },
      { kind: "computer", personality: "moron" },
    ]);
  });
});

describe("clampRounds", () => {
  it("keeps valid Round counts", () => {
    expect(clampRounds("1")).toBe(1);
    expect(clampRounds("10")).toBe(10);
    expect(clampRounds(99)).toBe(99);
  });

  it("clamps out-of-range counts to MIN_ROUNDS..MAX_ROUNDS", () => {
    expect(clampRounds("0")).toBe(MIN_ROUNDS);
    expect(clampRounds("-5")).toBe(MIN_ROUNDS);
    expect(clampRounds("100")).toBe(MAX_ROUNDS);
    expect(clampRounds(1e9)).toBe(MAX_ROUNDS);
  });

  it("rounds fractions to a whole number of Rounds", () => {
    expect(clampRounds("2.4")).toBe(2);
    expect(clampRounds("2.6")).toBe(3);
  });

  it("falls back to the default for empty or non-numeric input", () => {
    expect(clampRounds("")).toBe(DEFAULT_ROUNDS);
    expect(clampRounds("abc")).toBe(DEFAULT_ROUNDS);
    expect(clampRounds(NaN)).toBe(DEFAULT_ROUNDS);
  });
});

describe("Starting the Match from the Setup screen", () => {
  it("starts once, however often Start is pressed", () => {
    const started: number[] = [];
    const submit = startOnce(
      () => 3,
      (n) => started.push(n),
    );
    submit();
    submit();
    expect(started).toEqual([3]);
  });

  it("stays usable when reading the form fails, and starts on the next good read", () => {
    let fail = true;
    const started: string[] = [];
    const submit = startOnce(
      () => {
        if (fail) throw new Error("bad form");
        return "ok";
      },
      (choice) => started.push(choice),
    );
    expect(submit).toThrow("bad form");
    expect(started).toEqual([]);
    fail = false;
    submit();
    submit();
    expect(started).toEqual(["ok"]);
  });
});

describe("Shop view", () => {
  const shopping = (): Match =>
    new Match({
      players: [{ kind: "computer", personality: "moron" }, { kind: "human" }, { kind: "human" }],
      rounds: 3,
      seed: 1,
    });
  const row = (name: string, owned: number, disabled: boolean) => ({ name, owned, disabled });
  const summary = (rows: readonly ShopRow[]) => rows.map((r) => row(r.name, r.owned, r.disabled));

  it("heads the screen with the current shopper and their Money", () => {
    const match = shopping();
    const view = shopView(match);
    expect(view.player).toBe(match.players[1]);
    expect(view.money).toBe("$2,000");
  });

  it("lists every Weapon but the Baby Missile, with its Bundle, price and owned count", () => {
    const view = shopView(shopping());
    expect(view.rows.map((r) => [r.name, r.bundle, r.price, r.owned])).toEqual([
      ["Missile", "×5", "$1,875", 0],
      ["Baby Nuke", "×3", "$10,000", 0],
      ["Nuke", "×1", "$12,000", 0],
      ["MIRV", "×3", "$10,000", 0],
      ["Funky Bomb", "×2", "$7,000", 0],
    ]);
  });

  it("disables the rows the shopper cannot afford", () => {
    expect(summary(shopView(shopping()).rows)).toEqual([
      row("Missile", 0, false),
      row("Baby Nuke", 0, true),
      row("Nuke", 0, true),
      row("MIRV", 0, true),
      row("Funky Bomb", 0, true),
    ]);
  });

  it("updates Money, owned counts and disabled rows after a purchase", () => {
    const match = shopping();
    match.money[1] = 12_000;
    expect(summary(shopView(match).rows)).toEqual([
      row("Missile", 0, false),
      row("Baby Nuke", 0, false),
      row("Nuke", 0, false),
      row("MIRV", 0, false),
      row("Funky Bomb", 0, false),
    ]);
    match.buy(1, "Missile");
    const view = shopView(match);
    expect(view.money).toBe("$10,125");
    expect(summary(view.rows)).toEqual([
      row("Missile", 5, false),
      row("Baby Nuke", 0, false),
      row("Nuke", 0, true),
      row("MIRV", 0, false),
      row("Funky Bomb", 0, false),
    ]);
  });

  it("shows the next Human once the first is done", () => {
    const match = shopping();
    match.finishShopping(1);
    expect(shopView(match).player).toBe(match.players[2]);
  });
});

describe("Shop focus", () => {
  const rows = (...disabled: boolean[]): ShopRow[] =>
    disabled.map((d, i) => ({
      name: "Missile",
      bundle: "×1",
      price: `$${i}`,
      owned: 0,
      disabled: d,
    }));

  it("moves between enabled rows and Done, wrapping round", () => {
    const r = rows(false, true, false); // Done is index 3
    expect(moveShopFocus(r, 0, 1)).toBe(2);
    expect(moveShopFocus(r, 2, 1)).toBe(3);
    expect(moveShopFocus(r, 3, 1)).toBe(0);
    expect(moveShopFocus(r, 0, -1)).toBe(3);
    expect(moveShopFocus(r, 3, -1)).toBe(2);
    expect(moveShopFocus(r, 2, -1)).toBe(0);
  });

  it("stays on Done when every row is disabled", () => {
    const r = rows(true, true);
    expect(moveShopFocus(r, 2, 1)).toBe(2);
    expect(moveShopFocus(r, 2, -1)).toBe(2);
  });

  it("keeps focus on a row still affordable after a purchase", () => {
    expect(settleShopFocus(rows(false, false), 1)).toBe(1);
  });

  it("moves focus to the next enabled row, or Done, when the row becomes unaffordable", () => {
    expect(settleShopFocus(rows(true, true, false), 0)).toBe(2);
    expect(settleShopFocus(rows(false, true, true), 1)).toBe(3);
  });

  it("opens on the first enabled row, or Done when nothing is affordable", () => {
    expect(settleShopFocus(rows(true, false), 0)).toBe(1);
    expect(settleShopFocus(rows(true, true), 0)).toBe(2);
  });
});

describe("Round results", () => {
  it("show each Player's Round Wins, Money earned this Round and total Money", () => {
    const match = new Match({
      players: [{ kind: "human" }, { kind: "human" }],
      rounds: 3,
      seed: 1,
    });
    match.finishShopping(0);
    match.finishShopping(1);
    const round = match.requireRound();
    round.earnings[0] = 1250;
    round.earnings[1] = 2500;
    round.phase = { kind: "over", result: { kind: "win", playerId: 1 } };
    match.recordRoundResult();
    expect(
      roundResultsRows(match).map((r) => [r.player.name, r.roundWins, r.earned, r.money]),
    ).toEqual([
      ["Player 2", "1", "$7,500", "$9,500"],
      ["Player 1", "0", "$1,250", "$3,250"],
    ]);
  });
});
