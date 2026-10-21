# Implementation Plan v2: More Players and Smarter Computer Players

This plan builds on the first playable version (`docs/implementation-plan.md`). It adds Matches of 2 to 10 Players and two new Personalities, **Shooter** and **Tosser**. Work through the milestones **in order**. Each milestone ends with checks that must pass and a commit. Do not start a milestone until the previous one's checks are green.

## 0. Before you start

1. Read `CONTEXT.md`. **Use its terms exactly** in code, including the new ones: `Moron`, `Shooter`, `Tosser`, `Target`. Never use the words in its _Avoid_ lists (no `hp`, `bot`, `enemy`, `victim`, `shot`, `score`).
2. Read `docs/adr/`. Nothing in this plan changes them.
3. The golden rules from v1 still hold:
   - **`src/sim/` is pure.** No DOM, no `window`, no `Math.random`, no `Date.now`, no imports from `src/render`, `src/input` or `src/ui`. All randomness goes through the seeded `Rng`.
   - **Every number lives in `src/sim/constants.ts`.** Never hard-code a tuning value anywhere else.
   - **Fixed timestep.** The simulation only ever advances by `TICK_SECONDS`.
   - Run `npm run check` (typecheck + lint + format + test) before every commit.

## Scope (do NOT build anything outside this)

**In scope:**

- A Match of 2 to 10 Players (default 2), each Human, Moron, Shooter or Tosser.
- Every Player fights for themselves. The Round Win still goes only to the last Tank standing; Draws and tied Matches work as before.
- Shooter and Tosser Personalities, aiming at a Target.
- The Computer Player pause shortened from 3 s to 1.5 s.
- Health shown above each Tank; HUD line 2 shows only the current Player.
- Setup screen: a Player count and one dropdown per Player.

**Out of scope** (unchanged from v1, plus):

- Teams.
- Rewards for surviving longer than other Tanks (placement awards).
- Cyborg, Poolshark, Chooser, Spoiler, Unknown and any other Personality.
- Per-Player pause lengths or a pause setting.
- Name entry. Players are still `Player 1` … `Player 10`.
- Money and shop, other Weapons, fall damage, shields, walls, sound, mouse or touch input, death animations, settings menu, online play.

---

## Milestone 1: Constants and colours

### 1.1 `src/sim/constants.ts`

- Change `COMPUTER_THINK_SECONDS` to `1.5`.
- Add:

```ts
// Match
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const DEFAULT_PLAYERS = 2;
```

### 1.2 `src/sim/players.ts`

Extend `PLAYER_COLORS` to 10 entries, keeping the first two as they are so v1 Matches look the same. Every colour must stand out against the sky gradient (`#000020` → `#402070`) and the dirt (`DIRT_SURFACE` / `DIRT_DEEP`):

```ts
export const PLAYER_COLORS = [
  "#ff5050", // red
  "#50a0ff", // blue
  "#50e050", // green
  "#ffe040", // yellow
  "#e060ff", // violet
  "#40e0e0", // cyan
  "#ff9030", // orange
  "#ff80c0", // pink
  "#e0e0e0", // white
  "#a0ff80", // lime
] as const;
```

Drop the `?? "#ffffff"` fallback once `MAX_PLAYERS` guarantees an entry, and add a test that `PLAYER_COLORS.length === MAX_PLAYERS` and that the entries are unique.

### 1.3 Tests

- Existing tests that hard-code 3 seconds or 180 ticks for the pause must derive the value from `COMPUTER_THINK_SECONDS / TICK_SECONDS` instead.

Commit: `Shorten Computer pause and add 10 Player colours`.

---

## Milestone 2: Up to 10 Players in the sim

### 2.1 `src/sim/types.ts`

```ts
export type PersonalityName = "moron" | "shooter" | "tosser";

/** What the Setup screen asks for, one per Player. */
export type PlayerSetup = { kind: "human" } | { kind: "computer"; personality: PersonalityName };
```

`Player` is unchanged.

### 2.2 `src/sim/players.ts` and `src/sim/match.ts`

- `createPlayers(setups: readonly PlayerSetup[]): Player[]`. It copies each setup's Personality onto the Player (`null` for humans).
- `MatchSetup.playerKinds` becomes `MatchSetup.players: readonly PlayerSetup[]`.
- The `Match` constructor throws if `players.length` is outside `MIN_PLAYERS..MAX_PLAYERS`, with a message in the style of the existing Rounds check.
- Update every caller (`game.ts`, `screens.ts`, tests). `DEFAULT_PLAYER_KINDS` becomes `DEFAULT_PLAYERS_SETUP = [{ kind: "human" }, { kind: "computer", personality: "moron" }]`.

