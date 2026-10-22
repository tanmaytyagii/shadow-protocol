import { useEffect, useState } from 'react'
import { DIFFICULTY, TOTAL_WAVES } from '../../game/constants'
import { formatScore, formatTime } from '../../game/math'
import { Badge, Button, Panel, SectionLabel, Stat } from '../components/controls'
import { ActionBar, Kicker, ScreenShell } from '../components/layout'
import { isTouchDevice, useGame, useGameState, useSettings } from '../context'

/** Actions ignore input briefly, so a key still held or mashed from the fight can't restart the run. */
const ARM_MS = 700

/** Eased count-up for headline numbers; instant under reduced motion. */
function useCountUp(target: number, enabled: boolean, delayMs = 500, durationMs = 1200): number {
  const [value, setValue] = useState(enabled ? 0 : target)
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    const start = performance.now() + delayMs
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / durationMs))
      setValue(Math.round(target * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, enabled, delayMs, durationMs])
  return enabled ? value : target
}

export function Results({ onMenu, onNewRun }: { onMenu: () => void; onNewRun: () => void }) {
  const game = useGame()
  const summary = useGameState((s) => s.summary)
  const reduced = useSettings().reducedMotion
  const touch = isTouchDevice()
  const [armed, setArmed] = useState(false)
  const score = useCountUp(summary?.score ?? 0, !reduced)

  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), ARM_MS)
    return () => window.clearTimeout(id)
  }, [])

  if (!summary) return null
  const victory = summary.outcome === 'victory'
  const stagger = (i: number) => ({ animationDelay: `${520 + i * 60}ms` })

  return (
    <ScreenShell label={victory ? 'Protocol complete' : 'Signal lost'} layer="overlay" scrim="soft" width="lg" className="overflow-x-hidden animate-fade">
      {victory && <div className="rays" />}
      {!victory && <div className="pointer-events-none fixed inset-0 z-(--z-screen) animate-crt bg-white" />}

      <header className="relative text-center animate-banner" style={{ animationDelay: victory ? '200ms' : '450ms' }}>
        <Kicker tone={victory ? 'mint' : 'magenta'}>{victory ? 'Core offline · facility unlocked' : 'Operative down'}</Kicker>
        <h2
          className={`glitch mt-3 text-[clamp(2.1rem,7vw,4.25rem)] leading-none font-extrabold tracking-[0.12em] uppercase ${victory ? 'text-white glow-soft-mint' : 'text-[#ffd6e6] glow-soft-magenta'}`}
          data-text={victory ? 'PROTOCOL COMPLETE' : 'SIGNAL LOST'}
        >
          {victory ? 'PROTOCOL COMPLETE' : 'SIGNAL LOST'}
        </h2>
        <p className="mx-auto mt-3 max-w-[54ch] text-body text-muted">
          {victory
            ? `You dismantled the Null Sovereign on ${DIFFICULTY[summary.difficulty].label}.`
            : `Eliminated on wave ${summary.wave} of ${TOTAL_WAVES}. The facility keeps its secrets, for now.`}
        </p>
      </header>

      <Panel live tone={victory ? 'success' : 'danger'} className="relative mt-8 p-4 animate-rise min-[360px]:p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-caption text-muted uppercase">Final score</div>
            <div className="mt-1 font-mono text-[clamp(2.25rem,5vw,3.25rem)] leading-none font-bold text-white tabular-nums">{formatScore(score)}</div>
          </div>
          {summary.newRecord ? (
            <span className="animate-stamp" style={{ animationDelay: '1.5s' }}>
              <Badge tone="amber" icon="trophy" className="h-8! px-3!">
                New record
              </Badge>
            </span>
          ) : (
            <span className="text-caption text-muted uppercase">
              Best <span className="font-mono tracking-normal text-text tabular-nums">{formatScore(summary.bestScore)}</span>
            </span>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            <Stat key="t" label="Time survived" value={formatTime(summary.time)} icon="clock" />,
            <Stat key="k" label="Enemies defeated" value={formatScore(summary.kills)} icon="skull" />,
            <Stat key="w" label="Wave reached" value={`${summary.wave}/${TOTAL_WAVES}`} icon="target" />,
            <Stat key="l" label="Level" value={summary.level} accent="text-violet-soft" icon="xp" />,
            <Stat key="a" label="Accuracy" value={`${Math.round(summary.accuracy * 100)}%`} icon="crit" />,
            <Stat key="d" label="Damage dealt" value={formatScore(summary.damageDealt)} icon="damage" />,
            <Stat key="b" label="Bosses" value={summary.bossesDefeated} icon="trophy" accent={summary.bossesDefeated ? 'text-[#ff9ccb]' : undefined} />,
            <Stat key="u" label="Augments" value={summary.upgrades.reduce((n, u) => n + u.stacks, 0)} icon="chip" />,
          ].map((node, i) => (
            <div key={i} className="animate-rise" style={stagger(i)}>
              {node}
            </div>
          ))}
        </div>

        {summary.newUnlocks.length > 0 && (
          <>
            <SectionLabel className="mt-6">Unlocked</SectionLabel>
            <ul className="mt-3 flex flex-wrap gap-2">
              {summary.newUnlocks.map((u, i) => (
                <li key={u} className="animate-stamp" style={{ animationDelay: `${1.2 + i * 0.15}s` }}>
                  <Badge tone="mint" icon="check" className="h-8! px-3!">
                    {u}
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="animate-rise" style={{ animationDelay: `${ARM_MS - 80}ms` }}>
          <ActionBar className="mt-8">
            <div className="sm:w-56">
              <Button icon="home" onClick={onMenu} disabled={!armed}>
                Main Menu
              </Button>
            </div>
            <div className="sm:w-64">
              {victory ? (
                <Button variant="primary" size="lg" icon="play" onClick={onNewRun} autoFocus disabled={!armed} hint={touch ? undefined : 'Enter'}>
                  New Run
                </Button>
              ) : (
                <Button variant="primary" size="lg" icon="restart" onClick={() => game.restart()} autoFocus disabled={!armed} hint={touch ? undefined : 'Enter'}>
                  Retry
                </Button>
              )}
            </div>
          </ActionBar>
        </div>
      </Panel>
    </ScreenShell>
  )
}
