# SHADOW PROTOCOL

A cyberpunk arcade survival shooter for the browser. You are a rogue operative trapped in a hostile containment facility. Survive ten escalating waves, install augments, collect weapons, and take down two bosses: the **Warden** at wave 5 and the **Null Sovereign** at wave 10.

Every visual is drawn with Canvas 2D and every sound is synthesised with the Web Audio API. There are no image or audio assets, and no server is needed.

## Quick start

Requires Node.js 20+ (developed on Node 24).

```bash
npm ci             # installs exactly what package-lock.json lists (npm install also works)
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build      # type-checks, then bundles into dist/
npm run preview    # serves dist/ at http://localhost:4173
```

`dist/` is fully static (relative asset paths), so it can be hosted on any static file host, including from a sub-directory. See [Deploying](#deploying).

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | `W A S D` or arrow keys | Drag on the left half of the screen |
| Aim | Mouse | Drag on the right half of the screen |
| Fire | Hold left click | Fires while aiming |
| Dash (brief invulnerability) | `Space` | **Dash** button |
| Boost (drains energy) | Hold `Shift` | Hold **Boost** |
| Switch weapon | `1`–`4`, `Q` / `E`, mouse wheel | **Swap** button |
| Pause | `Esc` or `P` | Pause button |
| Pick an augment | Click a card or press `1` `2` `3` | Tap a card |

On a player's first deploy, a compact controls reminder sits above the weapon bar for the opening seconds of wave 1 (touch devices see the thumb controls instead).

Menus support `↑` `↓` and `Enter`. In option groups (weapon, difficulty, quality, touch controls) `←` `→` move the selection; on a focused slider the arrow keys change the value. `Esc` steps back one level (see [Input rules](#input-rules)). The game pauses automatically when the window loses focus or the tab is hidden. During the opening cinematic, `Esc`, `Enter` or `Space` skip it (or tap **Skip intro**).

## Opening cinematic

A first launch opens with a ~11-second sequence before the main menu:

1. A boot log types out over a dark facility while the dormant reactor pulses.
2. Power surges outward from the reactor and lights the deck (one brown-out dip, well inside photosensitivity guidance).
3. The title decodes and locks in with a single chromatic tear and scan line.
4. The camera cranes out of the reactor well to an establishing shot of the whole platform over the abyss, then **Start Game** appears and the shot holds until the player continues.

It uses the real arena renderer (the `IntroDirector` in `src/game/intro.ts` scripts the camera and lighting; `ui/screens/IntroSequence.tsx` is the overlay). Details:

- **Skippable at any point**: the **Skip intro** button, `Esc`, `Enter` or `Space`. The lights finish coming up in half a second, then the menu takes over.
- **Shown once**: watching it to the start prompt, or skipping it, sets `introSeen` in the saved profile, so returning players go straight to the menu. Profiles saved by v1.1 load unchanged and simply see it once.
- **Replay** it from **Credits → Replay intro**, or open the game with `?intro`.
- **Reduced motion**: a still title card with the same boot summary and the establishing shot. No camera move, typing, decode, flicker or alarm sweep, and **Start Game** is available immediately.
- **Background tabs**: if the game is opened in a tab that isn't visible, the sequence waits until it is.
- **Audio**: browsers block sound until the first interaction, so the opening normally plays silently. It has a soundscape (reactor hum, boot ticks, the surge, the title landing) that plays when audio is already unlocked, for example when replayed from Credits. The menu theme starts after the sequence.

## Gameplay

- **Waves**: 10 waves. Waves 5 and 10 are boss fights. Enemies arrive through magenta portals away from you, and briefly materialise before they become active. Clearing a wave awards bonus score and XP (more for a flawless wave), plus a supply drop.
- **Enemies**:
  - Hunter Drone: fast melee swarmer.
  - Sentinel: keeps its distance and fires telegraphed shots.
  - Brute: charges with a visible wind-up lane.
  - Wraith: orbits you, dodges your shots and fires bursts.
  - Splitter: bursts into Mites when destroyed.
  - Elites: tougher variants with an amber ring and better loot.
- **Bosses**:
  - Warden (2 phases): charges into a bullet nova, fires fan volleys, sends shockwave rings with safe gaps, and summons adds.
  - Null Sovereign (3 phases): spirals, aimed bursts and gapped rings, then sweeping lasers and proximity mines, then crossed lasers and teleport novas.
  - Every attack is telegraphed. Phase changes clear bullets and grant a short breather.
- **Weapons**:
  - Pulse Rifle: infinite ammo.
  - Scatter Cannon: close-range shards with heavy knockback.
  - Rail Lancer: piercing slugs.
  - Seeker Swarm: homing missiles that burst on impact.
  - Special weapons use ammo. An empty weapon switches back to the Pulse Rifle.
- **Progression**: kills drop data shards (XP). Each level-up offers 3 random augments out of 21, weighted by rarity, and each one changes real stats. The pool covers damage, fire rate, move speed, crit chance and crit damage, hull, shields, dash cooldown, energy, pickup radius, piercing, multishot, lifesteal, dash damage, explosive rounds, a shield-break EMP, ammo capacity, XP gain, and new weapons.
- **Pickups**: repair kits (drop more often when you're hurt), energy cells, ammo caches, data cores (bonus score), rare upgrade chips (a free augment with better odds), and four timed power-ups: Overdrive (2× fire rate), Aegis (invulnerable), Amplifier (2× damage) and Chrono Field (enemies slowed).
- **Scoring**: kill streaks build a combo multiplier of up to ×3. Taking damage resets it.
- **Fairness**: invulnerability frames after hits, collision push-out so you can't be pinned, dashes that pass through enemies and bullets, spawn portals chosen away from you, and caps on hostile bullet counts.

### Persistence (localStorage)

- **Settings**: volumes, mute, screen shake, reduce motion, damage numbers, graphics quality, FPS counter and touch-control mode.
- **Records**: high score, best wave, longest run, victories, kills and deployments.
- **First-run flags**: briefing seen, and opening cinematic seen (`introSeen`, added in v1.2; older profiles default it to `false`).
- **Unlocks**:
  - Scatter Cannon loadout: reach wave 3.
  - Rail Lancer loadout: defeat the Warden.
  - Seeker Swarm loadout: clear wave 8.
  - **Nightmare** difficulty: win once.
- **Continue**: the run is checkpointed at the start of each wave (from wave 2). Continue resumes there with your level, augments, weapons and ammo. Dying or winning clears the checkpoint.

## Visual systems

Everything is drawn procedurally with Canvas 2D. There are no image assets.

- **Layered arena.** Back to front:
  - The abyss beyond the platform rim: parallax structures far below, with blinking warning lights.
  - A parallax reactor sub-level, seen through glass floor panels and the central reactor well.
  - The baked deck: bevelled plates, wear, conduits, painted markings and iris hatches.
  - Scorch decals.
  - Dynamic floor lighting from projectiles, explosions, lasers, pickups and the player.
  - Animated emissives: conduit flow, data pulses, strip lights and portal rings.
  - Ground hazards and telegraphs.
  - Pseudo-3D reactor pillars that lean with the camera, with occasional electrical arcs.
  - Actors and effects.
  - Rim beacons that sweep during boss fights.
  - Drifting haze and light shafts.
- **Combat intensity** drives the mood. Strip lights flicker amber, beacons activate, the reactor shifts toward violet and the colour grade warms as fights escalate.
- **Presentation layer** (`render/vfx.ts`). It reacts to game events but never feeds back into the simulation. It provides:
  - per-weapon muzzle flashes, projectile signatures and impacts;
  - per-enemy death recipes;
  - shield hit, break, reboot and restore cues;
  - dash ribbons with refraction;
  - level-up and pickup bursts;
  - merged damage numbers.
- **Bosses**:
  - Arrivals use a letterbox, a camera lean and pull-back, a light column and converging arcs. The Warden descends; the Null Sovereign assembles ring by ring.
  - Phase changes have their own effects: the Warden sheds armour plates, the Sovereign adds an overclock ring and turns to a red singularity.
  - Every telegraph is drawn from the real collision values, so it shows exactly what will hit.
  - Defeat plays a cracking, shuddering corpse and then a final detonation.
- **Post-processing** (`render/PostFX.ts`):
  - screen-space refraction for shockwaves;
  - a cheap thresholded bloom on a 1/4 and 1/8 resolution copy;
  - an intensity-driven colour grade and vignette;
  - an edge-weighted damage flash and damage-direction arcs;
  - desaturation on pause and death.

  Nothing blurs the full screen.
- **UI**: screen wipes, level-up cards, a boss intro card, HUD bars with damage trails, a rolling score, a combo tier meter, a CRT-collapse defeat and a victory light-ray reveal. See [Interface](#interface).

## Interface

Menus, HUD and overlays share one visual language. Its tokens are defined at the top of `src/index.css`, and every screen is built from the components in `src/ui/components/`.

### Visual system

- **Colour roles**:
  - cyan: interaction, focus and selection;
  - violet: energy and progression;
  - amber: warnings;
  - red: critical and destructive;
  - mint: health and success;
  - magenta: hostile and boss.

  No state relies on colour alone. Selected, available and locked loadouts, card rarity, low and empty ammo, critical hull and a new record also carry a word, an icon or a pip count.
- **Contrast**: on panel surfaces the three text tiers measure at least 13:1, 7:1 and 4.5:1 (WCAG 2 ratio), and every accent colour at least 4.5:1. `src/ui/tokens.test.ts` recomputes these from the stylesheet. This measures the tokens; it is not an accessibility audit.
- **Type**: Oxanium for display text and labels, JetBrains Mono for numbers. Seven steps (display, title, heading, body, small, label, caption), each with its own size, line height, tracking and weight. The root size grows from 16 px to 19 px on large displays.
- **Shape**:
  - Chamfered panels (three corner sizes) with 1 px inset frames, in tones for accent, danger, success and progress.
  - Focus is a 2 px inset cyan ring, because the chamfer's clip-path would clip an outline.
  - Hover brightens the surface and draws an accent bar; pressed scales slightly; disabled fades to 40%.
- **Motion**:
  - Five durations: press 90 ms, hover and focus 140 ms, state change 220 ms, panel entrance 420 ms, reveal 700 ms. Three easing curves.
  - Reduce motion collapses decorative animation. Anything the motion carried (score count-up, card reveals) appears in its final state instead.
- **Layers** (`--z-*`), bottom to top: canvas, HUD, touch controls, in-run overlays (pause, level-up, results), screens, scanlines, screen wipe, error screen.
- **Components**:
  - Controls: Button (four variants, four sizes), Toggle, Slider, Segmented, Badge, Stat, Panel and KeyCap.
  - Layout: ScreenShell, ScreenHeader and ActionBar lay out every screen.
  - WeaponEmblem draws each weapon as the projectile it fires.

### Input rules

- **One gesture, one action.**
  - Holding `Enter` or `Space` activates a control once.
  - A control that has only just appeared ignores the second half of a double-click or double tap. So a double-click on **Reset progress** cannot land on **Erase everything**, and a double-click on **Deploy** cannot skip the briefing.
  - Buttons also ignore repeats within 350 ms.
- **`Esc` steps back one level.**
  - It goes from a sub-screen back to wherever the sub-screen was opened, from a confirmation back to its menu, and from pause back to play.
  - It does nothing on the main menu, during a level-up or on the results screen, so it never starts, restarts or abandons a run.
  - Holding it acts once.
- **Destructive confirmations** (restart, quit to menu, reset progress) open with **Cancel** focused.
- **Arming delays.** Results ignore input for 0.7 s, then focus **Retry** (or **New Run** after a victory). Level-up cards accept input after 0.55 s, and a weapon key still held from the fight never picks one.
- **Focus** returns to the control that opened a screen. Option groups have one tab stop each, and their arrow keys skip locked choices.

### Landing page

The main menu is a full-viewport launcher over the live arena (`ui/screens/MainMenu.tsx`, with its styles under "Landing page" in `src/index.css`).

- **One grid, five areas**:
  - a status bar;
  - the title column, an open stage and the operative record;
  - the footer.

  Spacing and type use `clamp()` against width and height separately. The title also scales with its column through container-query units, so it never wraps or crowds the record.
- **Layouts follow the available space**, not device classes:
  - **Wide (1200 px and up)**: title and actions on the left, the record on the right, and the reactor framed in the open stage between them. On ultrawide screens the composition stops growing at 190vh, about 2050 px for a 1080 px tall window, while the arena keeps running edge to edge.
  - **Mid-width (900 to 1199 px)**: the title column and the record side by side.
  - **Narrow (under 900 px)**: one column with the record under the actions; it scrolls if needed.
  - **Phones on their side**: two compact columns.
  - **Short windows**: the status bar and the optional footer hints go first, then decorative spacing. Text sizes hold.
- **Framing**:
  - The layout reports where its stage is, on resize only. The menu camera (`game/menuFraming.ts`) puts the reactor at the stage's centre, at a zoom sized to it, so the reactor is never cut off at any aspect ratio.
  - A slow drift and a little pointer parallax move the deck's layers against each other. Reduce motion holds a still composition.
  - The reactor stays softly powered while the menu is up.
- **Actions**:
  - **Continue** is the primary action when a checkpoint exists; otherwise **New Run** is.
  - An unavailable Continue reads as an empty slot: legible, but plainly inert.
  - How to Play, Settings and Credits form one strip.
- **Operative record**: everything comes from the saved profile:
  - high score and deployments;
  - best wave, longest run, victories and hostiles;
  - loadout emblems with their lock states, and the next unlock;
  - Nightmare's status and its requirement.
- **Checked by `npm run landing:qa`**:
  - ten viewports from 1280×720 to 2560×1080, plus tablet and 390 px and 320 px phones;
  - three player states;
  - a live-resize pass.

### Responsive layout

- **Checked viewports**: 320×568, 390×844, 430×932, phone landscape 844×390, tablet 768×1024 and 1024×768, 1280×720, 1440×900 at 2×, and 2560×1080.
- **`npm run screens`** captures every important state at each viewport and audits it for:
  - horizontal overflow;
  - controls that leave the viewport;
  - touch targets under 44 px;
  - overlapping controls;
  - truncated labels.
- **Touch**: targets are at least 44×44 px, and screens respect safe-area insets. Screens taller than the viewport scroll, and the loadout keeps **Deploy** in a sticky bar.
- **HUD layout**:
  - Vitals sit top-left, score top-right, and wave status or the boss bar top-centre.
  - Along the bottom: dash readiness, the weapon bar and active power-ups. On touch screens the weapons stack bottom-left, clear of the thumb controls.
  - On narrow screens the boss bar drops to a second row and notices move to the bottom centre.
  - On short landscape phones, banners take the top status slot so nothing covers the middle of the arena.

## Audio

All sound is synthesised at runtime (Web Audio API) and runs through a compressor/limiter.

- **Mix**: each effect has a trim in `MIX` (`src/game/audio/AudioEngine.ts`), set from offline loudness measurements so effects sit in a consistent order at default volumes: rare big events loudest, then heavy impacts, weapons and player feedback, cues and stingers, frequent small sounds, and the interface quietest. `npm run audio:levels` renders every effect, the three music modes and the ambience offline and prints sample peak and K-weighted loudness. **These levels were set and checked by measurement only; they have not been verified by listening.**
- **Readable bosses**: wind-up cues per attack family. The Warden's charge, stomp rumble and volley lock-on, and a pitched lock-on chirp for each Null Sovereign bullet pattern, are separate from laser charge and teleport. Phase changes have their own stinger.
- **Ambience**: a restrained reactor hum (low A, octave, faint fifth and band-passed air) under the opening, the menu and, quietly, combat. It follows the music volume.
- **Behaviour**: nothing plays before the first user gesture (pointer, key or touch). Mute zeroes the master bus, the sliders move it smoothly, and the context is suspended while the tab is hidden and resumed afterwards. If Web Audio is unavailable, the game runs silently.

### Quality and performance

- **Low / Medium / High** presets control resolution, lighting, bloom, refraction, haze, parallax, decals, emitters, shadows and grading.
- An **adaptive governor** (`render/PerfGovernor.ts`) watches frame pacing. When the device drops frames or can't hold about 50 fps, it steps decorative cost down, and steps back up with headroom. It has five levels; the last drops lighting, grading and shadows and renders at 0.6× resolution. It never exceeds the chosen preset and never touches gameplay. If the browser reports a software renderer, it starts conservatively.
- **Reduce motion** follows the OS preference by default and can be toggled in Settings. It removes refraction, zoom punches, camera leans and strobing flashes, collapses decorative UI animation, and replaces the opening cinematic with a still title card. Screen shake stays on its own slider.

## Project structure

```
src/
  game/                 Framework-free engine (no React imports)
    Game.ts             Lifecycle, rAF loop, run state, combat resolution, UI bridge
    Input.ts            Keyboard / mouse / virtual-touch input with cleanup
    Camera.ts           Follow camera, zoom-to-fit, trauma-based screen shake
    SpatialGrid.ts      Broad-phase collision grid
    store.ts            External store read by React (phase + throttled HUD snapshot)
    persistence.ts      Validated localStorage stores (settings, profile, run save)
    constants.ts        Tuning: world size, player base stats, difficulty, quality
    intro.ts            Opening cinematic: camera, lighting and cue timeline (pure, unit-tested)
    menuFraming.ts      Landing-page camera framing of the reactor (pure, unit-tested)
    entities/           Player, Enemy (+ definitions), Projectile, Pickup, Hazard
    systems/            enemyAI, boss, director (wave pacing), waves, combat,
                        pickups, upgrades, weapons
    render/             Renderer (layer orchestration), Arena (generation + floor bake),
                        Environment (abyss, sub-level, emissives, pillars, atmosphere),
                        vfx (event-driven presentation), Effects (pooled particles),
                        Lighting, PostFX, PerfGovernor, sprites, draw/* per actor type
    audio/AudioEngine   Procedural SFX, music sequencer, reactor ambience, mix trims,
                        limiter, offline level measurement
  ui/                   React + Tailwind interface
    components/         Shared controls (Button, Toggle, Slider, Segmented, Badge, Stat, Panel),
                        screen layout (ScreenShell, ScreenHeader, ActionBar), WeaponEmblem, Icon
    screens/            Intro, menu, loadout, briefing, settings, credits, pause, level-up, results
    hud/                HUD and touch controls
    input.ts            Shared input rules (held keys, double-click guard)
  App.tsx               Screen routing; mounts/unmounts the engine
scripts/
  e2e.mjs               Browser end-to-end smoke test (Playwright + local Chrome)
  balance.mjs           Fast-forward bot simulation for difficulty tuning
  perf.mjs              Frame-cost and frame-pacing probe across heavy scenarios
  audio-levels.mjs      Offline loudness and peak report for every sound
  soak.mjs              Repeated intro/run/boss/quit cycles; checks nothing accumulates
  screens.mjs           Screenshot matrix (states × viewports) with a layout audit
  landing-qa.mjs        Landing page at ten viewports and three player states, plus a live resize
```

### Architecture notes

- The engine owns a single `requestAnimationFrame` loop. Frame time is clamped to 100 ms and split into ≤ 1/60 s sub-steps, so movement is frame-rate independent and fast projectiles don't tunnel. Hit-stop and slow-motion are applied on top.
- React never re-renders per frame. Phase changes are pushed immediately, and the HUD snapshot is published at about 12 Hz via `useSyncExternalStore`.
- `Game.mount` / `Game.unmount` are symmetrical and idempotent, so React StrictMode's double-mount can't produce duplicate loops. Listeners, the `ResizeObserver` and the `AudioContext` are all released on unmount.
- Glow is drawn with cached radial-gradient sprites and additive blending instead of `shadowBlur`. The arena floor is baked once per run into an offscreen canvas.
- Projectiles are pooled. Enemies are bucketed in a spatial grid for bullet, contact and separation queries.
- Audio starts only after a user gesture, runs through a compressor/limiter, throttles repeated sounds and caps voices. If Web Audio is unavailable, the game runs silently.
- Errors in the game loop halt the simulation and show a recovery screen. A React error boundary covers the UI.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b` type-check, then production bundle |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint (typescript-eslint + react-hooks) |
| `npm test` | Vitest unit tests (upgrades, waves, persistence incl. v1.1 saves, collision, player, adaptive quality, opening cinematic timeline, landing-page framing, upgrade card text, design-token contrast) |
| `npm run test:e2e` | Browser smoke test; needs `npm run preview` running on port 4173 and a local Chrome (`CHROME_PATH` to override) |
| `npm run balance` | Bot simulation across difficulties; needs the preview server |
| `npm run perf` | Frame cost and pacing per scenario (opening cinematic, menu, heavy combat, bosses); needs the preview server. Flags: `--quality=low\|medium\|high`, `--software` (CPU rasterisation, as a weak-GPU stand-in), `--width --height --dpr`, `--throttle=N` |
| `npm run audio:levels` | Offline peak and loudness report for every effect, music mode and the ambience; needs the preview server |
| `npm run soak` | Cycles intro, run, boss fight and quit through the UI and checks heap, DOM, listeners, loops and caches stay flat; needs the preview server (`-- --cycles=N`) |
| `npm run landing:qa` | Landing page at ten viewports and three player states, plus a live-resize pass. Checks canvas coverage, overflow, page scrolling on desktop sizes, collisions, clipped text and touch targets; writes PNGs, `report.json` and `index.html`. Needs the preview server (`-- --out=DIR --viewports=1440x900,... --states=veteran,continue,first`) |
| `npm run screens` | Captures every important screen at nine viewports and audits each for layout problems; writes PNGs, `report.json` and `index.html`; needs the preview server (`-- --out=DIR --viewports=a,b --chains=first,menu,combat,victory`) |

## Debug mode

Append `?debug` to the URL to expose `window.__shadow` (the `Game` instance) and enable hotkeys during play:

| Key | Effect |
| --- | --- |
| `K` | Kill all non-boss enemies and empty the spawn queue |
| `N` | Skip to the next wave |
| `G` | Toggle god mode |
| `L` | Grant a level-up |
| `H` | Deal 20% damage to the current boss |

Debug mode is off unless the query parameter is present. `?intro` replays the opening cinematic (it combines with `?debug`).

## Deploying

```bash
npm ci
npm run build          # outputs dist/
```

Upload the contents of `dist/` to any static host (Netlify, Vercel static, GitHub Pages, S3/CloudFront, nginx, and so on). Asset paths are relative (`base: './'`), so it also works from a sub-directory such as `https://example.com/games/shadow-protocol/`. No server-side code, environment variables or rewrites are needed. Saves live in the player's `localStorage` for that origin.

To check a build locally the way a host would serve it: `npm run preview`, or any static server pointed at `dist/`.
