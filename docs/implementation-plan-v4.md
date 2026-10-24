# Implementation Plan v4: Shields, Parachutes and Fall Damage

This plan builds on v1 (`docs/implementation-plan.md`), v2 (`docs/implementation-plan-v2.md`) and v3 (`docs/implementation-plan-v3.md`). It adds **Items**: things sold in the Shop that are not Weapons. There are two kinds. A **Shield** absorbs Explosion damage before it reaches Health, and a **Parachute** opens on its own when a Tank falls far enough to be hurt. It also adds **Fall Damage**, so that a Tank dropped by a crater or by Settling dirt takes damage for the fall. Work through the milestones **in order**. Each milestone ends with checks that must pass and a commit. Do not start a milestone until the previous one's checks are green.

## 0. Before you start

1. Read `CONTEXT.md`. **Use its terms exactly** in code, including the new ones you add in Milestone 1: `Item`, `Shield`, `Parachute`, `Fall Damage`. Never use the words in its _Avoid_ lists (no `ammo`, `stock`, `hp`, `bot`, `armour`, `chute`, `gear`, `power-up`).
2. Read `docs/adr/`. Nothing in this plan changes them.
3. The golden rules from v1–v3 still hold:
   - **`src/sim/` is pure.** No DOM, no `window`, no `Math.random`, no `Date.now`, no imports from `src/render`, `src/input` or `src/ui`. All randomness goes through the seeded `Rng`.
   - **Every number lives in `src/sim/constants.ts`.** Shield energy, prices, Bundle sizes, fall distances and damage rates included. Sizes used only for drawing (the Shield bubble, the Parachute canopy) live in `src/render/`.
   - **Fixed timestep.** The simulation only ever advances by `TICK_SECONDS`.
   - Run `npm run check` (typecheck + lint + format + test) before every commit.

## Scope (do NOT build anything outside this)

**In scope:**

- Three Items: **Shield** and **Heavy Shield** (Shields), and **Parachute**.
- The Shop sells Items after the Weapons. Humans and Computer Players buy them like Weapons, one Bundle at a time.
- Raising a Shield on your Turn with `S`. It uses one up from the Inventory and doesn't end the Turn.
- A raised Shield absorbs Explosion damage until its energy runs out or the Round ends.
- Fall Damage: a Tank takes damage for how far it fell during a Turn's Settling, beyond a safe distance.
- A Parachute opens on its own when a falling Tank passes the safe distance, uses one up, and cancels that fall's Fall Damage.
- Computer Players raise their strongest Shield at the start of their Turn.
- The HUD shows the current Player's Shield energy. The field shows a bubble around each shielded Tank and a canopy over each Tank falling under a Parachute.

**Out of scope** (unchanged from v3, plus):

- Deflector, Force, Mag Deflector and Super Mag Shields, and Shields that bounce or stop Projectiles. Here a Shield only absorbs damage. Projectiles fly through it and still hit the Tank.
- Shields absorbing Fall Damage.
- Turning Parachutes off, or opening one by hand.
- Slower falling under a Parachute: the canopy is drawn, but the Tank falls at the usual speed.
- Tanks landing on, or damaging, other Tanks. Tanks still fall straight through each other, as they do today.
- Batteries, Fuel, Tank movement, Auto Defense, Tracers and any other Item.
- Selling Items back.
- Money for Fall Damage or for damage a Shield absorbs.
- Personality-specific Shield or Parachute habits.
- Any setting, sound, mouse or touch input, death animations, name entry, teams, online play.

## Rules settled during design

