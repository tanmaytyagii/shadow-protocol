import { useCallback, useEffect, useRef, useState } from 'react'
import { DIFFICULTY } from '../../game/constants'
import { formatScore, formatTime } from '../../game/math'
import { UPGRADES } from '../../game/systems/upgrades'
import type { UpgradeId } from '../../game/types'
import { Button, Panel, SectionLabel, Stat } from '../components/controls'
import { Icon } from '../components/Icon'
import { Kicker, ScreenShell } from '../components/layout'
import { isTouchDevice, useGame, useGameState } from '../context'

type Confirm = null | 'restart' | 'quit'

const CONFIRM: Record<Exclude<Confirm, null>, { text: string; action: string }> = {
  restart: { text: 'Restart from wave 1? Progress in this run will be lost.', action: 'Yes, restart' },
  quit: { text: 'Return to the main menu? You can continue from the last wave checkpoint.', action: 'Yes, quit' },
}

interface Props {
  onSettings: () => void
  onQuit: () => void
  /** Called when play continues (resume or restart), so a remembered focus target is dropped. */
  onLeave?: () => void
  restoreFocus?: string | null
}

export function PauseMenu({ onSettings, onQuit, onLeave, restoreFocus }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const game = useGame()
  const hud = useGameState((s) => s.hud)
  const touch = isTouchDevice()
  const [confirm, setConfirm] = useState<Confirm>(null)
  const resume = useCallback(() => {
    game.resume()
    onLeave?.()
  }, [game, onLeave])
  const restart = useCallback(() => {
    game.restart()
    onLeave?.()
  }, [game, onLeave])
  const cancel = useCallback(() => setConfirm(null), [])

  // Back from Settings: focus returns to the Settings button.
  useEffect(() => {
    if (restoreFocus) ref.current?.querySelector<HTMLElement>(`[data-focus-id="${restoreFocus}"]`)?.focus({ preventScroll: true })
  }, [restoreFocus])

  const upgrades = (Object.entries(game.player.upgrades) as [UpgradeId, number][]).filter(([, n]) => n > 0)

  return (
    <ScreenShell label="Paused" onEscape={confirm ? cancel : resume} layer="overlay" scrim="soft" width="lg" className="animate-fade">
      <div ref={ref}>
        <Panel className="p-4 animate-rise min-[360px]:p-5 sm:p-8">
          <div className="grid gap-8 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <div>
              <Kicker>Signal held</Kicker>
              <h2 className="mt-2 text-title text-white uppercase">Paused</h2>
              {confirm ? (
                <div className="mt-7 space-y-3" role="alertdialog" aria-label={CONFIRM[confirm].action} aria-describedby="pause-confirm-text">
                  <p id="pause-confirm-text" className="flex items-start gap-2 text-small text-text">
                    <Icon name="info" className="mt-0.5 size-4 shrink-0 text-amber" />
                    {CONFIRM[confirm].text}
                  </p>
                  {/* Destructive choices never take the default focus: Enter on arrival cancels. */}
                  <Button variant="ghost" icon="back" onClick={cancel} hint={touch ? undefined : 'Esc'} autoFocus>
                    Cancel
                  </Button>
                  <Button variant="danger" icon={confirm === 'restart' ? 'restart' : 'home'} onClick={confirm === 'restart' ? restart : onQuit}>
                    {CONFIRM[confirm].action}
                  </Button>
                </div>
              ) : (
                <nav className="mt-7 flex flex-col gap-2.5" aria-label="Pause menu">
                  <Button variant="primary" size="lg" icon="resume" onClick={resume} hint={touch ? undefined : 'Esc'} autoFocus={!restoreFocus} focusId="pause-resume">
                    Resume
                  </Button>
                  <Button icon="restart" onClick={() => setConfirm('restart')} focusId="pause-restart">
                    Restart
                  </Button>
                  <Button icon="gear" onClick={onSettings} focusId="pause-settings">
                    Settings
                  </Button>
                  <Button icon="home" onClick={() => setConfirm('quit')} focusId="pause-quit">
                    Main Menu
                  </Button>
                </nav>
              )}
            </div>

            <div className="min-w-0">
              <SectionLabel aside={DIFFICULTY[hud.difficulty].label}>Run status</SectionLabel>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="Wave" value={`${hud.wave}/${hud.totalWaves}`} icon="target" />
                <Stat label="Score" value={formatScore(hud.score)} accent="text-cyan-soft" icon="trophy" />
                <Stat label="Time" value={formatTime(hud.time)} icon="clock" />
                <Stat label="Kills" value={hud.kills} icon="skull" />
                <Stat label="Level" value={hud.level} accent="text-violet-soft" icon="xp" />
                <Stat label="Hull" value={`${Math.ceil(hud.hp)}/${hud.maxHp}`} accent={hud.lowHealth ? 'text-danger-soft' : 'text-mint'} icon="health" />
              </div>
              <SectionLabel className="mt-7" aside={upgrades.length ? `${upgrades.reduce((n, [, s]) => n + s, 0)} installed` : undefined}>
                Augments
              </SectionLabel>
              {upgrades.length === 0 ? (
                <p className="mt-3 text-small text-muted">None yet. Collect data shards to level up.</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {upgrades.map(([id, n]) => (
                    <li key={id} className="chamfer-sm flex min-h-8 items-center gap-2 bg-white/[0.04] px-2.5 py-1.5 text-small text-text shadow-[inset_0_0_0_1px_var(--color-edge)]">
                      <Icon name={UPGRADES[id].icon} className="size-3.5 text-cyan" />
                      {UPGRADES[id].name}
                      {UPGRADES[id].maxStacks > 1 && (
                        <span className="font-mono text-[0.75rem] text-violet-soft tabular-nums">
                          {n}/{UPGRADES[id].maxStacks}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </ScreenShell>
  )
}
