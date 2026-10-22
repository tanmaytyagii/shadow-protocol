import { COLORS, WORLD_H, WORLD_W } from '../constants'
import type { BossState, Enemy } from '../entities/Enemy'
import type { Game } from '../Game'
import { TAU, clamp, dist, pick, rand } from '../math'
import type { BossKind } from '../types'

export const BOSS_INFO: Record<BossKind, { name: string; title: string; phases: number }> = {
  warden: { name: 'WARDEN', title: 'Containment Enforcer', phases: 2 },
  sovereign: { name: 'NULL SOVEREIGN', title: 'Facility Overmind', phases: 3 },
}

export function initBoss(e: Enemy, type: BossKind): void {
  e.boss = {
    type,
    phase: 1,
    phases: BOSS_INFO[type].phases,
    attack: 'idle',
    lastAttack: '',
    t: 0,
    idle: 1.6,
    shots: 0,
    shotTimer: 0,
    spiral: Math.random() * TAU,
    dirX: 1,
    dirY: 0,
    transition: 0,
    moveX: e.x,
    moveY: e.y,
    moveTimer: 0,
    teleportX: e.x,
    teleportY: e.y,
    laserSound: 0,
  }
  e.spawnTimer = 1.8
}

function phaseFor(b: BossState, hpFrac: number): number {
  if (b.type === 'warden') return hpFrac <= 0.5 ? 2 : 1
  return hpFrac <= 0.33 ? 3 : hpFrac <= 0.66 ? 2 : 1
}

function steer(e: Enemy, tx: number, ty: number, accel: number, dt: number): void {
  const k = Math.min(1, accel * dt)
  e.vx += (tx - e.vx) * k
  e.vy += (ty - e.vy) * k
}

function startAttack(b: BossState, attack: string): void {
  b.lastAttack = attack
  b.attack = attack
  b.t = 0
  b.shots = 0
  b.shotTimer = 0
}

function endAttack(b: BossState, idle: number): void {
  b.attack = 'idle'
  b.idle = idle
  b.t = 0
}

export function updateBoss(g: Game, e: Enemy, dt: number): void {
  const b = e.boss
  if (!b) return
  const next = phaseFor(b, e.hp / e.maxHp)
  if (next > b.phase) {
    b.phase = next
    g.onBossPhase(e, next)
    b.transition = 1.8
    e.invuln = 1.8
    startAttack(b, 'idle')
    b.idle = 0.6
    return
  }
  if (b.transition > 0) {
    b.transition -= dt
    steer(e, 0, 0, 6, dt)
    e.angle += dt * 4
    return
  }
  if (b.type === 'warden') updateWarden(g, e, b, dt)
  else updateSovereign(g, e, b, dt)
}

// --- WARDEN -----------------------------------------------------------------

