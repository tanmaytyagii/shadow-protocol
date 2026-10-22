import { COLORS } from '../../constants'
import type { Enemy } from '../../entities/Enemy'
import { TAU, clamp } from '../../math'
import { BRUTE, SENTINEL } from '../../systems/enemyAI'
import { inView, type Frame } from '../frame'
import { glowSprite, rgba, shadowSprite } from '../sprites'
import { drawBoss } from './bosses'
import { enemySprite } from './enemySprites'

type Ctx = CanvasRenderingContext2D

const SPAWN_TIME = 0.75

/** Soft contact shadows offset away from the key light (top-left). */
export function drawShadows(f: Frame): void {
  if (!f.q.shadows) return
  const { ctx, g } = f
  const sh = shadowSprite()
  for (const e of g.enemies) {
    if (!e.alive || !inView(f.view, e.x, e.y, e.radius * 2.5)) continue
    const k = e.spawnTimer > 0 ? 1 - e.spawnTimer / (e.isBoss ? 1.8 : SPAWN_TIME) : 1
    if (k <= 0.05) continue
    const hover = e.kind === 'sovereign' ? 2.4 : e.isBoss ? 1.3 : e.kind === 'wraith' ? 1.5 : 1
    const r = e.radius * (e.isBoss ? 1.5 : 1.35) * (e.isBoss ? 0.6 + k * 0.4 : 1)
    ctx.globalAlpha = k * (e.kind === 'sovereign' ? 0.65 : 0.85)
    ctx.drawImage(sh, e.x + 6 * hover - r, e.y + 10 * hover - r * 0.75, r * 2, r * 1.5)
  }
  const p = g.player
  if (p.alive && g.phase !== 'idle') {
    ctx.globalAlpha = p.dashing ? 0.4 : 0.8
    ctx.drawImage(sh, p.x + 5 - 19, p.y + 8 - 14, 38, 28)
  }
  ctx.globalAlpha = 1
}

export function drawEnemies(f: Frame): void {
  for (const e of f.g.enemies) {
    if (!e.alive || !inView(f.view, e.x, e.y, e.radius * 3)) continue
    if (e.isBoss) drawBoss(f, e)
    else drawEnemy(f, e)
  }
}

function drawEnemy(f: Frame, e: Enemy): void {
  const { ctx, t, g } = f
  const look = g.vfx.look(e)
  const r = e.radius
  if (e.spawnTimer > 0) {
    drawMaterialize(f, e)
    return
  }
  const color = e.elite ? COLORS.amber : e.def.color

  if (f.q.glow) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.16
    const s = r * 3.4
    ctx.drawImage(glowSprite(color), e.x - s / 2, e.y - s / 2, s, s)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  const sprite = enemySprite(e.kind, r, e.elite ? 'elite' : 'base')
  if (!sprite) return
  ctx.save()
  let x = e.x
  let y = e.y
  if (e.kind === 'brute' && e.state === BRUTE.windup) {
    x += Math.sin(t * 93) * 1.6
    y += Math.cos(t * 77) * 1.6
  }
  ctx.translate(x, y)
  if (look.squash > 0.01) {
    const ha = Math.atan2(look.sqy, look.sqx)
    ctx.rotate(ha)
    ctx.scale(1 - look.squash * 0.22, 1 + look.squash * 0.1)
    ctx.rotate(-ha)
  }
  ctx.rotate(e.angle)
  ctx.globalAlpha = e.kind === 'wraith' ? 0.78 + 0.18 * Math.sin(t * 9 + e.wobble) : 1
  ctx.drawImage(sprite.canvas, -sprite.ext, -sprite.ext, sprite.ext * 2, sprite.ext * 2)
  if (e.hitFlash > 0) {
    const flash = enemySprite(e.kind, r, 'flash')
    if (flash) {
      ctx.globalAlpha = Math.min(1, e.hitFlash / 0.09) * 0.85
      ctx.drawImage(flash.canvas, -flash.ext, -flash.ext, flash.ext * 2, flash.ext * 2)
    }
  }
  ctx.globalAlpha = 1
  drawEmissives(ctx, e, r, t, f.q.glow)
  ctx.restore()

  if (e.elite) {
    ctx.strokeStyle = rgba(COLORS.amber, 0.85)
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 6])
    ctx.lineDashOffset = -t * 30
    ctx.beginPath()
    ctx.arc(e.x, e.y, r + 8, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = COLORS.amber
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.42
      const cx = e.x + Math.cos(a) * (r + 12)
      const cy = e.y + Math.sin(a) * (r + 12)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5)
      ctx.lineTo(cx + Math.cos(a + 2.2) * 3, cy + Math.sin(a + 2.2) * 3)
      ctx.lineTo(cx + Math.cos(a - 2.2) * 3, cy + Math.sin(a - 2.2) * 3)
      ctx.closePath()
      ctx.fill()
    }
  }

  // Health bar only while the enemy is being damaged.
  const since = t - look.hitAt
  if (e.hp < e.maxHp && since < 1.8) {
    const fade = clamp((1.8 - since) * 2.5, 0, 1)
    const w = Math.max(22, r * 2.2)
    const k = clamp(e.hp / e.maxHp, 0, 1)
    const bx = e.x - w / 2
    const by = e.y - r - 12
    ctx.globalAlpha = fade
    ctx.fillStyle = 'rgba(3,5,11,0.85)'
    ctx.fillRect(bx - 1, by - 1, w + 2, 5)
    ctx.fillStyle = e.elite ? COLORS.amber : COLORS.magenta
    ctx.fillRect(bx, by, w * k, 3)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillRect(bx, by, w * k, 1)
    ctx.globalAlpha = 1
  }
}

