import { useEffect, useRef } from 'react'
import { DIFFICULTY, GAME_VERSION, TOTAL_WAVES } from '../../game/constants'
import { formatScore, formatTime } from '../../game/math'
import { WEAPONS, WEAPON_ORDER } from '../../game/systems/weapons'
import { Badge, Button, KeyCap, Panel, SectionLabel } from '../components/controls'
import { Icon, type IconName } from '../components/Icon'
import { Kicker } from '../components/layout'
import { WeaponEmblem } from '../components/WeaponEmblem'
import { isTouchDevice, useGame, useMenuKeys, useProfile, useRunSave, useSettings } from '../context'

interface Props {
  onPlay: () => void
  onContinue: () => void
  onTutorial: () => void
  onSettings: () => void
  onCredits: () => void
  onReplayIntro: () => void
  /** Menu item to focus on arrival (the one that opened the previous screen). */
  restoreFocus?: string | null
}

export function MainMenu({ onPlay, onContinue, onTutorial, onSettings, onCredits, onReplayIntro, restoreFocus }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const game = useGame()
  const profile = useProfile()
  const save = useRunSave()
  const reduced = useSettings().reducedMotion
  const touch = isTouchDevice()
  const firstTime = profile.runs === 0
  useMenuKeys(ref)

  // Returning from Settings, Credits or the briefing puts focus back where it was.
  useEffect(() => {
    if (!restoreFocus) return
    ref.current?.querySelector<HTMLElement>(`[data-focus-id="${restoreFocus}"]`)?.focus({ preventScroll: true })
  }, [restoreFocus])

  // The arena frames its reactor in the open stage, and the legibility
  // gradients follow the title column. Runs when the layout changes, never per frame.
  useEffect(() => {
    const root = ref.current
    const hero = heroRef.current
    const stage = stageRef.current
    if (!root || !hero || !stage) return
    const update = () => {
      const view = root.getBoundingClientRect()
      const s = stage.getBoundingClientRect()
      if (view.width < 1 || view.height < 1) return
      root.style.setProperty('--stage-x', `${Math.round(s.left + s.width / 2 - view.left)}px`)
      root.style.setProperty('--stage-y', `${Math.round(s.top + s.height / 2 - view.top)}px`)
      root.style.setProperty('--hero-edge', `${Math.round(hero.getBoundingClientRect().right - view.left)}px`)
      game.setMenuStage({ x: (s.left - view.left) / view.width, y: (s.top - view.top) / view.height, w: s.width / view.width, h: s.height / view.height })
    }
    update()
    const observer = new ResizeObserver(update)
    for (const el of [root, hero, stage]) observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [game])

  // Gentle pointer parallax, written straight to CSS variables (no re-renders).
  useEffect(() => {
    const el = ref.current
    if (!el || reduced) return
    const onMove = (e: PointerEvent) => {
      el.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3))
      el.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3))
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [reduced])

  const stagger = (i: number) => ({ animationDelay: `${i * 45}ms` })
  const enter = touch ? undefined : 'Enter'

  return (
    <div ref={ref} className="launcher-shell" data-launcher="">
      <div className="launcher-atmos" aria-hidden="true" />
      <div className="launcher">
        <header className="launcher-top text-caption text-dim uppercase animate-fade">
          <span className="flex items-center gap-2">
            <span className="size-1.5 bg-cyan shadow-[0_0_8px_var(--color-cyan)] animate-pulse-slow" /> Uplink established
          </span>
          <span className="hidden sm:inline">Facility 07 · Containment breach</span>
        </header>

        <section
          ref={heroRef}
          className="launcher-hero transition-transform duration-500 ease-out"
          style={{ transform: 'translate3d(calc(var(--px, 0) * -6px), calc(var(--py, 0) * -4px), 0)' }}
        >
          <Kicker className="animate-rise" tone="cyan">
            Rogue operative
          </Kicker>
          <h1 className="launcher-title mt-[calc(var(--l-rhythm)*0.7)] animate-rise" style={stagger(1)} aria-label="Shadow Protocol">
            <span className="launcher-title-main glitch glitch-once" data-text="SHADOW" data-title-word="" style={{ ['--glitch-at' as string]: '0.55s' }}>
              <span className="launcher-title-fill">SHADOW</span>
            </span>
            <span className="launcher-title-sub" data-title-word="" aria-hidden="true">
              PROTOCOL
            </span>
          </h1>
          <p className="launcher-copy animate-rise" style={stagger(2)}>
            Trapped inside a hostile containment facility. Survive {TOTAL_WAVES} escalating waves, augment your chassis, and shut down the Null
            Sovereign before it shuts down you.
          </p>

          <nav className="launcher-nav animate-rise" style={stagger(3)} aria-label="Main menu">
            {save ? (
              <>
                <Button
                  variant="hero"
                  size="xl"
                  icon="resume"
                  onClick={onContinue}
                  autoFocus={!restoreFocus}
                  hint={enter}
                  focusId="continue"
                  sub={`Wave ${save.wave} of ${TOTAL_WAVES} · ${formatScore(save.score)} pts · ${DIFFICULTY[save.difficulty].label}`}
                >
                  Continue
                </Button>
                <Button size="lg" icon="play" onClick={onPlay} focusId="new-run" sub="Start over with a new loadout">
                  New Run
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="hero"
                  size="xl"
                  icon="play"
                  onClick={onPlay}
                  autoFocus={!restoreFocus}
                  hint={enter}
                  focusId="new-run"
                  sub={firstTime ? 'Pick a loadout, read a short briefing, deploy' : 'Choose a loadout and deploy'}
                >
                  New Run
                </Button>
                <ContinueSlot />
              </>
            )}
            <div className="launcher-subnav chamfer-sm mt-1" role="group" aria-label="More">
              <Button size="sm" variant="ghost" icon="controls" onClick={onTutorial} focusId="tutorial">
                How to Play
              </Button>
              <Button size="sm" variant="ghost" icon="gear" onClick={onSettings} focusId="settings">
                Settings
              </Button>
              <Button size="sm" variant="ghost" icon="credits" onClick={onCredits} focusId="credits">
                Credits
              </Button>
            </div>
          </nav>
        </section>

        {/* Open space where the arena frames its reactor (measured above). */}
        <div ref={stageRef} className="launcher-stage" aria-hidden="true" />

        <aside
          className="launcher-record animate-rise"
          style={{ ...stagger(5), transform: 'translate3d(calc(var(--px, 0) * 5px), calc(var(--py, 0) * 3px), 0)', transition: 'transform 0.5s ease-out' }}
        >
          {firstTime ? <FirstDeployment touch={touch} /> : <OperativeRecord />}
        </aside>

        <footer className="launcher-foot text-caption text-dim uppercase">
          <span className="flex items-center gap-2">
            v{GAME_VERSION}
            <span data-optional="" className="max-sm:hidden">
              · {touch ? 'Touch controls' : 'Best with mouse & keyboard'}
            </span>
          </span>
          <span className="flex items-center gap-5">
            {!touch && (
              <span data-optional="" className="hidden items-center gap-2 md:flex">
                Navigate <KeyCap>↑</KeyCap>
                <KeyCap>↓</KeyCap> · Select <KeyCap>Enter</KeyCap>
              </span>
            )}
            <button
              type="button"
              onClick={onReplayIntro}
              className="flex min-h-11 items-center gap-1.5 uppercase outline-none transition-colors hover:text-cyan-soft focus-visible:text-cyan-soft focus-visible:underline focus-visible:underline-offset-4"
            >
              <Icon name="play" className="size-3.5" /> Replay intro
            </button>
          </span>
        </footer>
      </div>
    </div>
  )
}

