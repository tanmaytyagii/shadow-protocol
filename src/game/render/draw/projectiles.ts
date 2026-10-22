import { COLORS } from '../../constants'
import { TAU } from '../../math'
import { inView, type Frame } from '../frame'
import { glowSprite, rgba } from '../sprites'

export function collectProjectileLights(f: Frame): void {
  const L = f.lights
  const list = f.g.projectiles
  for (let i = 0; i < list.length; i++) {
    if (L.full) return
    const p = list[i]
    if (!p.alive || !inView(f.view, p.x, p.y, 80)) continue
    if (p.friendly) {
      // Scatter fires many pellets at once; light every other one.
      if (p.style === 'scatter' && i & 1) continue
      L.add(p.x, p.y, p.style === 'lancer' ? 130 : 66, p.color, p.style === 'lancer' ? 0.38 : 0.2)
    } else {
      L.add(p.x, p.y, 58, COLORS.magenta, 0.2)
    }
  }
}

export function drawProjectiles(f: Frame): void {
  const { ctx, g, t } = f
  const glow = f.q.glow
  const trails = f.q.trails
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (const p of g.projectiles) {
    if (!p.alive) continue
    const lancer = p.style === 'lancer'
    if (!inView(f.view, p.x, p.y, lancer ? 560 : 60)) continue
    const sp = Math.hypot(p.vx, p.vy) || 1
    const ux = p.vx / sp
    const uy = p.vy / sp
    switch (p.style) {
      case 'pulse': {
        if (glow) {
          ctx.globalAlpha = 0.5
          ctx.drawImage(glowSprite(p.color), p.x - 15, p.y - 15, 30, 30)
        }
        const len = trails ? 26 : 14
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.radius * 1.5
        ctx.beginPath()
        ctx.moveTo(p.x - ux * len, p.y - uy * len)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.strokeStyle = p.core
        ctx.lineWidth = p.radius * 0.6
        ctx.beginPath()
        ctx.moveTo(p.x - ux * len * 0.5, p.y - uy * len * 0.5)
        ctx.lineTo(p.x + ux * 2, p.y + uy * 2)
        ctx.stroke()
        break
      }
      case 'scatter': {
        ctx.globalAlpha = 0.75
        ctx.strokeStyle = '#ff9a3c'
        ctx.lineWidth = p.radius * 1.15
        ctx.beginPath()
        ctx.moveTo(p.x - ux * 16, p.y - uy * 16)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.strokeStyle = '#fff1d2'
        ctx.lineWidth = p.radius * 0.55
        ctx.beginPath()
        ctx.moveTo(p.x - ux * 8, p.y - uy * 8)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        if (glow) {
          ctx.globalAlpha = 0.35
          ctx.drawImage(glowSprite(p.color), p.x - 10, p.y - 10, 20, 20)
        }
        break
      }
      case 'lancer': {
        const dx = p.x - p.ox
        const dy = p.y - p.oy
        const d = Math.hypot(dx, dy)
        const L = Math.min(d, trails ? 520 : 140)
        const tx = p.x - ux * L
        const ty = p.y - uy * L
        const g2 = ctx.createLinearGradient(tx, ty, p.x, p.y)
        g2.addColorStop(0, rgba(p.color, 0))
        g2.addColorStop(0.75, rgba(p.color, 0.55))
        g2.addColorStop(1, rgba('#ffffff', 0.95))
        ctx.globalAlpha = 1
        ctx.strokeStyle = g2
        ctx.lineWidth = p.radius * 1.3
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        if (glow) {
          ctx.globalAlpha = 0.7
          ctx.drawImage(glowSprite(p.color, true), p.x - 26, p.y - 26, 52, 52)
        }
        ctx.globalAlpha = 1
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = p.radius * 1.4
        ctx.beginPath()
        ctx.moveTo(p.x - ux * 18, p.y - uy * 18)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        break
      }
      case 'seeker': {
        const flick = 6 + Math.sin(t * 60 + p.x) * 3
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = p.color
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(p.x - ux * 4, p.y - uy * 4)
        ctx.lineTo(p.x - ux * (10 + flick), p.y - uy * (10 + flick))
        ctx.stroke()
        if (glow) {
          ctx.globalAlpha = 0.55
          ctx.drawImage(glowSprite(p.color, true), p.x - ux * 8 - 11, p.y - uy * 8 - 11, 22, 22)
        }
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(Math.atan2(uy, ux))
        ctx.fillStyle = '#d9fff0'
        ctx.beginPath()
        ctx.moveTo(7, 0)
        ctx.lineTo(-5, 3.6)
        ctx.lineTo(-3, 0)
        ctx.lineTo(-5, -3.6)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.restore()
        ctx.globalCompositeOperation = 'lighter'
        break
      }
      case 'needle': {
        const r = p.radius
        if (glow) {
          ctx.globalAlpha = 0.6
          ctx.drawImage(glowSprite(p.color), p.x - r * 3, p.y - r * 3, r * 6, r * 6)
        }
        if (trails) {
          ctx.globalAlpha = 0.3
          ctx.strokeStyle = p.color
          ctx.lineWidth = r * 0.8
          ctx.beginPath()
          ctx.moveTo(p.x - ux * 30, p.y - uy * 30)
          ctx.lineTo(p.x - ux * 12, p.y - uy * 12)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        ctx.strokeStyle = p.color
        ctx.lineWidth = r * 1.2
        ctx.beginPath()
        ctx.moveTo(p.x - ux * 14, p.y - uy * 14)
        ctx.lineTo(p.x + ux * 4, p.y + uy * 4)
        ctx.stroke()
        ctx.strokeStyle = p.core
        ctx.lineWidth = r * 0.5
        ctx.stroke()
        break
      }
      default: {
        // Hostile energy orb: trail, halo, hot core and a pulse ring for readability.
        const r = p.radius
        if (trails) {
          ctx.fillStyle = p.color
          ctx.globalAlpha = 0.32
          ctx.beginPath()
          ctx.arc(p.x - p.vx * 0.025, p.y - p.vy * 0.025, r * 0.8, 0, TAU)
          ctx.fill()
          ctx.globalAlpha = 0.16
          ctx.beginPath()
          ctx.arc(p.x - p.vx * 0.05, p.y - p.vy * 0.05, r * 0.6, 0, TAU)
          ctx.fill()
        }
        if (glow) {
          ctx.globalAlpha = 0.7
          ctx.drawImage(glowSprite(p.color), p.x - r * 3, p.y - r * 3, r * 6, r * 6)
        }
        ctx.globalAlpha = 1
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, TAU)
        ctx.fill()
        ctx.fillStyle = p.core
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 0.5, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 0.22 + 0.14 * Math.sin(t * 12 + p.x * 0.05)
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 1.6, 0, TAU)
        ctx.stroke()
      }
    }
  }
  ctx.lineCap = 'butt'
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}
