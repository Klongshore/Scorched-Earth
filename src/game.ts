import { SoundPlayer } from "./audio/audio";
import { attachKeyboard } from "./input/keyboard";
import { attachMute } from "./input/mute";
import { attachTouchControls } from "./input/touch";
import type { Renderer } from "./render/renderer";
import { MAX_TICKS_PER_FRAME, TICK_SECONDS } from "./sim/constants";
import { Match } from "./sim/match";
import type { RoundAction } from "./sim/round";
import {
  clearOverlay,
  showRoundResults,
  showSetup,
  showShop,
  showStandings,
  type SetupChoice,
} from "./ui/screens";

/**
 * Most simulation time the loop will owe at once (e.g. after a background tab). A frame ticks at
 * most MAX_TICKS_PER_FRAME times; any backlog up to this cap is caught up over the next frames,
 * and anything beyond it is dropped.
 */
const MAX_BACKLOG_SECONDS = 0.25;

/** Least time the field stays in view after a Round ends before Round results appear. */
const ROUND_RESULTS_DELAY_SECONDS = 1;

/**
 * Seconds from a Round ending until Round results appear, given the seconds left on its longest
 * Epitaph still showing: the larger of the two, so the last line of the Round can be read.
 */
export function roundResultsDelay(epitaphSecondsLeft: number): number {
  return Math.max(ROUND_RESULTS_DELAY_SECONDS, epitaphSecondsLeft);
}

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
type Screen = "setup" | "shop" | "round" | "roundResults" | "standings";

export type GameOptions = {
  /** Seed every Match with this instead of the wall clock, to reproduce a Match. */
  readonly seed?: number;
  /** Where to put the on-screen controls for touch screens; they only work during a Round. */
  readonly touchControls?: HTMLElement;
  /** The on-screen Mute button for touch screens. */
  readonly muteButton?: HTMLElement;
};

/** The app controller: owns the screen state, the keyboard and the fixed-timestep loop. */
export class Game {
  private screen: Screen = "setup";
  private match: Match | null = null;
  /** Seconds of simulation left before Round results appear, counted once the Round is over. */
  private resultsDelay = ROUND_RESULTS_DELAY_SECONDS;
  private submitSetup: (() => void) | null = null;
  /** The Shop screen's Enter handler, while a Human is shopping. */
  private confirmShop: (() => void) | null = null;
  private accumulator = 0;
  private detachKeyboard: (() => void) | null = null;
  private detachTouch: (() => void) | null = null;
  private detachUnlock: (() => void) | null = null;
  private detachMute: (() => void) | null = null;
  private readonly loop: FrameLoop;
  private readonly sound = new SoundPlayer();

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
    const { touchControls } = this.options;
    if (touchControls) {
      this.detachTouch = attachTouchControls(touchControls, (action) => this.onAction(action));
    }
    // Browsers keep audio locked until a gesture; the first click, tap or key press unlocks it.
    const unlock = (): void => this.sound.unlock();
    const gestures = ["pointerdown", "keydown"] as const;
    for (const g of gestures) this.window.addEventListener(g, unlock);
    this.detachUnlock = () => {
      for (const g of gestures) this.window.removeEventListener(g, unlock);
    };
    const { muteButton } = this.options;
    const showMute = (): void => {
      muteButton?.classList.toggle("muted", this.sound.isMuted());
      muteButton?.setAttribute("aria-pressed", String(this.sound.isMuted()));
    };
    showMute();
    this.detachMute = attachMute(this.window, muteButton, () => {
      this.sound.setMuted(!this.sound.isMuted());
      showMute();
    });
    this.showSetup();
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
    this.detachKeyboard?.();
    this.detachKeyboard = null;
    this.detachTouch?.();
    this.detachTouch = null;
    this.detachUnlock?.();
    this.detachUnlock = null;
    this.detachMute?.();
    this.detachMute = null;
  }

  /** Move to `screen`; the on-screen controls are greyed out except during a Round. */
  private enter(screen: Screen): void {
    // A Round ending or beginning leaves no Projectile in flight: stop any flight or roll loop.
    this.sound.stopLoops();
    this.screen = screen;
    this.options.touchControls?.classList.toggle("idle", screen !== "round");
  }

  private showSetup(): void {
    this.enter("setup");
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
    this.shopOrPlay();
  }

  /** Show the Shop to the next Human who still has to shop, or begin the Round once all are done. */
  private shopOrPlay(): void {
    const match = this.match;
    if (!match) return;
    const shopper = match.currentShopper;
    if (shopper === null) {
      this.confirmShop = null;
      this.beginRound();
      return;
    }
    this.enter("shop");
    this.confirmShop = showShop(this.overlay, match, () => {
      if (this.match !== match || this.screen !== "shop") return;
      match.finishShopping(shopper);
      this.shopOrPlay();
    });
  }

  private beginRound(): void {
    this.enter("round");
    this.resultsDelay = ROUND_RESULTS_DELAY_SECONDS;
    this.accumulator = 0;
    clearOverlay(this.overlay);
  }

  private onAction(action: RoundAction): void {
    if (this.screen === "round") this.match?.round?.act(action);
  }

  private onConfirm(): void {
    const match = this.match;
    switch (this.screen) {
      case "setup":
        this.submitSetup?.();
        break;
      case "shop":
        this.confirmShop?.();
        break;
      case "roundResults":
        if (!match) break;
        if (match.isOver()) {
          this.enter("standings");
          showStandings(this.overlay, match, () => this.onConfirm());
        } else {
          match.startNextRound();
          this.shopOrPlay();
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
    if (!round || match.stage.kind !== "playing") return;
    round.tick(dt);
    if (this.screen !== "round" || round.phase.kind !== "over") return;
    if (match.results.length < round.number) {
      match.recordRoundResult();
      this.resultsDelay = roundResultsDelay(round.epitaphSecondsLeft);
    }
    // Keep ticking and drawing for a moment so the final Death Animation and Epitaphs stay visible.
    this.resultsDelay -= dt;
    if (this.resultsDelay <= 0) {
      this.enter("roundResults");
      showRoundResults(this.overlay, match, () => this.onConfirm());
    }
  }

  private frame(frameSeconds: number): void {
    const match = this.match;
    if (match) {
      this.accumulator = advance(this.accumulator, frameSeconds, (dt) => this.tick(match, dt));
      // Sound is spectacle only: the cues are read after the ticks and never fed back.
      if (match.round) this.sound.play(match.round.drainCues());
      this.renderer.draw(match);
    } else {
      this.renderer.drawBackdrop();
    }
  }
}
