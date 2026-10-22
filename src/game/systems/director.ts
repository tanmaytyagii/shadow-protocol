import { INTERMISSION_TIME, TOTAL_WAVES } from '../constants'
import type { Enemy } from '../entities/Enemy'
import type { Game } from '../Game'
import type { Portal } from '../render/Arena'
import { dist2, rand, randInt } from '../math'
import type { EnemyKind } from '../types'
import { buildSpawnQueue, getWave, type WaveDef } from './waves'

export type DirectorState = 'intro' | 'combat' | 'boss' | 'bossDown' | 'intermission' | 'complete'

/** Drives wave pacing: intros, spawn groups, boss encounters and intermissions. */
export class WaveDirector {
  wave = 0
  state: DirectorState = 'intro'
  timer = 0
  queue: EnemyKind[] = []
  /** Size of this wave's spawn queue when it began (for the HUD's progress bar). */
  total = 0
  def: WaveDef = getWave(1)
  boss: Enemy | null = null
  private spawnTimer = 0
  private readonly g: Game

  constructor(g: Game) {
    this.g = g
  }

  get isBossWave(): boolean {
    return this.def.boss !== undefined
  }

  get remaining(): number {
    return this.queue.length + this.g.enemies.filter((e) => e.alive && !e.minion && !e.isBoss).length
  }

  startWave(n: number): void {
    this.wave = n
    this.def = getWave(n)
    this.queue = buildSpawnQueue(this.def, this.g.diff.spawnCount)
    this.total = this.queue.length
    this.state = 'intro'
    this.timer = this.isBossWave ? 3 : 2.2
    this.spawnTimer = 0.4
    this.boss = null
    this.g.onWaveStart(n, this.def)
  }

  update(dt: number): void {
    switch (this.state) {
      case 'intro':
        this.timer -= dt
        if (this.timer <= 0) {
          if (this.def.boss) {
            this.state = 'boss'
            this.boss = this.g.spawnBoss(this.def.boss)
          } else {
            this.state = 'combat'
          }
        }
        break

      case 'combat': {
        this.spawnTimer -= dt
        const alive = this.g.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0)
        if (this.queue.length > 0 && this.spawnTimer <= 0 && alive < this.def.maxAlive) {
          this.spawnGroup()
          this.spawnTimer = rand(this.def.interval[0], this.def.interval[1])
        }
        if (this.queue.length === 0 && alive === 0) this.clear()
        break
      }

      case 'boss':
        if (this.boss && !this.boss.alive) {
          this.state = 'bossDown'
          this.timer = 2.4
        }
        break

      case 'bossDown':
        this.timer -= dt
        if (this.timer <= 0) this.clear()
        break

      case 'intermission':
        this.timer -= dt
        if (this.timer <= 0) this.startWave(this.wave + 1)
        break

      case 'complete':
        break
    }
  }

  private clear(): void {
    this.g.onWaveCleared(this.wave)
    if (this.wave >= TOTAL_WAVES) {
      this.state = 'complete'
      this.g.onAllWavesComplete()
    } else {
      this.state = 'intermission'
      this.timer = INTERMISSION_TIME
    }
  }

  /** Chooses a spawn portal away from the player so spawns are never unfair. */
  pickPortal(minDist = 520): Portal {
    const p = this.g.player
    const portals = this.g.arena.portals
    const far = portals.filter((o) => dist2(o.x, o.y, p.x, p.y) > minDist * minDist)
    if (far.length > 0) return far[Math.floor(Math.random() * far.length)]
    let best = portals[0]
    let bestD = -1
    for (const o of portals) {
      const d = dist2(o.x, o.y, p.x, p.y)
      if (d > bestD) {
        bestD = d
        best = o
      }
    }
    return best
  }

  private spawnGroup(): void {
    const size = Math.min(this.queue.length, randInt(this.def.group[0], this.def.group[1]))
    const portal = this.pickPortal()
    this.g.flarePortal(portal)
    for (let i = 0; i < size; i++) {
      const kind = this.queue.shift()
      if (!kind) break
      const a = Math.random() * Math.PI * 2
      const r = rand(0, 55)
      const eliteChance = this.def.eliteChance + (this.wave > 1 ? this.g.diff.eliteBonus : 0)
      const elite = kind !== 'mite' && Math.random() < eliteChance
      this.g.spawnEnemy(kind, portal.x + Math.cos(a) * r, portal.y + Math.sin(a) * r, elite)
    }
    this.g.sfx('spawn', portal.x)
  }
}
