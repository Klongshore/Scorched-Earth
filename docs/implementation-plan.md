# Implementation Plan: First Playable Scorched Earth

This plan builds the first playable version of Scorched Earth. Work through the milestones **in order**. Each milestone ends with checks that must pass and a commit. Do not start a milestone until the previous one's checks are green.

## 0. Before you start

1. Read `CONTEXT.md`. **Use its terms exactly** in code: `Match`, `Round`, `Turn`, `Player`, `Tank`, `Angle`, `Power`, `Health`, `Wind`, `Terrain`, `Settling`, `Projectile`, `Explosion`, `Weapon`, `RoundWin`, `Draw`, `Personality`. Never use the words in its _Avoid_ lists (no `hp`, `bot`, `map`, `level`, `shot`, `score`).
2. Read `docs/adr/`. In short:
   - There is no networking.
   - Terrain is a per-pixel bitmap, not a heightmap.
3. Golden rules:
   - **`src/sim/` is pure.** It has no DOM, no `window`, no `Math.random`, and no imports from `src/render`, `src/input` or `src/ui`. All randomness goes through the seeded `Rng`.
   - **Every number lives in `src/sim/constants.ts`.** Never hard-code a tuning value anywhere else.
   - **Fixed timestep.** The simulation only ever advances by `TICK_SECONDS`.
   - Run `npm run check` (typecheck + lint + test) before every commit.

## Scope (do NOT build anything outside this)

**In scope:**
- 2 Players, each Human or Computer.
- A Round count from 1 to 99 (default 10).
- One Weapon (Baby Missile) with unlimited ammo.
- Seeded rolling-hill Terrain, with Settling of dirt and Tanks.
- Wind.
- Health and Power cap.
- Self-damage.
- Draws.
- Moron Personality with a 3-second pause.
- Keyboard controls.
- Screens: Setup, Round, Round results and Final standings.
- HUD.
- CI and GitHub Pages deploy.

**Out of scope:**
- Money and shop.
- Other Weapons.
- Fall damage.
- Shields.
- Walls other than "none".
- Sound.
- Mouse or touch input.
- Name entry.
- More than 2 Players. Still write code with arrays of Players, never `player1`/`player2` variables.
- Tank death animations.
- Settings menu.
- Online play.

## Coordinate system and units

- The field is **640 × 480 logical pixels**: `x` grows rightwards, `y` grows **downwards** (canvas convention). Row `479` is the bottom.
- Positions use floating-point pixels. Terrain cells are integer pixels: cell `(x, y)` covers `[x, x+1) × [y, y+1)`, and a float position maps to the cell `(Math.floor(x), Math.floor(y))`.
- **Angle** is in degrees, an integer from 0 to 180: 0 = barrel points right, 90 = straight up, 180 = left.
- **Power** is an integer from 0 to 1000.
- **Health** is an integer from 0 to 100.
- **Wind** is an integer from −20 to +20. Positive pushes right.
- Time is in seconds. Velocities are in px/s; accelerations are in px/s².
- Velocity from Angle and Power (note the minus sign, because y points down):
  ```
  speed = power * POWER_TO_SPEED
  vx =  speed * cos(angle in radians)
  vy = -speed * sin(angle in radians)
  ```

## Tank geometry

- A Tank's `x` is the centre column. Its `y` is the **ground row it rests on**: the Tank's body occupies rows `y - TANK_HEIGHT … y - 1`, and row `y` is dirt (when supported).
- **Hitbox:** a rectangle `x - TANK_HALF_WIDTH ≤ px ≤ x + TANK_HALF_WIDTH` and `y - TANK_HEIGHT ≤ py < y`.
- **Centre** (used for Explosion damage distance): `(x, y - TANK_HEIGHT / 2)`.
- **Barrel pivot:** `(x, y - TANK_HEIGHT)`. Barrel tip = pivot + `BARREL_LENGTH * (cos a, -sin a)`. A Projectile spawns at the barrel tip. Because `BARREL_LENGTH > TANK_HALF_WIDTH`, it never starts inside its own Tank.
- **Supported:** any Terrain cell is solid in row `y` for columns `x - TANK_HALF_WIDTH … x + TANK_HALF_WIDTH`.

---

## Milestone 1: Project scaffold, tooling, CI, deploy

### 1.1 Files

Create the following, using these **exact** dev-dependency versions (do not use `^` or `latest`):

`package.json`:
```json
{
  "name": "scorched-earth",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "npm run typecheck && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.sim.json --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "check": "npm run typecheck && npm run lint && npm run format:check && npm run test"
  },
  "devDependencies": {
    "@eslint/js": "9.14.0",
    "eslint": "9.14.0",
    "prettier": "3.3.3",
    "typescript": "5.6.3",
    "typescript-eslint": "8.13.0",
    "vite": "5.4.10",
    "vitest": "2.1.4"
  }
}
```
Run `npm install` to produce `package-lock.json`, and commit the lockfile.

