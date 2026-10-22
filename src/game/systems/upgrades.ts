import { PLAYER_BASE } from '../constants'
import type { Rarity, UpgradeCard, UpgradeIcon, UpgradeId, WeaponId } from '../types'

export interface PlayerStats {
  maxHp: number
  maxShield: number
  shieldRegen: number
  shieldDelay: number
  moveSpeed: number
  damageMult: number
  fireRateMult: number
  critChance: number
  critMult: number
  dashCooldown: number
  energyMax: number
  energyRegen: number
  magnetRadius: number
  pierce: number
  extraProjectiles: number
  healOnKill: number
  phaseBladeDamage: number
  volatileRadius: number
  volatileMult: number
  staticDamage: number
  ammoMult: number
  xpMult: number
}

export type UpgradeStacks = Partial<Record<UpgradeId, number>>

export interface UpgradeContext {
  stacks: UpgradeStacks
  weapons: WeaponId[]
}

export interface UpgradeDef {
  id: UpgradeId
  name: string
  rarity: Rarity
  icon: UpgradeIcon
  maxStacks: number
  describe: (nextStack: number) => string
  apply?: (s: PlayerStats, stacks: number) => void
  eligible?: (ctx: UpgradeContext) => boolean
  weapon?: WeaponId
}

const pct = (n: number) => `${Math.round(n * 100)}%`

export function baseStats(): PlayerStats {
  return {
    maxHp: PLAYER_BASE.maxHp,
    maxShield: PLAYER_BASE.maxShield,
    shieldRegen: PLAYER_BASE.shieldRegen,
    shieldDelay: PLAYER_BASE.shieldDelay,
    moveSpeed: PLAYER_BASE.moveSpeed,
    damageMult: 1,
    fireRateMult: 1,
    critChance: PLAYER_BASE.critChance,
    critMult: PLAYER_BASE.critMult,
    dashCooldown: PLAYER_BASE.dashCooldown,
    energyMax: PLAYER_BASE.energyMax,
    energyRegen: PLAYER_BASE.energyRegen,
    magnetRadius: PLAYER_BASE.magnetRadius,
    pierce: 0,
    extraProjectiles: 0,
    healOnKill: 0,
    phaseBladeDamage: 0,
    volatileRadius: 0,
    volatileMult: 0,
    staticDamage: 0,
    ammoMult: 1,
    xpMult: 1,
  }
}