function updateWarden(g: Game, e: Enemy, b: BossState, dt: number): void {
  const p = g.player
  const enraged = b.phase >= 2
  const dx = p.x - e.x
  const dy = p.y - e.y
  const d = Math.hypot(dx, dy) || 1
  b.t += dt

  switch (b.attack) {
    case 'idle': {
      steer(e, (dx / d) * e.speed * (enraged ? 1.3 : 1), (dy / d) * e.speed * (enraged ? 1.3 : 1), 2, dt)
      e.angle = Math.atan2(dy, dx)
      b.idle -= dt
      if (b.idle <= 0 && p.alive) {
        const options = ['charge', 'volley', 'stomp', 'charge', 'volley']
        if (g.minionCount() < 5) options.push('summon')
        const next = pick(options.filter((o) => o !== b.lastAttack))
        startAttack(b, next)
        if (next === 'charge') g.sfx('bossCharge', e.x, 1.2)
        if (next === 'stomp') g.sfx('stompWindup', e.x)
        if (next === 'volley') g.sfx('telegraph', e.x, 0.9)
      }
      break
    }

    case 'charge': {
      const windup = enraged ? 0.65 : 0.9
      if (b.shots === 0) {
        steer(e, 0, 0, 8, dt)
        if (b.t < windup - 0.25) {
          b.dirX = dx / d
          b.dirY = dy / d
          e.angle = Math.atan2(dy, dx)
        }
        if (b.t >= windup) {
          b.shots = 1
          b.t = 0
          g.addShake(0.15)
        }
      } else if (b.shots === 1) {
        e.vx = b.dirX * 840
        e.vy = b.dirY * 840
        g.fx.sparks(e.x - b.dirX * e.radius, e.y - b.dirY * e.radius, COLORS.magenta, 2, 220, Math.atan2(-b.dirY, -b.dirX), 0.8)
        if (b.t > 0.95 || g.arena.blocked(e.x + e.vx * dt * 1.5, e.y + e.vy * dt * 1.5, e.radius)) {
          // Impact: radial burst of bullets.
          const n = enraged ? 20 : 14
          const off = Math.random() * TAU
          for (let i = 0; i < n; i++) g.fireEnemyBullet(e.x, e.y, off + (i / n) * TAU, 240, 15, 'orb')
          g.addShake(0.55, e.x, e.y)
          g.vfx.onBossImpact(e.x + b.dirX * e.radius, e.y + b.dirY * e.radius)
          g.sfx('bossSlam', e.x)
          e.vx = -b.dirX * 120
          e.vy = -b.dirY * 120
          b.shots = 2
          b.t = 0
        }
      } else {
        steer(e, 0, 0, 5, dt)
        if (b.t > 0.6) {
          b.shotTimer++
          if (enraged && b.shotTimer < 2) {
            b.shots = 0
            b.t = 0
            g.sfx('bossCharge', e.x, 1.2)
          } else endAttack(b, enraged ? 0.55 : 0.9)
        }
      }
      break
    }

    case 'volley': {
      steer(e, (dx / d) * 40, (dy / d) * 40, 2, dt)
      e.angle = Math.atan2(dy, dx)
      const volleys = enraged ? 5 : 3
      const gap = enraged ? 0.3 : 0.4
      if (b.t > 0.35 + b.shots * gap && b.shots < volleys) {
        const count = enraged ? 9 : 7
        const fan = 0.95
        const base = Math.atan2(dy, dx) + (b.shots % 2 === 0 ? 0 : fan / (count - 1) / 2)
        for (let i = 0; i < count; i++) g.fireEnemyBullet(e.x, e.y, base + (i / (count - 1) - 0.5) * fan, 310, 14, 'orb')
        g.sfx('enemyShoot', e.x, 1.6)
        b.shots++
      }
      if (b.shots >= volleys && b.t > 0.35 + volleys * gap + 0.3) endAttack(b, enraged ? 0.5 : 0.9)
      break
    }

    case 'stomp': {
      steer(e, 0, 0, 6, dt)
      const windup = 0.75
      const rings = enraged ? 2 : 1
      if (b.t >= windup + b.shots * 0.75 && b.shots < rings) {
        const gaps = enraged ? [Math.random() * TAU] : [Math.random() * TAU, Math.random() * TAU]
        g.spawnRing(e.x, e.y, 380, gaps, enraged ? 0.62 : 0.8, 22)
        g.addShake(0.45, e.x, e.y)
        g.sfx('bossSlam', e.x)
        g.vfx.onStomp(e)
        b.shots++
      }
      if (b.shots >= rings && b.t > windup + rings * 0.75 + 0.3) endAttack(b, enraged ? 0.6 : 1)
      break
    }

    case 'summon': {
      steer(e, 0, 0, 6, dt)
      if (b.shots === 0 && b.t > 0.5) {
        g.summonMinions(enraged ? ['drone', 'drone', 'sentinel', 'mite', 'mite'] : ['drone', 'drone', 'drone', 'drone'])
        g.sfx('bossRoar', e.x, 0.6)
        b.shots = 1
      }
      if (b.t > 1.1) endAttack(b, 0.6)
      break
    }

    default:
      endAttack(b, 0.6)
  }
}

// --- NULL SOVEREIGN -----------------------------------------------------------

/** Pitch of the wind-up chirp for each Sovereign bullet pattern. */
const TELEGRAPH_PITCH: Partial<Record<string, number>> = { spiral: 0.8, ring: 0.9, burst: 1, mines: 1.2 }

function pickHoverPoint(g: Game, e: Enemy): { x: number; y: number } {
  const p = g.player
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * TAU
    const r = rand(300, 440)
    const x = clamp(p.x + Math.cos(a) * r, 220, WORLD_W - 220)
    const y = clamp(p.y + Math.sin(a) * r, 220, WORLD_H - 220)
    if (!g.arena.blocked(x, y, e.radius + 10) && dist(x, y, p.x, p.y) > 260) return { x, y }
  }
  return { x: WORLD_W / 2, y: WORLD_H / 2 }
}

