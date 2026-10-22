import { TAU } from '../../math'

type Ctx = CanvasRenderingContext2D

export function poly(ctx: Ctx, x: number, y: number, r: number, sides: number, rot: number): void {
  ctx.beginPath()
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/** The operative's chevron silhouette, facing +x at the origin. */
export function playerShape(ctx: Ctx, r: number): void {
  ctx.beginPath()
  ctx.moveTo(r * 1.38, 0)
  ctx.lineTo(r * 0.2, r * 0.42)
  ctx.lineTo(-r * 0.85, r * 0.92)
  ctx.lineTo(-r * 0.62, r * 0.3)
  ctx.lineTo(-r * 0.42, 0)
  ctx.lineTo(-r * 0.62, -r * 0.3)
  ctx.lineTo(-r * 0.85, -r * 0.92)
  ctx.lineTo(r * 0.2, -r * 0.42)
  ctx.closePath()
}

/** Wraith crescent silhouette, facing +x at the origin. */
export function wraithShape(ctx: Ctx, r: number): void {
  ctx.beginPath()
  ctx.arc(0, 0, r, -2.3, 2.3)
  ctx.quadraticCurveTo(-r * 0.1, 0, Math.cos(-2.3) * r, Math.sin(-2.3) * r)
  ctx.closePath()
}

/** Ease-out cubic. */
export const easeOut = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

/** Ease-out with a small overshoot. */
export const easeOutBack = (t: number): number => {
  const k = Math.min(1, Math.max(0, t))
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
}