Until Milestones 4 and 5 land, `chooseAim` treats `shooter` and `tosser` like `moron`, so the switch stays exhaustive and the game keeps working.

### 2.3 Tests

- `placeTanks` with 10 Players: every Tank is inside `PLACEMENT_EDGE_MARGIN`, no two Tank hitboxes overlap, and each sits on a flattened pad. Repeat over several seeds.
- `Round` with 10 Players: the Turn order holds every Player once; dead Tanks are skipped; the Round ends as soon as one Tank is left (or none, a Draw). Kill Tanks directly by setting `health = 0` to set this up.
- `Match` rejects 1 and 11 Players and accepts 2 and 10.
- **Integration:** a 10-Moron, 2-Round Match completes within `2 × 200_000` ticks with `results.length === 2`.

Commit: `Allow Matches of 2 to 10 Players`.

---

## Milestone 3: Targets and Computer memory

Shooter and Tosser aim at a **Target**: the enemy Tank they are currently aiming at, kept until that Tank is destroyed. Tosser also remembers how its last Projectile went. Both live in a per-Round memory, so a new Round starts fresh.

### 3.1 `src/sim/personalities.ts`

```ts
/** Where a Computer Player's last Projectile ended up. */
export type Landing = { kind: "hit"; x: number } | { kind: "lost"; side: "left" | "right" };

/** What a Computer Player remembers between its Turns within one Round. */
export interface ComputerMemory {
  targetId: number | null; // playerId of the Target
  lastAim: Aim | null; // the Tosser's last Angle and Power at this Target
  lastLanding: Landing | null;
}

export function newComputerMemory(): ComputerMemory;

/**
 * Keep the remembered Target while its Tank is alive; otherwise pick a random living
 * opponent with rng and clear lastAim and lastLanding.
 */
export function chooseTarget(
  memory: ComputerMemory,
  self: Tank,
  tanks: readonly Tank[],
  rng: Rng,
): Tank;

export function chooseAim(
  personality: PersonalityName,
  self: Tank,
  tanks: readonly Tank[],
  memory: ComputerMemory,
  rng: Rng,
): Aim;
```

- `moron` ignores `tanks` and `memory` and must draw from `rng` **exactly** as it does today (one `int` for Angle, one for Power, nothing else), so seeded tests and Matches with only Morons behave as before.
- `shooter` and `tosser` call `chooseTarget` first.
- `chooseTarget` is never called when `self` is the only living Tank: the Round has already ended.

### 3.2 `src/sim/round.ts`

- The Round holds `private readonly memories: Map<number, ComputerMemory>`, with one entry per Computer Player, created in the constructor.
- `beginTurn()` passes the current Tank, `this.tanks` and the Player's memory to `chooseAim`.
- When the Projectile ends, record it in the firing Player's memory if they are a Computer Player:

  - `hit` → `{ kind: "hit", x: outcome.x }`.
  - `lost` → `{ kind: "lost", side: p.x < 0 ? "left" : "right" }`.

  `stepProjectile`'s `lost` outcome doesn't say which side; use the Projectile's `x` at that moment, which is already past the edge.

### 3.3 Tests

- A Target is kept across Turns while alive, even when another opponent is closer.
- When the Target's Tank is destroyed, a new living opponent is picked and `lastAim` / `lastLanding` are cleared.
- A Computer Player never picks itself or a dead Tank.
- After a Computer Player's Projectile hits Terrain or leaves the field, its memory holds the matching `Landing`.

Commit: `Add Targets and Computer memory`.

---

## Milestone 4: Shooter

### 4.1 Aiming math: `src/sim/aiming.ts`

```ts
/**
 * The Power that lands a Projectile fired at `angle` from `self` on `target`'s centre,
 * ignoring Wind and Terrain. null when no Power can reach it at that Angle.
 */
export function powerToHit(self: Tank, target: Tank, angle: number): number | null;
```

From the barrel tip `(x0, y0)` to the Target's centre `(xt, yt)`, with `dx = xt − x0`, `dy = yt − y0` (y points down) and `a` the Angle in radians:

```
denominator = 2 · cos²(a) · (dy + dx · tan(a))
if denominator <= 0 → null       // the Target is above the line of the barrel
speed = sqrt(GRAVITY · dx² / denominator)
power = round(speed / POWER_TO_SPEED)
```