- **Items belong to the Player**, like Weapons. They sit in the same Inventory and carry from Round to Round for the whole Match.
- **A raised Shield belongs to the Tank.** It lasts until its energy reaches 0 or the Round ends. Tanks are recreated every Round, so every Round starts with no Shield raised. Shields still in the Inventory carry over.
- **Raising a Shield** uses up your strongest Shield (Heavy Shield before Shield) and gives the Tank that Shield at full energy, replacing any Shield already raised. It is ignored when you own no Shield, or when the raised Shield already has at least as much energy as the new one would. That way you never waste one for nothing. It doesn't end the Turn, and you can still aim and fire afterwards.
- **Absorbing:** an Explosion's damage to a shielded Tank comes off the Shield's energy first, and only the rest comes off Health. A Shield whose energy reaches 0 is gone. Dirt Weapons damage no one, so they never touch a Shield.
- **Money** is still paid only for **Health actually removed** from other Tanks, plus the existing bonuses. Damage a Shield absorbs earns nothing. Destroying a Tank still pays the bonus whether or not it had a Shield.
- **A fall** is everything a Tank drops during one Turn's Settling, added up even when the dirt under it is falling too. When the Settling comes to rest, each living Tank that fell takes `floor(max(0, fallen − FALL_SAFE_PIXELS) × FALL_DAMAGE_PER_PIXEL)` Fall Damage, and then its fall resets to 0. A Tank that reaches the bottom of the field is still destroyed, as now.
- **Fall Damage earns no one anything**, the same as the v3 rule for a Tank that Settles to the bottom of the field. A Tank destroyed by Fall Damage pays no destroyed-Tank bonus.
- **Shields never absorb Fall Damage.** That is the Parachute's job.
- **A Parachute** opens on the tick a falling Tank's fall first passes `FALL_SAFE_PIXELS`, if its Player owns one. It uses one up, and that Tank takes no Fall Damage from this Settling. At most one Parachute opens per Tank per Settling. Short drops within the safe distance never use one.
- **A Turn** still ends only when everything has come to rest. If Fall Damage destroys a Tank, dirt resting on it falls, so Settling continues until that dirt is at rest too.

---

## Milestone 1: Glossary and the Item catalogue

Data only. Nothing in the Round changes yet.

### 1.1 `CONTEXT.md`

Add under **Economy**:

- **Item**: something sold in the Shop that is not a Weapon: a Shield or a Parachute. Kept in the Inventory like Weapons. _Avoid_: accessory, gear, equipment, power-up.

Add a new section **Defence**:

- **Shield**: an Item a Player raises on their Turn. The Tank keeps it until its energy runs out or the Round ends, and it absorbs Explosion damage before Health does (Shield, Heavy Shield). _Avoid_: armour, barrier, force field.
- **Parachute**: an Item that opens on its own when a Tank falls far enough to take Fall Damage, and cancels that Fall Damage. _Avoid_: chute.
- **Fall Damage**: damage a Tank takes for falling further than a safe distance during Settling. _Avoid_: impact damage, crash damage.

Update these existing entries:

- **Inventory**: "The Weapons and Items a Player owns and how many of each…"
- **Shop**: "Where Players buy Weapons and Items…"
- **Bundle**: "The fixed number of one Weapon or Item…"
- **Settling**: add "A Tank that falls far enough takes Fall Damage."

### 1.2 `src/sim/types.ts`

```ts
export type ShieldName = "Shield" | "Heavy Shield";
export type ItemName = ShieldName | "Parachute";
/** Anything the Shop sells. */
export type ShopName = WeaponName | ItemName;

interface ItemBase {
  readonly bundle: number;
  readonly price: number; // per Bundle
}

export type ShieldItem = ItemBase & {
  readonly name: ShieldName;
  readonly kind: "shield";
  readonly energy: number; // damage it absorbs before it is gone
};
export type Item =
  | ShieldItem
  | (ItemBase & { readonly name: "Parachute"; readonly kind: "parachute" });

/** Anything the Shop sells. */
export type ForSale = Weapon | Item;
```

`Weapon` already has a `kind`. None of its kinds (`blast`, `mirv`, `funky`, `roller`, `dirt`) clashes with `shield` or `parachute`, so `ForSale` narrows cleanly on `kind`.

Extend `Tank`:

```ts
export interface Tank {
  // …existing fields…
  shield: { readonly name: ShieldName; energy: number } | null; // the raised Shield; null once its energy is gone
  fallen: number; // px fallen during the current Settling; 0 at rest
  parachute: boolean; // a Parachute is open for the current Settling
}
```

### 1.3 `src/sim/tank.ts`

