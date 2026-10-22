import { GAME_VERSION } from '../../game/constants'
import { Button, Panel, SectionLabel } from '../components/controls'
import { ActionBar, ScreenHeader, ScreenShell } from '../components/layout'
import { isTouchDevice } from '../context'

const ROWS: [string, string][] = [
  ['Game design & development', 'Tanmay Tyagi'],
  ['Engine', 'Custom TypeScript + HTML5 Canvas 2D'],
  ['Interface', 'React 19 · Tailwind CSS 4'],
  ['Audio', 'Procedural synthesis via the Web Audio API'],
  ['Visuals', 'Generated at runtime: no image assets'],
  ['Typefaces', 'Oxanium & JetBrains Mono (SIL Open Font License)'],
  ['Tooling', 'Vite · TypeScript · ESLint · Vitest'],
]

export function Credits({ onBack, onReplayIntro }: { onBack: () => void; onReplayIntro: () => void }) {
  const touch = isTouchDevice()
  return (
    <ScreenShell label="Credits" onEscape={onBack} width="md">
      <Panel className="p-4 animate-rise min-[360px]:p-5 sm:p-8">
        <ScreenHeader
          kicker="Credits"
          title="Shadow Protocol"
          description="An original arcade survival shooter. Every sprite, sound and note is made from code."
          aside={<span className="font-mono text-dim">v{GAME_VERSION}</span>}
        />
        <SectionLabel className="mt-8">Production</SectionLabel>
        <dl className="mt-3 divide-y divide-edge/70">
          {ROWS.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <dt className="text-caption text-muted uppercase">{k}</dt>
              <dd className="text-small text-text sm:text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-small text-dim">Thank you for playing. Stay sharp, operative. The facility is always listening.</p>
        <ActionBar className="mt-8">
          <div className="sm:w-52">
            <Button icon="play" onClick={onReplayIntro}>
              Replay intro
            </Button>
          </div>
          <div className="sm:w-52">
            <Button variant="primary" icon="back" onClick={onBack} hint={touch ? undefined : 'Esc'} autoFocus>
              Back
            </Button>
          </div>
        </ActionBar>
      </Panel>
    </ScreenShell>
  )
}
