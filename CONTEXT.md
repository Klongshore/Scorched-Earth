# Scorched Earth

A faithful browser remake of the 1991 turn-based artillery game: tanks on destructible terrain take turns firing at each other until one remains.

## Language

### Structure of play

**Match**:
A complete game from setup to final standings, made up of a fixed number of Rounds.
_Avoid_: Game, session

**Round**:
One battle on a single freshly generated terrain, ending when at most one Tank survives.
_Avoid_: Level, map, battle

**Turn**:
One Player's opportunity to aim and fire once within a Round, ending only when everything has come to rest: the Projectile is gone, its Explosion is over, and all Settling is complete.
_Avoid_: Move, go, shot

**Round Win**:
Awarded to the Player whose Tank is the last one surviving a Round; the Match winner is the Player with the most.
_Avoid_: Point, score, victory

**Draw**:
A Round in which no Tank survives, so no Player earns a Round Win.
_Avoid_: Tie, stalemate

### Participants

**Player**:
A participant who takes Turns across the whole Match, human or computer. Owns a single Tank in each Round. A Match has 2 to 10 Players, each fighting for themselves.
_Avoid_: User, opponent, team

**Computer Player**:
A Player whose Turns are decided by an AI Personality rather than a human.
_Avoid_: Bot, CPU, AI player

**Personality**:
The named strategy a Computer Player uses to aim and fire: Moron, Shooter or Tosser.
_Avoid_: Difficulty, AI level

**Moron**:
A Personality that fires at a random Angle and a random Power.

**Shooter**:
A Personality that calculates the Angle and Power to hit its Target, ignoring Wind and anything in the way, then adds a little random error.

**Tosser**:
A Personality that starts with a rough guess at its Target and, each Turn, corrects its Power based on where its last Projectile landed.

**Target**:
The enemy Tank a Computer Player is currently aiming at, kept until that Tank is destroyed or can no longer be reached.
_Avoid_: Enemy, victim

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

**Weapon**:
A kind of projectile a Tank can fire, defining what its Explosion does (e.g. Baby Missile).
_Avoid_: Ammo, missile (as a general term), shot type

**Roller**:
A Weapon whose Projectile, on touching Terrain, rolls downhill and explodes when it comes to rest or meets a Tank (Baby Roller, Roller, Heavy Roller).

**Dirt Weapon**:
A Weapon whose Explosion adds dirt instead of removing it, and can bury Tanks (Dirt Clod, Dirt Ball, Ton of Dirt).

**Projectile**:
The object a Tank fires, flying under gravity and Wind until it touches Terrain or a Tank, or leaves the side of the field.
_Avoid_: Bullet, shell, shot

**Explosion**:
What happens where a Projectile lands, as set by its Weapon: most remove Terrain and damage Tanks within a radius, with damage falling off from the centre; Dirt Weapons instead add a circle of dirt and damage no one.
_Avoid_: Blast, impact, detonation

**Wind**:
A sideways push on projectiles, fixed for the duration of a Round.

### Battlefield

**Terrain**:
The destructible ground of a Round, made of dirt that Explosions remove or add.
_Avoid_: Map, level, ground

**Settling**:
Unsupported dirt, and any Tank resting on it, falling straight down after an Explosion until it rests.
_Avoid_: Collapse, gravity

### Economy

**Money**:
What a Player spends in the Shop, kept for the whole Match. Earned by damaging and destroying other Tanks and by Round Wins; harming your own Tank earns nothing. It never decides the Match: only Round Wins do.
_Avoid_: Cash, credits, gold, score

**Shop**:
Where Players buy Weapons, open before every Round, including the first.
_Avoid_: Store, market

**Inventory**:
The Weapons a Player owns and how many of each, kept from Round to Round for the whole Match. Firing a Weapon uses one up, except the Baby Missile, which every Player always has without limit.
_Avoid_: Ammo, arsenal, stock

**Bundle**:
The fixed number of one Weapon bought in a single purchase at the Shop, for a fixed price.
_Avoid_: Pack, lot
