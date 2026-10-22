import { TAU } from '../../math'
import { PKind } from '../Effects'
import { inView, type Frame } from '../frame'
import { flareSprite, glowSprite, hexToRgb, scorchSprite, smokeSprite, starSprite } from '../sprites'
import { playerShape, wraithShape } from './shapes'

export function collectParticleLights(f: Frame): void {
  const L = f.lights
  for (const p of f.g.fx.particles) {
    if (L.full) return
    if (!p.alive || p.light <= 0) continue
    const k = p.life / p.max
    L.add(p.x, p.y, p.light, p.color, p.alpha * k)
  }
}

/** Scorch marks on the deck, with a fading hot rim. */
export function drawDecals(f: Frame): void {
  const { ctx, g } = f
  const decals = g.fx.decals
  if (decals.length === 0) return
  const scorch = scorchSprite()
  for (const d of decals) {
    if (!inView(f.view, d.x, d.y, d.r * 1.5)) continue
    const a = Math.min(1, d.life / 2)
    ctx.save()
    ctx.translate(d.x, d.y)
    ctx.rotate(d.rot)
    ctx.globalAlpha = a * 0.9
    ctx.drawImage(scorch, -d.r * 1.1, -d.r * 1.1, d.r * 2.2, d.r * 2.2)
    const age = d.max - d.life
    if (age < 0.9 && f.q.glow) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = ((0.9 - age) / 0.9) * 0.55
      ctx.drawImage(glowSprite(d.color), -d.r * 0.9, -d.r * 0.9, d.r * 1.8, d.r * 1.8)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

export function drawGhosts(f: Frame): void {
  const { ctx, g } = f
  if (g.fx.ghosts.length === 0) return
  ctx.globalCompositeOperation = 'lighter'
  for (const gh of g.fx.ghosts) {
    if (!inView(f.view, gh.x, gh.y, gh.radius * 2)) continue
    const a = gh.life / gh.max
    ctx.globalAlpha = a * 0.35
    ctx.fillStyle = gh.color
    ctx.save()
    ctx.translate(gh.x, gh.y)
    ctx.rotate(gh.angle)
    if (gh.shape === 'player') playerShape(ctx, gh.radius)
    else if (gh.shape === 'wraith') wraithShape(ctx, gh.radius)
    else {
      ctx.beginPath()
      ctx.arc(0, 0, gh.radius, 0, TAU)
    }
    ctx.fill()
    ctx.restore()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function isBright(color: string): boolean {
  const [r, g, b] = hexToRgb(color)
  return r + g + b > 300
}

export function drawParticles(f: Frame): void {
  const { ctx, g } = f
  const glow = f.q.glow
  const parts = g.fx.particles
  // Normal-blended layers first: smoke, then hull debris.
  const smoke = smokeSprite()
  for (const p of parts) {
    if (!p.alive || !inView(f.view, p.x, p.y, p.size * 2)) continue
    if (p.kind === PKind.Smoke) {
      ctx.globalAlpha = 0.55 * p.alpha * (p.life / p.max)
      const s = p.size * 2
      ctx.drawImage(smoke, p.x - s / 2, p.y - s / 2, s, s)
    } else if (p.kind === PKind.Debris && !isBright(p.color)) {
      const k = p.life / p.max
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = Math.min(1, k * 2)
      ctx.beginPath()
      for (let i = 0; i < p.sides; i++) {
        const a = (i / p.sides) * TAU
        const rr = p.size * (i % 2 ? 0.7 : 1)
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fillStyle = p.color
      ctx.fill()
      // Hot edges cooling as the fragment slows.
      ctx.strokeStyle = `rgba(255,${Math.round(140 + 80 * k)},${Math.round(120 * k)},${(0.7 * k).toFixed(3)})`
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }
  }
  ctx.globalAlpha = 1

  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (const p of parts) {
    if (!p.alive) continue
    const kind = p.kind
    if (kind === PKind.Smoke || kind === PKind.Light) continue
    if (kind === PKind.Debris && !isBright(p.color)) continue
    const reach = kind === PKind.Arc || kind === PKind.Streak ? 400 : kind === PKind.Flare ? p.size : p.size + 20
    if (!inView(f.view, p.x, p.y, reach)) continue
    const k = p.life / p.max
    const a = p.alpha
    switch (kind) {
      case PKind.Spark:
        ctx.globalAlpha = k * a
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.size
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035)
        ctx.stroke()
        break
      case PKind.Glow:
        if (glow) {
          ctx.globalAlpha = k * a
          ctx.drawImage(glowSprite(p.color, true), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2)
        } else {
          ctx.globalAlpha = k * 0.4 * a
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * 0.4, 0, TAU)
          ctx.fill()
        }
        break
      case PKind.Ring:
        ctx.globalAlpha = k * 0.8 * a
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1 + 3 * k
        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, TAU)
        ctx.stroke()
        break
      case PKind.Shock:
        ctx.strokeStyle = p.color
        ctx.globalAlpha = k * 0.22 * a
        ctx.lineWidth = 4 + 14 * k
        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, TAU)
        ctx.stroke()
        ctx.globalAlpha = k * 0.85 * a
        ctx.lineWidth = 1.5 + 1.5 * k
        ctx.stroke()
        break
      case PKind.Shard:
        ctx.globalAlpha = k * a
        ctx.fillStyle = p.color
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
        break
      case PKind.Debris: {
        // Bright energy shards (e.g. a shattered shield).
        ctx.globalAlpha = k * 0.85 * a
        ctx.fillStyle = p.color
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.beginPath()
        ctx.moveTo(p.size, 0)
        ctx.lineTo(-p.size * 0.6, p.size * 0.5)
        ctx.lineTo(-p.size * 0.4, -p.size * 0.6)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        break
      }
      case PKind.Ember: {
        const flick = 0.6 + 0.4 * Math.sin(p.seed + p.life * 22)
        ctx.globalAlpha = k * a * flick
        ctx.fillStyle = p.color
        const s = p.size
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s)
        break
      }
      case PKind.Flare: {
        ctx.globalAlpha = Math.sqrt(k) * a
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.drawImage(flareSprite(p.color), -p.size / 2, -p.size / 16, p.size, p.size / 8)
        ctx.restore()
        break
      }
      case PKind.Star: {
        ctx.globalAlpha = k * a
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.drawImage(starSprite(p.color), -p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()
        break
      }
      case PKind.Streak:
        ctx.globalAlpha = k * 0.7 * a
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.size * k
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x2, p.y2)
        ctx.stroke()
        ctx.globalAlpha = k * a
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = Math.max(0.5, p.size * 0.35 * k)
        ctx.stroke()
        break
      case PKind.Arc: {
        // Jagged bolt, re-randomised every frame for a crackling look.
        const dx = p.x2 - p.x
        const dy = p.y2 - p.y
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len
        const ny = dx / len
        const segs = Math.max(4, Math.min(12, Math.round(len / 18)))
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        for (let i = 1; i < segs; i++) {
          const s = i / segs
          const j = (Math.random() - 0.5) * Math.min(26, len * 0.25)
          ctx.lineTo(p.x + dx * s + nx * j, p.y + dy * s + ny * j)
        }
        ctx.lineTo(p.x2, p.y2)
        ctx.strokeStyle = p.color
        ctx.globalAlpha = k * 0.35 * a
        ctx.lineWidth = p.size * 3.5
        ctx.stroke()
        ctx.globalAlpha = k * a
        ctx.lineWidth = p.size
        ctx.stroke()
        break
      }
      default:
        break
    }
  }
  ctx.lineCap = 'butt'
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

/** Merged damage numbers and event text. */
export function drawTexts(f: Frame): void {
  const { ctx, g } = f
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const tx of g.fx.texts) {
    if (!inView(f.view, tx.x, tx.y, 60)) continue
    const k = tx.life / tx.max
    const scale = 1 + tx.pop * 0.35
    const size = Math.round(tx.size * scale)
    if (tx.crit && tx.pop > 0.2 && f.q.glow) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = tx.pop * 0.6
      ctx.drawImage(starSprite('#ffc35c'), tx.x - size * 1.4, tx.y - size * 1.4, size * 2.8, size * 2.8)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.globalAlpha = Math.min(1, k * 3)
    ctx.font = `700 ${size}px "Oxanium Variable", "Oxanium", sans-serif`
    ctx.strokeStyle = 'rgba(3,5,11,0.88)'
    ctx.lineWidth = 3
    ctx.strokeText(tx.text, tx.x, tx.y)
    ctx.fillStyle = tx.color
    ctx.fillText(tx.text, tx.x, tx.y)
  }
  ctx.globalAlpha = 1
}
