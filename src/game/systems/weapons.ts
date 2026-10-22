import { COLORS } from '../constants'
import type { WeaponId } from '../types'

export type WeaponSound = 'pulse' | 'scatter' | 'lancer' | 'seeker'

export interface WeaponDef {
  id: WeaponId
  slot: number
  name: string
  description: string
  color: string
  core: string
  interval: number
  damage: number
  speed: number
  speedVariance: number
  life: number
  radius: number
  pellets: number
  /** Total angle (radians) across which pellets are fanned. */
  fan: number
  /** Extra fan angle added per multishot stack. */
  fanPerExtra: number
  /** Pellets added per multishot stack. */
  pelletsPerExtra: number
  spread: number
  pierce: number
  knockback: number
  maxAmmo: number | null
  homing: number
  explosionRadius: number
  explosionMult: number
  shake: number
  sound: WeaponSound
  unlockHint: string
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pulse: {
    id: 'pulse',
    slot: 1,
    name: 'Pulse Rifle',
    description: 'Reliable rapid-fire plasma bolts. Infinite charge.',
    color: COLORS.cyan,
    core: '#e8feff',
    interval: 0.13,
    damage: 11,
    speed: 950,
    speedVariance: 0,
    life: 0.75,
    radius: 4,
    pellets: 1,
    fan: 0,
    fanPerExtra: 0.11,
    pelletsPerExtra: 1,
    spread: 0.035,
    pierce: 0,
    knockback: 70,
    maxAmmo: null,
    homing: 0,
    explosionRadius: 0,
    explosionMult: 0,
    shake: 0.02,
    sound: 'pulse',
    unlockHint: 'Standard issue',
  },
  scatter: {
    id: 'scatter',
    slot: 2,
    name: 'Scatter Cannon',
    description: 'Close-range fan of six shards with heavy knockback.',
    color: COLORS.amber,
    core: '#fff4dc',
    interval: 0.52,
    damage: 8,
    speed: 820,
    speedVariance: 0.18,
    life: 0.32,
    radius: 4,
    pellets: 6,
    fan: 0.55,
    fanPerExtra: 0.08,
    pelletsPerExtra: 2,
    spread: 0.05,
    pierce: 0,
    knockback: 170,
    maxAmmo: 40,
    homing: 0,
    explosionRadius: 0,
    explosionMult: 0,
    shake: 0.12,
    sound: 'scatter',
    unlockHint: 'Reach wave 3',
  },
  lancer: {
    id: 'lancer',
    slot: 3,
    name: 'Rail Lancer',
    description: 'Hypersonic slug that pierces every target in its path.',
    color: COLORS.violet,
    core: '#f1e9ff',
    interval: 0.7,
    damage: 48,
    speed: 1800,
    speedVariance: 0,
    life: 0.65,
    radius: 5,
    pellets: 1,
    fan: 0,
    fanPerExtra: 0.07,
    pelletsPerExtra: 1,
    spread: 0,
    pierce: 99,
    knockback: 220,
    maxAmmo: 28,
    homing: 0,
    explosionRadius: 0,
    explosionMult: 0,
    shake: 0.16,
    sound: 'lancer',
    unlockHint: 'Defeat the Warden (wave 5)',
  },
  seeker: {
    id: 'seeker',
    slot: 4,
    name: 'Seeker Swarm',
    description: 'Twin homing micro-missiles that burst on impact.',
    color: COLORS.mint,
    core: '#eafff6',
    interval: 0.42,
    damage: 13,
    speed: 480,
    speedVariance: 0.08,
    life: 1.6,
    radius: 5,
    pellets: 2,
    fan: 0.7,
    fanPerExtra: 0.2,
    pelletsPerExtra: 1,
    spread: 0.08,
    pierce: 0,
    knockback: 60,
    maxAmmo: 60,
    homing: 7,
    explosionRadius: 48,
    explosionMult: 0.6,
    shake: 0.05,
    sound: 'seeker',
    unlockHint: 'Clear wave 8',
  },
}

export const WEAPON_ORDER: WeaponId[] = ['pulse', 'scatter', 'lancer', 'seeker']

export function maxAmmoFor(id: WeaponId, ammoMult: number): number | null {
  const base = WEAPONS[id].maxAmmo
  return base === null ? null : Math.round(base * ammoMult)
}
