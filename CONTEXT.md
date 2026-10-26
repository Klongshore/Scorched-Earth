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
One Player's opportunity to aim and fire once within a Round, ending only when everything has come to rest: the Projectile is gone, its Explosion is over, all Settling is complete, and every Death Animation has finished.
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
The named strategy a Computer Player uses to aim and fire: Moron, Shooter, Poolshark, Tosser, Chooser, Spoiler, Cyborg or Unknown. The behaviour of Poolshark, Chooser, Spoiler, Cyborg and Unknown is inferred from the Atari 800 remake's descriptions, not verified against the 1991 manual.
_Avoid_: Difficulty, AI level

**Moron**:
A Personality that fires at a random Angle and a random Power.

**Shooter**:
A Personality that calculates the Angle and Power to hit its Target, ignoring Wind and anything in the way, then adds a little random error.

**Poolshark**:
A Personality that aims like a Shooter, ignoring Wind, but always at the nearest Tank, by horizontal distance.

**Tosser**:
A Personality that starts with a rough guess at its Target and, each Turn, corrects its Power based on where its last Projectile landed.

**Chooser**:
A Personality that always aims at the weakest Tank and allows for Wind, with a small random error.

**Spoiler**:
A Personality that aims like a Chooser but with half the random error.

**Cyborg**:
A Personality that aims at the weakest Tank, preferring a human Player's Tank over a computer's, and allows for Wind with no random error, so it hits unless Terrain is in the way.

**Unknown**:
A Personality that becomes Poolshark, Chooser, Spoiler or Cyborg, picked at random at the start of each Round. It is shown as Unknown everywhere in the interface, never as what it became.

**Weakest**:
The Tank with the lowest Health, ignoring any Shield. Of equally near or equally weak Tanks, the earlier Player's is chosen.

**Target**:
The enemy Tank a Computer Player is currently aiming at. A Moron has none. A Shooter or Tosser keeps its Target until that Tank is destroyed or can no longer be reached; every other Personality chooses its Target again each Turn.
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

**Death Animation**:
The visual a destroyed Tank plays before it disappears: a fireball, spark shower, disintegration, or pop and smoke, picked at random. Every Tank destroyed in a Turn plays its Death Animation together once all else has come to rest. It is pure spectacle: it damages no Tank and leaves the Terrain untouched.
_Avoid_: Death explosion, Explosion (that is a Weapon's damaging blast)

**Wind**:
A sideways push on projectiles, fixed for the duration of a Round.

### Battlefield

**Terrain**:
The destructible ground of a Round, made of dirt that Explosions remove or add.
_Avoid_: Map, level, ground

**Settling**:
Unsupported dirt, and any Tank resting on it, falling straight down after an Explosion until it rests.
_Avoid_: Collapse, gravity

### Defence

**Shield**:
An Item raised around a Tank for the rest of a Round, absorbing Explosion damage before Health until its Shield Strength runs out (Shield, Heavy Shield).
_Avoid_: Armour, barrier, force field

**Shield Strength**:
How much Explosion damage a raised Shield can still absorb; it is gone at 0.
_Avoid_: Energy, charge, shield HP

**Parachute**:
An Item that opens by itself when a Tank falls far enough to take Fall Damage, and spares it that Fall Damage.
_Avoid_: Chute

**Fall Damage**:
Damage a Tank takes for falling further than a safe distance during Settling.
_Avoid_: Impact damage, crash damage

### Economy

**Money**:
What a Player spends in the Shop, kept for the whole Match. Earned by damaging and destroying other Tanks, whether by Explosion or during Settling, and by Round Wins; harming your own Tank earns nothing. It never decides the Match: only Round Wins do.
_Avoid_: Cash, credits, gold, score

**Shop**:
Where Players buy Weapons and Items, open before every Round, including the first.
_Avoid_: Store, market

**Inventory**:
The Weapons and Items a Player owns and how many of each, kept from Round to Round for the whole Match. Firing a Weapon uses one up, except the Baby Missile, which every Player always has without limit.
_Avoid_: Ammo, arsenal, stock

**Item**:
Something sold in the Shop that is not a Weapon: a Shield or a Parachute.
_Avoid_: Accessory, gear, equipment, power-up

**Bundle**:
The fixed number of one Weapon or Item bought in a single purchase at the Shop, for a fixed price.
_Avoid_: Pack, lot

### Banter

**Epitaph**:
A random line shown for a few seconds above a Tank that has just been destroyed, in its Player's colour, with a few lines kept for a Tank that destroyed itself.
_Avoid_: Death text, death message, last words

**Taunt**:
An occasional random line of bravado or threat shown above a Tank as its Player is about to fire. It never delays the shot.
_Avoid_: Trash talk, quip, banter (as a single line)
