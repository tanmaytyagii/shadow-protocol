import { describe, expect, it } from 'vitest'
import { PLAYER_BASE, WORLD_H, WORLD_W } from './constants'
import { Player } from './entities/Player'
import { angleDiff, dist, mulberry32, segmentPointDist2 } from './math'
import { Arena } from './render/Arena'
import { SpatialGrid } from './SpatialGrid'
import { WEAPONS } from './systems/weapons'

describe('math helpers', () => {
  it('angleDiff returns the shortest signed turn', () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2)
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
  })

  it('segmentPointDist2 measures distance to the closest point', () => {
    expect(segmentPointDist2(0, 0, 10, 0, 5, 3)).toBeCloseTo(9)
    expect(segmentPointDist2(0, 0, 10, 0, 14, 3)).toBeCloseTo(25)
  })

  it('mulberry32 is deterministic', () => {
    const a = mulberry32(99)
    const b = mulberry32(99)
    for (let i = 0; i < 10; i++) expect(a()).toBe(b())
  })
})

describe('SpatialGrid', () => {
  it('finds overlapping entities and ignores distant ones', () => {
    const grid = new SpatialGrid<{ x: number; y: number; radius: number; id: number }>(1000, 1000, 100)
    grid.insert({ x: 100, y: 100, radius: 10, id: 1 })
    grid.insert({ x: 125, y: 100, radius: 10, id: 2 })
    grid.insert({ x: 800, y: 800, radius: 10, id: 3 })
    const hits = grid.query(110, 100, 5, []).map((e) => e.id)
    expect(hits.sort()).toEqual([1, 2])
  })

  it('finds large entities whose centre is in a neighbouring cell', () => {
    const grid = new SpatialGrid<{ x: number; y: number; radius: number }>(1000, 1000, 100)
    const boss = { x: 350, y: 350, radius: 60 }
    grid.insert(boss)
    expect(grid.query(295, 350, 4, [])).toContain(boss)
  })
})

describe('Arena', () => {
  it('generates pylons away from the spawn point and portals', () => {
    for (let seed = 1; seed < 20; seed++) {
      const arena = new Arena(seed)
      expect(arena.pylons.length).toBeGreaterThanOrEqual(5)
      for (const p of arena.pylons) {
        expect(dist(p.x, p.y, WORLD_W / 2, WORLD_H / 2)).toBeGreaterThan(300)
        for (const portal of arena.portals) expect(dist(p.x, p.y, portal.x, portal.y)).toBeGreaterThan(250)
      }
    }
  })

  it('leaves room to pass between any two pylons', () => {
    const arena = new Arena(1234)
    for (const a of arena.pylons)
      for (const b of arena.pylons) if (a !== b) expect(dist(a.x, a.y, b.x, b.y) - a.r - b.r).toBeGreaterThan(PLAYER_BASE.radius * 4)
  })

  it('pushes bodies out of walls and pylons', () => {
    const arena = new Arena(5)
    const p = arena.pylons[0]
    const body = { x: p.x + 1, y: p.y, vx: -100, vy: 0, radius: 15 }
    expect(arena.resolve(body)).toBe(true)
    expect(dist(body.x, body.y, p.x, p.y)).toBeCloseTo(p.r + 15)
    const wall = { x: -40, y: 50, vx: 0, vy: 0, radius: 15 }
    arena.resolve(wall)
    expect(wall.x).toBe(15)
  })
})

describe('Player', () => {
  it('starts with the pulse rifle plus the chosen weapon fully loaded', () => {
    const p = new Player('lancer')
    expect(p.weapons).toEqual(['pulse', 'lancer'])
    expect(p.current).toBe('lancer')
    expect(p.ammo.lancer).toBe(WEAPONS.lancer.maxAmmo)
    expect(p.hasAmmo('pulse')).toBe(true)
  })

  it('keeps weapons ordered by slot and refills on pickup', () => {
    const p = new Player('pulse')
    p.addWeapon('seeker')
    p.addWeapon('scatter')
    expect(p.weapons).toEqual(['pulse', 'scatter', 'seeker'])
    p.ammo.seeker = 0
    expect(p.hasAmmo('seeker')).toBe(false)
    p.refillAmmo('seeker', 0.4)
    expect(p.ammo.seeker).toBe(Math.ceil((WEAPONS.seeker.maxAmmo ?? 0) * 0.4))
  })

  it('heals by the max-hull increase when Reinforced Chassis is installed', () => {
    const p = new Player('pulse')
    p.hp = 50
    p.upgrades.hp = 1
    p.recomputeStats()
    expect(p.stats.maxHp).toBe(125)
    expect(p.hp).toBe(75)
  })
})
