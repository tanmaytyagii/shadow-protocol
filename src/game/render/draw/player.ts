import { COLORS } from '../../constants'
import { TAU, clamp } from '../../math'
import { WEAPONS } from '../../systems/weapons'
import type { Frame } from '../frame'
import { glowSprite, rgba } from '../sprites'
import { playerShape, poly } from './shapes'

type Ctx = CanvasRenderingContext2D

export function collectPlayerLights(f: Frame): void {
  const g = f.g
  const p = g.player
  if (!p.alive || g.phase === 'idle') return
  const pl = g.vfx.player
  f.lights.add(p.x, p.y, 190, COLORS.cyan, 0.24 + pl.muzzle * 0.25)
  if (pl.muzzle > 0.05) {
    const w = WEAPONS[pl.muzzleWeapon]
    f.lights.add(p.x + Math.cos(p.aim) * 30, p.y + Math.sin(p.aim) * 30, 150, w.color, pl.muzzle * 0.5)
  }
}

export function drawPlayer(f: Frame): void {
  const { ctx, g, t } = f
  const p = g.player
  if (!p.alive || g.phase === 'idle') return
  const pl = g.vfx.player
  const r = p.radius
  const glow = f.q.glow

  drawDashRibbon(f)

  const jx = pl.hurt > 0 ? Math.sin(t * 90) * pl.hurt * 2.2 + pl.hurtX * pl.hurt * 3 : 0
  const jy = pl.hurt > 0 ? Math.cos(t * 77) * pl.hurt * 2.2 + pl.hurtY * pl.hurt * 3 : 0
  const x = p.x + jx
  const y = p.y + jy
  const iframes = p.iframes > 0 && !p.dashing
  const bodyAlpha = iframes ? 0.6 + 0.4 * (Math.sin(t * 40) > 0 ? 1 : 0) : 1

  if (glow) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.32
    ctx.drawImage(glowSprite(COLORS.cyan), x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8)
    ctx.globalCompositeOperation = 'source-over'
  }

  // Aim guide.
  const ax = Math.cos(p.aim)
  const ay = Math.sin(p.aim)
  const guide = ctx.createLinearGradient(x + ax * 26, y + ay * 26, x + ax * 150, y + ay * 150)
  guide.addColorStop(0, 'rgba(62,242,255,0.3)')
  guide.addColorStop(1, 'rgba(62,242,255,0)')
  ctx.globalAlpha = 1
  ctx.strokeStyle = guide
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(x + ax * 26, y + ay * 26)
  ctx.lineTo(x + ax * 150, y + ay * 150)
  ctx.stroke()

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(p.aim)
  ctx.globalAlpha = bodyAlpha

  drawThrusters(ctx, f, r)
  drawWeapon(ctx, f, r)

  // Hull.
  playerShape(ctx, r)
  const hull = ctx.createRadialGradient(r * 0.1, 0, 0, 0, 0, r * 1.4)
  hull.addColorStop(0, p.hurtFlash > 0 ? '#5a1626' : '#1d3866')
  hull.addColorStop(0.6, p.hurtFlash > 0 ? '#2a0a14' : '#0d1c38')
  hull.addColorStop(1, '#060d1c')
  ctx.fillStyle = hull
  ctx.fill()
  ctx.strokeStyle = p.hurtFlash > 0 ? COLORS.red : COLORS.cyan
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()
  // Panel lines and wing-tip lights.
  ctx.strokeStyle = 'rgba(157,249,255,0.25)'
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(r * 0.9, 0)
  ctx.lineTo(-r * 0.55, r * 0.55)
  ctx.moveTo(r * 0.9, 0)
  ctx.lineTo(-r * 0.55, -r * 0.55)
  ctx.stroke()
  ctx.fillStyle = COLORS.cyanSoft
  ctx.fillRect(-r * 0.86, r * 0.82, 2.5, 2.5)
  ctx.fillRect(-r * 0.86, -r * 0.82 - 2.5, 2.5, 2.5)
  // Visor.
  ctx.strokeStyle = COLORS.cyanSoft
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(r * 0.12, -r * 0.27)
  ctx.lineTo(r * 0.76, 0)
  ctx.lineTo(r * 0.12, r * 0.27)
  ctx.stroke()
  if (iframes) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 1
    playerShape(ctx, r + 2.5)
    ctx.stroke()
  }
  drawMuzzle(ctx, f, r)
  ctx.restore()

  // Core: pulses, flickers red at low hull.
  const low = p.hp / p.stats.maxHp < 0.3
  const coreColor = low && Math.sin(t * 9) > 0 ? COLORS.red : p.boosting ? COLORS.white : COLORS.cyan
  if (glow) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.7
    ctx.drawImage(glowSprite(coreColor, true), x - 9, y - 9, 18, 18)
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = coreColor
  ctx.beginPath()
  ctx.arc(x, y, 2.6 + Math.sin(t * 8) * 0.6, 0, TAU)
  ctx.fill()

  drawShield(ctx, f, x, y, r)
  drawPowerAuras(ctx, f, x, y, r)
  ctx.globalAlpha = 1
}

