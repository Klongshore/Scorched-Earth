# Pixel-bitmap Terrain, not a heightmap

Terrain is stored as a per-pixel bitmap of dirt rather than a heightmap (one height per column). A heightmap is simpler and faster, but cannot represent overhangs or tunnels, so it would rule out the original game's Settling dirt, digging weapons and collapses, which a faithful remake needs.

## Consequences

Collision and Settling operate per pixel, which in turn requires a fixed logical resolution (640×480) so every Round behaves identically regardless of screen size.