const ownsSpecialWeapon = (ctx: UpgradeContext) => ctx.weapons.some((w) => w !== 'pulse')

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  damage: {
    id: 'damage',
    name: 'Overclocked Rounds',
    rarity: 'common',
    icon: 'damage',
    maxStacks: 8,
    describe: (n) => `+15% weapon damage. Total: +${pct(0.15 * n)}.`,
    apply: (s, n) => {
      s.damageMult += 0.15 * n
    },
  },
  firerate: {
    id: 'firerate',
    name: 'Rapid Cycler',
    rarity: 'common',
    icon: 'firerate',
    maxStacks: 8,
    describe: (n) => `+12% fire rate on all weapons. Total: +${pct(0.12 * n)}.`,
    apply: (s, n) => {
      s.fireRateMult += 0.12 * n
    },
  },
  speed: {
    id: 'speed',
    name: 'Servo Actuators',
    rarity: 'common',
    icon: 'speed',
    maxStacks: 5,
    describe: (n) => `+8% movement speed. Total: +${pct(0.08 * n)}.`,
    apply: (s, n) => {
      s.moveSpeed *= 1 + 0.08 * n
    },
  },
  crit: {
    id: 'crit',
    name: 'Targeting Matrix',
    rarity: 'common',
    icon: 'crit',
    maxStacks: 6,
    describe: (n) => `+8% critical hit chance. Total: ${pct(PLAYER_BASE.critChance + 0.08 * n)}.`,
    apply: (s, n) => {
      s.critChance += 0.08 * n
    },
  },
  critdmg: {
    id: 'critdmg',
    name: 'Exploit Kernel',
    rarity: 'rare',
    icon: 'crit',
    maxStacks: 4,
    describe: (n) => `Critical hits deal +40% more damage. Crits: ×${(PLAYER_BASE.critMult + 0.4 * n).toFixed(1)}.`,
    apply: (s, n) => {
      s.critMult += 0.4 * n
    },
  },
  hp: {
    id: 'hp',
    name: 'Reinforced Chassis',
    rarity: 'common',
    icon: 'health',
    maxStacks: 6,
    describe: (n) => `+25 max hull and repair 25 hull. Max hull: ${PLAYER_BASE.maxHp + 25 * n}.`,
    apply: (s, n) => {
      s.maxHp += 25 * n
    },
  },
  shield: {
    id: 'shield',
    name: 'Shield Capacitor',
    rarity: 'common',
    icon: 'shield',
    maxStacks: 5,
    describe: (n) => `+20 max shield, +25% shield regen, reboot 0.3s sooner. Max shield: ${PLAYER_BASE.maxShield + 20 * n}.`,
    apply: (s, n) => {
      s.maxShield += 20 * n
      s.shieldRegen *= 1 + 0.25 * n
      s.shieldDelay = Math.max(1.2, s.shieldDelay - 0.3 * n)
    },
  },
  dash: {
    id: 'dash',
    name: 'Phase Drive',
    rarity: 'common',
    icon: 'dash',
    maxStacks: 4,
    describe: (n) => `-15% dash cooldown. Cooldown: ${(PLAYER_BASE.dashCooldown * Math.pow(0.85, n)).toFixed(2)}s.`,
    apply: (s, n) => {
      s.dashCooldown *= Math.pow(0.85, n)
    },
  },
  energy: {
    id: 'energy',
    name: 'Fusion Cell',
    rarity: 'common',
    icon: 'energy',
    maxStacks: 4,
    describe: (n) => `+25 max energy and +30% energy regen for longer boosts. Max: ${PLAYER_BASE.energyMax + 25 * n}.`,
    apply: (s, n) => {
      s.energyMax += 25 * n
      s.energyRegen *= 1 + 0.3 * n
    },
  },
  magnet: {
    id: 'magnet',
    name: 'Grav Lens',
    rarity: 'common',
    icon: 'magnet',
    maxStacks: 3,
    describe: (n) => `+45% pickup attraction radius. Radius: ${Math.round(PLAYER_BASE.magnetRadius * (1 + 0.45 * n))}.`,
    apply: (s, n) => {
      s.magnetRadius *= 1 + 0.45 * n
    },
  },
  pierce: {
    id: 'pierce',
    name: 'Tungsten Core',
    rarity: 'rare',
    icon: 'pierce',
    maxStacks: 3,
    describe: (n) => `Projectiles pierce +1 additional enemy. Total: +${n}.`,
    apply: (s, n) => {
      s.pierce += n
    },
  },
  multishot: {
    id: 'multishot',
    name: 'Split Chamber',
    rarity: 'epic',
    icon: 'multishot',
    maxStacks: 2,
    describe: (n) => `Every trigger pull fires extra projectiles (+${n} stage${n > 1 ? 's' : ''}).`,
    apply: (s, n) => {
      s.extraProjectiles += n
    },
  },
  leech: {
    id: 'leech',
    name: 'Nanite Leech',
    rarity: 'rare',
    icon: 'leech',
    maxStacks: 3,
    describe: (n) => `Each kill repairs ${n} hull.`,
    apply: (s, n) => {
      s.healOnKill += n
    },
  },
  phaseblade: {
    id: 'phaseblade',
    name: 'Phase Blade',
    rarity: 'rare',
    icon: 'blade',
    maxStacks: 3,
    describe: (n) => `Dashing through enemies slices them for ${40 + 30 * (n - 1)} damage.`,
    apply: (s, n) => {
      s.phaseBladeDamage = 40 + 30 * (n - 1)
    },
  },
  volatile: {
    id: 'volatile',
    name: 'Volatile Payload',
    rarity: 'epic',
    icon: 'explosive',
    maxStacks: 3,
    describe: (n) => `Hits detonate for ${Math.round((0.3 + 0.1 * (n - 1)) * 100)}% splash damage in a ${45 + 15 * (n - 1)}px radius.`,
    apply: (s, n) => {
      s.volatileRadius = 45 + 15 * (n - 1)
      s.volatileMult = 0.3 + 0.1 * (n - 1)
    },
  },
  static: {
    id: 'static',
    name: 'Static Discharge',
    rarity: 'rare',
    icon: 'static',
    maxStacks: 2,
    describe: (n) => `When your shield breaks, release an EMP dealing ${60 * n} damage and repelling nearby enemies.`,
    apply: (s, n) => {
      s.staticDamage = 60 * n
    },
  },
  ammo: {
    id: 'ammo',
    name: 'Ammo Fabricator',
    rarity: 'common',
    icon: 'ammo',
    maxStacks: 3,
    describe: (n) => `+40% special weapon ammo capacity and refill all ammo. Capacity: +${pct(0.4 * n)}.`,
    apply: (s, n) => {
      s.ammoMult += 0.4 * n
    },
    eligible: ownsSpecialWeapon,
  },
  siphon: {
    id: 'siphon',
    name: 'Data Siphon',
    rarity: 'common',
    icon: 'xp',
    maxStacks: 3,
    describe: (n) => `+20% experience from data shards. Total: +${pct(0.2 * n)}.`,
    apply: (s, n) => {
      s.xpMult += 0.2 * n
    },
  },
  weapon_scatter: {
    id: 'weapon_scatter',
    name: 'Scatter Cannon',
    rarity: 'rare',
    icon: 'weapon',
    maxStacks: 1,
    weapon: 'scatter',
    describe: () => 'Acquire the Scatter Cannon: six-shard close-range blast with heavy knockback. [2]',
    eligible: (ctx) => !ctx.weapons.includes('scatter'),
  },
  weapon_lancer: {
    id: 'weapon_lancer',
    name: 'Rail Lancer',
    rarity: 'rare',
    icon: 'weapon',
    maxStacks: 1,
    weapon: 'lancer',
    describe: () => 'Acquire the Rail Lancer: hypersonic slugs that pierce every enemy in a line. [3]',
    eligible: (ctx) => !ctx.weapons.includes('lancer'),
  },
  weapon_seeker: {
    id: 'weapon_seeker',
    name: 'Seeker Swarm',
    rarity: 'rare',
    icon: 'weapon',
    maxStacks: 1,
    weapon: 'seeker',
    describe: () => 'Acquire the Seeker Swarm: homing micro-missiles that burst on impact. [4]',
    eligible: (ctx) => !ctx.weapons.includes('seeker'),
  },
}

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[]