Add a factory, and use it in `placement.ts` and in every test helper that builds a `Tank` literal (`settling`, `tank`, `projectile`, `explosion`, `personalities`, `aiming`, `match` and `hud` tests), so the new fields have one source of defaults:

```ts
/** A Tank at full Health with the starting aim, no Shield, at rest. */
export function newTank(playerId: number, x: number, y: number): Tank;
```

Test helpers keep their `overrides` parameter: `{ ...newTank(0, 320, GROUND), ...overrides }`.

### 1.4 `src/sim/constants.ts`

```ts
// Items
/** Every Item, in Shop order (after the Weapons). */
export const ITEMS: readonly Item[] = [
  { name: "Shield", kind: "shield", bundle: 3, price: 20_000, energy: 50 },
  { name: "Heavy Shield", kind: "shield", bundle: 2, price: 30_000, energy: 100 },
  { name: "Parachute", kind: "parachute", bundle: 8, price: 10_000 },
];
/** Everything the Shop sells, in Shop order: Weapons (never the Baby Missile), then Items. */
export const FOR_SALE: readonly ForSale[] = [...WEAPONS.filter((w) => w.bundle !== null), ...ITEMS];
/** The Weapon or Item with this name; throws for a name not in WEAPONS or ITEMS. */
export function forSaleNamed(name: ShopName): ForSale;

// Fall Damage
export const FALL_SAFE_PIXELS = 10; // a fall up to this far does no damage
export const FALL_DAMAGE_PER_PIXEL = 0.5; // Health per px fallen beyond FALL_SAFE_PIXELS, rounded down
```

With these numbers, a Baby Missile under a Tank drops it about 16 px for 3 Fall Damage, and a Nuke under it drops it about 70 px for 30. If that feels wrong in play, tune it here only.

### 1.5 `src/sim/inventory.ts` and `src/sim/shop.ts`

- `Inventory.count`, `add` and `useOne` take a `ShopName`. The Baby Missile rules are unchanged.
- `Inventory.owned()` still returns **Weapons only**, because it feeds `Tab` cycling and `chooseWeapon`. Add:
  ```ts
  /** The owned Shield with the most energy, or null when none is owned. */
  strongestShield(): ShieldItem | null;
  ```
- `canAfford(thing: ForSale, money: number)`. It still checks `bundle !== null` because a Weapon's Bundle may be null.

### 1.6 Tests

- `ITEMS` has 3 entries with unique names that are not `WeaponName`s. Every Item has a positive integer Bundle and price, and every Shield has `energy > 0`.
- `FOR_SALE` is the 11 sold Weapons in catalogue order, then the 3 Items. It never contains the Baby Missile.
- `forSaleNamed` finds every Weapon and Item and throws on an unknown name.
- `Inventory` counts Items. `owned()` never includes an Item. `strongestShield()` prefers the Heavy Shield, falls back to the Shield, and returns null with none owned.
- `newTank` has no Shield, `fallen` 0 and no Parachute open.
- Every existing test still passes.

Commit: `Add the Item catalogue`.

---

## Milestone 2: Items in the Shop

After this milestone Items can be bought but do nothing yet.

### 2.1 `src/sim/match.ts`

- `buy(playerId, name: ShopName)` and the private `purchase` look the name up with `forSaleNamed`, and add the Bundle to the Inventory as before.

### 2.2 `src/sim/shop.ts`

- `computerShopping` draws from `FOR_SALE` instead of `WEAPONS` and returns `ShopName[]`. It is still the same rule for every Personality, and it still always ends. This changes the draws of seeded Matches with Computer Players, so tests assert properties, not seed-specific outcomes (as v3 already requires).

### 2.3 `src/ui/screens.ts` and `src/style.css`

- `ShopRow.name` becomes a `ShopName`. `shopView` builds one row per entry in `FOR_SALE`, so Items follow the Weapons.
- The panel now has 14 rows, more than fit in 640 × 480. Don't shrink the rows: let the list scroll instead. Give `.shop` a `max-height` and `overflow-y: auto`, so the header, **Done** and the hint stay in view while the rows scroll between them. When focus moves to a row (with `↑`/`↓`, after a purchase, or when the screen opens), call `scrollIntoView({ block: "nearest" })` on it, so the focused row is always visible.

