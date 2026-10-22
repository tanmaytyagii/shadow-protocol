import { useState, type ReactNode } from 'react'
import { resetAllProgress, settingsStore } from '../../game/persistence'
import type { Settings } from '../../game/types'
import { Button, Panel, SectionLabel, Segmented, Slider, Toggle } from '../components/controls'
import { Icon } from '../components/Icon'
import { ActionBar, ScreenHeader, ScreenShell } from '../components/layout'
import { isTouchDevice, useGame, useSettings } from '../context'

function Section({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`chamfer-sm bg-white/[0.02] p-4 shadow-[inset_0_0_0_1px_var(--color-edge)] sm:p-5 ${className}`}>
      <SectionLabel aside={aside}>{title}</SectionLabel>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

export function SettingsScreen({ onBack, inGame }: { onBack: () => void; inGame: boolean }) {
  const game = useGame()
  const settings = useSettings()
  const touch = isTouchDevice()
  const [confirmReset, setConfirmReset] = useState(false)
  const [erased, setErased] = useState(false)

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => settingsStore.set({ ...settingsStore.get(), [key]: value })
  const preview = () => game.audio.play('pickup')

  return (
    <ScreenShell label="Settings" onEscape={confirmReset ? () => setConfirmReset(false) : onBack} width="lg">
      <Panel className="p-4 animate-rise min-[360px]:p-5 sm:p-8">
        <ScreenHeader
          kicker="System config"
          title="Settings"
          aside={inGame ? 'Changes apply immediately; the run stays paused.' : 'Changes apply immediately and are saved on this device.'}
        />

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          <Section title="Audio" aside={settings.muted ? 'Muted' : undefined}>
            <Slider label="Master volume" value={settings.masterVolume} onChange={(v) => set('masterVolume', v)} onCommit={preview} />
            <Slider label="Music" value={settings.musicVolume} onChange={(v) => set('musicVolume', v)} />
            <Slider label="Sound effects" value={settings.sfxVolume} onChange={(v) => set('sfxVolume', v)} onCommit={preview} />
            <Toggle label="Mute all audio" description="Silences everything without changing the levels above." value={settings.muted} onChange={(v) => set('muted', v)} />
          </Section>

          <Section title="Gameplay">
            <Slider label="Screen shake" description="Camera shake and weapon recoil." value={settings.screenShake} onChange={(v) => set('screenShake', v)} />
            <Toggle
              label="Reduce motion"
              description="Removes refraction, zoom punches, camera leans and strobing flashes; screens appear without animation."
              value={settings.reducedMotion}
              onChange={(v) => set('reducedMotion', v)}
            />
            <Toggle label="Damage numbers" description="Floating numbers when you hit enemies." value={settings.damageNumbers} onChange={(v) => set('damageNumbers', v)} />
            <Segmented
              label="Touch controls"
              description={settings.touchControls === 'auto' ? `Auto: ${touch ? 'shown on this device' : 'hidden on this device'}.` : undefined}
              value={settings.touchControls}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
              onChange={(v) => set('touchControls', v)}
            />
          </Section>

          <Section title="Graphics" className="md:col-span-2">
            <Segmented
              label="Quality"
              description="Low drops glow, lighting, trails and ambient detail and renders at 1× resolution. High adds bloom and refraction. Effects also scale down automatically if the device starts dropping frames."
              value={settings.graphics}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
              onChange={(v) => set('graphics', v)}
            />
            <Toggle label="Show FPS counter" description="Frame rate and any automatic quality reduction, at the bottom of the screen." value={settings.showFps} onChange={(v) => set('showFps', v)} />
          </Section>

          {!inGame && (
            <Section title="Data" className="md:col-span-2">
              {confirmReset ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center" role="alertdialog" aria-label="Reset progress" aria-describedby="reset-warning">
                  <p id="reset-warning" className="flex flex-1 items-start gap-2 text-small text-danger-soft">
                    <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                    Erase records, unlocks and your saved run? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    {/* The safe choice takes focus. */}
                    <Button size="sm" variant="ghost" fill={false} autoFocus onClick={() => setConfirmReset(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      fill={false}
                      onClick={() => {
                        resetAllProgress()
                        setConfirmReset(false)
                        setErased(true)
                      }}
                    >
                      Erase everything
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-small text-muted" aria-live="polite">
                    {erased ? 'Progress erased. Settings were kept.' : 'Records, unlocks and the saved run. Settings are kept.'}
                  </p>
                  <Button size="sm" variant="danger" fill={false} icon="restart" onClick={() => setConfirmReset(true)}>
                    Reset progress
                  </Button>
                </div>
              )}
            </Section>
          )}
        </div>

        <ActionBar className="mt-8">
          <div className="sm:w-56">
            <Button variant="primary" icon="back" onClick={onBack} hint={touch ? undefined : 'Esc'} autoFocus>
              Back
            </Button>
          </div>
        </ActionBar>
      </Panel>
    </ScreenShell>
  )
}
