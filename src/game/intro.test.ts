import { describe, expect, it } from 'vitest'
import { WORLD_H, WORLD_W } from './constants'
import { INTRO, IntroDirector, establishingZoom, type IntroCueKind } from './intro'

const VIEW = { w: 1440, h: 900, base: 1.125 }

/** Samples the director from 0 to `seconds` at 60 fps, collecting every shot and cue. */
function play(d: IntroDirector, seconds: number, start = 1000) {
  const shots = []
  const cues: { kind: IntroCueKind; index: number; t: number }[] = []
  for (let f = 0; f <= seconds * 60; f++) {
    const now = start + (f * 1000) / 60
    const s = d.update(now, VIEW.base, VIEW.w, VIEW.h)
    shots.push({ t: f / 60, ...s })
    for (const c of d.events) cues.push({ kind: c.kind, index: c.index, t: f / 60 })
  }
  return { shots, cues }
}

describe('IntroDirector', () => {
  it('opens dark and close on the reactor, then settles lit on the whole platform', () => {
    const d = new IntroDirector()
    d.start(1000, false, 6)
    const { shots } = play(d, INTRO.ready + 1)
    const first = shots[0]
    const last = shots[shots.length - 1]
    expect(first.power).toBeLessThan(0.1)
    expect(first.zoom).toBeGreaterThan(VIEW.base * 2)
    expect(Math.hypot(first.x - WORLD_W / 2, first.y - WORLD_H / 2)).toBeLessThan(40)
    expect(last.power).toBe(1)
    expect(last.zoom).toBeCloseTo(establishingZoom(VIEW.w, VIEW.h), 5)
    // The establishing shot really fits the platform.
    expect(VIEW.w / last.zoom).toBeGreaterThanOrEqual(WORLD_W)
    expect(VIEW.h / last.zoom).toBeGreaterThanOrEqual(WORLD_H)
  })

  it('keeps the facility dark through the boot log and lights it at the surge', () => {
    const d = new IntroDirector()
    d.start(0, false, 6)
    const { shots } = play(d, INTRO.surge + 2.5, 0)
    const boot = shots.filter((s) => s.t < INTRO.surge)
    expect(Math.max(...boot.map((s) => s.power))).toBeLessThanOrEqual(0.12)
    const after = shots.filter((s) => s.t > INTRO.surge + 2)
    expect(Math.min(...after.map((s) => s.power))).toBe(1)
  })

  it('pulls the camera back smoothly and monotonically', () => {
    const d = new IntroDirector()
    d.start(0, false, 6)
    const { shots } = play(d, INTRO.wide, 0)
    const pull = shots.filter((s) => s.t >= INTRO.surge + 0.5)
    for (let i = 1; i < pull.length; i++) {
      expect(pull[i].zoom).toBeLessThanOrEqual(pull[i - 1].zoom + 1e-9)
      // No frame-to-frame jump bigger than 2% of the zoom.
      expect(pull[i - 1].zoom / pull[i].zoom).toBeLessThan(1.02)
    }
  })

  it('flickers at most once per second (photosensitivity guard)', () => {
    const d = new IntroDirector()
    d.start(0, false, 6)
    const { shots } = play(d, INTRO.ready, 0)
    // Count reversals of the brightness trend, ignoring sub-1% wobble.
    const reversals: number[] = []
    let dir = 0
    for (let i = 1; i < shots.length; i++) {
      const delta = shots[i].power - shots[i - 1].power
      if (Math.abs(delta) < 0.01) continue
      const sign = Math.sign(delta)
      if (dir !== 0 && sign !== dir) reversals.push(shots[i].t)
      dir = sign
    }
    for (const t of reversals) expect(reversals.filter((r) => r >= t && r < t + 1).length).toBeLessThanOrEqual(2)
  })

  it('fires each cue once, in order, including one per portal', () => {
    const d = new IntroDirector()
    d.start(0, false, 5)
    const { cues } = play(d, INTRO.ready + 0.5, 0)
    const kinds = cues.map((c) => c.kind)
    expect(kinds.filter((k) => k === 'line')).toHaveLength(INTRO.lines.length)
    expect(kinds.filter((k) => k === 'surge')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'title')).toHaveLength(1)
    expect(cues.filter((c) => c.kind === 'portal').map((c) => c.index)).toEqual([0, 1, 2, 3, 4])
    expect(kinds[kinds.length - 1]).toBe('ready')
    for (let i = 1; i < cues.length; i++) expect(cues[i].t).toBeGreaterThanOrEqual(cues[i - 1].t)
  })

  it('drops cues that went stale while the tab was hidden', () => {
    const d = new IntroDirector()
    d.start(0, false, 6)
    d.update(100, VIEW.base, VIEW.w, VIEW.h)
    // Next frame arrives eight seconds later: nothing from the boot log replays.
    d.update(8100, VIEW.base, VIEW.w, VIEW.h)
    expect(d.events.map((c) => c.kind)).not.toContain('line')
    expect(d.events.map((c) => c.kind)).not.toContain('surge')
  })

  it('has a reduced-motion variant with a still camera and no flicker or alarms', () => {
    const d = new IntroDirector()
    d.start(0, true, 6)
    const { shots, cues } = play(d, INTRO.ready + 1, 0)
    const zooms = new Set(shots.map((s) => s.zoom))
    expect(zooms.size).toBe(1)
    expect(shots.every((s) => s.power === 1 && s.alert === 0 && s.x === WORLD_W / 2 && s.y === WORLD_H / 2)).toBe(true)
    expect(cues).toHaveLength(0)
  })

  it('brings the lights up quickly when skipped mid-boot', () => {
    const d = new IntroDirector()
    d.start(0, false, 6)
    d.update(1500, VIEW.base, VIEW.w, VIEW.h)
    expect(d.shot.power).toBeLessThan(0.1)
    d.stop(1500)
    expect(d.active).toBe(false)
    d.update(1700, VIEW.base, VIEW.w, VIEW.h)
    expect(d.shot.power).toBeGreaterThan(0.1)
    expect(d.shot.power).toBeLessThan(1)
    d.update(2100, VIEW.base, VIEW.w, VIEW.h)
    expect(d.shot.power).toBe(1)
    expect(d.events).toHaveLength(0)
  })

  it('is fully lit before it has ever run', () => {
    const d = new IntroDirector()
    expect(d.update(0, VIEW.base, VIEW.w, VIEW.h).power).toBe(1)
    expect(d.active).toBe(false)
  })
})

describe('establishingZoom', () => {
  it('fits the platform on desktop and clamps on narrow phones', () => {
    for (const [w, h] of [
      [1280, 720],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
    ]) {
      const z = establishingZoom(w, h)
      expect(w / z).toBeGreaterThanOrEqual(WORLD_W)
      expect(h / z).toBeGreaterThanOrEqual(WORLD_H)
    }
    expect(establishingZoom(390, 844)).toBe(0.3)
    expect(establishingZoom(844, 390)).toBe(0.3)
  })
})
