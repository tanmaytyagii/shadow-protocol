import { AudioEngine, type SfxName } from './audio/AudioEngine'
import { Camera } from './Camera'
import {
  COLORS,
  COMBO_WINDOW,
  DIFFICULTY,
  PLAYER_BASE,
  QUALITY,
  TOTAL_WAVES,
  WORLD_H,
  WORLD_W,
  type DifficultyProfile,
  type QualityProfile,
} from './constants'
import { Enemy } from './entities/Enemy'
import type { Hazard } from './entities/Hazard'
import { Projectile, type ProjectileStyle } from './entities/Projectile'
import { Player } from './entities/Player'
import { POWERUPS, type Pickup } from './entities/Pickup'
import { Input, type Controls } from './Input'
import { IntroDirector, type IntroCue } from './intro'
import { FULL_STAGE, cameraFor, menuFraming, validStage, type MenuStage } from './menuFraming'
import { TAU, clamp, damp, dist2, rand } from './math'
import { profileStore, runSaveStore, settingsStore } from './persistence'
import { Arena, type Portal } from './render/Arena'
import { Effects } from './render/Effects'
import { PerfGovernor, likelySoftwareRenderer } from './render/PerfGovernor'
import { Renderer } from './render/Renderer'
import { spriteCacheSize } from './render/sprites'
import { Vfx } from './render/vfx'
import { SpatialGrid } from './SpatialGrid'
import { GameStore } from './store'
import { BOSS_INFO, initBoss } from './systems/boss'
import { updateHazards, updateProjectiles } from './systems/combat'
import { WaveDirector } from './systems/director'
import { BRUTE, updateEnemy } from './systems/enemyAI'
import { dropPickup, rollDrops, spawnXp, updatePickups } from './systems/pickups'
import { UPGRADES, rollUpgrades } from './systems/upgrades'
import { WEAPONS } from './systems/weapons'
import { waveHpMult, type WaveDef } from './systems/waves'
import type {
  BossKind,
  EnemyKind,
  GamePhase,
  HudSnapshot,
  RunConfig,
  RunSummary,
  Settings,
  Toast,
  UpgradeId,
  WeaponId,
} from './types'

const WAVE_SUBTITLES = [
  'Hunter drones inbound',
  'Sentinels online',
  'Splitter signatures detected',
  'Brute containment failing',
  '',
  'Wraith protocol engaged',
  'Facility lockdown escalating',
  'All hostiles released',
  'Last line before the core',
  '',
]

const HOSTILE_BULLET_CAP = 420
const SUBSTEP = 1 / 60

/** Reactor ambience per context, relative; the music volume scales it. */
const AMBIENCE = { intro: 1, menu: 0.45, combat: 0.3, results: 0.45 } as const

interface ScheduledFx {
  at: number
  run: () => void
}

interface TimedToast extends Toast {
  expires: number
}

export interface GameOptions {
  debug?: boolean
}

export class Game {
  readonly store = new GameStore()
  readonly audio = new AudioEngine()
  readonly input = new Input()
  readonly camera = new Camera()
  readonly grid = new SpatialGrid<Enemy>(WORLD_W, WORLD_H, 128)
  readonly fx: Effects
  /** Presentation layer: reacts to game events, never feeds back into gameplay. */
  readonly vfx: Vfx
  readonly director: WaveDirector
  /** Opening cinematic: camera and lighting script (presentation only). */
  readonly intro = new IntroDirector()
  readonly debug: boolean
  private readonly renderer: Renderer
  private readonly governor = new PerfGovernor()

  arena: Arena
  player: Player
  enemies: Enemy[] = []
  projectiles: Projectile[] = []
  pickups: Pickup[] = []
  hazards: Hazard[] = []
  private projectilePool: Projectile[] = []

  settings: Settings
  quality: QualityProfile
  /** Quality actually used this frame (after the adaptive governor). */
  renderQuality: QualityProfile
  diff: DifficultyProfile = DIFFICULTY.normal
  config: RunConfig = { difficulty: 'normal', startWeapon: 'pulse' }

  phase: GamePhase = 'idle'
  time = 0
  realTime = 0
  enemyTimeScale = 1
  score = 0
  kills = 0
  combo = 0
  comboTimer = 0
  bossesDefeated = 0
  shotsFired = 0
  shotsHit = 0
  damageDealt = 0
  flashColor: string = COLORS.red
  flashAlpha = 0
  /** Score as displayed by the HUD, rolling toward the real score. */
  scoreShown = 0
  /** Counters the HUD keys its feedback animations on. */
  readonly hudEvents = { hurt: 0, shield: 0, heal: 0, dash: 0, boss: 0 }
  private lastBossEvent = 0
  god = false

  private hitStop = 0
  private slowmo = 0
  private cinematicPan = 0
  private deathTimer = 0
  private victoryTimer = 0
  private pendingLevelUps = 0
  private pendingChips = 0
  private offerSource: 'level' | 'chip' = 'level'
  private offerKey = 0
  private xpStreak = 0
  private xpStreakTimer = 0
  private toasts: TimedToast[] = []
  private toastId = 0
  private bannerId = 0
  private hudTimer = 0
  private fpsFrames = 0
  private fpsTime = 0
  private scheduled: ScheduledFx[] = []
  private runUnlocks: string[] = []
  /** Clock for the menu's drifting camera; restarts from the deck centre after the intro. */
  private attractT = 0
  /** The landing page's open area, where the menu camera frames the reactor (set by the UI). */
  private menuStage: MenuStage = FULL_STAGE
  /** Eased pointer position for the landing page's parallax, -1..1 on each axis. */
  private menuLookX = 0
  private menuLookY = 0
  /** Portals in the order the intro lights them (a clockwise sweep). */
  private introPortals: Portal[] = []

  private container: HTMLElement | null = null
  canvas: HTMLCanvasElement | null = null
  ctx: CanvasRenderingContext2D | null = null
  dpr = 1
  private rafId = 0
  private lastFrame = 0
  private running = false
  private renderDirty = true
  private resizeObserver: ResizeObserver | null = null
  private unsubSettings: (() => void) | null = null

  constructor(opts: GameOptions = {}) {
    this.debug = opts.debug ?? false
    this.settings = settingsStore.get()
    this.quality = QUALITY[this.settings.graphics]
    this.renderQuality = this.quality
    this.fx = new Effects(this.quality.maxParticles)
    this.fx.decalCap = this.quality.decals
    this.arena = new Arena((Math.random() * 2 ** 31) | 0)
    this.player = new Player('pulse')
    this.player.alive = false
    this.director = new WaveDirector(this)
    this.vfx = new Vfx(this)
    this.renderer = new Renderer(this)
    this.camera.shakeScale = this.settings.screenShake
    this.camera.motionScale = this.settings.reducedMotion ? 0 : 1
  }

  // --- Lifecycle --------------------------------------------------------------

  mount(container: HTMLElement, canvas: HTMLCanvasElement): void {
    if (this.running) return
    this.container = container
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    if (!this.arena.floor) this.arena.bake(this.quality.floorScale)
    this.input.attach(canvas)
    this.input.onBlur = () => this.pause()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    document.addEventListener('visibilitychange', this.handleVisibility)
    if (this.debug) window.addEventListener('keydown', this.handleDebugKey)
    this.unsubSettings = settingsStore.subscribe(() => this.applySettings(settingsStore.get()))
    // No usable GPU: start several steps down so the first frames are smooth.
    if (this.settings.graphics !== 'low' && likelySoftwareRenderer()) {
      this.governor.startAt(3)
      this.onQualityStep()
    }
    this.audio.applySettings(this.settings)
    // The opening cinematic has its own soundscape; the menu theme follows it.
    this.audio.setMusic(this.phase !== 'idle' ? 'combat' : this.intro.active ? 'off' : 'menu')
    this.audio.setAmbience(this.phase !== 'idle' ? AMBIENCE.combat : this.intro.active ? AMBIENCE.intro : AMBIENCE.menu)
    this.running = true
    this.lastFrame = 0
    this.rafId = requestAnimationFrame(this.frame)
  }

  /** Fully tears down listeners, audio and the animation loop. Safe to call twice. */
  unmount(): void {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.input.detach()
    this.input.onBlur = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    document.removeEventListener('visibilitychange', this.handleVisibility)
    window.removeEventListener('keydown', this.handleDebugKey)
    this.unsubSettings?.()
    this.unsubSettings = null
    this.audio.dispose()
    this.container = null
  }

