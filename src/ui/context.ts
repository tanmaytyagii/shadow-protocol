import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react'
import type { SfxName } from '../game/audio/AudioEngine'
import type { Game } from '../game/Game'
import { profileStore, runSaveStore, settingsStore } from '../game/persistence'
import type { UiState } from '../game/store'

export const GameContext = createContext<Game | null>(null)

export function useGame(): Game {
  const game = useContext(GameContext)
  if (!game) throw new Error('useGame must be used inside <GameContext.Provider>')
  return game
}

/** Subscribe to a slice of the engine's UI state. Selectors must return stable values. */
export function useGameState<T>(selector: (s: UiState) => T): T {
  const game = useGame()
  return useSyncExternalStore(game.store.subscribe, () => selector(game.store.getState()))
}

export const useSettings = () => useSyncExternalStore(settingsStore.subscribe, settingsStore.get)
export const useProfile = () => useSyncExternalStore(profileStore.subscribe, profileStore.get)
export const useRunSave = () => useSyncExternalStore(runSaveStore.subscribe, runSaveStore.get)

export function useSfx(): (name: SfxName) => void {
  const game = useGame()
  return useCallback((name: SfxName) => game.audio.play(name), [game])
}

/**
 * Arrow-key navigation between elements marked `data-menu-item` inside the
 * referenced container, plus an optional Escape handler.
 */
export function useMenuKeys(ref: React.RefObject<HTMLElement | null>, onEscape?: () => void, active = true): void {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      const root = ref.current
      if (!root) return
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault()
        // A held Escape steps back once. Its auto-repeat must not carry on
        // through the next screen (or straight back out of a pause).
        if (!e.repeat) onEscape()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      // A focused slider uses the arrow keys itself.
      const active = document.activeElement
      if (active instanceof HTMLInputElement && active.type === 'range') return
      const items = Array.from(root.querySelectorAll<HTMLElement>('[data-menu-item]:not([disabled])'))
      if (items.length === 0) return
      e.preventDefault()
      const idx = items.indexOf(document.activeElement as HTMLElement)
      const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length
      items[idx === -1 ? 0 : next].focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ref, onEscape, active])
}

export function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
  } catch {
    return false
  }
}
