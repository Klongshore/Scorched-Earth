# Implementation Plan v3: Weapons, Money and the Shop

This plan builds on v1 (`docs/implementation-plan.md`) and v2 (`docs/implementation-plan-v2.md`). It adds 11 Weapons in four families, Money earned in battle, an Inventory that lasts the whole Match, and a Shop before every Round. Work through the milestones **in order**. Each milestone ends with checks that must pass and a commit. Do not start a milestone until the previous one's checks are green.

## 0. Before you start

1. Read `CONTEXT.md`. **Use its terms exactly** in code, including the new ones: `Money`, `Shop`, `Inventory`, `Bundle`, `Roller`, `Dirt Weapon`. Never use the words in its _Avoid_ lists (no `ammo`, `cash`, `store`, `stock`, `pack`, `score`, `shot`, `hp`, `bot`).
2. Read `docs/adr/`. Nothing in this plan changes them. ADR 0002 (pixel-bitmap Terrain) is what makes Dirt Weapons possible.
3. The golden rules from v1 and v2 still hold:
   - **`src/sim/` is pure.** No DOM, no `window`, no `Math.random`, no `Date.now`, no imports from `src/render`, `src/input` or `src/ui`. All randomness goes through the seeded `Rng`.
   - **Every number lives in `src/sim/constants.ts`.** Prices, Bundle sizes, radii, damage, Money awards, split counts and roll speeds included.
   - **Fixed timestep.** The simulation only ever advances by `TICK_SECONDS`.
   - Run `npm run check` (typecheck + lint + format + test) before every commit.

## Scope (do NOT build anything outside this)

**In scope:**

- 11 new Weapons: Missile, Baby Nuke, Nuke (blasts); MIRV, Funky Bomb (splitters); Baby Roller, Roller, Heavy Roller (Rollers); Dirt Clod, Dirt Ball, Ton of Dirt (Dirt Weapons). The Baby Missile stays free and unlimited.
- Money: a fixed starting amount, earned for Health removed from other Tanks, for other Tanks destroyed, and for the Round Win.
- An Inventory per Player that lasts the whole Match. Firing uses one of the chosen Weapon, except the Baby Missile.
- A Shop before every Round, including the first: Humans one after another in Player order, Computer Players instantly and off screen.
- Choosing a Weapon on your Turn with `Tab` / `Shift+Tab`, shown on HUD line 1.
- Computer Players buying and choosing Weapons.
- Round results showing each Player's Money earned this Round and their total.

**Out of scope** (unchanged from v2, plus):

- Shields, Parachutes, Batteries, Fuel, Tank movement and any other non-Weapon item.
- Diggers, Sandhogs, Napalm, Leapfrog, Death's Head, Tracers, Riot charges, Laser, Plasma and any other Weapon.
- Selling Weapons back.
- Interest, survival or placement Money.
- Money deciding the Match, or Money in the HUD or the Final standings.
- A Starting Money setting, or any other setting.
- Per-Personality shopping habits.
- Fall damage, walls, sound, mouse or touch input, death animations, name entry, teams, online play.

## Rules settled during design

