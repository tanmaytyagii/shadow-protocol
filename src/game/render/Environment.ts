import { COLORS, WORLD_H, WORLD_W } from '../constants'
import type { Game } from '../Game'
import { TAU, clamp, damp, mulberry32 } from '../math'
import type { Arena, Polyline } from './Arena'
import { inView, type Frame } from './frame'
import { glowSprite, lightSprite, makeCanvas, mixHex, noiseTexture, rgba } from './sprites'

/** Parallax depth of the reactor sub-level seen through glass. */
const SUB_K = 0.86
const SUB_M = 420
const SUB_S = 0.5
/** Parallax depth of the abyss structures beyond the rim. */
const FAR_K = 0.45
/** Margins wide enough for the opening cinematic's establishing shot. */
const FAR_MX = 2500
const FAR_MY = 2500
const FAR_S = 0.2
/** The outer band of the abyss fades into the void, so no bake edge ever shows. */
const FAR_FADE = 700
/** Reactor glow held behind the landing page (0..1, as coreGlow). */
const MENU_CORE_GLOW = 0.4
/** Apparent height of reactor pillars for the pseudo-3D extrusion. */
export const PYLON_HEIGHT = 0.045
const LIGHT_DIR = { x: -0.6, y: -0.8 }

interface SubLight {
  x: number
  y: number
  r: number
  color: string
  phase: number
  speed: number
}

interface FarLight {
  x: number
  y: number
  color: string
  phase: number
  rate: number
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

function tracePath(ctx: CanvasRenderingContext2D, line: Polyline): void {
  ctx.beginPath()
  ctx.moveTo(line.pts[0].x, line.pts[0].y)
  for (let i = 1; i < line.pts.length; i++) ctx.lineTo(line.pts[i].x, line.pts[i].y)
}

/**
 * Everything around the fight: the abyss beyond the rim, the reactor level
 * under the glass, animated floor emissives, reactor pillars, rim beacons and
 * atmosphere. Purely presentational: nothing here touches gameplay state.
 */
export class Environment {
  /** Smoothed combat intensity, 0 (calm) to 1 (chaos). */
  intensity = 0
  /** Boss-encounter alert level driving beacons and colour shifts. */
  alert = 0
  /** Darkening used by cinematic arrivals. */
  blackout = 0
  /** Extra reactor glow: scripted by the opening cinematic, held low on the landing page, 0 in play. */
  coreGlow = 0
  private blackoutTarget = 0
  private readonly g: Game
  private bakedFor: Arena | null = null
  private sub: HTMLCanvasElement | null = null
  private far: HTMLCanvasElement | null = null
  private subLights: SubLight[] = []
  private farLights: FarLight[] = []
  private haze: HTMLCanvasElement | null = null
  private shaft: CanvasGradient | null = null
  private arcTimer = 1.5
  private readonly bx = new Float32Array(8)
  private readonly by = new Float32Array(8)
  private readonly tx = new Float32Array(8)
  private readonly ty = new Float32Array(8)

  constructor(g: Game) {
    this.g = g
  }

  setBlackout(v: number): void {
    this.blackoutTarget = v
  }

  reset(): void {
    this.blackout = 0
    this.blackoutTarget = 0
    this.alert = 0
    this.coreGlow = 0
  }

  update(dt: number): void {
    const g = this.g
    const d = g.director
    const intro = g.intro.active ? g.intro.shot : null
    let target = intro ? intro.intensity : 0.05
    if (g.phase !== 'idle') {
      let active = 0
      for (const e of g.enemies) if (e.active) active++
      let hostile = 0
      for (const p of g.projectiles) if (!p.friendly && p.alive) hostile++
      target = Math.min(1, active / 16) * 0.55 + Math.min(1, hostile / 50) * 0.25
      if (d.boss && d.boss.alive && d.boss.spawnTimer <= 0) target += 0.35
      if (g.player.hurtFlash > 0) target += 0.12
      if (d.state === 'intermission' || d.state === 'complete') target *= 0.25
    }
    this.intensity = damp(this.intensity, clamp(target, 0, 1), 1.4, dt)
    const alertTarget = intro ? intro.alert : g.phase !== 'idle' && d.isBossWave && (d.state === 'intro' || d.state === 'boss') ? 1 : 0
    this.alert = damp(this.alert, alertTarget, 1.6, dt)
    this.blackout = damp(this.blackout, this.blackoutTarget, 3, dt)
    // The landing page keeps the reactor powered: the focal light of its stage.
    const glowTarget = intro ? intro.power * (0.35 + intro.intensity * 0.65) : g.phase === 'idle' ? MENU_CORE_GLOW : 0
    this.coreGlow = damp(this.coreGlow, glowTarget, intro ? 3 : 1.2, dt)

    if (g.quality.glow && g.phase !== 'paused') {
      this.arcTimer -= dt * (1 + this.intensity * 1.5)
      if (this.arcTimer <= 0) {
        this.spawnArc()
        this.arcTimer = 1.2 + Math.random() * 2.4
      }
    }
  }

  /** A burst of pillar discharges on screen (opening cinematic). */
  discharge(count: number): void {
    if (!this.g.quality.glow) return
    for (let i = 0; i < count; i++) this.spawnArc()
  }

