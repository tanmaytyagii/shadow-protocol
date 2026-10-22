import type { Settings } from '../types'

export const SFX_NAMES = [
  'pulse',
  'scatter',
  'lancer',
  'seeker',
  'hit',
  'crit',
  'enemyDeath',
  'explosion',
  'bigExplosion',
  'xp',
  'pickup',
  'powerup',
  'levelup',
  'dash',
  'playerHit',
  'shieldBreak',
  'enemyShoot',
  'bossCharge',
  'bossSlam',
  'laserCharge',
  'laserFire',
  'waveStart',
  'waveClear',
  'victory',
  'defeat',
  'uiClick',
  'uiHover',
  'dryFire',
  'swap',
  'spawn',
  'bossRoar',
  'emp',
  'mineArm',
  'chip',
  'telegraph',
  'stompWindup',
  'bossPhase',
  'warp',
  'introTick',
  'introSurge',
  'introTitle',
] as const

export type SfxName = (typeof SFX_NAMES)[number]

export type MusicMode = 'off' | 'menu' | 'combat' | 'boss'

export interface PlayOptions {
  pitch?: number
  volume?: number
  pan?: number
  duration?: number
}

/** Minimum seconds between two plays of the same sound, to avoid harsh stacking. */
const THROTTLE: Partial<Record<SfxName, number>> = {
  hit: 0.035,
  crit: 0.05,
  enemyDeath: 0.04,
  explosion: 0.06,
  xp: 0.018,
  enemyShoot: 0.045,
  uiHover: 0.04,
  dryFire: 0.15,
  spawn: 0.12,
  mineArm: 0.08,
  pickup: 0.04,
  telegraph: 0.1,
  introTick: 0.05,
}

const MAX_VOICES = 48

/**
 * Per-effect mix trims (linear gain), set from offline loudness measurements
 * (`npm run audio:levels`) rather than by ear, so the effects keep their
 * character but sit in a consistent hierarchy at default volumes:
 * rare big events ~-24..-27 LUFS, heavy impacts ~-29..-33, weapons and player
 * feedback ~-33..-41, cues and stingers ~-30..-39, frequent small sounds
 * ~-42..-50, interface ~-47..-56 (momentary, K-weighted).
 */
const MIX: Partial<Record<SfxName, number>> = {
  pulse: 2.5,
  seeker: 3.2,
  scatter: 0.89,
  lancer: 0.75,
  hit: 3,
  crit: 1.65,
  enemyDeath: 0.86,
  explosion: 0.74,
  bigExplosion: 0.69,
  bossSlam: 0.51,
  bossPhase: 0.77,
  emp: 0.75,
  stompWindup: 0.79,
  telegraph: 3.8,
  bossCharge: 1.48,
  laserCharge: 2.2,
  laserFire: 0.89,
  warp: 1.38,
  victory: 2.45,
  defeat: 0.66,
  levelup: 1.45,
  waveStart: 2,
  waveClear: 1.16,
  playerHit: 1.7,
  shieldBreak: 1.12,
  dash: 2.1,
  enemyShoot: 1.9,
  xp: 1.4,
  mineArm: 1.5,
  swap: 1.22,
  dryFire: 1.74,
  uiClick: 2.1,
  uiHover: 2.2,
  introTick: 3.2,
  introSurge: 0.63,
  introTitle: 0.56,
}

/** Gain of the reactor ambience at level 1, before the music volume. */
const AMBIENCE_GAIN = 0.09

/** Offline measurement of one sound or passage (see AudioEngine.measure). */
export interface LevelReport {
  /** Sample peak, dBFS. */
  peakDb: number
  /** Loudest 100 ms window, K-weighted (close to momentary LUFS). */
  loudness: number
  /** Mean K-weighted loudness over the part of the sound above -50 dBFS. */
  integrated: number
  /** Seconds above -50 dBFS. */
  duration: number
}