`tsconfig.json` (the whole app):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`tsconfig.sim.json`: proves `src/sim` has no DOM dependency, because `lib` contains no `DOM`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "lib": ["ES2022"], "types": [] },
  "include": ["src/sim"],
  "exclude": ["src/sim/**/*.test.ts"]
}
```
Test files are excluded because Vitest's types may pull in DOM types. They are still typechecked by `tsconfig.json`. Tests import `{ describe, it, expect } from "vitest"` explicitly; no globals.

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
export default defineConfig({ base: "./" });
```
(`base: "./"` makes the build work under any GitHub Pages sub-path.)

`eslint.config.js`:
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["src/sim/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", "window", "document", "requestAnimationFrame", "performance", "localStorage"],
      "no-restricted-properties": ["error", { object: "Math", property: "random", message: "Use Rng from src/sim/rng.ts" }],
      "no-restricted-imports": ["error", { patterns: ["**/render/**", "**/input/**", "**/ui/**"] }],
    },
  },
);
```

`.prettierrc`: `{ "printWidth": 100 }`. `.prettierignore`: `dist`, `package-lock.json`.

`.gitignore`: `node_modules`, `dist`.

`index.html` (repo root):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Scorched Earth</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="stage">
      <canvas id="field" width="640" height="480"></canvas>
      <div id="overlay"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/style.css`:
- `html, body { margin:0; height:100%; background:#000; color:#fff; font-family: monospace; }`
- `#stage` is centred with flex, `position: relative`.
- `#field { image-rendering: pixelated; display:block; }`
- `#overlay` is absolutely positioned over the canvas with the same size; it is hidden when empty.

`src/main.ts`: for now, it just fills the canvas with a colour, to prove the build works.

### 1.2 CI workflows

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run check
      - run: npm run build
```

`.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deployment
        uses: actions/deploy-pages@v4
```
**Manual step for the human:** in the repo's Settings → Pages, set the source to "GitHub Actions". Tell the user to do this; you cannot do it yourself.

### 1.3 Done when
- `npm run check` passes. Add one trivial test, `src/sim/smoke.test.ts`, so Vitest has something to run; delete it in Milestone 2.
- `npm run build` produces `dist/`.
- Temporarily add `Math.random()` to a file in `src/sim`: `npm run lint` must fail. Remove it again.
- Commit: `Scaffold Vite + TypeScript project with CI and Pages deploy`.

---

## Milestone 2: Constants and seeded RNG

### 2.1 `src/sim/constants.ts`

```ts
// Field
export const FIELD_WIDTH = 640;
export const FIELD_HEIGHT = 480;

// Simulation
export const TICK_SECONDS = 1 / 60;
export const MAX_TICKS_PER_FRAME = 5;

// Firing
export const MIN_ANGLE = 0;
export const MAX_ANGLE = 180;
export const MIN_POWER = 0;
export const MAX_POWER = 1000;
export const POWER_PER_HEALTH = 10; // Power cap = Health * POWER_PER_HEALTH
export const POWER_STEP = 1;
export const POWER_STEP_FAST = 10; // with Shift
export const ANGLE_STEP = 1;
export const START_ANGLE = 90;
export const START_POWER = 500;

// Physics
export const GRAVITY = 280; // px/s², downward
export const POWER_TO_SPEED = 0.6; // px/s per Power unit
export const WIND_MAX = 20;
export const WIND_ACCELERATION_PER_UNIT = 2; // px/s² per Wind unit

// Tank
export const MAX_HEALTH = 100;
export const TANK_HALF_WIDTH = 7;
export const TANK_HEIGHT = 8;
export const BARREL_LENGTH = 12;
export const PAD_HALF_WIDTH = 10; // flattened ground each side of a Tank
export const TANK_FALL_PIXELS_PER_TICK = 2;

// Weapons
export const BABY_MISSILE = { name: "Baby Missile", radius: 20, maxDamage: 30 } as const;

// Explosion and Settling
export const EXPLOSION_SECONDS = 0.5;
export const SETTLE_PASSES_PER_TICK = 2;

// Terrain generation
export const TERRAIN_BASE_FRACTION = 0.65; // mean surface height as a fraction of FIELD_HEIGHT from the top
export const TERRAIN_MIN_FRACTION = 0.3;
export const TERRAIN_MAX_FRACTION = 0.92;
export const TERRAIN_HARMONICS = 4;
export const TERRAIN_MAX_AMPLITUDE = 70;

