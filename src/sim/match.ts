import {
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
  MONEY_PER_ROUND_WIN,
  STARTING_MONEY,
  weaponNamed,
} from "./constants";
import { Inventory } from "./inventory";
import { createPlayers } from "./players";
import { Rng } from "./rng";
import { Round, type RoundResult } from "./round";
import type { Player, PlayerSetup, WeaponName } from "./types";

export interface MatchSetup {
  readonly players: readonly PlayerSetup[]; // one per Player, MIN_PLAYERS..MAX_PLAYERS
  readonly rounds: number; // MIN_ROUNDS..MAX_ROUNDS
  readonly seed: number;
}

/** Whether the Shop is open before a Round, or the Round is being played. */
export type MatchStage =
  | { kind: "shopping"; shoppers: number[] } // Humans still to shop, in Player order
  | { kind: "playing" };

export class Match {
  readonly players: Player[];
  readonly totalRounds: number;
  readonly roundWins: number[]; // indexed by playerId
  readonly results: RoundResult[] = [];
  /** Each Player's Money, indexed by playerId. Never decides the Match. */
  readonly money: number[];
  /** Money each Player earned in the last finished Round (Round Win bonus included), by playerId. */
  readonly earnedThisRound: number[];
  /** Each Player's Inventory for the whole Match, indexed by playerId. */
  readonly inventories: Inventory[];
  /** The Weapon each Player last chose, indexed by playerId; carried from Round to Round. */
  readonly chosenWeapons: WeaponName[];
  stage: MatchStage = { kind: "playing" };
  /** The Round being played, or the last one while the Shop is open; null before Round 1. */
  round: Round | null = null;

  /** One Rng per Match, shared by every Round, so the whole Match is reproducible from its seed. */
  private readonly rng: Rng;

  constructor(setup: MatchSetup) {
    const { rounds } = setup;
    const count = setup.players.length;
    if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
      throw new Error(`Players must number ${MIN_PLAYERS}..${MAX_PLAYERS}, got ${count}`);
    }
    if (!Number.isInteger(rounds) || rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
      throw new Error(`Rounds must be an integer in ${MIN_ROUNDS}..${MAX_ROUNDS}, got ${rounds}`);
    }
    this.rng = new Rng(setup.seed);
    this.players = createPlayers(setup.players);
    this.totalRounds = rounds;
    this.roundWins = this.players.map(() => 0);
    this.money = this.players.map(() => STARTING_MONEY);
    this.earnedThisRound = this.players.map(() => 0);
    this.inventories = this.players.map(() => new Inventory());
    this.chosenWeapons = this.players.map(() => "Baby Missile");
    this.openShop();
  }

  /** The Human whose Shop screen is showing, or null once every Human is done. */
  get currentShopper(): number | null {
    return this.stage.kind === "shopping" ? (this.stage.shoppers[0] ?? null) : null;
  }

  /** The current shopper buys one Bundle of a Weapon. Throws out of turn or when unaffordable. */
  buy(playerId: number, name: WeaponName): void {
    this.requireShopper(playerId);
    const weapon = weaponNamed(name);
    const money = this.money[playerId] ?? 0;
    if (weapon.bundle === null) throw new Error(`${name} is not sold in the Shop`);
    if (weapon.price > money) throw new Error(`Player ${playerId} cannot afford ${name}`);
    this.money[playerId] = money - weapon.price;
    this.inventoryOf(playerId).add(name, weapon.bundle);
  }

  /** The current shopper is done; after the last Human the Round starts. */
  finishShopping(playerId: number): void {
    this.requireShopper(playerId);
    if (this.stage.kind !== "shopping") return;
    this.stage.shoppers.shift();
    if (this.stage.shoppers.length === 0) this.startRound();
  }

  inventoryOf(playerId: number): Inventory {
    const inventory = this.inventories[playerId];
    if (!inventory) throw new Error(`No player ${playerId}`);
    return inventory;
  }

  /** The Round being played; throws while the Shop is open before Round 1. */
  requireRound(): Round {
    if (!this.round) throw new Error("No Round has started yet");
    return this.round;
  }

  /** Open the Shop for every Human in Player order, or start the Round if there are none. */
  private openShop(): void {
    const shoppers = this.players.filter((p) => p.kind === "human").map((p) => p.id);
    if (shoppers.length === 0) this.startRound();
    else this.stage = { kind: "shopping", shoppers };
  }

  private startRound(): void {
    const loadout = { inventories: this.inventories, chosenWeapons: this.chosenWeapons };
    this.round = new Round(this.results.length + 1, this.players, this.rng, loadout);
    this.stage = { kind: "playing" };
  }

  private requireShopper(playerId: number): void {
    const shopper = this.currentShopper;
    if (shopper !== playerId) {
      throw new Error(`Player ${playerId} is not shopping (current shopper: ${shopper})`);
    }
  }

  /** Call when round.phase is "over": records the result and pays out the Round's Money. */
  recordRoundResult(): void {
    const round = this.requireRound();
    const phase = round.phase;
    if (this.stage.kind !== "playing") throw new Error("The Shop is open");
    if (phase.kind !== "over") throw new Error("Round is not over");
    if (this.results.length >= round.number) {
      throw new Error(`Round ${round.number} result already recorded`);
    }
    const result = phase.result;
    this.results.push(result);
    if (result.kind === "win") {
      this.roundWins[result.playerId] = (this.roundWins[result.playerId] ?? 0) + 1;
    }
    for (const { id } of this.players) {
      const bonus = result.kind === "win" && result.playerId === id ? MONEY_PER_ROUND_WIN : 0;
      const earned = (round.earnings[id] ?? 0) + bonus;
      this.earnedThisRound[id] = earned;
      this.money[id] = (this.money[id] ?? 0) + earned;
    }
  }

  isOver(): boolean {
    return this.results.length === this.totalRounds;
  }

  /** Call after recording a Round's result: opens the Shop before the next Round. */
  startNextRound(): void {
    if (this.isOver()) throw new Error("Match is over");
    if (this.stage.kind !== "playing") throw new Error("The Shop is already open");
    const round = this.requireRound();
    if (this.results.length < round.number) {
      throw new Error(`Round ${round.number} result not recorded yet`);
    }
    this.openShop();
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