/** Continue without a checkpoint: plainly unavailable, still readable. */
function ContinueSlot() {
  return (
    <button type="button" disabled data-focus-id="continue" className="launcher-slot chamfer-sm">
      <Icon name="resume" className="size-[18px] shrink-0 opacity-60" />
      <span className="flex min-w-0 flex-1 flex-col py-1">
        <span className="text-[0.9375rem] font-semibold tracking-[0.14em] text-muted uppercase">Continue</span>
        <span className="mt-1 text-small leading-snug text-dim">Checkpoints save at the start of each wave.</span>
      </span>
      <Badge icon="lock">No save</Badge>
    </button>
  )
}

const STEPS: { title: string; text: string }[] = [
  { title: 'Choose a loadout', text: 'You start with the Pulse Rifle. Three more weapons unlock as you push deeper.' },
  { title: 'Read the briefing', text: 'Controls and field notes in under a minute, shown once before your first deploy.' },
  { title: `Survive ${TOTAL_WAVES} waves`, text: 'Bosses wait at waves 5 and 10. A checkpoint saves at the start of every wave.' },
]

function FirstDeployment({ touch }: { touch: boolean }) {
  return (
    <Panel tone="accent" className="launcher-panel">
      <SectionLabel>First deployment</SectionLabel>
      <ol className="mt-[clamp(0.875rem,0.5rem+1vh,1.25rem)] space-y-[clamp(0.625rem,0.3rem+0.9vh,1rem)]">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="font-mono text-label text-cyan tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            <span>
              <span className="block text-small font-semibold tracking-[0.1em] text-text uppercase">{s.title}</span>
              <span className="mt-0.5 block text-small text-muted">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-[clamp(0.875rem,0.5rem+1vh,1.5rem)] flex flex-wrap gap-x-4 gap-y-2 border-t border-edge pt-4 text-caption text-muted uppercase">
        {touch ? (
          <>
            <span>Left thumb · Move</span>
            <span>Right thumb · Aim &amp; fire</span>
            <span>Dash button · Dodge</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <KeyCap>WASD</KeyCap> Move
            </span>
            <span className="flex items-center gap-1.5">
              <KeyCap>Mouse</KeyCap> Aim &amp; fire
            </span>
            <span className="flex items-center gap-1.5">
              <KeyCap>Space</KeyCap> Dash
            </span>
          </>
        )}
      </div>
    </Panel>
  )
}