// Placement
export const PLACEMENT_EDGE_MARGIN = 24;
export const PLACEMENT_MAX_JITTER = 40;

// Match
export const DEFAULT_ROUNDS = 10;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 99;

// Computer Players
export const COMPUTER_THINK_SECONDS = 3;
```

### 2.2 `src/sim/rng.ts`

Implement a small seeded PRNG (mulberry32):
```ts
export class Rng {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  /** Float in [min, max). */
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  /** Fisher–Yates shuffle, returns a new array. */
  shuffle<T>(items: readonly T[]): T[] { /* implement */ }
}
```

### 2.3 Tests: `src/sim/rng.test.ts`
- The same seed gives the same first 10 values; different seeds give different sequences.
- `int(-20, 20)` over 10 000 draws stays within bounds and hits both −20 and 20.
- `shuffle` returns a permutation: same elements, same length, and the input is not mutated.

Commit: `Add simulation constants and seeded RNG`.

---

## Milestone 3: Terrain

### 3.1 `src/sim/terrain.ts`

```ts
export class Terrain {
  readonly width: number;
  readonly height: number;
  /** 1 = dirt, 0 = air. Index = y * width + x. */
  readonly cells: Uint8Array;
  /** Incremented on every change, so the renderer knows when to redraw. */
  version = 0;

  constructor(width: number, height: number);
  isSolid(x: number, y: number): boolean; // floors x and y; outside the field → false, EXCEPT y >= height → true (the floor is solid)
  set(x: number, y: number, solid: boolean): void; // integer coords, ignores out-of-range
  /** Topmost solid row in column x, or height if the column is empty. */
  surfaceY(x: number): number;
  /** Fill each column x from surface[x] down to the bottom. */
  static fromSurface(surface: readonly number[], width: number, height: number): Terrain;
  /** Remove all dirt within radius of (cx, cy) (cell centre (x+0.5, y+0.5) inside the circle). */
  carveCircle(cx: number, cy: number, radius: number): void;
  /** Make columns [x0, x1] solid from row y down; clear them above y. Used for Tank pads. */
  flatten(x0: number, x1: number, y: number): void;
  /**
   * One Settling pass: every solid cell with air directly below moves down one row.
   * Scan each column from row height-2 up to row 0, so a whole floating chunk drops 1 px per pass.
   * Returns true if any cell moved.
   */
  settlePass(): boolean;
}
```
Increment `version` in every mutating method that changes something.

### 3.2 `src/sim/terrainGen.ts`

```ts
export function generateHills(rng: Rng, width: number, height: number): Terrain;
```
Algorithm, which is deterministic for a given seed:
1. `base = height * TERRAIN_BASE_FRACTION`.
2. For `k = 1 … TERRAIN_HARMONICS`, pick:
   - `amp_k = rng.range(0.3, 1) * TERRAIN_MAX_AMPLITUDE / k`
   - `freq_k = k * rng.range(0.8, 1.2)`
   - `phase_k = rng.range(0, 2π)`
3. For each column `x`: `surface[x] = round(base + Σ amp_k * sin(2π * freq_k * x / width + phase_k))`, clamped to `[height * TERRAIN_MIN_FRACTION, height * TERRAIN_MAX_FRACTION]`.
4. Return `Terrain.fromSurface(surface, width, height)`.

### 3.3 Tests: `src/sim/terrain.test.ts`
- `fromSurface` sets the right cells; `surfaceY` matches the input surface.
- `isSolid` returns false outside the sides and above the top, and true below the bottom.
- `carveCircle(100, 300, 20)` on flat ground at y = 300 clears `(100, 310)` and leaves `(100, 330)` and `(130, 310)` alone. `version` increases.
- Settling: build an empty terrain, set a single cell at `(5, 10)` plus a floor row at `y = 20`. Calling `settlePass()` 9 times moves the cell to `(5, 19)`; a 10th call returns `false`.
- Settling: an overhang (a solid block with air underneath) falls until it rests on the dirt below.
- `generateHills` with the same seed gives identical `cells`; every surface value is inside the clamp range.

Commit: `Add bitmap Terrain with carving, Settling and hill generation`.

---

## Milestone 4: Domain types, Tank placement and Projectile physics

### 4.1 `src/sim/types.ts`

```ts
export type PlayerKind = "human" | "computer";
export type PersonalityName = "moron";

export interface Player {
  readonly id: number; // index into Match.players
  readonly name: string; // "Player 1", "Player 2"
  readonly color: string; // CSS colour, used by the renderer only
  readonly kind: PlayerKind;
  readonly personality: PersonalityName | null; // non-null iff kind === "computer"
}

export interface Tank {
  readonly playerId: number;
  x: number; // integer centre column
  y: number; // ground row (see Tank geometry)
  angle: number; // integer degrees
  power: number; // integer
  health: number; // integer 0..100
}

