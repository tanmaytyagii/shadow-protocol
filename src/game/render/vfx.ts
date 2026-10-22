import { COLORS } from '../constants'
import type { Enemy } from '../entities/Enemy'
import { PICKUPS, isPowerUp } from '../entities/Pickup'
import type { Projectile } from '../entities/Projectile'
import type { Game } from '../Game'
import { TAU, clamp, damp, rand } from '../math'
import { BRUTE, SENTINEL } from '../systems/enemyAI'
import { WEAPONS, type WeaponDef } from '../systems/weapons'
import type { BossKind, PickupKind, WeaponId } from '../types'
import { PKind } from './Effects'
import { Environment } from './Environment'

/** Presentation-only state kept per enemy (never read by gameplay code). */
export interface EnemyLook {
  squash: number
  sqx: number
  sqy: number
  hitAt: number
  hitDirX: number
  hitDirY: number
  emit: number
  spawning: boolean
  materialized: boolean
  jolt: number
  jx: number
  jy: number
  phaseFlash: number
}

export interface Distortion {
  x: number
  y: number
  r: number
  grow: number
  life: number
  max: number
  strength: number
  ring: boolean
}

export interface DamageIndicator {
  angle: number
  life: number
  max: number
  heavy: boolean
}

export interface BossCorpse {
  kind: BossKind
  x: number
  y: number
  radius: number
  angle: number
  phase: number
  t: number
  dur: number
  blown: boolean
}

interface TrailPoint {
  x: number
  y: number
  t: number
}

export class PlayerLook {
  vx = 0
  vy = 0
  muzzle = 0
  muzzleWeapon: WeaponId = 'pulse'
  kick = 0
  podSide = 1
  charge = 1
  hurt = 0
  hurtX = 0
  hurtY = 0
  shieldHit = 0
  shieldHitAngle = 0
  shieldBroken = 0
  reboot = 0
  restored = 0
  prevShield = 0
  levelUp = 0
  thrust = 0
  damageTimer = 0
  switchFlash = 0
  hitMarker = 0
  hitCrit = false
  lastWeapon: WeaponId = 'pulse'
  trail: TrailPoint[] = []
}

export class Vfx {
  readonly env: Environment
  player = new PlayerLook()
  readonly distortions: Distortion[] = []
  readonly indicators: DamageIndicator[] = []
  readonly corpses: BossCorpse[] = []
  /** Presentation clock; advances with (scaled) simulation time, frozen while paused. */
  clock = 0
  /** 0..1 desaturation after the player is destroyed. */
  deathFade = 0
  private readonly g: Game
  private looks = new WeakMap<Enemy, EnemyLook>()

  constructor(g: Game) {
    this.g = g
    this.env = new Environment(g)
  }

  private get reduced(): boolean {
    return this.g.settings.reducedMotion
  }

  private get emitters(): number {
    return this.g.quality.emitters * this.g.fx.budget
  }

  reset(): void {
    this.player = new PlayerLook()
    this.player.prevShield = this.g.player.shield
    this.player.lastWeapon = this.g.player.current
    this.distortions.length = 0
    this.indicators.length = 0
    this.corpses.length = 0
    this.deathFade = 0
    this.looks = new WeakMap()
    this.env.reset()
  }

  look(e: Enemy): EnemyLook {
    let l = this.looks.get(e)
    if (!l) {
      l = { squash: 0, sqx: 1, sqy: 0, hitAt: -99, hitDirX: 0, hitDirY: 0, emit: Math.random(), spawning: false, materialized: false, jolt: 0, jx: 0, jy: 0, phaseFlash: 0 }
      this.looks.set(e, l)
    }
    return l
  }

  peek(e: Enemy): EnemyLook | undefined {
    return this.looks.get(e)
  }

  distort(x: number, y: number, r: number, grow: number, life: number, strength: number, ring: boolean): void {
    if (!this.g.quality.distortion || this.reduced || this.g.fx.budget < 0.8) return
    if (this.distortions.length >= 4) this.distortions.shift()
    this.distortions.push({ x, y, r, grow, life, max: life, strength, ring })
  }

  // --- Weapons ---------------------------------------------------------------------

  onFire(w: WeaponDef, mx: number, my: number, angle: number): void {
    const fx = this.g.fx
    const cam = this.g.camera
    const pl = this.player
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    pl.muzzle = 1
    pl.muzzleWeapon = w.id
    switch (w.id) {
      case 'pulse':
        fx.star(mx, my, w.color, 24, 0.06)
        fx.sparks(mx, my, w.core, 2, 260, angle, 0.5, 0.1)
        fx.light(mx, my, 120, w.color, 0.08, 0.5)
        pl.kick = Math.min(6, pl.kick + 2.5)
        cam.kick(-cos * 0.7, -sin * 0.7)
        break
      case 'scatter':
        fx.glow(mx, my, w.color, 34, 0.08)
        fx.flare(mx, my, w.color, 80, 0.08, angle)
        fx.sparks(mx, my, '#ffe2a8', 10, 520, angle, 0.9, 0.14)
        fx.smoke(mx + cos * 10, my + sin * 10, 2)
        fx.light(mx, my, 220, w.color, 0.12, 0.85)
        pl.kick = 8
        cam.kick(-cos * 3, -sin * 3)
        break
      case 'lancer': {
        fx.flare(mx, my, w.color, 170, 0.12, angle)
        fx.star(mx, my, '#ffffff', 46, 0.1)
        fx.ring(mx, my, w.color, 6, 0.25, 90)
        // Helix of charged motes along the slug's path.
        const n = fx.count(14)
        const px = -sin
        const py = cos
        for (let k = 0; k < n; k++) {
          const d = 26 + k * 34
          const off = Math.sin(k * 0.95) * 7
          const p = fx.spawn(PKind.Ember, mx + cos * d + px * off, my + sin * d + py * off, px * off * 3, py * off * 3, 0.16 + k * 0.018, 2.1, k % 2 ? '#e7dcff' : w.color, 6)
          p.vr = 0
        }
        fx.light(mx, my, 260, w.color, 0.16, 1)
        pl.kick = 12
        cam.kick(-cos * 4.5, -sin * 4.5)
        break
      }
      case 'seeker': {
        pl.podSide = -pl.podSide
        const px = mx - cos * 10 - sin * 9 * pl.podSide
        const py = my - sin * 10 + cos * 9 * pl.podSide
        fx.glow(px, py, w.color, 20, 0.07)
        fx.smoke(px, py, 1)
        fx.sparks(px, py, w.color, 3, 200, angle + pl.podSide * 0.5, 0.8, 0.15)
        fx.light(px, py, 100, w.color, 0.08, 0.5)
        pl.kick = 3
        cam.kick(-cos * 0.8, -sin * 0.8)
        break
      }
    }
  }

