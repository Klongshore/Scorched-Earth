# Scorched Earth

A browser remake of the classic artillery game. From 2 to 10 Players, each Human or Computer and
each fighting for themselves, take Turns setting the Angle and Power of their Tank's barrel and
firing Baby Missiles across rolling, destructible hills. Mind the Wind, and remember that a damaged
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
picks a new one. With no Tank in reach, it fires like a Moron that Turn. Computer Players pause for
about 1.5 seconds, showing their aim, before they fire.

Every Tank shows its Health above it. The HUD shows the current Player's Angle, Power and Health,
along with the Wind and the Round.

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
| `Space`             | Fire                                    |
| `Enter`             | Start / continue on the overlay screens |

In hot-seat play every Human uses the same keys on their own Turn. Your Power can never exceed
10 × your Tank's Health, shown as `Power: {power}/{cap}` in the HUD.

## Deployment

Every push to `main` builds the site and deploys it to GitHub Pages
(`.github/workflows/deploy.yml`). In the repository settings, set **Settings → Pages → Source** to
**GitHub Actions** once.
