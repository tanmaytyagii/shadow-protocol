import { COLORS } from '../../constants'
import { PICKUPS, POWERUPS, isPowerUp, type Pickup } from '../../entities/Pickup'
import { TAU } from '../../math'
import { inView, type Frame } from '../frame'
import { glowSprite, rgba } from '../sprites'
import { poly } from './shapes'

type Ctx = CanvasRenderingContext2D

export function collectPickupLights(f: Frame): void {
  for (const pk of f.g.pickups) {
    if (f.lights.full) return
    if (pk.kind === 'xp' || !inView(f.view, pk.x, pk.y, 60)) continue
    f.lights.add(pk.x, pk.y, 70, PICKUPS[pk.kind].color, 0.22)
  }
}

/** Holographic pickups: floor projector ring, floating icon, loot beam for rarities. */
export function drawPickups(f: Frame): void {
  const { ctx, t } = f
  for (const pk of f.g.pickups) {
    if (!inView(f.view, pk.x, pk.y, 40)) continue
    const blinkOff = pk.life < 3 && Math.sin(t * 22) < 0
    const bob = Math.sin(t * 3 + pk.phase) * 2.5
    const color = PICKUPS[pk.kind].color
    const rare = pk.kind === 'chip' || isPowerUp(pk.kind)
    const fade = blinkOff ? 0.35 : 1

    if (pk.kind !== 'xp') {
      ctx.globalAlpha = 0.45 * fade
      ctx.strokeStyle = color
      ctx.lineWidth = 1.2
      ctx.setLineDash([4, 5])
      ctx.lineDashOffset = -t * 12
      ctx.beginPath()
      ctx.arc(pk.x, pk.y, pk.radius * 1.7, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (f.q.glow) {
      ctx.globalCompositeOperation = 'lighter'
      if (rare) {
        const h = 70
        const g = ctx.createLinearGradient(0, pk.y - h, 0, pk.y)
        g.addColorStop(0, rgba(color, 0))
        g.addColorStop(1, rgba(color, 0.3 * fade))
        ctx.globalAlpha = 1
        ctx.fillStyle = g
        ctx.fillRect(pk.x - 6, pk.y - h, 12, h)
      }
      ctx.globalAlpha = (pk.kind === 'xp' ? 0.55 : 0.6) * fade
      const s = pk.radius * (pk.kind === 'xp' ? 5 : 5.5)
      ctx.drawImage(glowSprite(color), pk.x - s / 2, pk.y - 3 - bob - s / 2, s, s)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.globalAlpha = fade
    drawBody(ctx, pk, pk.x, pk.y - 3 - bob, t, color)
    ctx.globalAlpha = 1
  }
}

function drawBody(ctx: Ctx, pk: Pickup, x: number, y: number, t: number, color: string): void {
  const r = pk.radius
  ctx.save()
  ctx.translate(x, y)
  switch (pk.kind) {
    case 'xp':
      ctx.rotate(t * 2 + pk.phase)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.lineTo(r * 0.7, 0)
      ctx.lineTo(0, r)
      ctx.lineTo(-r * 0.7, 0)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#efe6ff'
      ctx.fillRect(-1, -1, 2, 2)
      break
    case 'health':
      ctx.fillStyle = '#062019'
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(-r, -r, r * 2, r * 2, 4)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = color
      ctx.fillRect(-2, -r * 0.6, 4, r * 1.2)
      ctx.fillRect(-r * 0.6, -2, r * 1.2, 4)
      break
    case 'energy':
      ctx.fillStyle = '#06142a'
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      poly(ctx, 0, 0, r, 6, Math.PI / 6)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(2, -r * 0.65)
      ctx.lineTo(-3.5, 1)
      ctx.lineTo(0, 1)
      ctx.lineTo(-2, r * 0.65)
      ctx.lineTo(3.5, -1)
      ctx.lineTo(0, -1)
      ctx.closePath()
      ctx.fill()
      break
    case 'ammo':
      ctx.fillStyle = '#231806'
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(-r, -r * 0.75, r * 2, r * 1.5, 3)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = color
      for (let i = -1; i <= 1; i++) ctx.fillRect(i * 5 - 1.5, -r * 0.45, 3, r * 0.9)
      break
    case 'chip': {
      ctx.rotate(t * 1.2)
      ctx.fillStyle = '#0d1426'
      ctx.strokeStyle = COLORS.white
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(-r, -r, r * 2, r * 2, 3)
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = COLORS.cyan
      ctx.lineWidth = 1.5
      ctx.strokeRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9)
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2)
        ctx.beginPath()
        ctx.moveTo(-r * 0.3, -r)
        ctx.lineTo(-r * 0.3, -r - 4)
        ctx.moveTo(r * 0.3, -r)
        ctx.lineTo(r * 0.3, -r - 4)
        ctx.stroke()
      }
      ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(t * 6)
      ctx.strokeStyle = COLORS.violet
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.9, 0, TAU)
      ctx.stroke()
      break
    }
    case 'core':
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, TAU)
      ctx.stroke()
      ctx.rotate(t * 3)
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 1.3)
      ctx.stroke()
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(0, 0, 2.5, 0, TAU)
      ctx.fill()
      break
    default:
      if (isPowerUp(pk.kind)) {
        const def = POWERUPS[pk.kind]
        ctx.fillStyle = '#0a0f1f'
        ctx.strokeStyle = def.color
        ctx.lineWidth = 2.5
        poly(ctx, 0, 0, r, 6, t)
        ctx.fill()
        ctx.stroke()
        ctx.globalAlpha *= 0.4 + 0.4 * Math.sin(t * 5)
        poly(ctx, 0, 0, r + 6, 6, -t * 0.8)
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = def.color
        ctx.font = '700 13px "Oxanium Variable", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(def.glyph, 0, 1)
      }
  }
  ctx.restore()
}