  /** A friendly projectile struck an enemy. */
  onImpact(p: Projectile, e: Enemy, crit: boolean): void {
    const fx = this.g.fx
    const ang = Math.atan2(p.vy, p.vx)
    this.player.hitMarker = 1
    this.player.hitCrit = crit
    switch (p.style) {
      case 'pulse':
        fx.glow(p.x, p.y, p.color, 11, 0.07)
        fx.sparks(p.x, p.y, p.color, 4, 260, ang + Math.PI, 1.6, 0.2)
        fx.light(p.x, p.y, 70, p.color, 0.1, 0.45)
        break
      case 'scatter':
        fx.sparks(p.x, p.y, '#ffd28a', 3, 220, ang + Math.PI, 1.8, 0.18)
        fx.light(p.x, p.y, 60, p.color, 0.08, 0.35)
        break
      case 'lancer': {
        const r = e.radius * 1.4
        fx.streak(p.x - Math.cos(ang) * r, p.y - Math.sin(ang) * r, p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r, '#ece2ff', 0.12, 3)
        fx.sparks(p.x, p.y, p.color, 6, 380, ang, 0.8, 0.22)
        fx.ring(p.x, p.y, p.color, 4, 0.2, 80)
        fx.light(p.x, p.y, 120, p.color, 0.12, 0.7)
        break
      }
      default:
        fx.glow(p.x, p.y, p.color, 14, 0.08)
    }
    if (crit) {
      fx.star(p.x, p.y, '#ffd9a0', 30, 0.11)
      fx.sparks(p.x, p.y, '#ffffff', 4, 320, ang + Math.PI, 2.2, 0.2)
    }
  }

  /** A projectile hit a wall or pillar. */
  onBlocked(p: Projectile): void {
    const fx = this.g.fx
    const ang = Math.atan2(-p.vy, -p.vx)
    const big = p.style === 'lancer'
    fx.sparks(p.x, p.y, p.color, big ? 10 : 4, big ? 260 : 170, ang, 1.6, 0.25)
    fx.glow(p.x, p.y, p.color, big ? 30 : 12, 0.1)
    if (big) {
      this.railTail(p)
      fx.light(p.x, p.y, 140, p.color, 0.15, 0.8)
    }
  }

  /** A projectile reached the end of its life without hitting anything. */
  onExpire(p: Projectile): void {
    if (p.style === 'lancer') this.railTail(p)
  }

  private railTail(p: Projectile): void {
    const dx = p.x - p.ox
    const dy = p.y - p.oy
    const d = Math.hypot(dx, dy)
    if (d < 1) return
    const L = Math.min(d, 520)
    this.g.fx.streak(p.x - (dx / d) * L, p.y - (dy / d) * L, p.x, p.y, p.color, 0.22, 3.5)
  }

  // --- Enemies ---------------------------------------------------------------------

  onEnemyDamaged(e: Enemy, amount: number, crit: boolean, kx: number, ky: number): void {
    const l = this.look(e)
    l.hitAt = this.clock
    l.squash = Math.min(1, l.squash + (e.isBoss ? 0.2 : 0.75))
    if (kx !== 0 || ky !== 0) {
      l.sqx = kx
      l.sqy = ky
      l.hitDirX = kx
      l.hitDirY = ky
    }
    if (e.isBoss) {
      l.jolt = Math.min(1, l.jolt + 0.45)
      l.jx = kx
      l.jy = ky
    }
    if (this.g.settings.damageNumbers) {
      const spread = e.radius > 20 ? e.radius * 0.6 : 0
      this.g.fx.damage(e.id, e.x + rand(-spread, spread), e.y - e.radius - 4, amount, crit)
    }
  }

  /** A hit was absorbed by an invulnerable enemy (e.g. a boss mid-transition). */
  onImmune(e: Enemy): void {
    const a = Math.random() * TAU
    const r = e.radius + 16
    this.g.fx.sparks(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, COLORS.cyan, 3, 150, a, 1.2, 0.2)
  }

  onEnemySpawning(e: Enemy): void {
    const fx = this.g.fx
    const l = this.look(e)
    if (!l.spawning) {
      l.spawning = true
      if (!e.isBoss) {
        fx.ring(e.x, e.y, e.def.accent, e.radius * 3.2, 0.7, -e.radius * 4.2)
        fx.light(e.x, e.y, 110, e.def.accent, 0.75, 0.45)
      }
    }
    if (!e.isBoss && Math.random() < 0.5) {
      const a = Math.random() * TAU
      const r = e.radius * 3
      fx.spawn(PKind.Spark, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, -Math.cos(a) * r * 4, -Math.sin(a) * r * 4, 0.2, 1.5, e.def.accent, 0)
    }
  }

