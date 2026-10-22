import type { Enemy } from './Enemy'

/** Boss-spawned area attacks that are not simple projectiles. */
export type Hazard = LaserHazard | MineHazard | RingHazard

export interface LaserHazard {
  kind: 'laser'
  owner: Enemy
  angle: number
  angularVel: number
  telegraph: number
  active: number
  width: number
  length: number
  damage: number
  t: number
  alive: boolean
}

export interface MineHazard {
  kind: 'mine'
  x: number
  y: number
  radius: number
  fuse: number
  t: number
  damage: number
  alive: boolean
}

export interface RingHazard {
  kind: 'ring'
  x: number
  y: number
  radius: number
  speed: number
  maxRadius: number
  thickness: number
  /** Centre angles (radians) of safe gaps, each `gapWidth` wide. */
  gaps: number[]
  gapWidth: number
  damage: number
  hit: boolean
  alive: boolean
}
