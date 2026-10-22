import { COLORS } from '../constants'
import type { Game } from '../Game'
import { drawCorpses } from './draw/bosses'
import { drawEnemies, drawShadows } from './draw/enemies'
import { collectLaserLights, drawGroundHazards, drawLasers, drawTelegraphs } from './draw/hazards'
import { collectParticleLights, drawDecals, drawGhosts, drawParticles, drawTexts } from './draw/particles'
import { collectPickupLights, drawPickups } from './draw/pickups'
import { collectPlayerLights, drawPlayer } from './draw/player'
import { collectProjectileLights, drawProjectiles } from './draw/projectiles'
import type { Frame } from './frame'
import { Lighting } from './Lighting'
import { PostFX } from './PostFX'

/**
 * Orchestrates the layered frame. Order matters: deep layers first, then the
 * lit deck, ground telegraphs, actors, effects, atmosphere and post passes.
 * Gameplay elements are always drawn above decorative layers.
 */
export class Renderer {
  private readonly g: Game
  private readonly lights = new Lighting()
  private readonly post: PostFX

  constructor(g: Game) {
    this.g = g
    this.post = new PostFX(g)
  }

  render(): void {
    const g = this.g
    const ctx = g.ctx
    const canvas = g.canvas
    if (!ctx || !canvas) return
    const cam = g.camera
    const dpr = g.dpr
    const zoom = cam.renderZoom
    const z = zoom * dpr
    const q = g.renderQuality
    const vfx = g.vfx
    const env = vfx.env
    const hw = cam.viewW / zoom / 2 + 24
    const hh = cam.viewH / zoom / 2 + 24
    const f: Frame = {
      g,
      ctx,
      t: vfx.clock,
      q,
      view: { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh },
      lights: this.lights,
      reduced: g.settings.reducedMotion,
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.imageSmoothingEnabled = true
    ctx.fillStyle = COLORS.void
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(z, 0, 0, z, canvas.width / 2 - (cam.x + cam.offsetX) * z, canvas.height / 2 - (cam.y + cam.offsetY) * z)

    // Gather this frame's dynamic lights in priority order.
    this.lights.begin(q.lights)
    this.lights.level = 1 - env.blackout * 0.6
    if (q.lights > 0) {
      env.collectReactorLight(f)
      collectPlayerLights(f)
      const boss = g.director.boss
      if (boss && boss.alive) this.lights.add(boss.x, boss.y, 340, boss.kind === 'sovereign' ? COLORS.violet : COLORS.magenta, 0.32)
      collectParticleLights(f)
      collectLaserLights(f)
      collectProjectileLights(f)
      env.collectLights(f)
      collectPickupLights(f)
    }

    env.drawAbyss(f)
    env.drawSubfloor(f)
    env.drawFloor(f)
    drawDecals(f)
    this.lights.draw(ctx, cam)
    env.drawFloorEmissive(f)
    drawGroundHazards(f)
    drawTelegraphs(f)
    drawShadows(f)
    drawPickups(f)
    env.drawPylons(f)
    drawGhosts(f)
    drawEnemies(f)
    drawCorpses(f)
    drawPlayer(f)
    drawProjectiles(f)
    drawParticles(f)
    drawLasers(f)
    drawTexts(f)
    env.drawRim(f)
    env.drawAtmosphere(f)

    this.post.apply(f, canvas)
  }
}
