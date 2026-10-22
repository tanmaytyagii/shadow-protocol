import { COLORS } from '../../constants'
import { ENEMIES } from '../../entities/Enemy'
import { TAU } from '../../math'
import type { EnemyKind } from '../../types'
import { makeCanvas, rgba } from '../sprites'
import { poly, wraithShape } from './shapes'

/** Sprite resolution in pixels per world unit. */
const PX = 3

export type SpriteVariant = 'base' | 'elite' | 'flash'

export interface EnemySprite {
  canvas: HTMLCanvasElement
  /** Half-size in world units; draw at (-ext, -ext, 2ext, 2ext). */
  ext: number
}

interface Palette {
  core: string
  mid: string
  rim: string
  edge: string
  detail: string
  socket: string
  flash: boolean
}

type Ctx = CanvasRenderingContext2D

const EXTENT: Partial<Record<EnemyKind, number>> = {
  drone: 1.55,
  mite: 1.45,
  sentinel: 1.6,
  brute: 1.25,
  wraith: 1.25,
  splitter: 1.2,
}

const cache = new Map<string, EnemySprite>()

function hullFill(ctx: Ctx, r: number, pal: Palette, cx = 0): CanvasGradient | string {
  if (pal.flash) return '#ffffff'
  const g = ctx.createRadialGradient(cx, 0, 0, cx, 0, r * 1.3)
  g.addColorStop(0, pal.core)
  g.addColorStop(0.55, pal.mid)
  g.addColorStop(1, pal.rim)
  return g
}

function drawDrone(ctx: Ctx, r: number, pal: Palette): void {
  ctx.beginPath()
  ctx.moveTo(r * 1.35, 0)
  ctx.lineTo(r * 0.2, r * 0.42)
  ctx.lineTo(-r * 0.55, r * 0.98)
  ctx.lineTo(-r * 0.95, r * 0.86)
  ctx.lineTo(-r * 0.5, r * 0.22)
  ctx.lineTo(-r * 0.78, 0)
  ctx.lineTo(-r * 0.5, -r * 0.22)
  ctx.lineTo(-r * 0.95, -r * 0.86)
  ctx.lineTo(-r * 0.55, -r * 0.98)
  ctx.lineTo(r * 0.2, -r * 0.42)
  ctx.closePath()
  ctx.fillStyle = hullFill(ctx, r, pal, r * 0.15)
  ctx.fill()
  ctx.strokeStyle = pal.edge
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (pal.flash) return
  ctx.strokeStyle = pal.detail
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(r * 1.0, 0)
  ctx.lineTo(-r * 0.35, r * 0.52)
  ctx.moveTo(r * 1.0, 0)
  ctx.lineTo(-r * 0.35, -r * 0.52)
  ctx.moveTo(r * 0.85, 0)
  ctx.lineTo(-r * 0.62, 0)
  ctx.stroke()
  ctx.fillStyle = pal.socket
  ctx.beginPath()
  ctx.arc(r * 0.42, 0, r * 0.22, 0, TAU)
  ctx.fill()
  for (const s of [-1, 1]) {
    ctx.fillRect(-r * 0.92, s * r * 0.12 - r * 0.06, r * 0.2, r * 0.12)
  }
}

function drawMite(ctx: Ctx, r: number, pal: Palette): void {
  ctx.beginPath()
  ctx.moveTo(r * 1.25, 0)
  ctx.lineTo(r * 0.2, r * 0.45)
  ctx.lineTo(0, r * 0.85)
  ctx.lineTo(-r * 0.25, r * 0.4)
  ctx.lineTo(-r * 1.0, 0)
  ctx.lineTo(-r * 0.25, -r * 0.4)
  ctx.lineTo(0, -r * 0.85)
  ctx.lineTo(r * 0.2, -r * 0.45)
  ctx.closePath()
  ctx.fillStyle = pal.flash ? '#ffffff' : (() => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.2)
    g.addColorStop(0, '#5a1236')
    g.addColorStop(1, '#1a0410')
    return g
  })()
  ctx.fill()
  ctx.strokeStyle = pal.edge
  ctx.lineWidth = 1.3
  ctx.stroke()
  if (pal.flash) return
  ctx.strokeStyle = pal.detail
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.moveTo(r * 0.9, 0)
  ctx.lineTo(-r * 0.6, 0)
  ctx.stroke()
}

