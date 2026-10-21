# Scorched Earth

A browser remake of the classic artillery game. Two Players, each Human or Computer, take Turns
setting the Angle and Power of their Tank's barrel and firing Baby Missiles across rolling,
destructible hills. Mind the Wind, and remember that a damaged Tank can't fire as hard. The last
Tank standing wins the Round; the Player with the most Round Wins takes the Match.

**Play it:** https://klongshore.github.io/Scorched-Earth/

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

In hot-seat play both Humans use the same keys on their own Turn. Your Power can never exceed
10 × your Tank's Health, shown as `Power: {power}/{cap}` in the HUD.

## Deployment

Every push to `main` builds the site and deploys it to GitHub Pages
(`.github/workflows/deploy.yml`). In the repository settings, set **Settings → Pages → Source** to
**GitHub Actions** once.
