import { COLORS, WORLD_H, WORLD_W } from '../constants'
import { TAU, dist2, mulberry32 } from '../math'
import { makeCanvas, rgba } from './sprites'

export interface Pylon {
  x: number
  y: number
  r: number
  sides: number
  phase: number
}

export interface Portal {
  x: number
  y: number
  flare: number
}

export interface Polyline {
  pts: { x: number; y: number }[]
  segLengths: number[]
  length: number
}

export interface Trace extends Polyline {
  color: string
  speed: number
  offset: number
}

export interface Conduit extends Polyline {
  width: number
  offset: number
}

/** Walkable glass floor panel; the sub-level shows through it. */
export interface GlassPanel {
  x: number
  y: number
  w: number
  h: number
}

/** Emissive strip light set into the floor. */
export interface Fixture {
  x: number
  y: number
  w: number
  h: number
  phase: number
}

/** Warning beacon on the platform rim. (nx, ny) points into the arena. */
export interface Beacon {
  x: number
  y: number
  nx: number
  ny: number
  phase: number
}

const LABELS = ['SECTOR 07', 'CONTAINMENT GRID', 'AUTH // NULL', 'SUBLEVEL C', 'COOLANT LOOP 3', 'NO EXIT', 'OBSERVE · ADAPT · SURVIVE']
const PLATE = 160

function polyline(pts: { x: number; y: number }[]): Polyline {
  const segLengths: number[] = []
  let length = 0
  for (let k = 1; k < pts.length; k++) {
    const l = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y)
    segLengths.push(l)
    length += l
  }
  return { pts, segLengths, length }
}

function rectDist(px: number, py: number, r: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w))
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h))
  return Math.hypot(dx, dy)
}

/**
 * Procedurally generated arena: obstacle pylons, spawn portals, floor
 * circuitry, reactor conduits, glass panels and a pre-baked floor texture.
 * Gameplay-relevant generation (pylons, portals) is independent of the
 * decorative generation so seeds stay stable.
 */
export class Arena {
  readonly seed: number
  pylons: Pylon[] = []
  portals: Portal[] = []
  traces: Trace[] = []
  conduits: Conduit[] = []
  panels: GlassPanel[] = []
  fixtures: Fixture[] = []
  beacons: Beacon[] = []
  readonly reactor = { x: WORLD_W / 2, y: WORLD_H / 2, r: 128 }
  floor: HTMLCanvasElement | null = null
  floorScale = 1
  private rng: () => number

  constructor(seed: number) {
    this.seed = seed
    this.rng = mulberry32(seed)
    this.generate()
    this.generateDecor(mulberry32(seed ^ 0x51ed2701))
  }

  private generate(): void {
    const r = this.rng
    const inset = 130
    this.portals = [
      { x: inset, y: inset },
      { x: WORLD_W / 2, y: 90 },
      { x: WORLD_W - inset, y: inset },
      { x: WORLD_W - 90, y: WORLD_H / 2 },
      { x: WORLD_W - inset, y: WORLD_H - inset },
      { x: WORLD_W / 2, y: WORLD_H - 90 },
      { x: inset, y: WORLD_H - inset },
      { x: 90, y: WORLD_H / 2 },
    ].map((p) => ({ ...p, flare: 0 }))

    const target = 7 + Math.floor(r() * 3)
    let attempts = 0
    while (this.pylons.length < target && attempts < 600) {
      attempts++
      const pr = 30 + r() * 26
      const x = 260 + r() * (WORLD_W - 520)
      const y = 230 + r() * (WORLD_H - 460)
      // Keep the centre (player spawn), portals and existing pylons clear so
      // nobody can get wedged between obstacles.
      if (dist2(x, y, WORLD_W / 2, WORLD_H / 2) < 300 * 300) continue
      if (this.portals.some((p) => dist2(x, y, p.x, p.y) < 260 * 260)) continue
      if (this.pylons.some((p) => dist2(x, y, p.x, p.y) < (pr + p.r + 200) ** 2)) continue
      this.pylons.push({ x, y, r: pr, sides: r() < 0.5 ? 6 : 8, phase: r() * TAU })
    }

    const grid = 40
    for (let i = 0; i < 46; i++) {
      let x = Math.round((80 + r() * (WORLD_W - 160)) / grid) * grid
      let y = Math.round((80 + r() * (WORLD_H - 160)) / grid) * grid
      const pts = [{ x, y }]
      let horizontal = r() < 0.5
      const segs = 2 + Math.floor(r() * 5)
      for (let s = 0; s < segs; s++) {
        const len = (1 + Math.floor(r() * 4)) * grid * (r() < 0.5 ? -1 : 1)
        if (horizontal) x = Math.min(WORLD_W - 60, Math.max(60, x + len))
        else y = Math.min(WORLD_H - 60, Math.max(60, y + len))
        pts.push({ x, y })
        horizontal = !horizontal
      }
      const line = polyline(pts)
      if (line.length < 60) continue
      this.traces.push({
        ...line,
        color: r() < 0.62 ? COLORS.cyan : COLORS.violet,
        speed: 80 + r() * 160,
        offset: r() * 1000,
      })
    }
  }

