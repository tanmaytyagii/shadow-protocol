import type { WeaponId } from '../types'
import type { Enemy } from './Enemy'

export type ProjectileStyle = 'pulse' | 'scatter' | 'lancer' | 'seeker' | 'orb' | 'needle'

export class Projectile {
  x = 0
  y = 0
  /** Muzzle position, used to draw rail trails. */
  ox = 0
  oy = 0
  vx = 0
  vy = 0
  radius = 4
  damage = 0
  life = 0
  maxLife = 0
  friendly = true
  pierce = 0
  knockback = 0
  color = '#fff'
  core = '#fff'
  style: ProjectileStyle = 'pulse'
  weapon: WeaponId | null = null
  homing = 0
  target: Enemy | null = null
  explosionRadius = 0
  explosionMult = 0
  hitIds: number[] = []
  hitSomething = false
  alive = false
  /** Acceleration along heading (seekers). */
  accel = 0
  maxSpeed = 0

  reset(): this {
    this.hitIds.length = 0
    this.hitSomething = false
    this.target = null
    this.homing = 0
    this.explosionRadius = 0
    this.explosionMult = 0
    this.pierce = 0
    this.knockback = 0
    this.weapon = null
    this.accel = 0
    this.maxSpeed = 0
    this.alive = true
    return this
  }
}