  onEnemyKilled(e: Enemy): void {
    const fx = this.g.fx
    const l = this.looks.get(e)
    const kx = l?.hitDirX ?? 0
    const ky = l?.hitDirY ?? 0
    const color = e.elite ? COLORS.amber : e.def.color
    const accent = e.def.accent
    const x = e.x
    const y = e.y
    const r = e.radius
    if (e.isBoss) return

    switch (e.kind) {
      case 'mite':
        fx.glow(x, y, accent, 20, 0.12, 80)
        fx.sparks(x, y, accent, 6, 260, Math.atan2(ky, kx), 2.4, 0.25)
        fx.light(x, y, 80, accent, 0.25, 0.5)
        break
      case 'drone':
        fx.glow(x, y, '#ffffff', 16, 0.07, 120)
        fx.glow(x, y, color, 34, 0.22, 110)
        fx.sparks(x, y, color, 12, 360, Math.atan2(ky, kx), 3, 0.3)
        fx.debris(x, y, '#241d4a', 4, 240, kx, ky, 0.5, 3.4)
        fx.embers(x, y, accent, 4, 120)
        fx.smoke(x, y, 2)
        fx.light(x, y, 130, color, 0.35, 0.65)
        fx.decal(x, y, r * 1.4, color, 6)
        break
      case 'wraith':
        fx.glow(x, y, '#e4d8ff', 40, 0.25, 140)
        for (let i = 0; i < 3; i++) fx.ghost(x, y, e.angle, '#c4a8ff', r * (1.2 + i * 0.5), 0.35 + i * 0.1, 'wraith')
        fx.embers(x, y, COLORS.cyanSoft, 14, 160)
        fx.sparks(x, y, '#c4a8ff', 8, 260)
        fx.light(x, y, 150, '#c4a8ff', 0.4, 0.6)
        break
      case 'splitter':
        fx.glow(x, y, '#ffffff', 22, 0.08, 160)
        fx.shock(x, y, color, r, 0.35, 260, 0.8)
        fx.debris(x, y, '#2a2052', 3, 200, kx, ky, 0.2, r * 0.6)
        fx.sparks(x, y, accent, 14, 380)
        fx.embers(x, y, accent, 6, 140)
        fx.light(x, y, 180, color, 0.4, 0.8)
        fx.decal(x, y, r * 1.5, color, 7)
        break
      case 'sentinel':
        fx.glow(x, y, '#ffffff', 20, 0.08, 160)
        fx.glow(x, y, color, 46, 0.28, 140)
        fx.flare(x, y, accent, 120, 0.16)
        fx.sparks(x, y, color, 14, 400, Math.atan2(ky, kx), 3, 0.32)
        fx.debris(x, y, '#20184a', 5, 260, kx, ky, 0.4, 4)
        fx.embers(x, y, accent, 6, 140)
        fx.smoke(x, y, 3)
        fx.light(x, y, 170, color, 0.4, 0.75)
        fx.decal(x, y, r * 1.6, color, 7)
        break
      case 'brute':
        fx.glow(x, y, '#ffffff', 34, 0.1, 260)
        fx.glow(x, y, color, 80, 0.36, 200)
        fx.shock(x, y, accent, r, 0.45, 420, 1)
        fx.flare(x, y, accent, 240, 0.22)
        fx.sparks(x, y, color, 22, 480, Math.atan2(ky, kx), 3.4, 0.4)
        fx.debris(x, y, '#2a2150', 9, 320, kx, ky, 0.35, 6)
        fx.embers(x, y, accent, 12, 200)
        fx.smoke(x, y, 6)
        fx.light(x, y, 280, accent, 0.5, 1)
        fx.decal(x, y, r * 1.8, accent, 9)
        this.distort(x, y, r * 1.5, 380, 0.35, 0.025, true)
        break
      default:
        fx.explosion(x, y, color, r / 16)
    }
    if (e.elite) {
      fx.shock(x, y, COLORS.amber, r, 0.4, 300, 0.9)
      fx.star(x, y, '#ffe0a0', 70, 0.2)
      fx.embers(x, y, COLORS.amber, 10, 180)
    }
  }

  onBladeHit(e: Enemy, dx: number, dy: number): void {
    const fx = this.g.fx
    const r = e.radius * 1.6
    const px = -dy
    const py = dx
    fx.streak(e.x - px * r, e.y - py * r, e.x + px * r, e.y + py * r, COLORS.cyanSoft, 0.14, 3)
    fx.sparks(e.x, e.y, COLORS.cyanSoft, 10, 340)
    fx.light(e.x, e.y, 110, COLORS.cyan, 0.15, 0.7)
  }

  // --- Player ----------------------------------------------------------------------

  onPlayerHit(sx: number, sy: number, hullDamage: number): void {
    const g = this.g
    const fx = g.fx
    const p = g.player
    const pl = this.player
    const ang = Math.atan2(sy - p.y, sx - p.x)
    if (hullDamage <= 0) {
      pl.shieldHit = 1
      pl.shieldHitAngle = ang
      const r = p.radius + 9
      fx.sparks(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r, COLORS.cyan, 8, 220, ang, 1.4, 0.25)
      fx.light(p.x, p.y, 150, COLORS.cyan, 0.2, 0.6)
    } else {
      pl.hurt = 1
      pl.hurtX = -Math.cos(ang)
      pl.hurtY = -Math.sin(ang)
      fx.sparks(p.x, p.y, COLORS.red, 10, 260)
      fx.debris(p.x, p.y, '#2c4a7a', 3, 170, -Math.cos(ang), -Math.sin(ang), 0.5, 3)
      fx.embers(p.x, p.y, '#ff8a6a', 5, 120)
      fx.light(p.x, p.y, 170, COLORS.red, 0.25, 0.75)
    }
    if (this.indicators.length >= 6) this.indicators.shift()
    this.indicators.push({ angle: ang, life: 0.9, max: 0.9, heavy: hullDamage > 0 })
    g.camera.kick(-Math.cos(ang) * 4, -Math.sin(ang) * 4)
  }

