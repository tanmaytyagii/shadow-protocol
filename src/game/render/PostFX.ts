import { COLORS } from '../constants'
import type { Game } from '../Game'
import { TAU, clamp } from '../math'
import type { Frame } from './frame'
import { makeCanvas, mixHex, rgba } from './sprites'

type Ctx = CanvasRenderingContext2D

/**
 * Screen-space passes after the world is drawn: refraction, bloom, grading,
 * vignette, damage feedback, threat markers and the reticle. Nothing here
 * blurs the full screen; bloom works on a 1/4 and 1/8 resolution copy.
 */
export class PostFX {
  private readonly g: Game
  private bloomA: HTMLCanvasElement | null = null
  private bloomB: HTMLCanvasElement | null = null
  private vignette: CanvasGradient | null = null
  private vignetteKey = ''

  constructor(g: Game) {
    this.g = g
  }

  apply(f: Frame, canvas: HTMLCanvasElement): void {
    const g = this.g
    const ctx = f.ctx
    if (f.q.distortion && !f.reduced) this.distort(ctx, canvas)
    if (f.q.bloom) this.bloom(ctx, canvas, 0.42 + g.vfx.env.intensity * 0.1)

    const dpr = g.dpr
    const w = g.camera.viewW
    const h = g.camera.viewH
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    this.grade(ctx, f, w, h)
    this.flash(ctx, f, w, h)
    this.power(ctx, w, h)
    if (g.phase === 'playing' || g.phase === 'paused' || g.phase === 'levelup') {
      this.indicators(ctx)
      this.offscreen(ctx, f, w, h)
    }
    if (g.phase === 'playing' && g.player.alive && g.input.hasMouse && !g.input.usingTouch) this.reticle(ctx)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  /** Refraction: magnify a disc or ring of the finished frame onto itself. */
  private distort(ctx: Ctx, canvas: HTMLCanvasElement): void {
    const g = this.g
    const list = g.vfx.distortions
    if (list.length === 0) return
    const cam = g.camera
    const z = cam.renderZoom * g.dpr
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    for (const d of list) {
      const k = d.life / d.max
      const sx = (d.x - cam.x - cam.offsetX) * z + canvas.width / 2
      const sy = (d.y - cam.y - cam.offsetY) * z + canvas.height / 2
      const R = d.r * z
      if (R < 6) continue
      const band = d.ring ? Math.max(10, R * 0.1) : 0
      const outer = R + band
      if (sx + outer < 0 || sy + outer < 0 || sx - outer > canvas.width || sy - outer > canvas.height) continue
      const s = 1 + d.strength * k
      ctx.save()
      ctx.beginPath()
      ctx.arc(sx, sy, outer, 0, TAU)
      if (d.ring) ctx.arc(sx, sy, Math.max(0, R - band), 0, TAU, true)
      ctx.clip()
      const src = outer / s
      ctx.drawImage(canvas, sx - src, sy - src, src * 2, src * 2, sx - outer, sy - outer, outer * 2, outer * 2)
      ctx.restore()
    }
  }

  /** Cheap bloom: downsample, square (soft threshold), blur by downsampling again, add back. */
  private bloom(ctx: Ctx, canvas: HTMLCanvasElement, strength: number): void {
    const W = canvas.width
    const H = canvas.height
    const w1 = Math.max(64, Math.round(W / 4))
    const h1 = Math.max(36, Math.round(H / 4))
    const w2 = Math.max(32, Math.round(W / 8))
    const h2 = Math.max(18, Math.round(H / 8))
    if (!this.bloomA || this.bloomA.width !== w1 || this.bloomA.height !== h1) this.bloomA = makeCanvas(w1, h1)
    if (!this.bloomB || this.bloomB.width !== w2 || this.bloomB.height !== h2) this.bloomB = makeCanvas(w2, h2)
    const a = this.bloomA.getContext('2d')
    const b = this.bloomB.getContext('2d')
    if (!a || !b) return
    a.globalCompositeOperation = 'copy'
    a.globalAlpha = 1
    a.imageSmoothingEnabled = true
    a.drawImage(canvas, 0, 0, w1, h1)
    // Squaring twice (x^4) keeps only hot cores, so existing glows aren't doubled.
    a.globalCompositeOperation = 'multiply'
    a.drawImage(this.bloomA, 0, 0)
    a.drawImage(this.bloomA, 0, 0)
    b.globalCompositeOperation = 'copy'
    b.imageSmoothingEnabled = true
    b.drawImage(this.bloomA, 0, 0, w2, h2)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'lighter'
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = strength
    ctx.drawImage(this.bloomB, 0, 0, W, H)
    ctx.globalAlpha = strength * 0.4
    ctx.drawImage(this.bloomA, 0, 0, W, H)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private grade(ctx: Ctx, f: Frame, w: number, h: number): void {
    const g = this.g
    const env = g.vfx.env
    const desat = Math.max(g.vfx.deathFade * 0.75, g.phase === 'paused' ? 0.5 : 0)
    if (desat > 0.01) {
      ctx.globalCompositeOperation = 'saturation'
      ctx.globalAlpha = desat
      ctx.fillStyle = '#808080'
      ctx.fillRect(0, 0, w, h)
    }
    if (f.q.grading) {
      // Cool teal grade at rest, shifting toward violet-magenta in a boss fight.
      ctx.globalCompositeOperation = 'soft-light'
      ctx.globalAlpha = 0.2 + env.intensity * 0.1
      ctx.fillStyle = mixHex('#1f5a8a', '#6a1f5c', env.alert * 0.8)
      ctx.fillRect(0, 0, w, h)
    }
    if (g.player.powerUps.chrono > 0 && g.phase !== 'idle') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(90,120,255,0.07)'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.globalCompositeOperation = 'source-over'
    if (env.blackout > 0.01) {
      ctx.globalAlpha = env.blackout * 0.45
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, w, h)
    }
    const key = `${w}x${h}`
    if (!this.vignette || this.vignetteKey !== key) {
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.hypot(w, h) * 0.55)
      v.addColorStop(0, 'rgba(0,0,0,0)')
      v.addColorStop(1, 'rgba(1,2,8,0.62)')
      this.vignette = v
      this.vignetteKey = key
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = this.vignette
    ctx.fillRect(0, 0, w, h)
  }

  /** Edge-weighted flash: impact feedback without whiting out the playfield. */
  private flash(ctx: Ctx, f: Frame, w: number, h: number): void {
    const g = this.g
    if (g.flashAlpha <= 0.005) return
    const a = f.reduced ? Math.min(0.1, g.flashAlpha) : g.flashAlpha
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.55)
    grad.addColorStop(0, rgba(g.flashColor, a * 0.22))
    grad.addColorStop(1, rgba(g.flashColor, Math.min(0.85, a * 1.6)))
    ctx.globalAlpha = 1
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }

  /**
   * Opening cinematic: darkness that recedes outward from the reactor as the
   * facility powers up. A single gradient fill; nothing when fully powered.
   */
  private power(ctx: Ctx, w: number, h: number): void {
    const g = this.g
    const p = g.intro.shot.power
    if (p >= 0.999) return
    const rc = g.arena.reactor
    const c = g.camera.worldToScreen(rc.x, rc.y)
    const reach = Math.hypot(Math.max(c.x, w - c.x), Math.max(c.y, h - c.y))
    const front = reach * 1.25 * p
    const grad = ctx.createRadialGradient(c.x, c.y, front, c.x, c.y, front + reach * 0.45)
    grad.addColorStop(0, `rgba(1,2,7,${(0.4 * (1 - p)).toFixed(3)})`)
    grad.addColorStop(1, `rgba(1,2,7,${(0.965 * (1 - p * p)).toFixed(3)})`)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }

  /** Arcs around the operative pointing toward where damage came from. */
  private indicators(ctx: Ctx): void {
    const g = this.g
    const list = g.vfx.indicators
    if (list.length === 0 || !g.player.alive) return
    const ps = g.camera.worldToScreen(g.player.x, g.player.y)
    const R = Math.min(g.camera.viewW, g.camera.viewH) * 0.16 + 40
    ctx.lineCap = 'round'
    for (const ind of list) {
      const k = ind.life / ind.max
      const color = ind.heavy ? COLORS.red : COLORS.cyan
      ctx.globalAlpha = k * 0.85
      ctx.strokeStyle = color
      ctx.lineWidth = ind.heavy ? 5 : 3
      ctx.beginPath()
      ctx.arc(ps.x, ps.y, R, ind.angle - 0.32, ind.angle + 0.32)
      ctx.stroke()
      const cx = ps.x + Math.cos(ind.angle) * (R + 12)
      const cy = ps.y + Math.sin(ind.angle) * (R + 12)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(ind.angle) * 8, cy + Math.sin(ind.angle) * 8)
      ctx.lineTo(cx + Math.cos(ind.angle + 2.4) * 6, cy + Math.sin(ind.angle + 2.4) * 6)
      ctx.lineTo(cx + Math.cos(ind.angle - 2.4) * 6, cy + Math.sin(ind.angle - 2.4) * 6)
      ctx.closePath()
      ctx.fill()
    }
    ctx.lineCap = 'butt'
    ctx.globalAlpha = 1
  }

  private offscreen(ctx: Ctx, f: Frame, w: number, h: number): void {
    const g = this.g
    const cam = g.camera
    const margin = 22
    let drawn = 0
    for (const e of g.enemies) {
      if (!e.alive || drawn > 16) continue
      const s = cam.worldToScreen(e.x, e.y)
      if (s.x > -10 && s.x < w + 10 && s.y > -10 && s.y < h + 10) continue
      drawn++
      const a = Math.atan2(s.y - h / 2, s.x - w / 2)
      const x = clamp(s.x, margin, w - margin)
      const y = clamp(s.y, margin + 70, h - margin - 80)
      const dist = Math.hypot(e.x - cam.x, e.y - cam.y)
      const near = clamp(1 - (dist - 600) / 1400, 0.35, 1)
      const size = (e.isBoss ? 15 : e.elite ? 9 : 6.5) * (0.8 + near * 0.3)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(a)
      ctx.globalAlpha = e.isBoss ? 0.75 + 0.25 * Math.sin(f.t * 6) : 0.35 + near * 0.35
      ctx.fillStyle = e.isBoss ? COLORS.magenta : e.elite ? COLORS.amber : COLORS.violet
      ctx.beginPath()
      ctx.moveTo(size, 0)
      ctx.lineTo(-size * 0.7, size * 0.75)
      ctx.lineTo(-size * 0.3, 0)
      ctx.lineTo(-size * 0.7, -size * 0.75)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  private reticle(ctx: Ctx): void {
    const g = this.g
    const p = g.player
    const pl = g.vfx.player
    const x = g.input.mouseX
    const y = g.input.mouseY
    const firing = g.input.mouseDown
    const gap = (firing ? 9 : 6) + pl.muzzle * 3
    ctx.strokeStyle = COLORS.cyan
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4
      ctx.moveTo(x + Math.cos(a) * gap, y + Math.sin(a) * gap)
      ctx.lineTo(x + Math.cos(a) * (gap + 6), y + Math.sin(a) * (gap + 6))
    }
    ctx.stroke()
    ctx.fillStyle = COLORS.white
    ctx.fillRect(x - 1, y - 1, 2, 2)
    if (pl.hitMarker > 0) {
      ctx.globalAlpha = pl.hitMarker
      ctx.strokeStyle = pl.hitCrit ? COLORS.amber : '#ffffff'
      ctx.lineWidth = 2
      const s = 4 + (1 - pl.hitMarker) * 4
      ctx.beginPath()
      ctx.moveTo(x - s - 4, y - s - 4)
      ctx.lineTo(x - s, y - s)
      ctx.moveTo(x + s + 4, y - s - 4)
      ctx.lineTo(x + s, y - s)
      ctx.moveTo(x - s - 4, y + s + 4)
      ctx.lineTo(x - s, y + s)
      ctx.moveTo(x + s + 4, y + s + 4)
      ctx.lineTo(x + s, y + s)
      ctx.stroke()
    }
    // Dash readiness arc.
    const k = p.stats.dashCooldown > 0 ? 1 - p.dashCooldown / p.stats.dashCooldown : 1
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = k >= 1 ? rgba(COLORS.cyan, 0.5) : rgba(COLORS.violet, 0.8)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * k)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}