export interface Weapon {
  readonly name: string;
  readonly radius: number;
  readonly maxDamage: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly weapon: Weapon;
  readonly firedBy: number; // playerId
}

export interface Explosion {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  elapsed: number; // seconds since it started
}
```
Player colours: Player 1 is `#ff5050`, Player 2 is `#50a0ff`. Define them in `src/sim/players.ts` together with `createPlayers(kinds: PlayerKind[]): Player[]`.

### 4.2 `src/sim/tank.ts`

```ts
export function isAlive(t: Tank): boolean; // health > 0
export function powerCap(t: Tank): number; // health * POWER_PER_HEALTH
export function clampAim(t: Tank): void; // clamp angle to [0,180], power to [0, powerCap]
export function centre(t: Tank): { x: number; y: number };
export function barrelTip(t: Tank): { x: number; y: number };
export function hitTest(t: Tank, px: number, py: number): boolean; // hitbox; dead Tanks never hit
export function isSupported(t: Tank, terrain: Terrain): boolean;
```

### 4.3 `src/sim/placement.ts`

```ts
export function placeTanks(rng: Rng, terrain: Terrain, playerIds: readonly number[]): Tank[];
```
For `n = playerIds.length`:
1. For slot `i`, compute `x = round(width * (i + 0.5) / n + rng.range(-j, j))`, where `j = min(PLACEMENT_MAX_JITTER, width / (4n))`. Clamp it to `[PLACEMENT_EDGE_MARGIN, width - 1 - PLACEMENT_EDGE_MARGIN]`.
2. `groundY = terrain.surfaceY(x)`. Then call `terrain.flatten(x - PAD_HALF_WIDTH, x + PAD_HALF_WIDTH, groundY)`.
3. Create the Tank with `{ playerId, x, y: groundY, angle: START_ANGLE, power: START_POWER, health: MAX_HEALTH }`.
4. Assign shuffled slots to Players (`rng.shuffle`), so that Player 1 is not always on the left.

### 4.4 `src/sim/projectile.ts`

```ts
export function launch(t: Tank, weapon: Weapon): Projectile; // spawns at barrelTip with velocity from angle/power

export type ProjectileOutcome =
  | { kind: "flying" }
  | { kind: "lost" } // left through the left or right side
  | { kind: "hit"; x: number; y: number }; // touched Terrain, the floor, or a living Tank

/** Advance one tick. Mutates p. */
export function stepProjectile(
  p: Projectile, wind: number, terrain: Terrain, tanks: readonly Tank[], dt: number,
): ProjectileOutcome;
```
Algorithm for `stepProjectile`:
1. Update velocity first: `vx += wind * WIND_ACCELERATION_PER_UNIT * dt`; `vy += GRAVITY * dt`.
2. Compute the displacement `dx = vx*dt`, `dy = vy*dt`.
3. **Sub-step** so the Projectile never tunnels through thin dirt: `n = max(1, ceil(max(|dx|, |dy|)))`. Repeat `n` times:
   - Advance `x += dx/n`, `y += dy/n`.
   - If `x < 0 || x >= FIELD_WIDTH`, return `lost`.
   - If `y < 0`, continue. The top of the field is open: no collisions there.
   - If any living Tank's `hitTest(x, y)` is true, or `terrain.isSolid(x, y)` is true, return `hit` at `(x, min(y, FIELD_HEIGHT - 1))`.
4. Return `flying`.

### 4.5 Tests
`src/sim/tank.test.ts`:
- `powerCap` is 1000 at full Health and 400 at Health 40.
- `clampAim` reduces power 700 to 400 when Health is 40.
- `barrelTip` at angle 0 is to the right of the hitbox; at 90 it is above it.
- `hitTest` is false for a dead Tank.

`src/sim/placement.test.ts`:
- Two Tanks end up on opposite halves of the field.
- Each Tank is supported.
- The pad is flat: `surfaceY` is equal for all columns within `PAD_HALF_WIDTH`.
- The result is deterministic for a seed.

`src/sim/projectile.test.ts`, on flat Terrain at y = 400 with no Tanks:
- Fired at 90° with Wind 0, the Projectile lands within 1 px of its start x.
- Two Projectiles at 45° and 135° from the same point with Wind 0 land mirror-symmetrically, within 2 px.
- With Wind +20, a 90° Projectile lands to the right of its start; with −20, to the left.
- A Projectile fired at 0° from x = 630 is `lost`.
- A Projectile fired at a 1-px-thick wall at high speed does not pass through it, because of the sub-steps.
- A Projectile aimed at a second Tank returns `hit` inside that Tank's hitbox.
- Write a helper `flyUntilDone(p, wind, terrain, tanks)` in the test that steps until the outcome is not `flying`, with a 10 000-tick safety cap that fails the test.

