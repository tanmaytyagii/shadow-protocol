import { TAU, rand } from '../math'

export const PKind = {
  /** Velocity-aligned streak. */
  Spark: 0,
  /** Hot additive glow sprite. */
  Glow: 1,
  /** Expanding stroked ring. */
  Ring: 2,
  /** Spinning thin fragment. */
  Shard: 3,
  /** Dark soft puff (normal blending). */
  Smoke: 4,
  /** Small bright mote that drifts and flickers. */
  Ember: 5,
  /** Spinning hull fragment with an emissive edge. */
  Debris: 6,
  /** Anamorphic lens streak. */
  Flare: 7,
  /** Heavy soft shockwave ring. */
  Shock: 8,
  /** Lightning bolt between (x, y) and (x2, y2). */
  Arc: 9,
  /** Fading line between (x, y) and (x2, y2), e.g. rail trails. */
  Streak: 10,
  /** Invisible: only lights the floor. */
  Light: 11,
  /** Four-point glint. */
  Star: 12,
} as const
export type PKind = (typeof PKind)[keyof typeof PKind]

export class Particle {
  x = 0
  y = 0
  vx = 0
  vy = 0
  x2 = 0
  y2 = 0
  life = 0
  max = 1
  size = 1
  grow = 0
  color = '#fff'
  kind: PKind = PKind.Spark
  drag = 0
  rot = 0
  vr = 0
  /** Peak opacity multiplier. */
  alpha = 1
  /** Radius of floor light this particle emits (0 = none). */
  light = 0
  /** Polygon side count for debris; random seed for arcs. */
  sides = 4
  seed = 0
  alive = false
}

export interface FloatingText {
  x: number
  y: number
  vy: number
  text: string
  color: string
  size: number
  baseSize: number
  life: number
  max: number
  /** Enemy id for merged damage numbers, -1 for free text. */
  owner: number
  value: number
  crit: boolean
  /** Scale bump when the number grows. */
  pop: number
}

export type GhostShape = 'player' | 'wraith' | 'disc'

export interface Ghost {
  x: number
  y: number
  angle: number
  life: number
  max: number
  color: string
  radius: number
  shape: GhostShape
}

export interface Decal {
  x: number
  y: number
  r: number
  rot: number
  life: number
  max: number
  /** Colour of the cooling rim glow. */
  color: string
}

const MERGE_WINDOW = 0.32

/**
 * Pooled particles (ring buffer, no per-frame allocation), merged combat text,
 * afterimages and floor decals.
 */
export class Effects {
  particles: Particle[] = []
  texts: FloatingText[] = []
  ghosts: Ghost[] = []
  decals: Decal[] = []
  private cursor = 0
  private capacity: number
  /** Emission multiplier from the quality preset. */
  intensity = 1
  /** Extra multiplier from the adaptive performance governor. */
  budget = 1
  decalCap = 40

  constructor(capacity: number) {
    this.capacity = capacity
    this.intensity = Effects.intensityFor(capacity)
    for (let i = 0; i < capacity; i++) this.particles.push(new Particle())
  }

  /** Scales emission counts down for lower quality settings. */
  private static intensityFor(capacity: number): number {
    return capacity < 400 ? 0.45 : capacity < 900 ? 0.75 : 1
  }

  setCapacity(capacity: number): void {
    if (capacity === this.capacity) return
    if (capacity > this.particles.length) {
      for (let i = this.particles.length; i < capacity; i++) this.particles.push(new Particle())
    } else {
      this.particles.length = capacity
    }
    this.capacity = capacity
    this.cursor = 0
    this.intensity = Effects.intensityFor(capacity)
  }

  clear(): void {
    for (const p of this.particles) p.alive = false
    this.texts.length = 0
    this.ghosts.length = 0
    this.decals.length = 0
  }

  alive(): number {
    let n = 0
    for (const p of this.particles) if (p.alive) n++
    return n
  }

  private next(): Particle {
    // Ring buffer: when full, the oldest particle is recycled.
    for (let n = 0; n < this.capacity; n++) {
      const p = this.particles[this.cursor]
      this.cursor = (this.cursor + 1) % this.capacity
      if (!p.alive) return p
    }
    const p = this.particles[this.cursor]
    this.cursor = (this.cursor + 1) % this.capacity
    return p
  }

  /** Scaled particle count; never zero for a requested effect. */
  count(n: number): number {
    return Math.max(1, Math.round(n * this.intensity * this.budget))
  }