function OperativeRecord() {
  const profile = useProfile()
  const unlocked = profile.unlockedWeapons.length
  const nextWeapon = WEAPON_ORDER.find((id) => !profile.unlockedWeapons.includes(id))
  return (
    <Panel className="launcher-panel">
      <SectionLabel>Operative record</SectionLabel>
      <div className="record-headline">
        <div className="min-w-0">
          <div className="text-caption text-muted uppercase">High score</div>
          <div className="record-score mt-1.5">{formatScore(profile.highScore)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-caption text-muted uppercase">Deployments</div>
          <div className="mt-1.5 font-mono text-data text-text tabular-nums">{profile.runs}</div>
        </div>
      </div>
      <dl className="record-grid chamfer-sm">
        <Record icon="target" label="Best wave" value={profile.bestWave ? `${profile.bestWave}/${TOTAL_WAVES}` : '—'} />
        <Record icon="clock" label="Longest run" value={profile.bestTime ? formatTime(profile.bestTime) : '—'} />
        <Record icon="trophy" label="Victories" value={`${profile.victories}`} accent={profile.victories ? 'text-mint' : undefined} />
        <Record icon="skull" label="Hostiles" value={formatScore(profile.totalKills)} />
      </dl>

      <div className="record-section">
        <div className="flex items-center justify-between text-caption text-muted uppercase">
          <span className="flex items-center gap-1.5">
            <Icon name="weapon" className="size-3.5 text-violet" /> Loadouts
          </span>
          <span className="font-mono tracking-normal text-text tabular-nums">
            {unlocked}/{WEAPON_ORDER.length}
          </span>
        </div>
        <ul className="record-loadouts">
          {WEAPON_ORDER.map((id) => {
            const open = profile.unlockedWeapons.includes(id)
            return (
              <li key={id} className="chamfer-sm relative overflow-hidden bg-ink/85 shadow-[inset_0_0_0_1px_var(--color-edge)]">
                <WeaponEmblem id={id} locked={!open} className={`block h-7 w-full ${open ? '' : 'opacity-60'}`} />
                {!open && <Icon name="lock" className="absolute top-1 right-1 size-3 text-dim" />}
                <span className="block h-0.5" style={{ background: open ? WEAPONS[id].color : 'rgba(125,139,179,0.2)' }} />
                <span className="sr-only">
                  {WEAPONS[id].name}: {open ? 'unlocked' : 'locked'}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-[0.75rem] leading-snug text-dim">
          {nextWeapon ? (
            <>
              Next: <span className="text-text">{WEAPONS[nextWeapon].name}</span> · {WEAPONS[nextWeapon].unlockHint}
            </>
          ) : (
            'All loadouts unlocked.'
          )}
        </p>
      </div>

      <div className="record-section flex items-start justify-between gap-3 border-t border-edge/80 pt-[clamp(0.625rem,0.35rem+0.8vh,1rem)]">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-caption text-muted uppercase">
            <Icon name="skull" className="size-3.5 text-magenta" /> Nightmare
          </span>
          <span className="mt-1 block text-[0.75rem] leading-snug text-dim">
            {profile.hardUnlocked ? 'Selectable in the loadout.' : 'Complete the protocol once to unlock.'}
          </span>
        </span>
        {profile.hardUnlocked ? (
          <Badge tone="magenta" icon="check">
            Unlocked
          </Badge>
        ) : (
          <Badge icon="lock">Locked</Badge>
        )}
      </div>
    </Panel>
  )
}

function Record({ icon, label, value, accent }: { icon: IconName; label: string; value: string; accent?: string }) {
  return (
    <div className="record-cell">
      <dt className="flex items-center gap-1.5 text-caption text-dim uppercase">
        <Icon name={icon} className="size-3 shrink-0" />
        {label}
      </dt>
      <dd className={`mt-1 font-mono text-data tabular-nums ${accent ?? 'text-text'}`}>{value}</dd>
    </div>
  )
}