function drawDashRibbon(f: Frame): void {
  const { ctx, g } = f
  const trail = g.vfx.player.trail
  if (trail.length < 2) return
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]
    const b = trail[i]
    const k = 1 - b.t / 0.28
    if (k <= 0) continue
    ctx.globalAlpha = k * 0.5
    ctx.strokeStyle = COLORS.cyan
    ctx.lineWidth = 16 * k
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.globalAlpha = k * 0.9
    ctx.strokeStyle = '#e8feff'
    ctx.lineWidth = 4 * k
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
  ctx.globalCompositeOperation = 'source-over'
}

function drawThrusters(ctx: Ctx, f: Frame, r: number): void {
  const p = f.g.player
  const pl = f.g.vfx.player
  const speed = Math.hypot(pl.vx, pl.vy)
  const k = clamp(speed / 300, 0, 1) * (p.boosting ? 1.6 : 1)
  const flick = 0.75 + 0.25 * Math.sin(f.t * 55)
  const len = 4 + k * 12 * flick
  ctx.globalCompositeOperation = 'lighter'
  for (const s of [-1, 1]) {
    const ex = -r * 0.62
    const ey = s * r * 0.3
    const g = ctx.createLinearGradient(ex, ey, ex - len, ey)
    g.addColorStop(0, p.boosting ? 'rgba(255,255,255,0.95)' : 'rgba(157,249,255,0.9)')
    g.addColorStop(1, 'rgba(62,242,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(ex, ey - 2.4)
    ctx.lineTo(ex - len, ey)
    ctx.lineTo(ex, ey + 2.4)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** Distinct weapon hardware for each loadout. */
function drawWeapon(ctx: Ctx, f: Frame, r: number): void {
  const p = f.g.player
  const pl = f.g.vfx.player
  const kick = pl.kick
  const w = WEAPONS[p.current]
  ctx.lineWidth = 1
  switch (p.current) {
    case 'pulse':
      ctx.fillStyle = '#cfefff'
      ctx.fillRect(r * 0.5 - kick, -2, r * 1.05, 4)
      ctx.strokeStyle = w.color
      ctx.strokeRect(r * 1.42 - kick, -3, 3, 6)
      break
    case 'scatter':
      ctx.fillStyle = '#2e2210'
      ctx.fillRect(r * 0.35 - kick, -5, r * 0.95, 10)
      ctx.strokeStyle = w.color
      ctx.strokeRect(r * 0.35 - kick, -5, r * 0.95, 10)
      ctx.fillStyle = '#ffe6b8'
      ctx.fillRect(r * 1.15 - kick, -3.6, r * 0.2, 2.6)
      ctx.fillRect(r * 1.15 - kick, 1, r * 0.2, 2.6)
      if (pl.muzzle > 0) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = rgba(w.color, pl.muzzle * 0.8)
        ctx.fillRect(r * 0.5 - kick, -5, r * 0.5, 10)
        ctx.globalCompositeOperation = 'source-over'
      }
      break
    case 'lancer': {
      ctx.fillStyle = '#251b4a'
      ctx.fillRect(r * 0.3 - kick, -4.6, r * 1.55, 2.4)
      ctx.fillRect(r * 0.3 - kick, 2.2, r * 1.55, 2.4)
      ctx.strokeStyle = w.color
      ctx.strokeRect(r * 0.3 - kick, -4.6, r * 1.55, 9.2)
      // Coils brighten as the next shot charges.
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = rgba(w.color, 0.25 + 0.75 * pl.charge)
        ctx.fillRect(r * (0.55 + i * 0.4) - kick, -5.5, 2.4, 11)
      }
      ctx.globalCompositeOperation = 'source-over'
      break
    }
    case 'seeker':
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#103528'
        ctx.fillRect(r * 0.05, s * r * 0.6 - 3, r * 0.6, 6)
        ctx.strokeStyle = w.color
        ctx.strokeRect(r * 0.05, s * r * 0.6 - 3, r * 0.6, 6)
        if (pl.charge > 0.6) {
          ctx.fillStyle = w.color
          ctx.beginPath()
          ctx.moveTo(r * 0.7, s * r * 0.6)
          ctx.lineTo(r * 0.6, s * r * 0.6 - 2.5)
          ctx.lineTo(r * 0.6, s * r * 0.6 + 2.5)
          ctx.closePath()
          ctx.fill()
        }
      }
      break
  }
}

