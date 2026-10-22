import { COLORS } from '../constants'
import type { PickupKind, PowerUpKind } from '../types'

export interface PickupDef {
  label: string
  color: string
  radius: number
  life: number
}

export const PICKUPS: Record<PickupKind, PickupDef> = {
  xp: { label: 'Data', color: '#b48cff', radius: 6, life: 30 },
  health: { label: 'Repair Kit', color: COLORS.mint, radius: 11, life: 16 },
  energy: { label: 'Energy Cell', color: COLORS.blue, radius: 10, life: 16 },
  ammo: { label: 'Ammo Cache', color: COLORS.amber, radius: 11, life: 18 },
  chip: { label: 'Upgrade Chip', color: COLORS.white, radius: 12, life: 40 },
  core: { label: 'Data Core', color: COLORS.cyanSoft, radius: 11, life: 18 },
  overdrive: { label: 'Overdrive', color: COLORS.amber, radius: 13, life: 15 },
  aegis: { label: 'Aegis', color: COLORS.cyan, radius: 13, life: 15 },
  amplifier: { label: 'Amplifier', color: COLORS.magenta, radius: 13, life: 15 },
  chrono: { label: 'Chrono Field', color: '#7aa2ff', radius: 13, life: 15 },
}

export interface PowerUpDef {
  name: string
  description: string
  duration: number
  color: string
  glyph: string
}

export const POWERUPS: Record<PowerUpKind, PowerUpDef> = {
  overdrive: { name: 'Overdrive', description: 'Double fire rate', duration: 8, color: COLORS.amber, glyph: 'O' },
  aegis: { name: 'Aegis', description: 'Invulnerable barrier', duration: 6, color: COLORS.cyan, glyph: 'A' },
  amplifier: { name: 'Amplifier', description: 'Double damage', duration: 8, color: COLORS.magenta, glyph: 'X' },
  chrono: { name: 'Chrono Field', description: 'Enemies slowed 60%', duration: 6, color: '#7aa2ff', glyph: 'C' },
}

export const POWERUP_KINDS: PowerUpKind[] = ['overdrive', 'aegis', 'amplifier', 'chrono']

export const isPowerUp = (k: PickupKind): k is PowerUpKind =>
  k === 'overdrive' || k === 'aegis' || k === 'amplifier' || k === 'chrono'

export class Pickup {
  kind: PickupKind
  x: number
  y: number
  vx: number
  vy: number
  value: number
  life: number
  radius: number
  alive = true
  magnetized = false
  age = 0
  phase = Math.random() * Math.PI * 2

  constructor(kind: PickupKind, x: number, y: number, value = 1) {
    const def = PICKUPS[kind]
    this.kind = kind
    this.x = x
    this.y = y
    this.value = value
    this.life = def.life
    this.radius = kind === 'xp' ? Math.min(4 + value * 0.6, 10) : def.radius
    const a = Math.random() * Math.PI * 2
    const s = 60 + Math.random() * 140
    this.vx = Math.cos(a) * s
    this.vy = Math.sin(a) * s
  }
}