Commit: `Add Tanks, placement and Projectile physics`.

---

## Milestone 5: Explosions and damage

### 5.1 `src/sim/explosion.ts`

```ts
/** Damage dealt to a Tank whose centre is `distance` from the Explosion centre. */
export function damageAt(weapon: Weapon, distance: number): number;
// distance >= radius → 0; otherwise Math.round(maxDamage * (1 - distance / radius))

/** Apply an Explosion: damage every living Tank (including the firer), carve Terrain, clamp aim. */
export function detonate(x: number, y: number, weapon: Weapon, terrain: Terrain, tanks: Tank[]): Explosion;
```
`detonate` steps, in this order:
1. For each living Tank, set `health = max(0, health - damageAt(weapon, dist(centre(t), (x, y))))`, then `clampAim(t)`.
2. `terrain.carveCircle(x, y, weapon.radius)`.
3. Return `{ x, y, radius: weapon.radius, elapsed: 0 }`.

### 5.2 Tests: `src/sim/explosion.test.ts`
- `damageAt` gives 30 at distance 0, 15 at distance 10, and 0 at distance 20 and beyond.
- A direct hit on a Tank centre takes its Health from 100 to 70.
- A Tank 25 px away is untouched.
- **Self-damage:** an Explosion on the firer's own centre damages the firer.
- A Tank with Health 10 hit for 30 ends with Health 0, not −20.
- After a hit leaves Health at 40, a power of 900 is clamped to 400.

Commit: `Add Explosion damage and carving`.

---

## Milestone 6: Round state machine

This is the heart of the game. Read it carefully.

### 6.1 `src/sim/round.ts`

```ts
export type Phase =
  | { kind: "aiming"; thinkRemaining: number | null } // thinkRemaining is non-null only for Computer Players
  | { kind: "flying"; projectile: Projectile }
  | { kind: "exploding"; explosion: Explosion }
  | { kind: "settling" }
  | { kind: "over"; result: RoundResult };

export type RoundResult = { kind: "win"; playerId: number } | { kind: "draw" };

export type RoundAction =
  | { kind: "adjustAngle"; delta: number }
  | { kind: "adjustPower"; delta: number }
  | { kind: "fire" };

export class Round {
  readonly number: number; // 1-based
  readonly terrain: Terrain;
  readonly tanks: Tank[];
  wind: number; // not readonly: tests set it to 0 for predictable shots
  readonly turnOrder: number[]; // playerIds, shuffled once per Round
  currentIndex: number; // index into turnOrder
  phase: Phase;

  constructor(number: number, players: readonly Player[], rng: Rng);
  get currentPlayerId(): number;
  currentTank(): Tank;
  /** Apply a human action. Ignored unless phase is "aiming" and the current Player is human. */
  act(action: RoundAction): void;
  /** Advance the simulation by one tick. */
  tick(dt: number): void;
}
```

**Constructor:**
1. Generate the Terrain with `generateHills`.
2. Place the Tanks with `placeTanks`.
3. Set `wind = rng.int(-WIND_MAX, WIND_MAX)` and `turnOrder = rng.shuffle(playerIds)`.
4. Set `currentIndex = 0`, then call `beginTurn()`.

Keep a reference to `players` and `rng`. The Moron Personality needs the `rng`.

**`act`** (human, aiming only):
- `adjustAngle`: add `delta`, then `clampAim`.
- `adjustPower`: add `delta`, then `clampAim`.
- `fire`: set the phase to `flying` with `launch(currentTank, BABY_MISSILE)`.

**`tick(dt)`**, which switches on `phase.kind`:
- **aiming:** if `thinkRemaining !== null`, subtract `dt`. When it reaches 0 or below, fire, exactly like a human `fire`.
- **flying:** call `stepProjectile`.
  - `flying`: nothing more to do.
  - `lost`: switch to `settling`. Nothing has changed, but settling then finishes immediately and keeps the flow uniform.
  - `hit`: call `detonate`, then switch to `exploding`.
- **exploding:** `elapsed += dt`. Once `elapsed >= EXPLOSION_SECONDS`, switch to `settling`.
- **settling:**
  1. Run `terrain.settlePass()` `SETTLE_PASSES_PER_TICK` times.
  2. For each living Tank that is not supported, increase `y` by 1, up to `TANK_FALL_PIXELS_PER_TICK` times per tick, stopping as soon as it is supported. If `y >= FIELD_HEIGHT`, set `health = 0`. There is no fall damage otherwise.
  3. When no settle pass moved anything **and** no Tank moved this tick, call `endTurn()`.
- **over:** do nothing.