  private handleVisibility = (): void => {
    if (document.hidden) {
      this.pause()
      this.audio.suspend()
    } else {
      this.audio.resume()
    }
  }

  resize(): void {
    if (!this.container || !this.canvas) return
    const rect = this.container.getBoundingClientRect()
    const w = Math.max(1, rect.width)
    const h = Math.max(1, rect.height)
    this.dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr) * this.governor.dprScale
    this.canvas.width = Math.round(w * this.dpr)
    this.canvas.height = Math.round(h * this.dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.camera.setViewport(w, h)
    this.renderDirty = true
  }

  applySettings(s: Settings): void {
    const prev = this.settings
    this.settings = s
    this.audio.applySettings(s)
    this.camera.shakeScale = s.screenShake
    this.camera.motionScale = s.reducedMotion ? 0 : 1
    if (s.graphics !== prev.graphics) {
      this.quality = QUALITY[s.graphics]
      this.governor.reset()
      this.renderQuality = this.quality
      this.fx.budget = 1
      this.fx.decalCap = this.quality.decals
      this.fx.setCapacity(this.quality.maxParticles)
      if (this.arena.floorScale !== this.quality.floorScale) this.arena.bake(this.quality.floorScale)
      this.resize()
    }
    this.renderDirty = true
  }

  // --- Main loop ---------------------------------------------------------------

  private frame = (now: number): void => {
    if (!this.running) return
    this.rafId = requestAnimationFrame(this.frame)
    const gapMs = this.lastFrame ? now - this.lastFrame : 0
    const raw = this.lastFrame ? gapMs / 1000 : SUBSTEP
    this.lastFrame = now
    // Clamp large gaps (tab suspension) so nothing jumps.
    const dt = Math.min(raw, 0.1)
    // Every continuously rendered phase is governed (menus render a live scene too).
    if (this.phase !== 'paused' && gapMs > 0 && this.governor.sample(gapMs)) this.onQualityStep()
    try {
      this.tick(dt)
    } catch (err) {
      this.crash(err)
    }
  }

