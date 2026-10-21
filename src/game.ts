import { attachKeyboard } from "./input/keyboard";
import type { Renderer } from "./render/renderer";
import { MAX_TICKS_PER_FRAME, TICK_SECONDS } from "./sim/constants";
import { Match } from "./sim/match";
import type { RoundAction } from "./sim/round";
import {
  clearOverlay,
  showRoundResults,
  showSetup,
  showStandings,
  type SetupChoice,
} from "./ui/screens";

/**
 * Most simulation time the loop will owe at once (e.g. after a background tab). A frame ticks at
 * most MAX_TICKS_PER_FRAME times; any backlog up to this cap is caught up over the next frames,
 * and anything beyond it is dropped.
 */
const MAX_BACKLOG_SECONDS = 0.25;

/** How long the field stays in view after a Round ends before Round results appear. */
const ROUND_RESULTS_DELAY_SECONDS = 1;

/**
 * Feed one frame's wall-clock time into a fixed-timestep accumulator. Calls `tick` with
 * TICK_SECONDS at most MAX_TICKS_PER_FRAME times and returns the new accumulator, which never
 * holds more than MAX_BACKLOG_SECONDS.
 */
export function advance(
  accumulator: number,
  frameSeconds: number,
  tick: (dt: number) => void,
): number {
  accumulator = Math.min(accumulator + Math.max(frameSeconds, 0), MAX_BACKLOG_SECONDS);
  let steps = 0;
  while (accumulator >= TICK_SECONDS && steps < MAX_TICKS_PER_FRAME) {
    tick(TICK_SECONDS);
    accumulator -= TICK_SECONDS;
    steps++;
  }
  return accumulator;
}

/** `?seed=N` in the page's query string seeds every Match with N, to reproduce a Match. */
export function seedFromQuery(search: string): number | undefined {
  const param = new URLSearchParams(search).get("seed");
  if (param === null || param.trim() === "") return undefined;
  const seed = Number(param);
  return Number.isFinite(seed) ? seed >>> 0 : undefined;
}

type FrameScheduler = Pick<Window, "requestAnimationFrame" | "cancelAnimationFrame">;

/** A requestAnimationFrame loop that calls `onFrame` with the seconds since the previous frame. */
export class FrameLoop {
  private requestId: number | null = null;
  private lastFrame: number | null = null;

  constructor(
    private readonly scheduler: FrameScheduler,
    private readonly onFrame: (frameSeconds: number) => void,
  ) {}

  /** Start the loop; the first frame reports 0 seconds. Does nothing if already running. */
  start(): void {
    if (this.requestId !== null) return;
    this.lastFrame = null;
    this.requestId = this.scheduler.requestAnimationFrame(this.frame);
  }

  /** Stop the loop, cancelling the pending frame. */
  stop(): void {
    if (this.requestId !== null) this.scheduler.cancelAnimationFrame(this.requestId);
    this.requestId = null;
  }

  private readonly frame = (now: number): void => {
    const frameSeconds = this.lastFrame === null ? 0 : (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    // Request the next frame first, so a stop() (or stop(); start()) inside onFrame cancels it.
    this.requestId = this.scheduler.requestAnimationFrame(this.frame);
    this.onFrame(frameSeconds);
  };
}

/** The screens the app moves between. */
type Screen = "setup" | "round" | "roundResults" | "standings";

export type GameOptions = {
  /** Seed every Match with this instead of the wall clock, to reproduce a Match. */
  readonly seed?: number;
};

/** The app controller: owns the screen state, the keyboard and the fixed-timestep loop. */
export class Game {
  private screen: Screen = "setup";
  private match: Match | null = null;
  /** Seconds of simulation left before Round results appear, counted once the Round is over. */
  private resultsDelay = ROUND_RESULTS_DELAY_SECONDS;
  private submitSetup: (() => void) | null = null;
  private accumulator = 0;
  private detachKeyboard: (() => void) | null = null;
  private readonly loop: FrameLoop;

  constructor(
    private readonly window: Window,
    private readonly renderer: Renderer,
    private readonly overlay: HTMLElement,
    private readonly options: GameOptions = {},
  ) {
    this.loop = new FrameLoop(window, (frameSeconds) => this.frame(frameSeconds));
  }

  start(): void {
    if (this.detachKeyboard) return;
    this.detachKeyboard = attachKeyboard(
      this.window,
      (action) => this.onAction(action),
      () => this.onConfirm(),
    );
    this.showSetup();
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
    this.detachKeyboard?.();
    this.detachKeyboard = null;
  }

  private showSetup(): void {
    this.screen = "setup";
    this.match = null;
    this.submitSetup = showSetup(this.overlay, (choice) => this.startMatch(choice));
  }

  /**
   * Seeding a new Match is the only place wall-clock time touches the simulation.
   * The Setup screen has already clamped the Round count.
   */
  private startMatch(choice: SetupChoice): void {
    if (this.screen !== "setup") return;
    this.submitSetup = null;
    this.match = new Match({
      players: choice.players,
      rounds: choice.rounds,
      seed: this.options.seed ?? Date.now() >>> 0,
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

  private frame(frameSeconds: number): void {
    const match = this.match;
    if (match) {
      this.accumulator = advance(this.accumulator, frameSeconds, (dt) => this.tick(match, dt));
      this.renderer.draw(match);
    } else {
      this.renderer.drawBackdrop();
    }
  }
}