function drawSentinel(ctx: Ctx, r: number, pal: Palette): void {
  // Side fins.
  ctx.fillStyle = pal.flash ? '#ffffff' : '#120d28'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(-r * 0.2, s * r * 0.75)
    ctx.lineTo(r * 0.25, s * r * 0.95)
    ctx.lineTo(r * 0.05, s * r * 1.18)
    ctx.lineTo(-r * 0.5, s * r * 1.0)
    ctx.closePath()
    ctx.fill()
    if (!pal.flash) {
      ctx.strokeStyle = pal.detail
      ctx.lineWidth = 0.8
      ctx.stroke()
    }
  }
  poly(ctx, 0, 0, r, 4, 0)
  ctx.fillStyle = hullFill(ctx, r, pal)
  ctx.fill()
  ctx.strokeStyle = pal.edge
  ctx.lineWidth = 1.7
  ctx.stroke()
  // Barrel.
  ctx.fillStyle = pal.flash ? '#ffffff' : '#0b0820'
  ctx.fillRect(r * 0.25, -r * 0.14, r * 1.05, r * 0.28)
  if (pal.flash) return
  ctx.strokeStyle = pal.detail
  ctx.lineWidth = 0.8
  ctx.strokeRect(r * 0.25, -r * 0.14, r * 1.05, r * 0.28)
  poly(ctx, 0, 0, r * 0.55, 4, Math.PI / 4)
  ctx.strokeStyle = pal.detail
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = pal.socket
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.28, 0, TAU)
  ctx.fill()
}

function drawBrute(ctx: Ctx, r: number, pal: Palette): void {
  poly(ctx, 0, 0, r, 6, 0)
  ctx.fillStyle = hullFill(ctx, r, pal)
  ctx.fill()
  ctx.strokeStyle = pal.edge
  ctx.lineWidth = 2.4
  ctx.stroke()
  if (pal.flash) return
  // Armour plates around the hull.
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * TAU + 0.08
    const a1 = ((i + 1) / 6) * TAU - 0.08
    ctx.beginPath()
    ctx.moveTo(Math.cos(a0) * r * 0.9, Math.sin(a0) * r * 0.9)
    ctx.lineTo(Math.cos(a1) * r * 0.9, Math.sin(a1) * r * 0.9)
    ctx.lineTo(Math.cos(a1) * r * 0.66, Math.sin(a1) * r * 0.66)
    ctx.lineTo(Math.cos(a0) * r * 0.66, Math.sin(a0) * r * 0.66)
    ctx.closePath()
    ctx.fillStyle = '#1b143a'
    ctx.fill()
    ctx.strokeStyle = pal.detail
    ctx.lineWidth = 0.9
    ctx.stroke()
  }
  // Ram plating on the leading edges.
  ctx.strokeStyle = pal.edge
  ctx.lineWidth = 3.6
  ctx.beginPath()
  ctx.moveTo(Math.cos(-Math.PI / 3) * r, Math.sin(-Math.PI / 3) * r)
  ctx.lineTo(r, 0)
  ctx.lineTo(Math.cos(Math.PI / 3) * r, Math.sin(Math.PI / 3) * r)
  ctx.stroke()
  poly(ctx, 0, 0, r * 0.52, 6, Math.PI / 6)
  ctx.fillStyle = '#0d0920'
  ctx.fill()
  ctx.strokeStyle = pal.detail
  ctx.lineWidth = 1.2
  ctx.stroke()
  // Eye sockets and rear vents.
  ctx.fillStyle = pal.socket
  ctx.fillRect(r * 0.32, -r * 0.48, r * 0.5, r * 0.16)
  ctx.fillRect(r * 0.32, r * 0.32, r * 0.5, r * 0.16)
  for (const s of [-1, 1]) {
    ctx.fillRect(-r * 0.78, s * r * 0.2 - r * 0.07, r * 0.26, r * 0.14)
  }
}

