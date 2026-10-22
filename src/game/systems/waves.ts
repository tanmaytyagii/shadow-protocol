import { shuffle } from '../math'
import type { BossKind, EnemyKind } from '../types'

export interface WaveDef {
  wave: number
  enemies: Partial<Record<EnemyKind, number>>
  boss?: BossKind
  eliteChance: number
  /** Seconds between spawn groups [min, max]. */
  interval: [number, number]
  group: [number, number]
  maxAlive: number
}

export const WAVES: WaveDef[] = [
  { wave: 1, enemies: { drone: 14 }, eliteChance: 0, interval: [1.3, 1.8], group: [2, 3], maxAlive: 10 },
  { wave: 2, enemies: { drone: 18, sentinel: 5 }, eliteChance: 0.02, interval: [1.2, 1.7], group: [3, 4], maxAlive: 15 },
  { wave: 3, enemies: { drone: 20, sentinel: 7, splitter: 4 }, eliteChance: 0.04, interval: [1.1, 1.6], group: [3, 5], maxAlive: 18 },
  { wave: 4, enemies: { drone: 22, sentinel: 8, splitter: 5, brute: 3 }, eliteChance: 0.06, interval: [1.0, 1.5], group: [3, 5], maxAlive: 21 },
  { wave: 5, enemies: {}, boss: 'warden', eliteChance: 0, interval: [1, 1], group: [1, 1], maxAlive: 10 },
  { wave: 6, enemies: { drone: 24, sentinel: 10, wraith: 5, splitter: 4, brute: 3 }, eliteChance: 0.08, interval: [1.0, 1.4], group: [4, 6], maxAlive: 25 },
  { wave: 7, enemies: { drone: 26, sentinel: 10, wraith: 7, splitter: 6, brute: 4 }, eliteChance: 0.1, interval: [0.95, 1.35], group: [4, 6], maxAlive: 27 },
  { wave: 8, enemies: { drone: 30, sentinel: 12, wraith: 8, splitter: 7, brute: 5 }, eliteChance: 0.12, interval: [0.9, 1.3], group: [4, 6], maxAlive: 29 },
  { wave: 9, enemies: { drone: 34, sentinel: 13, wraith: 10, splitter: 8, brute: 6 }, eliteChance: 0.14, interval: [0.85, 1.2], group: [5, 7], maxAlive: 32 },
  { wave: 10, enemies: {}, boss: 'sovereign', eliteChance: 0, interval: [1, 1], group: [1, 1], maxAlive: 12 },
]

export function getWave(n: number): WaveDef {
  return WAVES[Math.min(WAVES.length, Math.max(1, n)) - 1]
}

/** Health multiplier applied to regular enemies as waves progress. */
export function waveHpMult(wave: number): number {
  return 1 + 0.15 * (wave - 1)
}

const HEAVY: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['brute', 'wraith', 'splitter'])

/**
 * Expands a wave definition into an ordered spawn queue. Heavy enemies are kept
 * out of the opening stretch so each wave ramps up instead of spiking.
 */
export function buildSpawnQueue(def: WaveDef, countMult = 1, rng: () => number = Math.random): EnemyKind[] {
  const light: EnemyKind[] = []
  const heavy: EnemyKind[] = []
  for (const [kind, count] of Object.entries(def.enemies) as [EnemyKind, number][]) {
    const n = Math.max(0, Math.round(count * countMult))
    for (let i = 0; i < n; i++) (HEAVY.has(kind) ? heavy : light).push(kind)
  }
  shuffle(light, rng)
  shuffle(heavy, rng)
  const total = light.length + heavy.length
  const opening = Math.min(light.length, Math.ceil(total * 0.25))
  const queue = light.splice(0, opening)
  const rest = shuffle([...light, ...heavy], rng)
  return queue.concat(rest)
}
