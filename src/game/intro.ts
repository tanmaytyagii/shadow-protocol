import { WORLD_H, WORLD_W } from './constants'
import { clamp, lerp } from './math'

/**
 * Beats of the opening cinematic, in seconds from its start. The DOM overlay
 * (ui/screens/IntroSequence) reads the same table so text, camera and light
 * stay in step.
 */
export const INTRO = {
  /** Boot log lines appear over a dark, idling facility. */
  lines: [0.5, 0.95, 1.4, 1.85, 2.3, 2.75],
  /** Power surge: the deck lights up outward from the reactor. */
  surge: 3.6,
  /** Title reveal begins. */
  title: 5.0,
  /** The camera reaches the establishing shot of the whole platform. */
  wide: 10.6,
  /** Start prompt appears; the shot holds until the player continues. */
  ready: 11.2,
} as const

/** Where the camera looks and how the facility is lit at one moment. */
export interface IntroShot {
  x: number
  y: number
  /** Absolute render zoom. */
  zoom: number
  /** 0 = facility dark, 1 = fully powered. */
  power: number
  /** Beacon alert level (the containment-breach sweep). */
  alert: number
  /** Reactor and conduit activity, 0..1. */
  intensity: number
}

export type IntroCueKind = 'line' | 'surge' | 'title' | 'portal' | 'ready'

export interface IntroCue {
  at: number
  kind: IntroCueKind
  index: number
}

const easeInOut = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const easeOut = (k: number): number => 1 - Math.pow(1 - k, 3)
const span = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1)

/** Close-up on the reactor well, relative to the viewport's normal zoom. */
const CLOSE_UP = 2.3
/** A late cue is dropped rather than fired (e.g. after the tab was hidden). */
const STALE = 0.6
/** Seconds for the lights to finish coming up after a skip. */
const SKIP_POWER = 0.5

/** Render zoom that frames the whole platform with a margin of abyss around it. */
export function establishingZoom(viewW: number, viewH: number): number {
  return clamp(Math.min(viewW / (WORLD_W + 300), viewH / (WORLD_H + 260)), 0.3, 1.2)
}

/**
 * Scripted camera and lighting for the opening cinematic. Presentation only:
 * the simulation stays idle and nothing here touches gameplay state. Time is
 * wall-clock so the canvas stays in step with the CSS-timed overlay even if
 * frames are dropped.
 */
export class IntroDirector {
  active = false
  reduced = false
  /** Seconds since the sequence started. */
  t = 0
  readonly shot: IntroShot = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1, power: 1, alert: 0, intensity: 0 }
  /** Cues crossed by the most recent update, in order. */
  readonly events: IntroCue[] = []
  private startedAt = 0
  private stoppedAt = -1
  private powerAtStop = 1
  private cues: IntroCue[] = []
  private cursor = 0

  start(nowMs: number, reduced: boolean, portals: number): void {
    this.active = true
    this.reduced = reduced
    this.startedAt = nowMs
    this.stoppedAt = -1
    this.t = 0
    this.cursor = 0
    this.events.length = 0
    this.cues = reduced ? [] : buildCues(portals)
    this.shot.power = reduced ? 1 : 0
  }

  /** Ends the sequence (finished or skipped); the lights finish coming up. */
  stop(nowMs: number): void {
    if (!this.active) return
    this.active = false
    this.stoppedAt = nowMs
    this.powerAtStop = this.shot.power
    this.events.length = 0
  }

  update(nowMs: number, baseZoom: number, viewW: number, viewH: number): IntroShot {
    const s = this.shot
    this.events.length = 0
    if (!this.active) {
      s.power = this.stoppedAt < 0 ? 1 : lerp(this.powerAtStop, 1, span((nowMs - this.stoppedAt) / 1000, 0, SKIP_POWER))
      return s
    }
    const t = Math.max(0, (nowMs - this.startedAt) / 1000)
    this.t = t
    while (this.cursor < this.cues.length && this.cues[this.cursor].at <= t) {
      const cue = this.cues[this.cursor++]
      if (t - cue.at < STALE) this.events.push(cue)
    }
    sampleShot(s, t, this.reduced, baseZoom, establishingZoom(viewW, viewH))
    return s
  }
}

function buildCues(portals: number): IntroCue[] {
  const cues: IntroCue[] = INTRO.lines.map((at, index) => ({ at, kind: 'line' as const, index }))
  cues.push({ at: INTRO.surge, kind: 'surge', index: 0 })
  cues.push({ at: INTRO.title, kind: 'title', index: 0 })
  for (let i = 0; i < portals; i++) cues.push({ at: INTRO.title + 0.35 + i * 0.28, kind: 'portal', index: i })
  cues.push({ at: INTRO.ready, kind: 'ready', index: 0 })
  return cues.sort((a, b) => a.at - b.at)
}

/** Writes the shot for time `t` into `s`. */
function sampleShot(s: IntroShot, t: number, reduced: boolean, baseZoom: number, fit: number): void {
  const cx = WORLD_W / 2
  const cy = WORLD_H / 2
  if (reduced) {
    // A still establishing shot: no camera moves, flicker or alarms.
    s.x = cx
    s.y = cy
    s.zoom = fit
    s.power = 1
    s.alert = 0
    s.intensity = 0.05
    return
  }
  const { surge, title, wide } = INTRO
  const close = Math.max(fit, baseZoom * CLOSE_UP)

  // Camera: a slow creep into the reactor well, then a long crane-out with a
  // lateral swing (for parallax) that settles on the whole platform.
  const pull = easeInOut(span(t, surge + 0.5, wide))
  const swing = Math.sin(pull * Math.PI)
  s.x = cx - 24 * (1 - easeOut(span(t, 0, surge))) + 170 * swing
  s.y = cy - 60 * swing
  const near = close * (1 + 0.04 * easeInOut(span(t, 0, surge)))
  s.zoom = Math.exp(lerp(Math.log(near), Math.log(fit), pull))

  // Power: standby glow, one brown-out dip as the bus comes up, then full light.
  // At most one dip, well under the three-flashes-per-second guideline.
  if (t < surge) s.power = 0.12 * span(t, 0, surge)
  else if (t < surge + 0.1) s.power = lerp(0.12, 0.62, span(t, surge, surge + 0.1))
  else if (t < surge + 0.3) s.power = lerp(0.62, 0.34, easeOut(span(t, surge + 0.1, surge + 0.3)))
  else s.power = lerp(0.34, 1, easeOut(span(t, surge + 0.3, surge + 1.8)))

  // Containment-breach alarm swells with the surge and fades as the shot settles.
  s.alert = 0.3 * easeOut(span(t, surge + 0.2, title + 0.8)) * (1 - 0.7 * span(t, title + 1.5, wide))
  const burst = 1 - span(t, surge, wide)
  s.intensity = t < surge ? 0.12 : 0.25 + 0.75 * burst * burst
}