function drawWraith(ctx: Ctx, r: number, pal: Palette): void {
  wraithShape(ctx, r)
  ctx.fillStyle = pal.flash ? '#ffffff' : (() => {
    const g = ctx.createRadialGradient(r * 0.2, 0, 0, r * 0.2, 0, r * 1.2)
    g.addColorStop(0, '#3a3274')
    g.addColorStop(0.6, '#1b1640')
    g.addColorStop(1, '#0c0a20')
    return g
  })()
  ctx.fill()
  ctx.strokeStyle = pal.edge
  ctx.lineWidth = 1.6
  ctx.stroke()
  if (pal.flash) return
  ctx.strokeStyle = pal.detail
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.7, -1.9, 1.9)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.45, -1.4, 1.4)
  ctx.stroke()
  ctx.fillStyle = pal.socket
  ctx.beginPath()
  ctx.arc(r * 0.45, -r * 0.3, r * 0.16, 0, TAU)
  ctx.arc(r * 0.45, r * 0.3, r * 0.16, 0, TAU)
  ctx.fill()
}

function drawSplitter(ctx: Ctx, r: number, pal: Palette): void {
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, TAU)
  ctx.fillStyle = hullFill(ctx, r, pal)
  ctx.fill()
  if (pal.flash) return
  // Three shell segments.
  ctx.lineCap = 'butt'
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * TAU + 0.18
    const a1 = ((i + 1) / 3) * TAU - 0.18
    ctx.strokeStyle = '#1d1640'
    ctx.lineWidth = r * 0.24
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.86, a0, a1)
    ctx.stroke()
    ctx.strokeStyle = pal.edge
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.99, a0, a1)
    ctx.stroke()
  }
  ctx.strokeStyle = pal.detail
  ctx.lineWidth = 1.2
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3)
    ctx.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74)
    ctx.stroke()
  }
  ctx.fillStyle = pal.socket
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.28, 0, TAU)
  ctx.fill()
}

const DRAW: Partial<Record<EnemyKind, (ctx: Ctx, r: number, pal: Palette) => void>> = {
  drone: drawDrone,
  mite: drawMite,
  sentinel: drawSentinel,
  brute: drawBrute,
  wraith: drawWraith,
  splitter: drawSplitter,
}

export function hasSprite(kind: EnemyKind): boolean {
  return DRAW[kind] !== undefined
}

/** Cached hull sprite for a regular enemy. */
export function enemySprite(kind: EnemyKind, radius: number, variant: SpriteVariant): EnemySprite | null {
  const draw = DRAW[kind]
  if (!draw) return null
  const key = `${kind}|${variant}|${Math.round(radius * 10)}`
  const hit = cache.get(key)
  if (hit) return hit
  const ext = radius * (EXTENT[kind] ?? 1.5)
  const canvas = makeCanvas(ext * 2 * PX, ext * 2 * PX)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const def = ENEMIES[kind]
  const edge = variant === 'flash' ? '#ffffff' : variant === 'elite' ? COLORS.amber : def.color
  const pal: Palette = {
    core: variant === 'elite' ? '#3a2a40' : '#2b2456',
    mid: '#151030',
    rim: '#0a0818',
    edge,
    detail: rgba(variant === 'elite' ? COLORS.amber : def.color, 0.38),
    socket: '#04030a',
    flash: variant === 'flash',
  }
  ctx.scale(PX, PX)
  ctx.translate(ext, ext)
  ctx.lineJoin = 'round'
  draw(ctx, radius, pal)
  const sprite = { canvas, ext }
  cache.set(key, sprite)
  return sprite
}
