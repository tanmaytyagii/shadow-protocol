import type { Difficulty, GraphicsQuality } from './types'

/** Shown in the boot log and the menu footer; keep in step with package.json. */
export const GAME_VERSION = '1.3'

export const WORLD_W = 2400
export const WORLD_H = 1600

export const TOTAL_WAVES = 10

export const COLORS = {
  void: '#03050b',
  bg: '#05070f',
  floor: '#070b17',
  cyan: '#3ef2ff',
  cyanSoft: '#9df9ff',
  violet: '#9d6bff',
  violetDeep: '#5b3bd1',
  magenta: '#ff3d9a',
  magentaSoft: '#ff8cc6',
  amber: '#ffc35c',
  mint: '#4dffb5',
  blue: '#5aa8ff',
  red: '#ff4d6d',
  white: '#eef8ff',
  steel: '#0c1426',
  steelLight: '#16223d',
} as const

export interface QualityProfile {
  maxDpr: number
  maxParticles: number
  glow: boolean
  floorScale: number
  dust: number
  trails: boolean
  /** Maximum dynamic floor lights per frame. */
  lights: number
  /** Whole-scene bloom pass. */
  bloom: boolean
  /** Screen-space refraction for dashes and shockwaves. */
  distortion: boolean
  /** Drifting haze and light shafts. */
  fog: boolean
  /** Parallax sub-floor seen through glass panels, and the abyss beyond the rim. */
  parallax: boolean
  /** Maximum scorch decals kept on the floor. */
  decals: number
  /** Multiplier for continuous emitters (exhaust, embers, smoke trails). */
  emitters: number
  /** Soft contact shadows under entities. */
  shadows: boolean
  /** Colour grade and vignette pass. */
  grading: boolean
}

export const QUALITY: Record<GraphicsQuality, QualityProfile> = {
  low: {
    maxDpr: 1,
    maxParticles: 260,
    glow: false,
    floorScale: 0.5,
    dust: 0,
    trails: false,
    lights: 0,
    bloom: false,
    distortion: false,
    fog: false,
    parallax: false,
    decals: 0,
    emitters: 0,
    shadows: false,
    grading: false,
  },
  medium: {
    maxDpr: 1.5,
    maxParticles: 650,
    glow: true,
    floorScale: 1,
    dust: 40,
    trails: true,
    lights: 44,
    bloom: false,
    distortion: false,
    fog: true,
    parallax: true,
    decals: 22,
    emitters: 0.5,
    shadows: true,
    grading: true,
  },
  high: {
    maxDpr: 2,
    maxParticles: 1400,
    glow: true,
    floorScale: 1,
    dust: 90,
    trails: true,
    lights: 110,
    bloom: true,
    distortion: true,
    fog: true,
    parallax: true,
    decals: 44,
    emitters: 1,
    shadows: true,
    grading: true,
  },
}

export interface DifficultyProfile {
  enemyHp: number
  enemyDamage: number
  enemySpeed: number
  spawnCount: number
  scoreMult: number
  xpMult: number
  eliteBonus: number
  label: string
}

export const DIFFICULTY: Record<Difficulty, DifficultyProfile> = {
  normal: { enemyHp: 1, enemyDamage: 1, enemySpeed: 1, spawnCount: 1, scoreMult: 1, xpMult: 1, eliteBonus: 0, label: 'Standard' },
  hard: {
    enemyHp: 1.8,
    enemyDamage: 1.75,
    enemySpeed: 1.15,
    spawnCount: 1.45,
    scoreMult: 1.75,
    xpMult: 0.7,
    eliteBonus: 0.06,
    label: 'Nightmare',
  },
}

export const PLAYER_BASE = {
  radius: 15,
  maxHp: 100,
  maxShield: 40,
  shieldRegen: 7,
  shieldDelay: 3.5,
  moveSpeed: 270,
  energyMax: 100,
  energyRegen: 14,
  dashCooldown: 1.15,
  dashDuration: 0.17,
  dashSpeed: 1150,
  boostMult: 1.55,
  boostDrain: 30,
  magnetRadius: 120,
  critChance: 0.05,
  critMult: 2,
  hitIframes: 0.65,
} as const

export const XP_BASE = 10
export const XP_PER_LEVEL = 8

export function xpForLevel(level: number): number {
  return XP_BASE + level * XP_PER_LEVEL
}

export const COMBO_WINDOW = 2.6
export const INTERMISSION_TIME = 5