  /** Purely visual features. Uses its own RNG so gameplay layout is unaffected. */
  private generateDecor(r: () => number): void {
    const rc = this.reactor

    // Power conduits from the reactor well to most spawn portals.
    const portals = [...this.portals].sort(() => r() - 0.5).slice(0, 6)
    for (const p of portals) {
      const dx = p.x - rc.x
      const dy = p.y - rc.y
      const d = Math.hypot(dx, dy) || 1
      const sx = rc.x + (dx / d) * (rc.r + 28)
      const sy = rc.y + (dy / d) * (rc.r + 28)
      const pts = [{ x: sx, y: sy }]
      const stop = 70
      if (Math.abs(dx) > Math.abs(dy)) {
        const turnX = Math.round((p.x - Math.sign(dx) * (180 + r() * 220)) / 40) * 40
        pts.push({ x: turnX, y: sy })
        pts.push({ x: turnX, y: p.y })
        pts.push({ x: p.x - Math.sign(dx) * stop, y: p.y })
      } else {
        const turnY = Math.round((p.y - Math.sign(dy) * (160 + r() * 180)) / 40) * 40
        pts.push({ x: sx, y: turnY })
        pts.push({ x: p.x, y: turnY })
        pts.push({ x: p.x, y: p.y - Math.sign(dy) * stop })
      }
      this.conduits.push({ ...polyline(pts), width: 16 + Math.floor(r() * 3) * 4, offset: r() * 400 })
    }

    // Glass floor panels on the plate grid, clear of obstacles.
    const cols = Math.floor(WORLD_W / PLATE)
    const rows = Math.floor(WORLD_H / PLATE)
    let attempts = 0
    while (this.panels.length < 8 && attempts < 400) {
      attempts++
      const wide = r() < 0.3
      const tall = !wide && r() < 0.25
      const cw = wide ? 2 : 1
      const ch = tall ? 2 : 1
      const cx = 1 + Math.floor(r() * (cols - 1 - cw))
      const cy = 1 + Math.floor(r() * (rows - 1 - ch))
      const inset = 20
      const panel = { x: cx * PLATE + inset, y: cy * PLATE + inset, w: cw * PLATE - inset * 2, h: ch * PLATE - inset * 2 }
      if (rectDist(rc.x, rc.y, panel) < rc.r + 90) continue
      if (this.pylons.some((p) => rectDist(p.x, p.y, panel) < p.r + 60)) continue
      if (this.portals.some((p) => rectDist(p.x, p.y, panel) < 150)) continue
      if (this.panels.some((o) => !(panel.x > o.x + o.w + PLATE || o.x > panel.x + panel.w + PLATE || panel.y > o.y + o.h + PLATE || o.y > panel.y + panel.h + PLATE)))
        continue
      this.panels.push(panel)
    }

    // Strip lights on plate seams.
    attempts = 0
    while (this.fixtures.length < 28 && attempts < 400) {
      attempts++
      const horizontal = r() < 0.5
      const x = horizontal ? Math.floor(r() * cols) * PLATE + 40 + r() * 60 : (1 + Math.floor(r() * (cols - 1))) * PLATE - 3
      const y = horizontal ? (1 + Math.floor(r() * (rows - 1))) * PLATE - 3 : Math.floor(r() * rows) * PLATE + 40 + r() * 60
      const f = horizontal ? { x, y, w: 46, h: 6, phase: r() * TAU } : { x, y, w: 6, h: 46, phase: r() * TAU }
      if (this.pylons.some((p) => rectDist(p.x, p.y, f) < p.r + 24)) continue
      if (this.panels.some((o) => rectDist(f.x + f.w / 2, f.y + f.h / 2, o) < 16)) continue
      if (rectDist(rc.x, rc.y, f) < rc.r + 40) continue
      this.fixtures.push(f)
    }

    // Warning beacons around the rim.
    for (let x = 200; x < WORLD_W; x += 400) {
      this.beacons.push({ x, y: 10, nx: 0, ny: 1, phase: r() * TAU })
      this.beacons.push({ x, y: WORLD_H - 10, nx: 0, ny: -1, phase: r() * TAU })
    }
    for (let y = 400; y < WORLD_H; y += 400) {
      this.beacons.push({ x: 10, y, nx: 1, ny: 0, phase: r() * TAU })
      this.beacons.push({ x: WORLD_W - 10, y, nx: -1, ny: 0, phase: r() * TAU })
    }
  }

