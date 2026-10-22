# Controls

Bindings are defined in `src/game/Input.ts` (gameplay) and in `src/ui/context.ts` and `src/ui/input.ts` (menus). They can't be remapped yet.

## Keyboard and mouse

| Action | Input |
| --- | --- |
| Move | `W` `A` `S` `D` or arrow keys |
| Aim | Mouse |
| Fire | Hold left mouse button |
| Dash (brief invulnerability, passes through enemies and bullets) | `Space` |
| Boost (drains energy) | Hold `Shift` |
| Select weapon slot | `1` `2` `3` `4` |
| Previous / next weapon | `Q` / `E`, or the mouse wheel |
| Pause / resume | `Esc` or `P` |
| Pick an augment | Click a card, or press `1` `2` `3` |

Empty weapons are skipped when cycling. Selecting an empty slot plays a dry-fire click and shows a notice.

## Touch (phones and tablets)

Touch controls appear automatically on touch screens. **Settings → Touch controls** can force them on or off.

| Action | Input |
| --- | --- |
| Move | Drag anywhere on the left half of the screen |
| Aim and fire | Drag anywhere on the right half; it fires while you aim |
| Dash | **Dash** button |
| Boost | Hold **Boost** |
| Next weapon | **Swap** button |
| Pause | Pause button (top-right corner) |
| Pick an augment | Tap a card |

## Menus

| Action | Input |
| --- | --- |
| Move focus | `↑` `↓`, or `Tab` / `Shift`+`Tab` |
| Activate | `Enter` or `Space` |
| Change an option group (weapon, difficulty, quality, touch controls) | `←` `→` |
| Adjust a focused slider | Arrow keys |
| Back one level | `Esc` |
| Skip the opening cinematic | `Esc`, `Enter`, `Space` or **Skip intro** |

`Esc` never starts, restarts or abandons a run: it does nothing on the main menu, during a level-up or on the results screen. Destructive confirmations (restart, quit to menu, reset progress) open with **Cancel** focused.

The game pauses automatically when the window loses focus or the tab is hidden.

## Debug hotkeys

Only active when the page is opened with `?debug` (for example `http://localhost:5173/?debug`). This also exposes the `Game` instance as `window.__shadow` for the browser test scripts.

| Key | Effect |
| --- | --- |
| `K` | Kill all non-boss enemies and empty the spawn queue |
| `N` | Skip to the next wave |
| `G` | Toggle god mode |
| `L` | Grant a level-up |
| `H` | Deal 20% damage to the current boss |
