# Separate randomness for flavour

Death Animations, Epitaphs and Taunts are chosen with their own random stream, seeded from the Match seed, rather than drawing from the simulation's Rng. Drawing from the simulation's Rng would shift every later draw (Wind, Terrain, Computer Player aim) whenever a Tank died or spoke, so purely cosmetic choices would change who wins a seeded Match.

## Consequences

A seeded Match plays out exactly as it did before these features existed, and still looks the same each time it is replayed. Anything that can affect the outcome of a Round must keep drawing from the simulation's Rng, never from the flavour stream.
