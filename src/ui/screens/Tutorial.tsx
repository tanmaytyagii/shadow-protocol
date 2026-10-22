import type { ReactNode } from 'react'
import { COLORS } from '../../game/constants'
import { Button, KeyCap, Panel, SectionLabel } from '../components/controls'
import { Icon, type IconName } from '../components/Icon'
import { ActionBar, ScreenHeader, ScreenShell } from '../components/layout'
import { isTouchDevice } from '../context'

interface Props {
  onDone: () => void
  deploying: boolean
  onBack: () => void
}

const KEY_CONTROLS: { keys: ReactNode; title: string; text: string; icon: IconName }[] = [
  {
    keys: (
      <span className="grid grid-cols-3 gap-1">
        <span />
        <KeyCap>W</KeyCap>
        <span />
        <KeyCap>A</KeyCap>
        <KeyCap>S</KeyCap>
        <KeyCap>D</KeyCap>
      </span>
    ),
    title: 'Move',
    text: 'WASD or arrow keys.',
    icon: 'speed',
  },
  { keys: <KeyCap>Mouse</KeyCap>, title: 'Aim & fire', text: 'Aim with the cursor. Hold left click to fire.', icon: 'target' },
  { keys: <KeyCap>Space</KeyCap>, title: 'Dash', text: 'Brief invulnerability. Phase straight through bullets, lasers and enemies.', icon: 'dash' },
  { keys: <KeyCap>Shift</KeyCap>, title: 'Boost', text: 'Hold to sprint. Drains energy, which regenerates.', icon: 'energy' },
  {
    keys: (
      <span className="flex gap-1">
        <KeyCap>1–4</KeyCap>
        <KeyCap>Q</KeyCap>
      </span>
    ),
    title: 'Weapons',
    text: 'Select a slot, or cycle with Q / E / mouse wheel.',
    icon: 'weapon',
  },
  { keys: <KeyCap>Esc</KeyCap>, title: 'Pause', text: 'Pause, change settings or restart. The game auto-pauses if it loses focus.', icon: 'pause' },
]

const TOUCH_CONTROLS: { title: string; text: string; icon: IconName }[] = [
  { title: 'Left thumb', text: 'Drag anywhere on the left half to move.', icon: 'speed' },
  { title: 'Right thumb', text: 'Drag on the right half to aim. You fire while aiming.', icon: 'target' },
  { title: 'Dash button', text: 'Brief invulnerability: dash through bullets and enemies.', icon: 'dash' },
  { title: 'Boost / swap', text: 'Hold boost to sprint. Tap swap to cycle weapons.', icon: 'energy' },
]

const FIELD_NOTES: { color: string; title: string; text: string }[] = [
  { color: '#b48cff', title: 'Data shards', text: 'Dropped by every kill. Fill the XP bar to choose an augment.' },
  { color: COLORS.mint, title: 'Repair kit', text: 'Restores 30 hull. More common when you are hurt.' },
  { color: COLORS.amber, title: 'Ammo cache', text: 'Refills special weapons. The Pulse Rifle never runs dry.' },
  { color: COLORS.white, title: 'Upgrade chip', text: 'Rare. Grants a free augment with better odds.' },
  { color: COLORS.magenta, title: 'Power-ups', text: 'Overdrive, Aegis, Amplifier and Chrono Field — short, powerful buffs.' },
  { color: COLORS.cyan, title: 'Shields', text: 'Absorb damage first and recharge after 3s without being hit.' },
]

export function Tutorial({ onDone, deploying, onBack }: Props) {
  const touch = isTouchDevice()
  return (
    // Escape always backs out; deploying is an explicit choice.
    <ScreenShell label="Briefing" onEscape={onBack} width="lg">
      <Panel className="p-4 animate-rise min-[360px]:p-5 sm:p-8">
        <ScreenHeader
          kicker="Briefing"
          title="How to survive"
          description="Waves of hostiles pour from the magenta portals. Clear all ten waves; waves 5 and 10 are boss encounters. Telegraphed attacks flash before they fire, so watch for dashed lines and rings."
        />

        <SectionLabel className="mt-8" aside={touch ? 'Touch' : 'Keyboard & mouse'}>
          Controls
        </SectionLabel>
        <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${touch ? '' : 'lg:grid-cols-3'}`}>
          {touch
            ? TOUCH_CONTROLS.map((c) => <ControlCard key={c.title} icon={c.icon} title={c.title} text={c.text} />)
            : KEY_CONTROLS.map((c) => <ControlCard key={c.title} icon={c.icon} title={c.title} text={c.text} keys={c.keys} />)}
        </div>

        <SectionLabel className="mt-8">Field notes</SectionLabel>
        <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELD_NOTES.map((n) => (
            <div key={n.title} className="flex gap-3">
              <span className="mt-1.5 size-2.5 shrink-0 rotate-45" style={{ background: n.color }} />
              <div>
                <div className="text-label text-text uppercase">{n.title}</div>
                <div className="mt-0.5 text-small text-muted">{n.text}</div>
              </div>
            </div>
          ))}
        </div>

        <ActionBar className="mt-8">
          <div className="sm:w-48">
            <Button variant="ghost" icon="back" onClick={onBack} hint={touch ? undefined : 'Esc'}>
              {deploying ? 'Loadout' : 'Back'}
            </Button>
          </div>
          {deploying && (
            <div className="sm:min-w-72">
              <Button variant="primary" icon="play" onClick={onDone} autoFocus className="max-[359px]:tracking-[0.06em] sm:min-h-14 sm:px-5 sm:text-[0.9375rem]">
                Understood — deploy
              </Button>
            </div>
          )}
        </ActionBar>
      </Panel>
    </ScreenShell>
  )
}

function ControlCard({ icon, title, text, keys }: { icon: IconName; title: string; text: string; keys?: ReactNode }) {
  return (
    <div className="chamfer-sm flex items-start gap-4 bg-white/[0.025] p-4 shadow-[inset_0_0_0_1px_var(--color-edge)]">
      <span className="grid size-10 shrink-0 place-items-center chamfer-sm bg-ink text-cyan shadow-[inset_0_0_0_1px_rgba(62,242,255,0.3)]">
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-label text-white uppercase">{title}</span>
          {keys}
        </div>
        <p className="mt-1 text-small text-muted">{text}</p>
      </div>
    </div>
  )
}