### 2.4 Tests

- The Shop shows 14 rows: the 11 Weapons, then Shield, Heavy Shield and Parachute, each with the right Bundle, price and owned count.
- Moving focus to a row scrolls it into view.
- Buying a Parachute Bundle deducts $10,000 and adds 8 Parachutes. An unaffordable Item row is disabled.
- `computerShopping` can buy Items. Across seeds it never overspends and stops only when nothing in `FOR_SALE` is affordable.
- **Integration:** the existing 10-Computer-Player, 3-Round Match tests still finish within their tick budget, with Money never negative.

Commit: `Sell Items in the Shop`.

---

## Milestone 3: Fall Damage

### 3.1 `src/sim/settling.ts`

- `settleTick` adds 1 to `t.fallen` for every pixel a living Tank drops, including the drop that takes it to the bottom of the field.
- Add:

  ```ts
  /** The Fall Damage for a fall of `fallen` px. */
  export function fallDamage(fallen: number): number;

  /**
   * Call once Settling is at rest. Every living Tank that fell takes its Fall Damage, unless a
   * Parachute was open, and has its aim clamped. Then every Tank's `fallen` resets to 0 and
   * `parachute` to false. A Tank this destroys marks its columns unsettled so dirt resting on
   * it falls. Returns true if it destroyed any Tank, so Settling must continue.
   */
  export function landTanks(terrain: Terrain, tanks: Tank[]): boolean;
  ```

### 3.2 `src/sim/round.ts`

```ts
case "settling":
  if (!settleTick(this.terrain, this.tanks) && !landTanks(this.terrain, this.tanks)) this.endTurn();
  break;
```

If `landTanks` destroys a Tank, the Round stays in `settling`. The next ticks let the dirt above it fall, and `landTanks` runs again once that is at rest. Every `fallen` is already 0 by then, so no Tank is damaged twice. Fall Damage never calls `earn`.

### 3.3 Tests

- `fallDamage`: 0 up to `FALL_SAFE_PIXELS`, then `floor((fallen − FALL_SAFE_PIXELS) × FALL_DAMAGE_PER_PIXEL)`. Derive the expected values from the constants.
- A Tank on a column of dirt that is carved away beneath it falls the right distance and takes the right damage once Settling is at rest, not before.
- A Tank riding down on Settling dirt counts the whole drop as one fall.
- A drop within `FALL_SAFE_PIXELS` does no damage.
- Fall Damage that empties Health destroys the Tank, dirt resting on it then falls, and the Turn ends only after that.
- Fall Damage lowers the Power cap and clamps Power.
- Fall Damage earns no one Money, even right after another Player's Explosion.
- A Nuke under a Tank on flat ground leaves it with `100 − blast damage − Fall Damage` Health.
- Existing tests that assert exact Health after Settling may now see Fall Damage. Update their expected values from the constants instead of deleting them.

Commit: `Add Fall Damage`.

---

## Milestone 4: Parachutes

### 4.1 `src/sim/settling.ts`

```ts
export function settleTick(
  terrain: Terrain,
  tanks: Tank[],
  /** Use up one of this Player's Parachutes; false if they own none. */
  openParachute: (playerId: number) => boolean = () => false,
): boolean;
```

On the tick a living Tank's `fallen` first goes above `FALL_SAFE_PIXELS` and `parachute` is false, call `openParachute(t.playerId)`. If it returns true, set `t.parachute = true`. Call it at most once per Tank per Settling: if it returns false, don't ask again until `landTanks` resets the fall. Keep a private per-Settling flag, or check `fallen` crossing the threshold only once. `landTanks` skips Fall Damage for a Tank with `parachute` set.

### 4.2 `src/sim/round.ts`

Pass `(id) => this.useParachute(id)` to `settleTick`. It returns false if `this.inventoryOf(id).count("Parachute") <= 0`, and otherwise calls `useOne("Parachute")` and returns true.

### 4.3 `src/render/renderer.ts`