  /** The adaptive governor changed level: refresh effective quality. */
  private onQualityStep(): void {
    this.renderQuality = this.governor.apply(this.quality)
    this.fx.budget = this.governor.particleBudget
    this.fx.decalCap = this.renderQuality.decals
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr) * this.governor.dprScale
    if (Math.abs(dpr - this.dpr) > 0.01) this.resize()
    this.store.set({ qualityStep: this.governor.level })
  }

  private crash(err: unknown): void {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.input.capture = false
    console.error('[shadow-protocol] fatal error', err)
    this.store.set({ fatalError: err instanceof Error ? err.message : String(err) })
  }

  private tick(dt: number): void {
    this.realTime += dt
    this.updateToasts()
    this.updateFps(dt)

    switch (this.phase) {
      case 'playing': {
        const controls = this.input.read()
        if (controls.pause && this.player.alive) {
          this.pause()
          break
        }
        this.runScheduled()
        if (this.slowmo > 0) this.slowmo -= dt
        if (this.hitStop > 0) {
          this.hitStop -= dt
          this.camera.updateShake(dt)
          break
        }
        const scaled = dt * (this.slowmo > 0 ? 0.35 : 1)
        const steps = Math.max(1, Math.ceil(scaled / SUBSTEP - 1e-6))
        const sub = scaled / steps
        for (let i = 0; i < steps && this.phase === 'playing'; i++) this.update(sub, controls, i === 0)
        this.vfx.update(scaled)
        this.vfx.updateAmbient(dt)
        this.scoreShown = Math.abs(this.score - this.scoreShown) < 1 ? this.score : damp(this.scoreShown, this.score, 9, dt)
        if (this.deathTimer > 0) {
          this.deathTimer -= dt
          if (this.deathTimer <= 0) this.finishRun('defeat')
        }
        if (this.victoryTimer > 0) {
          this.victoryTimer -= dt
          if (this.victoryTimer <= 0) this.finishRun('victory')
        }
        this.updateCamera(dt)
        this.maybeOpenLevelUp()
        this.publishHud(dt)
        this.renderer.render()
        break
      }
      case 'idle':
        this.updateAttract(dt)
        this.vfx.update(dt)
        this.vfx.updateAmbient(dt)
        this.renderer.render()
        break
      case 'gameover':
      case 'victory':
        // Let the final explosions play out behind the results screen.
        this.fx.update(dt)
        this.vfx.update(dt)
        this.vfx.updateAmbient(dt)
        this.camera.updateShake(dt)
        this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2)
        this.renderer.render()
        break
      case 'levelup':
        // The simulation is frozen, but energy already in flight keeps dissipating.
        this.fx.update(dt)
        this.vfx.updateOverlay(dt)
        this.vfx.updateAmbient(dt)
        this.camera.updateShake(dt)
        this.renderer.render()
        break
      default:
        // Paused: the scene is frozen, so only redraw when needed.
        if (this.renderDirty) {
          this.renderer.render()
          this.renderDirty = false
        }
    }
  }

  private update(dt: number, c: Controls, first: boolean): void {
    const p = this.player
    if (p.alive) this.time += dt
    this.enemyTimeScale = p.powerUps.chrono > 0 ? 0.4 : 1

    this.updatePlayer(dt, c, first)
    this.director.update(dt)

    this.grid.clear()
    for (const e of this.enemies) if (e.active) this.grid.insert(e)

    const edt = dt * this.enemyTimeScale
    for (const e of this.enemies) {
      if (!e.alive) continue
      e.hitFlash = Math.max(0, e.hitFlash - dt)
      e.invuln = Math.max(0, e.invuln - edt)
      if (e.spawnTimer > 0) {
        e.spawnTimer -= dt
        this.vfx.onEnemySpawning(e)
        continue
      }
      updateEnemy(this, e, edt)
      e.x += e.vx * edt
      e.y += e.vy * edt
    }
    this.separateEnemies()
    this.resolvePlayerContacts()

    updateProjectiles(this, dt)
    updateHazards(this, dt)
    updatePickups(this, dt)
    this.fx.update(dt)

    for (let i = this.enemies.length - 1; i >= 0; i--) if (!this.enemies[i].alive) this.enemies.splice(i, 1)

    if (this.comboTimer > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) this.combo = 0
    }
    if (this.xpStreakTimer > 0) {
      this.xpStreakTimer -= dt
      if (this.xpStreakTimer <= 0) this.xpStreak = 0
    }
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.2)
    for (const portal of this.arena.portals) portal.flare = Math.max(0, portal.flare - dt * 1.5)
  }

  // --- Player --------------------------------------------------------------------

  private updatePlayer(dt: number, c: Controls, first: boolean): void {
    const p = this.player
    if (!p.alive) {
      p.vx *= Math.exp(-5 * dt)
      p.vy *= Math.exp(-5 * dt)
      return
    }
    const s = p.stats
    p.iframes = Math.max(0, p.iframes - dt)
    if (p.dashCooldown > 0 && p.dashCooldown - dt <= 0) this.hudEvents.dash++
    p.dashCooldown = Math.max(0, p.dashCooldown - dt)
    p.hurtFlash = Math.max(0, p.hurtFlash - dt)
    p.recoil = Math.max(0, p.recoil - dt * 30)
    for (const k of Object.keys(p.powerUps) as (keyof typeof p.powerUps)[]) {
      if (p.powerUps[k] > 0) {
        p.powerUps[k] = Math.max(0, p.powerUps[k] - dt)
        if (p.powerUps[k] === 0) this.toast(`${k.toUpperCase()} expired`, 'info')
      }
    }

    // Aim
    if (this.input.usingTouch) {
      if (this.input.touchAiming) p.aim = Math.atan2(this.input.touchAimY, this.input.touchAimX)
      else if (c.moveX !== 0 || c.moveY !== 0) p.aim = Math.atan2(c.moveY, c.moveX)
    } else if (this.input.hasMouse) {
      const w = this.camera.screenToWorld(this.input.mouseX, this.input.mouseY)
      p.aim = Math.atan2(w.y - p.y, w.x - p.x)
    }

    if (first) {
      if (c.weaponSlot > 0) this.selectWeaponSlot(c.weaponSlot)
      if (c.weaponCycle !== 0) this.cycleWeapon(c.weaponCycle)
      if (c.dash && p.dashCooldown <= 0) this.startDash(c)
    }

    const moving = c.moveX !== 0 || c.moveY !== 0
    if (c.boost && moving && !p.boostLocked && p.energy > 0 && !p.dashing) {
      p.boosting = true
      p.energy = Math.max(0, p.energy - PLAYER_BASE.boostDrain * dt)
      if (p.energy <= 0) p.boostLocked = true
    } else {
      p.boosting = false
      p.energy = Math.min(s.energyMax, p.energy + s.energyRegen * dt)
      if (p.boostLocked && p.energy >= 25) p.boostLocked = false
    }

    if (p.dashTime > 0) {
      p.dashTime -= dt
      p.vx = p.dashDirX * PLAYER_BASE.dashSpeed
      p.vy = p.dashDirY * PLAYER_BASE.dashSpeed
      p.trailTimer -= dt
      if (p.trailTimer <= 0) {
        this.fx.ghost(p.x, p.y, p.aim, COLORS.cyan, p.radius)
        p.trailTimer = 0.022
      }
      if (p.dashTime <= 0) {
        p.vx *= 0.3
        p.vy *= 0.3
        p.iframes = Math.max(p.iframes, 0.12)
      }
    } else {
      const speed = s.moveSpeed * (p.boosting ? PLAYER_BASE.boostMult : 1)
      const k = 1 - Math.exp(-14 * dt)
      p.vx += (c.moveX * speed - p.vx) * k
      p.vy += (c.moveY * speed - p.vy) * k
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    this.arena.resolve(p)

    if (p.shieldDelayTimer > 0) p.shieldDelayTimer -= dt
    else p.shield = Math.min(s.maxShield, p.shield + s.shieldRegen * dt)

    // Firing
    if (c.fire) {
      p.fireTimer -= dt
      if (p.fireTimer <= 0) {
        if (!p.hasAmmo(p.current)) {
          this.sfx('dryFire')
          this.toast(`${WEAPONS[p.current].name} empty — switching`, 'warning')
          p.current = 'pulse'
          p.fireTimer = 0.15
        } else {
          this.fireWeapon()
          const w = WEAPONS[p.current]
          p.fireTimer += w.interval / (s.fireRateMult * (p.powerUps.overdrive > 0 ? 2 : 1))
          if (p.fireTimer < 0) p.fireTimer = 0
        }
      }
    } else {
      p.fireTimer = Math.max(0, p.fireTimer - dt)
    }
  }

  private startDash(c: Controls): void {
    const p = this.player
    let dx = c.moveX
    let dy = c.moveY
    if (dx === 0 && dy === 0) {
      dx = Math.cos(p.aim)
      dy = Math.sin(p.aim)
    }
    const l = Math.hypot(dx, dy) || 1
    p.dashDirX = dx / l
    p.dashDirY = dy / l
    p.dashTime = PLAYER_BASE.dashDuration
    p.dashCooldown = p.stats.dashCooldown
    p.dashId++
    p.trailTimer = 0
    this.vfx.onDash(p.dashDirX, p.dashDirY)
    this.sfx('dash')
  }

  private fireWeapon(): void {
    const p = this.player
    const s = p.stats
    const w = WEAPONS[p.current]
    const extra = s.extraProjectiles
    const pellets = w.pellets + extra * w.pelletsPerExtra
    const fan = w.fan + extra * w.fanPerExtra
    const dmg = w.damage * s.damageMult * (p.powerUps.amplifier > 0 ? 2 : 1)
    const muzzleX = p.x + Math.cos(p.aim) * (p.radius + 12)
    const muzzleY = p.y + Math.sin(p.aim) * (p.radius + 12)
    for (let i = 0; i < pellets; i++) {
      const offset = pellets > 1 ? (i / (pellets - 1) - 0.5) * fan : 0
      const a = p.aim + offset + rand(-w.spread, w.spread)
      const speed = w.speed * (1 + rand(-w.speedVariance, w.speedVariance))
      const pr = this.acquireProjectile()
      pr.friendly = true
      pr.x = muzzleX
      pr.y = muzzleY
      pr.ox = muzzleX
      pr.oy = muzzleY
      pr.vx = Math.cos(a) * speed
      pr.vy = Math.sin(a) * speed
      pr.radius = w.radius
      pr.damage = dmg
      pr.life = w.life
      pr.maxLife = w.life
      pr.pierce = w.pierce + s.pierce
      pr.knockback = w.knockback
      pr.color = w.color
      pr.core = w.core
      pr.style = w.id
      pr.weapon = w.id
      if (w.homing > 0) {
        pr.homing = w.homing
        pr.accel = 900
        pr.maxSpeed = 950
      }
      pr.explosionRadius = w.explosionRadius
      pr.explosionMult = w.explosionMult
      this.projectiles.push(pr)
    }
    this.shotsFired += pellets
    if (w.maxAmmo !== null) p.ammo[w.id] = Math.max(0, (p.ammo[w.id] ?? 0) - 1)
    p.recoil = 4
    p.vx -= Math.cos(p.aim) * w.knockback * 0.25
    p.vy -= Math.sin(p.aim) * w.knockback * 0.25
    this.vfx.onFire(w, muzzleX, muzzleY, p.aim)
    if (w.shake > 0) this.camera.addTrauma(w.shake)
    this.sfx(w.sound, undefined, 0.9)
  }

  private selectWeaponSlot(slot: number): void {
    const p = this.player
    const id = p.weapons.find((w) => WEAPONS[w].slot === slot)
    if (!id || id === p.current) return
    if (!p.hasAmmo(id)) {
      this.sfx('dryFire')
      this.toast(`${WEAPONS[id].name} has no ammo`, 'warning')
      return
    }
    p.current = id
    this.sfx('swap')
  }

  private cycleWeapon(dir: number): void {
    const p = this.player
    const usable = p.weapons.filter((w) => p.hasAmmo(w))
    if (usable.length < 2) return
    const idx = usable.indexOf(p.current)
    p.current = usable[(idx + dir + usable.length) % usable.length]
    this.sfx('swap')
  }

  // --- Enemies & collisions ---------------------------------------------------------

  private readonly near: Enemy[] = []

  private separateEnemies(): void {
    for (const e of this.enemies) {
      if (!e.active) continue
      const near = this.grid.query(e.x, e.y, e.radius + 4, this.near)
      for (const o of near) {
        if (o === e || o.id < e.id || !o.active) continue
        const dx = o.x - e.x
        const dy = o.y - e.y
        const min = e.radius + o.radius
        const d2 = dx * dx + dy * dy
        if (d2 >= min * min || d2 === 0) continue
        const d = Math.sqrt(d2)
        const overlap = (min - d) * 0.5
        const nx = dx / d
        const ny = dy / d
        const total = e.mass + o.mass
        e.x -= nx * overlap * (o.mass / total) * 2
        e.y -= ny * overlap * (o.mass / total) * 2
        o.x += nx * overlap * (e.mass / total) * 2
        o.y += ny * overlap * (e.mass / total) * 2
      }
      if (this.arena.resolve(e) && !e.isBoss && e.kind !== 'brute') {
        // Slide around pylons instead of stalling against them.
        const pyl = this.arena.pylonAt(e.x, e.y, e.radius + 2)
        if (pyl) {
          const tx = -(e.y - pyl.y)
          const ty = e.x - pyl.x
          const side = tx * (this.player.x - e.x) + ty * (this.player.y - e.y) > 0 ? 1 : -1
          const l = Math.hypot(tx, ty) || 1
          e.vx += (tx / l) * side * e.speed * 0.5
          e.vy += (ty / l) * side * e.speed * 0.5
        }
      }
    }
  }

  private resolvePlayerContacts(): void {
    const p = this.player
    if (!p.alive) return
    const near = this.grid.query(p.x, p.y, p.radius, this.near)
    for (const e of near) {
      if (!e.active) continue
      const dx = p.x - e.x
      const dy = p.y - e.y
      const min = p.radius + e.radius
      const d2 = dx * dx + dy * dy
      if (d2 >= min * min) continue
      const d = Math.sqrt(d2) || 0.01
      const nx = dx / d
      const ny = dy / d

      if (p.dashing) {
        if (p.stats.phaseBladeDamage > 0 && e.lastDashHit !== p.dashId) {
          e.lastDashHit = p.dashId
          this.damageEnemy(e, p.stats.phaseBladeDamage * (p.powerUps.amplifier > 0 ? 2 : 1), { crit: false, kx: p.dashDirX, ky: p.dashDirY, knockback: 120 })
          this.vfx.onBladeHit(e, p.dashDirX, p.dashDirY)
        }
        continue
      }

      // Push the player and the enemy apart so the player can never be pinned.
      const overlap = min - d
      const share = e.isBoss ? 1 : 0.6
      p.x += nx * overlap * share
      p.y += ny * overlap * share
      if (!e.isBoss) {
        e.x -= nx * overlap * (1 - share)
        e.y -= ny * overlap * (1 - share)
      }
      this.arena.resolve(p)

      if (!p.invulnerable) {
        const charging = e.kind === 'brute' && e.state === BRUTE.charge
        this.damagePlayer(e.damage * (charging ? 1.4 : 1), e.x, e.y)
        if (!e.isBoss) {
          e.vx -= nx * 260 / e.mass
          e.vy -= ny * 260 / e.mass
        }
      }
    }
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number, elite = false): Enemy {
    const hpMult = waveHpMult(this.director.wave) * this.diff.enemyHp
    const e = new Enemy(kind, x, y, elite, hpMult, this.diff.enemySpeed, this.diff.enemyDamage)
    if (this.arena.blocked(e.x, e.y, e.radius)) this.arena.resolve(e)
    this.enemies.push(e)
    return e
  }

  spawnBoss(kind: BossKind): Enemy {
    const p = this.player
    const candidates =
      kind === 'warden'
        ? this.arena.portals.map((o) => ({ x: o.x, y: o.y }))
        : [
            { x: WORLD_W / 2, y: 300 },
            { x: WORLD_W / 2, y: WORLD_H - 300 },
            { x: 420, y: WORLD_H / 2 },
            { x: WORLD_W - 420, y: WORLD_H / 2 },
          ]
    let best = candidates[0]
    let bestD = -1
    for (const c of candidates) {
      const d = dist2(c.x, c.y, p.x, p.y)
      if (d > bestD) {
        bestD = d
        best = c
      }
    }
    const e = new Enemy(kind, best.x, best.y, false, this.diff.enemyHp, this.diff.enemySpeed, this.diff.enemyDamage)
    initBoss(e, kind)
    this.arena.resolve(e)
    this.enemies.push(e)
    this.audio.setMusic('boss')
    this.sfx('bossRoar')
    this.camera.addTrauma(0.5)
    this.vfx.onBossSpawn(e)
    return e
  }

  summonMinions(kinds: EnemyKind[]): void {
    const portal = this.director.pickPortal(380)
    this.flarePortal(portal)
    for (const k of kinds) {
      const a = Math.random() * TAU
      const e = this.spawnEnemy(k, portal.x + Math.cos(a) * rand(0, 60), portal.y + Math.sin(a) * rand(0, 60))
      e.minion = true
    }
    this.sfx('spawn', portal.x)
  }

  minionCount(): number {
    let n = 0
    for (const e of this.enemies) if (e.alive && e.minion) n++
    return n
  }

  /** Screen shake, attenuated by distance from the camera when a source is given. */
  addShake(amount: number, x?: number, y?: number): void {
    let k = 1
    if (x !== undefined && y !== undefined) {
      const d = Math.hypot(x - this.camera.x, y - this.camera.y)
      k = clamp(1.4 - d / 900, 0.2, 1)
    }
    this.camera.addTrauma(amount * k)
  }

  flarePortal(portal: Portal): void {
    portal.flare = 1
    this.vfx.onPortalFlare(portal.x, portal.y)
  }

  findNearestEnemy(x: number, y: number, maxDist: number): Enemy | null {
    let best: Enemy | null = null
    let bestD = maxDist * maxDist
    for (const e of this.enemies) {
      if (!e.active) continue
      const d = dist2(x, y, e.x, e.y)
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  /** Nearest friendly projectile heading toward `e` within `radius`. */
  findIncomingProjectile(e: Enemy, radius: number): Projectile | null {
    for (const p of this.projectiles) {
      if (!p.alive || !p.friendly) continue
      const dx = e.x - p.x
      const dy = e.y - p.y
      const d2 = dx * dx + dy * dy
      if (d2 > radius * radius) continue
      const sp = Math.hypot(p.vx, p.vy) || 1
      const d = Math.sqrt(d2) || 1
      if ((p.vx * dx + p.vy * dy) / (sp * d) > 0.88) return p
    }
    return null
  }

  // --- Projectiles ---------------------------------------------------------------

  private acquireProjectile(): Projectile {
    return (this.projectilePool.pop() ?? new Projectile()).reset()
  }

  compactProjectiles(): void {
    const list = this.projectiles
    let w = 0
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      if (p.alive) list[w++] = p
      else this.projectilePool.push(p)
    }
    list.length = w
  }

  fireEnemyBullet(x: number, y: number, angle: number, speed: number, damage: number, style: ProjectileStyle): void {
    let hostile = 0
    for (const p of this.projectiles) if (!p.friendly) hostile++
    if (hostile >= HOSTILE_BULLET_CAP) return
    const pr = this.acquireProjectile()
    pr.friendly = false
    pr.x = x
    pr.y = y
    const sp = speed * this.diff.enemySpeed
    pr.vx = Math.cos(angle) * sp
    pr.vy = Math.sin(angle) * sp
    pr.radius = style === 'needle' ? 5 : 7
    pr.damage = damage * this.diff.enemyDamage
    pr.life = 4.5
    pr.maxLife = 4.5
    pr.color = COLORS.magenta
    pr.core = '#ffe3f1'
    pr.style = style
    this.projectiles.push(pr)
  }

  projectileHit(p: Projectile, e: Enemy): void {
    const s = this.player.stats
    const crit = Math.random() < s.critChance
    const dmg = p.damage * (crit ? s.critMult : 1)
    const sp = Math.hypot(p.vx, p.vy) || 1
    this.damageEnemy(e, dmg, { crit, kx: p.vx / sp, ky: p.vy / sp, knockback: p.knockback })
    if (!p.hitSomething) {
      p.hitSomething = true
      this.shotsHit++
    }
    this.vfx.onImpact(p, e, crit)
    if (s.volatileRadius > 0) this.explode(p.x, p.y, s.volatileRadius, p.damage * s.volatileMult, true, e, COLORS.amber, true)
    if (p.explosionRadius > 0) {
      this.explode(p.x, p.y, p.explosionRadius, p.damage * p.explosionMult, true, e, p.color)
      p.explosionRadius = 0
    }
  }

  // --- Damage -----------------------------------------------------------------

  damageEnemy(e: Enemy, amount: number, o: { crit: boolean; kx: number; ky: number; knockback: number }): void {
    if (!e.active) return
    if (e.invuln > 0) {
      this.vfx.onImmune(e)
      return
    }
    const dealt = Math.min(amount, e.hp)
    e.hp -= amount
    e.hitFlash = 0.09
    this.damageDealt += dealt
    const charging = e.kind === 'brute' && e.state === BRUTE.charge
    if (!e.isBoss && !charging && o.knockback > 0) {
      e.vx += (o.kx * o.knockback) / e.mass
      e.vy += (o.ky * o.knockback) / e.mass
    }
    this.vfx.onEnemyDamaged(e, amount, o.crit, o.kx, o.ky)
    if (e.isBoss && this.realTime - this.lastBossEvent > 0.22) {
      this.lastBossEvent = this.realTime
      this.hudEvents.boss++
    }
    this.sfx(o.crit ? 'crit' : 'hit', e.x, 0.8)
    if (e.hp <= 0) this.killEnemy(e)
  }

  killEnemy(e: Enemy): void {
    if (!e.alive) return
    e.alive = false
    e.hp = 0
    const big = e.radius > 22
    this.vfx.onEnemyKilled(e)
    this.sfx(big ? 'explosion' : 'enemyDeath', e.x)
    this.camera.addTrauma(e.isBoss ? 0.9 : big ? 0.22 : 0.06)

    this.kills++
    this.combo++
    this.comboTimer = COMBO_WINDOW
    const wave = Math.max(1, this.director.wave)
    const gain = e.def.score * (1 + 0.1 * (wave - 1)) * this.comboMult() * this.diff.scoreMult * (e.elite ? 3 : 1)
    this.addScore(gain)
    if (e.elite) {
      this.fx.text(e.x, e.y - 30, `+${Math.round(gain)}`, COLORS.amber, 16, 1)
      this.hitStop = Math.max(this.hitStop, 0.035)
    }

    const p = this.player
    if (p.alive && p.stats.healOnKill > 0) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.healOnKill)

    if (e.def.xp > 0) spawnXp(this, e.x, e.y, e.def.xp * (e.elite ? 3 : 1))

    if (e.isBoss) {
      this.onBossDefeated(e)
      return
    }
    rollDrops(this, e)

    if (e.kind === 'splitter') {
      const n = e.elite ? 4 : 3
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + Math.random() * 0.5
        const m = this.spawnEnemy('mite', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10)
        m.spawnTimer = 0
        m.invuln = 0.15
        m.minion = e.minion
        m.vx = Math.cos(a) * 280
        m.vy = Math.sin(a) * 280
      }
    }
  }

  comboMult(): number {
    return 1 + Math.min(this.combo, 50) * 0.04
  }

  damagePlayer(amount: number, sx: number, sy: number): boolean {
    const p = this.player
    if (!p.alive || p.invulnerable || this.god) return false
    if (this.director.state === 'complete') return false
    p.damageTakenThisWave += amount
    let remaining = amount
    const hadShield = p.shield > 0
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, remaining)
      p.shield -= absorbed
      remaining -= absorbed
      if (p.shield <= 0.01) {
        p.shield = 0
        this.onShieldBreak()
      }
    }
    p.hp -= remaining
    p.iframes = PLAYER_BASE.hitIframes
    p.hurtFlash = 0.25
    p.shieldDelayTimer = p.stats.shieldDelay
    const dx = p.x - sx
    const dy = p.y - sy
    const d = Math.hypot(dx, dy) || 1
    p.vx += (dx / d) * 340
    p.vy += (dy / d) * 340
    this.combo = 0
    this.comboTimer = 0
    this.camera.addTrauma(remaining > 0 ? 0.42 : 0.25)
    this.hitStop = Math.max(this.hitStop, 0.05)
    this.flashColor = remaining > 0 ? COLORS.red : COLORS.cyan
    this.flashAlpha = remaining > 0 ? 0.28 : 0.16
    this.sfx(hadShield && remaining <= 0 ? 'hit' : 'playerHit')
    this.vfx.onPlayerHit(sx, sy, remaining)
    if (remaining > 0) this.hudEvents.hurt++
    else this.hudEvents.shield++
    if (p.hp <= 0) this.killPlayer()
    return true
  }

  private onShieldBreak(): void {
    const p = this.player
    this.sfx('shieldBreak')
    this.vfx.onShieldBreak()
    if (p.stats.staticDamage > 0) {
      const r = 230
      this.sfx('emp')
      const near = this.grid.query(p.x, p.y, r, [])
      this.vfx.onStaticDischarge(r, near)
      for (const e of near) {
        const dx = e.x - p.x
        const dy = e.y - p.y
        const d = Math.hypot(dx, dy) || 1
        this.damageEnemy(e, p.stats.staticDamage, { crit: false, kx: dx / d, ky: dy / d, knockback: e.isBoss ? 0 : 650 })
      }
      // Clear nearby bullets as part of the discharge.
      for (const pr of this.projectiles) if (!pr.friendly && dist2(pr.x, pr.y, p.x, p.y) < r * r) pr.alive = false
    }
  }

  private killPlayer(): void {
    const p = this.player
    p.alive = false
    p.hp = 0
    this.vfx.onPlayerDeath()
    this.sfx('bigExplosion')
    this.camera.addTrauma(1)
    this.hitStop = 0.15
    this.slowmo = 1.6
    this.deathTimer = 1.9
    this.audio.setMusic('off')
  }

  explode(
    x: number,
    y: number,
    radius: number,
    damage: number,
    friendly: boolean,
    exclude: Enemy | null,
    color: string = COLORS.magenta,
    subtle = false,
  ): void {
    this.vfx.onExplosion(x, y, radius, color, subtle)
    if (!subtle) this.sfx('explosion', x, 0.6)
    if (friendly) {
      const hits = this.grid.query(x, y, radius, [])
      for (const e of hits) {
        if (e === exclude || !e.active) continue
        const dx = e.x - x
        const dy = e.y - y
        const d = Math.hypot(dx, dy) || 1
        const falloff = 1 - 0.5 * Math.min(1, d / (radius + e.radius))
        this.damageEnemy(e, damage * falloff, { crit: false, kx: dx / d, ky: dy / d, knockback: 90 })
      }
    } else {
      const p = this.player
      if (p.alive && dist2(x, y, p.x, p.y) < (radius + p.radius * 0.6) ** 2) this.damagePlayer(damage, x, y)
      this.camera.addTrauma(0.2)
    }
  }

  // --- Hazards -----------------------------------------------------------------

  spawnRing(x: number, y: number, speed: number, gaps: number[], gapWidth: number, damage: number): void {
    this.hazards.push({
      kind: 'ring',
      x,
      y,
      radius: 30,
      speed,
      maxRadius: 1500,
      thickness: 20,
      gaps,
      gapWidth,
      damage: damage * this.diff.enemyDamage,
      hit: false,
      alive: true,
    })
  }

  spawnLaser(owner: Enemy, angle: number, angularVel: number, telegraph: number, active: number, damage: number): void {
    this.hazards.push({
      kind: 'laser',
      owner,
      angle,
      angularVel,
      telegraph,
      active,
      width: 22,
      length: 2600,
      damage: damage * this.diff.enemyDamage,
      t: 0,
      alive: true,
    })
  }

  spawnMine(x: number, y: number, radius: number, fuse: number, damage: number): void {
    this.hazards.push({ kind: 'mine', x, y, radius, fuse, t: 0, damage: damage * this.diff.enemyDamage, alive: true })
  }

  private clearHostiles(): void {
    for (const p of this.projectiles) {
      if (!p.friendly && p.alive) {
        p.alive = false
        this.fx.glow(p.x, p.y, COLORS.magenta, 10, 0.2)
      }
    }
    this.hazards.length = 0
  }

  // --- Waves & bosses --------------------------------------------------------------

  onWaveStart(n: number, def: WaveDef): void {
    this.player.damageTakenThisWave = 0
    if (n >= 3) this.unlockWeapon('scatter')
    if (n >= 2) this.saveCheckpoint()
    if (def.boss) {
      const info = BOSS_INFO[def.boss]
      this.banner('WARNING', `${info.name} — ${info.title}`, 'boss', 3)
    } else {
      this.banner(`WAVE ${n.toString().padStart(2, '0')}`, WAVE_SUBTITLES[n - 1] || undefined, 'info', 2.2)
      this.audio.setMusic('combat')
    }
    this.vfx.onWaveStart()
    this.sfx('waveStart')
  }

  onWaveCleared(n: number): void {
    const p = this.player
    const flawless = p.damageTakenThisWave === 0
    const bonus = Math.round((250 * n + (flawless ? 400 * n : 0)) * this.diff.scoreMult)
    this.addScore(bonus)
    this.gainXp(6 + n * 3)
    this.clearHostiles()
    this.banner(`WAVE ${n.toString().padStart(2, '0')} CLEARED`, `+${bonus.toLocaleString('en-US')}${flawless ? ' · FLAWLESS' : ''}`, 'success', 2.6)
    this.sfx('waveClear')
    this.vfx.onWaveClear()
    if (n >= 8) this.unlockWeapon('seeker')
    if (n < TOTAL_WAVES && p.alive) {
      // Supply drop for the next wave.
      if (p.hp < p.stats.maxHp * 0.85) dropPickup(this, 'health', p.x + rand(-60, 60), p.y + rand(-60, 60))
      if (p.weapons.length > 1) dropPickup(this, 'ammo', p.x + rand(-60, 60), p.y + rand(-60, 60))
      if (this.director.isBossWave) this.audio.setMusic('combat')
    }
  }

  onAllWavesComplete(): void {
    this.victoryTimer = 0.6
  }

  onBossPhase(e: Enemy, phase: number): void {
    const p = this.player
    this.clearHostiles()
    this.hitStop = 0.25
    this.camera.addTrauma(0.8)
    this.flashColor = COLORS.magenta
    this.flashAlpha = 0.3
    this.vfx.onBossPhase(e)
    this.sfx('bossPhase')
    this.sfx('bigExplosion', e.x, 0.6)
    // Non-damaging shockwave pushes the player to a safe distance.
    const dx = p.x - e.x
    const dy = p.y - e.y
    const d = Math.hypot(dx, dy) || 1
    if (d < 320) {
      p.vx += (dx / d) * 900
      p.vy += (dy / d) * 900
    }
    if (p.hp < p.stats.maxHp * 0.75) dropPickup(this, 'health', e.x, e.y)
    if (p.weapons.length > 1) dropPickup(this, 'ammo', e.x, e.y)
    const roman = ['I', 'II', 'III', 'IV'][phase - 1] ?? `${phase}`
    const titles: Record<string, string> = { warden: 'Enraged', sovereign: phase === 2 ? 'Overclock' : 'Singularity' }
    this.banner(`PHASE ${roman}`, titles[e.boss?.type ?? 'warden'], 'boss', 1.8)
  }

  private onBossDefeated(e: Enemy): void {
    this.bossesDefeated++
    this.vfx.onBossDefeated(e)
    this.clearHostiles()
    for (const o of this.enemies) if (o !== e && o.alive) this.killEnemy(o)
    // Offspring spawned by the cascade above (e.g. splitter mites) vanish too.
    for (const o of this.enemies) if (o !== e && o.alive) o.alive = false
    this.hitStop = 0.3
    this.slowmo = 1.4
    this.flashColor = COLORS.white
    this.flashAlpha = 0.45
    this.sfx('bigExplosion')
    for (let i = 1; i <= 6; i++) {
      this.scheduled.push({
        at: this.realTime + i * 0.22,
        run: () => {
          const a = Math.random() * TAU
          const r = rand(10, e.radius * 1.4)
          this.vfx.onBossChain(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, i)
          this.camera.addTrauma(0.35)
          this.sfx('explosion', e.x)
        },
      })
    }
    const type = e.boss?.type ?? 'warden'
    this.banner(`${BOSS_INFO[type].name} DESTROYED`, `+${Math.round(e.def.score * this.diff.scoreMult).toLocaleString('en-US')}`, 'success', 2.4)
    if (type === 'warden') {
      this.unlockWeapon('lancer')
      dropPickup(this, 'chip', e.x, e.y)
      dropPickup(this, 'health', e.x + 30, e.y)
      dropPickup(this, 'core', e.x - 30, e.y)
      this.audio.setMusic('combat')
    } else {
      this.audio.setMusic('off')
    }
  }

  private runScheduled(): void {
    if (this.scheduled.length === 0) return
    const now = this.realTime
    const due = this.scheduled.filter((s) => s.at <= now)
    if (due.length === 0) return
    this.scheduled = this.scheduled.filter((s) => s.at > now)
    for (const s of due) s.run()
  }

  // --- Progression -------------------------------------------------------------------

  addScore(n: number): void {
    this.score += Math.max(0, Math.round(n))
  }

  gainXp(amount: number): void {
    const p = this.player
    if (!p.alive) return
    p.xp += amount * p.stats.xpMult * this.diff.xpMult
    while (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext
      p.level++
      this.pendingLevelUps++
      this.vfx.onLevelUp()
      this.fx.text(p.x, p.y - 34, 'LEVEL UP', COLORS.violet, 16, 1)
    }
  }

  xpPitch(): number {
    this.xpStreak++
    this.xpStreakTimer = 0.45
    return 1 + Math.min(this.xpStreak, 16) * 0.035
  }

  queueLevelUp(source: 'level' | 'chip'): void {
    if (source === 'chip') this.pendingChips++
    else this.pendingLevelUps++
  }

  private maybeOpenLevelUp(): void {
    if (this.phase !== 'playing' || !this.player.alive || this.deathTimer > 0 || this.victoryTimer > 0) return
    if (this.director.state === 'complete') return
    if (this.pendingLevelUps <= 0 && this.pendingChips <= 0) return
    this.openLevelUp()
  }

  private openLevelUp(): void {
    const p = this.player
    const source = this.pendingLevelUps > 0 ? 'level' : 'chip'
    const cards = rollUpgrades({ stacks: p.upgrades, weapons: p.weapons }, 3, source === 'chip' ? 0.6 : 0)
    if (cards.length === 0) {
      // Everything is maxed: convert the level into a repair and score.
      if (source === 'chip') this.pendingChips--
      else this.pendingLevelUps--
      p.hp = p.stats.maxHp
      this.addScore(500)
      this.toast('All augments maxed — hull restored', 'success')
      return
    }
    this.offerSource = source
    this.phase = 'levelup'
    this.input.capture = false
    this.input.reset()
    this.audio.setMuffled(true)
    this.sfx('levelup')
    this.publishHud(1)
    this.store.set({ phase: 'levelup', levelUp: { key: ++this.offerKey, level: p.level, source, cards } })
    this.renderDirty = true
  }

  chooseUpgrade(id: UpgradeId): void {
    if (this.phase !== 'levelup') return
    const offer = this.store.getState().levelUp
    if (!offer || !offer.cards.some((c) => c.id === id)) return
    this.applyUpgrade(id)
    if (this.offerSource === 'chip') this.pendingChips = Math.max(0, this.pendingChips - 1)
    else this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1)
    this.sfx('uiClick')
    if (this.pendingLevelUps > 0 || this.pendingChips > 0) {
      this.phase = 'playing'
      this.openLevelUp()
      if ((this.phase as GamePhase) === 'levelup') return
    }
    this.phase = 'playing'
    this.input.capture = true
    this.input.reset()
    this.audio.setMuffled(false)
    // A short grace window so nothing lands the instant play resumes.
    this.player.iframes = Math.max(this.player.iframes, 0.6)
    this.store.set({ phase: 'playing', levelUp: null })
    this.publishHud(1)
  }

  applyUpgrade(id: UpgradeId): void {
    const p = this.player
    const def = UPGRADES[id]
    p.upgrades[id] = (p.upgrades[id] ?? 0) + 1
    p.recomputeStats()
    if (def.weapon) {
      p.addWeapon(def.weapon)
      p.current = def.weapon
      this.toast(`${WEAPONS[def.weapon].name} acquired — press ${WEAPONS[def.weapon].slot}`, 'success')
    }
    if (id === 'ammo') for (const w of p.weapons) p.refillAmmo(w, 1)
    this.vfx.onAugment()
  }

  private unlockWeapon(id: WeaponId): void {
    const profile = profileStore.get()
    if (profile.unlockedWeapons.includes(id)) return
    profileStore.set({ ...profile, unlockedWeapons: [...profile.unlockedWeapons, id] })
    this.runUnlocks.push(`${WEAPONS[id].name} starting loadout`)
    this.toast(`UNLOCKED: ${WEAPONS[id].name} loadout`, 'success')
  }

  private saveCheckpoint(): void {
    const p = this.player
    if (!p.alive) return
    runSaveStore.set({
      version: 1,
      difficulty: this.config.difficulty,
      startWeapon: this.config.startWeapon,
      wave: this.director.wave,
      score: this.score,
      kills: this.kills,
      time: this.time,
      level: p.level,
      xp: p.xp,
      hp: p.hp,
      shield: p.shield,
      energy: p.energy,
      upgrades: { ...p.upgrades },
      weapons: [...p.weapons],
      ammo: { ...p.ammo },
      currentWeapon: p.current,
      bossesDefeated: this.bossesDefeated,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      damageDealt: this.damageDealt,
      savedAt: Date.now(),
    })
  }

  // --- Run control (called by the UI) --------------------------------------------------

  startRun(config: RunConfig): void {
    const { difficulty, startWeapon, save } = config
    this.config = { difficulty, startWeapon }
    this.diff = DIFFICULTY[difficulty]
    this.time = save?.time ?? 0
    this.score = save?.score ?? 0
    this.kills = save?.kills ?? 0
    this.bossesDefeated = save?.bossesDefeated ?? 0
    this.shotsFired = save?.shotsFired ?? 0
    this.shotsHit = save?.shotsHit ?? 0
    this.damageDealt = save?.damageDealt ?? 0
    this.combo = 0
    this.comboTimer = 0
    this.hitStop = 0
    this.slowmo = 0
    this.deathTimer = 0
    this.victoryTimer = 0
    this.pendingLevelUps = 0
    this.pendingChips = 0
    this.flashAlpha = 0
    this.scheduled = []
    this.runUnlocks = []
    this.toasts = []
    this.god = false

    this.arena = new Arena((Math.random() * 2 ** 31) | 0)
    this.arena.bake(this.quality.floorScale)

    const p = new Player(save ? 'pulse' : startWeapon)
    if (save) {
      p.upgrades = { ...save.upgrades }
      p.recomputeStats()
      p.weapons = [...save.weapons]
      p.ammo = { ...save.ammo }
      p.current = save.currentWeapon
      p.level = save.level
      p.xp = save.xp
      p.hp = Math.min(p.stats.maxHp, save.hp)
      p.shield = Math.min(p.stats.maxShield, save.shield)
      p.energy = Math.min(p.stats.energyMax, save.energy)
    }
    this.player = p
    this.scoreShown = this.score

    this.enemies = []
    for (const pr of this.projectiles) this.projectilePool.push(pr)
    this.projectiles = []
    this.pickups = []
    this.hazards = []
    this.fx.clear()
    this.vfx.reset()
    this.intro.stop(performance.now())
    this.camera.trauma = 0
    this.cinematicPan = 0
    this.camera.pull = 0
    this.camera.cine = 1
    this.camera.follow(p.x, p.y, 0, true)

    if (!save) runSaveStore.set(null)
    profileStore.update((prof) => ({ ...prof, lastLoadout: { weapon: startWeapon, difficulty } }))

    this.phase = 'playing'
    this.input.capture = true
    this.input.reset()
    this.audio.setMuffled(false)
    this.audio.setMusic('combat')
    this.audio.setAmbience(AMBIENCE.combat)
    this.store.set({ phase: 'playing', summary: null, levelUp: null, banner: null, toasts: [] })
    this.director.startWave(save?.wave ?? 1)
    this.publishHud(1)
    this.renderDirty = true
  }

  pause(): void {
    if (this.phase !== 'playing' || !this.player.alive || this.deathTimer > 0 || this.victoryTimer > 0) return
    this.phase = 'paused'
    this.input.capture = false
    this.input.reset()
    this.audio.setMuffled(true)
    // Settle the rolling score so the frozen HUD agrees with the pause panel.
    this.scoreShown = this.score
    this.publishHud(1)
    this.store.set({ phase: 'paused' })
    this.renderDirty = true
  }

  resume(): void {
    if (this.phase !== 'paused') return
    this.phase = 'playing'
    this.input.capture = true
    this.input.reset()
    this.audio.setMuffled(false)
    this.store.set({ phase: 'playing' })
  }

  restart(): void {
    this.startRun({ difficulty: this.config.difficulty, startWeapon: this.config.startWeapon })
  }

  quitToMenu(): void {
    this.phase = 'idle'
    this.input.capture = false
    this.input.reset()
    this.enemies = []
    for (const pr of this.projectiles) this.projectilePool.push(pr)
    this.projectiles = []
    this.pickups = []
    this.hazards = []
    this.scheduled = []
    this.toasts = []
    this.player.alive = false
    this.fx.clear()
    this.vfx.reset()
    this.cinematicPan = 0
    this.camera.pull = 0
    this.audio.setMuffled(false)
    this.audio.setMusic('menu')
    this.audio.setAmbience(AMBIENCE.menu)
    this.store.set({ phase: 'idle', levelUp: null, summary: null, banner: null, toasts: [] })
  }

  private finishRun(outcome: 'defeat' | 'victory'): void {
    const profile = profileStore.get()
    const victory = outcome === 'victory'
    const newRecord = this.score > profile.highScore
    const unlocks = [...this.runUnlocks]
    if (victory && !profile.hardUnlocked) unlocks.push('Nightmare difficulty')
    const wave = this.director.wave
    profileStore.set({
      ...profileStore.get(),
      highScore: Math.max(profile.highScore, this.score),
      bestWave: Math.max(profile.bestWave, wave),
      bestTime: Math.max(profile.bestTime, this.time),
      totalKills: profile.totalKills + this.kills,
      runs: profile.runs + 1,
      victories: profile.victories + (victory ? 1 : 0),
      bossesDefeated: profile.bossesDefeated + this.bossesDefeated,
      hardUnlocked: profile.hardUnlocked || victory,
    })
    runSaveStore.set(null)

    const p = this.player
    const summary: RunSummary = {
      outcome,
      difficulty: this.config.difficulty,
      score: this.score,
      time: this.time,
      kills: this.kills,
      wave,
      level: p.level,
      bossesDefeated: this.bossesDefeated,
      accuracy: this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 0,
      damageDealt: Math.round(this.damageDealt),
      bestScore: Math.max(profile.highScore, this.score),
      newRecord,
      newUnlocks: unlocks,
      upgrades: (Object.entries(p.upgrades) as [UpgradeId, number][])
        .filter(([, n]) => n > 0)
        .map(([id, n]) => ({ name: UPGRADES[id].name, stacks: n })),
    }
    this.phase = victory ? 'victory' : 'gameover'
    this.input.capture = false
    this.input.reset()
    this.audio.setMuffled(false)
    this.audio.setMusic('off')
    this.audio.setAmbience(AMBIENCE.results)
    this.sfx(victory ? 'victory' : 'defeat')
    this.publishHud(1)
    this.store.set({ phase: this.phase, summary, levelUp: null })
  }

  // --- Camera & attract mode -----------------------------------------------------------

  private updateCamera(dt: number): void {
    const p = this.player
    let tx = p.x
    let ty = p.y
    if (p.alive && this.input.hasMouse && !this.input.usingTouch) {
      // Look slightly toward the cursor for better visibility while aiming.
      const w = this.camera.screenToWorld(this.input.mouseX, this.input.mouseY)
      tx += clamp((w.x - p.x) * 0.18, -140, 140)
      ty += clamp((w.y - p.y) * 0.18, -100, 100)
    }
    // Lean toward a boss while it materialises so the arrival is seen. The
    // player stays in frame (and in control); arrivals have no other hostiles.
    const boss = this.director.boss
    const arriving = !!boss && boss.alive && boss.spawnTimer > 0 && !this.settings.reducedMotion
    this.cinematicPan = damp(this.cinematicPan, arriving ? 1 : 0, arriving ? 2.2 : 1.4, dt)
    if (boss && this.cinematicPan > 0.005) {
      const maxX = Math.max(0, this.camera.worldW / 2 - 80)
      const maxY = Math.max(0, this.camera.worldH / 2 - 70)
      const bx = p.x + clamp((boss.x - p.x) * 0.85, -maxX, maxX)
      const by = p.y + clamp((boss.y - p.y) * 0.85, -maxY, maxY)
      tx += (bx - tx) * this.cinematicPan
      ty += (by - ty) * this.cinematicPan
    }
    this.camera.pull = this.cinematicPan
    this.camera.follow(tx, ty, dt)
    this.camera.updateShake(dt)
  }

  private updateAttract(dt: number): void {
    const cam = this.camera
    const intro = this.intro
    const shot = intro.update(performance.now(), cam.zoom, cam.viewW, cam.viewH)
    if (intro.active) {
      cam.cine = shot.zoom / cam.zoom
      cam.follow(shot.x, shot.y, dt)
      for (const cue of intro.events) this.onIntroCue(cue)
    } else {
      // Landing page: the reactor well framed in the open stage between the
      // title column and the operative record, sized to it for any window
      // shape. A slow drift and a little pointer parallax move the deck's
      // layers against each other; reduced motion holds a still composition.
      // From the cinematic's establishing shot this eases in, so the
      // hand-over is seamless.
      this.attractT += dt
      const t = this.attractT
      const reduced = this.settings.reducedMotion
      const frame = menuFraming(cam.viewW, cam.viewH, this.menuStage)
      cam.cine = reduced ? frame.zoom / cam.zoom : damp(cam.cine, frame.zoom / cam.zoom, 1.1, dt)
      const input = this.input
      const look = !reduced && input.hasMouse && !input.usingTouch
      this.menuLookX = damp(this.menuLookX, look ? clamp((input.mouseX / cam.viewW) * 2 - 1, -1, 1) : 0, 2.4, dt)
      this.menuLookY = damp(this.menuLookY, look ? clamp((input.mouseY / cam.viewH) * 2 - 1, -1, 1) : 0, 2.4, dt)
      const rc = this.arena.reactor
      const at = cameraFor(rc.x, rc.y, frame.cx, frame.cy, cam.viewW, cam.viewH, cam.renderZoom)
      const drift = reduced ? 0 : 1
      cam.follow(
        at.x + drift * Math.sin(t * 0.05) * 60 + this.menuLookX * 32,
        at.y + drift * Math.sin(t * 0.071) * 36 + this.menuLookY * 20,
        dt,
        reduced,
        false,
      )
      if (Math.random() < dt * 0.6) {
        const portal = this.arena.portals[Math.floor(Math.random() * this.arena.portals.length)]
        portal.flare = 1
      }
    }
    cam.updateShake(dt)
    this.fx.update(dt)
    for (const portal of this.arena.portals) portal.flare = Math.max(0, portal.flare - dt * 0.8)
  }

  // --- Opening cinematic (called by the UI overlay) ------------------------------------

  /** Starts the scripted opening shot. Safe to call again (e.g. replaying it from Credits). */
  startIntro(reduced: boolean): void {
    if (this.phase !== 'idle') return
    const cam = this.camera
    const rc = this.arena.reactor
    this.introPortals = [...this.arena.portals].sort((a, b) => Math.atan2(a.x - rc.x, rc.y - a.y) - Math.atan2(b.x - rc.x, rc.y - b.y))
    const now = performance.now()
    this.intro.start(now, reduced, this.introPortals.length)
    const shot = this.intro.update(now, cam.zoom, cam.viewW, cam.viewH)
    cam.cine = shot.zoom / cam.zoom
    cam.follow(shot.x, shot.y, 0, true)
    this.fx.clear()
    this.vfx.reset()
    this.audio.setMusic('off')
    this.audio.setAmbience(AMBIENCE.intro)
    this.renderDirty = true
  }

  /** The landing page reports the open part of its layout (fractions of the view). */
  setMenuStage(stage: MenuStage | null): void {
    this.menuStage = validStage(stage) ?? FULL_STAGE
  }

  /** Finished or skipped: hand the camera and soundtrack over to the menu. */
  endIntro(): void {
    if (!this.intro.active) return
    this.intro.stop(performance.now())
    this.attractT = 0
    if (this.phase === 'idle') {
      this.audio.setMusic('menu')
      this.audio.setAmbience(AMBIENCE.menu)
    }
  }

  private onIntroCue(cue: IntroCue): void {
    switch (cue.kind) {
      case 'line':
        this.vfx.onIntroHeartbeat()
        this.sfx('introTick', undefined, 1, undefined, 1 + cue.index * 0.06)
        break
      case 'surge':
        this.vfx.onIntroSurge()
        this.sfx('introSurge')
        break
      case 'title':
        this.vfx.onIntroTitle()
        this.sfx('introTitle')
        break
      case 'portal': {
        const portal = this.introPortals[cue.index]
        if (portal) {
          portal.flare = 1
          this.sfx('spawn', portal.x, 0.3)
        }
        break
      }
      case 'ready':
        break
    }
  }

  // --- UI bridge -------------------------------------------------------------------------

  sfx(name: SfxName, x?: number, volume = 1, duration?: number, pitch?: number): void {
    let pan: number | undefined
    let vol = volume
    if (x !== undefined) {
      const rel = (x - this.camera.x) / (this.camera.worldW / 2)
      pan = clamp(rel, -1, 1) * 0.6
      if (Math.abs(rel) > 1.2) vol *= 0.5
    }
    this.audio.play(name, { pan, volume: vol, duration, pitch })
  }

  banner(title: string, subtitle: string | undefined, tone: 'info' | 'success' | 'danger' | 'boss', duration: number): void {
    this.store.set({ banner: { id: ++this.bannerId, title, subtitle, tone, duration } })
  }

  toast(text: string, tone: Toast['tone']): void {
    this.toasts = [...this.toasts, { id: ++this.toastId, text, tone, expires: this.realTime + 3.2 }].slice(-4)
    this.store.set({ toasts: this.toasts.map(({ id, text: t, tone: tn }) => ({ id, text: t, tone: tn })) })
  }

  private updateToasts(): void {
    if (this.toasts.length === 0) return
    const alive = this.toasts.filter((t) => t.expires > this.realTime)
    if (alive.length !== this.toasts.length) {
      this.toasts = alive
      this.store.set({ toasts: alive.map(({ id, text, tone }) => ({ id, text, tone })) })
    }
  }

  private updateFps(dt: number): void {
    this.fpsFrames++
    this.fpsTime += dt
    if (this.fpsTime >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsTime)
      this.fpsFrames = 0
      this.fpsTime = 0
      if (this.settings.showFps) this.store.set({ fps, qualityStep: this.governor.level })
    }
  }

  private publishHud(dt: number): void {
    this.hudTimer -= dt
    if (this.hudTimer > 0) return
    this.hudTimer = 1 / 12
    this.store.set({ hud: this.snapshot() })
  }

  snapshot(): HudSnapshot {
    const p = this.player
    const boss = this.director.boss
    const d = this.director
    const waveState: HudSnapshot['waveState'] =
      d.state === 'intermission' ? 'intermission' : d.state === 'intro' ? 'intro' : d.isBossWave ? 'boss' : 'combat'
    return {
      hp: Math.max(0, p.hp),
      maxHp: p.stats.maxHp,
      shield: p.shield,
      maxShield: p.stats.maxShield,
      energy: p.energy,
      maxEnergy: p.stats.energyMax,
      level: p.level,
      xp: p.xp,
      xpToNext: p.xpToNext,
      score: this.score,
      scoreShown: Math.round(this.scoreShown),
      combo: this.combo,
      comboMult: this.comboMult(),
      comboTimer: this.comboTimer / COMBO_WINDOW,
      wave: d.wave,
      totalWaves: TOTAL_WAVES,
      waveState,
      intermission: d.state === 'intermission' ? d.timer : 0,
      enemiesLeft: d.isBossWave ? 0 : d.remaining,
      waveTotal: d.isBossWave ? 0 : d.total,
      time: this.time,
      kills: this.kills,
      dashReady: p.stats.dashCooldown > 0 ? 1 - p.dashCooldown / p.stats.dashCooldown : 1,
      boosting: p.boosting,
      weapons: p.weapons.map((id) => ({
        id,
        name: WEAPONS[id].name,
        color: WEAPONS[id].color,
        ammo: p.maxAmmo(id) === null ? null : (p.ammo[id] ?? 0),
        maxAmmo: p.maxAmmo(id),
        slot: WEAPONS[id].slot,
      })),
      currentWeapon: p.current,
      powerUps: (Object.keys(p.powerUps) as (keyof typeof p.powerUps)[])
        .filter((k) => p.powerUps[k] > 0)
        .map((k) => ({ kind: k, remaining: p.powerUps[k], duration: POWERUPS[k].duration })),
      boss:
        boss && boss.boss && (boss.alive || d.state === 'bossDown')
          ? {
              name: BOSS_INFO[boss.boss.type].name,
              title: BOSS_INFO[boss.boss.type].title,
              hp: Math.max(0, boss.hp),
              maxHp: boss.maxHp,
              phase: boss.boss.phase,
              phases: boss.boss.phases,
              shielded: boss.invuln > 0 || boss.spawnTimer > 0,
            }
          : null,
      lowHealth: p.alive && p.hp / p.stats.maxHp < 0.3,
      difficulty: this.config.difficulty,
      cinematic: d.isBossWave && (d.state === 'intro' || (!!boss && boss.alive && boss.spawnTimer > 0)),
      events: { ...this.hudEvents },
    }
  }

  // --- Debug ------------------------------------------------------------------------------

  private handleDebugKey = (e: KeyboardEvent): void => {
    if (this.phase !== 'playing') return
    switch (e.code) {
      case 'KeyK':
        this.debugKillAll()
        break
      case 'KeyG':
        this.god = !this.god
        this.toast(`God mode ${this.god ? 'on' : 'off'}`, 'info')
        break
      case 'KeyL':
        this.queueLevelUp('level')
        break
      case 'KeyN':
        this.debugSkipToWave(Math.min(TOTAL_WAVES, this.director.wave + 1))
        break
      case 'KeyH': {
        const b = this.director.boss
        if (b && b.alive) this.damageEnemy(b, b.maxHp * 0.2, { crit: false, kx: 0, ky: 0, knockback: 0 })
        break
      }
    }
  }

  /** Soak-test diagnostics: caches that must stay bounded however long the session runs. */
  debugCaches(): { sprites: number } {
    return { sprites: spriteCacheSize() }
  }

  debugKillAll(): void {
    this.director.queue.length = 0
    for (const e of this.enemies) if (e.alive && !e.isBoss) this.killEnemy(e)
  }

  debugSkipToWave(n: number): void {
    this.director.queue.length = 0
    this.enemies = []
    this.hazards = []
    for (const pr of this.projectiles) if (!pr.friendly) pr.alive = false
    this.director.startWave(n)
  }
}
