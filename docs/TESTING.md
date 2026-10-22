# Testing

SHADOW PROTOCOL has three layers of checks: static checks, unit tests, and browser scripts that drive the real production build in headless Chrome.

## Static checks and unit tests

No browser needed. CI runs these on Node 22 and 24 for every push to `main` and every pull request.

```bash
npm run lint        # ESLint (typescript-eslint, react-hooks, react-refresh)
npm run typecheck   # tsc -b, strict mode
npm test            # Vitest
npm run build       # tsc -b, then the Vite production bundle
```

Unit tests sit next to the code they cover:

| File | Covers |
| --- | --- |
| `src/game/core.test.ts` | Math helpers, spatial grid, arena layout and collision push-out, player loadout and healing |
| `src/game/input.test.ts` | Keyboard weapon cycling and input capture |
| `src/game/persistence.test.ts` | Save validation: garbage and corrupt data, locked loadouts, v1.1 profiles, run-save repair |
| `src/game/systems/waves.test.ts` | Wave definitions, boss waves, escalation and spawn queues |
| `src/game/systems/upgrades.test.ts` | Stat stacking and caps, augment rolls, card descriptions |
| `src/game/render/PerfGovernor.test.ts` | Adaptive quality stepping |
| `src/game/intro.test.ts` | Opening cinematic timeline |
| `src/game/menuFraming.test.ts` | Main menu camera framing at different aspect ratios |
| `src/ui/upgradeText.test.ts` | Augment card text |
| `src/ui/tokens.test.ts` | Design-token contrast ratios, recomputed from `src/index.css` |

## Browser scripts

These use `playwright-core` with a locally installed Google Chrome or Chromium. Nothing is downloaded. The scripts find Chrome in the usual macOS and Linux locations; set `CHROME_PATH` to override, and `BASE_URL` to test another server (default `http://localhost:4173`).

Start the production preview first, in its own terminal:

```bash
npm run build
npx vite preview --port 4173 --strictPort
```

| Command | What it does | Time |
| --- | --- | --- |
| `npm run test:e2e` | The end-to-end suite: intro, menus, loadout, a run, pause, settings, level-ups, bosses, saves and Continue, audio unlock, focus and `Esc` rules, sliders, touch layout. Fails on any console error or warning. **Runs in CI.** | ~3–4 min |
| `npm run screens` | Captures 17 states at 9 viewports and audits each for overflow, off-screen controls, touch targets under 44 px, overlapping controls and truncated labels. Writes PNGs, `report.json` and `index.html`. | several min |
| `npm run landing:qa` | The main menu at ten viewports and three player states, plus a live-resize pass. | ~1 min |
| `npm run perf` | Frame cost and pacing for the cinematic, menu, heavy combat and bosses. Flags: `--quality=low\|medium\|high`, `--software`, `--width --height --dpr`, `--throttle=N`. | ~2 min |
| `npm run soak` | Repeated intro → run → boss → quit cycles; checks heap, DOM nodes, listeners, loops and caches stay flat (`-- --cycles=N`). | several min |
| `npm run audio:levels` | Renders every sound offline and prints peak and loudness. | ~1 min |
| `npm run balance` | A bot plays fast-forwarded runs on each difficulty, for tuning. | several min |
| `npm run docs:screenshots` | Recaptures the README gallery (see [screenshots/README.md](screenshots/README.md)). | ~6 min |

Outputs go to `test-artifacts/`, which Git ignores.

The scripts open the game with `?debug`, which exposes the engine as `window.__shadow` so they can wait on real game state, and skip to later waves when they need them.

## Latest results

Run on 2026-10-22 on macOS (Apple M4), Node 24.12, headless Chrome 155, against `vite preview` of the production build.

| Check | Result |
| --- | --- |
| `npm run lint` | 0 problems |
| `npm run typecheck` | No errors |
| `npm test` | 69/69 tests in 10 files |
| `npm run build` | OK. JS 530.88 kB (163.49 kB gzipped), CSS 94.09 kB (19.94 kB gzipped) |
| `npm run test:e2e` | 133/133 checks, console clean |
| `npm run screens` | 153 captures (17 states × 9 viewports): 0 overflow, 0 off-screen controls, 0 small touch targets, 0 overlaps, 0 truncated labels, console clean |
| `npm audit` | 0 vulnerabilities |

`perf`, `soak`, `landing:qa` and `audio:levels` were last run for the 1.3.0 release; those results are recorded in [RELEASING.md](RELEASING.md#verified-for-this-release). The changes since then don't touch rendering, audio or the main menu layout.

## What isn't covered

Automated runs use headless Chrome on one machine with viewport emulation. Safari, Firefox, real phones and tablets, low-end GPUs, listening tests and screen readers are untested; see [KNOWN_ISSUES.md](KNOWN_ISSUES.md). The manual pre-release checklist is in [RELEASING.md](RELEASING.md).
