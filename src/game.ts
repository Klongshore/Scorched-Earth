import { attachKeyboard } from "./input/keyboard";
import type { MatchView } from "./render/hud";
import type { Renderer } from "./render/renderer";
import { MAX_TICKS_PER_FRAME, TICK_SECONDS } from "./sim/constants";
import { createPlayers } from "./sim/players";
import { Rng } from "./sim/rng";
import { Round, type RoundAction } from "./sim/round";
import type { PlayerKind } from "./sim/types";

/** Longest wall-clock gap one frame may feed the simulation (e.g. after a background tab). */
const MAX_FRAME_SECONDS = 0.25;

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

/**
 * The screens the app moves between. "setup" and "standings" arrive with the Setup and
 * Final standings screens; until then the app plays one Round after another.
 */
type Screen = "round" | "roundResults";

/** Until Match exists: two human Players playing a single Round hot-seat. */
const PLAYER_KINDS: readonly PlayerKind[] = ["human", "human"];

function startMatch(seed: number): MatchView {
  const players = createPlayers(PLAYER_KINDS);
  return { players, totalRounds: 1, round: new Round(1, players, new Rng(seed)) };
}

/** The app controller: owns the screen state, the keyboard and the fixed-timestep loop. */
export class Game {
  private screen: Screen = "round";
  private match: MatchView;
  private accumulator = 0;
  private lastFrame: number | null = null;
  private detachKeyboard: (() => void) | null = null;

  constructor(
    private readonly window: Window,
    private readonly renderer: Renderer,
  ) {
    this.match = this.newMatch();
  }

  start(): void {
    this.detachKeyboard ??= attachKeyboard(
      this.window,
      (action) => this.onAction(action),
      () => this.onConfirm(),
    );
    this.window.requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.detachKeyboard?.();
    this.detachKeyboard = null;
  }

  /** Seeding a new Match is the only place wall-clock time touches the simulation. */
  private newMatch(): MatchView {
    return startMatch(Date.now() >>> 0);
  }

  private onAction(action: RoundAction): void {
    if (this.screen === "round") this.match.round.act(action);
  }

  private onConfirm(): void {
    if (this.screen === "roundResults") {
      this.match = this.newMatch();
      this.screen = "round";
    }
  }

  private readonly frame = (now: number): void => {
    if (this.detachKeyboard === null) return; // stopped
    const frameSeconds = this.lastFrame === null ? 0 : (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const { round } = this.match;
    this.accumulator = advance(this.accumulator, frameSeconds, (dt) => round.tick(dt));
    if (this.screen === "round" && round.phase.kind === "over") this.screen = "roundResults";
    this.renderer.draw(this.match);
    this.window.requestAnimationFrame(this.frame);
  };
}
