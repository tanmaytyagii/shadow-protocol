import type { Camera } from '../Camera'
import { lightSprite } from './sprites'

const MAX_LIGHTS = 256
const MAX_BEAMS = 16

/**
 * Per-frame dynamic floor lighting. Lights are collected into fixed buffers
 * (no allocation) and drawn additively onto the floor before entities, so the
 * environment reacts to gunfire, explosions and bosses.
 */
export class Lighting {
  private readonly xs = new Float32Array(MAX_LIGHTS)
  private readonly ys = new Float32Array(MAX_LIGHTS)
  private readonly rs = new Float32Array(MAX_LIGHTS)
  private readonly as = new Float32Array(MAX_LIGHTS)
  private readonly cs: string[] = new Array<string>(MAX_LIGHTS).fill('#ffffff')
  private readonly beams = Array.from({ length: MAX_BEAMS }, () => ({ x1: 0, y1: 0, x2: 0, y2: 0, w: 0, a: 0, c: '#ffffff' }))
  private n = 0
  private nb = 0
  private cap = 0
  /** Global multiplier, e.g. dimmed during a blackout. */
  level = 1

  begin(cap: number): void {
    this.n = 0
    this.nb = 0
    this.cap = Math.min(MAX_LIGHTS, cap)
  }

  get count(): number {
    return this.n
  }

  get full(): boolean {
    return this.n >= this.cap
  }

  add(x: number, y: number, radius: number, color: string, alpha: number): void {
    if (this.n >= this.cap || alpha < 0.015 || radius < 4) return
    const i = this.n++
    this.xs[i] = x
    this.ys[i] = y
    this.rs[i] = radius
    this.as[i] = alpha
    this.cs[i] = color
  }

  addBeam(x1: number, y1: number, x2: number, y2: number, width: number, color: string, alpha: number): void {
    if (this.nb >= MAX_BEAMS || this.cap === 0) return
    const b = this.beams[this.nb++]
    b.x1 = x1
    b.y1 = y1
    b.x2 = x2
    b.y2 = y2
    b.w = width
    b.a = alpha
    b.c = color
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    if (this.n === 0 && this.nb === 0) return
    ctx.globalCompositeOperation = 'lighter'
    const lvl = this.level
    for (let i = 0; i < this.n; i++) {
      const r = this.rs[i]
      if (!cam.isVisible(this.xs[i], this.ys[i], r)) continue
      ctx.globalAlpha = Math.min(1, this.as[i] * lvl)
      ctx.drawImage(lightSprite(this.cs[i]), this.xs[i] - r, this.ys[i] - r, r * 2, r * 2)
    }
    for (let i = 0; i < this.nb; i++) {
      const b = this.beams[i]
      const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1)
      if (len < 1) continue
      ctx.save()
      ctx.translate((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2)
      ctx.rotate(Math.atan2(b.y2 - b.y1, b.x2 - b.x1))
      ctx.globalAlpha = Math.min(1, b.a * lvl)
      ctx.drawImage(lightSprite(b.c), -len / 2 - b.w, -b.w, len + b.w * 2, b.w * 2)
      ctx.restore()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}