Note that the barrel tip depends on the Angle, so compute it with `barrelTip` after setting the Angle on a copy of the Tank. Do not mutate `self`.

### 4.2 Shooter in `chooseAim`

> **Superseded during implementation (#34 and code review):** a Target is reachable only if some Angle the Personality fires hits it within the Power cap. The Shooter picks at random among those Angles, never falls back to its cap, and a Computer Player with no reachable opponent fires like a Moron that Turn. Steps 2, 3 and 5 below describe the original plan.

1. `target = chooseTarget(...)`.
2. Pick an Angle pointing toward the Target: `base = rng.int(SHOOTER_MIN_ANGLE, SHOOTER_MAX_ANGLE)`; use `base` if the Target is to the right, `180 − base` if to the left.
3. `ideal = powerToHit(self, target, angle)`. If it is `null`, use `powerCap(self)`.
4. Add error: `power = round(ideal × (1 + rng.range(−SHOOTER_POWER_ERROR, SHOOTER_POWER_ERROR)))`.
5. Clamp to `0..powerCap(self)`. A damaged Shooter that can't reach simply fires at its cap.

Add to `constants.ts`:

```ts
export const SHOOTER_MIN_ANGLE = 30; // degrees above the horizontal, toward the Target
export const SHOOTER_MAX_ANGLE = 60;
export const SHOOTER_POWER_ERROR = 0.05; // ±5%
```

### 4.3 Tests

- `powerToHit` property test: on flat Terrain with Wind 0, for a grid of Tank pairs and Angles in 30°–60°, firing at the returned Power lands within `BABY_MISSILE.radius` of the Target's centre. Run the real `stepProjectile`, so the fixed-timestep error is included.
- `powerToHit` returns `null` for a Target well above the barrel line (e.g. Angle 30°, Target 200 px up and 20 px across).
- Shooter's Angle always points toward its Target and stays in its band.
- Shooter's Power is never above `powerCap`.
- With `SHOOTER_POWER_ERROR` patched to 0 (pass the error in as a parameter with the constant as default, rather than mocking), a Shooter on flat ground with Wind 0 destroys a full-Health Target in a bounded number of Turns.

Commit: `Add Shooter Personality`.

---

## Milestone 5: Tosser

### 5.1 Tosser in `chooseAim`

1. `target = chooseTarget(...)`. A change of Target clears `lastAim` and `lastLanding`.
2. **First Turn at this Target** (`lastAim === null`): Angle `TOSSER_ANGLE` toward the Target (`180 − TOSSER_ANGLE` if it is to the left). Power is `powerToHit` (or `powerCap` if `null`) with error `TOSSER_FIRST_POWER_ERROR`.
3. **Later Turns**: keep `lastAim.angle` and correct `lastAim.power` from `lastLanding`, measuring horizontally from the Tosser's Tank `x`:
   - `want = |target.x − self.x|`.
   - `hit`: `got` = the distance from `self.x` to `landing.x` **in the Target's direction** (negative if it landed behind the Tosser). If `got <= 0`, use factor `TOSSER_MAX_FACTOR`. Otherwise `factor = sqrt(want / got)`. On flat ground range grows with speed², so this is the right first-order correction. A Projectile stopped short by a hill counts as short and raises Power.
   - `lost` on the Target's side of the field: factor `TOSSER_LOST_FACTOR` (too long).
   - `lost` on the other side: factor `TOSSER_MAX_FACTOR`.
   - Clamp the factor to `TOSSER_MIN_FACTOR..TOSSER_MAX_FACTOR`, then `power = round(lastAim.power × factor)`, clamped to `0..powerCap(self)`.
4. Store the Angle and Power fired in `memory.lastAim`.

Wind is never modelled: the correction from real landings absorbs it.

Add to `constants.ts`:

```ts
export const TOSSER_ANGLE = 45;
export const TOSSER_FIRST_POWER_ERROR = 0.25; // ±25%
export const TOSSER_LOST_FACTOR = 0.8;
export const TOSSER_MIN_FACTOR = 0.5;
export const TOSSER_MAX_FACTOR = 1.5;
```

### 5.2 Tests

- First Turn: Angle is 45° toward the Target; Power is within ±25% of `powerToHit` and within the cap.
- A `hit` landing past the Target lowers Power; one short of it raises Power; one behind the Tosser uses `TOSSER_MAX_FACTOR`.
- A `lost` landing on the Target's side lowers Power by `TOSSER_LOST_FACTOR`.
- **Convergence:** on flat Terrain with Wind −15, 0 and +15, a Tosser's landings get closer to a stationary Target over its first 4 Turns, ending within `BABY_MISSILE.radius`. Simulate by alternating `chooseAim` and a real flight with `stepProjectile`, without detonating.
- Memory resets at the start of a new Round.

Commit: `Add Tosser Personality`.

---

## Milestone 6: Health above each Tank and a slimmer HUD

### 6.1 `src/render/renderer.ts`

For each living Tank, draw its Health as a number in the Player's colour, in a 10-px monospace font, centred at `x` and with its baseline at `y − TANK_HEIGHT − BARREL_LENGTH − 2`, so a barrel pointing straight up never covers it. Put the offsets and font in the renderer, not in `constants.ts`: they are rendering, not simulation.

### 6.2 `src/render/hud.ts`

- Line 1 is unchanged.
- Line 2 shows only the current Player while they are aiming: `{name}: {health}` and the 50-px Health bar in their colour. In any other phase it is empty.
- `(thinking…)` stays right-aligned on line 2.

### 6.3 Done when

- `hud.test.ts` is updated for the new line 2.
- A Playwright screenshot of a 10-Player Round shows every Tank's Health legibly, with nothing overlapping at the field's edges.

Commit: `Show Health above each Tank`.

---

## Milestone 7: Setup screen

Update `src/ui/screens.ts`:

- A **Players** `<select>` with 2–10, default `DEFAULT_PLAYERS`, placed above the Player list.
- One row per Player: their name in their colour and a `<select>` of **Human / Moron / Shooter / Tosser**. The defaults are Player 1 Human and Player 2 Moron. Rows added by raising the count default to Moron.
- Changing the count adds or removes rows from the end and keeps the choices in the remaining rows.
- Start builds `MatchSetup.players` from the rows.
- Every control is reachable with Tab, the Start button keeps its autofocus, and Enter still starts the Match.
- The Setup, Round results and Final standings panels must fit in 640 × 480 with 10 Players. Shrink the row spacing in `style.css` if they don't.

Tests in `screens.test.ts`:

- Changing the count from 2 to 5 shows 5 rows; back to 3 keeps the first 3 choices.
- Start reports the chosen Personalities in order.

Commit: `Pick the Player count and Personalities on the Setup screen`.

---

## Milestone 8: Verification and release

1. `npm run check` and `npm run build` pass.
2. Write a Playwright smoke script in your scratchpad, not the repo, that:
   1. Opens `npm run preview`.
   2. Selects 10 Players: 3 Morons, 4 Shooters and 3 Tossers, and 1 Round, then starts.
   3. Waits for the Round results overlay (generous timeout, e.g. 10 minutes).
   4. Presses Enter and asserts the Final standings list all 10 Players.
   5. Takes screenshots along the way.
3. **Manual checklist.** Play it yourself via Playwright keypresses and screenshots:
   - [ ] Setup offers 2–10 Players and keeps choices when the count changes.
   - [ ] Two Humans plus two Computer Players take Turns in the shuffled order, and dead Tanks are skipped.
   - [ ] Every Tank shows its Health above it; HUD line 2 shows only the current Player.
   - [ ] A Shooter usually lands near its Target; a Tosser visibly closes in over a few Turns.
   - [ ] A Computer Player keeps its Target until that Tank is destroyed.
   - [ ] The Computer pause is about 1.5 s.
   - [ ] The Round results and Final standings fit with 10 Players.
4. Update `README.md`: 2–10 Players, the three Personalities, and the Setup screen.
5. Commit and push.

---

## Pitfalls to avoid

- **Keep Moron's random draws unchanged.** Any extra `rng` call on a Moron's Turn shifts every later draw and breaks seeded tests.
- **The Target is a Tank, the memory is per Round.** Tanks are recreated every Round; never carry a `targetId` across Rounds.
- **Don't let `powerToHit` mutate the Tank.** Compute the barrel tip on a copy.
- **"Toward the Target" depends on the sign of `dx`.** Angle 0° points right. A Target to the left needs `180 − angle`.
- **Always clamp to `powerCap`.** A damaged Computer Player must never exceed it.
- **No new magic numbers in `src/sim`.** Every tuning value goes in `constants.ts`.
- **Don't add features** from the out-of-scope list, even if they seem easy.
