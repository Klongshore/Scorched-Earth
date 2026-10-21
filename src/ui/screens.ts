import { DEFAULT_ROUNDS, MAX_ROUNDS, MIN_ROUNDS } from "../sim/constants";
import type { Match } from "../sim/match";
import { createPlayers } from "../sim/players";
import type { Player, PlayerKind } from "../sim/types";

/** What the Setup screen chooses; the Game adds the seed to make a MatchSetup. */
export interface SetupChoice {
  readonly playerKinds: readonly PlayerKind[];
  readonly rounds: number;
}

export const DEFAULT_PLAYER_KINDS: readonly PlayerKind[] = ["human", "computer"];

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
  const players = createPlayers(DEFAULT_PLAYER_KINDS);
  const selects = players.map((player, i) => {
    const label = el("label");
    const select = el("select");
    select.name = `player${i + 1}`;
    for (const kind of ["human", "computer"] as const) {
      const option = el("option", kind === "human" ? "Human" : "Computer");
      option.value = kind;
      option.selected = kind === DEFAULT_PLAYER_KINDS[i];
      select.append(option);
    }
    label.append(playerName(player), select);
    form.append(label);
    return select;
  });

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
    const value = clampRounds(rounds.value);
    rounds.value = String(value);
    onStart({ playerKinds: selects.map((s) => s.value as PlayerKind), rounds: value });
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
