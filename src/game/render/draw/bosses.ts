import { COLORS } from '../../constants'
import type { Enemy } from '../../entities/Enemy'
import { TAU, clamp } from '../../math'
import type { BossKind } from '../../types'
import { inView, type Frame } from '../frame'
import { glowSprite, rgba } from '../sprites'
import { easeOutBack, poly } from './shapes'

type Ctx = CanvasRenderingContext2D

/** Everything needed to draw a boss model, from a live boss or a corpse. */
interface BossPose {
  kind: BossKind
  x: number
  y: number
  r: number
  angle: number
  phase: number
  attack: string
  at: number
  shots: number
  shotTimer: number
  hitFlash: number
  invuln: number
  /** Arrival progress, 0..1 (1 = fully arrived). */
  spawn: number
  /** Death cracks, 0..1. */
  cracks: number
  jx: number
  jy: number
  phaseFlash: number
}

const SPAWN = 1.8
const WARDEN_LOST_PLATES = [1, 4, 6]

function hash(n: number): number {
  const s = Math.sin(n * 91.7 + 17.3) * 43758.5453
  return s - Math.floor(s)
}

function poseOf(f: Frame, e: Enemy): BossPose {
  const b = e.boss
  const look = f.g.vfx.peek(e)
  return {
    kind: b?.type ?? 'warden',
    x: e.x,
    y: e.y,
    r: e.radius,
    angle: e.angle,
    phase: b?.phase ?? 1,
    attack: b?.attack ?? 'idle',
    at: b?.t ?? 0,
    shots: b?.shots ?? 0,
    shotTimer: b?.shotTimer ?? 1,
    hitFlash: e.hitFlash,
    invuln: e.invuln,
    spawn: e.spawnTimer > 0 ? clamp(1 - e.spawnTimer / SPAWN, 0, 1) : 1,
    cracks: 0,
    jx: look ? look.jolt * look.jx * 4 : 0,
    jy: look ? look.jolt * look.jy * 4 : 0,
    phaseFlash: look?.phaseFlash ?? 0,
  }
}

export function drawBoss(f: Frame, e: Enemy): void {
  const pose = poseOf(f, e)
  if (pose.spawn < 1) drawArrivalColumn(f, pose)
  if (pose.kind === 'warden') drawWarden(f, pose)
  else drawSovereign(f, pose)
}

/** Defeated bosses shudder and crack apart before the final detonation. */
export function drawCorpses(f: Frame): void {
  for (const c of f.g.vfx.corpses) {
    if (c.blown || !inView(f.view, c.x, c.y, c.radius * 3)) continue
    const k = clamp(c.t / c.dur, 0, 1)
    const pose: BossPose = {
      kind: c.kind,
      x: c.x + Math.sin(f.t * 83) * k * 5,
      y: c.y + Math.cos(f.t * 71) * k * 5,
      r: c.radius,
      angle: c.angle + c.t * 0.5,
      phase: c.phase,
      attack: 'idle',
      at: 0,
      shots: 0,
      shotTimer: 1,
      hitFlash: 0,
      invuln: 0,
      spawn: 1,
      cracks: k,
      jx: 0,
      jy: 0,
      phaseFlash: k * 0.5,
    }
    if (c.kind === 'warden') drawWarden(f, pose)
    else drawSovereign(f, pose)
  }
}

