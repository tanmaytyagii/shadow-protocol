import { describe, expect, it } from 'vitest'
import { Input } from './Input'

/** Feeds a key press straight to the handler the window listener would call. */
function press(input: Input, code: string): void {
  const handler = (input as unknown as { handleKeyDown: (e: Partial<KeyboardEvent>) => void }).handleKeyDown
  handler({ code, repeat: false, preventDefault: () => {} })
  ;(input as unknown as { handleKeyUp: (e: Partial<KeyboardEvent>) => void }).handleKeyUp({ code })
}

describe('Input weapon cycling', () => {
  it('cycles back with Q and forward with E', () => {
    const input = new Input()
    input.capture = true
    press(input, 'KeyQ')
    expect(input.read().weaponCycle).toBe(-1)
    press(input, 'KeyE')
    expect(input.read().weaponCycle).toBe(1)
  })

  it('cycles forward with the touch Swap button', () => {
    const input = new Input()
    input.capture = true
    input.queueTouchSwap()
    expect(input.read().weaponCycle).toBe(1)
  })

  it('ignores presses while the game is not capturing input', () => {
    const input = new Input()
    press(input, 'KeyE')
    expect(input.read().weaponCycle).toBe(0)
  })
})
