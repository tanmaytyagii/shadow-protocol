import { describe, expect, it } from 'vitest'
import { TOTAL_WAVES } from '../constants'
import { mulberry32 } from '../math'
import { WAVES, buildSpawnQueue, getWave, waveHpMult } from './waves'

describe('wave definitions', () => {
  it('defines every wave with bosses on 5 and 10', () => {
    expect(WAVES).toHaveLength(TOTAL_WAVES)
    WAVES.forEach((w, i) => expect(w.wave).toBe(i + 1))
    expect(getWave(5).boss).toBe('warden')
    expect(getWave(10).boss).toBe('sovereign')
    expect(WAVES.filter((w) => w.boss)).toHaveLength(2)
  })

  it('escalates enemy counts across regular waves', () => {
    const totals = WAVES.filter((w) => !w.boss).map((w) => Object.values(w.enemies).reduce((a, b) => a + (b ?? 0), 0))
    for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeGreaterThan(totals[i - 1])
  })

  it('scales enemy health with wave number', () => {
    expect(waveHpMult(1)).toBe(1)
    expect(waveHpMult(9)).toBeGreaterThan(waveHpMult(4))
  })

  it('clamps out-of-range lookups', () => {
    expect(getWave(0).wave).toBe(1)
    expect(getWave(99).wave).toBe(TOTAL_WAVES)
  })
})

describe('buildSpawnQueue', () => {
  it('contains exactly the configured enemies', () => {
    const def = getWave(7)
    const queue = buildSpawnQueue(def, 1, mulberry32(1))
    for (const [kind, count] of Object.entries(def.enemies)) {
      expect(queue.filter((k) => k === kind)).toHaveLength(count ?? 0)
    }
  })

  it('applies the difficulty count multiplier', () => {
    const def = getWave(3)
    const base = buildSpawnQueue(def, 1).length
    expect(buildSpawnQueue(def, 1.5).length).toBeGreaterThan(base)
  })

  it('keeps heavy enemies out of the opening stretch', () => {
    for (let seed = 0; seed < 30; seed++) {
      const queue = buildSpawnQueue(getWave(9), 1, mulberry32(seed))
      const opening = queue.slice(0, Math.floor(queue.length * 0.2))
      expect(opening.some((k) => k === 'brute' || k === 'wraith' || k === 'splitter')).toBe(false)
    }
  })

  it('is empty for boss waves', () => {
    expect(buildSpawnQueue(getWave(5))).toEqual([])
  })
})
