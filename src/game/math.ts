export const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const rand = (min: number, max: number): number => min + Math.random() * (max - min)

export const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1))

export const chance = (p: number): boolean => Math.random() < p

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = items[i]
    items[i] = items[j]
    items[j] = tmp
  }
  return items
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  return dx * dx + dy * dy
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by))
}

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(from: number, to: number): number {
  let d = (to - from) % TAU
  if (d > Math.PI) d -= TAU
  if (d <= -Math.PI) d += TAU
  return d
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

export function approach(current: number, target: number, delta: number): number {
  if (current < target) return Math.min(current + delta, target)
  return Math.max(current - delta, target)
}

/** Squared distance from point P to segment AB. */
export function segmentPointDist2(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const abx = bx - ax
  const aby = by - ay
  const lenSq = abx * abx + aby * aby
  let t = lenSq > 0 ? ((px - ax) * abx + (py - ay) * aby) / lenSq : 0
  t = clamp(t, 0, 1)
  return dist2(ax + abx * t, ay + aby * t, px, py)
}

/** Deterministic PRNG so arenas can be regenerated from a seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

export function formatScore(n: number): string {
  return Math.floor(n).toLocaleString('en-US')
}
