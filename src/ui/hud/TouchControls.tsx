import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { Game } from '../../game/Game'
import { Icon } from '../components/Icon'
import { useGame } from '../context'

const STICK_RADIUS = 56

type Side = 'left' | 'right'

interface Stick {
  id: number | null
  ox: number
  oy: number
  base: RefObject<HTMLDivElement | null>
  knob: RefObject<HTMLDivElement | null>
}

function showStick(s: Stick, x: number, y: number, visible: boolean): void {
  const base = s.base.current
  const knob = s.knob.current
  if (!base || !knob) return
  base.style.opacity = visible ? '1' : '0'
  base.style.transform = `translate(${x - STICK_RADIUS}px, ${y - STICK_RADIUS}px)`
  knob.style.transform = 'translate(0px, 0px)'
}

function stickDown(game: Game, side: Side, s: Stick, e: ReactPointerEvent<HTMLDivElement>): void {
  if (s.id !== null) return
  e.currentTarget.setPointerCapture(e.pointerId)
  s.id = e.pointerId
  s.ox = e.clientX
  s.oy = e.clientY
  const rect = e.currentTarget.parentElement?.getBoundingClientRect()
  showStick(s, e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0), true)
  if (side === 'right') game.input.setTouchAim(Math.cos(game.player.aim), Math.sin(game.player.aim), true)
}

function stickMove(game: Game, side: Side, s: Stick, e: ReactPointerEvent<HTMLDivElement>): void {
  if (s.id !== e.pointerId) return
  let dx = e.clientX - s.ox
  let dy = e.clientY - s.oy
  const d = Math.hypot(dx, dy)
  if (d > STICK_RADIUS) {
    dx = (dx / d) * STICK_RADIUS
    dy = (dy / d) * STICK_RADIUS
  }
  const knob = s.knob.current
  if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`
  const nx = dx / STICK_RADIUS
  const ny = dy / STICK_RADIUS
  if (side === 'left') {
    // Small dead zone so resting thumbs don't drift.
    if (Math.hypot(nx, ny) < 0.15) game.input.setTouchMove(0, 0)
    else game.input.setTouchMove(nx, ny)
  } else if (d > 6) {
    game.input.setTouchAim(nx, ny, true)
  }
}

function stickUp(game: Game, side: Side, s: Stick, e: ReactPointerEvent<HTMLDivElement>): void {
  if (s.id !== e.pointerId) return
  s.id = null
  showStick(s, 0, 0, false)
  if (side === 'left') game.input.setTouchMove(0, 0)
  else game.input.setTouchAim(0, 0, false)
}

/**
 * Twin-stick virtual controls: left half moves, right half aims and fires.
 * Knob positions are written straight to the DOM to avoid React re-renders.
 */
export function TouchControls() {
  const game = useGame()
  const leftBase = useRef<HTMLDivElement>(null)
  const leftKnob = useRef<HTMLDivElement>(null)
  const rightBase = useRef<HTMLDivElement>(null)
  const rightKnob = useRef<HTMLDivElement>(null)
  const left = useRef<Stick>({ id: null, ox: 0, oy: 0, base: leftBase, knob: leftKnob })
  const right = useRef<Stick>({ id: null, ox: 0, oy: 0, base: rightBase, knob: rightKnob })

  return (
    <div className="absolute inset-0 z-(--z-touch) touch-none select-none">
      <div
        className="absolute inset-y-0 left-0 w-1/2"
        onPointerDown={(e) => stickDown(game, 'left', left.current, e)}
        onPointerMove={(e) => stickMove(game, 'left', left.current, e)}
        onPointerUp={(e) => stickUp(game, 'left', left.current, e)}
        onPointerCancel={(e) => stickUp(game, 'left', left.current, e)}
      />
      <div
        className="absolute inset-y-0 right-0 w-1/2"
        onPointerDown={(e) => stickDown(game, 'right', right.current, e)}
        onPointerMove={(e) => stickMove(game, 'right', right.current, e)}
        onPointerUp={(e) => stickUp(game, 'right', right.current, e)}
        onPointerCancel={(e) => stickUp(game, 'right', right.current, e)}
      />

      <div
        ref={leftBase}
        className="pointer-events-none absolute top-0 left-0 opacity-0 transition-opacity duration-100"
        style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
      >
        <div className="absolute inset-0 rounded-full border border-cyan/40 bg-cyan/5" />
        <div ref={leftKnob} className="absolute top-1/2 left-1/2 -mt-6 -ml-6 size-12 rounded-full border border-cyan/70 bg-cyan/20" />
      </div>
      <div
        ref={rightBase}
        className="pointer-events-none absolute top-0 left-0 opacity-0 transition-opacity duration-100"
        style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
      >
        <div className="absolute inset-0 rounded-full border border-violet/45 bg-violet/5" />
        <div ref={rightKnob} className="absolute top-1/2 left-1/2 -mt-6 -ml-6 size-12 rounded-full border border-violet/75 bg-violet/20" />
      </div>

      <div className="pointer-events-none absolute right-[max(1rem,var(--safe-right))] bottom-[max(1.25rem,var(--safe-bottom))] flex flex-col items-end gap-3">
        <TouchButton label="Swap" icon="weapon" onDown={() => game.input.queueTouchSwap()} size="size-12" />
        <div className="flex items-end gap-3">
          <TouchButton
            label="Boost"
            icon="energy"
            onDown={() => game.input.setTouchBoost(true)}
            onUp={() => game.input.setTouchBoost(false)}
            size="size-14"
          />
          <TouchButton label="Dash" icon="dash" onDown={() => game.input.queueTouchDash()} size="size-[72px]" accent />
        </div>
      </div>
      <button
        type="button"
        aria-label="Pause"
        onPointerDown={(e) => {
          e.stopPropagation()
          game.input.queueTouchPause()
        }}
        className="absolute top-[max(0.75rem,var(--safe-top))] right-[max(0.75rem,var(--safe-right))] grid size-11 place-items-center chamfer-sm bg-ink/80 text-cyan-soft shadow-[inset_0_0_0_1px_rgba(62,242,255,0.45)] active:scale-95"
      >
        <Icon name="pause" className="size-4" />
      </button>
      <p className="pointer-events-none absolute bottom-[max(0.75rem,var(--safe-bottom))] left-1/2 hidden -translate-x-1/2 text-caption whitespace-nowrap text-dim uppercase md:block">
        Left: move · Right: aim &amp; fire
      </p>
    </div>
  )
}

function TouchButton({
  label,
  icon,
  onDown,
  onUp,
  size,
  accent,
}: {
  label: string
  icon: 'dash' | 'energy' | 'weapon'
  onDown: () => void
  onUp?: () => void
  size: string
  accent?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        onDown()
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        onUp?.()
      }}
      onPointerCancel={() => onUp?.()}
      className={`pointer-events-auto grid ${size} place-items-center rounded-full border transition-transform duration-(--dur-press) active:scale-95 ${
        accent ? 'border-cyan/70 bg-cyan/25 text-cyan-soft' : icon === 'energy' ? 'border-violet/60 bg-ink/70 text-violet-soft' : 'border-edge-strong bg-ink/70 text-text'
      }`}
    >
      <span className="flex flex-col items-center">
        <Icon name={icon} className="size-5" />
        <span className="mt-0.5 text-[0.5625rem] font-bold tracking-[0.16em] uppercase">{label}</span>
      </span>
    </button>
  )
}