  onShieldBreak(): void {
    const fx = this.g.fx
    const p = this.g.player
    fx.debris(p.x, p.y, COLORS.cyan, 10, 300, 0, 0, 0, 4)
    fx.shock(p.x, p.y, COLORS.cyan, p.radius + 8, 0.35, 260, 0.8)
    fx.flare(p.x, p.y, COLORS.cyan, 130, 0.15)
    fx.light(p.x, p.y, 210, COLORS.cyan, 0.3, 0.9)
    this.player.shieldBroken = 1
  }

  onStaticDischarge(radius: number, targets: Enemy[]): void {
    const fx = this.g.fx
    const p = this.g.player
    fx.shock(p.x, p.y, COLORS.cyanSoft, 20, 0.5, radius * 2, 1)
    fx.sparks(p.x, p.y, COLORS.cyanSoft, 30, 520)
    fx.light(p.x, p.y, radius * 1.6, COLORS.cyan, 0.4, 1)
    for (const e of targets.slice(0, 10)) fx.arc(p.x, p.y, e.x, e.y, '#d9f6ff', 0.2, 1.8)
    this.distort(p.x, p.y, 60, radius * 3, 0.4, 0.03, true)
  }

  onDash(dirX: number, dirY: number): void {
    const fx = this.g.fx
    const p = this.g.player
    fx.shock(p.x, p.y, COLORS.cyan, p.radius, 0.28, 220, 0.7)
    fx.sparks(p.x, p.y, COLORS.cyanSoft, 10, 300, Math.atan2(-dirY, -dirX), 1, 0.28)
    fx.flare(p.x, p.y, COLORS.cyan, 100, 0.12, Math.atan2(dirY, dirX))
    fx.light(p.x, p.y, 190, COLORS.cyan, 0.25, 0.8)
    this.distort(p.x, p.y, 64, 40, 0.2, 0.1, false)
    this.player.trail.length = 0
  }

  onPickup(kind: PickupKind, x: number, y: number): void {
    const fx = this.g.fx
    const p = this.g.player
    const color = PICKUPS[kind].color
    if (kind === 'xp') {
      fx.glow(p.x + rand(-6, 6), p.y + rand(-6, 6), color, 10, 0.12)
      return
    }
    fx.ring(p.x, p.y, color, 36, 0.3, -110)
    fx.sparks(x, y, color, 8, 200)
    fx.light(p.x, p.y, 160, color, 0.3, 0.7)
    if (isPowerUp(kind) || kind === 'chip') {
      fx.shock(p.x, p.y, color, 20, 0.5, 320, 0.9)
      fx.star(p.x, p.y, kind === 'chip' ? '#ffffff' : color, 70, 0.25)
      fx.embers(p.x, p.y, kind === 'chip' ? COLORS.violet : color, 14, 170)
    }
  }

  onLevelUp(): void {
    const fx = this.g.fx
    const p = this.g.player
    fx.shock(p.x, p.y, COLORS.violet, 20, 0.6, 360, 0.9)
    fx.star(p.x, p.y, '#e6dcff', 96, 0.4)
    fx.embers(p.x, p.y, COLORS.violet, 26, 230)
    fx.light(p.x, p.y, 340, COLORS.violet, 0.8, 0.9)
    this.distort(p.x, p.y, 40, 500, 0.45, 0.025, true)
    this.player.levelUp = 1.2
  }

  onAugment(): void {
    const fx = this.g.fx
    const p = this.g.player
    fx.ring(p.x, p.y, COLORS.violet, 16, 0.5, 220)
    fx.embers(p.x, p.y, '#d9c8ff', 10, 140)
    fx.light(p.x, p.y, 200, COLORS.violet, 0.4, 0.6)
  }

  onPlayerDeath(): void {
    const g = this.g
    const fx = g.fx
    const p = g.player
    fx.glow(p.x, p.y, '#ffffff', 60, 0.16, 520)
    fx.shock(p.x, p.y, COLORS.cyan, 20, 0.7, 720, 1)
    fx.debris(p.x, p.y, '#1d3157', 12, 380, 0, 0, 0, 6)
    fx.debris(p.x, p.y, COLORS.cyan, 6, 300, 0, 0, 0, 3)
    fx.embers(p.x, p.y, COLORS.cyan, 30, 260)
    fx.sparks(p.x, p.y, '#ffffff', 20, 500)
    fx.smoke(p.x, p.y, 8)
    fx.flare(p.x, p.y, COLORS.cyan, 520, 0.42)
    fx.light(p.x, p.y, 440, COLORS.cyan, 0.9, 1)
    fx.decal(p.x, p.y, 60, COLORS.cyan, 30)
    this.distort(p.x, p.y, 40, 900, 0.6, 0.035, true)
    this.deathFade = 0.001
    g.camera.zoomPunch(0.06)
  }

  // --- Explosions & hazards ---------------------------------------------------------

