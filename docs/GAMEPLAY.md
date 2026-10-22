# Game guide

Everything a player can meet in a run, taken from the game's source. Controls are in [CONTROLS.md](CONTROLS.md).

## The run

- **10 waves.** Waves 5 and 10 are boss fights.
- **Spawns.** Enemies arrive through magenta portals away from you, and briefly materialise before they become active.
- **Wave clear.** Clearing a wave awards bonus score and XP (more for a flawless wave), plus a supply drop.
- **Checkpoints.** From wave 2, the run is saved at the start of each wave. **Continue** on the main menu resumes there with your level, augments, weapons and ammo. Dying or winning clears the checkpoint.
- **Difficulty.** *Standard* is the intended experience. *Nightmare* unlocks after your first victory: hostile health ×1.8, damage ×1.75, speed ×1.15, numbers ×1.45, score ×1.75 and experience ×0.7.

## Enemies

| Enemy | Behaviour |
| --- | --- |
| Hunter Drone | Fast melee swarmer. |
| Sentinel | Keeps its distance and fires telegraphed shots. |
| Brute | Charges along a visible wind-up lane. |
| Wraith | Orbits you, dodges your shots and fires bursts. |
| Splitter | Bursts into Mites when destroyed. |
| Elites | Tougher variants of the above with an amber ring and better loot. |

## Bosses

| Boss | Wave | Phases | Attacks |
| --- | --- | --- | --- |
| **Warden** | 5 | 2 | Charges into a bullet nova, fan volleys, shockwave rings with safe gaps, and summoned adds. |
| **Null Sovereign** | 10 | 3 | Spirals, aimed bursts and gapped rings; then sweeping lasers and proximity mines; then crossed lasers and teleport novas. |

Every attack is telegraphed, and each telegraph is drawn from the real collision values, so it shows exactly what will hit. Phase changes clear hostile bullets and give a short breather.

## Weapons

| Slot | Weapon | Notes |
| --- | --- | --- |
| 1 | Pulse Rifle | Rapid-fire plasma bolts. Infinite charge; always equipped. |
| 2 | Scatter Cannon | Six close-range shards per shot with heavy knockback. |
| 3 | Rail Lancer | Hypersonic slug that pierces every target in its path. |
| 4 | Seeker Swarm | Two homing micro-missiles per shot that burst on impact. |

Special weapons use ammo. When one runs dry, the game switches back to the Pulse Rifle.

## Augments and progression

Kills drop data shards (XP). Each level-up pauses the action and offers **3 random augments out of 21**, weighted by rarity (common, rare, epic). Every augment changes real stats:

- **Offence:** Overclocked Rounds (damage), Rapid Cycler (fire rate), Targeting Matrix (crit chance), Exploit Kernel (crit damage), Tungsten Core (piercing), Split Chamber (multishot), Volatile Payload (explosive rounds).
- **Defence:** Reinforced Chassis (hull), Shield Capacitor (shields), Nanite Leech (lifesteal), Static Discharge (an EMP when your shield breaks).
- **Mobility and utility:** Servo Actuators (move speed), Phase Drive (dash cooldown), Phase Blade (dash damage), Fusion Cell (energy), Grav Lens (pickup radius), Ammo Fabricator (ammo capacity), Data Siphon (XP gain).
- **Weapons:** Scatter Cannon, Rail Lancer and Seeker Swarm can also be installed mid-run.

## Pickups

- **Supplies:** repair kits (more frequent when you're hurt), energy cells, ammo caches, data cores (bonus score) and rare upgrade chips (a free augment with better odds).
- **Timed power-ups:** Overdrive (2× fire rate), Aegis (invulnerable), Amplifier (2× damage) and Chrono Field (enemies slowed).

## Scoring

Kill streaks build a combo multiplier of up to ×3. Taking damage resets it.

## Fairness rules

- Invulnerability frames after every hit.
- Collision push-out, so you can't be pinned.
- Dashes pass through enemies and bullets.
- Spawn portals are chosen away from you.
- Hostile bullet counts are capped.

## Unlocks and records

Saved in the browser's `localStorage` for the site that serves the game.

| Unlock | Requirement |
| --- | --- |
| Scatter Cannon loadout | Reach wave 3 |
| Rail Lancer loadout | Defeat the Warden |
| Seeker Swarm loadout | Clear wave 8 |
| Nightmare difficulty | Win once |

Records: high score, best wave, longest run, victories, total kills and deployments. Settings (volumes, mute, screen shake, reduce motion, damage numbers, graphics quality, FPS counter and touch-control mode) are saved separately. **Settings → Reset progress** clears records, unlocks and the saved run, and keeps settings.

## Opening cinematic

A first launch opens with an ~11-second sequence before the main menu:

1. A boot log types out over a dark facility while the dormant reactor pulses.
2. Power surges outward from the reactor and lights the deck (one brown-out dip, well inside photosensitivity guidance).
3. The title decodes and locks in with a single chromatic tear and scan line.
4. The camera cranes out of the reactor well to an establishing shot of the whole platform over the abyss. **Start Game** appears and the shot holds until the player continues.

- **Skippable** at any point with **Skip intro**, `Esc`, `Enter` or `Space`.
- **Shown once.** Watching or skipping it sets `introSeen` in the saved profile. Replay it from **Credits → Replay intro**, or open the game with `?intro`.
- **Reduce motion** replaces it with a still title card, with **Start Game** available immediately.
- **Background tabs:** if the game opens in a hidden tab, the sequence waits until the tab is visible.
- **Audio:** browsers block sound until the first interaction, so the opening normally plays silently. Its soundscape plays when audio is already unlocked, for example when replayed from Credits.

## Graphics quality

- **Low / Medium / High** presets control resolution, lighting, bloom, refraction, haze, parallax, decals, emitters, shadows and colour grading. Touch devices default to Medium.
- **Adaptive quality.** When the device drops frames, the game steps decorative cost down in up to five levels, and steps back up when there is headroom. It never exceeds the chosen preset and never changes gameplay.
- **Reduce motion** follows the OS setting by default. It removes refraction, zoom punches, camera leans and strobing flashes, and collapses decorative interface animation. Screen shake has its own slider.