**`endTurn()`:**
1. Count the living Tanks.
   - 0 left: set the phase to `over` with a `draw`.
   - 1 left: set the phase to `over` with a `win` for that Tank's Player.
2. Otherwise, advance `currentIndex` (wrapping) to the next Player whose Tank is alive, then call `beginTurn()`.

**`beginTurn()`:**
1. Find the current Player.
2. If it is a computer, call `chooseAim(personality, tank, rng)` (Milestone 8). Set the Tank's angle and power to the result, then `clampAim`. Set the phase to `aiming` with `thinkRemaining = COMPUTER_THINK_SECONDS`.
3. Otherwise, set the phase to `aiming` with `thinkRemaining = null`.

Until Milestone 8 exists, stub `chooseAim` to return `{ angle: 90, power: 0 }`.

### 6.2 Tests: `src/sim/round.test.ts`

Write a helper `runUntil(round, predicate, maxTicks = 20000)` that ticks with `TICK_SECONDS` and fails the test if the cap is hit. In scenario tests, set `round.wind = 0` first. A shot fired at 90° then falls straight back onto the firer, which is the easy way to cause a predictable Explosion at a known spot.
- A new Round has 2 Tanks at full Health, Wind within ±20, and is in the `aiming` phase.
- Human `adjustAngle` / `adjustPower` change the current Tank and are clamped.
- `act` is ignored outside `aiming`.
- After `fire`, the Round eventually returns to `aiming` with the **other** Player current, or ends.
- **Turn end:** directly after the phase goes from `exploding` to `settling`, the current Player has not changed.
- **Win:** set the opponent's Health to 1, then aim straight at it. Rather than solving ballistics, place the Tanks in the test by overwriting `tank.x/y` on flat Terrain, and fire Angle 90 from a Tank positioned directly next to the target. The Round ends with `win` for the firer.
- **Draw:** set both Tanks to Health 1, put them next to each other, and fire straight up. The Round ends with `draw`.
- **Self-destruction:** a Player whose Tank kills only itself gives the opponent the win.
- **Falling Tank:** carve the dirt under a Tank. It falls during settling and ends supported, with Health unchanged.
- **Determinism:** two Rounds with the same seed and the same action sequence end in identical state (compare tanks, wind and `terrain.cells`).

Commit: `Add Round state machine`.

---

## Milestone 7: Match

### 7.1 `src/sim/match.ts`

```ts
export interface MatchSetup {
  readonly playerKinds: readonly PlayerKind[]; // length 2 for now
  readonly rounds: number; // MIN_ROUNDS..MAX_ROUNDS
  readonly seed: number;
}

export class Match {
  readonly players: Player[];
  readonly totalRounds: number;
  readonly roundWins: number[]; // indexed by playerId
  readonly results: RoundResult[];
  round: Round;

  constructor(setup: MatchSetup); // creates Rng(seed), the players, and Round 1
  /** Call when round.phase is "over": records the result. */
  recordRoundResult(): void;
  isOver(): boolean; // results.length === totalRounds
  startNextRound(): void; // throws if isOver()
  /** Players sorted by Round Wins descending, then by id. */
  standings(): { player: Player; roundWins: number }[];
  /** The single Player with the most Round Wins, or null if tied at the top (a tied Match). */
  winner(): Player | null;
}
```
One `Rng` is created per Match and shared by every Round, so a whole Match is reproducible from its seed.

### 7.2 Tests: `src/sim/match.test.ts`
- Wins and draws are tallied correctly. To test this, force results by manipulating `round.phase` directly.
- `isOver()` becomes true after `totalRounds` recorded results.
- `winner()` returns null on a tie.
- `standings()` is ordered.
- A Match of two Computer Players with 3 Rounds runs to completion purely by ticking. This is the integration smoke test; it needs Milestone 8, so add it there.

Commit: `Add Match`.

---

## Milestone 8: Moron Personality

### 8.1 `src/sim/personalities.ts`

```ts
export interface Aim { angle: number; power: number }
export function chooseAim(personality: PersonalityName, tank: Tank, rng: Rng): Aim;
```
- `moron`: `angle = rng.int(MIN_ANGLE, MAX_ANGLE)`, `power = rng.int(0, powerCap(tank))`.

Wire `chooseAim` into `Round.beginTurn()`, replacing the stub.

### 8.2 Tests
- Moron's aim is always within its bounds and respects the Health-based cap.
- A Computer Player's Turn shows its aim during the pause. Right after `beginTurn`, the Tank's angle and power equal the chosen aim, the phase is `aiming`, and `thinkRemaining` is 3. The Projectile is launched after 3 seconds of ticks (180 ticks, ±1), not before.
- **Integration:** the Computer-vs-Computer, 3-Round Match from 7.2 completes within 3 × 200 000 ticks, and `results.length === 3`.