function drawMuzzle(ctx: Ctx, f: Frame, r: number): void {
  const pl = f.g.vfx.player
  const m = pl.muzzle
  if (m <= 0.02) return
  const w = WEAPONS[pl.muzzleWeapon]
  ctx.globalCompositeOperation = 'lighter'
  const mx = r + 12
  if (pl.muzzleWeapon === 'scatter') {
    const g = ctx.createLinearGradient(mx, 0, mx + 56, 0)
    g.addColorStop(0, rgba('#fff1d2', 0.9 * m))
    g.addColorStop(1, rgba(w.color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(mx - 2, -3)
    ctx.lineTo(mx + 56, -20)
    ctx.lineTo(mx + 56, 20)
    ctx.lineTo(mx - 2, 3)
    ctx.closePath()
    ctx.fill()
  } else if (pl.muzzleWeapon === 'lancer') {
    ctx.strokeStyle = rgba('#f1e9ff', m)
    ctx.lineWidth = 3 * m
    ctx.beginPath()
    ctx.moveTo(mx, 0)
    ctx.lineTo(mx + 150 * m, 0)
    ctx.stroke()
  } else if (pl.muzzleWeapon === 'pulse') {
    ctx.fillStyle = rgba('#e8feff', m)
    ctx.beginPath()
    ctx.arc(mx, 0, 3.5 * m, 0, TAU)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** Segmented shield shell: shows remaining charge, ripples where it is hit. */
function drawShield(ctx: Ctx, f: Frame, x: number, y: number, r: number): void {
  const p = f.g.player
  const pl = f.g.vfx.player
  const t = f.t
  const max = p.stats.maxShield
  const frac = max > 0 ? p.shield / max : 0
  const R = r + 9
  const segs = 8
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  if (frac > 0.005 || pl.shieldBroken > 0) {
    const flicker = pl.shieldBroken > 0 && Math.random() < 0.5 ? 0.2 : 1
    const lit = Math.ceil(frac * segs - 0.001)
    for (let i = 0; i < segs; i++) {
      const a0 = -Math.PI / 2 + (i / segs) * TAU + 0.07
      const a1 = -Math.PI / 2 + ((i + 1) / segs) * TAU - 0.07
      ctx.strokeStyle = i < lit ? rgba(COLORS.cyan, (0.22 + 0.25 * pl.shieldHit) * flicker) : rgba(COLORS.cyan, 0.05)
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(x, y, R, a0, a1)
      ctx.stroke()
    }
  }
  if (pl.shieldHit > 0) {
    // Hex shell flashes, with a bright ripple at the point of impact.
    ctx.globalAlpha = pl.shieldHit * 0.5
    ctx.strokeStyle = COLORS.cyanSoft
    ctx.lineWidth = 1.2
    poly(ctx, x, y, R + 2, 6, t * 0.6)
    ctx.stroke()
    ctx.globalAlpha = pl.shieldHit
    ctx.strokeStyle = '#e8feff'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, R + 1 + (1 - pl.shieldHit) * 6, pl.shieldHitAngle - 0.6, pl.shieldHitAngle + 0.6)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  if (pl.reboot > 0) {
    ctx.strokeStyle = rgba(COLORS.cyan, 0.7 * pl.reboot)
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(x, y, R + 3, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - pl.reboot))
    ctx.stroke()
  }
  if (pl.restored > 0) {
    ctx.strokeStyle = rgba(COLORS.cyanSoft, pl.restored * 0.8)
    ctx.lineWidth = 2
    poly(ctx, x, y, R + 4 + (1 - pl.restored) * 8, 6, -t)
    ctx.stroke()
  }
  if (p.powerUps.aegis > 0) {
    ctx.globalAlpha = 0.5 + 0.25 * Math.sin(t * 8)
    ctx.strokeStyle = COLORS.cyan
    ctx.lineWidth = 3
    poly(ctx, x, y, r + 17, 6, -t)
    ctx.stroke()
    if (f.q.glow) {
      ctx.globalAlpha = 0.22
      ctx.drawImage(glowSprite(COLORS.cyan), x - 52, y - 52, 104, 104)
    }
    ctx.globalAlpha = 1
  }
  ctx.lineCap = 'butt'
  ctx.globalCompositeOperation = 'source-over'
}

function drawPowerAuras(ctx: Ctx, f: Frame, x: number, y: number, r: number): void {
  const p = f.g.player
  const pl = f.g.vfx.player
  const t = f.t
  if (p.powerUps.amplifier > 0 || p.powerUps.overdrive > 0) {
    const c = p.powerUps.amplifier > 0 ? COLORS.magenta : COLORS.amber
    ctx.globalAlpha = 0.65
    ctx.strokeStyle = c
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, r + 4, t * 4, t * 4 + Math.PI * 0.7)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, r + 4, t * 4 + Math.PI, t * 4 + Math.PI * 1.7)
    ctx.stroke()
  }
  if (p.powerUps.chrono > 0) {
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = '#7aa2ff'
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 5])
    ctx.lineDashOffset = t * 6
    ctx.beginPath()
    ctx.arc(x, y, r + 22, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
  }
  if (pl.levelUp > 0) {
    // Rising rings of light after a level-up.
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) {
      const k = (1.2 - pl.levelUp + i * 0.25) % 1.2
      ctx.globalAlpha = (1 - k / 1.2) * 0.6 * Math.min(1, pl.levelUp * 2)
      ctx.strokeStyle = COLORS.violet
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, r + 6 + k * 50, 0, TAU)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.globalAlpha = 1
}
