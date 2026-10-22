import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { GAME_VERSION } from '../../game/constants'
import { INTRO } from '../../game/intro'
import { profileStore } from '../../game/persistence'
import { Button, KeyCap } from '../components/controls'
import { isTouchDevice, useGame, useSettings } from '../context'

interface Props {
  /** Called after the sequence has faded out; the app then shows the main menu. */
  onDone: () => void
}

type Status = 'ok' | 'warn' | 'fail'

const BOOT: { name: string; value: string; status: Status }[] = [
  { name: 'facility map', value: 'sublevel 9', status: 'ok' },
  { name: 'neural uplink', value: 'handshake', status: 'ok' },
  { name: 'operative chassis', value: 'online', status: 'ok' },
  { name: 'containment field', value: '12%', status: 'fail' },
  { name: 'hostile signatures', value: '1,204', status: 'warn' },
  { name: 'reactor core', value: 'ignition', status: 'ok' },
]

const STATUS: Record<Status, { label: string; className: string }> = {
  ok: { label: ' OK ', className: 'text-mint' },
  warn: { label: 'WARN', className: 'text-amber' },
  fail: { label: 'FAIL', className: 'text-magenta' },
}

const line = (name: string, value: string) => `${name} `.padEnd(21, '.') + ` ${value}`

/** Typing speed of the boot log, per character (ms). */
const TYPE_MS = 12

const at = (seconds: number, extra: CSSProperties = {}): CSSProperties => ({ animationDelay: `${seconds}s`, ...extra })

function markSeen(): void {
  if (!profileStore.get().introSeen) profileStore.update((p) => ({ ...p, introSeen: true }))
}

/**
 * Opening cinematic: boot log, title reveal and the camera's pull-back from
 * the reactor (driven by the engine's IntroDirector). Skippable at any point;
 * players who have seen it go straight to the menu on later visits.
 */