function updateSovereign(g: Game, e: Enemy, b: BossState, dt: number): void {
  const p = g.player
  const ph = b.phase
  const dx = p.x - e.x
  const dy = p.y - e.y
  const toPlayer = Math.atan2(dy, dx)
  const speedMul = ph === 3 ? 1.15 : 1
  b.t += dt
  e.angle += dt * (ph === 3 ? 1.4 : 0.7)

  // Gentle hover toward a moving anchor point around the player.
  b.moveTimer -= dt
  if (b.moveTimer <= 0) {
    const pt = pickHoverPoint(g, e)
    b.moveX = pt.x
    b.moveY = pt.y
    b.moveTimer = rand(2.5, 3.5)
  }
  const mobile = b.attack === 'idle' || b.attack === 'burst' || b.attack === 'summon' || b.attack === 'mines'
  if (mobile) {
    const mx = b.moveX - e.x
    const my = b.moveY - e.y
    const md = Math.hypot(mx, my) || 1
    const sp = Math.min(e.speed * speedMul, md * 2)
    steer(e, (mx / md) * sp, (my / md) * sp, 2, dt)
  } else {
    steer(e, 0, 0, 3, dt)
  }

  switch (b.attack) {
    case 'idle': {
      b.idle -= dt
      // In the final phase it keeps sniping between patterns.
      if (ph === 3) {
        b.shotTimer -= dt
        if (b.shotTimer <= 0) {
          g.fireEnemyBullet(e.x, e.y, toPlayer, 360, 13, 'needle')
          b.shotTimer = 0.8
        }
      }
      if (b.idle <= 0 && p.alive) {
        const options = ['spiral', 'burst', 'ring']
        if (g.minionCount() < 7) options.push('summon')
        if (ph >= 2) options.push('laser', 'mines', 'laser')
        if (ph >= 3) options.push('crosslaser', 'teleport', 'crosslaser')
        const next = pick(options.filter((o) => o !== b.lastAttack))
        startAttack(b, next)
        b.dirX = Math.random() < 0.5 ? 1 : -1
        if (next === 'laser' || next === 'crosslaser') g.sfx('laserCharge', e.x)
        // Each bullet pattern has its own pitch so it can be learned by ear.
        const cue = TELEGRAPH_PITCH[next]
        if (cue) g.sfx('telegraph', e.x, 0.9, undefined, cue)
      }
      break
    }

    case 'spiral': {
      const duration = ph === 3 ? 4 : 3.2
      const arms = ph === 3 ? 4 : 3
      b.shotTimer -= dt
      b.spiral += dt * (ph >= 2 ? 2.3 : 2) * b.dirX
      if (b.shotTimer <= 0 && b.t > 0.3) {
        for (let k = 0; k < arms; k++) g.fireEnemyBullet(e.x, e.y, b.spiral + (k / arms) * TAU, 210 * speedMul, 13, 'orb')
        b.shotTimer = 0.09
        g.sfx('enemyShoot', e.x, 0.5)
      }
      if (b.t > duration) endAttack(b, ph === 3 ? 0.5 : 0.9)
      break
    }

    case 'burst': {
      const bursts = 4
      if (b.shots < bursts && b.t > 0.3 + b.shots * 0.45) {
        for (let i = 0; i < 5; i++) g.fireEnemyBullet(e.x, e.y, toPlayer + (i / 4 - 0.5) * 0.5, 330 * speedMul, 14, 'orb')
        g.sfx('enemyShoot', e.x, 1.4)
        b.shots++
      }
      if (b.shots >= bursts && b.t > 0.3 + bursts * 0.45 + 0.2) endAttack(b, ph === 3 ? 0.4 : 0.8)
      break
    }

    case 'ring': {
      const pulses = 3
      if (b.shots < pulses && b.t > 0.4 + b.shots * 0.6) {
        const n = 26
        const gapStart = Math.floor(Math.random() * n)
        const off = b.shots * 0.12
        for (let i = 0; i < n; i++) {
          const rel = (i - gapStart + n) % n
          if (rel < 3) continue
          g.fireEnemyBullet(e.x, e.y, off + (i / n) * TAU, 230 * speedMul, 14, 'orb')
        }
        g.vfx.onPulse(e)
        g.sfx('bossSlam', e.x, 0.5)
        b.shots++
      }
      if (b.shots >= pulses && b.t > 0.4 + pulses * 0.6 + 0.2) endAttack(b, ph === 3 ? 0.5 : 0.9)
      break
    }

    case 'summon': {
      if (b.shots === 0 && b.t > 0.5) {
        const kinds: Parameters<Game['summonMinions']>[0] = ['wraith', 'drone', 'drone']
        if (ph >= 2) kinds.push('wraith', 'mite', 'mite')
        if (ph >= 3) kinds.push('sentinel')
        g.summonMinions(kinds)
        g.sfx('bossRoar', e.x, 0.6)
        b.shots = 1
      }
      if (b.t > 1.2) endAttack(b, 0.6)
      break
    }

    case 'laser':
    case 'crosslaser': {
      if (b.shots === 0) {
        const cross = b.attack === 'crosslaser'
        const beams = cross ? 4 : 2
        const telegraph = cross ? 1.0 : 1.2
        const active = cross ? 3.2 : 2.4
        const spin = (Math.random() < 0.5 ? -1 : 1) * (cross ? 0.55 : 0.75)
        // Start perpendicular to the player so the sweep is always readable.
        const base = toPlayer + Math.PI / 2 * Math.sign(spin) * -1
        for (let i = 0; i < beams; i++) g.spawnLaser(e, base + (i / beams) * TAU, spin, telegraph, active, 20)
        b.shots = 1
        b.shotTimer = telegraph
        b.idle = telegraph + active
      }
      if (b.shots === 1 && b.t >= b.shotTimer) {
        g.sfx('laserFire', e.x, 1, b.idle - b.shotTimer)
        g.vfx.onLaserFire(e)
        g.addShake(0.3)
        b.shots = 2
      }
      if (b.t > b.idle + 0.3) endAttack(b, ph === 3 ? 0.4 : 0.8)
      break
    }

    case 'mines': {
      const count = ph === 3 ? 9 : 7
      if (b.shots < count && b.t > 0.2 + b.shots * 0.14) {
        const first = b.shots === 0
        const a = Math.random() * TAU
        const r = first ? 0 : rand(90, 360)
        const x = clamp(p.x + Math.cos(a) * r, 60, WORLD_W - 60)
        const y = clamp(p.y + Math.sin(a) * r, 60, WORLD_H - 60)
        g.spawnMine(x, y, 78, 1.6, 26)
        b.shots++
      }
      if (b.shots >= count && b.t > 0.2 + count * 0.14 + 0.5) endAttack(b, ph === 3 ? 0.5 : 0.9)
      break
    }

    case 'teleport': {
      if (b.shots === 0) {
        let best = { x: WORLD_W / 2, y: WORLD_H / 2 }
        for (let i = 0; i < 16; i++) {
          const x = rand(260, WORLD_W - 260)
          const y = rand(240, WORLD_H - 240)
          if (dist(x, y, p.x, p.y) > 340 && dist(x, y, e.x, e.y) > 400 && !g.arena.blocked(x, y, e.radius + 20)) {
            best = { x, y }
            break
          }
        }
        b.teleportX = best.x
        b.teleportY = best.y
        b.shots = 1
        g.sfx('warp', e.x)
      }
      if (b.shots === 1 && b.t > 0.7) {
        const fromX = e.x
        const fromY = e.y
        e.x = b.teleportX
        e.y = b.teleportY
        e.vx = 0
        e.vy = 0
        b.moveX = e.x
        b.moveY = e.y
        g.vfx.onTeleport(fromX, fromY, e.x, e.y)
        const n = 30
        const gap = Math.floor(Math.random() * n)
        for (let i = 0; i < n; i++) {
          if ((i - gap + n) % n < 4) continue
          g.fireEnemyBullet(e.x, e.y, (i / n) * TAU, 220, 14, 'orb')
        }
        g.addShake(0.5)
        g.sfx('bossSlam', e.x)
        b.shots = 2
      }
      if (b.t > 1.3) endAttack(b, 0.5)
      break
    }

    default:
      endAttack(b, 0.6)
  }
}
