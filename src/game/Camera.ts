import { WORLD_H, WORLD_W } from './constants'
import { clamp, damp } from './math'

/** How far past the rim the camera may drift, revealing the abyss below. */
const EDGE_MARGIN = 130

export class Camera {
  x = WORLD_W / 2
  y = WORLD_H / 2
  zoom = 1
  viewW = 1
  viewH = 1
  trauma = 0
  shakeX = 0
  shakeY = 0
  /** User screen-shake setting (0..1); scales trauma, kicks and punches. */
  shakeScale = 1
  /** 0 disables zoom punches (reduced motion). */
  motionScale = 1
  /** Directional recoil offset (world units), springs back to rest. */
  kickX = 0
  kickY = 0
  /** Brief zoom-in for heavy events. */
  punch = 0
  /** 0..1 cinematic pull-back (wider framing for boss arrivals). */
  pull = 0
  /** Zoom multiplier driven by the opening cinematic; 1 everywhere else. */
  cine = 1
  private t = 0

  setViewport(w: number, h: number): void {
    this.viewW = Math.max(1, w)
    this.viewH = Math.max(1, h)
    this.zoom = clamp(Math.min(w / 1280, h / 780), 0.55, 1.3)
  }

  /** Visible world size at the current render zoom. */
  get worldW(): number {
    return this.viewW / this.renderZoom
  }

  get worldH(): number {
    return this.viewH / this.renderZoom
  }

  /** Zoom actually used for rendering (includes punches, pull-backs and the opening shot). */
  get renderZoom(): number {
    return this.zoom * (1 + this.punch) * (1 - 0.16 * this.pull) * this.cine
  }

  /** Total presentational offset applied on top of the follow position. */
  get offsetX(): number {
    return this.shakeX + this.kickX
  }

  get offsetY(): number {
    return this.shakeY + this.kickY
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount)
  }

  /** Directional nudge, e.g. weapon recoil or an impact. */
  kick(dx: number, dy: number): void {
    const s = this.shakeScale
    this.kickX = clamp(this.kickX + dx * s, -14, 14)
    this.kickY = clamp(this.kickY + dy * s, -14, 14)
  }

  zoomPunch(amount: number): void {
    this.punch = Math.min(0.12, this.punch + amount * this.motionScale * (0.4 + this.shakeScale * 0.6))
  }

  /**
   * Eases toward a target. Play keeps the view over the platform (`bounded`);
   * the landing page frames the reactor freely, since the abyss beyond the rim
   * is drawn wherever the camera looks.
   */
  follow(tx: number, ty: number, dt: number, snap = false, bounded = true): void {
    const halfW = this.worldW / 2
    const halfH = this.worldH / 2
    const m = EDGE_MARGIN
    // When the view is larger than the world, centre it instead of clamping.
    const cx = !bounded ? tx : this.worldW + m * 2 >= WORLD_W ? WORLD_W / 2 : clamp(tx, halfW - m, WORLD_W - halfW + m)
    const cy = !bounded ? ty : this.worldH + m * 2 >= WORLD_H ? WORLD_H / 2 : clamp(ty, halfH - m, WORLD_H - halfH + m)
    if (snap) {
      this.x = cx
      this.y = cy
    } else {
      this.x = damp(this.x, cx, 7, dt)
      this.y = damp(this.y, cy, 7, dt)
    }
  }

  updateShake(dt: number): void {
    this.t += dt
    this.trauma = Math.max(0, this.trauma - dt * 1.6)
    const s = this.trauma * this.trauma * 22 * this.shakeScale
    // Smooth pseudo-noise keeps the shake from looking like random jitter.
    this.shakeX = s * (Math.sin(this.t * 61.3) * 0.6 + Math.sin(this.t * 23.7 + 1.3) * 0.4)
    this.shakeY = s * (Math.sin(this.t * 53.1 + 2.1) * 0.6 + Math.sin(this.t * 31.9 + 0.4) * 0.4)
    const k = Math.exp(-14 * dt)
    this.kickX *= k
    this.kickY *= k
    this.punch *= Math.exp(-7 * dt)
  }

  /** World coordinate under a CSS-pixel screen point. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const z = this.renderZoom
    return {
      x: (sx - this.viewW / 2) / z + this.x,
      y: (sy - this.viewH / 2) / z + this.y,
    }
  }

  /** CSS-pixel screen position of a world point. */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const z = this.renderZoom
    return {
      x: (wx - this.x - this.offsetX) * z + this.viewW / 2,
      y: (wy - this.y - this.offsetY) * z + this.viewH / 2,
    }
  }

  isVisible(x: number, y: number, r: number): boolean {
    const hw = this.worldW / 2 + r + 40
    const hh = this.worldH / 2 + r + 40
    return Math.abs(x - this.x) < hw && Math.abs(y - this.y) < hh
  }
}