  /** Decorative discharge from a reactor pillar's cap to the deck. */
  private spawnArc(): void {
    const g = this.g
    const cam = g.camera
    const visible = g.arena.pylons.filter((p) => cam.isVisible(p.x, p.y, p.r))
    if (visible.length === 0) return
    const p = visible[Math.floor(Math.random() * visible.length)]
    const top = this.pillarTop(p.x, p.y)
    const a = Math.random() * TAU
    const x1 = top.x + Math.cos(a) * p.r * 0.75
    const y1 = top.y + Math.sin(a) * p.r * 0.75
    const b = a + (Math.random() - 0.5) * 1.2
    const reach = p.r + 18 + Math.random() * 40
    const x2 = p.x + Math.cos(b) * reach
    const y2 = p.y + Math.sin(b) * reach
    g.fx.arc(x1, y1, x2, y2, '#cdeeff', 0.16, 1.3)
    g.fx.glow(x2, y2, COLORS.cyan, 16, 0.16)
    g.fx.sparks(x2, y2, '#cdeeff', 3, 120, Math.atan2(y2 - p.y, x2 - p.x), 1.6, 0.25)
    g.fx.light(x2, y2, 110, COLORS.cyan, 0.18, 0.45)
  }

  pillarTop(x: number, y: number): { x: number; y: number } {
    const cam = this.g.camera
    return { x: x + (x - cam.x) * PYLON_HEIGHT, y: y + (y - cam.y) * PYLON_HEIGHT }
  }

  private parallax(ctx: CanvasRenderingContext2D, k: number): void {
    const cam = this.g.camera
    ctx.translate(cam.x, cam.y)
    ctx.scale(k, k)
    ctx.translate(-cam.x, -cam.y)
  }

  // --- Baking -------------------------------------------------------------------

  private ensureBaked(): void {
    const arena = this.g.arena
    if (this.bakedFor === arena) return
    this.bakedFor = arena
    this.bakeSub(arena)
    this.bakeFar(arena)
  }

  private bakeSub(arena: Arena): void {
    const r = mulberry32(arena.seed ^ 0x2c1b3c6d)
    const LW = WORLD_W + SUB_M * 2
    const LH = WORLD_H + SUB_M * 2
    const c = makeCanvas(LW * SUB_S, LH * SUB_S)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(SUB_S, SUB_S)
    ctx.translate(SUB_M, SUB_M)
    ctx.fillStyle = '#010309'
    ctx.fillRect(-SUB_M, -SUB_M, LW, LH)
    this.subLights = []

    // Structural beams.
    ctx.lineCap = 'butt'
    for (const [color, width, off] of [
      ['#050a17', 38, 0],
      ['rgba(120,150,255,0.05)', 2, -18],
    ] as const) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      for (let x = -SUB_M + 150; x < WORLD_W + SUB_M; x += 300) {
        ctx.moveTo(x + off, -SUB_M)
        ctx.lineTo(x + off, WORLD_H + SUB_M)
      }
      for (let y = -SUB_M + 150; y < WORLD_H + SUB_M; y += 300) {
        ctx.moveTo(-SUB_M, y + off)
        ctx.lineTo(WORLD_W + SUB_M, y + off)
      }
      ctx.stroke()
    }

    // Machinery blocks with indicator lights.
    for (let i = 0; i < 80; i++) {
      const w = 60 + r() * 200
      const h = 40 + r() * 140
      const x = -SUB_M + r() * (LW - w)
      const y = -SUB_M + r() * (LH - h)
      ctx.fillStyle = r() < 0.5 ? '#040814' : '#060b19'
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = 'rgba(62,242,255,0.05)'
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, w, h)
      const lights = 1 + Math.floor(r() * 4)
      for (let k = 0; k < lights; k++) {
        const lx = x + 10 + r() * (w - 20)
        const ly = y + 10 + r() * (h - 20)
        const amber = r() < 0.25
        ctx.fillStyle = amber ? 'rgba(255,195,92,0.55)' : 'rgba(62,242,255,0.5)'
        ctx.fillRect(lx - 2, ly - 2, 4, 4)
        if (r() < 0.6) this.subLights.push({ x: lx, y: ly, r: 30, color: amber ? COLORS.amber : COLORS.cyan, phase: r() * TAU, speed: 1 + r() * 3 })
      }
    }

    // Coolant pipes, some carrying glowing coolant.
    for (let i = 0; i < 18; i++) {
      const horizontal = r() < 0.5
      const w = 10 + r() * 18
      const at = horizontal ? -SUB_M + r() * LH : -SUB_M + r() * LW
      const glow = r() < 0.4
      const draw = (color: string, width: number, off: number) => {
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.beginPath()
        if (horizontal) {
          ctx.moveTo(-SUB_M, at + off)
          ctx.lineTo(WORLD_W + SUB_M, at + off)
        } else {
          ctx.moveTo(at + off, -SUB_M)
          ctx.lineTo(at + off, WORLD_H + SUB_M)
        }
        ctx.stroke()
      }
      draw('#081022', w + 6, 0)
      draw('#0f1a38', w, 0)
      draw('rgba(160,190,255,0.12)', 2, -w / 3)
      if (glow) {
        draw('rgba(62,242,255,0.22)', 3, 0)
        for (let k = 0; k < 6; k++) {
          const along = -SUB_M + r() * (horizontal ? LW : LH)
          this.subLights.push({
            x: horizontal ? along : at,
            y: horizontal ? at : along,
            r: 40 + w,
            color: COLORS.cyan,
            phase: r() * TAU,
            speed: 0.6 + r() * 1.2,
          })
        }
      }
    }

