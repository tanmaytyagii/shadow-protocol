import { COLORS, WORLD_H, WORLD_W } from '../constants'
import type { Enemy } from '../entities/Enemy'
import type { Game } from '../Game'
import { angleDiff, clamp, segmentPointDist2 } from '../math'

const scratch: Enemy[] = []

export function updateProjectiles(g: Game, dt: number): void {
  const player = g.player
  const list = g.projectiles
  for (let i = 0; i < list.length; i++) {
    const p = list[i]
    if (!p.alive) continue
    const step = p.friendly ? dt : dt * g.enemyTimeScale

    if (p.homing > 0) {
      if (!p.target || !p.target.active) p.target = g.findNearestEnemy(p.x, p.y, 560)
      const speed = Math.hypot(p.vx, p.vy)
      let heading = Math.atan2(p.vy, p.vx)
      if (p.target) {
        const want = Math.atan2(p.target.y - p.y, p.target.x - p.x)
        heading += clamp(angleDiff(heading, want), -p.homing * step, p.homing * step)
      }
      const nextSpeed = Math.min(p.maxSpeed || speed, speed + p.accel * step)
      p.vx = Math.cos(heading) * nextSpeed
      p.vy = Math.sin(heading) * nextSpeed
    }

    p.x += p.vx * step
    p.y += p.vy * step
    p.life -= step

    if (p.life <= 0) {
      if (p.explosionRadius > 0) g.explode(p.x, p.y, p.explosionRadius, p.damage * p.explosionMult, true, null, p.color)
      else g.vfx.onExpire(p)
      p.alive = false
      continue
    }

    if (p.x < 0 || p.y < 0 || p.x > WORLD_W || p.y > WORLD_H || g.arena.pylonAt(p.x, p.y, p.radius)) {
      if (p.explosionRadius > 0) g.explode(p.x, p.y, p.explosionRadius, p.damage * p.explosionMult, true, null, p.color)
      else g.vfx.onBlocked(p)
      p.alive = false
      continue
    }

    if (p.friendly) {
      const hits = g.grid.query(p.x, p.y, p.radius, scratch)
      for (let h = 0; h < hits.length; h++) {
        const e = hits[h]
        if (!e.active || p.hitIds.includes(e.id)) continue
        g.projectileHit(p, e)
        if (p.pierce > 0) {
          p.pierce--
          p.hitIds.push(e.id)
        } else {
          g.vfx.onExpire(p)
          p.alive = false
          break
        }
      }
    } else if (player.alive) {
      const rr = p.radius + player.radius * 0.72
      const dx = player.x - p.x
      const dy = player.y - p.y
      if (dx * dx + dy * dy < rr * rr) {
        // Dashing phases straight through bullets; that is the reward for timing it.
        if (player.dashing) continue
        if (player.invulnerable) {
          g.fx.sparks(p.x, p.y, COLORS.cyan, 5, 160)
          p.alive = false
          continue
        }
        g.damagePlayer(p.damage, p.x, p.y)
        g.fx.sparks(p.x, p.y, p.color, 8, 220)
        p.alive = false
      }
    }
  }
  g.compactProjectiles()
}

export function updateHazards(g: Game, dt: number): void {
  const player = g.player
  const step = dt * g.enemyTimeScale
  for (const h of g.hazards) {
    if (!h.alive) continue
    switch (h.kind) {
      case 'laser': {
        if (!h.owner.alive) {
          h.alive = false
          break
        }
        h.t += step
        if (h.t > h.telegraph) h.angle += h.angularVel * step
        if (h.t > h.telegraph + h.active) {
          h.alive = false
          break
        }
        if (h.t > h.telegraph && player.alive && !player.invulnerable) {
          const ex = h.owner.x + Math.cos(h.angle) * h.length
          const ey = h.owner.y + Math.sin(h.angle) * h.length
          const reach = h.width / 2 + player.radius * 0.7
          if (segmentPointDist2(h.owner.x, h.owner.y, ex, ey, player.x, player.y) < reach * reach) {
            g.damagePlayer(h.damage, h.owner.x, h.owner.y)
          }
        }
        break
      }

      case 'mine': {
        h.t += step
        if (h.t >= h.fuse) {
          h.alive = false
          g.explode(h.x, h.y, h.radius, h.damage, false, null, COLORS.magenta)
        } else if (Math.floor(h.t * 6) !== Math.floor((h.t - step) * 6)) {
          g.sfx('mineArm', h.x, 0.6)
        }
        break
      }

      case 'ring': {
        h.radius += h.speed * step
        if (h.radius > h.maxRadius) {
          h.alive = false
          break
        }
        if (!h.hit && player.alive && !player.invulnerable) {
          const dx = player.x - h.x
          const dy = player.y - h.y
          const d = Math.hypot(dx, dy)
          if (Math.abs(d - h.radius) < h.thickness / 2 + player.radius * 0.6) {
            const a = Math.atan2(dy, dx)
            const safe = h.gaps.some((gap) => Math.abs(angleDiff(gap, a)) < h.gapWidth / 2)
            if (!safe) {
              h.hit = true
              g.damagePlayer(h.damage, h.x, h.y)
            }
          }
        }
        break
      }
    }
  }
  for (let i = g.hazards.length - 1; i >= 0; i--) if (!g.hazards[i].alive) g.hazards.splice(i, 1)
}
