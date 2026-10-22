import type { Difficulty, Profile, RunSave, Settings, WeaponId } from './types'

const KEYS = {
  settings: 'shadow-protocol:settings:v1',
  profile: 'shadow-protocol:profile:v1',
  run: 'shadow-protocol:run:v1',
} as const

const WEAPON_IDS: readonly WeaponId[] = ['pulse', 'scatter', 'lancer', 'seeker']

function mediaMatches(query: string): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia(query).matches
  } catch {
    return false
  }
}

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.8,
    sfxVolume: 0.7,
    musicVolume: 0.45,
    muted: false,
    screenShake: mediaMatches('(prefers-reduced-motion: reduce)') ? 0.25 : 0.8,
    graphics: mediaMatches('(pointer: coarse)') ? 'medium' : 'high',
    damageNumbers: true,
    showFps: false,
    touchControls: 'auto',
    reducedMotion: mediaMatches('(prefers-reduced-motion: reduce)'),
  }
}

export function defaultProfile(): Profile {
  return {
    version: 1,
    highScore: 0,
    bestWave: 0,
    bestTime: 0,
    totalKills: 0,
    runs: 0,
    victories: 0,
    bossesDefeated: 0,
    unlockedWeapons: ['pulse'],
    hardUnlocked: false,
    tutorialSeen: false,
    introSeen: false,
    lastLoadout: { weapon: 'pulse', difficulty: 'normal' },
  }
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage may be full or blocked (private mode). Progress simply won't persist.
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const isWeapon = (v: unknown): v is WeaponId => typeof v === 'string' && (WEAPON_IDS as readonly string[]).includes(v)
const isDifficulty = (v: unknown): v is Difficulty => v === 'normal' || v === 'hard'

export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings()
  if (!isObj(raw)) return d
  return {
    masterVolume: num(raw.masterVolume, d.masterVolume, 0, 1),
    sfxVolume: num(raw.sfxVolume, d.sfxVolume, 0, 1),
    musicVolume: num(raw.musicVolume, d.musicVolume, 0, 1),
    muted: bool(raw.muted, d.muted),
    screenShake: num(raw.screenShake, d.screenShake, 0, 1),
    graphics: raw.graphics === 'low' || raw.graphics === 'medium' || raw.graphics === 'high' ? raw.graphics : d.graphics,
    damageNumbers: bool(raw.damageNumbers, d.damageNumbers),
    showFps: bool(raw.showFps, d.showFps),
    touchControls: raw.touchControls === 'on' || raw.touchControls === 'off' ? raw.touchControls : 'auto',
    reducedMotion: bool(raw.reducedMotion, d.reducedMotion),
  }
}

export function sanitizeProfile(raw: unknown): Profile {
  const d = defaultProfile()
  if (!isObj(raw)) return d
  const unlocked = Array.isArray(raw.unlockedWeapons) ? raw.unlockedWeapons.filter(isWeapon) : []
  if (!unlocked.includes('pulse')) unlocked.unshift('pulse')
  const loadout = isObj(raw.lastLoadout) ? raw.lastLoadout : {}
  const weapon = isWeapon(loadout.weapon) && unlocked.includes(loadout.weapon) ? loadout.weapon : 'pulse'
  const hardUnlocked = bool(raw.hardUnlocked, false)
  const difficulty = isDifficulty(loadout.difficulty) && (loadout.difficulty === 'normal' || hardUnlocked) ? loadout.difficulty : 'normal'
  return {
    version: 1,
    highScore: num(raw.highScore, 0, 0),
    bestWave: num(raw.bestWave, 0, 0),
    bestTime: num(raw.bestTime, 0, 0),
    totalKills: num(raw.totalKills, 0, 0),
    runs: num(raw.runs, 0, 0),
    victories: num(raw.victories, 0, 0),
    bossesDefeated: num(raw.bossesDefeated, 0, 0),
    unlockedWeapons: Array.from(new Set(unlocked)),
    hardUnlocked,
    tutorialSeen: bool(raw.tutorialSeen, false),
    // Added in v1.2; profiles saved before then simply lack it.
    introSeen: bool(raw.introSeen, false),
    lastLoadout: { weapon, difficulty },
  }
}

export function sanitizeRunSave(raw: unknown): RunSave | null {
  if (!isObj(raw) || raw.version !== 1) return null
  if (!isDifficulty(raw.difficulty) || !isWeapon(raw.startWeapon) || !isWeapon(raw.currentWeapon)) return null
  if (!Array.isArray(raw.weapons) || !isObj(raw.upgrades) || !isObj(raw.ammo)) return null
  const wave = num(raw.wave, 0, 0)
  if (wave < 2) return null
  const weapons = raw.weapons.filter(isWeapon)
  if (!weapons.includes('pulse')) weapons.unshift('pulse')
  const upgrades: RunSave['upgrades'] = {}
  for (const [k, v] of Object.entries(raw.upgrades)) {
    if (typeof v === 'number' && v > 0) (upgrades as Record<string, number>)[k] = Math.floor(v)
  }
  const ammo: RunSave['ammo'] = {}
  for (const [k, v] of Object.entries(raw.ammo)) {
    if (isWeapon(k) && typeof v === 'number') ammo[k] = Math.max(0, v)
  }
  return {
    version: 1,
    difficulty: raw.difficulty,
    startWeapon: raw.startWeapon,
    wave,
    score: num(raw.score, 0, 0),
    kills: num(raw.kills, 0, 0),
    time: num(raw.time, 0, 0),
    level: num(raw.level, 1, 1),
    xp: num(raw.xp, 0, 0),
    hp: num(raw.hp, 1, 1),
    shield: num(raw.shield, 0, 0),
    energy: num(raw.energy, 0, 0),
    upgrades,
    weapons,
    ammo,
    currentWeapon: weapons.includes(raw.currentWeapon) ? raw.currentWeapon : 'pulse',
    bossesDefeated: num(raw.bossesDefeated, 0, 0),
    shotsFired: num(raw.shotsFired, 0, 0),
    shotsHit: num(raw.shotsHit, 0, 0),
    damageDealt: num(raw.damageDealt, 0, 0),
    savedAt: num(raw.savedAt, Date.now()),
  }
}

type Listener = () => void

/** Minimal external store usable with React's useSyncExternalStore. */
export class ValueStore<T> {
  private value: T
  private listeners = new Set<Listener>()
  private readonly persist: (v: T) => void

  constructor(initial: T, persist: (v: T) => void) {
    this.value = initial
    this.persist = persist
  }

  get = (): T => this.value

  set(next: T): void {
    this.value = next
    this.persist(next)
    this.listeners.forEach((l) => l())
  }

  update(fn: (prev: T) => T): void {
    this.set(fn(this.value))
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const settingsStore = new ValueStore<Settings>(sanitizeSettings(readJson(KEYS.settings)), (v) =>
  writeJson(KEYS.settings, v),
)

export const profileStore = new ValueStore<Profile>(sanitizeProfile(readJson(KEYS.profile)), (v) =>
  writeJson(KEYS.profile, v),
)

export const runSaveStore = new ValueStore<RunSave | null>(sanitizeRunSave(readJson(KEYS.run)), (v) => {
  if (v) writeJson(KEYS.run, v)
  else removeKey(KEYS.run)
})

export function resetAllProgress(): void {
  profileStore.set(defaultProfile())
  runSaveStore.set(null)
}
