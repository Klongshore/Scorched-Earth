import { MAX_ANGLE, MIN_ANGLE } from "./constants";
import type { Rng } from "./rng";
import { powerCap } from "./tank";
import type { PersonalityName, Tank } from "./types";

export interface Aim {
  angle: number;
  power: number;
}

/** Choose a Computer Player's aim for its Turn according to its Personality. */
export function chooseAim(personality: PersonalityName, tank: Tank, rng: Rng): Aim {
  switch (personality) {
    case "moron":
      // A random Angle and a random Power within the Tank's Health-based cap.
      return { angle: rng.int(MIN_ANGLE, MAX_ANGLE), power: rng.int(0, powerCap(tank)) };
  }
}
