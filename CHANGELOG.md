# Changelog

All notable changes to SHADOW PROTOCOL. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Fixed

- `Q` now switches to the previous weapon. Both `Q` and `E` used to cycle forward, so with three or more weapons `Q` couldn't step back as the briefing describes.
- The wave-cleared banner no longer shows through the augment picker and overlaps its heading when a wave bonus triggers a level-up.
- Pausing mid score count-up no longer leaves the HUD score a few points behind the pause panel's score.

### Added

- README rebuilt as a project landing page, with a gallery of screenshots captured from the running game (`docs/screenshots/`).
- Documentation: game guide, controls, architecture, interface, testing, deployment and known issues under `docs/`, plus `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md`.
- GitHub Actions CI: lint, type-check, unit tests and build on Node 22 and 24, then the browser end-to-end suite.
- Issue and pull request templates.
- `npm run docs:screenshots` and `scripts/optimize-screenshots.mjs` to recapture and compress the README images.
- A unit test for keyboard weapon cycling.
- `engines` in `package.json` and `.nvmrc`, matching what the toolchain requires (Node 22.13+ or 24).

### Changed

- The release checklist moved from `RELEASE.md` to `docs/RELEASING.md`, and the 1.3.0 release notes moved into this changelog.
- The README's Node.js requirement is corrected from 20+ to 22.13+ or 24. Vitest 5 and ESLint 10 don't run on Node 20.

## [1.3.0] - 2026-10-22

### Full-screen landing page

- **A launcher, not a centred box.** The main menu now fills the whole window. Title and actions sit on the left and the operative record on the right, with the live arena's reactor framed in the open space between them. This holds at every window shape, from a 320 px phone to a 2560×1080 ultrawide.
- **The layout changes shape with the space available:**
  - three zones on wide screens;
  - two columns at mid widths;
  - one column on narrow windows and phones;
  - two compact columns on phones held sideways;
  - a compact arrangement for short windows.

  Type and spacing scale with width and height separately; nothing is shrunk as a picture. On ultrawide screens the composition stays together while the arena runs edge to edge.
- **Cinematic framing.** The menu camera sizes and places the reactor for the window's shape and keeps it softly lit. It adds a slow drift and slight pointer parallax. With reduce motion on, the composition holds still.
- **New title lockup.** SHADOW has a static glow and a single light pass as it lands. PROTOCOL is tracked and carried to SHADOW's width by a hairline. The periodic glitch and the looping sheen are gone.
- **Clearer actions.**
  - Continue is the primary action when a checkpoint exists; otherwise New Run is.
  - An unavailable Continue reads as an empty slot: legible, but plainly inert.
  - How to Play, Settings and Credits share one strip.
- **Operative record, reorganised:**
  - high score and deployments up top;
  - a stats grid that reflows to four columns when there's room;
  - loadout emblems with lock states, and the next unlock;
  - Nightmare's status and its requirement.

  Every value comes from the saved profile.
- **Footer.** It sits on the same grid as the rest of the page. Keyboard hints drop out on short windows, and Replay intro works as before.

### Interface overhaul (also in 1.3.0)

- **Shared design.** One visual system and one set of components. The loadout, briefing, settings, credits, pause, level-up, results and HUD are all rebuilt on them.
- **One gesture, one action.** Held keys and double-clicks no longer carry through to the next screen.
- **`Esc` steps back one level.** It never starts, restarts or abandons a run.
- **Safer confirmations.** Destructive confirmations open on Cancel.
- **Focus.** It returns to the control that opened a screen.
- **Responsive.** No horizontal overflow, 44 px touch targets and safe-area insets, from 320 px phones to ultrawide.

### Unchanged

- Gameplay, balance, enemy AI, collisions, bosses, damage, progression, audio and the save format.
- Profiles, settings and run saves from v1.2 (and v1.1) load as they are.

### Verification

- [docs/RELEASING.md](docs/RELEASING.md) records the exact build, lint, unit, end-to-end, performance, soak and audio results for this release.

## Earlier versions

Versions before 1.3.0 predate this repository's Git history. What the code and docs record about them:

- **1.2** added the opening cinematic and the `introSeen` profile flag.
- **1.1** profiles, settings and run saves still load unchanged; `src/game/persistence.test.ts` and the end-to-end suite check this.

[Unreleased]: https://github.com/tanmaytyagii/shadow-protocol/compare/024f075...HEAD
[1.3.0]: https://github.com/tanmaytyagii/shadow-protocol/commit/024f0757b0e3881085400e2a8e889c94edf6264b
