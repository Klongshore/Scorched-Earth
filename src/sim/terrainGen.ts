import {
  TERRAIN_BASE_FRACTION,
  TERRAIN_HARMONICS,
  TERRAIN_MAX_AMPLITUDE,
  TERRAIN_MAX_FRACTION,
  TERRAIN_MIN_FRACTION,
} from "./constants";
import type { Rng } from "./rng";
import { Terrain } from "./terrain";

export function generateHills(rng: Rng, width: number, height: number): Terrain {
  const base = height * TERRAIN_BASE_FRACTION;
  const min = height * TERRAIN_MIN_FRACTION;
  const max = height * TERRAIN_MAX_FRACTION;

  const harmonics: { amp: number; freq: number; phase: number }[] = [];
  for (let k = 1; k <= TERRAIN_HARMONICS; k++) {
    harmonics.push({
      amp: (rng.range(0.3, 1) * TERRAIN_MAX_AMPLITUDE) / k,
      freq: k * rng.range(0.8, 1.2),
      phase: rng.range(0, 2 * Math.PI),
    });
  }

  const surface: number[] = [];
  for (let x = 0; x < width; x++) {
    let y = base;
    for (const h of harmonics) y += h.amp * Math.sin((2 * Math.PI * h.freq * x) / width + h.phase);
    surface.push(Math.round(Math.min(max, Math.max(min, y))));
  }
  return Terrain.fromSurface(surface, width, height);
}
