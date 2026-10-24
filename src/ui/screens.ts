import {
  DEFAULT_PLAYERS,
  DEFAULT_ROUNDS,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
  WEAPONS,
} from "../sim/constants";
import type { Match } from "../sim/match";
import { formatMoney } from "../sim/money";
import { playerLook } from "../sim/players";
import type { Player, PlayerSetup, WeaponName } from "../sim/types";

/** What the Setup screen chooses; the Game adds the seed to make a MatchSetup. */
export interface SetupChoice {
  readonly players: readonly PlayerSetup[]; // one per Player, in order
  readonly rounds: number;
}

/** The choices each Player's dropdown offers, in display order. */
export const PLAYER_OPTIONS: readonly { readonly label: string; readonly setup: PlayerSetup }[] = [
  { label: "Human", setup: { kind: "human" } },
  { label: "Moron", setup: { kind: "computer", personality: "moron" } },
  { label: "Shooter", setup: { kind: "computer", personality: "shooter" } },
  { label: "Tosser", setup: { kind: "computer", personality: "tosser" } },
];

export const DEFAULT_PLAYERS_SETUP: readonly PlayerSetup[] = [
  { kind: "human" },
  { kind: "computer", personality: "moron" },
];

/** What a row added by raising the Player count starts as. */
const ADDED_PLAYER_SETUP: PlayerSetup = { kind: "computer", personality: "moron" };

/** The Player counts the Setup screen offers: MIN_PLAYERS..MAX_PLAYERS. */
export const PLAYER_COUNTS: readonly number[] = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i,
);

/**
 * The dropdown values after changing the Player count to `count`: rows are removed from
 * the end, or added at the end as Moron, and the remaining rows keep their choices.
 */
export function resizePlayerChoices(optionValues: readonly string[], count: number): string[] {
  const added = optionValue(ADDED_PLAYER_SETUP);
  return Array.from({ length: count }, (_, i) => optionValues[i] ?? added);
}

/** The dropdown value for a setup: "human", or the Computer Player's Personality. */
export function optionValue(setup: PlayerSetup): string {
  return setup.kind === "human" ? "human" : setup.personality;
}

function setupFromOption(value: string): PlayerSetup {
  const option = PLAYER_OPTIONS.find((o) => optionValue(o.setup) === value);
  if (!option) throw new Error(`Unknown Player choice: ${value}`);
  return option.setup;
}

/** Turn the form's dropdown values (one per Player, in order) and Rounds box into a choice. */
export function setupChoiceFrom(optionValues: readonly string[], rounds: string): SetupChoice {
  return { players: optionValues.map(setupFromOption), rounds: clampRounds(rounds) };
}

const CONTROLS_REMINDER = "←/→ Angle   ↑/↓ Power (Shift ×10)   Tab Weapon   Space Fire";

/** Turn whatever is in the Rounds box into a valid Round count (MIN_ROUNDS..MAX_ROUNDS). */
export function clampRounds(value: string | number): number {
  const n = typeof value === "number" ? value : value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ROUNDS;
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(n)));
}

