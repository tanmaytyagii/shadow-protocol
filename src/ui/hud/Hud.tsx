import { useEffect, useRef, useState, type RefObject } from 'react'
import { POWERUPS } from '../../game/entities/Pickup'
import { formatScore, formatTime } from '../../game/math'
import type { Banner as BannerData, HudSnapshot } from '../../game/types'
import { KeyCap } from '../components/controls'
import { Icon } from '../components/Icon'
import { useGameState, useProfile, useSettings } from '../context'

const SHAKE: Keyframe[] = [
  { transform: 'none' },
  { transform: 'translate(-4px, 1px)' },
  { transform: 'translate(3px, -1px)' },
  { transform: 'translate(-2px, 0)' },
  { transform: 'translate(1px, 1px)' },
  { transform: 'none' },
]
const SHAKE_OPTS: KeyframeAnimationOptions = { duration: 320, easing: 'ease-out' }

/** Replays a short animation on `ref` whenever `trigger` increments, without remounting. */
function usePulse(ref: RefObject<HTMLElement | null>, trigger: number, keyframes: Keyframe[], options: KeyframeAnimationOptions): void {
  const reduced = useSettings().reducedMotion
  useEffect(() => {
    if (trigger <= 0 || reduced) return
    ref.current?.animate(keyframes, options)
  }, [ref, trigger, keyframes, options, reduced])
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/*
 * Layout: vitals top-left, wave or boss top-centre, score top-right; abilities,
 * weapons and power-ups along the bottom. Everything hugs the edges (inside
 * the safe area) so the centre of the screen, where the operative is, stays
 * clear. Peripheral elements are still unless something changes.
 */
export function Hud({ touch }: { touch: boolean }) {
  const hud = useGameState((s) => s.hud)
  const phase = useGameState((s) => s.phase)
  const settings = useSettings()
  const fps = useGameState((s) => s.fps)
  const step = useGameState((s) => s.qualityStep)
  const hidden = phase === 'gameover' || phase === 'victory'
  const cine = hud.cinematic && phase === 'playing'

  return (
    <div className={`hud pointer-events-none absolute inset-0 z-(--z-hud) transition-opacity duration-500 ${hidden ? 'opacity-0' : 'opacity-100'}`} data-touch={touch ? '' : undefined}>
      {hud.lowHealth && phase === 'playing' && <div className="low-hp absolute inset-0" />}

      {/* Letterbox for boss arrivals; the HUD stays on top and readable. */}
      <div className="letterbox top-0" style={{ transform: cine ? 'translateY(0)' : 'translateY(-100%)' }} />
      <div className="letterbox bottom-0" style={{ transform: cine ? 'translateY(0)' : 'translateY(100%)' }} />

      <div className={`hud-top absolute inset-x-0 top-0 flex items-start justify-between gap-3 transition-opacity duration-500 ${cine ? 'opacity-60' : ''}`}>
        <Vitals hud={hud} compact={touch} />
        <ScorePanel hud={hud} touch={touch} />
      </div>
      <div className={`hud-center pointer-events-none absolute left-1/2 -translate-x-1/2 transition-opacity duration-500 ${hud.boss ? 'is-boss' : ''} ${cine ? 'opacity-60' : ''}`}>
        {hud.boss ? <BossBar hud={hud} /> : <WaveInfo hud={hud} />}
      </div>

      <Banner />
      <Toasts />
      {phase === 'playing' && <FirstRunHint hud={hud} touch={touch} />}

      {!touch && (
        <div className={`hud-bottom absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 transition-opacity duration-500 ${cine ? 'opacity-40' : ''}`}>
          <Abilities hud={hud} />
          <WeaponBar hud={hud} />
          <PowerUps hud={hud} />
        </div>
      )}
      {touch && (
        <div className="hud-bottom absolute bottom-0 left-0 flex flex-col items-start gap-2">
          <PowerUps hud={hud} align="start" />
          <WeaponBar hud={hud} compact />
        </div>
      )}

      {settings.showFps && (
        <div className="absolute bottom-[max(0.25rem,var(--safe-bottom))] left-1/2 -translate-x-1/2 font-mono text-[0.625rem] text-dim">
          {fps} FPS{step > 0 ? ` · adaptive quality −${step}` : ''}
        </div>
      )}
    </div>
  )
}

/** First deploy only: a quiet reminder of the controls during the opening seconds of wave 1. */
function FirstRunHint({ hud, touch }: { hud: HudSnapshot; touch: boolean }) {
  const runs = useProfile().runs
  if (runs > 0 || hud.wave !== 1 || hud.time < 1.2 || hud.time > 15) return null
  const opacity = Math.max(0, Math.min(1, (hud.time - 1.2) / 0.6, (15 - hud.time) / 1.2))
  const items: [string, string][] = touch
    ? [
        ['Left thumb', 'Move'],
        ['Right thumb', 'Aim & fire'],
        ['Dash', 'Dodge through danger'],
      ]
    : [
        ['WASD', 'Move'],
        ['Mouse', 'Aim & fire'],
        ['Space', 'Dash'],
        ['Shift', 'Boost'],
        ['Esc', 'Pause'],
      ]
  return (
    <div
      role="note"
      aria-label="Controls"
      data-first-run-hint=""
      className={`absolute inset-x-0 flex justify-center px-4 transition-opacity duration-300 ${touch ? 'bottom-[30%]' : 'bottom-28'}`}
      style={{ opacity }}
    >
      <div className="chamfer-sm flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 bg-ink/80 px-4 py-2 shadow-[inset_0_0_0_1px_var(--color-edge)]">
        {items.map(([key, action]) => (
          <span key={key} className="flex items-center gap-2 text-caption text-muted uppercase">
            {touch ? <span className="text-cyan-soft">{key}</span> : <KeyCap>{key}</KeyCap>}
            {action}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Bar with a delayed "damage trail": the bright fill drops at once while a
 * pale trail catches up, showing how much was just lost. Fills scale with a
 * transform, so updates never trigger layout.
 */
function Meter({
  label,
  value,
  max,
  color,
  height = 'h-2.5',
  segments = 0,
  trail = false,
  showText = true,
  labelClass = 'text-muted',
}: {
  label: string
  value: number
  max: number
  color: string
  height?: string
  segments?: number
  trail?: boolean
  showText?: boolean
  labelClass?: string
}) {
  const k = max > 0 ? clamp01(value / max) : 0
  return (
    <div className="grid grid-cols-[3.4rem_minmax(0,1fr)_auto] items-center gap-2 max-sm:grid-cols-[2.9rem_minmax(0,1fr)]">
      <span className={`text-[0.625rem] font-semibold tracking-[0.18em] uppercase ${labelClass}`}>{label}</span>
      <div
        className={`relative overflow-hidden bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] ${height}`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuenow={Math.round(value)}
        aria-valuemax={Math.round(max)}
      >
        {trail && <div className="absolute inset-0 origin-left bg-white/55" style={{ transform: `scaleX(${k})`, transition: 'transform 0.55s cubic-bezier(0.4,0,0.2,1) 0.28s' }} />}
        <div className="bar-sheen absolute inset-0 origin-left transition-transform duration-150 ease-out" style={{ transform: `scaleX(${k})`, backgroundColor: color }} />
        {segments > 0 &&
          Array.from({ length: segments - 1 }, (_, i) => (
            <span key={i} className="absolute inset-y-0 w-px bg-ink/80" style={{ left: `${((i + 1) / segments) * 100}%` }} />
          ))}
      </div>
      {showText && (
        <span className="min-w-[3.6rem] text-right font-mono text-[0.6875rem] text-text/90 tabular-nums max-sm:hidden">
          {Math.ceil(value)}
          <span className="text-dim">/{Math.round(max)}</span>
        </span>
      )}
    </div>
  )
}

function hullColor(k: number): string {
  if (k < 0.3) return '#ff4d6d'
  if (k < 0.5) return '#ffc35c'
  return '#4dffb5'
}

function Vitals({ hud, compact }: { hud: HudSnapshot; compact: boolean }) {
  const k = hud.maxHp > 0 ? hud.hp / hud.maxHp : 0
  const critical = k < 0.3
  const ref = useRef<HTMLDivElement>(null)
  usePulse(ref, hud.events.hurt, SHAKE, SHAKE_OPTS)
  return (
    <div ref={ref} className={`hud-plate chamfer relative ${compact ? 'w-[min(56vw,250px)] p-2.5' : 'w-[clamp(230px,21vw,300px)] p-3'}`}>
      {hud.events.hurt > 0 && (
        <span key={`hurt-${hud.events.hurt}`} className="animate-fade pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 28px rgba(255,77,109,0.35)', animationDirection: 'reverse' }} />
      )}
      {/* Heal flash, re-keyed so it replays on each event. */}
      <span
        key={`heal-${hud.events.heal}`}
        className={`pointer-events-none absolute inset-0 ${hud.events.heal > 0 ? 'animate-fade' : ''}`}
        style={{ boxShadow: hud.events.heal > 0 ? 'inset 0 0 26px rgba(77,255,181,0.25)' : undefined, animationDirection: 'reverse' }}
      />
      <div className="space-y-1.5">
        <Meter label="Hull" value={hud.hp} max={hud.maxHp} color={hullColor(k)} height="h-3" trail labelClass={critical ? 'text-danger-soft' : 'text-muted'} />
        <Meter label="Shield" value={hud.shield} max={hud.maxShield} color="#3ef2ff" segments={Math.max(2, Math.round(hud.maxShield / 20))} trail />
        <Meter label="Energy" value={hud.energy} max={hud.maxEnergy} color={hud.boosting ? '#e9dcff' : '#9d6bff'} height="h-1.5" />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span key={`lv-${hud.level}`} className="chamfer-sm animate-pop bg-violet/20 px-1.5 py-0.5 font-mono text-[0.6875rem] font-bold text-violet-soft tabular-nums">
          LV {hud.level}
        </span>
        <div className="relative h-1 flex-1 overflow-hidden bg-white/[0.07]" role="meter" aria-label="Experience" aria-valuenow={Math.round(hud.xp)} aria-valuemax={Math.round(hud.xpToNext)}>
          <div className="absolute inset-0 origin-left bg-violet transition-transform duration-200" style={{ transform: `scaleX(${clamp01(hud.xp / hud.xpToNext)})` }} />
        </div>
        {critical && (
          <span className="chamfer-sm hud-critical bg-danger/20 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-[0.16em] text-danger-soft uppercase">Critical</span>
        )}
      </div>
    </div>
  )
}

function WaveInfo({ hud }: { hud: HudSnapshot }) {
  const intermission = hud.waveState === 'intermission'
  const progress = hud.waveTotal > 0 ? clamp01(1 - hud.enemiesLeft / hud.waveTotal) : 0
  return (
    <div className="text-center">
      <div className="text-caption text-muted uppercase">Wave</div>
      <div key={`wave-${hud.wave}`} className="animate-pop font-mono text-[1.75rem] leading-none font-bold text-white tabular-nums sm:text-[2rem]">
        {hud.wave.toString().padStart(2, '0')}
        <span className="text-base text-dim">/{hud.totalWaves}</span>
      </div>
      <div className="mt-1.5 text-caption uppercase">
        {intermission ? (
          <span className="text-mint">Next wave in {Math.ceil(hud.intermission)}</span>
        ) : hud.waveState === 'intro' ? (
          <span className="text-amber">Incoming</span>
        ) : (
          <span className="text-[#ff9ccb]">
            {hud.enemiesLeft} {hud.enemiesLeft === 1 ? 'hostile' : 'hostiles'}
          </span>
        )}
      </div>
      <div className="mx-auto mt-1.5 h-0.5 w-28 overflow-hidden bg-white/10" role="meter" aria-label={intermission ? 'Intermission' : 'Wave progress'}>
        {intermission ? (
          <div className="h-full origin-left bg-mint transition-transform duration-100" style={{ transform: `scaleX(${clamp01(hud.intermission / 5)})` }} />
        ) : (
          <div className="h-full origin-left bg-magenta/80 transition-transform duration-300" style={{ transform: `scaleX(${progress})` }} />
        )}
      </div>
    </div>
  )
}

function BossBar({ hud }: { hud: HudSnapshot }) {
  const bar = useRef<HTMLDivElement>(null)
  usePulse(bar, hud.events.boss, SHAKE, SHAKE_OPTS)
  const b = hud.boss
  if (!b) return null
  const k = clamp01(b.hp / b.maxHp)
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-caption text-[#ff9ccb] uppercase">{b.title}</div>
          <div className="text-heading text-white uppercase">{b.name}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2 font-mono text-[0.6875rem] text-muted uppercase">
          {b.shielded && (
            <span className="chamfer-sm bg-cyan/15 px-1.5 py-0.5 font-display text-[0.625rem] font-bold tracking-[0.16em] text-cyan-soft">Shielded</span>
          )}
          <span className="flex gap-1" aria-hidden>
            {Array.from({ length: b.phases }, (_, i) => (
              <span key={i} className={`size-1.5 rotate-45 ${i < b.phase ? 'bg-magenta' : 'bg-white/15'}`} />
            ))}
          </span>
          Phase <span className="text-text">{b.phase}</span>/{b.phases}
        </div>
      </div>
      <div ref={bar} className="chamfer-sm relative mt-1.5 h-3.5 overflow-hidden bg-ink/85 shadow-[inset_0_0_0_1px_rgba(255,61,154,0.45)]" role="meter" aria-label={`${b.name} health`} aria-valuenow={Math.round(b.hp)} aria-valuemax={Math.round(b.maxHp)}>
        <div className="absolute inset-0 origin-left bg-white/70" style={{ transform: `scaleX(${k})`, transition: 'transform 0.6s cubic-bezier(0.4,0,0.2,1) 0.3s' }} />
        <div
          className="bar-sheen absolute inset-0 origin-left transition-transform duration-200"
          style={{ transform: `scaleX(${k})`, background: b.shielded ? 'linear-gradient(90deg,#3ef2ff,#9df9ff)' : 'linear-gradient(90deg,#9d6bff,#ff3d9a)' }}
        />
        {Array.from({ length: b.phases - 1 }, (_, i) => (
          <span key={i} className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: `${((i + 1) / b.phases) * 100}%` }} />
        ))}
      </div>
    </div>
  )
}

function comboTier(mult: number): string {
  if (mult >= 2) return 'text-[#ff9ccb]'
  if (mult >= 1.5) return 'text-amber'
  return 'text-cyan-soft'
}

function ScorePanel({ hud, touch }: { hud: HudSnapshot; touch: boolean }) {
  const tier = comboTier(hud.comboMult)
  return (
    <div className={`text-right ${touch ? 'pr-14' : ''}`}>
      <div className="text-caption text-muted uppercase">Score</div>
      <div className="font-mono text-[1.375rem] leading-tight font-bold text-white tabular-nums sm:text-[1.875rem]">{formatScore(hud.scoreShown)}</div>
      <div className="mt-1 flex items-center justify-end gap-3 font-mono text-[0.6875rem] text-muted tabular-nums">
        <span className="flex items-center gap-1">
          <Icon name="clock" className="size-3" />
          {formatTime(hud.time)}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="skull" className="size-3" />
          {hud.kills}
        </span>
      </div>
      <div className={`mt-2 ml-auto w-32 transition-opacity duration-200 ${hud.combo >= 3 ? 'opacity-100' : 'opacity-0'}`} aria-hidden={hud.combo < 3}>
        <div className="flex items-baseline justify-end gap-1.5">
          <span key={Math.floor(hud.combo / 5)} className={`animate-pop font-mono text-lg font-bold tabular-nums ${tier}`}>
            ×{hud.comboMult.toFixed(2)}
          </span>
          <span className={`text-[0.625rem] tracking-[0.16em] uppercase opacity-80 ${tier}`}>{hud.combo} chain</span>
        </div>
        <div className="mt-0.5 h-0.5 overflow-hidden bg-white/10">
          <div className={`h-full origin-left bg-current transition-transform duration-100 ${tier}`} style={{ transform: `scaleX(${clamp01(hud.comboTimer)})` }} />
        </div>
      </div>
    </div>
  )
}

function WeaponBar({ hud, compact = false }: { hud: HudSnapshot; compact?: boolean }) {
  return (
    <div className="flex items-end gap-1.5 sm:gap-2" aria-label="Weapons">
      {hud.weapons.map((w) => {
        const active = w.id === hud.currentWeapon
        const empty = w.ammo !== null && w.ammo <= 0
        const ratio = w.ammo !== null && w.maxAmmo ? w.ammo / w.maxAmmo : 1
        const low = w.ammo !== null && !empty && ratio < 0.25
        return (
          <div
            key={active ? `${w.id}-active` : w.id}
            className={`hud-plate chamfer-sm relative flex items-center gap-2 transition-[opacity,transform] duration-200 ${compact ? 'min-h-11 px-2.5 py-1.5' : 'px-3 py-2'} ${
              active ? '-translate-y-0.5 opacity-100 animate-pop' : 'opacity-60'
            } ${empty ? 'grayscale' : ''}`}
            style={{ boxShadow: active ? `inset 0 0 0 1px ${w.color}, 0 0 22px -8px ${w.color}` : undefined }}
            aria-current={active || undefined}
          >
            {!compact && <KeyCap className="!h-5 !min-w-5 !px-1 !text-[0.625rem]">{w.slot}</KeyCap>}
            <span style={{ color: w.color }}>
              <Icon name={w.id} className={compact ? 'size-4' : 'size-5'} />
            </span>
            {!compact && (
              <span className="flex min-w-[5.5rem] flex-col leading-tight">
                <span className="text-[0.625rem] font-bold tracking-[0.14em] text-text uppercase">{w.name}</span>
                <span className="flex items-center gap-1.5">
                  <span className={`font-mono text-[0.75rem] tabular-nums ${empty ? 'text-danger-soft' : low ? 'text-amber' : 'text-muted'}`}>
                    {w.ammo === null ? '∞' : `${w.ammo}/${w.maxAmmo}`}
                  </span>
                  {(empty || low) && (
                    <span className={`text-[0.5625rem] font-bold tracking-[0.16em] uppercase ${empty ? 'text-danger-soft' : 'text-amber'}`}>{empty ? 'Empty' : 'Low'}</span>
                  )}
                </span>
                {w.ammo !== null && (
                  <span className="mt-1 h-0.5 w-full overflow-hidden bg-white/10">
                    <span className="block h-full origin-left transition-transform duration-150" style={{ transform: `scaleX(${clamp01(ratio)})`, background: empty || low ? '#ffc35c' : w.color }} />
                  </span>
                )}
              </span>
            )}
            {compact && w.ammo !== null && (
              <span className={`font-mono text-[0.6875rem] tabular-nums ${empty ? 'text-danger-soft' : low ? 'text-amber' : 'text-muted'}`}>{empty ? '0' : w.ammo}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Ring({ value, color, size = 48, children }: { value: number; color: string; size?: number; children: React.ReactNode }) {
  const r = size / 2 - 3
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(5,7,15,0.82)" stroke="rgba(125,139,179,0.22)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamp01(value))}
          style={{ transition: 'stroke-dashoffset 120ms linear' }}
        />
      </svg>
      <span className="relative">{children}</span>
    </div>
  )
}

function Abilities({ hud }: { hud: HudSnapshot }) {
  const dashReady = hud.dashReady >= 1
  return (
    <div className="flex items-end gap-3">
      <div className="relative flex flex-col items-center gap-1">
        <Ring value={hud.dashReady} color={dashReady ? '#3ef2ff' : '#9d6bff'}>
          <Icon name="dash" className={`size-5 ${dashReady ? 'text-cyan' : 'text-muted'}`} />
        </Ring>
        {/* Readiness ping, replayed each time the dash comes off cooldown. */}
        {hud.events.dash > 0 && <span key={`dash-${hud.events.dash}`} className="animate-ping pointer-events-none absolute top-0 left-0 size-12 rounded-full border-2 border-cyan" />}
        <KeyCap className="!h-5 !text-[0.5625rem]">SPACE</KeyCap>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Ring value={hud.energy / hud.maxEnergy} color={hud.boosting ? '#e9dcff' : '#9d6bff'}>
          <Icon name="energy" className={`size-5 ${hud.boosting ? 'text-white' : 'text-violet-soft'}`} />
        </Ring>
        <KeyCap className="!h-5 !text-[0.5625rem]">SHIFT</KeyCap>
      </div>
    </div>
  )
}

function PowerUps({ hud, align = 'end' }: { hud: HudSnapshot; align?: 'start' | 'end' }) {
  return (
    <div className={`flex gap-2 ${align === 'end' ? 'min-w-[100px] justify-end' : 'empty:hidden'}`} aria-label="Active power-ups">
      {hud.powerUps.map((p) => {
        const def = POWERUPS[p.kind]
        return (
          <div key={p.kind} className="flex flex-col items-center gap-1 animate-pop">
            <Ring value={p.remaining / p.duration} color={def.color} size={42}>
              <span className="font-mono text-sm font-bold" style={{ color: def.color }}>
                {def.glyph}
              </span>
            </Ring>
            <span className="text-[0.5625rem] font-semibold tracking-[0.14em] uppercase" style={{ color: def.color }}>
              {def.name} <span className="font-mono tracking-normal text-text/80 tabular-nums">{Math.ceil(p.remaining)}s</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Banner() {
  const banner = useGameState((s) => s.banner)
  const [hiddenId, setHiddenId] = useState<number | null>(null)

  useEffect(() => {
    if (!banner) return
    const id = window.setTimeout(() => setHiddenId(banner.id), banner.duration * 1000)
    return () => window.clearTimeout(id)
  }, [banner])

  if (!banner || hiddenId === banner.id) return null
  const exit = { animation: `fade 0.35s ease-in ${Math.max(0, banner.duration - 0.35)}s reverse both` }
  if (banner.tone === 'boss' && banner.title === 'WARNING') return <BossCard key={banner.id} banner={banner} exitStyle={exit} />
  return <StandardBanner key={banner.id} banner={banner} exitStyle={exit} />
}

const BANNER_TONE: Record<BannerData['tone'], { title: string; sub: string; line: string; tag: string }> = {
  info: { title: 'text-white glow-soft-cyan', sub: 'text-cyan-soft', line: 'bg-cyan', tag: 'Incoming' },
  success: { title: 'text-white glow-soft-mint', sub: 'text-mint', line: 'bg-mint', tag: 'Sector secured' },
  danger: { title: 'text-[#ffd6e6] glow-soft-magenta', sub: 'text-[#ff9ccb]', line: 'bg-magenta', tag: 'Alert' },
  boss: { title: 'text-[#ffd6e6] glow-soft-magenta', sub: 'text-[#ff9ccb]', line: 'bg-magenta', tag: 'Threat escalation' },
}

/** Wave and phase notices: high in the frame, short, never over the operative. */
function StandardBanner({ banner, exitStyle }: { banner: BannerData; exitStyle: React.CSSProperties }) {
  const tone = BANNER_TONE[banner.tone]
  const flawless = banner.subtitle?.includes('FLAWLESS')
  const subtitle = flawless ? banner.subtitle?.replace(' · FLAWLESS', '') : banner.subtitle
  return (
    <div className="hud-banner absolute inset-x-0 flex flex-col items-center px-4 text-center" style={exitStyle} role="status">
      <div className="animate-banner flex items-center gap-3 text-caption tracking-[0.42em] uppercase">
        <span className={`h-px w-10 ${tone.line}`} />
        <span className={tone.sub}>{tone.tag}</span>
        <span className={`h-px w-10 ${tone.line}`} />
      </div>
      <div className={`banner-title animate-banner mt-2 text-[clamp(1.5rem,min(4.5vw,7.5vh),3.25rem)] leading-none font-extrabold tracking-[0.16em] short:text-[clamp(1.1rem,3vw,1.5rem)] ${tone.title}`}>{banner.title}</div>
      {subtitle && <div className={`animate-rise mt-3 text-label tracking-[0.3em] uppercase ${tone.sub}`}>{subtitle}</div>}
      {flawless && (
        <div className="animate-stamp chamfer-sm mt-3 px-3 py-1 text-label tracking-[0.36em] text-amber uppercase shadow-[inset_0_0_0_1px_rgba(255,195,92,0.7)] short:hidden" style={{ animationDelay: '0.35s' }}>
          Flawless
        </div>
      )}
    </div>
  )
}

/** Boss arrival title card. */
function BossCard({ banner, exitStyle }: { banner: BannerData; exitStyle: React.CSSProperties }) {
  const [name, title] = (banner.subtitle ?? '').split(' — ')
  return (
    <div className="hud-banner hud-banner-boss absolute inset-x-0 flex flex-col items-center px-4 text-center" style={exitStyle} role="status">
      <div className="hazard-tape animate-banner h-1.5 w-[min(80vw,520px)] opacity-70 short:hidden" />
      <div className="animate-banner mt-3 flex items-center gap-3 text-label tracking-[0.5em] text-[#ff9ccb] uppercase">
        <Icon name="skull" className="size-4" />
        Warning
        <Icon name="skull" className="size-4" />
      </div>
      <div
        className="glitch banner-title glow-soft-magenta animate-banner mt-2 text-[clamp(1.75rem,min(6vw,9vh),4rem)] leading-none font-extrabold tracking-[0.14em] text-[#ffe3f0] short:text-[clamp(1.25rem,3.4vw,1.75rem)]"
        data-text={name}
        style={{ animationDelay: '0.12s' }}
      >
        {name}
      </div>
      {title && (
        <div className="animate-rise mt-2.5 text-label tracking-[0.36em] text-[#ff9ccb] uppercase" style={{ animationDelay: '0.3s' }}>
          {title}
        </div>
      )}
      <div className="animate-rise mt-3 flex items-center gap-2 text-caption text-muted uppercase short:hidden" style={{ animationDelay: '0.45s' }}>
        Threat
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="h-1.5 w-4 bg-magenta" style={{ opacity: name.includes('SOVEREIGN') || i < 4 ? 1 : 0.2 }} />
        ))}
      </div>
      <div className="hazard-tape animate-banner mt-3 h-1.5 w-[min(80vw,520px)] opacity-70 short:hidden" />
    </div>
  )
}

const TOAST_TONE = {
  info: { cls: 'text-text shadow-[inset_2px_0_0_var(--color-muted)]', icon: 'info' as const },
  success: { cls: 'text-mint shadow-[inset_2px_0_0_var(--color-mint)]', icon: 'check' as const },
  warning: { cls: 'text-amber shadow-[inset_2px_0_0_var(--color-amber)]', icon: 'info' as const },
  power: { cls: 'text-cyan-soft shadow-[inset_2px_0_0_var(--color-cyan)]', icon: 'energy' as const },
}

function Toasts() {
  const toasts = useGameState((s) => s.toasts)
  return (
    <div className="hud-toasts absolute flex w-[min(70vw,300px)] flex-col items-end gap-1.5" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`hud-plate animate-toast flex items-center gap-2 px-3 py-2 text-caption uppercase ${TOAST_TONE[t.tone].cls}`}>
          <Icon name={TOAST_TONE[t.tone].icon} className="size-3.5 shrink-0" />
          {t.text}
        </div>
      ))}
    </div>
  )
}
