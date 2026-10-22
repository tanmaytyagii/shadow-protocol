import { COLORS } from '../constants'
import type { Enemy } from '../entities/Enemy'
import { POWERUPS, POWERUP_KINDS, Pickup, isPowerUp } from '../entities/Pickup'
import type { Game } from '../Game'
import { pick } from '../math'
import type { PickupKind } from '../types'

const MAX_XP_SHARDS = 220

export function spawnXp(g: Game, x: number, y: number, total: number): void {
  const shards = total >= 20 ? 6 : total >= 8 ? 3 : total >= 3 ? 2 : 1
  const per = total / shards
  let xpCount = 0
  for (const p of g.pickups) if (p.kind === 'xp') xpCount++
  for (let i = 0; i < shards; i++) {
    if (xpCount >= MAX_XP_SHARDS) {
      // Merge into an existing shard rather than flooding the arena.
      const existing = g.pickups.find((p) => p.kind === 'xp' && p.alive)
      if (existing) {
        existing.value += per
        existing.radius = Math.min(4 + existing.value * 0.6, 10)
        continue
      }
    }
    g.pickups.push(new Pickup('xp', x, y, per))
    xpCount++
  }
}

export function dropPickup(g: Game, kind: PickupKind, x: number, y: number, value = 1): Pickup {
  const p = new Pickup(kind, x, y, value)
  g.pickups.push(p)
  return p
}

/** Loot table for a defeated (non-boss) enemy. */
export function rollDrops(g: Game, e: Enemy): void {
  const p = g.player
  const hpFrac = p.hp / p.stats.maxHp
  const ownsSpecial = p.weapons.length > 1
  const big = e.kind === 'brute' || e.kind === 'splitter'
  const drops: PickupKind[] = []

  const roll = (chance: number, kind: PickupKind) => {
    if (Math.random() < chance) drops.push(kind)
  }

  if (e.elite) {
    roll(0.35, 'health')
    roll(ownsSpecial ? 0.4 : 0, 'ammo')
    roll(0.28, pick(POWERUP_KINDS))
    roll(0.07, 'chip')
    roll(0.25, 'core')
  } else {
    // Mercy drops: repair kits become far more common when the hull is low.
    roll(0.03 + (hpFrac < 0.4 ? 0.06 : 0) + (big ? 0.04 : 0), 'health')
    roll(0.028, 'energy')
    roll(ownsSpecial ? 0.05 + (big ? 0.05 : 0) : 0, 'ammo')
    roll(big ? 0.035 : 0.011, pick(POWERUP_KINDS))
    roll(0.004, 'chip')
    roll(0.007, 'core')
  }
  const limit = e.elite ? 3 : 1
  for (const kind of drops.slice(0, limit)) dropPickup(g, kind, e.x, e.y)
}

function wantsPickup(g: Game, kind: PickupKind): boolean {
  const p = g.player
  if (kind === 'health') return p.hp < p.stats.maxHp
  if (kind === 'energy') return p.energy < p.stats.energyMax - 1
  return true
}

export function updatePickups(g: Game, dt: number): void {
  const p = g.player
  const magnet = p.stats.magnetRadius
  const vacuum = g.director.state === 'intermission' || g.director.state === 'bossDown'
  for (const pk of g.pickups) {
    if (!pk.alive) continue
    pk.age += dt
    if (!(vacuum && pk.kind === 'xp')) pk.life -= dt
    if (pk.life <= 0) {
      pk.alive = false
      continue
    }
    const drag = Math.exp(-4 * dt)
    pk.vx *= drag
    pk.vy *= drag

    if (!p.alive) {
      pk.x += pk.vx * dt
      pk.y += pk.vy * dt
      continue
    }

    const dx = p.x - pk.x
    const dy = p.y - pk.y
    const d = Math.hypot(dx, dy) || 1
    const reach = pk.kind === 'xp' ? magnet : magnet * 0.65
    if (pk.age > 0.25 && wantsPickup(g, pk.kind) && (d < reach || (vacuum && pk.kind === 'xp'))) pk.magnetized = true
    if (pk.magnetized && !wantsPickup(g, pk.kind)) pk.magnetized = false

    if (pk.magnetized) {
      const pull = 2200 + pk.age * 200
      pk.vx += (dx / d) * pull * dt
      pk.vy += (dy / d) * pull * dt
      const sp = Math.hypot(pk.vx, pk.vy)
      const max = 950
      if (sp > max) {
        pk.vx = (pk.vx / sp) * max
        pk.vy = (pk.vy / sp) * max
      }
    }
    pk.x += pk.vx * dt
    pk.y += pk.vy * dt
    g.arena.resolve(pk)

    if (d < p.radius + pk.radius + 6 && pk.age > 0.15 && wantsPickup(g, pk.kind)) {
      pk.alive = false
      collect(g, pk)
    }
  }
  for (let i = g.pickups.length - 1; i >= 0; i--) if (!g.pickups[i].alive) g.pickups.splice(i, 1)
}

function collect(g: Game, pk: Pickup): void {
  const p = g.player
  const kind = pk.kind
  switch (kind) {
    case 'xp':
      g.gainXp(pk.value)
      g.sfx('xp', pk.x, 1, undefined, g.xpPitch())
      g.vfx.onPickup('xp', pk.x, pk.y)
      return
    case 'health': {
      const heal = Math.min(30, p.stats.maxHp - p.hp)
      p.hp += heal
      g.hudEvents.heal++
      g.fx.text(p.x, p.y - 26, `+${Math.round(heal)} HULL`, COLORS.mint, 15, 0.9)
      g.sfx('pickup', pk.x)
      break
    }
    case 'energy':
      p.energy = Math.min(p.stats.energyMax, p.energy + 50)
      p.boostLocked = false
      g.fx.text(p.x, p.y - 26, '+ENERGY', COLORS.blue, 14, 0.8)
      g.sfx('pickup', pk.x)
      break
    case 'ammo': {
      const special = p.weapons.filter((w) => w !== 'pulse')
      if (special.length === 0) {
        g.addScore(100)
        g.fx.text(p.x, p.y - 26, '+100', COLORS.amber, 14, 0.8)
      } else {
        for (const w of special) p.refillAmmo(w, 0.4)
        g.fx.text(p.x, p.y - 26, '+AMMO', COLORS.amber, 14, 0.8)
      }
      g.sfx('pickup', pk.x)
      break
    }
    case 'core': {
      const bonus = 300 + g.director.wave * 60
      g.addScore(bonus)
      g.fx.text(p.x, p.y - 26, `+${bonus}`, COLORS.cyanSoft, 16, 1)
      g.sfx('chip', pk.x)
      break
    }
    case 'chip':
      g.queueLevelUp('chip')
      g.toast('UPGRADE CHIP — free augment', 'power')
      g.sfx('chip', pk.x)
      break
    default:
      if (isPowerUp(kind)) {
        const def = POWERUPS[kind]
        p.powerUps[kind] = def.duration
        g.toast(`${def.name.toUpperCase()} — ${def.description}`, 'power')
        g.sfx('powerup', pk.x)
      }
  }
  g.vfx.onPickup(kind, pk.x, pk.y)
}
