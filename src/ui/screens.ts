import { DEFAULT_ROUNDS, MAX_ROUNDS, MIN_ROUNDS } from "../sim/constants";
import { clampRounds, type Match } from "../sim/match";
import { createPlayers } from "../sim/players";
import type { PlayerKind } from "../sim/types";

export interface SetupChoice {
  readonly playerKinds: PlayerKind[];
  readonly rounds: number;
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

function show(overlay: HTMLElement, panel: HTMLElement): void {
  overlay.replaceChildren(panel);
}

export function clearScreen(overlay: HTMLElement): void {
  overlay.replaceChildren();
}

export function showSetup(overlay: HTMLElement, onStart: (choice: SetupChoice) => void): void {
  const panel = el("div", undefined, "panel");
  panel.append(el("h1", "SCORCHED EARTH"));

  const selects: HTMLSelectElement[] = [];
  const defaults: PlayerKind[] = ["human", "computer"];
  for (const player of createPlayers(defaults)) {
    const row = el("label", `${player.name}: `, "row");
    row.style.color = player.color;
    const select = el("select");
    for (const kind of ["human", "computer"] as const) {
      const option = el("option", kind === "human" ? "Human" : "Computer");
      option.value = kind;
      select.append(option);
    }
    select.value = player.kind;
    selects.push(select);
    row.append(select);
    panel.append(row);
  }

  const roundsRow = el("label", "Rounds: ", "row");
  const rounds = el("input");
  rounds.type = "number";
  rounds.min = String(MIN_ROUNDS);
  rounds.max = String(MAX_ROUNDS);
  rounds.value = String(DEFAULT_ROUNDS);
  roundsRow.append(rounds);
  panel.append(roundsRow);

  const start = el("button", "Start");
  start.type = "button";
  start.addEventListener("click", () => {
    const parsed = rounds.value.trim() === "" ? Number.NaN : Number(rounds.value);
    onStart({
      playerKinds: selects.map((s) => (s.value === "computer" ? "computer" : "human")),
      rounds: clampRounds(parsed),
    });
  });
  panel.append(start);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target !== start) start.click();
  });
  panel.append(el("p", "←/→ Angle   ↑/↓ Power (Shift ×10)   Space Fire", "hint"));

  show(overlay, panel);
  start.focus();
}

function winsTable(match: Match): HTMLElement {
  const table = el("table");
  for (const { player, roundWins } of match.standings()) {
    const row = el("tr");
    row.style.color = player.color;
    row.append(el("td", player.name), el("td", String(roundWins)));
    table.append(row);
  }
  return table;
}

export function showRoundResults(overlay: HTMLElement, match: Match): void {
  const panel = el("div", undefined, "panel");
  const result = match.results[match.results.length - 1];
  const n = match.round.number;
  if (result?.kind === "win") {
    const winner = match.players[result.playerId];
    const heading = el("h2", `${winner?.name ?? "Player"} wins Round ${n}!`);
    if (winner) heading.style.color = winner.color;
    panel.append(heading);
  } else {
    panel.append(el("h2", `Round ${n} is a draw`));
  }
  panel.append(el("p", "Round Wins so far"), winsTable(match));
  panel.append(el("p", "Press Enter to continue", "hint"));
  show(overlay, panel);
}

export function showStandings(overlay: HTMLElement, match: Match): void {
  const panel = el("div", undefined, "panel");
  const winner = match.winner();
  const heading = el("h2", winner ? `${winner.name} wins the Match!` : "The Match is a tie");
  if (winner) heading.style.color = winner.color;
  panel.append(heading, winsTable(match));
  panel.append(el("p", "Press Enter for a new Match", "hint"));
  show(overlay, panel);
}