  onExplosion(x: number, y: number, r: number, color: string, subtle: boolean): void {
    const fx = this.g.fx
    if (subtle) {
      fx.glow(x, y, color, r * 0.9, 0.18, r)
      fx.shock(x, y, color, r * 0.35, 0.24, r * 2.6, 0.55)
      fx.sparks(x, y, color, 4, 200)
      fx.light(x, y, r * 2.2, color, 0.18, 0.5)
      return
    }
    fx.glow(x, y, '#ffffff', r * 0.45, 0.09, r * 2)
    fx.glow(x, y, color, r * 1.1, 0.3, r * 2.2)
    // The crisp ring settles on the true blast radius so it reads as a damage area.
    fx.shock(x, y, color, r * 0.3, 0.32, r * 2.4, 0.95)
    fx.sparks(x, y, color, 12, 380)
    fx.debris(x, y, '#2a2f45', 4, 220)
    fx.embers(x, y, color, 8, 160)
    fx.smoke(x, y, 3)
    fx.light(x, y, r * 3.2, color, 0.4, 1)
    fx.decal(x, y, r * 0.8, color)
    if (r >= 60) this.distort(x, y, r * 0.6, r * 4, 0.3, 0.025, true)
  }

  onBossImpact(x: number, y: number): void {
    const fx = this.g.fx
    fx.glow(x, y, '#ffffff', 40, 0.1, 300)
    fx.shock(x, y, COLORS.magenta, 30, 0.5, 520, 1)
    fx.debris(x, y, '#2b2f4a', 10, 380, 0, 0, 0, 6)
    fx.sparks(x, y, COLORS.magenta, 18, 460)
    fx.smoke(x, y, 6)
    fx.flare(x, y, COLORS.magenta, 300, 0.25)
    fx.light(x, y, 360, COLORS.magenta, 0.5, 1)
    fx.decal(x, y, 60, COLORS.magenta, 10)
    this.distort(x, y, 50, 600, 0.35, 0.03, true)
    this.g.camera.zoomPunch(0.03)
  }

  onStomp(e: Enemy): void {
    const fx = this.g.fx
    fx.shock(e.x, e.y, '#ffffff', e.radius, 0.3, 500, 0.6)
    fx.debris(e.x, e.y, '#2b2f4a', 8, 300, 0, 0, 0, 5)
    fx.smoke(e.x, e.y, 6)
    fx.light(e.x, e.y, 320, COLORS.magenta, 0.4, 0.9)
    fx.decal(e.x, e.y, e.radius * 1.6, COLORS.magenta, 10)
    this.distort(e.x, e.y, e.radius, 700, 0.4, 0.03, true)
  }

  onPulse(e: Enemy): void {
    const fx = this.g.fx
    fx.shock(e.x, e.y, COLORS.magenta, e.radius, 0.35, 280, 0.7)
    fx.light(e.x, e.y, 300, COLORS.magenta, 0.3, 0.7)
  }

  onTeleport(fromX: number, fromY: number, toX: number, toY: number): void {
    const fx = this.g.fx
    fx.ring(fromX, fromY, COLORS.violet, 120, 0.3, -380)
    fx.flare(fromX, fromY, COLORS.violet, 260, 0.2)
    for (let i = 0; i < fx.count(10); i++) {
      const a = Math.random() * TAU
      fx.streak(fromX + Math.cos(a) * 120, fromY + Math.sin(a) * 120, fromX, fromY, COLORS.violet, 0.2, 2)
    }
    fx.glow(toX, toY, '#ffffff', 60, 0.14, 400)
    fx.shock(toX, toY, COLORS.magenta, 40, 0.5, 600, 1)
    fx.flare(toX, toY, COLORS.magenta, 420, 0.3)
    fx.embers(toX, toY, COLORS.magenta, 18, 240)
    fx.light(toX, toY, 420, COLORS.magenta, 0.5, 1)
    this.distort(toX, toY, 60, 800, 0.4, 0.035, true)
  }

  onLaserFire(e: Enemy): void {
    const fx = this.g.fx
    fx.flare(e.x, e.y, COLORS.magenta, 380, 0.3)
    fx.glow(e.x, e.y, '#ffffff', 50, 0.14, 200)
    fx.light(e.x, e.y, 360, COLORS.magenta, 0.4, 0.9)
  }

  onPortalFlare(x: number, y: number): void {
    const fx = this.g.fx
    fx.ring(x, y, COLORS.magenta, 20, 0.6, 140)
    fx.embers(x, y, COLORS.magentaSoft, 8, 90)
    fx.light(x, y, 200, COLORS.magenta, 0.6, 0.6)
  }

  // --- Bosses & waves ---------------------------------------------------------------

  onBossSpawn(e: Enemy): void {
    const fx = this.g.fx
    fx.light(e.x, e.y, 320, COLORS.magenta, 1.8, 0.7)
    fx.ring(e.x, e.y, COLORS.magenta, e.radius * 4, 1.6, -e.radius * 2.4)
    if (e.kind === 'sovereign') this.env.setBlackout(0.65)
    this.look(e).spawning = true
  }

  /** Fired once when a boss finishes materialising. */
  private onBossLanded(e: Enemy): void {
    const g = this.g
    const fx = g.fx
    const sov = e.kind === 'sovereign'
    fx.glow(e.x, e.y, '#ffffff', e.radius, 0.16, 600)
    fx.shock(e.x, e.y, COLORS.magenta, e.radius, 0.6, 760, 1)
    fx.shock(e.x, e.y, '#ffffff', e.radius * 0.5, 0.25, 520, 0.7)
    if (!sov) {
      fx.debris(e.x, e.y, '#2b2f4a', 14, 420, 0, 0, 0, 6)
      fx.smoke(e.x, e.y, 10)
      fx.decal(e.x, e.y, e.radius * 1.8, COLORS.magenta, 14)
    } else {
      fx.embers(e.x, e.y, COLORS.violet, 30, 300)
    }
    fx.embers(e.x, e.y, COLORS.magenta, 20, 260)
    fx.flare(e.x, e.y, COLORS.magenta, 460, 0.4)
    fx.light(e.x, e.y, 540, COLORS.magenta, 0.7, 1)
    this.distort(e.x, e.y, e.radius, 1100, 0.5, 0.035, true)
    g.camera.addTrauma(0.35)
    g.camera.zoomPunch(0.05)
    this.env.setBlackout(0)
  }

