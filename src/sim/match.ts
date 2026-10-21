import { DEFAULT_ROUNDS, MAX_ROUNDS, MIN_ROUNDS } from "./constants";
import { createPlayers } from "./players";
import { Rng } from "./rng";
import { Round, type RoundResult } from "./round";
import type { Player, PlayerKind } from "./types";

export interface MatchSetup {
  readonly playerKinds: readonly PlayerKind[]; // length 2 for now
  readonly rounds: number; // MIN_ROUNDS..MAX_ROUNDS
  readonly seed: number;
}

/** Clamp a Round count into MIN_ROUNDS..MAX_ROUNDS; anything that is not a number gives the default. */
export function clampRounds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ROUNDS;
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(value)));
}

export class Match {
  readonly players: Player[];
  readonly totalRounds: number;
  readonly roundWins: number[]; // indexed by playerId
  readonly results: RoundResult[] = [];
  round: Round;
  private readonly rng: Rng;

  constructor(setup: MatchSetup) {
    this.rng = new Rng(setup.seed);
    this.players = createPlayers(setup.playerKinds);
    this.totalRounds = clampRounds(setup.rounds);
    this.roundWins = this.players.map(() => 0);
    this.round = new Round(1, this.players, this.rng);
  }

  /** Call when round.phase is "over": records the result. */
  recordRoundResult(): void {
    const phase = this.round.phase;
    if (phase.kind !== "over") throw new Error("The Round is not over");
    this.results.push(phase.result);
    if (phase.result.kind === "win") {
      this.roundWins[phase.result.playerId] = (this.roundWins[phase.result.playerId] ?? 0) + 1;
    }
  }

  isOver(): boolean {
    return this.results.length >= this.totalRounds;
  }

  startNextRound(): void {
    if (this.isOver()) throw new Error("The Match is over");
    this.round = new Round(this.results.length + 1, this.players, this.rng);
  }

  /** Players sorted by Round Wins descending, then by id. */
  standings(): { player: Player; roundWins: number }[] {
    return this.players
      .map((player) => ({ player, roundWins: this.roundWins[player.id] ?? 0 }))
      .sort((a, b) => b.roundWins - a.roundWins || a.player.id - b.player.id);
  }

  /** The single Player with the most Round Wins, or null if tied at the top (a tied Match). */
  winner(): Player | null {
    const [first, second] = this.standings();
    if (!first) return null;
    if (second && second.roundWins === first.roundWins) return null;
    return first.player;
  }
}
