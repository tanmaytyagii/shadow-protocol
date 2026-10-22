import type { QualityProfile } from '../constants'
import type { Game } from '../Game'
import type { Lighting } from './Lighting'

/** Visible world-space rectangle for the current frame. */
export interface View {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Per-frame render state shared by every draw module. */
export interface Frame {
  g: Game
  ctx: CanvasRenderingContext2D
  /** Presentation clock in seconds (frozen while paused). */
  t: number
  q: QualityProfile
  view: View
  lights: Lighting
  /** Reduced-motion preference: no distortion, zoom punches or strobing. */
  reduced: boolean
}

export function inView(v: View, x: number, y: number, r: number): boolean {
  return x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1
}
