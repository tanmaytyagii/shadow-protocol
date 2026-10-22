# Shadow Protocol 1.3.0

## Full-screen landing page

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

## Interface overhaul (also in 1.3.0)

- **Shared design.** One visual system and one set of components. The loadout, briefing, settings, credits, pause, level-up, results and HUD are all rebuilt on them.
- **One gesture, one action.** Held keys and double-clicks no longer carry through to the next screen.
- **`Esc` steps back one level.** It never starts, restarts or abandons a run.
- **Safer confirmations.** Destructive confirmations open on Cancel.
- **Focus.** It returns to the control that opened a screen.
- **Responsive.** No horizontal overflow, 44 px touch targets and safe-area insets, from 320 px phones to ultrawide.

## Unchanged

- Gameplay, balance, enemy AI, collisions, bosses, damage, progression, audio and the save format.
- Profiles, settings and run saves from v1.2 (and v1.1) load as they are.

## Verification

- `RELEASE.md` lists the exact build, lint, unit, end-to-end, performance, soak and audio results.
- `qa/` holds the before-and-after screenshots and audit reports.