export function clearOverlay(overlay: HTMLElement): void {
  overlay.replaceChildren();
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function panel(overlay: HTMLElement, ...children: Node[]): void {
  const box = el("div", undefined, "panel");
  box.append(...children);
  overlay.replaceChildren(box);
}

function playerName(player: Pick<Player, "name" | "color">): HTMLElement {
  const span = el("span", player.name);
  span.style.color = player.color;
  return span;
}

/**
 * A submit handler that reads the form with `read` and passes the result to `start`, at most
 * once. If `read` throws, nothing has started and the next submit tries again.
 */
export function startOnce<T>(read: () => T, start: (choice: T) => void): () => void {
  let started = false;
  return () => {
    if (started) return;
    const choice = read();
    started = true;
    start(choice);
  };
}

/**
 * Show the Setup screen. `onStart` receives a valid choice (Round count already clamped).
 * Returns a function that starts the Match from the form's current values, for Enter.
 */
export function showSetup(
  overlay: HTMLElement,
  onStart: (choice: SetupChoice) => void,
): () => void {
  const form = el("form");
  form.noValidate = true; // invalid Round counts are clamped, not rejected

  const countLabel = el("label");
  const count = el("select");
  count.name = "players";
  for (const n of PLAYER_COUNTS) {
    const option = el("option", String(n));
    option.value = String(n);
    option.selected = n === DEFAULT_PLAYERS;
    count.append(option);
  }
  countLabel.append(el("span", "Players"), count);

  // One row per Player: their name in their colour and a dropdown of PLAYER_OPTIONS.
  const rows = el("div", undefined, "players");
  let selects: HTMLSelectElement[] = [];
  const showRows = (optionValues: readonly string[]): void => {
    const labels = optionValues.map((_, i) => {
      const label = el("label");
      const select = el("select");
      select.name = `player${i + 1}`;
      for (const { label: text, setup } of PLAYER_OPTIONS) {
        const option = el("option", text);
        option.value = optionValue(setup);
        option.selected = option.value === optionValues[i];
        select.append(option);
      }
      label.append(playerName(playerLook(i)), select);
      return { label, select };
    });
    selects = labels.map((l) => l.select);
    rows.replaceChildren(...labels.map((l) => l.label));
  };
  showRows(resizePlayerChoices(DEFAULT_PLAYERS_SETUP.map(optionValue), DEFAULT_PLAYERS));
  count.addEventListener("change", () => {
    const values = selects.map((s) => s.value);
    showRows(resizePlayerChoices(values, Number(count.value)));
  });
  form.append(countLabel, rows);

  const roundsLabel = el("label");
  const rounds = el("input");
  rounds.type = "number";
  rounds.name = "rounds";
  rounds.min = String(MIN_ROUNDS);
  rounds.max = String(MAX_ROUNDS);
  rounds.step = "1";
  rounds.value = String(DEFAULT_ROUNDS);
  rounds.addEventListener("change", () => {
    rounds.value = String(clampRounds(rounds.value));
  });
  roundsLabel.append(el("span", "Rounds"), rounds);

  const start = el("button", "Start");
  start.type = "submit";
  start.autofocus = true;
  form.append(roundsLabel, start);

  const submit = startOnce(
    () =>
      setupChoiceFrom(
        selects.map((s) => s.value),
        rounds.value,
      ),
    (choice) => {
      rounds.value = String(choice.rounds);
      onStart(choice);
    },
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });

  panel(overlay, el("h1", "SCORCHED EARTH"), form, el("p", CONTROLS_REMINDER, "hint"));
  start.focus();
  return submit;
}

function winsTable(match: Match): HTMLTableElement {
  const table = el("table");
  const head = el("tr");
  head.append(el("th", "Player"), el("th", "Round Wins"));
  table.append(head);
  for (const { player, roundWins } of match.standings()) {
    const row = el("tr");
    const name = el("td");
    name.append(playerName(player));
    row.append(name, el("td", String(roundWins)));
    table.append(row);
  }
  return table;
}

export interface RoundResultsRow {
  readonly player: Player;
  readonly roundWins: string;
  readonly earned: string; // Money earned in the Round just finished, Round Win bonus included
  readonly money: string; // total Money
}

/** One row per Player for the Round results table, in standings order. */
export function roundResultsRows(match: Match): RoundResultsRow[] {
  return match.standings().map(({ player, roundWins }) => ({
    player,
    roundWins: String(roundWins),
    earned: formatMoney(match.earnedThisRound[player.id] ?? 0),
    money: formatMoney(match.money[player.id] ?? 0),
  }));
}

function roundResultsTable(match: Match): HTMLTableElement {
  const table = el("table");
  const head = el("tr");
  head.append(el("th", "Player"), el("th", "Round Wins"), el("th", "Earned"), el("th", "Money"));
  table.append(head);
  for (const { player, roundWins, earned, money } of roundResultsRows(match)) {
    const row = el("tr");
    const name = el("td");
    name.append(playerName(player));
    row.append(name, el("td", roundWins), el("td", earned), el("td", money));
    table.append(row);
  }
  return table;
}

/** Show the result of the Round that just ended (it must already be recorded). */
export function showRoundResults(overlay: HTMLElement, match: Match): void {
  const { number } = match.requireRound();
  const result = match.results[number - 1];
  const heading = el("h2");
  const winner = result?.kind === "win" ? match.players[result.playerId] : undefined;
  if (winner) heading.append(playerName(winner), ` wins Round ${number}!`);
  else heading.textContent = `Round ${number} is a draw`;
  panel(overlay, heading, roundResultsTable(match), el("p", "Press Enter to continue", "hint"));
}

/** Show the Final standings of a finished Match. */
export function showStandings(overlay: HTMLElement, match: Match): void {
  const heading = el("h2");
  const winner = match.winner();
  if (winner) heading.append(playerName(winner), " wins the Match!");
  else heading.textContent = "The Match is a tie";
  panel(
    overlay,
    el("h1", "FINAL STANDINGS"),
    heading,
    winsTable(match),
    el("p", "Press Enter for a new Match", "hint"),
  );
}

