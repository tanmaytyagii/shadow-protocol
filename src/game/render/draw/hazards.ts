import { COLORS, WORLD_H, WORLD_W } from '../../constants'
import type { LaserHazard } from '../../entities/Hazard'
import { TAU, angleDiff, clamp } from '../../math'
import { BRUTE, SENTINEL } from '../../systems/enemyAI'
import { inView, type Frame } from '../frame'
import { glowSprite, rgba } from '../sprites'

type Ctx = CanvasRenderingContext2D

/** Distance along a ray from (x, y) at `angle` until it leaves the arena. */
function rayToWall(x: number, y: number, angle: number, max: number): number {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let t = max
  if (dx > 1e-6) t = Math.min(t, (WORLD_W - x) / dx)
  else if (dx < -1e-6) t = Math.min(t, -x / dx)
  if (dy > 1e-6) t = Math.min(t, (WORLD_H - y) / dy)
  else if (dy < -1e-6) t = Math.min(t, -y / dy)
  return Math.max(0, t)
}

/** Mines and expanding shockwave rings, drawn on the deck. */
export function drawGroundHazards(f: Frame): void {
  const { ctx, t, g } = f
  for (const h of g.hazards) {
    if (h.kind === 'mine') {
      if (!inView(f.view, h.x, h.y, h.radius)) continue
      const k = clamp(h.t / h.fuse, 0, 1)
      const urgent = k > 0.8
      const blink = Math.sin(t * (10 + k * 34)) > 0
      // True blast radius, filling as the fuse burns.
      ctx.fillStyle = rgba(COLORS.magenta, 0.05 + 0.13 * k)
      ctx.beginPath()
      ctx.arc(h.x, h.y, h.radius * (0.3 + 0.7 * k), 0, TAU)
      ctx.fill()
      ctx.strokeStyle = rgba(COLORS.magenta, 0.5 + (blink ? 0.35 : 0) + (urgent ? 0.15 : 0))
      ctx.lineWidth = urgent ? 2.5 : 1.8
      ctx.setLineDash([10, 8])
      ctx.lineDashOffset = -t * 40
      ctx.beginPath()
      ctx.arc(h.x, h.y, h.radius, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      // Countdown arc.
      ctx.strokeStyle = rgba('#ffd6ec', 0.85)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(h.x, h.y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * k)
      ctx.stroke()
      // Spinning mine body.
      ctx.save()
      ctx.translate(h.x, h.y)
      ctx.rotate(t * (4 + k * 10))
      ctx.fillStyle = '#16102c'
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU
        const rr = i % 2 ? 7 : 11
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = COLORS.magenta
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
      ctx.globalCompositeOperation = 'lighter'
      if (f.q.glow) {
        ctx.globalAlpha = blink ? 0.9 : 0.45
        ctx.drawImage(glowSprite(COLORS.magenta, true), h.x - 16, h.y - 16, 32, 32)
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = blink ? '#ffffff' : COLORS.magenta
      ctx.beginPath()
      ctx.arc(h.x, h.y, 3.5, 0, TAU)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    } else if (h.kind === 'ring') {
      const seg = 96
      const safe = (a: number) => h.gaps.some((gap) => Math.abs(angleDiff(gap, a)) < h.gapWidth / 2)
      ctx.globalCompositeOperation = 'lighter'
      // Layered wall: soft halo, collision band, hot core.
      for (const [width, alpha, color] of [
        [h.thickness * 2.4, 0.1, COLORS.magenta],
        [h.thickness, 0.5, COLORS.magenta],
        [3, 0.95, '#ffe1f0'],
      ] as [number, number, string][]) {
        ctx.globalAlpha = alpha
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.beginPath()
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * TAU
          const a1 = ((i + 1) / seg) * TAU
          if (safe((a0 + a1) / 2)) continue
          ctx.moveTo(h.x + Math.cos(a0) * h.radius, h.y + Math.sin(a0) * h.radius)
          ctx.arc(h.x, h.y, h.radius, a0, a1)
        }
        ctx.stroke()
      }
      // Bright caps either side of each safe gap.
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
      for (const gap of h.gaps) {
        for (const side of [-1, 1]) {
          const a = gap + (side * h.gapWidth) / 2
          const c = Math.cos(a)
          const s = Math.sin(a)
          ctx.beginPath()
          ctx.moveTo(h.x + c * (h.radius - h.thickness), h.y + s * (h.radius - h.thickness))
          ctx.lineTo(h.x + c * (h.radius + h.thickness), h.y + s * (h.radius + h.thickness))
          ctx.stroke()
        }
      }
      ctx.globalCompositeOperation = 'source-over'
    }
  }
}

function lane(ctx: Ctx, x: number, y: number, dx: number, dy: number, len: number, width: number, k: number, t: number): void {
  const ang = Math.atan2(dy, dx)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.fillStyle = rgba(COLORS.magenta, 0.07 + 0.06 * k)
  ctx.fillRect(0, -width / 2, len, width)
  // Commitment fill: reaches the end of the lane exactly when the charge launches.
  const g = ctx.createLinearGradient(0, 0, len * k, 0)
  g.addColorStop(0, rgba(COLORS.magenta, 0.05))
  g.addColorStop(1, rgba(COLORS.magenta, 0.28))
  ctx.fillStyle = g
  ctx.fillRect(0, -width / 2, len * k, width)
  ctx.strokeStyle = rgba(COLORS.magenta, 0.55 + 0.35 * Math.abs(Math.sin(t * 18)))
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, -width / 2)
  ctx.lineTo(len, -width / 2)
  ctx.moveTo(0, width / 2)
  ctx.lineTo(len, width / 2)
  ctx.stroke()
  // Chevrons flowing toward the target.
  ctx.strokeStyle = rgba('#ffd6ec', 0.55)
  ctx.lineWidth = 2
  const step = 46
  const off = (t * 160) % step
  for (let d = off; d < len - 10; d += step) {
    ctx.beginPath()
    ctx.moveTo(d - 8, -width * 0.28)
    ctx.lineTo(d, 0)
    ctx.lineTo(d - 8, width * 0.28)
    ctx.stroke()
  }
  ctx.restore()
}

