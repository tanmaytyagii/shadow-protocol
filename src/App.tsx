import { useCallback, useEffect, useRef, useState } from 'react'
import { Game } from './game/Game'
import { profileStore, runSaveStore } from './game/persistence'
import type { RunConfig } from './game/types'
import { Button, Panel } from './ui/components/controls'
import { GameContext, isTouchDevice, useGame, useGameState, useSettings } from './ui/context'
import { Hud } from './ui/hud/Hud'
import { TouchControls } from './ui/hud/TouchControls'
import { Credits } from './ui/screens/Credits'
import { IntroSequence } from './ui/screens/IntroSequence'
import { LevelUp } from './ui/screens/LevelUp'
import { Loadout } from './ui/screens/Loadout'
import { MainMenu } from './ui/screens/MainMenu'
import { PauseMenu } from './ui/screens/PauseMenu'
import { Results } from './ui/screens/Results'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { Tutorial } from './ui/screens/Tutorial'

type Screen = 'intro' | 'menu' | 'loadout' | 'tutorial' | 'settings' | 'credits' | 'game'

const QUERY = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
const DEBUG = QUERY.has('debug')
/** First launch plays the opening cinematic; `?intro` replays it on demand. */
const firstScreen = (): Screen => (QUERY.has('intro') || !profileStore.get().introSeen ? 'intro' : 'menu')

export default function App() {
  const [game] = useState(() => new Game({ debug: DEBUG }))
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    game.mount(container, canvas)
    if (DEBUG) (window as unknown as { __shadow?: Game }).__shadow = game
    // Browsers only allow audio after a user gesture (older iOS only honours touchend).
    const unlock = () => game.audio.unlock()
    const gestures = ['pointerdown', 'keydown', 'touchend'] as const
    for (const type of gestures) window.addEventListener(type, unlock)
    return () => {
      for (const type of gestures) window.removeEventListener(type, unlock)
      game.unmount()
    }
  }, [game])

  return (
    <GameContext.Provider value={game}>
      <div ref={containerRef} className="fixed inset-0 overflow-hidden bg-void">
        <Shell canvasRef={canvasRef} />
      </div>
    </GameContext.Provider>
  )
}

