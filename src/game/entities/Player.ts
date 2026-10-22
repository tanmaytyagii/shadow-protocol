import { PLAYER_BASE, WORLD_H, WORLD_W, xpForLevel } from '../constants'
import { computeStats, type PlayerStats, type UpgradeStacks } from '../systems/upgrades'
import { maxAmmoFor, WEAPON_ORDER } from '../systems/weapons'
import type { PowerUpKind, UpgradeId, WeaponId } from '../types'

export class Player {
  x = WORLD_W / 2
  y = WORLD_H / 2
  vx = 0
  vy = 0
  radius: number = PLAYER_BASE.radius
  aim = 0
  stats: PlayerStats
  hp: number
  shield: number
  energy: number
  upgrades: UpgradeStacks = {}
  weapons: WeaponId[]
  current: WeaponId
  ammo: Partial<Record<WeaponId, number>> = {}
  level = 1
  xp = 0
  iframes = 0
  dashTime = 0
  dashCooldown = 0
  dashDirX = 1
  dashDirY = 0
  dashId = 0
  boosting = false
  boostLocked = false
  shieldDelayTimer = 0
  fireTimer = 0
  trailTimer = 0
  hurtFlash = 0
  recoil = 0
  alive = true
  powerUps: Record<PowerUpKind, number> = { overdrive: 0, aegis: 0, amplifier: 0, chrono: 0 }
  damageTakenThisWave = 0

  constructor(startWeapon: WeaponId) {
    this.stats = computeStats(this.upgrades)
    this.hp = this.stats.maxHp
    this.shield = this.stats.maxShield
    this.energy = this.stats.energyMax
    this.weapons = startWeapon === 'pulse' ? ['pulse'] : ['pulse', startWeapon]
    this.current = startWeapon
    for (const w of this.weapons) this.refillAmmo(w, 1)
  }

  get xpToNext(): number {
    return xpForLevel(this.level)
  }

  get dashing(): boolean {
    return this.dashTime > 0
  }

  get invulnerable(): boolean {
    return this.iframes > 0 || this.dashTime > 0 || this.powerUps.aegis > 0
  }

  stacks(id: UpgradeId): number {
    return this.upgrades[id] ?? 0
  }

  recomputeStats(): void {
    const prevMaxHp = this.stats.maxHp
    const prevMaxShield = this.stats.maxShield
    this.stats = computeStats(this.upgrades)
    if (this.stats.maxHp > prevMaxHp) this.hp += this.stats.maxHp - prevMaxHp
    if (this.stats.maxShield > prevMaxShield) this.shield += this.stats.maxShield - prevMaxShield
    this.hp = Math.min(this.hp, this.stats.maxHp)
    this.shield = Math.min(this.shield, this.stats.maxShield)
    this.energy = Math.min(this.energy, this.stats.energyMax)
  }

  maxAmmo(id: WeaponId): number | null {
    return maxAmmoFor(id, this.stats.ammoMult)
  }

  /** Refill `fraction` of a weapon's capacity. Infinite weapons are ignored. */
  refillAmmo(id: WeaponId, fraction: number): void {
    const max = this.maxAmmo(id)
    if (max === null) return
    const cur = this.ammo[id] ?? 0
    this.ammo[id] = Math.min(max, cur + Math.ceil(max * fraction))
  }

  hasAmmo(id: WeaponId): boolean {
    const max = this.maxAmmo(id)
    return max === null || (this.ammo[id] ?? 0) > 0
  }

  addWeapon(id: WeaponId): void {
    if (!this.weapons.includes(id)) {
      this.weapons.push(id)
      this.weapons.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b))
    }
    this.refillAmmo(id, 1)
  }
}
