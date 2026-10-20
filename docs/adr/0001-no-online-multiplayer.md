# No online multiplayer

Players share one keyboard (hot-seat) or play against Computer Players; there is no networked play. Online play would demand either deterministic lockstep simulation or an authoritative server, plus lobbies and latency handling, which would dwarf the game itself for a project shared among friends.

## Consequences

The simulation core is still kept pure, fixed-timestep and seeded, so adding replays or networking later would not mean rewriting game rules, only adding transport and synchronisation around them.