/** One Shop row: a Weapon on sale, one Bundle at a time. */
export interface ShopRow {
  readonly name: WeaponName;
  readonly bundle: string; // "×5"
  readonly price: string; // "$1,875", per Bundle
  readonly owned: number;
  readonly disabled: boolean; // the shopper can't afford a Bundle
}

/** What the current shopper's Shop screen shows. */
export interface ShopView {
  readonly player: Player;
  readonly money: string;
  readonly rows: readonly ShopRow[];
}

/**
 * The Shop screen for the Match's current shopper: their name and Money, then one row per
 * Weapon in catalogue order except the Baby Missile, which is never sold.
 */
export function shopView(match: Match): ShopView {
  const playerId = match.currentShopper;
  const player = playerId === null ? undefined : match.players[playerId];
  if (!player) throw new Error("No one is shopping");
  const money = match.money[player.id] ?? 0;
  const inventory = match.inventoryOf(player.id);
  const rows = WEAPONS.flatMap((weapon): ShopRow[] =>
    weapon.bundle === null
      ? []
      : [
          {
            name: weapon.name,
            bundle: `×${weapon.bundle}`,
            price: formatMoney(weapon.price),
            owned: inventory.count(weapon.name),
            disabled: weapon.price > money,
          },
        ],
  );
  return { player, money: formatMoney(money), rows };
}

/**
 * Shop focus is an index into the rows, or rows.length for Done. Moving skips disabled rows
 * and wraps round at either end.
 */
export function moveShopFocus(rows: readonly ShopRow[], focus: number, delta: 1 | -1): number {
  const stops = rows.length + 1;
  let next = focus;
  for (let i = 0; i < stops; i++) {
    next = (next + delta + stops) % stops;
    if (next === rows.length || !rows[next]?.disabled) return next;
  }
  return rows.length;
}

/**
 * Where focus goes once the rows change (after a purchase, or when the screen opens): it stays
 * on the same row if that is still enabled, else moves to the next enabled row, else Done.
 */
export function settleShopFocus(rows: readonly ShopRow[], focus: number): number {
  for (let i = Math.max(0, focus); i < rows.length; i++) if (!rows[i]?.disabled) return i;
  return rows.length;
}

/**
 * Show the current shopper's Shop screen. ↑/↓ move between the enabled rows and Done; Enter
 * (routed through the returned handler) buys one Bundle of the focused row or finishes on
 * Done; Esc also finishes. `onDone` is called at most once.
 */
export function showShop(overlay: HTMLElement, match: Match, onDone: () => void): () => void {
  const playerId = match.currentShopper;
  if (playerId === null) throw new Error("No one is shopping");
  let finished = false;
  let focus = 0;
  let buttons: HTMLButtonElement[] = [];

  const header = el("h2");
  const list = el("div", undefined, "shop");
  const done = el("button", "Done");
  done.type = "button";

  const finish = (): void => {
    if (finished) return;
    finished = true;
    onDone();
  };

  const focusOn = (index: number): void => {
    focus = index;
    (buttons[index] ?? done).focus();
  };

  const buy = (index: number): void => {
    const row = shopView(match).rows[index];
    if (finished || !row || row.disabled) return;
    match.buy(playerId, row.name);
    focusOn(settleShopFocus(render().rows, index));
  };

  const render = (): ShopView => {
    const view = shopView(match);
    header.replaceChildren(playerName(view.player), `   Money: ${view.money}`);
    buttons = view.rows.map((row, i) => {
      const button = el("button", undefined, "shop-row");
      button.type = "button";
      button.disabled = row.disabled;
      button.append(
        el("span", row.name),
        el("span", row.bundle),
        el("span", row.price),
        el("span", `owned ${row.owned}`),
      );
      button.addEventListener("click", () => buy(i));
      button.addEventListener("focus", () => {
        focus = i;
      });
      return button;
    });
    list.replaceChildren(...buttons);
    return view;
  };

  done.addEventListener("click", finish);
  done.addEventListener("focus", () => {
    focus = buttons.length;
  });

  const box = el("div", undefined, "panel");
  box.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      focusOn(moveShopFocus(shopView(match).rows, focus, event.key === "ArrowUp" ? -1 : 1));
    }
  });
  box.append(header, list, done, el("p", "↑/↓ choose   Enter buy   Esc done", "hint"));
  overlay.replaceChildren(box);
  focusOn(settleShopFocus(render().rows, 0));
  return () => {
    if (focus >= buttons.length) finish();
    else buy(focus);
  };
}
