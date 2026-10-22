import { TOTAL_WAVES } from './constants'
import type { Banner, GamePhase, HudSnapshot, LevelUpOffer, RunSummary, Toast } from './types'

export interface UiState {
  phase: GamePhase
  hud: HudSnapshot
  levelUp: LevelUpOffer | null
  banner: Banner | null
  toasts: Toast[]
  summary: RunSummary | null
  fps: number
  /** Adaptive quality step (0 = full quality). */
  qualityStep: number
  fatalError: string | null
}

export function emptyHud(): HudSnapshot {
  return {
    hp: 100,
    maxHp: 100,
    shield: 0,
    maxShield: 0,
    energy: 100,
    maxEnergy: 100,
    level: 1,
    xp: 0,
    xpToNext: 10,
    score: 0,
    scoreShown: 0,
    combo: 0,
    comboMult: 1,
    comboTimer: 0,
    wave: 1,
    totalWaves: TOTAL_WAVES,
    waveState: 'intro',
    intermission: 0,
    enemiesLeft: 0,
    waveTotal: 0,
    time: 0,
    kills: 0,
    dashReady: 1,
    boosting: false,
    weapons: [],
    currentWeapon: 'pulse',
    powerUps: [],
    boss: null,
    lowHealth: false,
    difficulty: 'normal',
    cinematic: false,
    events: { hurt: 0, shield: 0, heal: 0, dash: 0, boss: 0 },
  }
}

type Listener = () => void

/**
 * Bridge between the imperative game engine and React. The engine writes here
 * sparingly (phase changes immediately, HUD at a throttled rate) so React never
 * re-renders at frame rate.
 */
export class GameStore {
  private state: UiState = {
    phase: 'idle',
    hud: emptyHud(),
    levelUp: null,
    banner: null,
    toasts: [],
    summary: null,
    fps: 0,
    qualityStep: 0,
    fatalError: null,
  }
  private listeners = new Set<Listener>()

  getState = (): UiState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  set(partial: Partial<UiState>): void {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((l) => l())
  }
}
