import type { QualityProfile } from '../constants'

const WINDOW = 2
const MAX_LEVEL = 4

/** True when the browser is rasterising on the CPU (no usable GPU). */
export function likelySoftwareRenderer(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl') as WebGLRenderingContext | null
    if (!gl) return true
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)
  } catch {
    return false
  }
}

/**
 * Adaptive quality: watches frame pacing and steps decorative effects down
 * (never gameplay) when the device drops frames or can't sustain ~50 fps, then
 * back up once it has headroom again. High-refresh displays running at 60+ fps
 * are left alone.
 */
export class PerfGovernor {
  level = 0
  /** Fastest frame interval seen in the current and previous window (ms). */
  private winMin = Infinity
  private prevMin = 1000 / 60
  private slow = 0
  private frames = 0
  private timer = 0
  private calm = 0

  /**
   * Estimated refresh interval, clamped so that anything slower than ~45 fps
   * is treated as a constrained device rather than a slow display.
   */
  private get base(): number {
    return Math.min(22, Math.max(6, Math.min(this.prevMin, this.winMin)))
  }

  /** Returns true when the level changed. */
  sample(gapMs: number): boolean {
    if (gapMs <= 0 || gapMs > 250) return false
    if (gapMs < this.winMin) this.winMin = gapMs
    this.frames++
    // A frame is "slow" when it misses the refresh by half a frame or more and
    // runs below 50 fps; high-refresh displays at 60+ fps are not penalised.
    if (gapMs > Math.max(this.base * 1.5, 20)) this.slow++
    this.timer += gapMs / 1000
    if (this.timer < WINDOW) return false
    const ratio = this.slow / Math.max(1, this.frames)
    this.timer = 0
    this.slow = 0
    this.frames = 0
    this.prevMin = this.winMin
    this.winMin = Infinity
    if (ratio > 0.18 && this.level < MAX_LEVEL) {
      // Nearly every frame late: shed two steps at once to recover quickly.
      this.level = Math.min(MAX_LEVEL, this.level + (ratio > 0.6 ? 2 : 1))
      this.calm = 0
      return true
    }
    if (ratio < 0.02) {
      this.calm += WINDOW
      if (this.calm >= 10 && this.level > 0) {
        this.level--
        this.calm = 0
        return true
      }
    } else {
      this.calm = 0
    }
    return false
  }

  /** Start below full quality (e.g. on a software renderer); it can still climb back. */
  startAt(level: number): void {
    this.level = Math.max(0, Math.min(MAX_LEVEL, level))
    this.calm = 0
  }

  reset(): void {
    this.level = 0
    this.calm = 0
    this.slow = 0
    this.frames = 0
    this.timer = 0
  }

  /** Effective quality for the current level, never above the user's choice. */
  apply(base: QualityProfile): QualityProfile {
    const l = this.level
    if (l === 0) return base
    return {
      ...base,
      bloom: false,
      distortion: false,
      lights: Math.round(base.lights * [1, 0.8, 0.55, 0.35, 0][l]),
      fog: base.fog && l < 2,
      dust: Math.round(base.dust * [1, 1, 0.5, 0.25, 0][l]),
      emitters: base.emitters * [1, 0.85, 0.6, 0.4, 0.25][l],
      parallax: base.parallax && l < 3,
      decals: Math.round(base.decals * [1, 1, 0.75, 0.5, 0.4][l]),
      // Emergency step for very weak GPUs: drop the remaining full-screen passes.
      grading: base.grading && l < 4,
      shadows: base.shadows && l < 4,
    }
  }

  get particleBudget(): number {
    return [1, 0.9, 0.72, 0.55, 0.45][this.level]
  }

  get dprScale(): number {
    return [1, 1, 1, 0.8, 0.6][this.level]
  }
}