export function IntroSequence({ onDone }: Props) {
  // Hold the sequence until the tab is visible, so a game opened in a
  // background tab doesn't play its opening to nobody.
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => {
    if (visible) return
    const onChange = () => {
      if (!document.hidden) setVisible(true)
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [visible])

  if (!visible) return <div className="absolute inset-0 z-(--z-screen) bg-void" />
  return <Sequence onDone={onDone} />
}

function Sequence({ onDone }: Props) {
  const game = useGame()
  const reduced = useSettings().reducedMotion
  const [ready, setReady] = useState(reduced)
  const [leaving, setLeaving] = useState(false)
  const done = useRef(false)
  const exitTimer = useRef(0)
  const touch = isTouchDevice()

  // The canvas side: camera path, power-up and cues.
  useEffect(() => {
    game.startIntro(reduced)
    return () => game.endIntro()
  }, [game, reduced])

  useEffect(() => {
    if (ready) return
    const id = window.setTimeout(() => setReady(true), INTRO.ready * 1000)
    return () => window.clearTimeout(id)
  }, [ready])

  // Watching up to the start prompt counts as seen.
  useEffect(() => {
    if (ready) markSeen()
  }, [ready])

  useEffect(() => () => window.clearTimeout(exitTimer.current), [])

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    markSeen()
    game.endIntro()
    setLeaving(true)
    exitTimer.current = window.setTimeout(onDone, reduced ? 0 : 420)
  }, [game, onDone, reduced])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  const title = reduced ? 0 : INTRO.title

  return (
    <section
      aria-label="Opening sequence"
      data-intro={reduced ? 'reduced' : 'full'}
      className={`absolute inset-0 z-(--z-screen) overflow-hidden ${leaving && !reduced ? 'intro-leaving' : ''}`}
    >
      {!reduced && (
        <>
          <div className="letterbox top-0 z-10" style={{ transform: ready ? 'translateY(-100%)' : 'translateY(0)' }} />
          <div className="letterbox bottom-0 z-10" style={{ transform: ready ? 'translateY(100%)' : 'translateY(0)' }} />
        </>
      )}

      {!ready && (
        <div className="absolute top-[calc(9vh+0.75rem)] right-4 z-20 sm:right-8" style={{ animation: 'intro-in 0.5s ease-out 0.3s both' }}>
          <Button variant="ghost" size="sm" hint={touch ? undefined : 'Esc'} onClick={finish} menuItem={false}>
            Skip intro
          </Button>
        </div>
      )}

      {reduced ? <BootSummary /> : <BootLog />}

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
        <div className="intro-title relative">
          <p className="intro-step font-mono text-[11px] tracking-[0.42em] text-magenta sm:text-xs" style={at(title)}>
            // FACILITY 07<span className="hidden sm:inline"> · CONTAINMENT BREACH</span>
          </p>
          <h1 className="mt-4 leading-[0.85] font-extrabold">
            <span className="sr-only">Shadow Protocol</span>
            <span
              aria-hidden
              className={`glitch block text-[clamp(2.6rem,min(12vw,17vh),8rem)] tracking-[0.04em] text-white text-glow-cyan ${reduced ? '' : 'glitch-once'}`}
              data-text="SHADOW"
              style={{ ['--glitch-at' as string]: `${title + 1.2}s` }}
            >
              <Decode text="SHADOW" startMs={(title + 0.15) * 1000} durMs={1100} enabled={!reduced} />
            </span>
            <span
              aria-hidden
              className={`mt-3 block text-[clamp(1rem,min(4.4vw,6vh),2.3rem)] font-semibold text-cyan ${reduced ? 'tracking-[0.62em] pl-[0.62em]' : 'intro-track'}`}
              style={at(title + 0.55)}
            >
              PROTOCOL
            </span>
          </h1>
          <div className="intro-rule mx-auto mt-6 h-px w-[min(22rem,70vw)] bg-linear-to-r from-transparent via-cyan to-transparent" style={at(title + 1.3)} />
          <p className="intro-step mt-5 text-sm tracking-[0.08em] text-muted" style={at(title + 2.1)}>
            Ten waves stand between you and the core.
          </p>
          {!reduced && <div className="intro-scan" style={at(title + 1)} />}

          <div className="pointer-events-auto mt-9 flex min-h-[5.5rem] flex-col items-center gap-3">
            {ready && (
              <div className="flex flex-col items-center gap-3" style={{ animation: 'intro-in 0.6s ease-out both' }}>
                <div className="w-64">
                  <Button variant="primary" size="lg" icon="play" onClick={finish} autoFocus menuItem={false}>
                    Start Game
                  </Button>
                </div>
                {!touch && (
                  <p className="text-[11px] tracking-[0.3em] text-dim uppercase">
                    Press <KeyCap>Enter</KeyCap>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Full-motion boot log: lines type out, then the bus comes up at the surge. */
function BootLog() {
  const { lines, surge } = INTRO
  return (
    <div
      aria-hidden
      className="intro-boot pointer-events-none absolute bottom-[calc(9vh+1.25rem)] left-5 font-mono text-[11px] leading-[1.7] text-muted sm:left-10 sm:text-xs"
      style={at(surge + 0.35)}
    >
      <div className="intro-tear" style={at(surge)}>
        <p className="intro-step text-dim" style={at(0.15)}>
          SHADOW//OS {GAME_VERSION} · secure boot
        </p>
        {BOOT.map((b, i) => {
          const text = line(b.name, b.value)
          const typeEnd = lines[i] + (text.length * TYPE_MS) / 1000
          return (
            <p key={b.name} className="flex gap-3 whitespace-pre">
              <span className="intro-step text-cyan/70" style={at(lines[i])}>
                &gt;
              </span>
              <span className="intro-type text-text/85" style={at(lines[i], { ['--n' as string]: text.length })}>
                {text}
              </span>
              <span className={`intro-step ${STATUS[b.status].className}`} style={at(typeEnd + 0.05)}>
                [{STATUS[b.status].label}]
              </span>
            </p>
          )
        })}
        <div className="mt-3 w-[min(26rem,80vw)]">
          <div className="relative h-4 text-[10px] tracking-[0.3em] uppercase">
            <span className="intro-swap-out absolute left-0 text-dim" style={at(surge)}>
              System initialization
            </span>
            <span className="intro-swap-in absolute left-0 text-cyan" style={at(surge)}>
              Power restored
            </span>
          </div>
          <div className="mt-1 h-px bg-edge">
            <div className="intro-bar h-full bg-cyan" style={{ animationDelay: `${lines[0]}s`, animationDuration: `${surge - lines[0]}s` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Reduced motion: the same information as a still panel. */
function BootSummary() {
  return (
    <div aria-hidden className="pointer-events-none absolute bottom-6 left-5 font-mono text-[11px] leading-[1.7] text-muted sm:left-10 sm:text-xs">
      <p className="text-dim">SHADOW//OS {GAME_VERSION} · secure boot</p>
      {BOOT.map((b) => (
        <p key={b.name} className="flex gap-3 whitespace-pre">
          <span className="text-cyan/70">&gt;</span>
          <span className="text-text/85">{line(b.name, b.value)}</span>
          <span className={STATUS[b.status].className}>[{STATUS[b.status].label}]</span>
        </p>
      ))}
      <p className="mt-2 text-[10px] tracking-[0.3em] text-cyan uppercase">Power restored</p>
    </div>
  )
}

const GLYPHS = '#%&@$*+=/<>?!0123456789ABCDEFXZ'

/**
 * Letters scramble, then lock in left to right. Each glyph sits over its final
 * letter's box, so the word never reflows while it decodes.
 */
function Decode({ text, startMs, durMs, enabled }: { text: string; startMs: number; durMs: number; enabled: boolean }) {
  const [t, setT] = useState(enabled ? -1 : durMs)
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    let last = 0
    const t0 = performance.now() + startMs
    const tick = (now: number) => {
      const elapsed = now - t0
      if (elapsed >= durMs) {
        setT(durMs)
        return
      }
      if (now - last > 45) {
        last = now
        setT(elapsed)
      }
      raf = requestAnimationFrame(tick)
    }
    const id = window.setTimeout(() => (raf = requestAnimationFrame(tick)), startMs)
    return () => {
      window.clearTimeout(id)
      cancelAnimationFrame(raf)
    }
  }, [enabled, startMs, durMs])

  const n = text.length
  return (
    <>
      {text.split('').map((ch, i) => {
        const resolved = t >= (durMs * (i + 1)) / n
        const glyph = t < 0 ? '' : GLYPHS[(Math.floor(t / 45) * 7 + i * 13) % GLYPHS.length]
        return (
          <span key={i} className="relative inline-block">
            <span className={resolved ? '' : 'invisible'}>{ch}</span>
            {!resolved && <span className="absolute inset-0 text-center text-cyan/70">{glyph}</span>}
          </span>
        )
      })}
    </>
  )
}