Commit: `Add Moron Personality`.

---

## Milestone 9: Rendering

No tests are needed for rendering; it is verified visually. Keep render code dumb: it reads state and never changes it.

### 9.1 `src/render/palette.ts`
```ts
export const SKY_TOP = "#000020";
export const SKY_BOTTOM = "#402070";
export const DIRT_SURFACE = [176, 120, 56]; // RGB at the top of the field
export const DIRT_DEEP = [96, 48, 16]; // RGB at the bottom
export const PROJECTILE_COLOR = "#ffffff";
export const EXPLOSION_COLORS = ["#ffff40", "#ffa020", "#ff4010"];
export const HUD_TEXT = "#ffffff";
```

### 9.2 `src/render/renderer.ts`
```ts
export class Renderer {
  constructor(canvas: HTMLCanvasElement);
  draw(match: Match): void;
}
```
- **Sky:** a vertical linear gradient filling the canvas, from `SKY_TOP` to `SKY_BOTTOM`.
- **Terrain:** keep an offscreen `ImageData` (640×480). Rebuild it **only when `terrain.version` or the Round object changed** since the last frame. For solid cells, write the dirt colour linearly interpolated by `y` between `DIRT_SURFACE` and `DIRT_DEEP`; for air cells, set alpha 0. Draw it with `putImageData` on an offscreen canvas, then `drawImage` onto the main canvas, so the sky shows through the transparent cells.
- **Tanks** (living only), in the Player's colour:
  - The body is a filled rectangle covering the hitbox's bottom half, plus a half-circle dome on top.
  - The barrel is a 2-px line from the pivot to `barrelTip`.
  - Mark the current Player's Tank with a small triangle 6 px above it while aiming.
- **Projectile:** a 2×2 white square.
- **Explosion:** a filled circle of radius `radius * min(1, elapsed / (EXPLOSION_SECONDS / 2))`, coloured `EXPLOSION_COLORS[floor(elapsed * 30) % 3]`.
- **HUD:** see 9.3.

### 9.3 `src/render/hud.ts`
Draw it in a 14-px monospace font at the top of the canvas over the sky, with a semi-transparent black strip behind it (rows 0–35).
- **Line 1**, at y ≈ 14: `{name}   Angle: {angle}   Power: {power}/{cap}   Wind: {arrow}{|wind|}   Round {n}/{total}`.
  - The name is drawn in the current Player's colour.
  - The arrow is `→` for positive Wind, `←` for negative, and nothing for 0.
- **Line 2**, at y ≈ 30: for each Player, in their colour, `{name}: {health}` followed by a 50-px Health bar.
- While a Computer Player is thinking, append `(thinking…)` to line 1.

### 9.4 Scaling (`src/render/scale.ts`)
- On load and on window `resize`, compute `s = max(1, floor(min(innerWidth / 640, innerHeight / 480)))`.
- Set the canvas CSS width and height to `640*s` and `480*s` px. Do the same for `#overlay`.
- The canvas's internal resolution stays 640×480.

### 9.5 Done when
`main.ts` (temporarily) creates a Computer-vs-Computer Match, ticks it in a `requestAnimationFrame` loop, and draws it. You should see the following:
- Hills appear.
- Tanks sit on flat pads.
- Shots arc and are visibly pushed by the Wind.
- Craters appear and floating dirt falls.
- Tanks fall into craters.
- The HUD updates.

Take a screenshot with Playwright to confirm. Chromium is installed; launch with `executablePath: '/opt/pw-browsers/chromium'` if needed.

Commit: `Add canvas renderer and HUD`.

---

## Milestone 10: Input and game loop

### 10.1 `src/input/keyboard.ts`
```ts
export function attachKeyboard(target: Window, onAction: (a: RoundAction) => void, onConfirm: () => void): () => void; // returns detach
```
Listen for `keydown`. Each event, including OS auto-repeat, is one step:

| Key | Action |
|---|---|
| `ArrowLeft` | `adjustAngle +ANGLE_STEP` (the barrel turns left) |
| `ArrowRight` | `adjustAngle −ANGLE_STEP` |
| `ArrowUp` | `adjustPower +POWER_STEP` (`+POWER_STEP_FAST` if `shiftKey`) |
| `ArrowDown` | `adjustPower −POWER_STEP` (`−POWER_STEP_FAST` if `shiftKey`) |
| `Space` | `fire`. Ignore `event.repeat` for Space, so holding it doesn't fire twice. |
| `Enter` | `onConfirm()`, used by the overlay screens |

Call `preventDefault()` for these keys so the page doesn't scroll. Both humans in hot-seat play use the same keys.

### 10.2 `src/game.ts`: the app controller