  spawn(
    kind: PKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    drag = 3,
    grow = 0,
  ): Particle {
    const p = this.next()
    p.alive = true
    p.kind = kind
    p.x = x
    p.y = y
    p.vx = vx
    p.vy = vy
    p.x2 = x
    p.y2 = y
    p.life = life
    p.max = life
    p.size = size
    p.grow = grow
    p.color = color
    p.drag = drag
    p.rot = Math.random() * TAU
    p.vr = rand(-8, 8)
    p.alpha = 1
    p.light = 0
    p.sides = 4
    p.seed = Math.random() * 1000
    return p
  }

  sparks(x: number, y: number, color: string, count: number, speed: number, angle = 0, spread = TAU, life = 0.35): void {
    const n = this.count(count)
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread
      const s = speed * (0.35 + Math.random() * 0.75)
      this.spawn(PKind.Spark, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random() * 0.7), rand(1.1, 2.3), color, 4.5)
    }
  }

  shards(x: number, y: number, color: string, count: number, speed: number): void {
    const n = this.count(count)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      const s = speed * (0.3 + Math.random() * 0.8)
      this.spawn(PKind.Shard, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.4, 0.9), rand(2, 4.5), color, 3.2)
    }
  }

  glow(x: number, y: number, color: string, size: number, life: number, grow = 0): Particle {
    return this.spawn(PKind.Glow, x, y, 0, 0, life, size, color, 0, grow)
  }

  ring(x: number, y: number, color: string, radius: number, life: number, grow: number): Particle {
    return this.spawn(PKind.Ring, x, y, 0, 0, life, radius, color, 0, grow)
  }

  smoke(x: number, y: number, count: number, color = '#1a2340'): void {
    const n = this.count(count)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      const s = rand(10, 60)
      this.spawn(PKind.Smoke, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.6, 1.3), rand(8, 18), color, 1.5, 16)
    }
  }

  embers(x: number, y: number, color: string, count: number, speed: number, angle = 0, spread = TAU): void {
    const n = this.count(count)
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread
      const s = speed * (0.2 + Math.random() * 0.8)
      const p = this.spawn(PKind.Ember, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1.2), rand(1.2, 2.4), color, 2.2)
      p.vr = rand(4, 12)
    }
  }

  /** Hull fragments; `bias` (0..1) pushes them along (dx, dy). */
  debris(x: number, y: number, color: string, count: number, speed: number, dx = 0, dy = 0, bias = 0, size = 4): void {
    const n = this.count(count)
    for (let i = 0; i < n; i++) {
      let a = Math.random() * TAU
      if (bias > 0 && (dx !== 0 || dy !== 0)) {
        const toward = Math.atan2(dy, dx)
        a = toward + (Math.random() - 0.5) * TAU * (1 - bias)
      }
      const s = speed * (0.35 + Math.random() * 0.75)
      const p = this.spawn(PKind.Debris, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.55, 1.1), size * rand(0.6, 1.4), color, 3)
      p.sides = 3 + Math.floor(Math.random() * 3)
      p.vr = rand(-14, 14)
    }
  }

  flare(x: number, y: number, color: string, width: number, life: number, rot = 0): Particle {
    const p = this.spawn(PKind.Flare, x, y, 0, 0, life, width, color, 0, 0)
    p.rot = rot
    return p
  }

  shock(x: number, y: number, color: string, radius: number, life: number, grow: number, alpha = 1): Particle {
    const p = this.spawn(PKind.Shock, x, y, 0, 0, life, radius, color, 0, grow)
    p.alpha = alpha
    return p
  }

  arc(x1: number, y1: number, x2: number, y2: number, color: string, life: number, width = 1.6): Particle {
    const p = this.spawn(PKind.Arc, x1, y1, 0, 0, life, width, color, 0, 0)
    p.x2 = x2
    p.y2 = y2
    return p
  }

  streak(x1: number, y1: number, x2: number, y2: number, color: string, life: number, width: number): Particle {
    const p = this.spawn(PKind.Streak, x1, y1, 0, 0, life, width, color, 0, 0)
    p.x2 = x2
    p.y2 = y2
    return p
  }

  /** Floor light pulse; `alpha` is the peak intensity. */
  light(x: number, y: number, radius: number, color: string, life: number, alpha = 1): Particle {
    const p = this.spawn(PKind.Light, x, y, 0, 0, life, radius, color, 0, 0)
    p.alpha = alpha
    p.light = radius
    return p
  }

  star(x: number, y: number, color: string, size: number, life: number): Particle {
    const p = this.spawn(PKind.Star, x, y, 0, 0, life, size, color, 0, 0)
    p.rot = Math.random() * 0.6 - 0.3
    return p
  }

  explosion(x: number, y: number, color: string, scale = 1): void {
    this.glow(x, y, '#ffffff', 26 * scale, 0.1, 160 * scale)
    this.glow(x, y, color, 70 * scale, 0.32, 150 * scale)
    this.shock(x, y, color, 8 * scale, 0.42, 300 * scale, 0.9)
    this.sparks(x, y, color, 16 * scale, 440 * scale, 0, TAU, 0.45)
    this.sparks(x, y, '#ffffff', 6 * scale, 320 * scale, 0, TAU, 0.25)
    this.debris(x, y, color, 5 * scale, 240 * scale, 0, 0, 0, 3.5 * Math.sqrt(scale))
    this.embers(x, y, color, 7 * scale, 150 * scale)
    this.smoke(x, y, 4 * scale)
    this.light(x, y, 180 * Math.sqrt(scale) + 40, color, 0.45, 0.8)
  }

  decal(x: number, y: number, r: number, color: string, life = 8): void {
    if (this.decalCap <= 0) return
    if (this.decals.length >= this.decalCap) this.decals.shift()
    this.decals.push({ x, y, r, rot: Math.random() * TAU, life, max: life, color })
  }

  text(x: number, y: number, text: string, color: string, size: number, life = 0.7): void {
    if (this.texts.length > 60) this.texts.shift()
    this.texts.push({ x: x + rand(-6, 6), y, vy: -70 - Math.random() * 30, text, color, size, baseSize: size, life, max: life, owner: -1, value: 0, crit: false, pop: 0 })
  }

  /**
   * Damage numbers merge per target while hits keep landing, so rapid fire
   * produces one growing number instead of a stack.
   */
  damage(owner: number, x: number, y: number, amount: number, crit: boolean): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]
      if (t.owner !== owner || t.max - t.life > MERGE_WINDOW) continue
      t.value += amount
      if (crit && !t.crit) {
        t.crit = true
        t.color = '#ffc35c'
        t.baseSize = 16
      }
      t.text = t.crit ? `${Math.round(t.value)}!` : `${Math.round(t.value)}`
      t.size = t.baseSize * (1 + Math.min(0.55, t.value / 600))
      t.pop = 1
      t.life = Math.max(t.life, t.max * 0.9)
      t.x += (x - t.x) * 0.35
      return
    }
    if (this.texts.length > 60) this.texts.shift()
    const size = crit ? 17 : 12
    const life = crit ? 0.8 : 0.6
    this.texts.push({
      x: x + rand(-5, 5),
      y,
      vy: crit ? -95 : -75,
      text: crit ? `${Math.round(amount)}!` : `${Math.round(amount)}`,
      color: crit ? '#ffc35c' : '#dfe8ff',
      size,
      baseSize: size,
      life,
      max: life,
      owner,
      value: amount,
      crit,
      pop: 1,
    })
  }

  ghost(x: number, y: number, angle: number, color: string, radius: number, life = 0.28, shape: GhostShape = 'player'): void {
    if (this.ghosts.length > 48) this.ghosts.shift()
    this.ghosts.push({ x, y, angle, life, max: life, color, radius, shape })
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.alive) continue
      p.life -= dt
      if (p.life <= 0) {
        p.alive = false
        continue
      }
      const d = Math.exp(-p.drag * dt)
      p.vx *= d
      p.vy *= d
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.size += p.grow * dt
      p.rot += p.vr * dt
      if (p.kind === PKind.Ember) {
        // Gentle curl so embers drift instead of flying straight.
        const c = Math.sin(p.seed + p.life * 6) * 40 * dt
        p.vx += -p.vy * c * 0.02
        p.vy += p.vx * c * 0.02
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]
      t.life -= dt
      t.y += t.vy * dt
      t.vy *= Math.exp(-4 * dt)
      t.pop = Math.max(0, t.pop - dt * 6)
      if (t.life <= 0) this.texts.splice(i, 1)
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]
      g.life -= dt
      if (g.life <= 0) this.ghosts.splice(i, 1)
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]
      d.life -= dt
      if (d.life <= 0) this.decals.splice(i, 1)
    }
  }
}