  /** Point along a polyline at distance d (wraps). */
  tracePoint(t: Polyline, d: number): { x: number; y: number } {
    let rem = ((d % t.length) + t.length) % t.length
    for (let i = 0; i < t.segLengths.length; i++) {
      const l = t.segLengths[i]
      if (rem <= l) {
        const a = t.pts[i]
        const b = t.pts[i + 1]
        const k = l > 0 ? rem / l : 0
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
      }
      rem -= l
    }
    return t.pts[t.pts.length - 1]
  }

  /** Pushes a circle out of walls and pylons. Returns true if it collided. */
  resolve(body: { x: number; y: number; vx: number; vy: number; radius: number }, bounce = 0): boolean {
    let hit = false
    const r = body.radius
    if (body.x < r) {
      body.x = r
      body.vx = Math.abs(body.vx) * bounce
      hit = true
    } else if (body.x > WORLD_W - r) {
      body.x = WORLD_W - r
      body.vx = -Math.abs(body.vx) * bounce
      hit = true
    }
    if (body.y < r) {
      body.y = r
      body.vy = Math.abs(body.vy) * bounce
      hit = true
    } else if (body.y > WORLD_H - r) {
      body.y = WORLD_H - r
      body.vy = -Math.abs(body.vy) * bounce
      hit = true
    }
    for (const p of this.pylons) {
      const dx = body.x - p.x
      const dy = body.y - p.y
      const min = r + p.r
      const d2 = dx * dx + dy * dy
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.001
        const nx = dx / d
        const ny = dy / d
        body.x = p.x + nx * min
        body.y = p.y + ny * min
        const vn = body.vx * nx + body.vy * ny
        if (vn < 0) {
          body.vx -= vn * nx * (1 + bounce)
          body.vy -= vn * ny * (1 + bounce)
        }
        hit = true
      }
    }
    return hit
  }

  /** Returns the pylon a circle overlaps, if any. */
  pylonAt(x: number, y: number, r: number): Pylon | null {
    for (const p of this.pylons) {
      if (dist2(x, y, p.x, p.y) < (r + p.r) * (r + p.r)) return p
    }
    return null
  }

  blocked(x: number, y: number, r: number): boolean {
    return x < r || y < r || x > WORLD_W - r || y > WORLD_H - r || this.pylonAt(x, y, r) !== null
  }

  /** Bakes the static floor into an offscreen canvas, with glass panels cut out. */
  bake(scale: number): void {
    this.floorScale = scale
    const c = makeCanvas(WORLD_W * scale, WORLD_H * scale)
    const ctx = c.getContext('2d')
    if (!ctx) return
    const r = mulberry32(this.seed ^ 0x9e3779b9)
    ctx.scale(scale, scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.fillStyle = '#05080f'
    ctx.fillRect(0, 0, WORLD_W, WORLD_H)

    // Bevelled deck plates with tonal variation and occasional sub-panels.
    for (let y = 0; y < WORLD_H; y += PLATE) {
      for (let x = 0; x < WORLD_W; x += PLATE) {
        const v = r()
        const tone = 8 + Math.floor(v * 7)
        ctx.fillStyle = `rgb(${tone - 2},${tone + 2},${tone + 12})`
        ctx.fillRect(x + 2, y + 2, PLATE - 4, PLATE - 4)
        if (v > 0.72) {
          ctx.fillStyle = 'rgba(30,44,90,0.08)'
          ctx.fillRect(x + 10, y + 10, PLATE / 2 - 14, PLATE - 20)
          ctx.fillRect(x + PLATE / 2 + 4, y + 10, PLATE / 2 - 14, PLATE - 20)
        }
        ctx.fillStyle = 'rgba(150,180,255,0.05)'
        ctx.fillRect(x + 2, y + 2, PLATE - 4, 1.5)
        ctx.fillRect(x + 2, y + 2, 1.5, PLATE - 4)
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(x + 2, y + PLATE - 3.5, PLATE - 4, 1.5)
        ctx.fillRect(x + PLATE - 3.5, y + 2, 1.5, PLATE - 4)
      }
    }

    // Fine grid.
    ctx.strokeStyle = 'rgba(62,242,255,0.016)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= WORLD_W; x += 40) {
      ctx.moveTo(x + 0.5, 0)
      ctx.lineTo(x + 0.5, WORLD_H)
    }
    for (let y = 0; y <= WORLD_H; y += 40) {
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(WORLD_W, y + 0.5)
    }
    ctx.stroke()

    // Plate seams and rivets.
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let x = 0; x <= WORLD_W; x += PLATE) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, WORLD_H)
    }
    for (let y = 0; y <= WORLD_H; y += PLATE) {
      ctx.moveTo(0, y)
      ctx.lineTo(WORLD_W, y)
    }
    ctx.stroke()
    ctx.fillStyle = 'rgba(150,180,255,0.1)'
    for (let y = PLATE; y < WORLD_H; y += PLATE) {
      for (let x = PLATE; x < WORLD_W; x += PLATE) {
        ctx.fillRect(x - 7, y - 7, 2.5, 2.5)
        ctx.fillRect(x + 4.5, y + 4.5, 2.5, 2.5)
        ctx.fillRect(x + 4.5, y - 7, 2.5, 2.5)
        ctx.fillRect(x - 7, y + 4.5, 2.5, 2.5)
      }
    }

    // Wear: scratches and grime.
    ctx.lineWidth = 1
    for (let i = 0; i < 260; i++) {
      const x = r() * WORLD_W
      const y = r() * WORLD_H
      const a = r() * TAU
      const l = 6 + r() * 40
      ctx.strokeStyle = `rgba(160,190,255,${(0.015 + r() * 0.035).toFixed(3)})`
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
      ctx.stroke()
    }
    for (let i = 0; i < 22; i++) {
      const x = r() * WORLD_W
      const y = r() * WORLD_H
      const rad = 120 + r() * 280
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
      g.addColorStop(0, 'rgba(1,2,6,0.38)')
      g.addColorStop(1, 'rgba(1,2,6,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }

    // Circuit traces with pads.
    for (const t of this.traces) {
      ctx.strokeStyle = rgba(t.color, 0.06)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(t.pts[0].x, t.pts[0].y)
      for (const p of t.pts.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
      ctx.fillStyle = rgba(t.color, 0.16)
      for (const p of [t.pts[0], t.pts[t.pts.length - 1]]) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3.5, 0, TAU)
        ctx.fill()
      }
    }

    // Power conduit troughs with clamps.
    const strokePath = (pts: { x: number; y: number }[]) => {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    for (const cd of this.conduits) {
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.lineWidth = cd.width + 10
      strokePath(cd.pts)
      ctx.strokeStyle = '#0d1530'
      ctx.lineWidth = cd.width + 4
      strokePath(cd.pts)
      ctx.strokeStyle = '#03050c'
      ctx.lineWidth = cd.width - 2
      strokePath(cd.pts)
      ctx.strokeStyle = 'rgba(62,242,255,0.05)'
      ctx.lineWidth = 2
      strokePath(cd.pts)
      // Clamps every ~150 units.
      for (let d = 40; d < cd.length; d += 150) {
        const a = this.tracePoint(cd, d)
        const b = this.tracePoint(cd, d + 1)
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        ctx.save()
        ctx.translate(a.x, a.y)
        ctx.rotate(ang)
        ctx.fillStyle = '#111a33'
        ctx.fillRect(-3, -cd.width / 2 - 4, 6, cd.width + 8)
        ctx.fillStyle = 'rgba(160,190,255,0.15)'
        ctx.fillRect(-1, -cd.width / 2 - 3, 2, 2)
        ctx.fillRect(-1, cd.width / 2 + 1, 2, 2)
        ctx.restore()
      }
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Vents.
    for (let i = 0; i < 16; i++) {
      const w = 70 + Math.floor(r() * 3) * 20
      const h = 34
      const x = Math.round((150 + r() * (WORLD_W - 300)) / 40) * 40
      const y = Math.round((150 + r() * (WORLD_H - 300)) / 40) * 40
      if (dist2(x, y, WORLD_W / 2, WORLD_H / 2) < 280 * 280) continue
      if (this.panels.some((p) => rectDist(x + w / 2, y + h / 2, p) < 40)) continue
      ctx.fillStyle = 'rgba(1,2,6,0.75)'
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = 'rgba(120,150,255,0.14)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x + 0.5, y + 0.5, w, h)
      ctx.beginPath()
      for (let sx = x + 8; sx < x + w - 4; sx += 8) {
        ctx.moveTo(sx, y + 6)
        ctx.lineTo(sx, y + h - 6)
      }
      ctx.strokeStyle = 'rgba(120,150,255,0.09)'
      ctx.stroke()
    }

    // Strip light housings (their glow is animated live).
    for (const f of this.fixtures) {
      ctx.fillStyle = '#02040a'
      ctx.fillRect(f.x - 3, f.y - 3, f.w + 6, f.h + 6)
      ctx.fillStyle = 'rgba(62,242,255,0.1)'
      ctx.fillRect(f.x, f.y, f.w, f.h)
    }

    // Painted markings: hazard chevrons around portals, flow arrows on conduits.
    ctx.fillStyle = 'rgba(255,195,92,0.09)'
    for (const p of this.portals) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU
        ctx.save()
        ctx.translate(p.x + Math.cos(a) * 86, p.y + Math.sin(a) * 86)
        ctx.rotate(a)
        ctx.beginPath()
        ctx.moveTo(-5, -9)
        ctx.lineTo(4, 0)
        ctx.lineTo(-5, 9)
        ctx.lineTo(-1, 0)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }
    ctx.fillStyle = 'rgba(62,242,255,0.06)'
    for (const cd of this.conduits) {
      for (let d = 70; d < cd.length - 40; d += 180) {
        const a = this.tracePoint(cd, d)
        const b = this.tracePoint(cd, d + 1)
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        const off = cd.width / 2 + 16
        for (const side of [-1, 1]) {
          ctx.save()
          ctx.translate(a.x - Math.sin(ang) * off * side, a.y + Math.cos(ang) * off * side)
          ctx.rotate(ang)
          ctx.beginPath()
          ctx.moveTo(-6, -6)
          ctx.lineTo(4, 0)
          ctx.lineTo(-6, 6)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }
      }
    }

    // Large stencilled sector codes in the quadrants.
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const codes = ['A7', 'B7', 'C7', 'D7']
    const quads = [
      [WORLD_W * 0.25, WORLD_H * 0.27],
      [WORLD_W * 0.75, WORLD_H * 0.27],
      [WORLD_W * 0.25, WORLD_H * 0.73],
      [WORLD_W * 0.75, WORLD_H * 0.73],
    ]
    quads.forEach(([qx, qy], i) => {
      const x = qx + (r() - 0.5) * 120
      const y = qy + (r() - 0.5) * 80
      if (this.pylons.some((p) => dist2(x, y, p.x, p.y) < 160 * 160)) return
      ctx.font = '800 150px "Oxanium Variable", "Oxanium", sans-serif'
      ctx.fillStyle = 'rgba(140,165,255,0.045)'
      ctx.fillText(codes[i], x, y)
      // Stencil bridges.
      ctx.fillStyle = '#070b16'
      ctx.fillRect(x - 120, y - 3, 240, 6)
    })

    for (let i = 0; i < 9; i++) {
      const label = LABELS[Math.floor(r() * LABELS.length)]
      const x = 200 + r() * (WORLD_W - 400)
      const y = 160 + r() * (WORLD_H - 320)
      if (dist2(x, y, this.reactor.x, this.reactor.y) < 300 * 300) continue
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(r() < 0.25 ? -Math.PI / 2 : 0)
      ctx.font = `700 ${18 + Math.floor(r() * 3) * 6}px "Oxanium Variable", "Oxanium", sans-serif`
      ctx.fillStyle = 'rgba(150,170,255,0.055)'
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }

    // Reactor well surround: concentric markings and tick ring.
    const rc = this.reactor
    ctx.strokeStyle = 'rgba(62,242,255,0.06)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(rc.x, rc.y, 215, 0, TAU)
    ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(rc.x, rc.y, 176, 0, TAU)
    ctx.stroke()
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU
      const l = i % 5 === 0 ? 16 : 7
      ctx.beginPath()
      ctx.moveTo(rc.x + Math.cos(a) * 178, rc.y + Math.sin(a) * 178)
      ctx.lineTo(rc.x + Math.cos(a) * (178 + l), rc.y + Math.sin(a) * (178 + l))
      ctx.stroke()
    }

    // Hazard stripes hugging the walls, plus a raised rim plate.
    ctx.save()
    const band = 26
    ctx.beginPath()
    ctx.rect(0, 0, WORLD_W, band)
    ctx.rect(0, WORLD_H - band, WORLD_W, band)
    ctx.rect(0, 0, band, WORLD_H)
    ctx.rect(WORLD_W - band, 0, band, WORLD_H)
    ctx.clip()
    ctx.fillStyle = '#0b1122'
    ctx.fillRect(0, 0, WORLD_W, WORLD_H)
    ctx.strokeStyle = 'rgba(255,195,92,0.1)'
    ctx.lineWidth = 10
    ctx.beginPath()
    for (let d = -WORLD_H; d < WORLD_W + WORLD_H; d += 34) {
      ctx.moveTo(d, 0)
      ctx.lineTo(d + WORLD_H, WORLD_H)
    }
    ctx.stroke()
    ctx.restore()
    ctx.strokeStyle = 'rgba(160,190,255,0.12)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(band, band, WORLD_W - band * 2, WORLD_H - band * 2)

    // Portal iris hatches.
    for (const p of this.portals) {
      ctx.fillStyle = '#020309'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 58, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = '#18244a'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.arc(p.x, p.y, 58, 0, TAU)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,61,154,0.18)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, 62, 0, TAU)
      ctx.stroke()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU
        ctx.fillStyle = i % 2 ? '#0a1020' : '#0d1428'
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + Math.cos(a) * 52, p.y + Math.sin(a) * 52)
        ctx.lineTo(p.x + Math.cos(a + TAU / 8) * 52, p.y + Math.sin(a + TAU / 8) * 52)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,61,154,0.1)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10)
        ctx.lineTo(p.x + Math.cos(a) * 52, p.y + Math.sin(a) * 52)
        ctx.stroke()
      }
    }

    // Pylon footings: contact shadow, mounting ring and cable runs.
    for (const p of this.pylons) {
      const g = ctx.createRadialGradient(p.x + 10, p.y + 14, p.r * 0.5, p.x + 10, p.y + 14, p.r * 2.6)
      g.addColorStop(0, 'rgba(0,0,0,0.65)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(p.x + 10, p.y + 14, p.r * 2.6, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = '#141d38'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r + 12, 0, TAU)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(62,242,255,0.09)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r + 20, 0, TAU)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(2,3,8,0.85)'
      ctx.lineWidth = 5
      for (let k = 0; k < 3; k++) {
        const a = p.phase + k * 2.1
        const len = 70 + r() * 60
        ctx.beginPath()
        ctx.moveTo(p.x + Math.cos(a) * (p.r + 14), p.y + Math.sin(a) * (p.r + 14))
        ctx.quadraticCurveTo(
          p.x + Math.cos(a + 0.4) * (p.r + len * 0.6),
          p.y + Math.sin(a + 0.4) * (p.r + len * 0.6),
          p.x + Math.cos(a + 0.2) * (p.r + len),
          p.y + Math.sin(a + 0.2) * (p.r + len),
        )
        ctx.stroke()
      }
    }

    // Edge falloff for depth.
    const cx = WORLD_W / 2
    const cy = WORLD_H / 2
    const edge = ctx.createRadialGradient(cx, cy, Math.min(WORLD_W, WORLD_H) * 0.35, cx, cy, Math.max(WORLD_W, WORLD_H) * 0.75)
    edge.addColorStop(0, 'rgba(0,0,0,0)')
    edge.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = edge
    ctx.fillRect(0, 0, WORLD_W, WORLD_H)

    // Cut the glass panels and reactor well out of the deck.
    ctx.globalCompositeOperation = 'destination-out'
    for (const p of this.panels) ctx.fillRect(p.x, p.y, p.w, p.h)
    ctx.beginPath()
    ctx.arc(rc.x, rc.y, rc.r, 0, TAU)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

    // Faint glass sheen so panels read as glass rather than holes.
    for (const p of this.panels) {
      const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h)
      g.addColorStop(0, 'rgba(150,200,255,0.07)')
      g.addColorStop(0.5, 'rgba(150,200,255,0.015)')
      g.addColorStop(1, 'rgba(150,200,255,0.05)')
      ctx.fillStyle = g
      ctx.fillRect(p.x, p.y, p.w, p.h)
    }
    const sheen = ctx.createLinearGradient(rc.x - rc.r, rc.y - rc.r, rc.x + rc.r, rc.y + rc.r)
    sheen.addColorStop(0, 'rgba(150,200,255,0.06)')
    sheen.addColorStop(0.5, 'rgba(150,200,255,0.01)')
    sheen.addColorStop(1, 'rgba(150,200,255,0.04)')
    ctx.fillStyle = sheen
    ctx.beginPath()
    ctx.arc(rc.x, rc.y, rc.r, 0, TAU)
    ctx.fill()

    // Panel frames and support grates.
    for (const p of this.panels) {
      ctx.strokeStyle = '#1a2547'
      ctx.lineWidth = 8
      ctx.strokeRect(p.x - 2, p.y - 2, p.w + 4, p.h + 4)
      ctx.strokeStyle = 'rgba(170,200,255,0.16)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(p.x - 6, p.y - 6, p.w + 12, p.h + 12)
      ctx.strokeStyle = 'rgba(6,9,20,0.95)'
      ctx.lineWidth = 3
      ctx.beginPath()
      const bars = Math.max(2, Math.round(Math.max(p.w, p.h) / 60))
      for (let i = 1; i < bars; i++) {
        if (p.w >= p.h) {
          const x = p.x + (p.w * i) / bars
          ctx.moveTo(x, p.y)
          ctx.lineTo(x, p.y + p.h)
        } else {
          const y = p.y + (p.h * i) / bars
          ctx.moveTo(p.x, y)
          ctx.lineTo(p.x + p.w, y)
        }
      }
      ctx.stroke()
      ctx.fillStyle = 'rgba(170,200,255,0.3)'
      for (const [bx, by] of [
        [p.x - 2, p.y - 2],
        [p.x + p.w + 2, p.y - 2],
        [p.x - 2, p.y + p.h + 2],
        [p.x + p.w + 2, p.y + p.h + 2],
      ]) {
        ctx.beginPath()
        ctx.arc(bx, by, 2.5, 0, TAU)
        ctx.fill()
      }
    }

    // Reactor frame, struts and hub.
    ctx.strokeStyle = '#1a2547'
    ctx.lineWidth = 16
    ctx.beginPath()
    ctx.arc(rc.x, rc.y, rc.r + 6, 0, TAU)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(170,200,255,0.18)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(rc.x, rc.y, rc.r + 15, 0, TAU)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(6,9,20,0.95)'
    ctx.lineWidth = 7
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6
      ctx.beginPath()
      ctx.moveTo(rc.x + Math.cos(a) * 22, rc.y + Math.sin(a) * 22)
      ctx.lineTo(rc.x + Math.cos(a) * rc.r, rc.y + Math.sin(a) * rc.r)
      ctx.stroke()
    }
    ctx.fillStyle = '#121b36'
    ctx.beginPath()
    ctx.arc(rc.x, rc.y, 22, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = 'rgba(62,242,255,0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(rc.x, rc.y, 22, 0, TAU)
    ctx.stroke()
    ctx.fillStyle = 'rgba(170,200,255,0.3)'
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU
      ctx.beginPath()
      ctx.arc(rc.x + Math.cos(a) * (rc.r + 6), rc.y + Math.sin(a) * (rc.r + 6), 2, 0, TAU)
      ctx.fill()
    }

    this.floor = c
  }
}
