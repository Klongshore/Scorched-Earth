import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYERS,
  DEFAULT_ROUNDS,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
  FIELD_WIDTH,
  MAX_HEALTH,
  MONEY_PER_DAMAGE,
  TICK_SECONDS,
  WEAPONS,
  forSaleNamed,
} from "../sim/constants";
import { fallDamage } from "../sim/settling";
import { Match } from "../sim/match";
import { createPlayers } from "../sim/players";
import {
  CONTROLS_REMINDER,
  DEFAULT_PLAYERS_SETUP,
  PLAYER_COUNTS,
  PLAYER_OPTIONS,
  clampRounds,
  formatMoney,
  moveShopFocus,
  optionValue,
  resizePlayerChoices,
  roundResultsRows,
  rowsToShow,
  scrollPage,
  scrollToShow,
  scrollToShowRange,
  settleShopFocus,
  setupChoiceFrom,
  shopKeyAction,
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

describe("Controls reminder on the Setup screen", () => {
  it("mentions S Shield on the second of two lines", () => {
    expect(CONTROLS_REMINDER.split("\n")).toEqual([
      "←/→ Angle   ↑/↓ Power (Shift ×10)",
      "Tab Weapon   S Shield   Space Fire",
    ]);
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
  /** The rows of these Weapons, in Shop order, so tests don't depend on the catalogue's length. */
  const pick = (rows: readonly ShopRow[], names: readonly string[]) =>
    rows.filter((r) => names.includes(r.name));
  const SAMPLED = ["Missile", "Baby Nuke", "Nuke", "MIRV", "Funky Bomb"];
  const summary = (rows: readonly ShopRow[]) =>
    pick(rows, SAMPLED).map((r) => row(r.name, r.owned, r.disabled));
  const listing = (rows: readonly ShopRow[], names: readonly string[]) =>
    pick(rows, names).map((r) => [r.name, r.bundle, r.price, r.owned]);

  it("heads the screen with the current shopper and their Money", () => {
    const match = shopping();
    const view = shopView(match);
    expect(view.player).toBe(match.players[1]);
    expect(view.money).toBe("$2,000");
  });

  it("lists every Weapon but the Baby Missile, with its Bundle, price and owned count", () => {
    const view = shopView(shopping());
    expect(view.rows.slice(0, WEAPONS.length - 1).map((r) => r.name)).toEqual(
      WEAPONS.slice(1).map((w) => w.name),
    );
    expect(listing(view.rows, SAMPLED)).toEqual([
      ["Missile", "×5", "$1,875", 0],
      ["Baby Nuke", "×3", "$10,000", 0],
      ["Nuke", "×1", "$12,000", 0],
      ["MIRV", "×3", "$10,000", 0],
      ["Funky Bomb", "×2", "$7,000", 0],
    ]);
    const rollers = ["Baby Roller", "Roller", "Heavy Roller"];
    expect(listing(view.rows, rollers)).toEqual([
      ["Baby Roller", "×10", "$5,000", 0],
      ["Roller", "×5", "$6,000", 0],
      ["Heavy Roller", "×2", "$6,750", 0],
    ]);
    expect(listing(view.rows, ["Dirt Clod", "Dirt Ball", "Ton of Dirt"])).toEqual([
      ["Dirt Clod", "×10", "$5,000", 0],
      ["Dirt Ball", "×5", "$5,000", 0],
      ["Ton of Dirt", "×2", "$6,750", 0],
    ]);
  });

  it("shows 14 rows: the Weapons, then Shield, Heavy Shield and Parachute", () => {
    const match = shopping();
    match.money[1] = 20_000;
    match.buy(1, "Parachute");
    const view = shopView(match);
    expect(view.rows).toHaveLength(14);
    expect(view.rows.slice(11).map((r) => [r.name, r.bundle, r.price, r.owned])).toEqual([
      ["Shield", "×3", "$6,000", 0],
      ["Heavy Shield", "×2", "$10,000", 0],
      ["Parachute", "×5", "$3,000", 5],
    ]);
  });

  it("disables the Item rows the shopper cannot afford", () => {
    const match = shopping();
    const items = ["Shield", "Heavy Shield", "Parachute"];
    const disabled = () => pick(shopView(match).rows, items).map((r) => r.disabled);
    expect(disabled()).toEqual([true, true, true]); // $2,000 buys no Item
    match.money[1] = forSaleNamed("Shield").price;
    expect(disabled()).toEqual([false, true, false]);
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

  it("include what the current Player earned from Settling in the Earned column", () => {
    const match = new Match({
      players: [{ kind: "human" }, { kind: "human" }],
      rounds: 3,
      seed: 1,
    });
    match.finishShopping(0);
    match.finishShopping(1);
    const round = match.requireRound();
    const surface = 400;
    round.terrain.flatten(0, FIELD_WIDTH - 1, surface);
    const firer = round.currentTank();
    const other = round.tanks.find((t) => t !== firer);
    if (!other) throw new Error("expected two Tanks");
    firer.x = 150;
    other.x = 500;
    firer.y = other.y = surface;
    const depth = 60; // dig out from under the other Tank: it falls this far
    for (let y = surface; y < surface + depth; y++) {
      for (let x = other.x - 20; x <= other.x + 20; x++) round.terrain.set(x, y, false);
    }
    round.phase = { kind: "settling" };
    for (let i = 0; i < 20_000 && round.phase.kind === "settling"; i++) round.tick(TICK_SECONDS);
    const fall = fallDamage(depth);
    expect(fall).toBeGreaterThan(0);
    expect(other.health).toBe(MAX_HEALTH - fall);
    round.phase = { kind: "over", result: { kind: "draw" } };
    match.recordRoundResult();
    const earned = formatMoney(MONEY_PER_DAMAGE * fall);
    const rows = roundResultsRows(match).map((r) => [r.player.id, r.earned]);
    expect(rows).toContainEqual([firer.playerId, earned]);
    expect(rows).toContainEqual([other.playerId, "$0"]);
  });
});

describe("formatMoney", () => {
  it("uses a thousands separator and no decimals", () => {
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(500)).toBe("$500");
    expect(formatMoney(2000)).toBe("$2,000");
    expect(formatMoney(12345)).toBe("$12,345");
    expect(formatMoney(1234567)).toBe("$1,234,567");
  });
});

describe("Shop scrolling", () => {
  const view = { top: 100, height: 200 }; // showing 100..300 of the rows

  it("leaves the list where it is when the row is already in full view", () => {
    expect(scrollToShow(view, { top: 100, height: 25 })).toBe(100);
    expect(scrollToShow(view, { top: 275, height: 25 })).toBe(100);
  });

  it("scrolls up just far enough to show a row above", () => {
    expect(scrollToShow(view, { top: 80, height: 25 })).toBe(80);
    expect(scrollToShow(view, { top: 0, height: 25 })).toBe(0);
  });

  it("scrolls down just far enough to show a row below", () => {
    expect(scrollToShow(view, { top: 290, height: 25 })).toBe(115);
    expect(scrollToShow(view, { top: 500, height: 25 })).toBe(325);
  });

  it("shows a row taller than the list from its top", () => {
    expect(scrollToShow(view, { top: 150, height: 300 })).toBe(150);
  });
});

describe("Shop scrolling over skipped rows", () => {
  const ROW = 25; // px per row in these examples
  const span = (first: number, last = first) => ({
    top: first * ROW,
    height: (last - first + 1) * ROW,
  });

  it("brings every greyed row at the bottom into view when ↓ jumps to Done at $2,000", () => {
    const match = new Match({
      players: [{ kind: "human" }, { kind: "human" }],
      rounds: 1,
      seed: 7,
    });
    const rows = shopView(match).rows; // only the Missile is affordable
    expect(rows.filter((r) => !r.disabled).map((r) => r.name)).toEqual(["Missile"]);
    const done = moveShopFocus(rows, 0, 1);
    expect(done).toBe(rows.length);
    const range = rowsToShow(rows.length, 0, done, 1);
    expect(range).toEqual({ first: 1, last: rows.length - 1, target: rows.length - 1 });
    // A list showing 8 rows ends up at its end, the last row in full view.
    const view = { top: 0, height: 8 * ROW };
    if (!range) throw new Error("expected rows to show");
    const top = scrollToShowRange(view, span(range.first, range.last), span(range.target));
    expect(top).toBe(rows.length * ROW - view.height);
  });

  it("shows the rows passed over in either direction, the row landed on always in view", () => {
    expect(rowsToShow(14, 2, 9, 1)).toEqual({ first: 3, last: 9, target: 9 });
    expect(rowsToShow(14, 9, 2, -1)).toEqual({ first: 2, last: 8, target: 2 });
    expect(rowsToShow(14, 14, 3, -1)).toEqual({ first: 3, last: 13, target: 3 });
    const view = { top: 0, height: 4 * ROW };
    // Down past more rows than fit: the landed-on row ends at the bottom edge.
    expect(scrollToShowRange(view, span(3, 9), span(9))).toBe(6 * ROW);
    // Up past more rows than fit: the landed-on row starts at the top edge.
    expect(scrollToShowRange({ top: 10 * ROW, height: 4 * ROW }, span(2, 8), span(2))).toBe(
      2 * ROW,
    );
  });

  it("scrolls to the top when ↓ wraps from Done to the first row", () => {
    expect(rowsToShow(14, 14, 5, 1)).toEqual({ first: 0, last: 5, target: 5 });
    expect(rowsToShow(14, 14, 0, 1)).toEqual({ first: 0, last: 0, target: 0 });
    expect(scrollToShowRange({ top: 200, height: 100 }, span(0), span(0))).toBe(0);
  });

  it("shows the list's end when ↑ wraps from the first row to Done", () => {
    expect(rowsToShow(14, 0, 14, -1)).toEqual({ first: 13, last: 13, target: 13 });
  });

  it("shows nothing new when focus stays put", () => {
    expect(rowsToShow(14, 14, 14, 1)).toBeNull();
  });

  it("pages through the list a box-height at a time, within its ends", () => {
    const view = { top: 0, height: 100 };
    expect(scrollPage(view, 350, 1)).toBe(100);
    expect(scrollPage({ top: 200, height: 100 }, 350, 1)).toBe(250);
    expect(scrollPage({ top: 50, height: 100 }, 350, -1)).toBe(0);
    expect(scrollPage(view, 80, 1)).toBe(0);
  });
});

describe("shopKeyAction", () => {
  it("finishes on Esc, moves on ↑/↓ and ignores other keys", () => {
    expect(shopKeyAction("Escape")).toBe("finish");
    expect(shopKeyAction("ArrowUp")).toBe(-1);
    expect(shopKeyAction("ArrowDown")).toBe(1);
    expect(shopKeyAction("Enter")).toBeNull();
    expect(shopKeyAction("ArrowLeft")).toBeNull();
  });
});
