# Release checklist: v1.3.0

Run from a clean checkout. Steps marked _(server)_ need the production preview running in another terminal: `npm run build && npx vite preview --port 4173 --strictPort`.

## What changed

See [RELEASE_NOTES.md](RELEASE_NOTES.md): the full-screen landing page, the interface overhaul, and what stayed the same.

## Before tagging

- [ ] `npm ci`: dependencies install from the lockfile.
- [ ] `npm run build`: type-check and production bundle succeed.
- [ ] `npm run lint`: no errors.
- [ ] `npm test`: all unit tests pass.
- [ ] `npm run test:e2e` _(server)_: every check passes and the console is clean.
- [ ] `npm run perf` _(server)_: no scenario below 60 fps on a desktop GPU. Also run `node scripts/perf.mjs --software`; adaptive quality should keep gameplay around 50 fps or better on CPU rasterisation.
- [ ] `npm run soak` _(server)_: heap, DOM, listeners, loops and caches flat across cycles.
- [ ] `npm run audio:levels` _(server)_: no effect peaks above -1 dBFS before the limiter.
- [ ] `npm run landing:qa -- --out=test-artifacts/landing/release` _(server)_: every viewport, player state and resize step reports no problems. Look through `index.html` for framing and balance.
- [ ] `npm run screens -- --out=test-artifacts/ui/release` _(server)_: `report.json` lists no overflow, off-screen controls, small touch targets, overlaps or truncated labels. Then look through `index.html` at every viewport.
- [ ] Open the build from a sub-directory on a plain static server. Fonts and assets should load with no 404s.

## By hand (not automatable here)

- [ ] **Listen** on speakers and on headphones: overall mix, the pulse rifle over combat music, boss telegraphs, victory/defeat stingers, the reactor hum (should be barely there), mute and sliders. Levels were set by measurement only.
- [ ] Opening cinematic on a real phone in portrait and landscape: Skip, Start Game, and the title fitting the screen.
- [ ] Touch play on a real iOS and Android device: sticks, dash, boost, swap, pause and slider dragging. Include a phone with a notch or home indicator in landscape, and check the HUD clears both.
- [ ] Safari and Firefox desktop: intro, menu, a full run, audio unlock after the first click, focus rings, and double-click protection.
- [ ] Keyboard only, start to finish: menu → loadout → briefing → run → pause → settings → results, with a visible focus ring at every step.
- [ ] A screen reader pass (VoiceOver, NVDA) over the menu, loadout, settings and results. No formal accessibility audit has been done, so don't claim conformance.
- [ ] Browser zoom at 200% on desktop: screens scroll and nothing clips.
- [ ] An integrated-GPU laptop: frame pacing during the intro's establishing shot and the Sovereign fight.
- [ ] OS "reduce motion" on: still title card, no camera moves or flicker, and screens appear without animation.

## Ship

- [ ] Check `version` is 1.3.0 in `package.json` and `package-lock.json`, and `GAME_VERSION` is `'1.3'` in `src/game/constants.ts`.
- [ ] Commit, then tag `v1.3.0`.
- [ ] Upload `dist/` to the static host. No server config is needed; paths are relative.
- [ ] Smoke-test the live URL: intro → skip → New Run → a wave → pause → quit → Continue.

## Verified for this release

Run on 2026-10-22: macOS, Apple M4, headless Chrome 155 through `playwright-core`, against `vite preview` of the production build. Every viewport result below comes from browser viewport emulation, not from physical displays.

| Check | Result |
| --- | --- |
| `npm run build` | OK. JS 530.78 kB (gzip 163.46 kB), CSS 93.90 kB (gzip 19.93 kB) |
| `npm run lint` | 0 problems |
| `npm test` | 66/66 tests in 9 files |
| `npm run test:e2e` | 133/133 checks on each of two consecutive runs (213 s and 212 s), console clean. The 109 checks from v1.2 are unchanged and passing; 24 checks are new (input, focus, Escape, landing page, sliders, 320 px layout, touch targets) |
| `npm run landing:qa` | 30 captures (10 viewports × 3 player states) and 7 live-resize steps, no problems: no overflow, no page scrolling at desktop sizes, no collisions or clipped text, title on one line |
| `npm run screens` | 153 captures (17 states × 9 viewports): 0 overflow, 0 off-screen controls, 0 small touch targets, 0 overlaps, 0 truncated labels, console clean |
| `npm run perf` (GPU, 1440×900 @2×, high) | 60 fps in all 7 scenarios, 0 frames over 33 ms. Landing page (menu attract mode): 0.91 ms work avg, 1.3 ms p95 |
| `perf --software` | Cinematic 53 fps, menu 45, gameplay 51–60, adaptive quality at step 4. The menu figure is the governor alternating between step 4 (60 fps) and step 3 (about 28 fps); with the step pinned, the landing page's overlays, title glow and parallax made no measurable difference |
| `npm run soak` (10 cycles) | All 8 checks pass. Heap levels off (94 KB/cycle after warm-up, 3.5 → 7.1 MB), DOM 108 → 108, listeners 26/2 → 26/2, one loop (max 61 frame requests/s), sprite cache 69 → 72 |
| `npm run audio:levels` | No effect above -1 dBFS before the limiter. Loudest effect is bigExplosion at -23.9 LUFS in the mix. The audio engine is unchanged since v1.2 |

Not verified: listening to the audio, real phones, tablets and monitors, Safari, Firefox, integrated or low-end GPUs, a screen reader, or a formal accessibility audit. The by-hand list above covers these.
