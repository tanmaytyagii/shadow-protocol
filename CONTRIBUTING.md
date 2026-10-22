# Contributing to SHADOW PROTOCOL

Thanks for your interest. Bug reports, balance feedback, device test results and pull requests are all welcome.

## Before you start

- **Bugs and ideas:** search the [issues](https://github.com/tanmaytyagii/shadow-protocol/issues) first, then open one using the matching template.
- **Larger changes** (new systems, new enemies, big refactors): open an issue to discuss the approach before writing code.
- **Security problems:** follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
- **No license yet.** The repository doesn't have an open-source license, so you can't reuse its code elsewhere by default. Contributions you submit may be used in this project.

## Set up

You need Node.js 22.13+ or 24 (`.nvmrc` pins 24) and npm. The browser scripts also need Google Chrome or Chromium installed locally.

```bash
git clone https://github.com/tanmaytyagii/shadow-protocol.git
cd shadow-protocol
npm ci
npm run dev        # http://localhost:5173
```

Open `http://localhost:5173/?debug` for the debug hotkeys (`K`, `N`, `G`, `L`, `H`; see [docs/CONTROLS.md](docs/CONTROLS.md#debug-hotkeys)).

## Project layout

- `src/game/`: the engine, framework-free. **No React imports here.**
- `src/ui/`: React components, HUD and screens, built from the shared components in `src/ui/components/` and the design tokens at the top of `src/index.css`.
- `scripts/`: browser automation run against the production preview.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the pieces fit together.

## Making changes

1. Create a branch from `main`.
2. Keep the change focused. Unrelated refactors belong in their own pull request.
3. Follow the existing style: TypeScript strict mode, small focused modules, short comments that explain *why*. ESLint enforces the rest.
4. Add or update unit tests next to the code (`*.test.ts`) for logic you change: waves, upgrades, persistence, input, framing and similar pure code.
5. Update the docs if behaviour, controls or scripts change, and add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).

### Rules worth knowing

- **Never feed presentation back into the simulation.** `render/vfx.ts` reacts to game events; gameplay must not depend on it.
- **Keep React out of the frame loop.** The UI reads the engine through `store.ts`; don't add per-frame React state.
- **Saved data must stay loadable.** Changes to `persistence.ts` must keep older profiles and run saves working; there are tests for v1.1 data.
- **Respect reduce motion and the quality presets** in new effects.
- **No new runtime dependencies** without discussing them first.

## Checks

Run these before opening a pull request. CI runs the first four on Node 22 and 24, then the end-to-end suite.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The browser scripts drive the production build in headless Chrome. Start the preview in one terminal:

```bash
npm run build && npx vite preview --port 4173 --strictPort
```

Then, in another:

```bash
npm run test:e2e   # end-to-end suite (about 3–4 minutes)
```

If you touch layout, rendering, audio or performance-sensitive code, also run the relevant script from [docs/TESTING.md](docs/TESTING.md) (`screens`, `landing:qa`, `perf`, `soak` or `audio:levels`) and mention the results in your pull request.

## Pull requests

- Describe what changed and why, and link the issue.
- Include before/after screenshots for visual changes.
- Say what you tested, and on which browsers and devices. Untested is fine to say.
- Keep commits readable. Conventional prefixes (`fix:`, `feat:`, `docs:`) are appreciated but not required.

## Code of conduct

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
