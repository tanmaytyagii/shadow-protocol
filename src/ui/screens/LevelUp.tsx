import { useCallback, useEffect, useState } from 'react'
import { WEAPONS } from '../../game/systems/weapons'
import type { Rarity, UpgradeCard, UpgradeId } from '../../game/types'
import { KeyCap } from '../components/controls'
import { Icon } from '../components/Icon'
import { Kicker } from '../components/layout'
import { isTouchDevice, useGame, useGameState, useSettings, useSfx } from '../context'
import { splitDescription } from '../upgradeText'

/** Rarity reads by name and pip count as well as colour. */
const RARITY: Record<Rarity, { label: string; pips: number; color: string; glow: string }> = {
  common: { label: 'Standard', pips: 1, color: '#3ef2ff', glow: 'rgba(62,242,255,0.3)' },
  rare: { label: 'Advanced', pips: 2, color: '#b48cff', glow: 'rgba(157,107,255,0.4)' },
  epic: { label: 'Prototype', pips: 3, color: '#ff5aa8', glow: 'rgba(255,61,154,0.42)' },
}

/** Delay before cards accept input, so a held fire button can't pick one by accident. */
const ARM_DELAY = 550
/** Brief beat to show the selection before play resumes. */
const PICK_DELAY = 180

type CardState = 'idle' | 'chosen' | 'dismissed'

