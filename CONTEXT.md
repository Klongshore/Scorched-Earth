# Scorched Earth

A faithful browser remake of the 1991 turn-based artillery game: tanks on destructible terrain take turns firing at each other until one remains.

## Language

### Structure of play

**Match**:
A complete game from setup to final standings, made up of a fixed number of Rounds.
_Avoid_: Game, session

**Round**:
One battle on a single freshly generated terrain, ending when at most one tank survives. Money earned carries over to the next Round.
_Avoid_: Level, map, battle

**Turn**:
One player's opportunity to aim and fire once within a Round.
_Avoid_: Move, go, shot