- **Round Wins still decide the Match.** Money is only for spending.
- **Money and Inventory belong to the Player**, not the Tank. A destroyed Tank loses nothing: both carry into the next Round untouched.
- **Earning:** Money is paid for Health actually removed from **other** Tanks (a Nuke on a 30-Health Tank pays for 30), plus a bonus per other Tank an Explosion destroys, plus a bonus for the Round Win. All of it goes to whoever fired the Projectile, including MIRV pieces, bomblets and Rollers. Harming your own Tank earns nothing and costs nothing. A Draw pays no Round Win bonus. A Tank that dies by Settling to the bottom of the field earns no one a bonus.
- **The Shop** opens before every Round. Computer Players shop first, instantly. Then each Human in Player order (Player 1 first, not the Round's Turn order) gets their own Shop screen. If every Player is a Computer Player, no Shop screen is shown at all.
- **A Turn** still ends only when everything has come to rest: every Projectile is gone, every Explosion is over, and all Settling is complete.

---

## Milestone 1: The Weapon catalogue

Data only. The Round still fires the Baby Missile.

### 1.1 `src/sim/types.ts`

Replace `Weapon` with a union keyed on how the Weapon behaves:

```ts
export type WeaponName =
  | "Baby Missile"
  | "Missile"
  | "Baby Nuke"
  | "Nuke"
  | "MIRV"
  | "Funky Bomb"
  | "Baby Roller"
  | "Roller"
  | "Heavy Roller"
  | "Dirt Clod"
  | "Dirt Ball"
  | "Ton of Dirt";

interface WeaponBase {
  readonly name: WeaponName;
  readonly radius: number;
  readonly bundle: number | null; // null only for the Baby Missile: never bought, never used up
  readonly price: number; // per Bundle
}

export type Weapon =
  | (WeaponBase & { readonly kind: "blast"; readonly maxDamage: number })
  | (WeaponBase & { readonly kind: "mirv"; readonly maxDamage: number }) // splits at the top of its arc
  | (WeaponBase & { readonly kind: "funky"; readonly maxDamage: number }) // scatters bomblets on landing
  | (WeaponBase & { readonly kind: "roller"; readonly maxDamage: number })
  | (WeaponBase & { readonly kind: "dirt" }); // adds dirt, damages no one
```

`radius` and `maxDamage` on a MIRV or Funky Bomb describe the Weapon's own Explosion. Its pieces fire the Weapons named in 1.2.

### 1.2 `src/sim/constants.ts`

Replace `BABY_MISSILE` with a `WEAPONS` list in Shop order, plus a lookup:

| Weapon       | kind   | Bundle | Price   | Radius | Max damage |
| ------------ | ------ | ------ | ------- | ------ | ---------- |
| Baby Missile | blast  | null   | 0       | 20     | 30         |
| Missile      | blast  | 5      | $1,875  | 30     | 50         |
| Baby Nuke    | blast  | 3      | $10,000 | 45     | 70         |
| Nuke         | blast  | 1      | $12,000 | 75     | 100        |
| MIRV         | mirv   | 3      | $10,000 | 30     | 50         |
| Funky Bomb   | funky  | 2      | $7,000  | 30     | 50         |
| Baby Roller  | roller | 10     | $5,000  | 20     | 30         |
| Roller       | roller | 5      | $6,000  | 30     | 50         |
| Heavy Roller | roller | 2      | $6,750  | 45     | 70         |
| Dirt Clod    | dirt   | 10     | $5,000  | 20     | —          |
| Dirt Ball    | dirt   | 5      | $5,000  | 35     | —          |
| Ton of Dirt  | dirt   | 2      | $6,750  | 70     | —          |

```ts
export const WEAPONS: readonly Weapon[] = [
  /* the table above, in this order */
];
export function weaponNamed(name: WeaponName): Weapon; // throws on a name not in WEAPONS
export const BABY_MISSILE = weaponNamed("Baby Missile");

// Splitters
export const MIRV_PIECES = 5;
export const MIRV_PIECE_WEAPON: WeaponName = "Missile";
export const MIRV_SPREAD = 40; // px/s of extra sideways speed between neighbouring pieces
export const FUNKY_MIN_BOMBLETS = 6;
export const FUNKY_MAX_BOMBLETS = 8;
export const FUNKY_BOMBLET_WEAPON: WeaponName = "Baby Missile";
export const FUNKY_MIN_ANGLE = 30; // bomblets are thrown at a random Angle in this band
export const FUNKY_MAX_ANGLE = 150;
export const FUNKY_MIN_SPEED = 60; // px/s
export const FUNKY_MAX_SPEED = 200;

// Rollers
export const ROLLER_SPEED = 60; // px/s along the surface
export const ROLLER_MAX_SECONDS = 8; // explodes where it is after rolling this long

// Money
export const STARTING_MONEY = 2_000;
export const MONEY_PER_DAMAGE = 50; // per point of Health removed from another Tank
export const MONEY_PER_DESTROYED_TANK = 2_000; // per other Tank an Explosion destroys
export const MONEY_PER_ROUND_WIN = 5_000;
```

`weaponNamed` is a function, which is fine: it is a lookup, not a tuning value. Keep it next to `WEAPONS`.

### 1.3 Tests

- `WEAPONS` has 12 entries with unique names, in the order above.
- Only the Baby Missile has `bundle === null` and `price === 0`. Every other Weapon has a positive integer Bundle and price.
- Every `kind` other than `dirt` has `maxDamage > 0`. `MIRV_PIECE_WEAPON` and `FUNKY_BOMBLET_WEAPON` name `blast` Weapons.
- Existing tests that import `BABY_MISSILE` still pass unchanged.

Commit: `Add the Weapon catalogue`.

---

## Milestone 2: Money, Inventory and the Shop in the sim

No UI yet. Until Milestone 8, `game.ts` finishes every Human's Shop visit at once without buying anything.

### 2.1 `src/sim/inventory.ts`

```ts
/** How many of each Weapon a Player owns. The Baby Missile is never stored: it is always available. */
export class Inventory {
  count(name: WeaponName): number; // Infinity for the Baby Missile
  add(name: WeaponName, n: number): void; // throws for the Baby Missile
  useOne(name: WeaponName): void; // no-op for the Baby Missile; throws if none are left
  /** The Weapons with count > 0, Baby Missile first, then in WEAPONS order. */
  owned(): Weapon[];
}
```

### 2.2 `src/sim/shop.ts`

```ts
/** Whether a Player with `money` can buy one Bundle of `weapon`. Never true for the Baby Missile. */
export function canAfford(weapon: Weapon, money: number): boolean;

/**
 * A Computer Player's whole Shop visit: keep buying one random affordable Bundle, chosen with rng,
 * until none is affordable. Returns the names bought, in order. Same rule for every Personality.
 */
export function computerShopping(money: number, rng: Rng): WeaponName[];
```

The loop always ends: every Bundle costs at least $1,875.

### 2.3 `src/sim/match.ts`

The Match now starts in the Shop, and a Round is created only once the Shop is closed.

```ts
export type MatchStage =
  | { kind: "shopping"; shoppers: number[] } // Humans still to shop, in Player order
  | { kind: "playing" };

export class Match {
  readonly money: number[]; // indexed by playerId, starts at STARTING_MONEY
  readonly inventories: Inventory[]; // indexed by playerId
  readonly earnedThisRound: number[]; // indexed by playerId; Money earned in the last finished Round
  stage: MatchStage;
  round: Round | null; // null only before Round 1 starts

  /** The Human whose Shop screen is showing, or null once every Human is done. */
  get currentShopper(): number | null;
  buy(playerId: number, name: WeaponName): void; // throws unless that Player is the current shopper and canAfford
  finishShopping(playerId: number): void; // throws unless current shopper; starts the Round after the last one
}
```

- `openShop()` (private) runs `computerShopping` for every Computer Player in Player order with the Match `Rng`, then sets `stage` to `shopping` with the Humans in Player order. With no Humans it starts the Round straight away.
- The constructor calls `openShop()` instead of creating Round 1. `startNextRound()` also calls `openShop()`.
- `recordRoundResult()` adds the Round's earnings (2.4) plus `MONEY_PER_ROUND_WIN` for a win to `money` and fills `earnedThisRound`.
- Update every caller of `match.round` to handle `null`. The renderer draws the backdrop when there is no Round.

### 2.4 Earnings in `src/sim/round.ts` and `src/sim/explosion.ts`

- `detonate` also returns, per Tank, the Health it actually removed and whether it destroyed that Tank (alive before, dead after).
- The Round keeps `readonly earnings: number[]` (indexed by playerId). After each Explosion it adds `MONEY_PER_DAMAGE × health removed` for every Tank other than the firer's, plus `MONEY_PER_DESTROYED_TANK` for each other Tank destroyed, to the firer's earnings.

### 2.5 Tests

- `Inventory`: counts, Baby Missile is infinite and can't be added, `useOne` throws at 0, `owned()` order.
- `computerShopping` never overspends, stops only when nothing is affordable, and is reproducible from a seed.
- Match: starts in `shopping` with only Humans listed, in Player order; `buy` deducts the price and adds the Bundle; `buy` throws when unaffordable or out of turn; `finishShopping` on the last Human creates the Round; an all-Computer Match goes straight to `playing`.
- Earnings: a Baby Missile that removes 25 Health from another Tank pays 1,250; one that destroys a 10-Health Tank pays 500 + 2,000; damage to the firer's own Tank pays nothing; a Round Win adds 5,000; a Draw adds nothing.
- Money, Inventory and `roundWins` carry over to Round 2; `earnedThisRound` is reset.
- **Integration:** the existing 10-Computer-Player Match tests still finish within their tick budget.

Commit: `Add Money, Inventory and the Shop to the Match`.

---

## Milestone 3: Choosing and firing Weapons

After this milestone the blast family (Missile, Baby Nuke, Nuke) is fully playable. A MIRV, Funky Bomb, Roller or Dirt Weapon fired before Milestones 4–6 behaves like a Baby Missile of its radius; make the Round's `switch` on `weapon.kind` exhaustive so later milestones fill in each case.

### 3.1 `src/sim/round.ts`

- The Round receives the Players' Inventories from the Match, plus a per-Player `chosenWeapons: WeaponName[]` the Match keeps across Rounds (initially all `"Baby Missile"`).
- At the start of every Turn, if the Player's chosen Weapon is no longer in their Inventory, it falls back to the Baby Missile.
- New Human action `{ kind: "cycleWeapon"; delta: 1 | -1 }` steps through `inventory.owned()`, wrapping round.
- `fire()` launches the chosen Weapon and calls `useOne` on it.
- `currentWeapon(): Weapon` for the HUD.

### 3.2 `src/input/keyboard.ts`

`Tab` → `cycleWeapon +1`, `Shift+Tab` → `cycleWeapon -1`. Like the arrow keys, ignore it while a form control has focus (so Tab still moves focus on the Setup and Shop screens) and `preventDefault` it otherwise.

### 3.3 `src/render/hud.ts`

HUD line 1 adds `Weapon: {name} ×{count}` after Power while aiming, or `Weapon: Baby Missile` with no count. It must still fit in 640 px with the longest name (`Heavy Roller ×10`) and 3-digit Power. Shorten the spacing if it doesn't.

### 3.4 Tests

- Cycling wraps both ways and only visits owned Weapons.
- Firing a Missile uses one; firing the Baby Missile uses none.
- Running out of the chosen Weapon falls back to the Baby Missile on the next Turn.
- A Nuke on flat ground carves a 75-px crater and deals 100 at its centre.
- The chosen Weapon carries into the next Round if still owned.
- Keyboard: `Tab` and `Shift+Tab` map to the right actions and are ignored in form controls.
- HUD line 1 shows the Weapon and count.

Commit: `Choose and fire Weapons from the Inventory`.

---

## Milestone 4: Several Projectiles at once, MIRV and Funky Bomb

### 4.1 One phase for everything in the air

In `round.ts`, replace the `flying` and `exploding` phases with:

```ts
| { kind: "resolving"; projectiles: Projectile[]; explosions: Explosion[] }
```

Each tick: step every Projectile, turn each that lands into an Explosion (which may add Projectiles, below), age every Explosion, and drop the ones older than `EXPLOSION_SECONDS`. Move to `settling` only when both lists are empty. Update the renderer to draw every Projectile and every Explosion.

The Tosser's remembered `Landing` is where the Projectile **it fired** first touched down or left the field, never a MIRV piece, a bomblet or the end of a roll. Record it the first time, and only for the Projectile launched from the barrel. A MIRV that splits never lands itself, so for it record the middle piece's first landing (the one with no sideways offset).

### 4.2 MIRV

- While its `vy < 0` it flies normally. On the first tick where `vy >= 0` (the top of its arc) it is replaced by `MIRV_PIECES` Projectiles of `MIRV_PIECE_WEAPON` at the same position and `vy`, with `vx` offset by `(i − (MIRV_PIECES − 1) / 2) × MIRV_SPREAD` for `i = 0…MIRV_PIECES − 1`.
- If it lands or leaves the field before splitting, it explodes like one Missile (or is lost).
- Every piece keeps `firedBy`.

### 4.3 Funky Bomb

On landing it explodes with its own radius and damage, carving its crater first. It then launches `rng.int(FUNKY_MIN_BOMBLETS, FUNKY_MAX_BOMBLETS)` Projectiles of `FUNKY_BOMBLET_WEAPON` from the centre of the crater. Each has a random Angle in `FUNKY_MIN_ANGLE..FUNKY_MAX_ANGLE` and a random speed in `FUNKY_MIN_SPEED..FUNKY_MAX_SPEED`, drawn from the Round `Rng` in that order. They fly under gravity and Wind like any Projectile.

### 4.4 Tests

- A MIRV fired at 60° on flat ground with Wind 0 produces 5 Explosions, spread left and right of where a Missile would have landed.
- A MIRV that lands before its peak (e.g. fired at 10° into a hill) produces exactly one Explosion.
- A Funky Bomb produces 1 + 6..8 Explosions, reproducible from the seed.
- The Turn ends only after the last bomblet's Explosion and Settling finish.
- Damage from pieces and bomblets is credited to the firer's earnings.
- After a Tosser fires a MIRV, its `Landing` is the middle piece's; after a Funky Bomb, it is the Funky Bomb's own landing, not any bomblet's.

Commit: `Add MIRV and Funky Bomb`.

---

## Milestone 5: Rollers

### 5.1 Behaviour

Give `Projectile` an optional `rolling: { direction: -1 | 1; seconds: number } | null`.

- **In the air** a Roller flies like any Projectile. If it touches a Tank it explodes at once.
- **On first touching Terrain** it starts rolling. `direction` is downhill (compare the surface one column each side of the contact point; on level ground use the sign of `vx`). It snaps to the cell just above the dirt.
- **Rolling**, each tick it moves `ROLLER_SPEED × dt` px in `direction`, column by column, staying on the surface (the lowest air cell above dirt in that column, found by scanning down from its current height). It:
  - explodes where it is if the next column's surface is **higher** than its own (it has reached a dip or a wall);
  - explodes if it touches a living Tank;
  - explodes where it is after `ROLLER_MAX_SECONDS`;
  - is lost, with no Explosion, if it rolls past either side of the field.
- Rolling ignores Wind.

Rollers on a flat plain roll until they reach a rise, a Tank, the time limit or the edge. That's intended.

### 5.2 Tests

- A Roller dropped on a V-shaped valley rolls to the bottom and explodes there.
- A Roller rolling towards a Tank explodes on touching it.
- A Roller on a slope down to the field's edge is lost with no Explosion and no earnings.
- A Roller that hits a Tank in mid-air explodes at once.
- A Roller on a long flat plain explodes after `ROLLER_MAX_SECONDS`.

Commit: `Add Rollers`.

---

## Milestone 6: Dirt Weapons

### 6.1 `src/sim/terrain.ts`

```ts
/**
 * Fill every air cell within radius of (cx, cy) with dirt, except cells inside any living
 * Tank's hitbox (pass a predicate), so a buried Tank is encased, not overlapped.
 */
fillCircle(cx: number, cy: number, radius: number, keepClear: (x: number, y: number) => boolean): void;
```

Mark the changed columns unsettled, as `carveCircle` does, so dirt hanging in the air Settles.

### 6.2 Behaviour

- A Dirt Weapon's Explosion fills its circle instead of carving it and damages no one, so it earns nothing.
- `Explosion` gains `readonly kind: "blast" | "dirt"`. The renderer draws a dirt Explosion in the dirt colours instead of the fire colours.
- A buried Tank can still fire. Its Projectile spawns inside the dirt, touches it at once and explodes at the barrel tip, so the Tank must blast its way out, taking its own damage. Don't special-case this.

### 6.3 Tests

- A Dirt Ball on flat ground leaves a mound and no crater, and no Tank loses Health.
- A Ton of Dirt dropped on a Tank buries it: no dirt inside its hitbox, dirt all around it.
- A buried Tank firing a Baby Missile explodes it at once and carves its way out.
- Dirt added in mid-air Settles to the ground before the Turn ends.

Commit: `Add Dirt Weapons`.

---

## Milestone 7: Computer Players choose Weapons

### 7.1 `src/sim/personalities.ts`

```ts
/** The Weapon a Computer Player fires this Turn, from what it owns. */
export function chooseWeapon(
  personality: PersonalityName,
  self: Tank,
  target: Tank | null,
  inventory: Inventory,
  rng: Rng,
): WeaponName;
```

- **Moron:** a random Weapon from `inventory.owned()`. **Draw from `rng` only when it owns more than the Baby Missile**, so Morons that never shop (or can't afford anything) draw exactly as before.
- **Shooter and Tosser:** the owned Weapon with the highest `maxDamage`, ignoring Dirt Weapons. Break ties by `WEAPONS` order. Skip any Weapon whose `radius` is at least the horizontal distance to the Target, so it never blows itself up firing a Nuke at a close Target. With no Target, or nothing left, fire the Baby Missile.
- Call it in `beginTurn()` **after** `chooseAim`, so the aim draws stay in their current order. Aim is unchanged: the Shooter and Tosser still aim as if every Weapon flew like a Baby Missile, which is true until a Roller lands or a MIRV splits.

### 7.2 Tests

- A Moron with only the Baby Missile makes exactly the same `rng` draws as in v2.
- A Moron with several Weapons fires each of them over many seeded Turns.
- A Shooter owning Missiles and a Nuke fires the Nuke at a far Target and the Missile at a Target closer than 75 px.
- A Shooter or Tosser never fires a Dirt Weapon.
- **Integration:** 10-Computer-Player, 3-Round Matches across 40 seeds finish within the tick budget, and every Computer Player's Money never goes negative.

Commit: `Let Computer Players choose Weapons`.

---

## Milestone 8: The Shop screen and Money on Round results

### 8.1 `src/ui/screens.ts`

```ts
/** Show the current shopper's Shop screen. Returns the Enter handler for game.ts. */
export function showShop(overlay: HTMLElement, match: Match, onDone: () => void): () => void;
```

- Header: the Player's name in their colour and `Money: $12,345`.
- One row per Weapon in `WEAPONS` order, except the Baby Missile, each a `<button>` showing name, Bundle size, price and how many the Player owns. Rows the Player can't afford are `disabled` and greyed out.
- A **Done** button below the list.
- `↑`/`↓` move focus between the enabled rows and Done (handle `keydown` on the panel; `keyboard.ts` already ignores arrow keys inside form controls). `Enter` (routed through `game.ts` like Setup's) buys one Bundle of the focused row, or finishes on Done. `Esc` also finishes.
- After a purchase, redraw the header and rows in place. Keep focus on the same row if still affordable, otherwise move it to the next enabled row or Done.
- The panel must fit in 640 × 480 with all 11 rows.
- Format Money with a thousands separator and no decimals everywhere.

### 8.2 `src/game.ts`

Add a `shop` screen. After Setup, and after each Round results (when the Match isn't over), show the Shop for `match.currentShopper` until it is null, then begin the Round. If there are no Humans, go straight to the Round.

### 8.3 Round results

The Round results table gains **Earned** and **Money** columns: `earnedThisRound` (Round Win bonus included) and the total. The Final standings stay as they are.

### 8.4 Tests in `screens.test.ts`

- Rows show the right Bundle, price and owned count; unaffordable rows are disabled.
- Buying updates Money and the owned count, and disables rows that become unaffordable.
- Done and `Esc` call `onDone` once.
- Round results show Earned and Money per Player.

Commit: `Add the Shop screen and show Money on Round results`.

---

## Milestone 9: Verification and release

1. `npm run check` and `npm run build` pass.
2. Write a Playwright smoke script in your scratchpad, not the repo, that:
   1. Opens `npm run preview`.
   2. Sets up 1 Human and 3 Computer Players (one of each Personality) for 3 Rounds and starts.
   3. In the Shop, buys a Bundle of Missiles, checks Money dropped by $1,875, and presses Done.
   4. Takes Turns with `Tab` to pick the Missile and `Space` to fire until the Round results appear.
   5. Checks the Round results show Earned and Money, continues, and checks the Shop appears again.
   6. Takes screenshots along the way.
3. **Manual checklist.** Play it yourself via Playwright keypresses and screenshots:
   - [ ] The Shop appears before Round 1 and between Rounds, once per Human in Player order, and never in an all-Computer Match.
   - [ ] Buying deducts the right price; unaffordable Bundles are greyed out.
   - [ ] `Tab` / `Shift+Tab` cycle owned Weapons; HUD line 1 shows the Weapon and count.
   - [ ] Nuke, MIRV, Funky Bomb, a Roller and a Dirt Weapon each look and behave as described.
   - [ ] A buried Tank can blast its way out.
   - [ ] Money earned matches damage dealt, Tanks destroyed and the Round Win.
   - [ ] Inventory and Money carry over between Rounds, including for a Player whose Tank was destroyed.
   - [ ] The Shop panel fits in 640 × 480.
4. Update `README.md`: Money, the Shop, the Weapon list, and `Tab` / `Shift+Tab` in the Controls table.
5. Commit and push.

---

## Pitfalls to avoid

- **Money never decides the Match.** Don't touch `standings()` or `winner()`.
- **Inventory belongs to the Player, not the Tank.** Tanks are recreated every Round; Inventories and Money are not.
- **The Baby Missile is never stored or used up.** `Inventory.count` returns `Infinity` for it; never let it appear in the Shop.
- **Pay only for Health actually removed.** Clamp before crediting; a Tank already at 0 pays nothing.
- **Credit the firer, never the victim**, and never for damage to the firer's own Tank.
- **Keep Moron's random draws unchanged when it only owns the Baby Missile.** Computer shopping does change the draws of seeded Matches, so assert properties in tests, not seed-specific outcomes.
- **The Turn ends only when everything is at rest**, including the last bomblet and the last rolling Roller.
- **The Tosser learns from its own Projectile's first landing**, not from pieces, bomblets or the end of a roll.
- **Fill dirt around Tanks, not inside them.** A Tank overlapping dirt breaks Settling and hit tests.
- **No new magic numbers in `src/sim`.** Every price, count, speed and award goes in `constants.ts`.
- **Don't add features** from the out-of-scope list, even if they seem easy.
