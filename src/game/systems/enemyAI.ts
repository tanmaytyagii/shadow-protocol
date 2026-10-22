import type { Game } from '../Game'
import type { Enemy } from '../entities/Enemy'
import { rand } from '../math'
import { updateBoss } from './boss'

/** Brute states. */
export const BRUTE = { chase: 0, windup: 1, charge: 2, recover: 3 } as const
/** Sentinel states. */
export const SENTINEL = { move: 0, aim: 1 } as const

function steer(e: Enemy, tx: number, ty: number, accel: number, dt: number): void {
  const k = Math.min(1, accel * dt)
  e.vx += (tx - e.vx) * k
  e.vy += (ty - e.vy) * k
}

export function updateEnemy(g: Game, e: Enemy, dt: number): void {
  if (e.boss) {
    updateBoss(g, e, dt)
    return
  }
  const p = g.player
  const dx = p.x - e.x
  const dy = p.y - e.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  // While the player is dead, enemies drift aimlessly.
  const chaseMult = p.alive ? 1 : -0.2

  switch (e.kind) {
    case 'drone':
    case 'mite': {
      e.wobble += dt * (e.kind === 'mite' ? 5 : 3)
      const weave = Math.sin(e.wobble) * (e.kind === 'mite' ? 0.6 : 0.35)
      let vx = ux - uy * weave
      let vy = uy + ux * weave
      const l = Math.hypot(vx, vy) || 1
      vx /= l
      vy /= l
      steer(e, vx * e.speed * chaseMult, vy * e.speed * chaseMult, e.kind === 'mite' ? 6 : 4, dt)
      e.angle = Math.atan2(e.vy, e.vx)
      break
    }

    case 'splitter': {
      steer(e, ux * e.speed * chaseMult, uy * e.speed * chaseMult, 3, dt)
      e.angle += dt * 1.6
      break
    }

    case 'sentinel': {
      e.angle = Math.atan2(dy, dx)
      e.stateTimer -= dt
      if (e.stateTimer <= 0) {
        e.strafeDir *= -1
        e.stateTimer = rand(1.4, 2.8)
      }
      if (e.state === SENTINEL.move) {
        let tx = -uy * e.strafeDir * e.speed * 0.8
        let ty = ux * e.strafeDir * e.speed * 0.8
        if (d > 380) {
          tx += ux * e.speed
          ty += uy * e.speed
        } else if (d < 240) {
          tx -= ux * e.speed
          ty -= uy * e.speed
        }
        steer(e, tx, ty, 3, dt)
        e.attackTimer -= dt
        if (e.attackTimer <= 0 && d < 700 && p.alive) {
          e.state = SENTINEL.aim
          e.burst = 0.5
        }
      } else {
        steer(e, 0, 0, 5, dt)
        e.burst -= dt
        if (e.burst <= 0) {
          const spread = e.elite ? [-0.22, 0, 0.22] : [0]
          for (const off of spread) g.fireEnemyBullet(e.x, e.y, e.angle + off, 320, 14, 'orb')
          g.sfx('enemyShoot', e.x)
          e.state = SENTINEL.move
          e.attackTimer = rand(1.5, 2.2)
        }
      }
      break
    }

    case 'brute': {
      e.attackTimer -= dt
      if (e.state === BRUTE.chase) {
        steer(e, ux * e.speed * chaseMult, uy * e.speed * chaseMult, 2.5, dt)
        e.angle = Math.atan2(dy, dx)
        if (e.attackTimer <= 0 && d < 470 && p.alive) {
          e.state = BRUTE.windup
          e.stateTimer = 0.75
          e.lockX = ux
          e.lockY = uy
          g.sfx('bossCharge', e.x, 0.5)
        }
      } else if (e.state === BRUTE.windup) {
        steer(e, 0, 0, 8, dt)
        e.stateTimer -= dt
        // Track the player during the first part of the wind-up, then commit.
        if (e.stateTimer > 0.25) {
          e.lockX = ux
          e.lockY = uy
          e.angle = Math.atan2(uy, ux)
        }
        if (e.stateTimer <= 0) {
          e.state = BRUTE.charge
          e.stateTimer = 0.55
        }
      } else if (e.state === BRUTE.charge) {
        e.vx = e.lockX * 640
        e.vy = e.lockY * 640
        e.stateTimer -= dt
        if (Math.random() < 0.6) g.fx.sparks(e.x - e.lockX * e.radius, e.y - e.lockY * e.radius, e.def.accent, 1, 120, Math.atan2(-e.lockY, -e.lockX), 0.6)
        if (e.stateTimer <= 0 || g.arena.blocked(e.x + e.vx * dt, e.y + e.vy * dt, e.radius)) {
          if (e.stateTimer > 0) {
            g.addShake(0.25, e.x, e.y)
            g.fx.sparks(e.x + e.lockX * e.radius, e.y + e.lockY * e.radius, '#ffffff', 10, 300)
            g.sfx('bossSlam', e.x, 0.4)
          }
          e.state = BRUTE.recover
          e.stateTimer = 0.7
          e.vx *= 0.2
          e.vy *= 0.2
        }
      } else {
        steer(e, 0, 0, 4, dt)
        e.stateTimer -= dt
        if (e.stateTimer <= 0) {
          e.state = BRUTE.chase
          e.attackTimer = rand(2.8, 4)
        }
      }
      break
    }

    case 'wraith': {
      e.angle = Math.atan2(dy, dx)
      e.dodgeTimer -= dt
      e.stateTimer -= dt
      if (e.stateTimer <= 0) {
        e.strafeDir *= -1
        e.stateTimer = rand(2, 4)
      }
      const desired = 290
      const radial = (d - desired) / desired
      const tx = (ux * radial * 1.6 - uy * e.strafeDir) * e.speed * chaseMult
      const ty = (uy * radial * 1.6 + ux * e.strafeDir) * e.speed * chaseMult
      steer(e, tx, ty, 3, dt)

      if (e.dodgeTimer <= 0) {
        const threat = g.findIncomingProjectile(e, 170)
        if (threat) {
          const l = Math.hypot(threat.vx, threat.vy) || 1
          // Sidestep perpendicular to the incoming shot, away from its line.
          let px = -threat.vy / l
          let py = threat.vx / l
          if ((e.x - threat.x) * px + (e.y - threat.y) * py < 0) {
            px = -px
            py = -py
          }
          e.vx = px * 560
          e.vy = py * 560
          e.dodgeTimer = e.elite ? 0.8 : 1.35
          for (let i = 0; i < 3; i++) g.fx.ghost(e.x - px * i * 10, e.y - py * i * 10, e.angle, e.def.color, e.radius, 0.3, 'wraith')
        }
      }

      e.attackTimer -= dt
      if (e.burst > 0) {
        e.lockX -= dt
        if (e.lockX <= 0) {
          g.fireEnemyBullet(e.x, e.y, e.angle + rand(-0.05, 0.05), 370, 11, 'needle')
          g.sfx('enemyShoot', e.x, 0.8)
          e.burst--
          e.lockX = 0.13
        }
      } else if (e.attackTimer <= 0 && d < 650 && p.alive) {
        e.burst = e.elite ? 5 : 3
        e.lockX = 0.2
        e.attackTimer = rand(2.4, 3.2)
      }
      break
    }

    default:
      break
  }
}
