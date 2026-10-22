# Screenshots

Every image here was captured from the **production build** (`npm run build` + `vite preview`) in headless Google Chrome by [`scripts/readme-shots.mjs`](../../scripts/readme-shots.mjs), then compressed to WebP by [`scripts/optimize-screenshots.mjs`](../../scripts/optimize-screenshots.mjs). Nothing is mocked up, painted over or generated.

## How each state was reached

| Image | How |
| --- | --- |
| `title-screen` | A first launch with empty storage, waited until the cinematic's **Start Game** prompt. |
| `main-menu`, `loadout`, `settings` | A seeded test profile (the same fixture `scripts/screens.mjs` uses): a returning player with records, every unlock and a wave-4 checkpoint, so **Continue** is shown. |
| `gameplay-combat`, `enemy-wave`, `upgrade-selection`, `pause-menu`, `boss-warden` | **Normal runs from wave 1 on Standard, with no debug assistance.** A small bot plays through real keyboard and mouse input (aims at the nearest enemy, holds fire, kites, dashes) and picks the first augment at each level-up. It beat the Warden on its own in both runs used here. |
| `hero-gameplay` | Seven seconds of the Warden fight (wave 5) from one of those runs: timestamped frames assembled into an animated WebP at about 15 fps, at the original pace. |
| `boss-sovereign` | Reached with `?debug`: a wave skip to wave 10, god mode so the bot survives, and an `H` press (20% boss damage) every ten seconds to move through the phases. The attacks are the real boss AI. |
| `victory` | Reached with `?debug`: a wave skip to wave 10, god mode, and the `H` hotkey (20% boss damage). That's why the run stats are short (0:18, 4 kills). |
| `game-over` | The end of one of those unassisted runs: after about four minutes (wave 6, Warden defeated) the bot stops defending and the wave finishes it. |
| `mobile-menu`, `mobile-gameplay` | Chrome mobile emulation at 390 × 844 (2× pixel ratio) with touch. Gameplay uses real touch events on the two virtual sticks, with god mode on. |

Debug mode (`?debug`) is a documented development feature; see [CONTROLS.md](../CONTROLS.md#debug-hotkeys). It doesn't change how anything is drawn.

## Brand artwork

`docs/brand/banner.webp` (README header) and `docs/brand/social-preview.png` (GitHub social card) are made by [`scripts/brand.mjs`](../../scripts/brand.mjs). It places the game's title lockup, set in its own fonts, over the `boss-sovereign` screenshot.

## Regenerating

```bash
npm run build && npx vite preview --port 4173 --strictPort   # terminal 1
npm run docs:screenshots                                      # terminal 2, ~8 minutes
```

Frames land in `test-artifacts/readme/` (ignored by Git). Combat frames are numbered by wave and order, and differ from run to run. Copy the frames you want to the `pick-*.png` names listed in `scripts/optimize-screenshots.mjs`, then:

```bash
node scripts/optimize-screenshots.mjs   # needs cwebp (brew install webp / apt install webp)
node scripts/brand.mjs                  # banner and social preview
```