It owns the screen state: `"setup" | "round" | "roundResults" | "standings"`.
- Fixed-timestep loop using `requestAnimationFrame`:
  ```
  accumulator += min(frameSeconds, 0.25)
  steps = 0
  while (accumulator >= TICK_SECONDS && steps < MAX_TICKS_PER_FRAME) { match.round.tick(TICK_SECONDS); accumulator -= TICK_SECONDS; steps++ }
  renderer.draw(match)
  ```
- On the screen `round`: forward keyboard actions to `match.round.act`. When `round.phase.kind === "over"`, call `match.recordRoundResult()` and switch to `roundResults`.
- On `roundResults`, confirming means: if `match.isOver()`, go to `standings`; otherwise call `match.startNextRound()` and go to `round`.
- On `standings`, confirming means: go back to `setup`.
- Seed each new Match with `Date.now() >>> 0`. This is the **only** place wall-clock time touches the sim.

### 10.3 `src/main.ts`
Find `#field` and `#overlay`, then create the scaler, `Renderer` and `Game`, and call `game.start()`.

Commit: `Add keyboard input and fixed-timestep game loop`.

---

## Milestone 11: Screens

Write `src/ui/screens.ts`, which renders plain HTML into `#overlay`. Clear the overlay while in the `round` screen. Style the screens in `style.css`: a centred panel with a dark semi-transparent background and monospace font. Every screen must be fully usable from the keyboard, with sensible focus and Enter to continue.

1. **Setup**
   - Title "SCORCHED EARTH".
   - For each of the 2 Players, a `<select>` with Human/Computer. The defaults are Player 1 Human and Player 2 Computer.
   - A number input for Rounds (min 1, max 99, default 10). Clamp invalid values.
   - A "Start" button, autofocused. Pressing it builds the `MatchSetup` and starts the Match.
   - A short controls reminder: `←/→ Angle   ↑/↓ Power (Shift ×10)   Space Fire`.
2. **Round results**
   - "{Player} wins Round {n}!" in their colour, or "Round {n} is a draw".
   - A table of Round Wins so far.
   - "Press Enter to continue".
   - Show it about 1 second after the Round ends, so the final Explosion is visible. Keep ticking and drawing during that delay.
3. **Final standings**
   - "{Player} wins the Match!", or "The Match is a tie".
   - Standings: name and Round Wins.
   - "Press Enter for a new Match".

Commit: `Add Setup, Round results and Final standings screens`.

---

## Milestone 12: Verification and release

1. `npm run check` and `npm run build` pass.
2. Write a Playwright smoke script in your scratchpad, not the repo, that does the following:
   1. Opens `npm run preview`.
   2. Selects Computer for both Players and 1 Round, then starts.
   3. Waits until the Round results overlay appears (generous timeout, e.g. 5 minutes).
   4. Presses Enter and asserts the Final standings appear.
   5. Takes screenshots along the way.
3. **Manual checklist.** Play it yourself via Playwright keypresses and screenshots:
   - [ ] Arrow keys change Angle and Power, and the HUD updates. Shift+Up raises Power by 10.
   - [ ] Power can't exceed the cap shown in the HUD after the Tank is damaged.
   - [ ] Space fires once per press.
   - [ ] Keys do nothing during a Computer Player's 3-second pause or while a Projectile is flying.
   - [ ] Shooting at 90° damages your own Tank.
   - [ ] Craters appear; floating dirt and Tanks fall; Tanks take no fall damage.
   - [ ] A Projectile leaving the side ends the Turn quietly.
   - [ ] The page scales sharply at different window sizes.
4. Update `README.md` with the game name, how to run it (`npm install`, `npm run dev`), the controls, and the link to the deployed GitHub Pages site.
5. Commit, push, and remind the user to enable Pages (Settings → Pages → Source: GitHub Actions) if they haven't.

---

## Pitfalls to avoid

- **y points down.** Upwards velocity is negative. Getting this wrong is the most likely bug, and the 90° and symmetry tests in Milestone 4 will catch it.
- **Don't apply damage during the Explosion animation.** Damage and carving happen once, in `detonate`, at impact.
- **Don't change Players before Settling finishes.** The Turn ends only in `endTurn()`.
- **Don't call `Math.random()` or `Date.now()` in `src/sim`.** The linter will stop you; don't disable the rule.
- **Don't let Projectiles collide above the top of the field.** It's open.
- **Don't rebuild the Terrain `ImageData` every frame.** Check `terrain.version`.
- **Don't add features** from the out-of-scope list, even if they seem easy.
- If a tuning value feels wrong once the game is playable (too strong, too slow), change it in `constants.ts` only, and keep the tests passing. Tests should derive expected values from the constants where they can.
