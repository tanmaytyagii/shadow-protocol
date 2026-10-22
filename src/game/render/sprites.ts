// Cached procedural sprites. Everything here is drawn once and reused, which is
// far cheaper than per-frame gradients or canvas shadowBlur.

const cache = new Map<string, HTMLCanvasElement>()
const rgbCache = new Map<string, [number, number, number]>()

export function hexToRgb(hex: string): [number, number, number] {
  const cached = rgbCache.get(hex)
  if (cached) return cached
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  const rgb: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  rgbCache.set(hex, rgb)
  return rgb
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

/** Linear blend between two hex colours, returned as hex. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const k = Math.max(0, Math.min(1, t))
  const c = (x: number, y: number) => Math.round(x + (y - x) * k)
  return `#${((1 << 24) | (c(ar, br) << 16) | (c(ag, bg) << 8) | c(ab, bb)).toString(16).slice(1)}`
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

/** Number of cached sprite canvases (diagnostics: this must plateau, not grow with play time). */
export function spriteCacheSize(): number {
  return cache.size
}

function cached(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const hit = cache.get(key)
  if (hit) return hit
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')
  if (ctx) draw(ctx, c.width, c.height)
  cache.set(key, c)
  return c
}

/** Soft radial glow; `hot` adds a white-hot centre. Draw with 'lighter'. */
export function glowSprite(color: string, hot = false): HTMLCanvasElement {
  return cached(`glow|${color}|${hot ? 1 : 0}`, 128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    if (hot) {
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(0.12, rgba(color, 0.85))
    } else {
      g.addColorStop(0, rgba(color, 0.6))
    }
    g.addColorStop(0.35, rgba(color, 0.22))
    g.addColorStop(0.7, rgba(color, 0.05))
    g.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, w)
  })
}

/** Very soft, wide falloff used to light the floor. Draw with 'lighter'. */
export function lightSprite(color: string): HTMLCanvasElement {
  return cached(`light|${color}`, 256, 256, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    g.addColorStop(0, rgba(color, 0.9))
    g.addColorStop(0.12, rgba(color, 0.55))
    g.addColorStop(0.35, rgba(color, 0.2))
    g.addColorStop(0.65, rgba(color, 0.06))
    g.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, w)
  })
}

/** Soft black contact shadow. Draw with normal blending. */
export function shadowSprite(): HTMLCanvasElement {
  return cached('shadow', 128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    g.addColorStop(0, 'rgba(0,0,0,0.62)')
    g.addColorStop(0.5, 'rgba(0,0,0,0.3)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, w)
  })
}

/** Dark, soft smoke puff tinted toward navy. */
export function smokeSprite(): HTMLCanvasElement {
  return cached('smoke', 96, 96, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    g.addColorStop(0, 'rgba(20,26,48,0.75)')
    g.addColorStop(0.55, 'rgba(14,18,36,0.35)')
    g.addColorStop(1, 'rgba(8,10,22,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, w)
  })
}

/** Anamorphic horizontal lens streak. Draw with 'lighter'. */
export function flareSprite(color: string): HTMLCanvasElement {
  return cached(`flare|${color}`, 256, 32, (ctx, w, h) => {
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.scale(1, h / w)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.08, rgba(color, 0.75))
    g.addColorStop(0.35, rgba(color, 0.18))
    g.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  })
}

/** Four-point star glint for crits and muzzle flashes. Draw with 'lighter'. */
export function starSprite(color: string): HTMLCanvasElement {
  return cached(`star|${color}`, 96, 96, (ctx, w) => {
    const c = w / 2
    const glow = ctx.createRadialGradient(c, c, 0, c, c, c * 0.55)
    glow.addColorStop(0, 'rgba(255,255,255,0.9)')
    glow.addColorStop(0.3, rgba(color, 0.45))
    glow.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, w)
    for (const rot of [0, Math.PI / 2]) {
      ctx.save()
      ctx.translate(c, c)
      ctx.rotate(rot)
      ctx.scale(1, 0.07)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.3, rgba(color, 0.6))
      g.addColorStop(1, rgba(color, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, c, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  })
}

/** Scorch mark decal: dark burn with a faint cool rim. */
export function scorchSprite(): HTMLCanvasElement {
  return cached('scorch', 128, 128, (ctx, w) => {
    const c = w / 2
    const g = ctx.createRadialGradient(c, c, 0, c, c, c)
    g.addColorStop(0, 'rgba(0,0,0,0.78)')
    g.addColorStop(0.45, 'rgba(2,3,8,0.5)')
    g.addColorStop(0.8, 'rgba(10,14,30,0.12)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, w)
    // Irregular splatter so it doesn't read as a perfect circle.
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.sin(i * 7.3) * 0.4
      const r = c * (0.45 + ((i * 37) % 10) / 30)
      ctx.beginPath()
      ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 3 + ((i * 13) % 5), 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

/**
 * Tileable soft value-noise texture used for drifting haze. Built by upscaling
 * a tiny random grid with bilinear smoothing, layered at two frequencies.
 */
export function noiseTexture(): HTMLCanvasElement {
  return cached('noise', 256, 256, (ctx, w) => {
    let seed = 1337
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (const [cells, alpha] of [
      [6, 0.9],
      [14, 0.45],
    ] as const) {
      const small = makeCanvas(cells + 1, cells + 1)
      const sctx = small.getContext('2d')
      if (!sctx) continue
      const values: number[][] = []
      for (let y = 0; y < cells; y++) {
        values.push([])
        for (let x = 0; x < cells; x++) values[y].push(rnd())
      }
      // Wrap the last row/column so the upscaled result tiles seamlessly.
      for (let y = 0; y <= cells; y++) {
        for (let x = 0; x <= cells; x++) {
          const v = values[y % cells][x % cells]
          sctx.fillStyle = `rgba(255,255,255,${(v * v * alpha).toFixed(3)})`
          sctx.fillRect(x, y, 1, 1)
        }
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      const scale = w / cells
      ctx.drawImage(small, 0, 0, cells + 1, cells + 1, -scale / 2, -scale / 2, w + scale, w + scale)
    }
  })
}