function drawArrivalColumn(f: Frame, p: BossPose): void {
  if (!f.q.glow) return
  const ctx = f.ctx
  const k = p.spawn
  const h = 420
  const w = p.r * 2.4 * (1 - k * 0.35)
  const a = 0.45 * (1 - k * 0.6)
  ctx.globalCompositeOperation = 'lighter'
  const g = ctx.createLinearGradient(0, p.y - h, 0, p.y)
  g.addColorStop(0, rgba(COLORS.magenta, 0))
  g.addColorStop(0.7, rgba(COLORS.magenta, a * 0.6))
  g.addColorStop(1, rgba('#ffd6ec', a))
  ctx.fillStyle = g
  ctx.fillRect(p.x - w / 2, p.y - h, w, h)
  ctx.globalAlpha = 0.5 + k * 0.4
  const s = p.r * (3 + k * 2)
  ctx.drawImage(glowSprite(COLORS.magenta, true), p.x - s, p.y - s, s * 2, s * 2)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function drawCracks(ctx: Ctx, r: number, k: number, seed: number): void {
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = rgba('#ffd6ec', 0.4 + 0.6 * k)
  ctx.lineWidth = 1.5 + k * 2.5
  const n = Math.floor(4 + k * 10)
  for (let i = 0; i < n; i++) {
    let a = hash(i + seed) * TAU
    const len = r * (0.5 + 0.8 * hash(i + seed + 7)) * Math.min(1, k * 1.6)
    let x = 0
    let y = 0
    ctx.beginPath()
    ctx.moveTo(0, 0)
    for (let s = 0; s < 3; s++) {
      a += (hash(i * 3 + s + seed) - 0.5) * 0.9
      x += Math.cos(a) * len / 3
      y += Math.sin(a) * len / 3
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function drawOverlays(f: Frame, p: BossPose, r: number): void {
  const ctx = f.ctx
  if (p.cracks > 0) drawCracks(ctx, r, p.cracks, p.kind === 'warden' ? 3 : 11)
  const flash = p.phaseFlash * 0.7 + Math.min(1, p.hitFlash / 0.09) * 0.07
  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = Math.min(1, flash)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.05, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  if (p.invuln > 0.05) {
    // Phase-transition barrier.
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(f.t * 12)
    ctx.strokeStyle = COLORS.cyan
    ctx.lineWidth = 3
    poly(ctx, 0, 0, r + 22, 6, f.t)
    ctx.stroke()
    ctx.globalAlpha = 0.18
    ctx.lineWidth = 1.2
    for (let i = 0; i < 6; i++) {
      const a = f.t + (i / 6) * TAU
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * (r + 22), Math.sin(a) * (r + 22))
      ctx.stroke()
    }
    if (f.q.glow) {
      ctx.globalAlpha = 0.25
      const s = r * 1.8
      ctx.drawImage(glowSprite(COLORS.cyan), -s, -s, s * 2, s * 2)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}

function drawWarden(f: Frame, p: BossPose): void {
  const { ctx, t } = f
  const r = p.r
  const enraged = p.phase >= 2
  const chargeWind = p.attack === 'charge' && p.shots === 0 ? clamp(p.at / (enraged ? 0.65 : 0.9), 0, 1) : 0
  const charging = p.attack === 'charge' && p.shots === 1
  const rising = p.attack === 'stomp' && p.at < 0.75 ? clamp(p.at / 0.75, 0, 1) : 0
  const volley = p.attack === 'volley'
  const arrive = p.spawn
  const scale = (1 + rising * 0.12) * (arrive < 1 ? 1 + Math.pow(1 - arrive, 2) * 1.4 : 1)
  const alpha = arrive < 1 ? clamp(arrive * 1.6, 0, 1) : 1
  const heat = Math.max(chargeWind, charging ? 1 : 0, rising)

  ctx.save()
  ctx.translate(p.x + p.jx, p.y + p.jy)
  ctx.scale(scale, scale)

  if (f.q.glow) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = alpha * (0.16 + heat * 0.28 + p.cracks * 0.5)
    const s = r * 2.3
    ctx.drawImage(glowSprite(enraged ? COLORS.magenta : COLORS.violet), -s, -s, s * 2, s * 2)
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.globalAlpha = alpha

  // Armour plate ring; plates flare outward during a charge wind-up.
  const spin = t * (enraged ? 1.4 : 0.7)
  const push = chargeWind * 7 + (charging ? 4 : 0)
  for (let i = 0; i < 8; i++) {
    const a0 = spin + (i / 8) * TAU + 0.1
    const a1 = spin + ((i + 1) / 8) * TAU - 0.1
    const inner = r + 2 + push
    const outer = r + 15 + push
    if (enraged && WARDEN_LOST_PLATES.includes(i)) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = rgba(COLORS.magenta, alpha * (0.5 + 0.3 * Math.sin(t * 9 + i)))
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, r + 6, a0, a1)
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
      continue
    }
    ctx.beginPath()
    ctx.arc(0, 0, outer, a0, a1)
    ctx.arc(0, 0, inner, a1, a0, true)
    ctx.closePath()
    ctx.fillStyle = '#1c1440'
    ctx.fill()
    ctx.strokeStyle = rgba(heat > 0.4 ? COLORS.magenta : COLORS.violet, 0.85)
    ctx.lineWidth = 1.5
    ctx.stroke()
    const am = (a0 + a1) / 2
    ctx.fillStyle = 'rgba(180,160,255,0.5)'
    ctx.fillRect(Math.cos(am) * (inner + outer) * 0.5 - 1.5, Math.sin(am) * (inner + outer) * 0.5 - 1.5, 3, 3)
  }

  // Hull, lit from the top-left.
  poly(ctx, 0, 0, r, 8, Math.PI / 8)
  const hull = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.2)
  hull.addColorStop(0, '#3a2f6e')
  hull.addColorStop(0.5, '#1d1642')
  hull.addColorStop(1, '#0b0819')
  ctx.fillStyle = hull
  ctx.fill()
  ctx.strokeStyle = COLORS.violet
  ctx.lineWidth = 3
  ctx.stroke()

  // Counter-rotating gear.
  ctx.save()
  ctx.rotate(-spin * 0.6)
  poly(ctx, 0, 0, r * 0.68, 8, Math.PI / 8)
  ctx.strokeStyle = rgba(COLORS.magenta, 0.45)
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#120d2c'
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU
    ctx.save()
    ctx.rotate(a)
    ctx.fillRect(r * 0.66, -2.5, 6, 5)
    ctx.restore()
  }
  ctx.restore()

  // Visor, shoulder cannons and the tracking eye.
  ctx.save()
  ctx.rotate(p.angle)
  ctx.fillStyle = '#06040e'
  ctx.beginPath()
  ctx.roundRect(r * 0.05, -r * 0.2, r * 0.8, r * 0.4, 4)
  ctx.fill()
  ctx.strokeStyle = rgba(COLORS.magenta, 0.55)
  ctx.lineWidth = 1.5
  ctx.stroke()
  for (const s of [-1, 1]) {
    ctx.save()
    ctx.rotate(s * 0.62)
    ctx.fillStyle = '#140f2c'
    ctx.fillRect(r * 0.82, -r * 0.1, r * 0.38, r * 0.2)
    ctx.strokeStyle = rgba(COLORS.violet, 0.8)
    ctx.lineWidth = 1.2
    ctx.strokeRect(r * 0.82, -r * 0.1, r * 0.38, r * 0.2)
    if (volley && f.q.glow) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = alpha * (0.6 + 0.4 * Math.sin(t * 30))
      ctx.drawImage(glowSprite(COLORS.magenta, true), r * 1.2 - 14, -14, 28, 28)
      ctx.globalAlpha = alpha
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.restore()
  }
  const eyeR = r * 0.16 * (1 + (enraged ? 0.15 * Math.sin(t * 14) : 0))
  if (f.q.glow) {
    ctx.globalCompositeOperation = 'lighter'
    const s = eyeR * 3.2 * (1 + heat)
    ctx.drawImage(glowSprite(COLORS.magenta, true), r * 0.45 - s, -s, s * 2, s * 2)
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.save()
  ctx.translate(r * 0.45, 0)
  ctx.scale(1, 1 - chargeWind * 0.55)
  ctx.fillStyle = COLORS.magenta
  ctx.beginPath()
  ctx.arc(0, 0, eyeR, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(eyeR * 0.3, 0, eyeR * 0.4, 0, TAU)
  ctx.fill()
  ctx.restore()
  ctx.restore()

  ctx.globalAlpha = 1
  drawOverlays(f, p, r)
  ctx.restore()
}

function drawSovereign(f: Frame, p: BossPose): void {
  const { ctx, t } = f
  const r = p.r
  const ph = p.phase
  const core = ph >= 3 ? COLORS.red : COLORS.magenta
  const a = p.spawn
  const part = (start: number) => (a >= 1 ? 1 : easeOutBack(clamp((a - start) / 0.28, 0, 1)))
  const ringPart = part(0.1)
  const hexPart = part(0.3)
  const starPart = part(0.48)
  const satPart = part(0.6)
  const corePart = a >= 1 ? 1 : clamp((a - 0.78) / 0.15, 0, 1)
  let scale = 1
  let spinBoost = 0
  if (p.attack === 'teleport' && p.shots === 1) {
    const k = clamp(p.at / 0.7, 0, 1)
    scale = 1 - 0.7 * k
    spinBoost = k * 6
  }
  const lasering = p.attack === 'laser' || p.attack === 'crosslaser'
  const charge = lasering ? (p.shots === 1 ? clamp(p.at / Math.max(0.1, p.shotTimer), 0, 1) : p.shots >= 2 ? 1 : 0) : 0
  const pulse = 0.5 + 0.5 * Math.sin(t * (ph >= 3 ? 10 : 4))

  ctx.save()
  ctx.translate(p.x + p.jx, p.y + p.jy)
  ctx.scale(scale, scale)

  if (f.q.glow) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = (0.18 + charge * 0.3 + p.cracks * 0.5) * Math.max(ringPart, corePart)
    const s = r * 2.6
    ctx.drawImage(glowSprite(ph >= 3 ? COLORS.red : COLORS.violet), -s, -s, s * 2, s * 2)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  // Outer twelve-sided ring with vertex nodes; it fractures in the final phase.
  if (ringPart > 0) {
    ctx.save()
    ctx.rotate(p.angle * (1 + spinBoost))
    ctx.scale(ringPart, ringPart)
    ctx.strokeStyle = rgba(COLORS.violet, 0.9)
    ctx.lineWidth = 3
    const R = r * 1.25
    for (let i = 0; i < 12; i++) {
      if (ph >= 3 && i % 4 === 1) continue
      const a0 = (i / 12) * TAU
      const a1 = ((i + 1) / 12) * TAU
      ctx.beginPath()
      ctx.moveTo(Math.cos(a0) * R, Math.sin(a0) * R)
      ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R)
      ctx.stroke()
    }
    ctx.lineWidth = 2
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU
      ctx.beginPath()
      ctx.moveTo(Math.cos(ang) * R, Math.sin(ang) * R)
      ctx.lineTo(Math.cos(ang) * r * 1.42, Math.sin(ang) * r * 1.42)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = core
    for (let i = 0; i < 12; i += 2) {
      const ang = (i / 12) * TAU
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + i)
      poly(ctx, Math.cos(ang) * R, Math.sin(ang) * R, 3.5, 4, ang)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
  }

  // Overclock ring from phase two.
  if (ph >= 2 && ringPart >= 1) {
    ctx.save()
    ctx.rotate(-p.angle * 2.2)
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = rgba(core, 0.4)
    ctx.lineWidth = 2
    ctx.setLineDash([14, 12])
    ctx.beginPath()
    ctx.arc(0, 0, r * 1.62, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
  }

  // Counter-rotating hull, lit from the top-left.
  if (hexPart > 0) {
    ctx.save()
    ctx.rotate(-p.angle * 1.6)
    ctx.scale(hexPart, hexPart)
    poly(ctx, 0, 0, r, 6, 0)
    ctx.restore()
    const hull = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.1)
    hull.addColorStop(0, '#2e2462')
    hull.addColorStop(0.55, '#150f33')
    hull.addColorStop(1, '#090616')
    ctx.fillStyle = hull
    ctx.fill()
    ctx.strokeStyle = COLORS.violet
    ctx.lineWidth = 3
    ctx.stroke()
  }
  if (starPart > 0) {
    ctx.save()
    ctx.rotate(-p.angle * 1.6)
    ctx.scale(starPart, starPart)
    ctx.strokeStyle = rgba(core, 0.65)
    ctx.lineWidth = 2
    poly(ctx, 0, 0, r * 0.7, 3, 0)
    ctx.stroke()
    poly(ctx, 0, 0, r * 0.7, 3, Math.PI)
    ctx.stroke()
    ctx.restore()
  }

  // Orbiting satellites with fading trails.
  if (satPart > 0) {
    const sats = ph + 2
    const orbit = r * 1.75 * satPart
    for (let i = 0; i < sats; i++) {
      const ang = t * (0.9 + ph * 0.3) + (i / sats) * TAU
      ctx.globalCompositeOperation = 'lighter'
      for (let k = 1; k <= 3; k++) {
        ctx.strokeStyle = rgba(core, 0.18 / k)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(0, 0, orbit, ang - 0.18 * k, ang - 0.18 * (k - 1))
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = core
      poly(ctx, Math.cos(ang) * orbit, Math.sin(ang) * orbit, 6, 4, ang)
      ctx.fill()
    }
  }

  // The core.
  if (corePart > 0) {
    if (f.q.glow) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = (0.42 + pulse * 0.28) * corePart
      const s = r * (1.4 + pulse * 0.4 + charge * 0.8) * corePart
      ctx.drawImage(glowSprite(core, true), -s, -s, s * 2, s * 2)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(0, 0, (r * 0.22 + pulse * 3 + charge * 4) * corePart, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.08 * corePart, 0, TAU)
    ctx.fill()
  }

  drawOverlays(f, p, r)
  ctx.restore()
}
