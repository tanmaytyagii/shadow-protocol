import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react'

/*
 * Input rules shared by every control, so one gesture is one action.
 */

/**
 * A held Enter or Space auto-repeats, and each repeat activates whichever
 * control has focus, including the one the next screen has just focused: a
 * held key could otherwise run from the menu straight into a run. Holding a
 * key activates a control once.
 */
export function swallowRepeat(e: KeyboardEvent): void {
  if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault()
}

/** Covers the default double-click interval (500 ms on macOS and Windows; touch uses 300 ms). */
const SETTLE_MS = 600

/**
 * The second click of a double-click (or double tap) lands on whatever
 * replaced the control that took the first, such as a confirm's destructive
 * action or the briefing's Deploy. Returns a check that is true for exactly
 * those clicks: a continued click sequence on a control that has only just
 * appeared. Double-clicks on controls already on screen behave as usual.
 */
export function useClickThroughGuard(): (e: MouseEvent) => boolean {
  // Until the mount effect runs, assume the control has only just appeared.
  const shownAt = useRef(Infinity)
  useEffect(() => {
    shownAt.current = performance.now()
  }, [])
  return useCallback((e: MouseEvent) => e.detail > 1 && performance.now() - shownAt.current < SETTLE_MS, [])
}