While `tank.parachute` is set and the Tank is not supported (`!isSupported(tank, terrain)`), draw a small canopy in the Player's colour above the Tank: a half-disc about 10 px across, with two lines down to the turret. The Health number may be hidden behind it while it falls. Keep the canopy's sizes as constants in the renderer, not in `src/sim`.

### 4.4 Tests

- A Tank whose Player owns a Parachute falls 60 px, uses exactly one Parachute and takes no Fall Damage.
- A drop within `FALL_SAFE_PIXELS` uses no Parachute.
- A Tank whose Player owns none takes full Fall Damage, and `openParachute` is asked only once for that fall.
- Two separate falls in two Turns use two Parachutes.
- A Tank that falls to the bottom of the field is still destroyed, even with a Parachute open.
- Parachutes carry over between Rounds, including for a Player whose Tank was destroyed.

Commit: `Add Parachutes`.

---

## Milestone 5: Shields in the sim

### 5.1 `src/sim/shield.ts` (new)

```ts
/**
 * Raise the strongest Shield in the Inventory on the Tank, using one up. Ignored (returns false)
 * when none is owned or the raised Shield already has at least that much energy.
 */
export function raiseShield(tank: Tank, inventory: Inventory): boolean;

/**
 * Take `damage` off the Tank's Shield first. Returns the damage left over for Health. Drops the
 * Shield once its energy reaches 0.
 */
export function absorb(tank: Tank, damage: number): number;
```

### 5.2 `src/sim/explosion.ts`

In `detonate`, run each Tank's damage through `absorb` before taking it off Health:

```ts
const damage = absorb(t, damageAt(weapon, distance));
t.health = Math.max(0, t.health - damage);
```

`healthRemoved` and `destroyed` stay as they are, so Money is paid only for Health actually removed. A Tank whose Shield takes the whole hit reports no `ExplosionHit`.

### 5.3 `src/sim/round.ts`

- New Human action `{ kind: "raiseShield" }`. It calls `raiseShield(this.currentTank(), this.inventoryOf(this.currentPlayerId))`, stays in `aiming`, and leaves the Turn with the same Player.
- **Computer Players:** in `beginTurn()`, before `chooseAim`, every Computer Player calls `raiseShield` on its own Tank. It draws nothing from `rng`, so aim and Weapon draws keep their order, and a Moron that owns no Shield draws exactly as it did in v3.

### 5.4 Tests

- `raiseShield` uses the Heavy Shield first, then the Shield. It is ignored with no Shield owned. It is ignored while the raised Shield has at least that much energy, and replaces a weaker or damaged one.
- `absorb`: damage below the energy only lowers the energy. Damage above it drops the Shield and returns the rest. The Shield is gone exactly at 0.
- A Baby Missile at the centre of a Tank with a Shield (50) leaves Health at 100 and the Shield at 20. A Nuke at its centre leaves Health at 50 and no Shield.
- Earnings: a Missile whose 50 damage a Shield fully absorbs pays the firer nothing. One that removes 30 Health through a Shield pays for 30.
- A Dirt Weapon leaves a Shield untouched.
- A Shield never absorbs Fall Damage.
- `raiseShield` as a Human action keeps the phase `aiming` and the current Player unchanged. Firing afterwards works as usual.
- Shields don't carry into the next Round, but Shields in the Inventory do.
- A Computer Player owning a Shield raises it on its first Turn, and doesn't raise another while the first is above the new one's energy.
- A Moron that owns no Shield makes exactly the same `rng` draws as in v3.

Commit: `Add Shields to the sim`.

---

## Milestone 6: Raising Shields, and showing them

### 6.1 `src/input/keyboard.ts`

`S` (either case) → `{ kind: "raiseShield" }`. Like the arrow keys, ignore it while a form control has focus, and `preventDefault` it otherwise. Ignore auto-repeat, as for Space, so holding `S` can't use up a second Shield after the first is damaged.

### 6.2 `src/render/hud.ts`

`HealthLine` gains `shield: number | null`, the current Tank's Shield energy. When it isn't null, HUD line 2 draws `  Shield {energy}` after the Health bar and before `(thinking…)`. It must still fit in 640 px with `Player 10: 100`, `Shield 100`, the thinking marker and the right-aligned Wind and Round. Shorten the spacing if it doesn't.

