import { FIELD_WIDTH } from "../sim/constants";
import type { Cue } from "../sim/cues";
import { loadMuted, saveMuted } from "./mute";
import { planSound, type SoundPlan } from "./plan";

/** Time constant for the rumble's level changes. */
const RUMBLE_SMOOTHING = 0.06;
/** How long after the last dirt cue the rumble keeps going, so a quiet frame does not stutter it. */
const RUMBLE_HOLD_SECONDS = 0.12;

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(scope: object): AudioContextConstructor | null {
  const s = scope as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return s.AudioContext ?? s.webkitAudioContext ?? null;
}

/**
 * Plays Sound Effects, all synthesized with Web Audio (no audio files). Does nothing until
 * `unlock()` has been called from a user gesture, and nothing at all if audio is unavailable.
 */
export class SoundPlayer {
  private context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;
  private failed = false;
  private muted = loadMuted();
  /** The one continuous rumble of falling dirt, once started. */
  private rumble: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  /** Context time the rumble last heard dirt move. */
  private rumbleHeardAt = 0;

  constructor(private readonly scope: object = globalThis) {}

  /** Create or resume the audio context. Call from the first click, tap or key press. */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.context) {
        const Ctor = audioContextConstructor(this.scope);
        if (!Ctor) {
          this.failed = true;
          return;
        }
        this.context = new Ctor();
        this.noise = noiseBuffer(this.context);
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") void this.context.resume().catch(() => {});
    } catch {
      this.failed = true;
      this.context = null;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Mute or unmute all Sound Effects, including any already playing, and remember the choice. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    saveMuted(muted);
    try {
      if (this.master) this.master.gain.value = muted ? 0 : 1;
    } catch {
      // Silence is best effort.
    }
  }

  /** Play the Sound Effect for each cue, in order. */
  play(cues: readonly Cue[]): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running") return;
    // Called every frame, even with no cues, so the rumble dies away once dirt stops moving.
    try {
      this.fadeRumbleIfQuiet(ctx);
    } catch {
      // Silence, never a broken game.
    }
    // The rumble runs through the master gain, so it is already silent while muted.
    if (this.muted) return;
    for (const cue of cues) {
      const plan = planSound(cue, FIELD_WIDTH);
      if (!plan) continue;
      try {
        if (plan.sound === "rumble") this.driveRumble(ctx, plan);
        else this.synthesize(ctx, plan);
      } catch {
        // A sound that cannot be made is silence, never a broken game.
      }
    }
  }

  private synthesize(ctx: AudioContext, plan: SoundPlan): void {
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = plan.gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = plan.pan;
    out.connect(panner).connect(this.master ?? ctx.destination);
    switch (plan.sound) {
      case "launch":
        this.sweep(ctx, out, now, 0.18, 700, 180, "sawtooth", 0.5);
        this.burst(ctx, out, now, 0.12, 2400, 0.5);
        break;
      case "blast": {
        // Bigger blasts are deeper and last longer.
        const length = 0.35 + plan.size * 1.4;
        this.burst(ctx, out, now, length, 1800 - plan.size * 1400, 1);
        this.sweep(ctx, out, now, length, 140 - plan.size * 90, 28, "sine", 0.9);
        break;
      }
      case "landing":
        // A heavier landing is deeper and longer.
        this.sweep(ctx, out, now, 0.15 + plan.size * 0.3, 130 - plan.size * 60, 35, "sine", 1);
        this.burst(
          ctx,
          out,
          now,
          0.08 + plan.size * 0.2,
          500 - plan.size * 250,
          0.4 + plan.size * 0.5,
        );
        break;
      case "parachute":
        // A soft whoosh of cloth catching air.
        this.burst(ctx, out, now, 0.4, 1500, 0.35);
        this.sweep(ctx, out, now, 0.3, 300, 500, "triangle", 0.15);
        break;
      case "rumble":
        break;
      case "thud":
        this.sweep(ctx, out, now, 0.25 + plan.size * 0.2, 110, 40, "sine", 1);
        this.burst(ctx, out, now, 0.12, 300, 0.35);
        break;
      case "hit":
        this.sweep(ctx, out, now, 0.12, 320, 120, "square", 0.5);
        this.burst(ctx, out, now, 0.1, 2000, 0.6);
        break;
      case "destroyFireball":
        this.burst(ctx, out, now, 1.4, 1400, 1);
        this.sweep(ctx, out, now, 1.4, 90, 25, "sine", 1);
        break;
      case "destroySparks":
        for (let i = 0; i < 6; i++) {
          const t = now + i * 0.07;
          this.burst(ctx, out, t, 0.08, 7000, 0.5);
          this.sweep(ctx, out, t, 0.08, 3200 - i * 300, 1800, "square", 0.15);
        }
        break;
      case "destroyDisintegrate":
        this.burst(ctx, out, now, 1.2, 5000, 0.8);
        this.sweep(ctx, out, now, 1.2, 900, 60, "sawtooth", 0.4);
        break;
      case "destroyPop":
        this.sweep(ctx, out, now, 0.08, 600, 200, "sine", 1);
        this.burst(ctx, out, now + 0.05, 0.7, 900, 0.5);
        break;
      case "roundWin":
        [523, 659, 784, 1047].forEach((f, i) =>
          this.sweep(ctx, out, now + i * 0.12, 0.35, f, f, "triangle", 0.6),
        );
        break;
      case "roundDraw":
        [392, 330, 262].forEach((f, i) =>
          this.sweep(ctx, out, now + i * 0.18, 0.4, f, f * 0.97, "triangle", 0.6),
        );
        break;
    }
  }

  /**
   * The falling-dirt rumble is a single looping noise whose loudness follows the latest cue.
   * Each cue only moves the target level; it never starts another sound.
   */
  private driveRumble(ctx: AudioContext, plan: SoundPlan): void {
    if (!this.rumble) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 200;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source
        .connect(filter)
        .connect(gain)
        .connect(this.master ?? ctx.destination);
      source.start();
      this.rumble = { gain, filter };
    }
    const now = ctx.currentTime;
    this.rumbleHeardAt = now;
    this.rumble.gain.gain.setTargetAtTime(plan.gain, now, RUMBLE_SMOOTHING);
    this.rumble.filter.frequency.setTargetAtTime(120 + plan.size * 260, now, RUMBLE_SMOOTHING);
  }

  /** Dirt has stopped moving if no cue has arrived for a moment: let the rumble die away. */
  private fadeRumbleIfQuiet(ctx: AudioContext): void {
    const rumble = this.rumble;
    if (!rumble || ctx.currentTime - this.rumbleHeardAt < RUMBLE_HOLD_SECONDS) return;
    rumble.gain.gain.setTargetAtTime(0, ctx.currentTime, RUMBLE_SMOOTHING);
  }

  /** Low-passed noise that fades out over `length` seconds. */
  private burst(
    ctx: AudioContext,
    out: AudioNode,
    start: number,
    length: number,
    cutoff: number,
    level: number,
  ): void {
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.max(80, cutoff), start);
    filter.frequency.exponentialRampToValueAtTime(60, start + length);
    source
      .connect(filter)
      .connect(fade(ctx, start, length, level))
      .connect(out);
    source.start(start);
    source.stop(start + length);
  }

  /** An oscillator sliding from one pitch to another while it fades out. */
  private sweep(
    ctx: AudioContext,
    out: AudioNode,
    start: number,
    length: number,
    from: number,
    to: number,
    type: OscillatorType,
    level: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + length);
    osc.connect(fade(ctx, start, length, level)).connect(out);
    osc.start(start);
    osc.stop(start + length);
  }
}

function fade(ctx: AudioContext, start: number, length: number, level: number): GainNode {
  const env = ctx.createGain();
  env.gain.setValueAtTime(level, start);
  env.gain.exponentialRampToValueAtTime(0.001, start + length);
  return env;
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Cosmetic randomness; deliberately not the simulation's Rng (ADR 0003).
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
