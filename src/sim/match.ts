import { MAX_ROUNDS, MIN_ROUNDS } from "./constants";
import { createPlayers } from "./players";
import { Rng } from "./rng";
import { Round, type RoundResult } from "./round";
import type { Player, PlayerKind } from "./types";

export interface MatchSetup {
  readonly playerKinds: readonly PlayerKind[]; // length 2 for now
  readonly rounds: number; // MIN_ROUNDS..MAX_ROUNDS
  readonly seed: number;
}

export class Match {
  readonly players: Player[];
  readonly totalRounds: number;
  readonly roundWins: number[]; // indexed by playerId
  readonly results: RoundResult[] = [];
  round: Round;

  /** One Rng per Match, shared by every Round, so the whole Match is reproducible from its seed. */
  private readonly rng: Rng;

  constructor(setup: MatchSetup) {
    const { rounds } = setup;
    if (!Number.isInteger(rounds) || rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
      throw new Error(`Rounds must be an integer in ${MIN_ROUNDS}..${MAX_ROUNDS}, got ${rounds}`);
    }
    this.rng = new Rng(setup.seed);
    this.players = createPlayers(setup.playerKinds);
    this.totalRounds = rounds;
    this.roundWins = this.players.map(() => 0);
    this.round = new Round(1, this.players, this.rng);
  }

  /** Call when round.phase is "over": records the result. */
  recordRoundResult(): void {
    const phase = this.round.phase;
    if (phase.kind !== "over") throw new Error("Round is not over");
    if (this.results.length >= this.round.number) {
      throw new Error(`Round ${this.round.number} result already recorded`);
    }
    const result = phase.result;
    this.results.push(result);
    if (result.kind === "win") {
      this.roundWins[result.playerId] = (this.roundWins[result.playerId] ?? 0) + 1;
    }
  }

  isOver(): boolean {
    return this.results.length === this.totalRounds;
  }

  startNextRound(): void {
    if (this.isOver()) throw new Error("Match is over");
    if (this.results.length < this.round.number) {
      throw new Error(`Round ${this.round.number} result not recorded yet`);
    }
    this.round = new Round(this.round.number + 1, this.players, this.rng);
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
