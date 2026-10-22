import { describe, expect, it } from 'vitest'
import { QUALITY } from '../constants'
import { PerfGovernor } from './PerfGovernor'

/** Feed `seconds` worth of frames at a fixed interval. */
function run(g: PerfGovernor, gapMs: number, seconds: number): void {
  const n = Math.ceil((seconds * 1000) / gapMs)
  for (let i = 0; i < n; i++) g.sample(gapMs)
}

describe('PerfGovernor', () => {
  it('stays at full quality on a steady 60 Hz display', () => {
    const g = new PerfGovernor()
    run(g, 1000 / 60, 30)
    expect(g.level).toBe(0)
  })

  it('leaves high-refresh displays alone while they hold 60+ fps', () => {
    const native = new PerfGovernor()
    run(native, 1000 / 120, 30)
    expect(native.level).toBe(0)
    // A 120 Hz-capable device rendering at ~80 fps is still healthy.
    const partial = new PerfGovernor()
    for (let i = 0; i < 3000; i++) partial.sample(i % 3 ? 8.3 : 12.5)
    expect(partial.level).toBe(0)
  })

  it('treats a sustained 30 fps as constrained and sheds effects', () => {
    const g = new PerfGovernor()
    run(g, 1000 / 30, 10)
    expect(g.level).toBeGreaterThan(0)
  })

  it('steps effects down when frames are dropped, one level per window', () => {
    const g = new PerfGovernor()
    run(g, 1000 / 60, 3)
    // Alternate on-time and dropped frames (~33 ms) — a struggling device.
    for (let i = 0; i < 400; i++) g.sample(i % 2 ? 16.7 : 34)
    expect(g.level).toBeGreaterThanOrEqual(2)
    expect(g.level).toBeLessThanOrEqual(4)
  })

  it('sheds two steps at once when nearly every frame is late', () => {
    const g = new PerfGovernor()
    // One full measurement window (2 s) of 20 fps frames.
    run(g, 50, 2.05)
    expect(g.level).toBe(2)
  })

  it('can start conservatively and climb back with headroom', () => {
    const g = new PerfGovernor()
    g.startAt(3)
    run(g, 1000 / 60, 25)
    expect(g.level).toBeLessThan(3)
  })

  it('recovers once the device has headroom again', () => {
    const g = new PerfGovernor()
    run(g, 1000 / 60, 3)
    for (let i = 0; i < 400; i++) g.sample(i % 2 ? 16.7 : 34)
    const degraded = g.level
    run(g, 1000 / 60, 25)
    expect(g.level).toBeLessThan(degraded)
  })

  it('ignores tab-suspension gaps', () => {
    const g = new PerfGovernor()
    run(g, 1000 / 60, 3)
    for (let i = 0; i < 20; i++) g.sample(2000)
    run(g, 1000 / 60, 3)
    expect(g.level).toBe(0)
  })

  it('only ever reduces decorative cost, never above the chosen preset', () => {
    const g = new PerfGovernor()
    for (let i = 0; i < 2000; i++) g.sample(i % 2 ? 16.7 : 40)
    const q = g.apply(QUALITY.high)
    expect(q.bloom).toBe(false)
    expect(q.distortion).toBe(false)
    expect(q.lights).toBeLessThan(QUALITY.high.lights)
    expect(q.maxParticles).toBe(QUALITY.high.maxParticles)
    expect(g.apply(QUALITY.low).lights).toBe(0)
    expect(g.particleBudget).toBeLessThan(1)
  })
})
