# Known issues and limitations

## Not yet verified

Automated checks run in headless Chrome on macOS with browser viewport emulation. The following have **not** been tested:

- **Browsers:** Safari and Firefox (desktop or mobile), and Chromium-based browsers other than Chrome.
- **Devices:** real phones and tablets (iOS and Android), notched screens in landscape, physical high-DPI and ultrawide monitors, integrated or low-end GPUs.
- **Audio:** the mix was set and checked by offline measurement only. Nobody has signed it off by listening on speakers or headphones.
- **Accessibility:** no screen-reader pass (VoiceOver, NVDA) and no formal accessibility audit. Colour contrast of the design tokens is checked by a unit test; that is not a conformance claim.

The manual checklist in [RELEASING.md](RELEASING.md) covers these.

## Limitations

- **No gamepad support.** Keyboard and mouse, or touch, only.
- **No key remapping.** Bindings are fixed (see [CONTROLS.md](CONTROLS.md)).
- **English only.** All interface text is hard-coded in English.
- **Pinch-zoom is disabled.** The page sets `touch-action: none` and `user-scalable=no` so twin-stick drags never zoom or scroll the page. Text can't be enlarged with pinch on phones; desktop browser zoom still works and screens scroll when needed.
- **Silent first cinematic.** Browsers block audio until the first click, tap or key press, so the opening sequence normally plays without sound.
- **Saves are local.** Records, unlocks and the checkpoint live in `localStorage` for one browser on one site. There is no export, import or cloud sync, and clearing site data erases them. In private-browsing modes that block storage, progress isn't kept.
- **The touch Swap button only cycles forward.** Keyboard players can step both ways with `Q` / `E` or the wheel.
- **The game world isn't exposed to assistive technology.** Menus, HUD text and notices are HTML with labels and live regions, but the arena itself is a canvas.
- **One JavaScript bundle.** The production build is a single ~530 kB script (~163 kB gzipped) with no code splitting.

## Reporting a problem

Open an issue with your browser, operating system, device, and the steps to reproduce. Enabling **Settings → Show FPS counter** adds the frame rate and any automatic quality reduction to the screen, which helps with performance reports.