### 6.3 `src/render/renderer.ts`

Every living Tank with a Shield gets a circle round its centre in its Player's colour: radius about 14 px, 1 px line, at an alpha that fades as its energy drops (full at the Shield's own energy, fainter towards 0). Keep the radius and alpha as constants in the renderer.

### 6.4 `src/ui/screens.ts`

The controls reminder gains `S Shield`. It no longer fits on one line, so split it over two lines (the hint uses `white-space: pre`):

```
←/→ Angle   ↑/↓ Power (Shift ×10)
Tab Weapon   S Shield   Space Fire
```

### 6.5 Tests

- Keyboard: `s` and `S` map to `raiseShield`. They are ignored in form controls and on auto-repeat.
- HUD: `healthLine` reports the Shield energy, or null with no Shield raised.
- Setup screen: the reminder mentions `S Shield`.

Commit: `Raise Shields with S and show them`.

---

## Milestone 7: Verification and release

1. `npm run check` and `npm run build` pass.
2. Write a Playwright smoke script in your scratchpad, not the repo, that:
   1. Opens `npm run preview` with `?seed=` set so the run is reproducible.
   2. Sets up 1 Human and 3 Computer Players (one of each Personality) for 3 Rounds and starts.
   3. In the Shop, checks the Shield, Heavy Shield and Parachute rows are there and greyed out at $2,000, then presses Done.
   4. Plays Turns until the Round results appear, pressing `S` once (nothing should happen with no Shield owned).
   5. Takes screenshots along the way.
3. **Manual checklist.** Play it yourself via Playwright keypresses and screenshots. Hand yourself Items through the Match in a dev-only console hook, or play enough Rounds to afford them:
   - [ ] The Shop panel fits in 640 × 480, its rows scroll, and `↓` reaches the Parachute row and keeps it in view. The header and **Done** stay visible throughout.
   - [ ] `S` raises your strongest Shield, the bubble appears, HUD line 2 shows its energy, and the Inventory drops by one.
   - [ ] A hit on a shielded Tank lowers the Shield first, and the bubble fades and then disappears.
   - [ ] A Tank dropped by a deep crater loses Health for the fall once everything comes to rest.
   - [ ] With a Parachute owned, the canopy opens partway down, the Tank takes no Fall Damage, and one Parachute is used up.
   - [ ] A short drop uses no Parachute.
   - [ ] Computer Players that bought Shields raise them.
   - [ ] Items carry over between Rounds, including for a Player whose Tank was destroyed. Raised Shields do not.
4. Update `README.md`: an **Items** table (Bundle, price, what it does) after the Weapons table, a paragraph on Fall Damage and Parachutes, Computer Players raising Shields, and `S` in the Controls table.
5. Commit and push.

---

## Pitfalls to avoid

- **`Inventory.owned()` stays Weapons only.** If Items leak into it, `Tab` would cycle onto a Parachute and `chooseWeapon` would try to fire one.
- **Pay only for Health actually removed.** Absorb first, then compute `healthRemoved`. Never pay for Shield energy.
- **A raised Shield belongs to the Tank, an owned Shield to the Player.** Tanks are recreated every Round. Inventories are not.
- **Fall Damage is applied once Settling is at rest, not per tick.** Applying it per tick splits a Tank riding falling dirt into many short falls under the safe distance.
- **Reset `fallen` and `parachute` after every landing**, or the next Turn's fall starts part-way or with a free Parachute.
- **Ask for a Parachute once per fall.** Asking every tick past the threshold uses up the whole Inventory in one fall.
- **Keep Moron's random draws unchanged when it owns no Shield.** `raiseShield` must never touch `rng`.
- **Raising a Shield is not firing.** It must not leave `aiming`, end the Turn, or start a Computer Player's think timer again.
- **The Turn ends only when everything is at rest**, including dirt falling through a Tank that Fall Damage destroyed.
- **No new magic numbers in `src/sim`.** Every price, energy, distance and rate goes in `constants.ts`. Drawing sizes go in the renderer.
- **Don't add features** from the out-of-scope list, even if they seem easy.
