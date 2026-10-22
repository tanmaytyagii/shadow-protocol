import { describe, expect, it } from 'vitest'
import { PLAYER_BASE } from '../constants'
import { mulberry32 } from '../math'
import { UPGRADES, UPGRADE_IDS, baseStats, computeStats, rollUpgrades } from './upgrades'

describe('computeStats', () => {
  it('returns base stats with no upgrades', () => {
    expect(computeStats({})).toEqual(baseStats())
  })

  it('stacks additive and multiplicative upgrades', () => {
    const s = computeStats({ damage: 2, firerate: 1, speed: 2, hp: 1, dash: 2 })
    expect(s.damageMult).toBeCloseTo(1.3)
    expect(s.fireRateMult).toBeCloseTo(1.12)
    expect(s.moveSpeed).toBeCloseTo(PLAYER_BASE.moveSpeed * 1.16)
    expect(s.maxHp).toBe(PLAYER_BASE.maxHp + 25)
    expect(s.dashCooldown).toBeCloseTo(PLAYER_BASE.dashCooldown * 0.85 ** 2)
  })

  it('caps critical chance', () => {
    expect(computeStats({ crit: 50 }).critChance).toBeLessThanOrEqual(0.75)
  })

  it('every non-weapon upgrade changes at least one stat', () => {
    for (const id of UPGRADE_IDS) {
      if (UPGRADES[id].weapon) continue
      expect(computeStats({ [id]: 1 }), id).not.toEqual(baseStats())
    }
  })
})

describe('rollUpgrades', () => {
  it('offers three distinct cards', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 50; i++) {
      const cards = rollUpgrades({ stacks: {}, weapons: ['pulse'] }, 3, 0, rng)
      expect(cards).toHaveLength(3)
      expect(new Set(cards.map((c) => c.id)).size).toBe(3)
    }
  })

  it('never offers maxed upgrades, owned weapons or ammo without a special weapon', () => {
    const rng = mulberry32(7)
    const stacks = { damage: UPGRADES.damage.maxStacks, multishot: UPGRADES.multishot.maxStacks }
    for (let i = 0; i < 200; i++) {
      const ids = rollUpgrades({ stacks, weapons: ['pulse', 'scatter'] }, 3, 0, rng).map((c) => c.id)
      expect(ids).not.toContain('damage')
      expect(ids).not.toContain('multishot')
      expect(ids).not.toContain('weapon_scatter')
    }
    for (let i = 0; i < 200; i++) {
      expect(rollUpgrades({ stacks: {}, weapons: ['pulse'] }, 3, 0, rng).map((c) => c.id)).not.toContain('ammo')
    }
  })

  it('returns fewer cards when the pool is nearly exhausted', () => {
    const stacks = Object.fromEntries(UPGRADE_IDS.map((id) => [id, UPGRADES[id].maxStacks]))
    delete stacks.speed
    const cards = rollUpgrades({ stacks, weapons: ['pulse', 'scatter', 'lancer', 'seeker'] })
    expect(cards.map((c) => c.id)).toEqual(['speed'])
  })

  it('describes the next rank on each card', () => {
    const [card] = rollUpgrades({ stacks: { damage: 2 }, weapons: ['pulse'] }, 1, 0, () => 0)
    expect(card.currentStacks).toBe(card.id === 'damage' ? 2 : 0)
    expect(card.description.length).toBeGreaterThan(10)
  })
})