    // Reactor pit.
    const rx = WORLD_W / 2
    const ry = WORLD_H / 2
    const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, 460)
    g.addColorStop(0, 'rgba(190,245,255,0.7)')
    g.addColorStop(0.06, 'rgba(62,242,255,0.38)')
    g.addColorStop(0.28, 'rgba(40,110,220,0.11)')
    g.addColorStop(0.6, 'rgba(20,40,110,0.06)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(rx - 460, ry - 460, 920, 920)
    ctx.strokeStyle = '#071027'
    ctx.lineWidth = 18
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU
      ctx.beginPath()
      ctx.moveTo(rx + Math.cos(a) * 140, ry + Math.sin(a) * 140)
      ctx.lineTo(rx + Math.cos(a) * 420, ry + Math.sin(a) * 420)
      ctx.stroke()
    }
    for (const R of [140, 196, 262, 340]) {
      ctx.strokeStyle = '#0a1530'
      ctx.lineWidth = 10
      ctx.beginPath()
      ctx.arc(rx, ry, R, 0, TAU)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(62,242,255,0.08)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(rx, ry, R - 6, 0, TAU)
      ctx.stroke()
    }
    this.sub = c
  }

  private bakeFar(arena: Arena): void {
    const r = mulberry32(arena.seed ^ 0x7f4a7c15)
    const LW = WORLD_W + FAR_MX * 2
    const LH = WORLD_H + FAR_MY * 2
    const c = makeCanvas(LW * FAR_S, LH * FAR_S)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(FAR_S, FAR_S)
    ctx.translate(FAR_MX, FAR_MY)
    const bg = ctx.createLinearGradient(0, -FAR_MY, 0, WORLD_H + FAR_MY)
    bg.addColorStop(0, '#03050c')
    bg.addColorStop(0.5, '#050814')
    bg.addColorStop(1, '#02040a')
    ctx.fillStyle = bg
    ctx.fillRect(-FAR_MX, -FAR_MY, LW, LH)
    this.farLights = []

    // Shaft wall panelling.
    ctx.strokeStyle = 'rgba(90,120,220,0.06)'
    ctx.lineWidth = 6
    ctx.beginPath()
    for (let x = -FAR_MX; x < WORLD_W + FAR_MX; x += 260) {
      ctx.moveTo(x, -FAR_MY)
      ctx.lineTo(x, WORLD_H + FAR_MY)
    }
    for (let y = -FAR_MY; y < WORLD_H + FAR_MY; y += 220) {
      ctx.moveTo(-FAR_MX, y)
      ctx.lineTo(WORLD_W + FAR_MX, y)
    }
    ctx.stroke()

    // Colossal support columns and girders.
    for (let i = 0; i < 38; i++) {
      const w = 140 + r() * 360
      const x = -FAR_MX + r() * LW
      const y = -FAR_MY + r() * LH * 0.3
      const h = LH * (0.5 + r() * 0.5)
      ctx.fillStyle = r() < 0.5 ? '#070b18' : '#090e1e'
      ctx.fillRect(x, y, w, h)
      ctx.fillStyle = 'rgba(130,160,255,0.06)'
      ctx.fillRect(x, y, 8, h)
      if (r() < 0.5) {
        ctx.fillStyle = 'rgba(62,242,255,0.12)'
        ctx.fillRect(x + w * 0.5 - 4, y, 8, h)
      }
      // Lit windows.
      for (let k = 0; k < 30; k++) {
        if (r() < 0.6) continue
        ctx.fillStyle = r() < 0.3 ? 'rgba(255,195,92,0.22)' : 'rgba(150,200,255,0.16)'
        ctx.fillRect(x + 20 + r() * (w - 40), y + r() * h, 16, 8)
      }
      if (r() < 0.6) {
        this.farLights.push({ x: x + w / 2, y: y + 30 + r() * 200, color: r() < 0.6 ? COLORS.red : COLORS.amber, phase: r() * TAU, rate: 0.8 + r() * 1.6 })
      }
    }
    ctx.strokeStyle = '#0a1022'
    ctx.lineWidth = 50
    ctx.beginPath()
    for (let i = 0; i < 11; i++) {
      const y = -FAR_MY + r() * LH
      ctx.moveTo(-FAR_MX, y)
      ctx.lineTo(WORLD_W + FAR_MX, y + (r() - 0.5) * 200)
    }
    ctx.stroke()
    // Depth haze toward the bottom of the shaft.
    const fog = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 200, WORLD_W / 2, WORLD_H / 2, Math.max(LW, LH) * 0.7)
    fog.addColorStop(0, 'rgba(30,60,140,0.12)')
    fog.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = fog
    ctx.fillRect(-FAR_MX, -FAR_MY, LW, LH)
    const x0 = -FAR_MX
    const y0 = -FAR_MY
    const x1 = WORLD_W + FAR_MX
    const y1 = WORLD_H + FAR_MY
    for (const [ax, ay, bx, by, rx, ry, rw, rh] of [
      [x0, 0, x0 + FAR_FADE, 0, x0, y0, FAR_FADE, LH],
      [x1, 0, x1 - FAR_FADE, 0, x1 - FAR_FADE, y0, FAR_FADE, LH],
      [0, y0, 0, y0 + FAR_FADE, x0, y0, LW, FAR_FADE],
      [0, y1, 0, y1 - FAR_FADE, x0, y1 - FAR_FADE, LW, FAR_FADE],
    ]) {
      const edge = ctx.createLinearGradient(ax, ay, bx, by)
      edge.addColorStop(0, COLORS.void)
      edge.addColorStop(1, rgba(COLORS.void, 0))
      ctx.fillStyle = edge
      ctx.fillRect(rx, ry, rw, rh)
    }
    this.far = c
  }

  private hazeTexture(): HTMLCanvasElement | null {
    if (this.haze) return this.haze
    const src = noiseTexture()
    const c = makeCanvas(src.width, src.height)
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(src, 0, 0)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = '#5c8cff'
    ctx.fillRect(0, 0, c.width, c.height)
    this.haze = c
    return c
  }

  // --- Lights ----------------------------------------------------------------------

  /** Highest-priority ambient light: the reactor glow under the deck. */
  collectReactorLight(f: Frame): void {
    const rc = this.g.arena.reactor
    if (!inView(f.view, rc.x, rc.y, 320)) return
    const pulse = 0.5 + 0.5 * Math.sin(f.t * (1.4 + this.intensity * 3.5))
    const boost = this.coreGlow
    f.lights.add(rc.x, rc.y, 260 + pulse * 30 + boost * 220, this.reactorColor(), 0.1 + pulse * 0.05 + boost * 0.2)
  }

  collectLights(f: Frame): void {
    const arena = this.g.arena
    const L = f.lights
    const core = this.reactorColor()
    for (const p of arena.pylons) {
      if (!inView(f.view, p.x, p.y, p.r * 4)) continue
      L.add(p.x, p.y, p.r * 3.6, core, 0.11 + 0.05 * Math.sin(f.t * 2 + p.phase))
    }
    for (const p of arena.portals) {
      if (p.flare > 0.03 && inView(f.view, p.x, p.y, 260)) L.add(p.x, p.y, 160 + 140 * p.flare, COLORS.magenta, 0.5 * p.flare)
    }
    for (const fx of arena.fixtures) {
      const cx = fx.x + fx.w / 2
      const cy = fx.y + fx.h / 2
      if (inView(f.view, cx, cy, 80)) L.add(cx, cy, 70, COLORS.cyan, 0.09)
    }
  }

  reactorColor(): string {
    // Quantised: this colour keys cached light and glow sprites, and a continuous
    // blend would mint a new 256² canvas for every intermediate shade.
    return mixHex(COLORS.cyan, COLORS.violet, Math.round(Math.min(1, this.alert * 0.85) * 20) / 20)
  }

  // --- Layers ------------------------------------------------------------------------

  /** Abyss beyond the platform rim: colossal structures far below. */
  drawAbyss(f: Frame): void {
    const v = f.view
    if (v.x0 >= 0 && v.y0 >= 0 && v.x1 <= WORLD_W && v.y1 <= WORLD_H) return
    const ctx = f.ctx
    ctx.save()
    ctx.beginPath()
    ctx.rect(v.x0 - 60, v.y0 - 60, v.x1 - v.x0 + 120, v.y1 - v.y0 + 120)
    ctx.rect(0, 0, WORLD_W, WORLD_H)
    ctx.clip('evenodd')
    if (f.q.parallax) {
      this.ensureBaked()
      const far = this.far
      if (far) {
        const cam = this.g.camera
        const lx0 = cam.x + (v.x0 - 60 - cam.x) / FAR_K
        const ly0 = cam.y + (v.y0 - 60 - cam.y) / FAR_K
        const lx1 = cam.x + (v.x1 + 60 - cam.x) / FAR_K
        const ly1 = cam.y + (v.y1 + 60 - cam.y) / FAR_K
        ctx.save()
        this.parallax(ctx, FAR_K)
        const sx = clamp((lx0 + FAR_MX) * FAR_S, 0, far.width)
        const sy = clamp((ly0 + FAR_MY) * FAR_S, 0, far.height)
        const ex = clamp((lx1 + FAR_MX) * FAR_S, 0, far.width)
        const ey = clamp((ly1 + FAR_MY) * FAR_S, 0, far.height)
        if (ex > sx && ey > sy) {
          ctx.drawImage(far, sx, sy, ex - sx, ey - sy, sx / FAR_S - FAR_MX, sy / FAR_S - FAR_MY, (ex - sx) / FAR_S, (ey - sy) / FAR_S)
        }
        ctx.globalCompositeOperation = 'lighter'
        for (const l of this.farLights) {
          if (l.x < lx0 || l.x > lx1 || l.y < ly0 || l.y > ly1) continue
          const on = Math.sin(f.t * l.rate * TAU * 0.5 + l.phase) > 0.55
          if (!on) continue
          ctx.globalAlpha = 0.85
          ctx.drawImage(glowSprite(l.color, true), l.x - 36, l.y - 36, 72, 72)
        }
        ctx.restore()
      }
    }
    // The platform's own thickness falling away into the dark.
    const band = 110
    const edges: [number, number, number, number, number, number, number, number][] = [
      [0, -band, WORLD_W, band, 0, 0, 0, -band],
      [0, WORLD_H, WORLD_W, band, 0, WORLD_H, 0, WORLD_H + band],
      [-band, 0, band, WORLD_H, 0, 0, -band, 0],
      [WORLD_W, 0, band, WORLD_H, WORLD_W, 0, WORLD_W + band, 0],
    ]
    for (const [x, y, w, h, gx0, gy0, gx1, gy1] of edges) {
      const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1)
      g.addColorStop(0, '#111a33')
      g.addColorStop(0.18, '#0a1022')
      g.addColorStop(1, 'rgba(3,5,11,0)')
      ctx.fillStyle = g
      ctx.fillRect(x, y, w, h)
    }
    ctx.restore()
  }

  /** The reactor level seen through glass panels and the central well. */
  drawSubfloor(f: Frame): void {
    const ctx = f.ctx
    const arena = this.g.arena
    const rc = arena.reactor
    if (!f.q.parallax) {
      ctx.fillStyle = '#02050d'
      for (const p of arena.panels) if (inView(f.view, p.x + p.w / 2, p.y + p.h / 2, p.w)) ctx.fillRect(p.x, p.y, p.w, p.h)
      if (inView(f.view, rc.x, rc.y, rc.r)) {
        ctx.beginPath()
        ctx.arc(rc.x, rc.y, rc.r, 0, TAU)
        ctx.fill()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.6
        ctx.drawImage(glowSprite(COLORS.cyan, true), rc.x - 80, rc.y - 80, 160, 160)
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      }
      return
    }
    this.ensureBaked()
    for (const p of arena.panels) {
      if (!inView(f.view, p.x + p.w / 2, p.y + p.h / 2, Math.max(p.w, p.h))) continue
      ctx.save()
      ctx.beginPath()
      ctx.rect(p.x, p.y, p.w, p.h)
      ctx.clip()
      this.drawSubRegion(f, p.x, p.y, p.x + p.w, p.y + p.h)
      ctx.restore()
    }
    if (inView(f.view, rc.x, rc.y, rc.r)) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(rc.x, rc.y, rc.r, 0, TAU)
      ctx.clip()
      this.drawSubRegion(f, rc.x - rc.r, rc.y - rc.r, rc.x + rc.r, rc.y + rc.r)
      this.drawReactorCore(f)
      ctx.restore()
    }
  }

  private drawSubRegion(f: Frame, wx0: number, wy0: number, wx1: number, wy1: number): void {
    const sub = this.sub
    if (!sub) return
    const ctx = f.ctx
    const cam = this.g.camera
    const pad = 24
    const lx0 = cam.x + (wx0 - pad - cam.x) / SUB_K
    const ly0 = cam.y + (wy0 - pad - cam.y) / SUB_K
    const lx1 = cam.x + (wx1 + pad - cam.x) / SUB_K
    const ly1 = cam.y + (wy1 + pad - cam.y) / SUB_K
    ctx.save()
    this.parallax(ctx, SUB_K)
    const sx = clamp((lx0 + SUB_M) * SUB_S, 0, sub.width)
    const sy = clamp((ly0 + SUB_M) * SUB_S, 0, sub.height)
    const ex = clamp((lx1 + SUB_M) * SUB_S, 0, sub.width)
    const ey = clamp((ly1 + SUB_M) * SUB_S, 0, sub.height)
    if (ex > sx && ey > sy) {
      ctx.drawImage(sub, sx, sy, ex - sx, ey - sy, sx / SUB_S - SUB_M, sy / SUB_S - SUB_M, (ex - sx) / SUB_S, (ey - sy) / SUB_S)
    }
    if (f.q.glow) {
      ctx.globalCompositeOperation = 'lighter'
      for (const l of this.subLights) {
        if (l.x < lx0 - l.r || l.x > lx1 + l.r || l.y < ly0 - l.r || l.y > ly1 + l.r) continue
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(f.t * l.speed + l.phase)
        ctx.drawImage(glowSprite(l.color), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2)
      }
    }
    ctx.restore()
  }

  private drawReactorCore(f: Frame): void {
    const ctx = f.ctx
    const cx = WORLD_W / 2
    const cy = WORLD_H / 2
    const pulse = 0.5 + 0.5 * Math.sin(f.t * (1.4 + this.intensity * 3.5))
    const color = this.reactorColor()
    ctx.save()
    this.parallax(ctx, SUB_K)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = Math.min(1, 0.35 + pulse * 0.2 + this.coreGlow * 0.45)
    const s = 90 + pulse * 25 + this.coreGlow * 55
    ctx.drawImage(glowSprite(color, true), cx - s, cy - s, s * 2, s * 2)
    ctx.globalAlpha = 0.22
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.setLineDash([26, 18])
    ctx.lineDashOffset = f.t * 40
    ctx.beginPath()
    ctx.arc(cx, cy, 176, 0, TAU)
    ctx.stroke()
    ctx.lineDashOffset = -f.t * 60
    ctx.setLineDash([10, 30])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, 236, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  drawFloor(f: Frame): void {
    const { arena } = this.g
    const floor = arena.floor
    if (!floor) return
    const v = f.view
    const s = arena.floorScale
    const x0 = clamp(v.x0 - 40, 0, WORLD_W)
    const y0 = clamp(v.y0 - 40, 0, WORLD_H)
    const x1 = clamp(v.x1 + 40, 0, WORLD_W)
    const y1 = clamp(v.y1 + 40, 0, WORLD_H)
    if (x1 <= x0 || y1 <= y0) return
    f.ctx.drawImage(floor, x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s, x0, y0, x1 - x0, y1 - y0)
  }

  /** Animated emissive details on the deck: conduit flow, data pulses, strip lights, portals. */
  drawFloorEmissive(f: Frame): void {
    const ctx = f.ctx
    const arena = this.g.arena
    const t = f.t
    this.drawPortals(f)
    if (!f.q.glow) return
    ctx.globalCompositeOperation = 'lighter'
    const flow = mixHex(COLORS.cyan, COLORS.violet, Math.min(1, this.alert * 0.8))

    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    for (const cd of arena.conduits) {
      tracePath(ctx, cd)
      ctx.globalAlpha = 1
      ctx.strokeStyle = rgba(flow, 0.025 + this.intensity * 0.035)
      ctx.lineWidth = cd.width * 0.5
      ctx.stroke()
      ctx.setLineDash([10, 70])
      ctx.lineDashOffset = -(t * (80 + this.intensity * 240) + cd.offset)
      ctx.strokeStyle = rgba(flow, 0.16 + this.intensity * 0.24)
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Data pulses along circuit traces.
    const traces = arena.traces
    for (let i = 0; i < traces.length; i++) {
      if (f.q.dust < 60 && i % 2 === 1) continue
      const tr = traces[i]
      const pt = arena.tracePoint(tr, t * tr.speed + tr.offset)
      if (!inView(f.view, pt.x, pt.y, 20)) continue
      ctx.globalAlpha = 0.32
      ctx.drawImage(glowSprite(tr.color), pt.x - 13, pt.y - 13, 26, 26)
      ctx.globalAlpha = 0.65
      ctx.fillStyle = tr.color
      ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3)
    }

    // Strip lights: steady cyan, flicker amber while the facility is on alert.
    for (const fx of arena.fixtures) {
      const cx = fx.x + fx.w / 2
      const cy = fx.y + fx.h / 2
      if (!inView(f.view, cx, cy, 60)) continue
      const warn = this.alert > 0.35 && Math.sin(t * 5 + fx.phase) > 0.3
      const color = warn ? COLORS.amber : COLORS.cyan
      const a = 0.18 + 0.1 * Math.sin(t * 1.7 + fx.phase) + (warn ? 0.25 : 0)
      ctx.globalAlpha = a
      ctx.fillStyle = color
      ctx.fillRect(fx.x, fx.y, fx.w, fx.h)
      ctx.globalAlpha = a * 0.7
      ctx.drawImage(glowSprite(color), cx - fx.w * 1.3 - 10, cy - fx.h * 1.3 - 10, fx.w * 2.6 + 20, fx.h * 2.6 + 20)
    }

    // Reactor well rim.
    const rc = arena.reactor
    if (inView(f.view, rc.x, rc.y, rc.r + 30)) {
      const pulse = 0.5 + 0.5 * Math.sin(t * (1.4 + this.intensity * 3.5))
      ctx.globalAlpha = 0.1 + pulse * 0.1 + this.coreGlow * 0.25
      ctx.strokeStyle = this.reactorColor()
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(rc.x, rc.y, rc.r + 1, 0, TAU)
      ctx.stroke()
      // Opening cinematic: the ignited core blazes up through the deck.
      if (this.coreGlow > 0.01) {
        const s = 46 + pulse * 10 + this.coreGlow * 18
        ctx.globalAlpha = Math.min(1, this.coreGlow * 0.85)
        ctx.drawImage(glowSprite(this.reactorColor(), true), rc.x - s, rc.y - s, s * 2, s * 2)
      }
    }

    // Faint scanning sweep.
    const sweepY = ((t * 80) % (WORLD_H + 600)) - 300
    const v = f.view
    if (sweepY > v.y0 - 130 && sweepY < v.y1 + 10) {
      const g = ctx.createLinearGradient(0, sweepY - 110, 0, sweepY + 4)
      g.addColorStop(0, 'rgba(62,242,255,0)')
      g.addColorStop(1, 'rgba(62,242,255,0.03)')
      ctx.globalAlpha = 1 - this.intensity * 0.6
      ctx.fillStyle = g
      ctx.fillRect(v.x0, sweepY - 110, v.x1 - v.x0, 114)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private drawPortals(f: Frame): void {
    const ctx = f.ctx
    const t = f.t
    for (const p of this.g.arena.portals) {
      if (!inView(f.view, p.x, p.y, 120)) continue
      const fl = p.flare
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.globalCompositeOperation = 'lighter'
      if (f.q.glow) {
        ctx.globalAlpha = 0.12 + fl * 0.6
        const s = 70 + fl * 40
        ctx.drawImage(glowSprite(COLORS.magenta), -s, -s, s * 2, s * 2)
      }
      ctx.globalAlpha = 0.3 + fl * 0.6
      ctx.strokeStyle = COLORS.magenta
      ctx.lineWidth = 2
      ctx.rotate(t * (0.5 + fl * 3))
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(0, 0, 44, (i / 3) * TAU, (i / 3) * TAU + 1.05)
        ctx.stroke()
      }
      ctx.rotate(-t * 1.5)
      ctx.globalAlpha = 0.15 + fl * 0.5
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      ctx.arc(0, 0, 30, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      if (fl > 0.05) {
        ctx.globalAlpha = fl
        ctx.fillStyle = '#ffd6ea'
        ctx.beginPath()
        ctx.arc(0, 0, 6 + fl * 10, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    }
  }

  /** Reactor pillars, extruded toward the camera for depth. */
  drawPylons(f: Frame): void {
    const ctx = f.ctx
    const cam = this.g.camera
    const core = this.reactorColor()
    const t = f.t
    for (const p of this.g.arena.pylons) {
      if (!inView(f.view, p.x, p.y, p.r * 3)) continue
      const ox = (p.x - cam.x) * PYLON_HEIGHT
      const oy = (p.y - cam.y) * PYLON_HEIGHT
      const n = p.sides
      const rot = Math.PI / n
      const rTop = p.r * 0.86
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU
        this.bx[i] = p.x + Math.cos(a) * p.r
        this.by[i] = p.y + Math.sin(a) * p.r
        this.tx[i] = p.x + ox + Math.cos(a) * rTop
        this.ty[i] = p.y + oy + Math.sin(a) * rTop
      }
      // Side faces that face the camera.
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const mid = rot + ((i + 0.5) / n) * TAU
        const nx = Math.cos(mid)
        const ny = Math.sin(mid)
        if (nx * ox + ny * oy >= -0.01) continue
        const lit = Math.max(0, nx * LIGHT_DIR.x + ny * LIGHT_DIR.y)
        const tone = Math.round(14 + lit * 26)
        ctx.fillStyle = `rgb(${tone - 4},${tone + 2},${tone + 22})`
        ctx.beginPath()
        ctx.moveTo(this.bx[i], this.by[i])
        ctx.lineTo(this.bx[j], this.by[j])
        ctx.lineTo(this.tx[j], this.ty[j])
        ctx.lineTo(this.tx[i], this.ty[i])
        ctx.closePath()
        ctx.fill()
        if (i % 2 === 0) {
          ctx.strokeStyle = rgba(COLORS.cyan, 0.16 + lit * 0.12)
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo((this.bx[i] + this.bx[j]) / 2, (this.by[i] + this.by[j]) / 2)
          ctx.lineTo((this.tx[i] + this.tx[j]) / 2, (this.ty[i] + this.ty[j]) / 2)
          ctx.stroke()
        }
      }
      // Cap.
      const capX = p.x + ox
      const capY = p.y + oy
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        if (i === 0) ctx.moveTo(this.tx[i], this.ty[i])
        else ctx.lineTo(this.tx[i], this.ty[i])
      }
      ctx.closePath()
      ctx.fillStyle = '#1a2645'
      ctx.fill()
      ctx.strokeStyle = rgba(COLORS.cyan, 0.38)
      ctx.lineWidth = 1.6
      ctx.stroke()
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU
        const x = capX + Math.cos(a) * rTop * 0.64
        const y = capY + Math.sin(a) * rTop * 0.64
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fillStyle = '#0e172d'
      ctx.fill()
      ctx.strokeStyle = rgba(COLORS.violet, 0.32)
      ctx.lineWidth = 1.2
      ctx.stroke()
      // Pulsing reactor core.
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + p.phase)
      if (f.q.glow) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.2 + pulse * 0.22
        const s = p.r * 1.25
        ctx.drawImage(glowSprite(core), capX - s, capY - s, s * 2, s * 2)
        ctx.globalAlpha = 0.6
        ctx.strokeStyle = core
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 5])
        ctx.lineDashOffset = t * 12 + p.phase * 10
        ctx.beginPath()
        ctx.arc(capX, capY, p.r * 0.34, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      }
      ctx.fillStyle = rgba(COLORS.cyanSoft, 0.55 + pulse * 0.45)
      ctx.beginPath()
      ctx.arc(capX, capY, p.r * 0.15, 0, TAU)
      ctx.fill()
    }
  }

  /** Raised platform rim, emissive edge strip and alert beacons. */
  drawRim(f: Frame): void {
    const ctx = f.ctx
    const t = f.t
    ctx.strokeStyle = '#121a33'
    ctx.lineWidth = 9
    ctx.strokeRect(-4.5, -4.5, WORLD_W + 9, WORLD_H + 9)
    ctx.strokeStyle = 'rgba(170,200,255,0.2)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(0.75, 0.75, WORLD_W - 1.5, WORLD_H - 1.5)

    ctx.globalCompositeOperation = 'lighter'
    const rim = mixHex(COLORS.cyan, COLORS.magenta, this.alert * 0.6)
    ctx.strokeStyle = rgba(rim, 0.06)
    ctx.lineWidth = 16
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H)
    ctx.strokeStyle = rgba(rim, 0.35 + this.intensity * 0.2)
    ctx.lineWidth = 2
    ctx.setLineDash([40, 28])
    ctx.lineDashOffset = -t * 30
    ctx.strokeRect(7, 7, WORLD_W - 14, WORLD_H - 14)
    ctx.setLineDash([])

    // Corner brackets.
    ctx.strokeStyle = rgba(COLORS.violet, 0.8)
    ctx.lineWidth = 3
    const c = 70
    for (const [x, y, sx, sy] of [
      [0, 0, 1, 1],
      [WORLD_W, 0, -1, 1],
      [0, WORLD_H, 1, -1],
      [WORLD_W, WORLD_H, -1, -1],
    ]) {
      ctx.beginPath()
      ctx.moveTo(x + sx * 10, y + sy * (10 + c))
      ctx.lineTo(x + sx * 10, y + sy * 10)
      ctx.lineTo(x + sx * (10 + c), y + sy * 10)
      ctx.stroke()
    }

    // Beacons: dim cyan at rest, sweeping amber/magenta cones on alert.
    const on = this.alert
    for (const b of this.g.arena.beacons) {
      if (!inView(f.view, b.x, b.y, 320)) continue
      const blink = Math.sin(t * 4 + b.phase) > 0
      const color = on > 0.08 ? (blink ? COLORS.magenta : COLORS.amber) : COLORS.cyan
      if (on > 0.05 && f.q.glow) {
        const ang = Math.atan2(b.ny, b.nx) + Math.sin(t * 2.1 + b.phase) * 0.85
        const L = 300
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(b.x, b.y)
        ctx.arc(b.x, b.y, L, ang - 0.26, ang + 0.26)
        ctx.closePath()
        ctx.clip()
        ctx.globalAlpha = on * 0.32
        ctx.drawImage(lightSprite(color), b.x - L, b.y - L, L * 2, L * 2)
        ctx.restore()
      }
      ctx.globalAlpha = on > 0.08 ? 0.9 : 0.35
      ctx.drawImage(glowSprite(color, on > 0.08), b.x - 14, b.y - 14, 28, 28)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#0b1122'
    for (const b of this.g.arena.beacons) {
      if (!inView(f.view, b.x, b.y, 20)) continue
      ctx.fillRect(b.x - 7, b.y - 4, 14, 8)
    }
  }

  /** Haze, light shafts and drifting motes. Kept faint so combat stays readable. */
  drawAtmosphere(f: Frame): void {
    const ctx = f.ctx
    const cam = this.g.camera
    const t = f.t
    const v = f.view
    const calm = 1 - this.intensity * 0.55

    if (f.q.fog) {
      const tex = this.hazeTexture()
      if (tex) {
        ctx.save()
        this.parallax(ctx, 1.12)
        const lx0 = cam.x + (v.x0 - cam.x) / 1.12
        const ly0 = cam.y + (v.y0 - cam.y) / 1.12
        const lx1 = cam.x + (v.x1 - cam.x) / 1.12
        const ly1 = cam.y + (v.y1 - cam.y) / 1.12
        ctx.globalCompositeOperation = 'lighter'
        for (const [T, ox, oy, a] of [
          [900, t * 11, t * 4, 0.05],
          [1300, -t * 7, t * 8, 0.035],
        ]) {
          ctx.globalAlpha = a * calm * (1 - this.blackout * 0.6)
          const sx = Math.floor((lx0 - ox) / T) * T + ox
          const sy = Math.floor((ly0 - oy) / T) * T + oy
          for (let x = sx; x < lx1; x += T) for (let y = sy; y < ly1; y += T) ctx.drawImage(tex, x, y, T, T)
        }
        ctx.restore()
      }

      // Volumetric-looking shafts from high gantry lights.
      if (!this.shaft) {
        const g = ctx.createLinearGradient(-110, 0, 110, 0)
        g.addColorStop(0, 'rgba(120,170,255,0)')
        g.addColorStop(0.5, 'rgba(120,170,255,0.045)')
        g.addColorStop(1, 'rgba(120,170,255,0)')
        this.shaft = g
      }
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = calm * (1 - this.blackout)
      ctx.fillStyle = this.shaft
      for (let i = 0; i < 3; i++) {
        const span = WORLD_W + 1200
        const x = ((i * 1000 + t * 12) % span) - 600
        if (x < v.x0 - 1400 || x > v.x1 + 1400) continue
        ctx.save()
        ctx.translate(x, WORLD_H / 2)
        ctx.rotate(0.55)
        ctx.scale(1 + 0.3 * Math.sin(t * 0.3 + i), 1)
        ctx.fillRect(-110, -1600, 220, 3200)
        ctx.restore()
      }
      ctx.restore()
    }

    // Motes at several depths.
    if (f.q.dust > 0) {
      ctx.fillStyle = COLORS.cyanSoft
      for (let i = 0; i < f.q.dust; i++) {
        const z = 1.04 + hash(i + 5) * 0.32
        const lx = (hash(i) * WORLD_W + t * (6 + hash(i + 7) * 18)) % WORLD_W
        const ly = (hash(i + 3) * WORLD_H + t * (3 + hash(i + 11) * 9)) % WORLD_H
        const x = cam.x + (lx - cam.x) * z
        const y = cam.y + (ly - cam.y) * z
        if (!inView(v, x, y, 4)) continue
        ctx.globalAlpha = (0.08 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2 + i))) * (0.6 + (z - 1) * 2.5)
        const s = 1 + (z - 1) * 6
        ctx.fillRect(x, y, s, s)
      }
      ctx.globalAlpha = 1
    }
  }
}