  onBossPhase(e: Enemy): void {
    const g = this.g
    const fx = g.fx
    const warden = e.kind === 'warden'
    fx.glow(e.x, e.y, '#ffffff', e.radius * 1.4, 0.18, 600)
    fx.shock(e.x, e.y, '#ffffff', e.radius, 0.5, 1300, 0.9)
    fx.shock(e.x, e.y, COLORS.magenta, e.radius * 0.8, 0.8, 820, 1)
    fx.debris(e.x, e.y, warden ? '#3a2d6a' : '#2a2050', warden ? 16 : 10, 520, 0, 0, 0, warden ? 9 : 6)
    fx.embers(e.x, e.y, COLORS.magenta, 30, 320)
    fx.flare(e.x, e.y, COLORS.magenta, 620, 0.45)
    fx.light(e.x, e.y, 700, COLORS.magenta, 0.9, 1)
    this.distort(e.x, e.y, e.radius, 1400, 0.55, 0.035, true)
    this.look(e).phaseFlash = 1
    g.camera.zoomPunch(0.06)
  }

  onBossDefeated(e: Enemy): void {
    if (!e.boss) return
    this.corpses.push({ kind: e.boss.type, x: e.x, y: e.y, radius: e.radius, angle: e.angle, phase: e.boss.phase, t: 0, dur: 1.45, blown: false })
    this.env.setBlackout(0)
    const fx = this.g.fx
    fx.glow(e.x, e.y, '#ffffff', e.radius * 1.2, 0.2, 400)
    fx.flare(e.x, e.y, '#ffffff', 500, 0.3)
  }

  /** One of the timed blasts that rip through a dying boss. */
  onBossChain(x: number, y: number, i: number): void {
    const fx = this.g.fx
    const color = i % 2 ? COLORS.magenta : COLORS.violet
    fx.glow(x, y, '#ffffff', 30, 0.1, 260)
    fx.glow(x, y, color, 90, 0.35, 220)
    fx.shock(x, y, color, 20, 0.4, 420, 0.9)
    fx.sparks(x, y, color, 18, 460)
    fx.debris(x, y, '#2a2150', 6, 320, 0, 0, 0, 6)
    fx.embers(x, y, color, 10, 200)
    fx.light(x, y, 320, color, 0.4, 1)
  }

  private blowCorpse(c: BossCorpse): void {
    const g = this.g
    const fx = g.fx
    const sov = c.kind === 'sovereign'
    fx.glow(c.x, c.y, '#ffffff', c.radius * 2, 0.25, 900)
    fx.shock(c.x, c.y, '#ffffff', c.radius, 0.6, 2200, 0.9)
    fx.shock(c.x, c.y, COLORS.magenta, c.radius, 1, 1300, 1)
    fx.shock(c.x, c.y, sov ? COLORS.violet : COLORS.cyan, c.radius * 0.5, 1.3, 900, 0.6)
    fx.debris(c.x, c.y, sov ? '#2a2050' : '#3a2d6a', 26, 640, 0, 0, 0, 10)
    fx.embers(c.x, c.y, COLORS.magenta, 50, 420)
    fx.embers(c.x, c.y, '#ffffff', 16, 300)
    fx.sparks(c.x, c.y, '#ffffff', 30, 700)
    fx.smoke(c.x, c.y, 14)
    fx.flare(c.x, c.y, COLORS.magenta, 1000, 0.7)
    fx.light(c.x, c.y, 900, COLORS.magenta, 1.2, 1)
    fx.decal(c.x, c.y, c.radius * 2.4, COLORS.magenta, 24)
    this.distort(c.x, c.y, c.radius, 1800, 0.8, 0.035, true)
    g.camera.addTrauma(0.6)
    g.camera.zoomPunch(0.1)
    g.flashColor = '#ffffff'
    g.flashAlpha = Math.max(g.flashAlpha, this.reduced ? 0.12 : 0.5)
    g.sfx('bigExplosion')
  }

  onWaveStart(): void {
    const g = this.g
    for (const p of g.arena.portals) p.flare = Math.max(p.flare, 0.55)
    const rc = g.arena.reactor
    g.fx.shock(rc.x, rc.y, COLORS.cyan, rc.r, 1.6, 1500, 0.22)
  }

  /** Opening cinematic: the reactor surges and power floods out across the deck. */
  onIntroSurge(): void {
    const g = this.g
    const rc = g.arena.reactor
    g.fx.shock(rc.x, rc.y, COLORS.cyan, rc.r * 0.6, 2.2, 1700, 0.32)
    g.fx.light(rc.x, rc.y, 700, COLORS.cyan, 1.3, 0.6)
    g.fx.glow(rc.x, rc.y, COLORS.cyanSoft, 170, 0.7, 120)
    this.distort(rc.x, rc.y, rc.r, 900, 0.7, 0.03, true)
  }

  /** Opening cinematic: a softer second wave as the title lands; the pillars discharge. */
  onIntroTitle(): void {
    const g = this.g
    const rc = g.arena.reactor
    g.fx.shock(rc.x, rc.y, COLORS.violet, rc.r, 2, 2300, 0.16)
    g.fx.light(rc.x, rc.y, 680, COLORS.violet, 1.1, 0.25)
    this.env.discharge(3)
  }

