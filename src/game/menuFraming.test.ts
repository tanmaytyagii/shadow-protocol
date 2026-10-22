import { describe, expect, it } from 'vitest'
import { Camera } from './Camera'
import { FULL_STAGE, cameraFor, menuFraming, validStage } from './menuFraming'

describe('menuFraming', () => {
  it('centres on the stage and sizes the reactor to it', () => {
    const f = menuFraming(1920, 1080, { x: 0.4, y: 0.1, w: 0.3, h: 0.8 })
    expect(f.cx).toBeCloseTo(1920 * 0.55)
    expect(f.cy).toBeCloseTo(1080 * 0.5)
    // 42% of an 864 px stage is about 363 px for a 300-unit span.
    expect(f.zoom).toBeCloseTo((864 * 0.42) / 300, 5)
  })

  it('narrow stages are limited by width, and zoom stays within bounds', () => {
    const narrow = menuFraming(1280, 720, { x: 0.4, y: 0.1, w: 0.2, h: 0.8 })
    expect(narrow.zoom).toBeCloseTo((256 * 0.82) / 300, 5)
    expect(menuFraming(320, 568, { x: 0, y: 0, w: 1, h: 0.2 }).zoom).toBe(0.55)
    expect(menuFraming(5120, 2160, FULL_STAGE).zoom).toBe(1.45)
  })

  it('puts the reactor exactly at the stage centre on screen', () => {
    const cam = new Camera()
    for (const [w, h, stage] of [
      [1440, 900, { x: 0.43, y: 0.12, w: 0.27, h: 0.74 }],
      [2560, 1080, { x: 0.38, y: 0.1, w: 0.25, h: 0.78 }],
      [390, 844, { x: 0, y: 0, w: 1, h: 0.4 }],
    ] as const) {
      cam.setViewport(w, h)
      const f = menuFraming(w, h, stage)
      cam.cine = f.zoom / cam.zoom
      const p = cameraFor(1200, 800, f.cx, f.cy, w, h, cam.renderZoom)
      cam.follow(p.x, p.y, 0, true, false)
      const s = cam.worldToScreen(1200, 800)
      expect(s.x).toBeCloseTo(f.cx, 3)
      expect(s.y).toBeCloseTo(f.cy, 3)
    }
  })

  it('rejects stages that are missing, empty or outside the view', () => {
    expect(validStage(null)).toBeNull()
    expect(validStage({ x: 0.2, y: 0.2, w: 0, h: 0.5 })).toBeNull()
    expect(validStage({ x: 0.2, y: 0.2, w: Number.NaN, h: 0.5 })).toBeNull()
    expect(validStage({ x: 0.8, y: 0.2, w: 0.5, h: 0.5 })).toBeNull()
    expect(validStage({ x: 0.4, y: 0.1, w: 0.3, h: 0.8 })).toEqual({ x: 0.4, y: 0.1, w: 0.3, h: 0.8 })
  })
})
