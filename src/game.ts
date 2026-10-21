import { attachKeyboard } from "./input/keyboard";
import type { Renderer } from "./render/renderer";
import { MAX_TICKS_PER_FRAME, ROUND_RESULTS_DELAY_SECONDS, TICK_SECONDS } from "./sim/constants";
import { Match } from "./sim/match";
import type { RoundAction } from "./sim/round";
import {
  clearScreen,
  showRoundResults,
  showSetup,
  showStandings,
  type SetupChoice,
} from "./ui/screens";

type Screen = "setup" | "round" | "roundResults" | "standings";

/** Owns the screen state and drives the simulation with a fixed timestep. */
export class Game {
  private screen: Screen = "setup";
  private match: Match;
  private accumulator = 0;
  private lastFrame = 0;
  private resultRecorded = false;
  private resultsDelay = 0;

  constructor(
    private readonly renderer: Renderer,
    private readonly overlay: HTMLElement,
  ) {
    this.match = this.backdropMatch();
  }

  start(): void {
    attachKeyboard(
      window,
      (action) => this.onAction(action),
      () => this.onConfirm(),
    );
    this.goToSetup();
    requestAnimationFrame((now) => {
      this.lastFrame = now;
      this.frame(now);
    });
  }

  /** An idle Match shown behind the Setup panel; it is never ticked. */
  private backdropMatch(): Match {
    return new Match({ playerKinds: ["human", "human"], rounds: 1, seed: Date.now() >>> 0 });
  }

  private goToSetup(): void {
    this.screen = "setup";
    this.match = this.backdropMatch();
    showSetup(this.overlay, (choice) => this.startMatch(choice));
  }

  private startMatch(choice: SetupChoice): void {
    // Wall-clock time touches the simulation only here, to seed a new Match.
    this.match = new Match({
      playerKinds: choice.playerKinds,
      rounds: choice.rounds,
      seed: Date.now() >>> 0,
    });
    this.beginRound();
  }

  private beginRound(): void {
    this.screen = "round";
    this.resultRecorded = false;
    this.resultsDelay = ROUND_RESULTS_DELAY_SECONDS;
    clearScreen(this.overlay);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  private onAction(action: RoundAction): void {
    if (this.screen === "round") this.match.round.act(action);
  }

  private onConfirm(): void {
    if (this.screen === "roundResults") {
      if (this.match.isOver()) {
        this.screen = "standings";
        showStandings(this.overlay, this.match);
      } else {
        this.match.startNextRound();
        this.beginRound();
      }
    } else if (this.screen === "standings") {
      this.goToSetup();
    }
  }

  private frame(now: number): void {
    this.accumulator += Math.min((now - this.lastFrame) / 1000, 0.25);
    this.lastFrame = now;
    if (this.screen === "round" || this.screen === "roundResults") {
      let steps = 0;
      while (this.accumulator >= TICK_SECONDS && steps < MAX_TICKS_PER_FRAME) {
        this.match.round.tick(TICK_SECONDS);
        this.afterTick();
        this.accumulator -= TICK_SECONDS;
        steps++;
      }
    }
    if (this.accumulator > TICK_SECONDS * MAX_TICKS_PER_FRAME) this.accumulator = 0;
    this.renderer.draw(this.match, this.screen === "round" || this.screen === "roundResults");
    requestAnimationFrame((t) => this.frame(t));
  }

  /** After the Round ends, keep ticking for a moment so the final Explosion stays visible. */
  private afterTick(): void {
    if (this.screen !== "round" || this.match.round.phase.kind !== "over") return;
    if (!this.resultRecorded) {
      this.match.recordRoundResult();
      this.resultRecorded = true;
    }
    this.resultsDelay -= TICK_SECONDS;
    if (this.resultsDelay <= 0) {
      this.screen = "roundResults";
      showRoundResults(this.overlay, this.match);
    }
  }
}
