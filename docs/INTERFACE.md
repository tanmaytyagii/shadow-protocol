# Interface and design system

Menus, HUD and overlays share one visual language. Its tokens are defined at the top of `src/index.css`, and every screen is built from the components in `src/ui/components/`.

## Visual system

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

## Input rules

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

## Landing page

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

## Responsive layout

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
