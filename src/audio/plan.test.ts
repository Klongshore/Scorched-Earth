import { describe, expect, it } from "vitest";
import type { Cue } from "../sim/cues";
import { FIELD_WIDTH } from "../sim/constants";
import { planSound } from "./plan";

const exploded = (over: Partial<Extract<Cue, { kind: "exploded" }>> = {}): Cue => ({
  kind: "exploded",
  explosion: "carve",
  x: 320,
  y: 300,
  radius: 20,
  ...over,
});
const fired = (x: number): Cue => ({ kind: "fired", weapon: "Missile", weaponKind: "blast", x });

function plan(cue: Cue) {
  const result = planSound(cue, FIELD_WIDTH);
  if (!result) throw new Error("expected a sound");
  return result;
}

describe("planSound", () => {
  it("plans the launch sound for a fired cue", () => {
    expect(plan(fired(320)).sound).toBe("launch");
  });

  it("pans left and right shots to their own side and the middle to the centre", () => {
    expect(plan(fired(0)).pan).toBe(-1);
    expect(plan(fired(FIELD_WIDTH)).pan).toBe(1);
    expect(plan(fired(FIELD_WIDTH / 2)).pan).toBe(0);
    expect(plan(exploded({ x: 80 })).pan).toBeLessThan(0);
    expect(plan(exploded({ x: 560 })).pan).toBeGreaterThan(0);
  });

  it("keeps pan within range for a column off the field", () => {
    expect(plan(exploded({ x: -50 })).pan).toBe(-1);
    expect(plan(exploded({ x: FIELD_WIDTH + 50 })).pan).toBe(1);
  });

  it("makes a bigger radius louder and bigger", () => {
    const small = plan(exploded({ radius: 20 }));
    const medium = plan(exploded({ radius: 45 }));
    const nuke = plan(exploded({ radius: 75 }));
    expect(medium.gain).toBeGreaterThan(small.gain);
    expect(nuke.gain).toBeGreaterThan(medium.gain);
    expect(nuke.size).toBeGreaterThan(small.size);
    expect(nuke.gain).toBeLessThanOrEqual(1);
  });

  it("plans a blast for a carving Explosion and a thud for a Dirt Weapon's", () => {
    expect(plan(exploded()).sound).toBe("blast");
    const thud = plan(exploded({ explosion: "dirt" }));
    expect(thud.sound).toBe("thud");
    expect(thud.gain).toBeLessThan(plan(exploded()).gain);
  });

  it("gives each Weapon class its own launch sound", () => {
    const kinds = ["blast", "mirv", "funky", "roller", "dirt"] as const;
    const sounds = kinds.map(
      (weaponKind) => plan({ kind: "fired", weapon: "Missile", weaponKind, x: 320 }).sound,
    );
    expect(new Set(sounds).size).toBe(kinds.length);
  });

  it("plans a sound for a MIRV split, a Funky Bomb scatter and a Roller starting to roll", () => {
    expect(plan({ kind: "split", x: 100, y: 50 }).sound).toBe("split");
    expect(plan({ kind: "scattered", x: 100, y: 50 }).sound).toBe("scatter");
    expect(plan({ kind: "rollStarted", x: 100 }).sound).toBe("rollStart");
  });

  it("leaves the looping flight and roll sounds to the player", () => {
    expect(planSound({ kind: "launched", x: 1 }, FIELD_WIDTH)).toBeNull();
    expect(planSound({ kind: "landed", x: 1 }, FIELD_WIDTH)).toBeNull();
    expect(planSound({ kind: "rollEnded", x: 1 }, FIELD_WIDTH)).toBeNull();
  });
});