/** Animated light sources on an enemy hull, in its rotated local space. */
function drawEmissives(ctx: Ctx, e: Enemy, r: number, t: number, glow: boolean): void {
  const accent = e.elite ? COLORS.amber : e.def.accent
  ctx.globalCompositeOperation = 'lighter'
  const dot = (x: number, y: number, size: number, color: string, alpha: number, hot = true) => {
    if (glow) {
      ctx.globalAlpha = alpha
      ctx.drawImage(glowSprite(color, hot), x - size, y - size, size * 2, size * 2)
    }
    ctx.globalAlpha = Math.min(1, alpha + 0.2)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, Math.max(1, size * 0.22), 0, TAU)
    ctx.fill()
  }
  switch (e.kind) {
    case 'drone':
      dot(r * 0.42, 0, r * 0.6, accent, 0.85)
      dot(-r * 0.86, -r * 0.12, r * 0.35, accent, 0.5, false)
      dot(-r * 0.86, r * 0.12, r * 0.35, accent, 0.5, false)
      break
    case 'mite':
      dot(0, 0, r * 0.7, accent, 0.7)
      break
    case 'sentinel': {
      const k = e.state === SENTINEL.aim ? clamp(1 - e.burst / 0.5, 0, 1) : 0
      dot(0, 0, r * 0.45, accent, 0.5 + 0.2 * Math.sin(t * 4 + e.wobble))
      dot(r * 1.3, 0, r * (0.35 + k * 1.1), accent, 0.4 + k * 0.6)
      break
    }
    case 'brute': {
      const winding = e.state === BRUTE.windup
      const charging = e.state === BRUTE.charge
      const heat = winding ? 0.6 + 0.4 * Math.abs(Math.sin(t * 22)) : charging ? 1 : 0.25
      ctx.globalAlpha = 0.5 + heat * 0.5
      ctx.fillStyle = accent
      ctx.fillRect(r * 0.32, -r * 0.48, r * 0.5, r * 0.16)
      ctx.fillRect(r * 0.32, r * 0.32, r * 0.5, r * 0.16)
      dot(r * 0.57, -r * 0.4, r * 0.4, accent, 0.4 + heat * 0.4)
      dot(r * 0.57, r * 0.4, r * 0.4, accent, 0.4 + heat * 0.4)
      dot(-r * 0.65, -r * 0.2, r * 0.3 + heat * r * 0.3, accent, heat * 0.8, false)
      dot(-r * 0.65, r * 0.2, r * 0.3 + heat * r * 0.3, accent, heat * 0.8, false)
      if (charging || winding) dot(0, 0, r * 0.8, '#ffffff', heat * 0.35)
      break
    }
    case 'wraith':
      dot(r * 0.45, -r * 0.3, r * 0.4, COLORS.cyanSoft, 0.75)
      dot(r * 0.45, r * 0.3, r * 0.4, COLORS.cyanSoft, 0.75)
      break
    case 'splitter': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5 + e.wobble)
      dot(0, 0, r * 0.6, accent, 0.5 + pulse * 0.4)
      ctx.globalAlpha = 0.25 + pulse * 0.3
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.2
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3)
        ctx.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74)
        ctx.stroke()
      }
      break
    }
    default:
      break
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

/** Arrival: a light column and a scan-line reconstruction of the hull. */
function drawMaterialize(f: Frame, e: Enemy): void {
  const { ctx, t } = f
  const k = clamp(1 - e.spawnTimer / SPAWN_TIME, 0, 1)
  const r = e.radius
  const accent = e.def.accent
  ctx.globalCompositeOperation = 'lighter'
  if (f.q.glow) {
    // Column of light in screen-up space.
    const h = 150 * (1 - k * 0.4)
    const w = r * 1.5 * (1 - k * 0.3)
    const g = ctx.createLinearGradient(0, e.y - h, 0, e.y)
    g.addColorStop(0, rgba(accent, 0))
    g.addColorStop(1, rgba(accent, 0.35 * (1 - k * 0.5)))
    ctx.fillStyle = g
    ctx.fillRect(e.x - w / 2, e.y - h, w, h)
    ctx.globalAlpha = 0.4 + 0.4 * k
    ctx.drawImage(glowSprite(accent), e.x - r * 2, e.y - r * 2, r * 4, r * 4)
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  const sprite = enemySprite(e.kind, r, e.elite ? 'elite' : 'base')
  if (!sprite) return
  const ext = sprite.ext
  const top = e.y - ext
  const cut = top + ext * 2 * k
  ctx.save()
  ctx.beginPath()
  ctx.rect(e.x - ext, top, ext * 2, cut - top)
  ctx.clip()
  ctx.translate(e.x, e.y)
  ctx.rotate(e.angle)
  ctx.globalAlpha = 0.55 + 0.45 * k * (Math.sin(t * 50) > -0.6 ? 1 : 0.5)
  ctx.drawImage(sprite.canvas, -ext, -ext, ext * 2, ext * 2)
  ctx.restore()
  // Bright scan line at the reconstruction edge.
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.9 * (1 - k * 0.3)
  ctx.fillStyle = accent
  ctx.fillRect(e.x - ext, cut - 0.75, ext * 2, 1.5)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}
