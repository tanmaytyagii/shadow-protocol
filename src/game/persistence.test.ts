import { describe, expect, it } from 'vitest'
import { defaultProfile, defaultSettings, sanitizeProfile, sanitizeRunSave, sanitizeSettings } from './persistence'
import type { RunSave } from './types'

const validSave: RunSave = {
  version: 1,
  difficulty: 'normal',
  startWeapon: 'scatter',
  wave: 4,
  score: 1200,
  kills: 80,
  time: 140,
  level: 6,
  xp: 12,
  hp: 70,
  shield: 20,
  energy: 50,
  upgrades: { damage: 2, firerate: 1 },
  weapons: ['pulse', 'scatter'],
  ammo: { scatter: 22 },
  currentWeapon: 'scatter',
  bossesDefeated: 0,
  shotsFired: 400,
  shotsHit: 250,
  damageDealt: 9000,
  savedAt: 1,
}

describe('sanitizeSettings', () => {
  it('falls back to defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(defaultSettings())
    expect(sanitizeSettings('nope')).toEqual(defaultSettings())
  })

  it('clamps volumes and rejects unknown enums', () => {
    const s = sanitizeSettings({ masterVolume: 4, sfxVolume: -1, graphics: 'ultra', touchControls: 'maybe', muted: 'yes' })
    expect(s.masterVolume).toBe(1)
    expect(s.sfxVolume).toBe(0)
    expect(s.graphics).toBe(defaultSettings().graphics)
    expect(s.touchControls).toBe('auto')
    expect(s.muted).toBe(false)
  })
})

describe('sanitizeProfile', () => {
  it('always keeps the pulse rifle and drops unknown weapons', () => {
    const p = sanitizeProfile({ unlockedWeapons: ['lancer', 'bfg9000'] })
    expect(p.unlockedWeapons).toEqual(['pulse', 'lancer'])
  })

  it('does not allow a locked loadout or difficulty', () => {
    const p = sanitizeProfile({ unlockedWeapons: ['pulse'], hardUnlocked: false, lastLoadout: { weapon: 'seeker', difficulty: 'hard' } })
    expect(p.lastLoadout).toEqual({ weapon: 'pulse', difficulty: 'normal' })
  })

  it('round-trips a valid profile', () => {
    const p = { ...defaultProfile(), highScore: 5000, unlockedWeapons: ['pulse', 'scatter'] as const, hardUnlocked: true }
    expect(sanitizeProfile(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('loads a v1.1 profile saved before the opening cinematic existed', () => {
    // Exactly what v1.1 wrote to storage: no introSeen field.
    const legacy = {
      version: 1,
      highScore: 33982,
      bestWave: 10,
      bestTime: 812.5,
      totalKills: 1450,
      runs: 7,
      victories: 1,
      bossesDefeated: 3,
      unlockedWeapons: ['pulse', 'scatter', 'lancer'],
      hardUnlocked: true,
      tutorialSeen: true,
      lastLoadout: { weapon: 'lancer', difficulty: 'hard' },
    }
    const p = sanitizeProfile(JSON.parse(JSON.stringify(legacy)))
    expect(p).toEqual({ ...legacy, introSeen: false })
  })

  it('remembers that the opening cinematic was seen', () => {
    expect(sanitizeProfile({ introSeen: true }).introSeen).toBe(true)
    expect(sanitizeProfile({ introSeen: 'yes' }).introSeen).toBe(false)
    const seen = { ...defaultProfile(), introSeen: true }
    expect(sanitizeProfile(JSON.parse(JSON.stringify(seen)))).toEqual(seen)
  })
})

describe('sanitizeRunSave', () => {
  it('accepts a valid save', () => {
    expect(sanitizeRunSave(JSON.parse(JSON.stringify(validSave)))).toEqual(validSave)
  })

  it('rejects corrupted or pointless saves', () => {
    expect(sanitizeRunSave(null)).toBeNull()
    expect(sanitizeRunSave({ ...validSave, version: 2 })).toBeNull()
    expect(sanitizeRunSave({ ...validSave, wave: 1 })).toBeNull()
    expect(sanitizeRunSave({ ...validSave, difficulty: 'easy' })).toBeNull()
    expect(sanitizeRunSave({ ...validSave, weapons: 'pulse' })).toBeNull()
  })

  it('repairs a current weapon the player does not own', () => {
    const s = sanitizeRunSave({ ...validSave, currentWeapon: 'lancer' })
    expect(s?.currentWeapon).toBe('pulse')
  })
})
