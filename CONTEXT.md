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

### Participants

**Player**:
A participant who takes Turns across the whole Match, human or computer. Owns a single Tank in each Round.
_Avoid_: User, opponent, team

**Computer Player**:
A Player whose Turns are decided by an AI Personality rather than a human.
_Avoid_: Bot, CPU, AI player

**Personality**:
The named strategy a Computer Player uses to aim and fire (e.g. Moron, Shooter).
_Avoid_: Difficulty, AI level

**Tank**:
A Player's unit on the field during one Round, with a position, Health, Angle and Power.
_Avoid_: Unit, turret, player (when meaning the on-field object)

### Firing

**Angle**:
The direction of a Tank's barrel, from 0° (pointing right) to 180° (pointing left).
_Avoid_: Aim, elevation

**Power**:
The launch strength of a shot, capped by the Tank's current Health.
_Avoid_: Force, velocity, strength

**Health**:
How much damage a Tank can still take before it is destroyed; starts each Round at 100.
_Avoid_: HP, hit points, life, shields

**Wind**:
A sideways push on projectiles, fixed for the duration of a Round.

### Battlefield

**Terrain**:
The destructible ground of a Round, made of dirt that explosions remove.
_Avoid_: Map, level, ground

**Settling**:
Loose dirt left unsupported after an explosion falling straight down until it rests.
_Avoid_: Collapse, gravity
