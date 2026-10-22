import { clamp } from './math'

/** A region of the view, as fractions of its width and height (0..1). */
export interface MenuStage {
  x: number
  y: number
  w: number
  h: number
}

/** The whole view: used until the landing page reports its open stage. */
export const FULL_STAGE: MenuStage = { x: 0, y: 0, w: 1, h: 1 }

/** On-screen diameter budget for the reactor well and its glow ring, in world units. */
const REACTOR_SPAN = 300

/**
 * Landing-page framing: the zoom that sizes the reactor well to the open part
 * of the layout between the title column and the operative record, and that
 * region's centre in CSS pixels. The reactor fills about 42% of the stage's
 * height and never more than 82% of its width, whatever the window's shape.
 */
export function menuFraming(viewW: number, viewH: number, stage: MenuStage): { cx: number; cy: number; zoom: number } {
  const sw = Math.max(1, stage.w * viewW)
  const sh = Math.max(1, stage.h * viewH)
  return {
    cx: (stage.x + stage.w / 2) * viewW,
    cy: (stage.y + stage.h / 2) * viewH,
    zoom: clamp(Math.min((sh * 0.42) / REACTOR_SPAN, (sw * 0.82) / REACTOR_SPAN), 0.55, 1.45),
  }
}

/** Camera position that puts a world point (the reactor) at a screen point, at a given zoom. */
export function cameraFor(worldX: number, worldY: number, screenX: number, screenY: number, viewW: number, viewH: number, zoom: number): { x: number; y: number } {
  return { x: worldX - (screenX - viewW / 2) / zoom, y: worldY - (screenY - viewH / 2) / zoom }
}

/** Accepts only finite stages that lie inside the view and have some area. */
export function validStage(s: MenuStage | null | undefined): MenuStage | null {
  if (!s) return null
  const ok = [s.x, s.y, s.w, s.h].every(Number.isFinite) && s.w > 0.01 && s.h > 0.01 && s.x >= -0.01 && s.y >= -0.01 && s.x + s.w <= 1.01 && s.y + s.h <= 1.01
  return ok ? s : null
}