const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** Peak and K-weighted loudness of an offline render (channel 0 raw, channel 1 weighted). */
function analyse(buf: AudioBuffer): LevelReport {
  const raw = buf.getChannelData(0)
  const k = buf.getChannelData(1)
  const rate = buf.sampleRate
  const db = (v: number) => (v > 0 ? 10 * Math.log10(v) : -120)
  let peak = 0
  let first = -1
  let last = -1
  for (let i = 0; i < raw.length; i++) {
    const a = Math.abs(raw[i])
    if (a > peak) peak = a
    if (a > 0.00316) {
      if (first < 0) first = i
      last = i
    }
  }
  const win = Math.round(rate * 0.1)
  const hop = Math.round(rate * 0.01)
  let maxMs = 0
  let sum = 0
  for (let i = 0; i < k.length; i++) {
    sum += k[i] * k[i]
    if (i >= win) sum -= k[i - win] * k[i - win]
    if (i >= win - 1 && (i - win + 1) % hop === 0) maxMs = Math.max(maxMs, sum / win)
  }
  if (k.length < win) maxMs = sum / Math.max(1, k.length)
  let active = 0
  if (first >= 0) for (let i = first; i <= last; i++) active += k[i] * k[i]
  const span = first >= 0 ? last - first + 1 : 0
  return {
    peakDb: 20 * Math.log10(Math.max(peak, 1e-6)),
    loudness: db(maxMs) - 0.691,
    integrated: span > 0 ? db(active / span) - 0.691 : -120,
    duration: span / rate,
  }
}

interface ModeDef {
  bpm: number
  chords: number[][]
  drums: 0 | 1 | 2
  arp: 0 | 1 | 2
  pad: number
}

const MODES: Record<Exclude<MusicMode, 'off'>, ModeDef> = {
  menu: {
    bpm: 88,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ],
    drums: 0,
    arp: 1,
    pad: 1,
  },
  combat: {
    bpm: 112,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [50, 53, 57],
      [52, 56, 59],
    ],
    drums: 1,
    arp: 2,
    pad: 0.7,
  },
  boss: {
    bpm: 126,
    chords: [
      [50, 53, 57],
      [46, 50, 53],
      [43, 46, 50],
      [45, 49, 52],
    ],
    drums: 2,
    arp: 2,
    pad: 0.6,
  },
}

const BASS_PATTERN = [0, 0, 12, 0, 0, 12, 0, 7]

export class AudioEngine {
  /** Every effect the engine can synthesise (diagnostics and tests). */
  static readonly SFX = SFX_NAMES

  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private musicFilter: BiquadFilterNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private lastPlayed = new Map<SfxName, number>()
  private voices = 0
  private settings: Settings | null = null
  private failed = false

  private mode: MusicMode = 'off'
  private pendingMode: MusicMode = 'off'
  private step = 0
  private nextStepTime = 0
  private schedulerId: number | null = null

  /** Reactor hum: per-context level, and a bus that follows the music volume. */
  private ambience: { level: GainNode; bus: GainNode } | null = null
  private ambienceLevel = 0
  /** True while voices are being built into an offline render. */
  private offline = false
  /** Effects requested by the game, by name (diagnostics and tests). */
  readonly requested: Partial<Record<SfxName, number>> = {}

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  /** 'locked' until the first user gesture creates the audio context. */
  get state(): 'locked' | 'unavailable' | AudioContextState {
    if (this.failed) return 'unavailable'
    return this.ctx ? this.ctx.state : 'locked'
  }

  /** Current master gain (0 while muted), for diagnostics and tests. */
  get masterGain(): number {
    return this.master ? this.master.gain.value : 0
  }