/** Attack wind-ups: charge lanes, stomp rings, teleport targets, sentinel sight lines. */
export function drawTelegraphs(f: Frame): void {
  const { ctx, t, g } = f
  for (const e of g.enemies) {
    if (!e.active) continue
    if (e.kind === 'brute' && e.state === BRUTE.windup) {
      lane(ctx, e.x, e.y, e.lockX, e.lockY, 340, e.radius * 1.6, 1 - e.stateTimer / 0.75, t)
      continue
    }
    const b = e.boss
    if (b && b.type === 'warden' && b.attack === 'charge' && b.shots === 0) {
      lane(ctx, e.x, e.y, b.dirX, b.dirY, 820, e.radius * 2, clamp(b.t / (b.phase >= 2 ? 0.65 : 0.9), 0, 1), t)
      continue
    }
    if (b && b.type === 'warden' && b.attack === 'stomp' && b.t < 0.75) {
      const k = clamp(b.t / 0.75, 0, 1)
      // Target ring closes on the hull exactly at impact.
      const rr = e.radius + 170 * (1 - k)
      ctx.strokeStyle = rgba(COLORS.magenta, 0.35 + 0.5 * k)
      ctx.lineWidth = 2 + k * 3
      ctx.beginPath()
      ctx.arc(e.x, e.y, rr, 0, TAU)
      ctx.stroke()
      ctx.fillStyle = rgba(COLORS.magenta, 0.06 * k)
      ctx.beginPath()
      ctx.arc(e.x, e.y, rr, 0, TAU)
      ctx.fill()
      continue
    }
    if (b && b.type === 'sovereign' && b.attack === 'teleport' && b.shots === 1) {
      const k = clamp(b.t / 0.7, 0, 1)
      ctx.strokeStyle = rgba(COLORS.magenta, 0.3 + 0.5 * k)
      ctx.lineWidth = 3
      ctx.setLineDash([12, 10])
      ctx.lineDashOffset = t * 60
      ctx.beginPath()
      ctx.arc(b.teleportX, b.teleportY, e.radius * (1.6 - k * 0.6), 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = rgba(COLORS.violet, 0.5)
      ctx.lineWidth = 1.5
      for (let i = 0; i < 3; i++) {
        const a = t * 3 + (i / 3) * TAU
        ctx.beginPath()
        ctx.arc(b.teleportX, b.teleportY, e.radius * (0.6 + k * 0.4), a, a + 1.2)
        ctx.stroke()
      }
      if (f.q.glow) {
        ctx.globalAlpha = 0.3 + 0.5 * k
        const s = e.radius * 1.5
        ctx.drawImage(glowSprite(COLORS.magenta), b.teleportX - s, b.teleportY - s, s * 2, s * 2)
        ctx.globalAlpha = 1
      }
      ctx.globalCompositeOperation = 'source-over'
      continue
    }
    if (e.kind === 'sentinel' && e.state === SENTINEL.aim) {
      const p = g.player
      const k = clamp(1 - e.burst / 0.5, 0, 1)
      ctx.strokeStyle = rgba(COLORS.magenta, 0.2 + 0.45 * k)
      ctx.lineWidth = 1 + k
      ctx.setLineDash([6, 8])
      ctx.lineDashOffset = -t * 50
      ctx.beginPath()
      ctx.moveTo(e.x, e.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = rgba(COLORS.magenta, 0.5 * k)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, 26 - k * 8, 0, TAU)
      ctx.stroke()
    }
  }
}

function drawLaserTelegraph(f: Frame, h: LaserHazard, len: number): void {
  const { ctx, t } = f
  const ox = h.owner.x
  const oy = h.owner.y
  const k = clamp(h.t / h.telegraph, 0, 1)
  ctx.save()
  ctx.translate(ox, oy)
  ctx.rotate(h.angle)
  // Danger band at the true beam width.
  ctx.fillStyle = rgba(COLORS.magenta, 0.05 + 0.08 * k)
  ctx.fillRect(0, -h.width / 2, len, h.width)
  ctx.globalAlpha = 0.35 + 0.5 * k * (Math.sin(t * 30) > 0 ? 1 : 0.55)
  ctx.strokeStyle = COLORS.magenta
  ctx.lineWidth = 1.5 + k * 2
  ctx.setLineDash([18, 12])
  ctx.lineDashOffset = -t * (200 + k * 400)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(len, 0)
  ctx.stroke()
  ctx.setLineDash([])
  // Chevrons point the way the beam will sweep.
  const dir = Math.sign(h.angularVel) || 1
  ctx.lineWidth = 2
  for (let d = 120; d < Math.min(len, 1100); d += 130) {
    ctx.beginPath()
    ctx.moveTo(d - 8, 0)
    ctx.lineTo(d, dir * 14)
    ctx.lineTo(d + 8, 0)
    ctx.stroke()
  }
  ctx.restore()
  ctx.globalAlpha = 1
  if (f.q.glow) {
    // Emitter gathering charge.
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.4 + 0.6 * k
    const s = 18 + k * 34
    const ex = ox + Math.cos(h.angle) * h.owner.radius
    const ey = oy + Math.sin(h.angle) * h.owner.radius
    ctx.drawImage(glowSprite(COLORS.magenta, true), ex - s, ey - s, s * 2, s * 2)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}

export function drawLasers(f: Frame): void {
  const { ctx, t, g } = f
  for (const h of g.hazards) {
    if (h.kind !== 'laser' || !h.owner.alive) continue
    const len = rayToWall(h.owner.x, h.owner.y, h.angle, h.length)
    if (h.t < h.telegraph) {
      drawLaserTelegraph(f, h, len)
      continue
    }
    const ox = h.owner.x
    const oy = h.owner.y
    const ex = ox + Math.cos(h.angle) * len
    const ey = oy + Math.sin(h.angle) * len
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    const flicker = 0.85 + 0.15 * Math.sin(t * 60)
    const wobble = 1 + 0.08 * Math.sin(t * 47)
    for (const [w, a, c] of [
      [h.width * 2.8, 0.1, COLORS.magenta],
      [h.width * wobble, 0.5, COLORS.magenta],
      [h.width * 0.55, 0.75, '#ff9fd0'],
      [h.width * 0.22, 1, '#fff2fa'],
    ] as [number, number, string][]) {
      ctx.globalAlpha = a * flicker
      ctx.strokeStyle = c
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ex, ey)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
    if (f.q.glow) {
      ctx.globalAlpha = 0.9
      const s = 60
      ctx.drawImage(glowSprite(COLORS.magenta, true), ox + Math.cos(h.angle) * h.owner.radius - s, oy + Math.sin(h.angle) * h.owner.radius - s, s * 2, s * 2)
      if (inView(f.view, ex, ey, 60)) {
        ctx.globalAlpha = 0.8 * flicker
        ctx.drawImage(glowSprite('#ffd6ec', true), ex - 40, ey - 40, 80, 80)
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    if (inView(f.view, ex, ey, 40) && Math.random() < 0.5) {
      g.fx.sparks(ex, ey, '#ffd6ec', 2, 260, h.angle + Math.PI, 1.6, 0.2)
    }
  }
}

export function collectLaserLights(f: Frame): void {
  for (const h of f.g.hazards) {
    if (h.kind !== 'laser' || !h.owner.alive) continue
    const len = rayToWall(h.owner.x, h.owner.y, h.angle, h.length)
    const ex = h.owner.x + Math.cos(h.angle) * len
    const ey = h.owner.y + Math.sin(h.angle) * len
    const active = h.t >= h.telegraph
    f.lights.addBeam(h.owner.x, h.owner.y, ex, ey, active ? 90 : 30, COLORS.magenta, active ? 0.55 : 0.12 * (h.t / h.telegraph))
  }
}
