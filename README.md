# Scorched Earth

A browser remake of the classic artillery game. From 2 to 10 Players, each Human or Computer and
each fighting for themselves, take Turns setting the Angle and Power of their Tank's barrel and
firing Weapons across rolling, destructible hills. Mind the Wind, and remember that a damaged
Tank can't fire as hard. The last Tank standing wins the Round; the Player with the most Round Wins
takes the Match.

**Play it:** https://klongshore.github.io/Scorched-Earth/

## Setting up a Match

The Setup screen asks for:

- **Players:** how many Players take part, from 2 to 10 (default 2). Changing the count adds or
  removes Players at the end of the list; everyone else keeps their choice.
- **One dropdown per Player:** Human, or a Computer Player with one of the Personalities below.
  Each Player is shown in their own colour.
- **Rounds:** how many Rounds the Match lasts, from 1 to 99 (default 10).

Press `Enter` or **Start** to begin. Each Round the Turn order is shuffled, and destroyed Tanks are
skipped.

### Computer Personalities

- **Moron** fires at a random Angle and a random Power.
- **Shooter** picks a Target and calculates the Angle and Power to hit it, ignoring Wind and
  anything in the way, then adds a little random error.
- **Tosser** picks a Target and starts with a rough guess, then corrects its Power each Turn based
  on where its last Projectile landed, closing in over a few Turns.

A Shooter or Tosser keeps its Target until that Tank is destroyed or can no longer be reached, then
picks a new one. With no Tank in reach, it fires like a Moron that Turn.

Each Turn a Moron fires a random Weapon it owns. A Shooter or Tosser fires its most damaging
Weapon whose blast can't reach back to its own Tank, never a Dirt Weapon, and the Baby Missile when
it has no Target or nothing else suits. Computer Players pause for about 1.5 seconds, showing their
aim, before they fire.

Every Tank shows its Health above it. The HUD shows the current Player's Angle, Power, Weapon and
Health, along with the Wind and the Round.

## Money and the Shop

Every Player starts the Match with **$2,000** and earns more in battle: **$50** for each point of
Health removed from another Tank, **$2,000** for each other Tank destroyed, and **$5,000** for a
Round Win. Harming your own Tank earns nothing, and a Draw pays no Round Win bonus. The Round
results show what each Player earned that Round and their total. Money is only for spending: Round
Wins alone decide the Match.

The **Shop** opens before every Round, including the first. Each Human gets their own Shop screen
in Player order, showing their Money and every Weapon on sale with its Bundle (how many one
purchase buys), its price and how many they own. Weapons you can't afford are greyed out. Use
`↑` / `↓` to choose, `Enter` to buy one Bundle, and **Done** or `Esc` to finish. Computer Players
shop first, instantly and off screen: they keep buying a random Bundle they can afford until they
can afford none. A Match of only Computer Players shows no Shop screen and goes straight into
battle.

Your **Inventory** and Money last the whole Match, even if your Tank is destroyed. Firing a Weapon
uses one up, except the Baby Missile, which every Player always has without limit.

### Weapons

| Weapon       | Bundle | Price   | Blast radius | Damage at the centre |
| ------------ | ------ | ------- | ------------ | -------------------- |
| Baby Missile | —      | free    | 20 px        | 30                   |
| Missile      | 5      | $1,875  | 30 px        | 50                   |
| Baby Nuke    | 3      | $10,000 | 45 px        | 70                   |
| Nuke         | 1      | $12,000 | 75 px        | 100                  |
| MIRV         | 3      | $10,000 | 30 px        | 50                   |
| Funky Bomb   | 2      | $7,000  | 30 px        | 50                   |
| Baby Roller  | 10     | $5,000  | 20 px        | 30                   |
| Roller       | 5      | $6,000  | 30 px        | 50                   |
| Heavy Roller | 2      | $6,750  | 45 px        | 70                   |
| Dirt Clod    | 10     | $5,000  | 20 px        | none                 |
| Dirt Ball    | 5      | $5,000  | 35 px        | none                 |
| Ton of Dirt  | 2      | $6,750  | 70 px        | none                 |

Damage falls off from the centre of the Explosion to nothing at its edge.

- **MIRV:** splits into 5 Missiles at the top of its arc, spread out sideways. One that hits
  something on the way up explodes as a single Missile.
- **Funky Bomb:** explodes, then throws 6 to 8 Baby Missile bomblets in random directions.
- **Rollers** fly like any Weapon, but on touching the ground they roll downhill (on level ground,
  the way they were already moving) and explode when they reach a dip or a wall, touch a Tank, or
  have rolled for 8 seconds. A Roller that hits a Tank in mid-air explodes at once, and one that
  rolls off the side of the field is lost.

**Dirt Weapons** (Dirt Clod, Dirt Ball, Ton of Dirt) add a ball of dirt where they land instead of
blasting a crater, and damage no one, so they earn nothing. Use them to build cover or bury an
opponent: the dirt packs around a Tank without filling it, and any left hanging in the air Settles.
A buried Tank can still fire, but its shot explodes in the dirt at the barrel tip, so it has to
blast its way out and takes some of its own damage.

## Run it locally

Requires Node.js 24 or later.

```sh
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173/).

Other scripts:

| Command           | What it does                                     |
| ----------------- | ------------------------------------------------ |
| `npm run check`   | Typecheck, lint, format check and unit tests     |
| `npm run build`   | Typecheck and build the static site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally                  |

## Controls

| Key                 | Action                                  |
| ------------------- | --------------------------------------- |
| `←` / `→`           | Turn the barrel left / right (Angle)    |
| `↑` / `↓`           | Raise / lower Power                     |
| `Shift` + `↑` / `↓` | Raise / lower Power by 10               |
| `Tab` / `Shift+Tab` | Next / previous Weapon you own          |
| `Space`             | Fire                                    |
| `Enter`             | Start / continue on the overlay screens |
| `↑` / `↓`, `Esc`    | Choose a Weapon / finish in the Shop    |

In hot-seat play every Human uses the same keys on their own Turn. Your Power can never exceed
10 × your Tank's Health, shown as `Power: {power}/{cap}` in the HUD. Each Turn starts on the last
Weapon you fired, or the Baby Missile once you have none of it left; the HUD shows it as
`Weapon: {name} ×{count}`.

## Deployment

Every push to `main` builds the site and deploys it to GitHub Pages
(`.github/workflows/deploy.yml`). In the repository settings, set **Settings → Pages → Source** to
**GitHub Actions** once.
