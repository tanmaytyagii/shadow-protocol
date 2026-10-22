import { describe, expect, it } from 'vitest'
import { UPGRADES, toCard } from '../game/systems/upgrades'
import type { UpgradeId } from '../game/types'
import { splitDescription } from './upgradeText'

describe('splitDescription', () => {
  it('separates the effect from the running total', () => {
    expect(splitDescription('+15% weapon damage. Total: +30%.')).toEqual({ effect: '+15% weapon damage.', total: 'Total: +30%' })
    expect(splitDescription('-15% dash cooldown. Cooldown: 0.83s.')).toEqual({ effect: '-15% dash cooldown.', total: 'Cooldown: 0.83s' })
  })

  it('keeps single-sentence effects whole and drops the weapon slot hint', () => {
    expect(splitDescription('Each kill repairs 2 hull.')).toEqual({ effect: 'Each kill repairs 2 hull.', total: null })
    expect(splitDescription('Acquire the Rail Lancer: hypersonic slugs. [3]').effect).toBe('Acquire the Rail Lancer: hypersonic slugs.')
  })

  it('never loses text from any real upgrade description', () => {
    for (const id of Object.keys(UPGRADES) as UpgradeId[]) {
      for (let stacks = 0; stacks < UPGRADES[id].maxStacks; stacks++) {
        const card = toCard(UPGRADES[id], { [id]: stacks })
        const { effect, total } = splitDescription(card.description)
        expect(effect.length).toBeGreaterThan(0)
        const rebuilt = total ? `${effect} ${total}` : effect
        // Only the trailing period and the "[n]" slot hint may be dropped.
        expect(card.description.replace(/\s*\[\d\]$/, '').replace(/\.$/, '')).toBe(rebuilt.replace(/\.$/, ''))
      }
    }
  })
})