function Shell({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const game = useGame()
  const phase = useGameState((s) => s.phase)
  const fatalError = useGameState((s) => s.fatalError)
  const settings = useSettings()
  const [screen, setScreen] = useState<Screen>(firstScreen)
  const [settingsFrom, setSettingsFrom] = useState<'menu' | 'pause'>('menu')
  const [tutorialFrom, setTutorialFrom] = useState<'menu' | 'deploy'>('menu')
  const [pending, setPending] = useState<RunConfig | null>(null)
  const [wipe, setWipe] = useState(0)
  /** The control that opened the current sub-screen; focus returns to it on the way back. */
  const [returnFocus, setReturnFocus] = useState<string | null>(null)

  /** Change screen behind a quick scan-line wipe. */
  const go = useCallback((next: Screen) => {
    setScreen(next)
    setWipe((n) => n + 1)
  }, [])

  // Mirror the reduced-motion preference onto <html> for the stylesheet.
  useEffect(() => {
    document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full'
  }, [settings.reducedMotion])

  const touch = settings.touchControls === 'on' || (settings.touchControls === 'auto' && isTouchDevice())

  const launch = useCallback(
    (config: RunConfig) => {
      game.audio.unlock()
      game.startRun(config)
      go('game')
    },
    [game, go],
  )

  const deploy = useCallback(
    (config: RunConfig) => {
      if (!profileStore.get().tutorialSeen) {
        setPending(config)
        setTutorialFrom('deploy')
        go('tutorial')
        return
      }
      launch(config)
    },
    [launch, go],
  )

  const toMenu = useCallback(() => {
    game.quitToMenu()
    setReturnFocus(null)
    go('menu')
  }, [game, go])

  /** Open a sub-screen, remembering which control opened it. */
  const open = useCallback(
    (next: Screen, from: string) => {
      setReturnFocus(from)
      go(next)
    },
    [go],
  )

  const inGame = screen === 'game' || (screen === 'settings' && settingsFrom === 'pause')
  const showHud = inGame && phase !== 'idle'

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 block ${phase === 'playing' && !touch ? 'cursor-none' : ''}`}
        aria-label="Game view"
      />
      <div className="scanlines pointer-events-none absolute inset-0 z-(--z-scanlines)" />
      {wipe > 0 && !settings.reducedMotion && (
        <div className="pointer-events-none absolute inset-0 z-(--z-wipe) overflow-hidden">
          <div key={wipe} className="screen-wipe" />
        </div>
      )}

      {showHud && <Hud touch={touch} />}
      {showHud && touch && phase === 'playing' && <TouchControls />}
      {screen === 'game' && phase === 'paused' && (
        <PauseMenu
          onSettings={() => {
            setSettingsFrom('pause')
            open('settings', 'pause-settings')
          }}
          onQuit={toMenu}
          onLeave={() => setReturnFocus(null)}
          restoreFocus={returnFocus}
        />
      )}
      {inGame && phase === 'levelup' && <LevelUp />}
      {inGame && (phase === 'gameover' || phase === 'victory') && (
        <Results
          onMenu={toMenu}
          onNewRun={() => {
            setReturnFocus(null)
            go('loadout')
          }}
        />
      )}

      {screen === 'intro' && (
        <IntroSequence
          onDone={() => {
            setReturnFocus(null)
            go('menu')
          }}
        />
      )}
      {screen === 'menu' && (
        <MainMenu
          onPlay={() => open('loadout', 'new-run')}
          onContinue={() => {
            const save = runSaveStore.get()
            if (save) launch({ difficulty: save.difficulty, startWeapon: save.startWeapon, save })
          }}
          onTutorial={() => {
            setTutorialFrom('menu')
            open('tutorial', 'tutorial')
          }}
          onSettings={() => {
            setSettingsFrom('menu')
            open('settings', 'settings')
          }}
          onCredits={() => open('credits', 'credits')}
          onReplayIntro={() => open('intro', 'intro')}
          restoreFocus={returnFocus}
        />
      )}
      {screen === 'loadout' && (
        <Loadout
          onBack={() => {
            if (phase !== 'idle') game.quitToMenu()
            go('menu')
          }}
          onDeploy={deploy}
        />
      )}
      {screen === 'tutorial' && (
        <Tutorial
          deploying={tutorialFrom === 'deploy'}
          onBack={() => {
            setPending(null)
            go(tutorialFrom === 'deploy' ? 'loadout' : 'menu')
          }}
          onDone={() => {
            profileStore.update((p) => ({ ...p, tutorialSeen: true }))
            if (pending) launch(pending)
            setPending(null)
          }}
        />
      )}
      {screen === 'settings' && <SettingsScreen inGame={settingsFrom === 'pause'} onBack={() => go(settingsFrom === 'pause' ? 'game' : 'menu')} />}
      {screen === 'credits' && <Credits onBack={() => go('menu')} onReplayIntro={() => open('intro', 'credits')} />}

      {fatalError && <FatalError message={fatalError} />}
    </>
  )
}

function FatalError({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 z-(--z-fatal) grid place-items-center bg-void/90 p-6">
      <Panel className="max-w-md p-6">
        <p className="font-mono text-xs tracking-[0.35em] text-magenta">// SYSTEM FAILURE</p>
        <h2 className="mt-2 text-2xl font-bold tracking-[0.12em] text-white uppercase">Something broke</h2>
        <p className="mt-3 text-sm text-muted">The simulation hit an unexpected error and was halted to protect your save.</p>
        <pre className="mt-3 max-h-32 overflow-auto bg-ink/80 p-3 font-mono text-xs whitespace-pre-wrap text-[#ffb3c1]">{message}</pre>
        <div className="mt-5">
          <Button variant="primary" icon="restart" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </Panel>
    </div>
  )
}
