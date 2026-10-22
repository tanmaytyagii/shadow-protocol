import { COLORS } from '../constants'
import type { BossKind, EnemyKind } from '../types'

export interface EnemyDef {
  kind: EnemyKind
  name: string
  radius: number
  hp: number
  speed: number
  contactDamage: number
  mass: number
  xp: number
  score: number
  color: string
  accent: string
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  drone: {
    kind: 'drone',
    name: 'Hunter Drone',
    radius: 12,
    hp: 22,
    speed: 172,
    contactDamage: 13,
    mass: 1,
    xp: 2,
    score: 10,
    color: COLORS.violet,
    accent: COLORS.magenta,
  },
  mite: {
    kind: 'mite',
    name: 'Mite',
    radius: 8,
    hp: 10,
    speed: 235,
    contactDamage: 8,
    mass: 0.6,
    xp: 1,
    score: 4,
    color: COLORS.magenta,
    accent: COLORS.magentaSoft,
  },
  sentinel: {
    kind: 'sentinel',
    name: 'Sentinel',
    radius: 16,
    hp: 40,
    speed: 115,
    contactDamage: 8,
    mass: 1.4,
    xp: 4,
    score: 25,
    color: COLORS.violet,
    accent: COLORS.magenta,
  },
  brute: {
    kind: 'brute',
    name: 'Brute',
    radius: 26,
    hp: 170,
    speed: 80,
    contactDamage: 26,
    mass: 4,
    xp: 10,
    score: 60,
    color: COLORS.violetDeep,
    accent: COLORS.magenta,
  },
  wraith: {
    kind: 'wraith',
    name: 'Wraith',
    radius: 14,
    hp: 55,
    speed: 185,
    contactDamage: 10,
    mass: 1,
    xp: 5,
    score: 40,
    color: '#c4a8ff',
    accent: COLORS.cyanSoft,
  },
  splitter: {
    kind: 'splitter',
    name: 'Splitter',
    radius: 20,
    hp: 70,
    speed: 115,
    contactDamage: 14,
    mass: 2,
    xp: 4,
    score: 30,
    color: COLORS.violet,
    accent: COLORS.magentaSoft,
  },
  warden: {
    kind: 'warden',
    name: 'WARDEN',
    radius: 46,
    hp: 3200,
    speed: 95,
    contactDamage: 24,
    mass: 30,
    xp: 60,
    score: 2500,
    color: COLORS.violet,
    accent: COLORS.magenta,
  },
  sovereign: {
    kind: 'sovereign',
    name: 'NULL SOVEREIGN',
    radius: 58,
    hp: 8200,
    speed: 80,
    contactDamage: 26,
    mass: 60,
    xp: 0,
    score: 10000,
    color: COLORS.violet,
    accent: COLORS.magenta,
  },
}

export interface BossState {
  type: BossKind
  phase: number
  phases: number
  attack: string
  lastAttack: string
  t: number
  idle: number
  shots: number
  shotTimer: number
  spiral: number
  dirX: number
  dirY: number
  transition: number
  moveX: number
  moveY: number
  moveTimer: number
  teleportX: number
  teleportY: number
  laserSound: number
}

let nextEnemyId = 1

export class Enemy {
  readonly id = nextEnemyId++
  kind: EnemyKind
  def: EnemyDef
  x: number
  y: number
  vx = 0
  vy = 0
  radius: number
  hp: number
  maxHp: number
  speed: number
  damage: number
  mass: number
  elite: boolean
  alive = true
  hitFlash = 0
  /** Seconds remaining in the materialize animation; inactive while > 0. */
  spawnTimer = 0.75
  /** Short invulnerability (e.g. split offspring). */
  invuln = 0
  angle = 0
  state = 0
  stateTimer = 0
  attackTimer = 0
  dodgeTimer = 0
  strafeDir = 1
  burst = 0
  lockX = 0
  lockY = 0
  wobble = Math.random() * Math.PI * 2
  lastDashHit = -1
  boss: BossState | null = null
  /** Minions are cleared when their boss dies. */
  minion = false

  constructor(kind: EnemyKind, x: number, y: number, elite: boolean, hpMult: number, speedMult: number, dmgMult: number) {
    const def = ENEMIES[kind]
    this.kind = kind
    this.def = def
    this.x = x
    this.y = y
    this.elite = elite
    this.radius = def.radius * (elite ? 1.25 : 1)
    this.maxHp = Math.round(def.hp * hpMult * (elite ? 2.2 : 1))
    this.hp = this.maxHp
    this.speed = def.speed * speedMult * (elite ? 1.1 : 1)
    this.damage = def.contactDamage * dmgMult * (elite ? 1.25 : 1)
    this.mass = def.mass * (elite ? 1.6 : 1)
    this.attackTimer = 1 + Math.random() * 1.5
    this.strafeDir = Math.random() < 0.5 ? -1 : 1
  }

  get active(): boolean {
    return this.alive && this.spawnTimer <= 0
  }

  get isBoss(): boolean {
    return this.boss !== null
  }
}