  /** Opening cinematic: the dormant core pulses as each boot line comes in. */
  onIntroHeartbeat(): void {
    const g = this.g
    const rc = g.arena.reactor
    g.fx.glow(rc.x, rc.y, COLORS.cyan, 60, 0.55, 30)
    g.fx.light(rc.x, rc.y, 260, COLORS.cyan, 0.6, 0.35)
  }

  onWaveClear(): void {
    const g = this.g
    const p = g.player
    if (!p.alive) return
    g.fx.shock(p.x, p.y, COLORS.mint, 40, 1.4, 1500, 0.3)
    g.fx.light(p.x, p.y, 400, COLORS.mint, 1, 0.5)
  }

  // --- Per-frame -------------------------------------------------------------------

  /** Presentation update; `dt` is scaled simulation time. */
  update(dt: number): void {
    const g = this.g
    this.clock += dt
    this.updatePlayer(dt)
    this.updateEnemies(dt)

    // Seeker missiles leave smoke trails.
    const em = this.emitters
    if (em > 0) {
      for (const p of g.projectiles) {
        if (!p.alive || !p.friendly || p.style !== 'seeker') continue
        if (Math.random() < dt * 40 * em) {
          const s = g.fx.spawn(PKind.Smoke, p.x, p.y, -p.vx * 0.05, -p.vy * 0.05, rand(0.35, 0.6), rand(4, 7), '#1a2340', 2, 18)
          s.alpha = 0.8
        }
      }
    }

    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i]
      c.t += dt
      if (!c.blown && c.t >= c.dur) {
        c.blown = true
        this.blowCorpse(c)
      }
      if (c.t > c.dur + 0.4) this.corpses.splice(i, 1)
      else if (!c.blown && Math.random() < dt * 30) {
        const a = Math.random() * TAU
        const r = Math.random() * c.radius
        g.fx.sparks(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, Math.random() < 0.5 ? COLORS.magenta : '#ffffff', 3, 320)
      }
    }

    for (let i = this.distortions.length - 1; i >= 0; i--) {
      const d = this.distortions[i]
      d.life -= dt
      d.r += d.grow * dt
      if (d.life <= 0) this.distortions.splice(i, 1)
    }
    for (let i = this.indicators.length - 1; i >= 0; i--) {
      const ind = this.indicators[i]
      ind.life -= dt
      if (ind.life <= 0) this.indicators.splice(i, 1)
    }
    if (this.deathFade > 0) this.deathFade = Math.min(1, this.deathFade + dt * 1.2)
  }

  /**
   * While the level-up overlay freezes the simulation, keep presentation
   * timers (bursts, auras, refraction) moving so the moment still reads.
   */
  updateOverlay(dt: number): void {
    this.clock += dt
    const pl = this.player
    pl.levelUp = Math.max(0, pl.levelUp - dt)
    pl.muzzle = Math.max(0, pl.muzzle - dt * 14)
    pl.hitMarker = Math.max(0, pl.hitMarker - dt * 7)
    for (let i = this.distortions.length - 1; i >= 0; i--) {
      const d = this.distortions[i]
      d.life -= dt
      d.r += d.grow * dt
      if (d.life <= 0) this.distortions.splice(i, 1)
    }
  }

  /** Real-time ambient update (runs in menus and overlays too). */
  updateAmbient(dt: number): void {
    this.env.update(dt)
  }

  private updatePlayer(dt: number): void {
    const g = this.g
    const fx = g.fx
    const p = g.player
    const pl = this.player
    pl.vx = damp(pl.vx, p.vx, 10, dt)
    pl.vy = damp(pl.vy, p.vy, 10, dt)
    pl.muzzle = Math.max(0, pl.muzzle - dt * 14)
    pl.kick = damp(pl.kick, 0, 18, dt)
    pl.hurt = Math.max(0, pl.hurt - dt * 4)
    pl.shieldHit = Math.max(0, pl.shieldHit - dt * 3)
    pl.shieldBroken = Math.max(0, pl.shieldBroken - dt * 1.5)
    pl.levelUp = Math.max(0, pl.levelUp - dt)
    pl.reboot = Math.max(0, pl.reboot - dt * 1.6)
    pl.restored = Math.max(0, pl.restored - dt * 2)
    pl.switchFlash = Math.max(0, pl.switchFlash - dt * 4)
    pl.hitMarker = Math.max(0, pl.hitMarker - dt * 7)
    if (!p.alive) {
      pl.trail.length = 0
      return
    }
    if (p.current !== pl.lastWeapon) {
      pl.lastWeapon = p.current
      pl.switchFlash = 1
    }
    const interval = WEAPONS[p.current].interval / Math.max(0.1, p.stats.fireRateMult)
    pl.charge = clamp(1 - p.fireTimer / interval, 0, 1)

    // Shield reboot and full-restore cues.
    const max = p.stats.maxShield
    if (pl.prevShield <= 0.01 && p.shield > 0.01) {
      pl.reboot = 1
      fx.ring(p.x, p.y, COLORS.cyan, p.radius + 4, 0.4, 40)
    }
    if (max > 0 && pl.prevShield < max - 0.5 && p.shield >= max - 0.01) pl.restored = 1
    pl.prevShield = p.shield

    // Dash ribbon.
    for (const pt of pl.trail) pt.t += dt
    while (pl.trail.length && pl.trail[0].t > 0.28) pl.trail.shift()
    if (p.dashing) {
      pl.trail.push({ x: p.x, y: p.y, t: 0 })
      if (pl.trail.length > 18) pl.trail.shift()
    }

    // Thruster wash proportional to speed.
    const speed = Math.hypot(p.vx, p.vy)
    const em = this.emitters
    if (em > 0 && speed > 60 && !p.dashing) {
      pl.thrust += dt * (p.boosting ? 70 : 24) * em
      while (pl.thrust > 1) {
        pl.thrust -= 1
        const dx = -p.vx / speed
        const dy = -p.vy / speed
        const j = rand(-5, 5)
        const s = fx.spawn(
          p.boosting ? PKind.Spark : PKind.Ember,
          p.x + dx * 12 - dy * j,
          p.y + dy * 12 + dx * j,
          dx * rand(60, 160) - dy * rand(-30, 30),
          dy * rand(60, 160) + dx * rand(-30, 30),
          rand(0.15, 0.3),
          p.boosting ? 1.6 : 1.2,
          p.boosting ? '#e8feff' : COLORS.cyan,
          4,
        )
        s.alpha = p.boosting ? 1 : 0.7
      }
    }

    // Restrained damage cues at low hull.
    if (p.hp / p.stats.maxHp < 0.3) {
      pl.damageTimer -= dt
      if (pl.damageTimer <= 0) {
        pl.damageTimer = rand(0.3, 0.8)
        fx.sparks(p.x + rand(-7, 7), p.y + rand(-7, 7), '#ffb066', 3, 150)
        if (em > 0) fx.smoke(p.x, p.y, 1)
      }
    }
  }

  private updateEnemies(dt: number): void {
    const g = this.g
    const fx = g.fx
    const em = this.emitters
    for (const e of g.enemies) {
      if (!e.alive) continue
      const l = this.look(e)
      l.squash = Math.max(0, l.squash - dt * 7)
      l.jolt = Math.max(0, l.jolt - dt * 6)
      l.phaseFlash = Math.max(0, l.phaseFlash - dt * 0.9)

      if (e.spawnTimer > 0) {
        if (e.isBoss && em > 0 && Math.random() < dt * 8) {
          // Energy converging on the arrival point.
          const a = Math.random() * TAU
          const r = rand(170, 280)
          fx.arc(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, '#ffc6e4', 0.14, 1.6)
        }
        continue
      }
      if (l.spawning && !l.materialized) {
        l.materialized = true
        if (e.isBoss) this.onBossLanded(e)
        else {
          fx.glow(e.x, e.y, e.def.accent, e.radius * 2.4, 0.18, 60)
          fx.ring(e.x, e.y, e.def.accent, e.radius, 0.25, 90)
        }
      }
      if (em <= 0) continue

      l.emit -= dt * em
      switch (e.kind) {
        case 'drone':
          if (l.emit <= 0) {
            l.emit = 0.06
            const c = Math.cos(e.angle)
            const s = Math.sin(e.angle)
            fx.spawn(PKind.Spark, e.x - c * e.radius * 0.8, e.y - s * e.radius * 0.8, -c * 90 + e.vx * 0.3, -s * 90 + e.vy * 0.3, 0.18, 1.3, e.def.accent, 5).alpha = 0.7
          }
          break
        case 'brute':
          if (e.state === BRUTE.windup && l.emit <= 0) {
            l.emit = 0.03
            fx.sparks(e.x + rand(-e.radius, e.radius) * 0.6, e.y + rand(-e.radius, e.radius) * 0.6, e.def.accent, 1, 140)
            if (Math.random() < 0.3) fx.smoke(e.x, e.y, 1)
          } else if (e.state === BRUTE.charge && l.emit <= 0) {
            l.emit = 0.04
            fx.embers(e.x - e.lockX * e.radius, e.y - e.lockY * e.radius, e.def.accent, 1, 60)
            fx.ghost(e.x, e.y, e.angle, e.def.accent, e.radius, 0.2, 'disc')
          }
          break
        case 'sentinel':
          if (e.state === SENTINEL.aim && l.emit <= 0) {
            l.emit = 0.025
            const mx = e.x + Math.cos(e.angle) * e.radius * 1.2
            const my = e.y + Math.sin(e.angle) * e.radius * 1.2
            const a = Math.random() * TAU
            const r = 26
            fx.spawn(PKind.Spark, mx + Math.cos(a) * r, my + Math.sin(a) * r, -Math.cos(a) * 110, -Math.sin(a) * 110, 0.22, 1.2, e.def.accent, 0)
          }
          break
        case 'wraith':
          if (l.emit <= 0) {
            l.emit = 0.12
            fx.ghost(e.x, e.y, e.angle, '#c4a8ff', e.radius, 0.3, 'wraith')
            if (Math.random() < 0.4) fx.embers(e.x, e.y, COLORS.cyanSoft, 1, 40)
          }
          break
        case 'warden':
          if (e.boss && e.boss.phase >= 2 && l.emit <= 0) {
            l.emit = 0.08
            const a = Math.random() * TAU
            const r = e.radius * 0.8
            fx.sparks(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, COLORS.magenta, 2, 200)
            if (Math.random() < 0.35) fx.smoke(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 1)
          }
          break
        case 'sovereign':
          if (e.boss && e.boss.phase >= 3 && l.emit <= 0) {
            // Accretion streaks spiralling into the singularity core.
            l.emit = 0.03
            const a = Math.random() * TAU
            const r = rand(200, 300)
            const sx = e.x + Math.cos(a) * r
            const sy = e.y + Math.sin(a) * r
            const inward = a + Math.PI + 0.5
            const sp = 520
            fx.spawn(PKind.Spark, sx, sy, Math.cos(inward) * sp, Math.sin(inward) * sp, r / sp, 1.5, Math.random() < 0.5 ? COLORS.red : COLORS.magenta, 0.5)
          }
          break
        default:
          break
      }
      if (e.elite && Math.random() < dt * 6 * em) fx.embers(e.x, e.y, COLORS.amber, 1, 40)
    }
  }
}

