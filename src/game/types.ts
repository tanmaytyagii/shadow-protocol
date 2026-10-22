// Shared type definitions for the engine and the UI layer.

export type Difficulty = 'normal' | 'hard'

export type WeaponId = 'pulse' | 'scatter' | 'lancer' | 'seeker'

export type EnemyKind = 'drone' | 'mite' | 'sentinel' | 'brute' | 'wraith' | 'splitter' | 'warden' | 'sovereign'

export type BossKind = 'warden' | 'sovereign'

export type PowerUpKind = 'overdrive' | 'aegis' | 'amplifier' | 'chrono'

export type PickupKind = 'xp' | 'health' | 'energy' | 'ammo' | 'chip' | 'core' | PowerUpKind

export type UpgradeId =
  | 'damage'
  | 'firerate'
  | 'speed'
  | 'crit'
  | 'critdmg'
  | 'hp'
  | 'shield'
  | 'dash'
  | 'energy'
  | 'magnet'
  | 'pierce'
  | 'multishot'
  | 'leech'
  | 'phaseblade'
  | 'volatile'
  | 'static'
  | 'ammo'
  | 'siphon'
  | 'weapon_scatter'
  | 'weapon_lancer'
  | 'weapon_seeker'

export type Rarity = 'common' | 'rare' | 'epic'

export type UpgradeIcon =
  | 'damage'
  | 'firerate'
  | 'speed'
  | 'crit'
  | 'health'
  | 'shield'
  | 'dash'
  | 'energy'
  | 'magnet'
  | 'pierce'
  | 'multishot'
  | 'leech'
  | 'blade'
  | 'explosive'
  | 'static'
  | 'ammo'
  | 'xp'
  | 'weapon'

/** Phase of the simulation. UI screens (settings, credits…) live in React state. */
export type GamePhase = 'idle' | 'playing' | 'paused' | 'levelup' | 'gameover' | 'victory'

export type GraphicsQuality = 'low' | 'medium' | 'high'

export interface Settings {
  masterVolume: number
  sfxVolume: number
  musicVolume: number
  muted: boolean
  screenShake: number
  graphics: GraphicsQuality
  damageNumbers: boolean
  showFps: boolean
  touchControls: 'auto' | 'on' | 'off'
  /** Disables distortion, zoom punches, strobing and decorative UI motion. */
  reducedMotion: boolean
}

export interface Profile {
  version: 1
  highScore: number
  bestWave: number
  bestTime: number
  totalKills: number
  runs: number
  victories: number
  bossesDefeated: number
  unlockedWeapons: WeaponId[]
  hardUnlocked: boolean
  tutorialSeen: boolean
  /** The opening cinematic has been watched or skipped; returning players go straight to the menu. */
  introSeen: boolean
  lastLoadout: { weapon: WeaponId; difficulty: Difficulty }
}

/** Snapshot of a run taken at the start of a wave; used by "Continue". */
export interface RunSave {
  version: 1
  difficulty: Difficulty
  startWeapon: WeaponId
  wave: number
  score: number
  kills: number
  time: number
  level: number
  xp: number
  hp: number
  shield: number
  energy: number
  upgrades: Partial<Record<UpgradeId, number>>
  weapons: WeaponId[]
  ammo: Partial<Record<WeaponId, number>>
  currentWeapon: WeaponId
  bossesDefeated: number
  shotsFired: number
  shotsHit: number
  damageDealt: number
  savedAt: number
}

export interface RunConfig {
  difficulty: Difficulty
  startWeapon: WeaponId
  save?: RunSave
}

export interface UpgradeCard {
  id: UpgradeId
  name: string
  description: string
  rarity: Rarity
  icon: UpgradeIcon
  currentStacks: number
  maxStacks: number
  weapon?: WeaponId
}

export interface LevelUpOffer {
  key: number
  level: number
  source: 'level' | 'chip'
  cards: UpgradeCard[]
}

export interface WeaponHud {
  id: WeaponId
  name: string
  color: string
  ammo: number | null
  maxAmmo: number | null
  slot: number
}

export interface PowerUpHud {
  kind: PowerUpKind
  remaining: number
  duration: number
}

export interface BossHud {
  name: string
  title: string
  hp: number
  maxHp: number
  phase: number
  phases: number
  shielded: boolean
}

export interface HudSnapshot {
  hp: number
  maxHp: number
  shield: number
  maxShield: number
  energy: number
  maxEnergy: number
  level: number
  xp: number
  xpToNext: number
  score: number
  /** Rolling display value for the score counter. */
  scoreShown: number
  combo: number
  comboMult: number
  comboTimer: number
  wave: number
  totalWaves: number
  waveState: 'combat' | 'intermission' | 'boss' | 'intro'
  intermission: number
  enemiesLeft: number
  /** Hostiles this wave started with; with enemiesLeft gives encounter progress. */
  waveTotal: number
  time: number
  kills: number
  dashReady: number
  boosting: boolean
  weapons: WeaponHud[]
  currentWeapon: WeaponId
  powerUps: PowerUpHud[]
  boss: BossHud | null
  lowHealth: boolean
  difficulty: Difficulty
  /** Boss arrival in progress: letterbox the frame. */
  cinematic: boolean
  /** Monotonic counters the UI keys animations on (hit shakes, pings, flashes). */
  events: HudEvents
}

export interface HudEvents {
  hurt: number
  shield: number
  heal: number
  dash: number
  boss: number
}

export interface Banner {
  id: number
  title: string
  subtitle?: string
  tone: 'info' | 'success' | 'danger' | 'boss'
  duration: number
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'warning' | 'power'
}

export interface RunSummary {
  outcome: 'defeat' | 'victory'
  difficulty: Difficulty
  score: number
  time: number
  kills: number
  wave: number
  level: number
  bossesDefeated: number
  accuracy: number
  damageDealt: number
  bestScore: number
  newRecord: boolean
  newUnlocks: string[]
  upgrades: { name: string; stacks: number }[]
}
