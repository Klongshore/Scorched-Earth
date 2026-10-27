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
});

describe("planSound for consequences", () => {
  it("plans a hit sound at the Tank's position", () => {
    const result = plan({ kind: "tankHit", x: 0, y: 100 });
    expect(result.sound).toBe("hit");
    expect(result.pan).toBe(-1);
  });

  it("maps each Death Animation kind to its own sound", () => {
    const kinds = ["fireball", "sparkShower", "disintegration", "popAndSmoke"] as const;
    const sounds = kinds.map(
      (animation) => plan({ kind: "tankDestroyed", animation, x: 320, y: 100 }).sound,
    );
    expect(new Set(sounds).size).toBe(4);
    expect(sounds).not.toContain("hit");
  });

  it("plans different stings for a win and a Draw", () => {
    expect(plan({ kind: "roundWon" }).sound).toBe("roundWin");
    expect(plan({ kind: "roundDraw" }).sound).toBe("roundDraw");
  });
});

describe("planSound for Settling", () => {
  it("plans a centred rumble that gets louder the more dirt moves", () => {
    const small = plan({ kind: "dirtMoving", amount: 20 });
    const big = plan({ kind: "dirtMoving", amount: 300 });
    expect(small.sound).toBe("rumble");
    expect(small.pan).toBe(0);
    expect(big.gain).toBeGreaterThan(small.gain);
    expect(plan({ kind: "dirtMoving", amount: 1e6 }).gain).toBeLessThanOrEqual(1);
  });

  it("plans a louder landing for more Fall Damage, panned to the Tank", () => {
    const soft = plan({ kind: "tankLanded", x: 80, fallDamage: 0 });
    const hard = plan({ kind: "tankLanded", x: 80, fallDamage: 40 });
    expect(soft.sound).toBe("landing");
    expect(hard.gain).toBeGreaterThan(soft.gain);
    expect(hard.pan).toBeLessThan(0);
  });

  it("plans the Parachute sound at the Tank", () => {
    const opened = plan({ kind: "parachuteOpened", x: 560 });
    expect(opened.sound).toBe("parachute");
    expect(opened.pan).toBeGreaterThan(0);
  });
});