export function LevelUp() {
  const game = useGame()
  const offer = useGameState((s) => s.levelUp)
  const reduced = useSettings().reducedMotion
  const touch = isTouchDevice()
  const [armedKey, setArmedKey] = useState<number | null>(null)
  const [picked, setPicked] = useState<{ key: number; id: UpgradeId } | null>(null)

  useEffect(() => {
    if (!offer) return
    const id = window.setTimeout(() => setArmedKey(offer.key), ARM_DELAY)
    return () => window.clearTimeout(id)
  }, [offer])

  const pickedNow = offer !== null && picked?.key === offer.key
  const ready = offer !== null && armedKey === offer.key && !pickedNow

  const choose = useCallback(
    (id: UpgradeId) => {
      if (!offer || !ready) return
      setPicked({ key: offer.key, id })
      window.setTimeout(() => game.chooseUpgrade(id), reduced ? 0 : PICK_DELAY)
    },
    [offer, ready, game, reduced],
  )

  useEffect(() => {
    if (!offer || !ready) return
    const handler = (e: KeyboardEvent) => {
      // A weapon key still held from the fight must not pick a card.
      if (e.repeat) return
      const n = Number(e.key)
      if (n >= 1 && n <= offer.cards.length) {
        e.preventDefault()
        choose(offer.cards[n - 1].id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [offer, ready, choose])

  if (!offer) return null

  return (
    <section
      aria-label="Select augment"
      className="absolute inset-0 z-(--z-overlay) overflow-hidden overflow-y-auto overscroll-contain animate-fade"
      style={{ background: 'radial-gradient(ellipse at 50% 42%, rgba(40,22,92,0.5), rgba(4,5,14,0.9) 70%)' }}
    >
      <div className="rays opacity-35" style={{ background: 'repeating-conic-gradient(from 0deg, rgba(157,107,255,0.07) 0deg 5deg, transparent 5deg 16deg)' }} />
      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col justify-center pt-[max(1.5rem,var(--safe-top))] pr-[max(var(--gutter),var(--safe-right))] pb-[max(1.5rem,var(--safe-bottom))] pl-[max(var(--gutter),var(--safe-left))]">
        <header className="text-center animate-banner">
          <Kicker tone="violet">{offer.source === 'chip' ? 'Upgrade chip decrypted' : `Level ${offer.level} reached`}</Kicker>
          <h2 className="mt-2 text-title text-white uppercase glow-soft-cyan">Select augment</h2>
          <div className="mx-auto mt-3 h-px w-56 bg-linear-to-r from-transparent via-violet to-transparent" />
        </header>
        <div className="mt-6 grid gap-3 sm:mt-8 md:grid-cols-3 md:gap-4">
          {offer.cards.map((card, i) => {
            const state: CardState = pickedNow ? (picked?.id === card.id ? 'chosen' : 'dismissed') : 'idle'
            return <Card key={`${offer.key}-${card.id}`} card={card} index={i} ready={ready} state={state} touch={touch} onPick={() => choose(card.id)} />
          })}
        </div>
        <p className="mt-5 text-center text-caption text-muted uppercase sm:mt-6" aria-live="polite">
          {ready ? (
            touch ? (
              'Tap a card to install it'
            ) : (
              <>
                Click a card or press <KeyCap>1</KeyCap> <KeyCap>2</KeyCap> <KeyCap>3</KeyCap>
              </>
            )
          ) : pickedNow ? (
            'Installing…'
          ) : (
            'Decrypting…'
          )}
        </p>
      </div>
    </section>
  )
}

function Card({ card, index, ready, state, touch, onPick }: { card: UpgradeCard; index: number; ready: boolean; state: CardState; touch: boolean; onPick: () => void }) {
  const sfx = useSfx()
  const r = RARITY[card.rarity]
  const weapon = card.weapon !== undefined ? WEAPONS[card.weapon] : null
  const { effect, total } = splitDescription(card.description)
  const wrapper = state === 'chosen' ? 'animate-chosen' : state === 'dismissed' ? 'animate-dismiss' : 'animate-card-in'
  const accent = weapon ? weapon.color : r.color
  return (
    <div className={wrapper} style={{ animationDelay: state === 'idle' ? `${index * 80}ms` : '0ms' }}>
      <button
        type="button"
        disabled={!ready}
        onClick={onPick}
        onMouseEnter={() => ready && sfx('uiHover')}
        aria-label={`${card.name}. ${weapon ? 'Weapon' : r.label}. ${card.description}${card.maxStacks > 1 ? ` Rank ${card.currentStacks + 1} of ${card.maxStacks}.` : ''}`}
        className={`chamfer group relative flex w-full gap-4 overflow-hidden max-md:flex-wrap max-md:gap-y-2 bg-panel/95 p-4 text-left outline-none transition-[transform,box-shadow] duration-(--dur-base) ease-out-expo enabled:hover:-translate-y-1 focus-visible:-translate-y-1 disabled:cursor-wait max-md:items-start md:min-h-[17rem] md:flex-col md:p-5 ${
          card.rarity === 'epic' ? 'frame-live' : ''
        } ${state === 'chosen' ? '-translate-y-1' : ''}`}
        style={{ boxShadow: `inset 0 0 0 1px ${accent}55` }}
      >
        {/* Hover/focus light and border, drawn inside the chamfer. */}
        <span
          className={`pointer-events-none absolute inset-0 transition-opacity duration-(--dur-base) group-hover:opacity-100 group-focus-visible:opacity-100 ${state === 'chosen' ? 'opacity-100' : 'opacity-0'}`}
          style={{ boxShadow: `inset 0 0 0 1px ${accent}, inset 0 0 40px -12px ${r.glow}` }}
        />
        <span className="pointer-events-none absolute inset-0 opacity-0 group-focus-visible:opacity-100" style={{ boxShadow: 'inset 0 0 0 2px var(--color-cyan)' }} />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 opacity-30" style={{ background: `linear-gradient(to top, ${r.glow}, transparent)` }} />

        <span className="relative grid size-12 shrink-0 place-items-center chamfer-sm bg-ink md:order-2 md:mt-4 md:size-14" style={{ color: accent, boxShadow: `inset 0 0 0 1px ${accent}66` }}>
          <Icon name={card.weapon ?? card.icon} className="size-6 md:size-7" strokeWidth={1.6} />
        </span>

        <span className="relative flex min-w-0 flex-1 flex-col md:order-1 md:flex-none">
          <span className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-caption uppercase" style={{ color: accent }}>
              <span className="flex gap-0.5" aria-hidden>
                {Array.from({ length: 3 }, (_, i) => (
                  <span key={i} className="size-1.5 rotate-45" style={{ background: i < r.pips ? accent : 'rgba(125,139,179,0.25)' }} />
                ))}
              </span>
              {weapon ? `Weapon · slot ${weapon.slot}` : r.label}
            </span>
            {!touch && <KeyCap>{index + 1}</KeyCap>}
          </span>
          <span className="mt-2 text-heading text-white uppercase md:hidden">{card.name}</span>
        </span>

        <span className="relative flex min-w-0 flex-col max-md:hidden md:order-3 md:flex-1">
          <span className="mt-4 text-heading text-white uppercase">{card.name}</span>
          <span className="mt-2 text-small text-text/85">{effect}</span>
          {total && <span className="mt-1.5 font-mono text-[0.75rem] text-muted">{total}</span>}
          {card.maxStacks > 1 && <Rank card={card} color={accent} />}
        </span>

        {/* Phones: one compact row per card so all three can be compared at once. */}
        <span className="relative -mt-1 flex min-w-0 basis-full flex-col pl-16 md:hidden">
          <span className="text-small text-text/85">{effect}</span>
          {total && <span className="mt-1 font-mono text-[0.75rem] text-muted">{total}</span>}
          {card.maxStacks > 1 && <Rank card={card} color={accent} />}
        </span>
      </button>
    </div>
  )
}

function Rank({ card, color }: { card: UpgradeCard; color: string }) {
  return (
    <span className="mt-auto flex items-center gap-1.5 pt-3" aria-hidden>
      {Array.from({ length: card.maxStacks }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 ${i === card.currentStacks ? 'animate-pulse-slow' : ''}`} style={{ background: i <= card.currentStacks ? color : 'rgba(125,139,179,0.2)', opacity: i === card.currentStacks ? 0.75 : 1 }} />
      ))}
      <span className="ml-2 font-mono text-[0.6875rem] text-dim tabular-nums">
        Rank {card.currentStacks + 1}/{card.maxStacks}
      </span>
    </span>
  )
}
