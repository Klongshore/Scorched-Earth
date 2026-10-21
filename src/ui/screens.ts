import {
  DEFAULT_PLAYERS,
  DEFAULT_ROUNDS,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
} from "../sim/constants";
import type { Match } from "../sim/match";
import { createPlayers } from "../sim/players";
import type { Player, PlayerSetup } from "../sim/types";

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

const CONTROLS_REMINDER = "←/→ Angle   ↑/↓ Power (Shift ×10)   Space Fire";

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

function playerName(player: Player): HTMLElement {
  const span = el("span", player.name);
  span.style.color = player.color;
  return span;
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
    // Only the names and colours matter here; the dropdowns hold the actual choices.
    const players = createPlayers(optionValues.map(() => ({ kind: "human" })));
    const labels = players.map((player, i) => {
      const label = el("label");
      const select = el("select");
      select.name = `player${i + 1}`;
      for (const { label: text, setup } of PLAYER_OPTIONS) {
        const option = el("option", text);
        option.value = optionValue(setup);
        option.selected = option.value === optionValues[i];
        select.append(option);
      }
      label.append(playerName(player), select);
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

  let started = false;
  const submit = (): void => {
    if (started) return;
    started = true;
    const choice = setupChoiceFrom(
      selects.map((s) => s.value),
      rounds.value,
    );
    rounds.value = String(choice.rounds);
    onStart(choice);
  };
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

/** Show the result of the Round that just ended (it must already be recorded). */
export function showRoundResults(overlay: HTMLElement, match: Match): void {
  const { number } = match.round;
  const result = match.results[number - 1];
  const heading = el("h2");
  const winner = result?.kind === "win" ? match.players[result.playerId] : undefined;
  if (winner) heading.append(playerName(winner), ` wins Round ${number}!`);
  else heading.textContent = `Round ${number} is a draw`;
  panel(overlay, heading, winsTable(match), el("p", "Press Enter to continue", "hint"));
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