  /** Must be invoked from a user gesture; safe to call repeatedly. */
  unlock(): void {
    if (this.failed) return
    try {
      if (!this.ctx) this.build()
      // Also recovers from Safari's 'interrupted' state (calls, other apps taking audio).
      const ctx = this.ctx
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => undefined)
    } catch {
      this.failed = true
      this.ctx = null
    }
  }

  private build(): void {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) {
      this.failed = true
      return
    }
    const ctx = new Ctor({ latencyHint: 'interactive' })
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -12
    limiter.knee.value = 8
    limiter.ratio.value = 6
    limiter.attack.value = 0.003
    limiter.release.value = 0.2
    limiter.connect(ctx.destination)

    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(limiter)

    const sfx = ctx.createGain()
    sfx.connect(master)

    const musicFilter = ctx.createBiquadFilter()
    musicFilter.type = 'lowpass'
    musicFilter.frequency.value = 18000
    musicFilter.connect(master)

    const music = ctx.createGain()
    music.connect(musicFilter)

    // Gentle tempo-free echo for the music bus.
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.27
    const feedback = ctx.createGain()
    feedback.gain.value = 0.28
    const delayTone = ctx.createBiquadFilter()
    delayTone.type = 'lowpass'
    delayTone.frequency.value = 2200
    music.connect(delay)
    delay.connect(delayTone)
    delayTone.connect(feedback)
    feedback.connect(delay)
    delayTone.connect(musicFilter)

    this.ctx = ctx
    this.master = master
    this.sfxBus = sfx
    this.musicBus = music
    this.musicFilter = musicFilter
    this.noiseBuffer = makeNoise(ctx)
    if (this.settings) this.applySettings(this.settings)
    if (this.pendingMode !== 'off') this.startScheduler()
    if (this.ambienceLevel > 0) this.setAmbience(this.ambienceLevel)
  }

  applySettings(s: Settings): void {
    this.settings = s
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.masterVolume * 0.9, t, 0.05)
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.05)
    this.musicBus.gain.setTargetAtTime(s.musicVolume * 0.55, t, 0.05)
    this.ambience?.bus.gain.setTargetAtTime(s.musicVolume * 0.55, t, 0.05)
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined)
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
  }

  setMuffled(muffled: boolean): void {
    if (!this.ctx || !this.musicFilter) return
    this.musicFilter.frequency.setTargetAtTime(muffled ? 650 : 18000, this.ctx.currentTime, 0.12)
  }

  dispose(): void {
    this.stopScheduler()
    if (this.ctx) void this.ctx.close().catch(() => undefined)
    this.ctx = null
    this.master = null
    this.sfxBus = null
    this.musicBus = null
    this.musicFilter = null
    this.ambience = null
    this.lastPlayed.clear()
    this.voices = 0
  }

  // --- Ambience ----------------------------------------------------------------

  /**
   * Restrained reactor hum under everything: a low A with its octave, a faint
   * fifth and band-passed "ventilation" air, breathing slowly. 0 silences it.
   * Remembered while audio is still locked and applied once it unlocks.
   */
  setAmbience(level: number): void {
    this.ambienceLevel = Math.max(0, level)
    const ctx = this.ctx
    if (!ctx || !this.musicFilter) return
    if (!this.ambience) {
      if (this.ambienceLevel === 0) return
      this.ambience = this.buildAmbience(ctx, this.musicFilter)
    }
    this.ambience.level.gain.setTargetAtTime(this.ambienceLevel * AMBIENCE_GAIN, ctx.currentTime, 0.6)
  }

  private buildAmbience(ctx: AudioContext, out: AudioNode): { level: GainNode; bus: GainNode } {
    const bus = ctx.createGain()
    bus.gain.value = this.settings ? this.settings.musicVolume * 0.55 : 0.25
    bus.connect(out)
    const level = ctx.createGain()
    level.gain.value = 0
    level.connect(bus)
    const breath = ctx.createGain()
    breath.gain.value = 1
    breath.connect(level)
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 900
    tone.connect(breath)

    const hum: [OscillatorType, number, number, number][] = [
      ['sine', 55, 0, 0.5],
      ['triangle', 110, 5, 0.22],
      ['sine', 164.81, -4, 0.06],
    ]
    for (const [type, freq, detune, gain] of hum) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      o.detune.value = detune
      const g = ctx.createGain()
      g.gain.value = gain
      o.connect(g)
      g.connect(tone)
      o.start()
    }
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.21
    const depth = ctx.createGain()
    depth.gain.value = 0.18
    lfo.connect(depth)
    depth.connect(breath.gain)
    lfo.start()

    if (this.noiseBuffer) {
      const air = ctx.createBufferSource()
      air.buffer = this.noiseBuffer
      air.loop = true
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = 380
      band.Q.value = 0.9
      const airGain = ctx.createGain()
      airGain.gain.value = 0.05
      const drift = ctx.createOscillator()
      drift.frequency.value = 0.07
      const driftDepth = ctx.createGain()
      driftDepth.gain.value = 120
      drift.connect(driftDepth)
      driftDepth.connect(band.frequency)
      air.connect(band)
      band.connect(airGain)
      airGain.connect(tone)
      air.start()
      drift.start()
    }
    return { level, bus }
  }

  // --- Music -----------------------------------------------------------------

  setMusic(mode: MusicMode): void {
    if (mode === this.pendingMode) return
    this.pendingMode = mode
    if (mode === 'off') {
      this.mode = 'off'
      this.stopScheduler()
      return
    }
    if (this.mode === 'off') {
      // Start immediately on the next bar boundary of a fresh sequence.
      this.mode = mode
      this.step = 0
      if (this.ctx) this.nextStepTime = this.ctx.currentTime + 0.08
    }
    this.startScheduler()
  }

  private startScheduler(): void {
    if (!this.ctx || this.schedulerId !== null) return
    this.nextStepTime = Math.max(this.nextStepTime, this.ctx.currentTime + 0.05)
    this.schedulerId = window.setInterval(this.schedule, 25)
  }

  private stopScheduler(): void {
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId)
      this.schedulerId = null
    }
  }

  private schedule = (): void => {
    const ctx = this.ctx
    if (!ctx || this.mode === 'off') return
    if (ctx.state !== 'running') {
      this.nextStepTime = ctx.currentTime + 0.05
      return
    }
    // If we fell far behind (tab throttled), resync instead of bursting notes.
    if (this.nextStepTime < ctx.currentTime - 0.2) this.nextStepTime = ctx.currentTime + 0.05
    while (this.nextStepTime < ctx.currentTime + 0.14) {
      if (this.step % 16 === 0 && this.pendingMode !== this.mode && this.pendingMode !== 'off') {
        this.mode = this.pendingMode
      }
      const def = MODES[this.mode as Exclude<MusicMode, 'off'>]
      if (this.musicBus) this.playStep(def, this.step, this.nextStepTime, this.musicBus)
      this.nextStepTime += 60 / def.bpm / 4
      this.step++
    }
  }

  private playStep(def: ModeDef, step: number, t: number, bus: AudioNode): void {
    const bar = Math.floor(step / 16) % def.chords.length
    const s = step % 16
    const chord = def.chords[bar]
    const stepDur = 60 / def.bpm / 4

    if (s === 0) {
      for (const note of chord) this.padNote(midi(note), t, stepDur * 16, 0.022 * def.pad, bus)
    }

    const bassEvery = def.drums === 0 ? 4 : 2
    if (s % bassEvery === 0) {
      const offset = BASS_PATTERN[(s / 2) % BASS_PATTERN.length]
      this.bassNote(midi(chord[0] - 24 + offset), t, def.drums === 0 ? 0.5 : 0.2, def.drums === 2 ? 0.12 : 0.1, bus)
    }

    const arpEvery = def.arp === 2 ? 1 : 2
    if (def.arp > 0 && s % arpEvery === 0) {
      const idx = Math.floor(step / arpEvery)
      const note = chord[idx % 3] + 12 * (1 + (Math.floor(idx / 3) % 2))
      const vol = def.drums === 0 ? 0.018 : 0.022
      if (def.drums > 0 || s % 4 === 0) this.pluck(midi(note), t, vol, bus)
    }

    if (def.drums >= 1) {
      if (s % 4 === 0) this.kick(t, bus)
      if (s === 4 || s === 12) this.snare(t, bus)
      const hatEvery = def.drums === 2 ? 1 : 2
      if (s % hatEvery === 0 && s % 4 !== 0) this.hat(t, s % 2 === 0 ? 0.035 : 0.02, bus)
    } else if (s === 8) {
      this.hat(t, 0.015, bus)
    }
  }

  private padNote(freq: number, t: number, dur: number, peak: number, out: AudioNode): void {
    const ctx = this.ctx
    if (!ctx) return
    const g = ctx.createGain()
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 1000
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.25)
    g.gain.setValueAtTime(peak, t + dur * 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05)
    f.connect(g)
    g.connect(out)
    for (const detune of [-8, 8]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = freq
      o.detune.value = detune
      o.connect(f)
      o.start(t)
      o.stop(t + dur * 1.1)
    }
  }

  private bassNote(freq: number, t: number, dur: number, peak: number, out: AudioNode): void {
    const ctx = this.ctx
    if (!ctx) return
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = freq
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 6
    f.frequency.setValueAtTime(1100, t)
    f.frequency.exponentialRampToValueAtTime(220, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(f)
    f.connect(g)
    g.connect(out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private pluck(freq: number, t: number, peak: number, out: AudioNode): void {
    const ctx = this.ctx
    if (!ctx) return
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = freq
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(3200, t)
    f.frequency.exponentialRampToValueAtTime(600, t + 0.14)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    o.connect(f)
    f.connect(g)
    g.connect(out)
    o.start(t)
    o.stop(t + 0.18)
  }

  private kick(t: number, out: AudioNode): void {
    const ctx = this.ctx
    if (!ctx) return
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    o.connect(g)
    g.connect(out)
    o.start(t)
    o.stop(t + 0.3)
  }

  private snare(t: number, out: AudioNode): void {
    this.noiseVoice(t, 0.14, 0.09, out, 'bandpass', 1900, 1500, 0.8)
  }

  private hat(t: number, peak: number, out: AudioNode): void {
    this.noiseVoice(t, 0.035, peak, out, 'highpass', 7500, 7500, 0.7)
  }

  // --- SFX -------------------------------------------------------------------

  play(name: SfxName, opts: PlayOptions = {}): void {
    this.requested[name] = (this.requested[name] ?? 0) + 1
    const ctx = this.ctx
    const bus = this.sfxBus
    if (!ctx || !bus || ctx.state !== 'running' || this.settings?.muted) return
    const now = ctx.currentTime
    const throttle = THROTTLE[name]
    if (throttle !== undefined) {
      const last = this.lastPlayed.get(name) ?? -1
      if (now - last < throttle) return
    }
    if (this.voices >= MAX_VOICES) return
    this.lastPlayed.set(name, now)

    let out: AudioNode = bus
    const vol = (opts.volume ?? 1) * (MIX[name] ?? 1)
    if (vol !== 1 || opts.pan !== undefined) {
      const g = ctx.createGain()
      g.gain.value = vol
      if (opts.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner()
        p.pan.value = Math.max(-1, Math.min(1, opts.pan))
        g.connect(p)
        p.connect(bus)
      } else {
        g.connect(bus)
      }
      out = g
    }
    this.voice(name, out, now + 0.002, opts)
  }

  /** Synthesises one effect into `out`, starting at context time `t`. */
  private voice(name: SfxName, out: AudioNode, t: number, opts: PlayOptions): void {
    const p = opts.pitch ?? 1
    const v = (f: number) => f * p * (0.97 + Math.random() * 0.06)

    switch (name) {
      case 'pulse':
        this.tone('square', v(1100), v(360), t, 0.06, 0.04, out)
        this.tone('sine', v(2300), v(900), t, 0.04, 0.018, out)
        break
      case 'scatter':
        this.noiseVoice(t, 0.16, 0.16, out, 'lowpass', 4200, 300, 0.7)
        this.tone('sine', 150, 45, t, 0.15, 0.22, out)
        break
      case 'lancer':
        this.tone('sawtooth', v(2400), v(150), t, 0.24, 0.055, out)
        this.noiseVoice(t, 0.07, 0.09, out, 'highpass', 3200, 3200, 0.7)
        this.tone('sine', 95, 38, t, 0.22, 0.2, out)
        break
      case 'seeker':
        this.tone('triangle', v(320), v(1150), t, 0.1, 0.05, out)
        this.noiseVoice(t, 0.12, 0.035, out, 'bandpass', 1400, 2600, 1.2)
        break
      case 'hit':
        this.noiseVoice(t, 0.045, 0.07, out, 'bandpass', v(1900), v(1200), 1.4)
        this.tone('square', v(320), v(120), t, 0.035, 0.016, out)
        break
      case 'crit':
        this.tone('sine', v(1700), v(2700), t, 0.07, 0.045, out)
        this.noiseVoice(t, 0.05, 0.07, out, 'bandpass', 2600, 1800, 1.5)
        break
      case 'enemyDeath':
        this.noiseVoice(t, 0.24, 0.13, out, 'lowpass', v(2600), 180, 0.8)
        this.tone('sine', v(240), v(48), t, 0.22, 0.13, out)
        break
      case 'explosion':
        this.noiseVoice(t, 0.45, 0.22, out, 'lowpass', 1900, 110, 0.7)
        this.tone('sine', 115, 30, t, 0.42, 0.26, out)
        break
      case 'bigExplosion':
        this.noiseVoice(t, 1.1, 0.32, out, 'lowpass', 2400, 60, 0.6)
        this.tone('sine', 85, 22, t, 1.0, 0.34, out)
        this.tone('sawtooth', 70, 28, t, 0.7, 0.05, out)
        break
      case 'xp':
        this.tone('sine', 880 * p, 1320 * p, t, 0.055, 0.03, out)
        break
      case 'pickup':
        this.tone('triangle', v(620), v(940), t, 0.07, 0.07, out)
        this.tone('triangle', v(940), v(1400), t + 0.06, 0.08, 0.06, out)
        break
      case 'chip':
        this.arp([72, 79, 84, 91], t, 0.05, 0.09, 'square', 0.035, out)
        this.tone('sine', 523, 1046, t, 0.4, 0.04, out)
        break
      case 'powerup':
        this.arp([72, 76, 79, 84], t, 0.06, 0.12, 'square', 0.04, out)
        this.tone('triangle', 262, 523, t, 0.4, 0.05, out)
        break
      case 'levelup':
        this.arp([69, 73, 76, 81, 85], t, 0.07, 0.22, 'triangle', 0.07, out)
        this.arp([81, 88], t + 0.32, 0.08, 0.3, 'sine', 0.04, out)
        break
      case 'dash':
        this.noiseVoice(t, 0.22, 0.11, out, 'bandpass', 450, 3200, 2.2)
        this.tone('sine', 220, 640, t, 0.13, 0.035, out)
        break
      case 'playerHit':
        this.tone('square', 190, 55, t, 0.16, 0.09, out)
        this.noiseVoice(t, 0.13, 0.14, out, 'lowpass', 1400, 300, 0.8)
        break
      case 'shieldBreak':
        this.tone('triangle', 1700, 180, t, 0.38, 0.07, out)
        this.noiseVoice(t, 0.22, 0.06, out, 'highpass', 4000, 1800, 0.7)
        break
      case 'enemyShoot':
        this.tone('triangle', v(720), v(340), t, 0.09, 0.035, out)
        break
      case 'bossCharge':
        this.tone('sawtooth', 60, 230, t, 0.85, 0.06, out, 'lowpass', 900)
        break
      case 'bossSlam':
        this.tone('sine', 72, 24, t, 0.65, 0.38, out)
        this.noiseVoice(t, 0.55, 0.26, out, 'lowpass', 1000, 70, 0.7)
        break
      case 'laserCharge':
        this.tone('sawtooth', 190, 950, t, 1.05, 0.035, out, 'lowpass', 1600)
        break
      case 'laserFire': {
        const d = opts.duration ?? 2
        this.sustained('sawtooth', 112, t, d, 0.05, out, 1400)
        this.sustained('square', 56, t, d, 0.04, out, 700)
        break
      }
      case 'waveStart':
        this.tone('square', 660, 660, t, 0.11, 0.035, out, 'lowpass', 2200)
        this.tone('square', 880, 880, t + 0.14, 0.11, 0.035, out, 'lowpass', 2200)
        this.tone('square', 660, 660, t + 0.28, 0.11, 0.035, out, 'lowpass', 2200)
        this.tone('square', 880, 880, t + 0.42, 0.16, 0.035, out, 'lowpass', 2200)
        break
      case 'waveClear':
        this.arp([72, 76, 79], t, 0.07, 0.5, 'triangle', 0.05, out)
        this.tone('sine', 1046, 1046, t + 0.22, 0.5, 0.03, out)
        break
      case 'victory':
        this.arp([60, 64, 67, 72, 67, 72, 76, 79, 84], t, 0.13, 0.4, 'triangle', 0.07, out)
        this.arp([36, 43, 48], t, 0.39, 0.9, 'sawtooth', 0.04, out, 900)
        break
      case 'defeat':
        this.arp([64, 60, 57, 53, 48], t, 0.22, 0.45, 'sawtooth', 0.045, out, 1100)
        this.tone('sine', 110, 40, t + 0.9, 1.2, 0.18, out)
        break
      case 'uiClick':
        this.tone('square', 1250, 900, t, 0.035, 0.025, out, 'lowpass', 4000)
        break
      case 'uiHover':
        this.tone('sine', 1900, 1900, t, 0.025, 0.01, out)
        break
      case 'dryFire':
        this.tone('square', 230, 200, t, 0.035, 0.025, out, 'lowpass', 1200)
        break
      case 'swap':
        this.noiseVoice(t, 0.04, 0.04, out, 'highpass', 3000, 3000, 0.7)
        this.tone('square', 480, 760, t + 0.02, 0.05, 0.025, out, 'lowpass', 2500)
        break
      case 'spawn':
        this.tone('sine', 330, 110, t, 0.28, 0.028, out)
        this.noiseVoice(t, 0.22, 0.02, out, 'bandpass', 800, 2400, 2)
        break
      case 'bossRoar':
        this.tone('sawtooth', 58, 40, t, 1.3, 0.1, out, 'lowpass', 700)
        this.tone('square', 87, 60, t, 1.2, 0.05, out, 'lowpass', 500)
        this.noiseVoice(t, 1.0, 0.08, out, 'lowpass', 600, 200, 0.7)
        break
      case 'emp':
        this.tone('sine', 420, 55, t, 0.5, 0.2, out)
        this.noiseVoice(t, 0.32, 0.1, out, 'highpass', 5000, 1200, 0.7)
        break
      case 'mineArm':
        this.tone('square', 1400, 1400, t, 0.05, 0.022, out, 'lowpass', 3000)
        this.tone('square', 1400, 1400, t + 0.09, 0.05, 0.022, out, 'lowpass', 3000)
        break

      // --- Boss readability: each attack family announces itself ---------------
      case 'telegraph':
        // Clean two-step "lock-on" chirp; pitch distinguishes the attack.
        this.tone('triangle', 620 * p, 1240 * p, t, 0.09, 0.05, out)
        this.tone('triangle', 930 * p, 1860 * p, t + 0.1, 0.09, 0.045, out)
        break
      case 'stompWindup':
        // Ground rumble swelling into the slam.
        this.noiseVoice(t, 0.72, 0.12, out, 'lowpass', 420, 160, 0.8, 0.55)
        this.tone('sine', 44, 72, t, 0.72, 0.11, out, undefined, undefined, 0.5)
        break
      case 'bossPhase':
        // Tritone swell over a sub hit: unmistakably "the fight just changed".
        this.tone('sawtooth', midi(50), midi(50), t, 1.3, 0.045, out, 'lowpass', 1200, 0.22)
        this.tone('sawtooth', midi(56), midi(56), t, 1.3, 0.04, out, 'lowpass', 1200, 0.22)
        this.tone('sine', 62, 28, t, 0.9, 0.24, out)
        this.noiseVoice(t, 0.7, 0.05, out, 'highpass', 2600, 700, 0.7)
        break
      case 'warp':
        this.tone('sine', 1400, 190, t, 0.36, 0.06, out)
        this.noiseVoice(t, 0.3, 0.04, out, 'bandpass', 3000, 600, 1.4)
        break

      // --- Opening cinematic --------------------------------------------------------
      case 'introTick':
        this.tone('sine', 1760 * p, 1760 * p, t, 0.035, 0.014, out)
        this.noiseVoice(t, 0.012, 0.012, out, 'highpass', 6000, 6000, 0.7)
        break
      case 'introSurge':
        // Power coming online: rising whine, the bus closing, air rushing out.
        this.tone('triangle', 220, 880, t, 0.4, 0.03, out, 'lowpass', 2000, 0.3)
        this.tone('sine', 72, 38, t + 0.1, 0.7, 0.16, out)
        this.noiseVoice(t + 0.1, 1.3, 0.07, out, 'bandpass', 2400, 260, 0.9)
        break
      case 'introTitle':
        // A deep, soft landing with a faint chime above it.
        this.tone('sine', 55, 30, t, 1.5, 0.16, out)
        for (const n of [69, 76, 81]) this.tone('triangle', midi(n), midi(n), t + 0.04, 1.8, 0.018, out, undefined, undefined, 0.18)
        this.noiseVoice(t, 1.1, 0.04, out, 'lowpass', 3200, 380, 0.7)
        break
    }
  }

  private trackVoice(node: AudioScheduledSourceNode): void {
    if (this.offline) return
    this.voices++
    node.onended = () => {
      this.voices = Math.max(0, this.voices - 1)
    }
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    t: number,
    dur: number,
    peak: number,
    out: AudioNode,
    filterType?: BiquadFilterType,
    filterFreq?: number,
    attack?: number,
  ): void {
    const ctx = this.ctx
    if (!ctx) return
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(Math.max(20, f0), t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + (attack ?? Math.min(0.006, dur * 0.2)))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    let node: AudioNode = o
    if (filterType) {
      const f = ctx.createBiquadFilter()
      f.type = filterType
      f.frequency.value = filterFreq ?? 1000
      o.connect(f)
      node = f
    }
    node.connect(g)
    g.connect(out)
    this.trackVoice(o)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private sustained(type: OscillatorType, freq: number, t: number, dur: number, peak: number, out: AudioNode, lp: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 14
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 6
    lfo.connect(lfoGain)
    lfoGain.connect(o.frequency)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = lp
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.05)
    g.gain.setValueAtTime(peak, t + Math.max(0.06, dur - 0.15))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(f)
    f.connect(g)
    g.connect(out)
    this.trackVoice(o)
    o.start(t)
    lfo.start(t)
    o.stop(t + dur + 0.05)
    lfo.stop(t + dur + 0.05)
  }

  private noiseVoice(
    t: number,
    dur: number,
    peak: number,
    out: AudioNode,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    q: number,
    attack = 0.004,
  ): void {
    const ctx = this.ctx
    if (!ctx || !this.noiseBuffer) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = dur > 0.9
    const f = ctx.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(out)
    this.trackVoice(src)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.02)
  }

  private arp(
    notes: number[],
    t: number,
    gap: number,
    noteDur: number,
    type: OscillatorType,
    peak: number,
    out: AudioNode,
    lp?: number,
  ): void {
    notes.forEach((n, i) => {
      const f = midi(n)
      this.tone(type, f, f, t + i * gap, noteDur, peak, out, lp ? 'lowpass' : undefined, lp)
    })
  }

  // --- Measurement (development aid) -------------------------------------------

  /**
   * Renders one effect offline, never to the speakers, and reports its level
   * at unity bus gain. Used to balance the mix by measurement; it says nothing
   * about how the result sounds to a listener.
   */
  measure(name: SfxName, opts: PlayOptions = {}): Promise<LevelReport> {
    return this.renderOffline(3, (out, t) => {
      const ctx = this.ctx
      if (!ctx) return
      const trim = ctx.createGain()
      trim.gain.value = (opts.volume ?? 1) * (MIX[name] ?? 1)
      trim.connect(out)
      this.voice(name, trim, t, opts)
    })
  }

  /** Renders `seconds` of a music mode offline (without the echo send). */
  measureMusic(mode: Exclude<MusicMode, 'off'>, seconds: number): Promise<LevelReport> {
    const def = MODES[mode]
    const stepDur = 60 / def.bpm / 4
    return this.renderOffline(seconds + 1, (out, t) => {
      for (let s = 0; s * stepDur < seconds; s++) this.playStep(def, s, t + s * stepDur, out)
    })
  }

  /** Renders `seconds` of the reactor ambience at `level` offline. */
  measureAmbience(level: number, seconds: number): Promise<LevelReport> {
    return this.renderOffline(seconds, (out) => {
      const ctx = this.ctx
      if (!ctx) return
      const amb = this.buildAmbience(ctx, out)
      amb.bus.gain.value = 1
      amb.level.gain.value = level * AMBIENCE_GAIN
    })
  }

  private async renderOffline(seconds: number, build: (out: AudioNode, t: number) => void): Promise<LevelReport> {
    const rate = 48000
    const off = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate)
    // Channel 0 carries the raw signal (sample peak), channel 1 a K-weighted
    // copy (ITU-R BS.1770 pre-filter) for loudness.
    const input = off.createGain()
    const merger = off.createChannelMerger(2)
    input.connect(merger, 0, 0)
    const shelf = off.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = 1681
    shelf.gain.value = 4
    const highpass = off.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 38
    highpass.Q.value = 0.5
    input.connect(shelf)
    shelf.connect(highpass)
    highpass.connect(merger, 0, 1)
    merger.connect(off.destination)
    const live = { ctx: this.ctx, noise: this.noiseBuffer }
    // Voices are built synchronously, so the live context is swapped out only
    // for the duration of this call.
    this.ctx = off as unknown as AudioContext
    this.noiseBuffer = makeNoise(off)
    this.offline = true
    try {
      build(input, 0.01)
    } finally {
      this.ctx = live.ctx
      this.noiseBuffer = live.noise
      this.offline = false
    }
    return analyse(await off.startRendering())
  }
}