const RARITY_WEIGHT: Record<Rarity, number> = { common: 10, rare: 5, epic: 2.2 }

export function computeStats(stacks: UpgradeStacks): PlayerStats {
  const s = baseStats()
  for (const id of UPGRADE_IDS) {
    const n = stacks[id] ?? 0
    if (n > 0) UPGRADES[id].apply?.(s, n)
  }
  s.critChance = Math.min(s.critChance, 0.75)
  return s
}

export function isEligible(def: UpgradeDef, ctx: UpgradeContext): boolean {
  const current = ctx.stacks[def.id] ?? 0
  if (current >= def.maxStacks) return false
  return def.eligible ? def.eligible(ctx) : true
}

export function toCard(def: UpgradeDef, stacks: UpgradeStacks): UpgradeCard {
  const current = stacks[def.id] ?? 0
  return {
    id: def.id,
    name: def.name,
    description: def.describe(current + 1),
    rarity: def.rarity,
    icon: def.icon,
    currentStacks: current,
    maxStacks: def.maxStacks,
    weapon: def.weapon,
  }
}

/**
 * Draws `count` distinct eligible upgrades weighted by rarity. `luck` (0..1)
 * increases the odds of rare/epic picks (used by upgrade chips).
 */
export function rollUpgrades(ctx: UpgradeContext, count = 3, luck = 0, rng: () => number = Math.random): UpgradeCard[] {
  const pool = UPGRADE_IDS.map((id) => UPGRADES[id]).filter((d) => isEligible(d, ctx))
  const picked: UpgradeDef[] = []
  while (picked.length < count && pool.length > 0) {
    const weights = pool.map((d) => RARITY_WEIGHT[d.rarity] * (d.rarity === 'common' ? 1 : 1 + luck * 1.5))
    const total = weights.reduce((a, b) => a + b, 0)
    let r = rng() * total
    let idx = 0
    for (; idx < pool.length - 1; idx++) {
      r -= weights[idx]
      if (r <= 0) break
    }
    picked.push(pool[idx])
    pool.splice(idx, 1)
  }
  return picked.map((d) => toCard(d, ctx.stacks))
}
