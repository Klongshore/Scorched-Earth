import { attachKeyboard } from "./input/keyboard";
import type { Renderer } from "./render/renderer";
import { MAX_TICKS_PER_FRAME, TICK_SECONDS } from "./sim/constants";
import { Match } from "./sim/match";
import type { RoundAction } from "./sim/round";
import {
  clampRounds,
  clearOverlay,
  showRoundResults,
  showSetup,
  showStandings,
  type SetupChoice,
} from "./ui/screens";

/** Longest wall-clock gap one frame may feed the simulation (e.g. after a background tab). */
const MAX_FRAME_SECONDS = 0.25;

/** How long the field stays in view after a Round ends before Round results appear. */
const ROUND_RESULTS_DELAY_SECONDS = 1;

/**
 * Feed one frame's wall-clock time into a fixed-timestep accumulator. Calls `tick` with
 * TICK_SECONDS at most MAX_TICKS_PER_FRAME times and returns the new accumulator.
 */
export function advance(
  accumulator: number,
  frameSeconds: number,
  tick: (dt: number) => void,
): number {
  accumulator += Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
  let steps = 0;
  while (accumulator >= TICK_SECONDS && steps < MAX_TICKS_PER_FRAME) {
    tick(TICK_SECONDS);
    accumulator -= TICK_SECONDS;
    steps++;
  }
  // If the frame budget ran out, drop the backlog rather than let it grow without bound.
  return Math.min(accumulator, TICK_SECONDS);
}

/** The screens the app moves between. */
type Screen = "setup" | "round" | "roundResults" | "standings";

/** The app controller: owns the screen state, the keyboard and the fixed-timestep loop. */
export class Game {
  private screen: Screen = "setup";
  private match: Match | null = null;
  /** Seconds of simulation left before Round results appear, counted once the Round is over. */
  private resultsDelay = ROUND_RESULTS_DELAY_SECONDS;
  private submitSetup: (() => void) | null = null;
  private accumulator = 0;
  private lastFrame: number | null = null;
  private detachKeyboard: (() => void) | null = null;

  constructor(
    private readonly window: Window,
    private readonly renderer: Renderer,
    private readonly overlay: HTMLElement,
  ) {}

  start(): void {
    if (this.detachKeyboard) return;
    this.detachKeyboard = attachKeyboard(
      this.window,
      (action) => this.onAction(action),
      () => this.onConfirm(),
    );
    this.showSetup();
    this.window.requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.detachKeyboard?.();
    this.detachKeyboard = null;
  }

  private showSetup(): void {
    this.screen = "setup";
    this.match = null;
    this.submitSetup = showSetup(this.overlay, (choice) => this.startMatch(choice));
  }

  /** Seeding a new Match is the only place wall-clock time touches the simulation. */
  private startMatch(choice: SetupChoice): void {
    if (this.screen !== "setup") return;
    this.submitSetup = null;
    this.match = new Match({
      playerKinds: choice.playerKinds,
      rounds: clampRounds(choice.rounds),
      seed: Date.now() >>> 0,
    });
    this.beginRound();
  }

  private beginRound(): void {
    this.screen = "round";
    this.resultsDelay = ROUND_RESULTS_DELAY_SECONDS;
    this.accumulator = 0;
    clearOverlay(this.overlay);
  }

  private onAction(action: RoundAction): void {
    if (this.screen === "round") this.match?.round.act(action);
  }

  private onConfirm(): void {
    const match = this.match;
    switch (this.screen) {
      case "setup":
        this.submitSetup?.();
        break;
      case "roundResults":
        if (!match) break;
        if (match.isOver()) {
          this.screen = "standings";
          showStandings(this.overlay, match);
        } else {
          match.startNextRound();
          this.beginRound();
        }
        break;
      case "standings":
        this.showSetup();
        break;
      case "round":
        break;
    }
  }

  private tick(match: Match, dt: number): void {
    const { round } = match;
    round.tick(dt);
    if (this.screen !== "round" || round.phase.kind !== "over") return;
    if (match.results.length < round.number) match.recordRoundResult();
    // Keep ticking and drawing for a moment so the final Explosion stays visible.
    this.resultsDelay -= dt;
    if (this.resultsDelay <= 0) {
      this.screen = "roundResults";
      showRoundResults(this.overlay, match);
    }
  }

  private readonly frame = (now: number): void => {
    if (this.detachKeyboard === null) return; // stopped
    const frameSeconds = this.lastFrame === null ? 0 : (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const match = this.match;
    if (match) {
      this.accumulator = advance(this.accumulator, frameSeconds, (dt) => this.tick(match, dt));
      this.renderer.draw(match);
    } else {
      this.renderer.drawBackdrop();
    }
    this.window.requestAnimationFrame(this.frame);
  };
}
