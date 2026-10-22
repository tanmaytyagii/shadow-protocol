import { useRef, useState, type KeyboardEvent } from 'react'
import { DIFFICULTY } from '../../game/constants'
import { profileStore } from '../../game/persistence'
import { WEAPONS, WEAPON_ORDER, type WeaponDef } from '../../game/systems/weapons'
import type { Difficulty, RunConfig, WeaponId } from '../../game/types'
import { Badge, Button, Panel, SectionLabel } from '../components/controls'
import { Icon } from '../components/Icon'
import { ActionBar, ScreenHeader, ScreenShell } from '../components/layout'
import { WeaponEmblem } from '../components/WeaponEmblem'
import { isTouchDevice, useProfile, useRunSave, useSfx } from '../context'
import { useClickThroughGuard } from '../input'

interface Props {
  onBack: () => void
  onDeploy: (config: RunConfig) => void
}

/** Comparable weapon profiles, normalised against the arsenal. */
function weaponProfile(w: WeaponDef): { damage: number; rate: number; range: number } {
  // Seekers accelerate toward their top speed, so use the average speed.
  const range = w.homing > 0 ? ((w.speed + 950) / 2) * w.life : w.speed * w.life
  return { damage: w.damage * w.pellets, rate: 1 / w.interval, range }
}
const PROFILES = WEAPON_ORDER.map((id) => weaponProfile(WEAPONS[id]))
const MAX = {
  damage: Math.max(...PROFILES.map((p) => p.damage)),
  rate: Math.max(...PROFILES.map((p) => p.rate)),
  range: Math.max(...PROFILES.map((p) => p.range)),
}

/** Behaviour read straight from the weapon definition. */
function traits(w: WeaponDef): string[] {
  const t: string[] = []
  if (w.maxAmmo === null) t.push('Unlimited charge')
  if (w.homing > 0) t.push(`${w.pellets} homing missiles`)
  else if (w.pellets > 1) t.push(`${w.pellets} shards per shot`)
  if (w.pierce >= 99) t.push('Pierces every target')
  if (w.explosionRadius > 0) t.push(`${Math.round(w.explosionMult * 100)}% splash`)
  if (w.knockback >= 150) t.push('Heavy knockback')
  return t
}

const NIGHTMARE: [string, number][] = [
  ['Hostile health', DIFFICULTY.hard.enemyHp],
  ['Hostile damage', DIFFICULTY.hard.enemyDamage],
  ['Hostile speed', DIFFICULTY.hard.enemySpeed],
  ['Hostile numbers', DIFFICULTY.hard.spawnCount],
  ['Score', DIFFICULTY.hard.scoreMult],
  ['Experience', DIFFICULTY.hard.xpMult],
]

/** Radio-group keyboard pattern: ←/→ move the selection to the next available option. */
function arrowSelect<T extends string>(e: KeyboardEvent<HTMLDivElement>, options: T[], enabled: (v: T) => boolean, current: T, select: (v: T) => void) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  const step = e.key === 'ArrowRight' ? 1 : -1
  let i = options.indexOf(current)
  for (let n = 0; n < options.length; n++) {
    i = (i + step + options.length) % options.length
    if (enabled(options[i])) break
  }
  select(options[i])
  e.currentTarget.querySelector<HTMLElement>(`[data-value="${options[i]}"]`)?.focus()
}

export function Loadout({ onBack, onDeploy }: Props) {
  const profile = useProfile()
  const save = useRunSave()
  const sfx = useSfx()
  const touch = isTouchDevice()
  const [weapon, setWeapon] = useState<WeaponId>(profile.lastLoadout.weapon)
  const [difficulty, setDifficulty] = useState<Difficulty>(profile.lastLoadout.difficulty)
  const deployed = useRef(false)
  const clickThrough = useClickThroughGuard()

  const pickWeapon = (id: WeaponId) => {
    if (id === weapon) return
    sfx('swap')
    setWeapon(id)
  }
  const pickDifficulty = (d: Difficulty) => {
    if (d === difficulty) return
    sfx('uiClick')
    setDifficulty(d)
  }
  const deploy = () => {
    if (deployed.current) return
    deployed.current = true
    profileStore.update((p) => ({ ...p, lastLoadout: { weapon, difficulty } }))
    onDeploy({ difficulty, startWeapon: weapon })
  }
  const unlockedCount = profile.unlockedWeapons.length

  return (
    <ScreenShell label="Loadout" onEscape={onBack} width="xl" scrim="soft">
      <Panel className="p-4 animate-rise min-[360px]:p-5 sm:p-8">
        <ScreenHeader
          kicker="Deployment"
          title="Choose your loadout"
          aside="The Pulse Rifle is always equipped. Your starting weapon begins fully loaded; more can be found as augments during a run."
        />

        <SectionLabel className="mt-8" aside={`${unlockedCount}/${WEAPON_ORDER.length} unlocked`}>
          Starting weapon
        </SectionLabel>
        <div
          className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          role="radiogroup"
          aria-label="Starting weapon"
          onKeyDown={(e) => arrowSelect(e, WEAPON_ORDER, (id) => profile.unlockedWeapons.includes(id), weapon, pickWeapon)}
        >
          {WEAPON_ORDER.map((id) => (
            <WeaponCard key={id} weapon={WEAPONS[id]} unlocked={profile.unlockedWeapons.includes(id)} selected={weapon === id} onSelect={() => pickWeapon(id)} />
          ))}
        </div>

        <SectionLabel className="mt-8">Threat level</SectionLabel>
        <div
          className="mt-4 grid gap-3 md:grid-cols-2"
          role="radiogroup"
          aria-label="Difficulty"
          onKeyDown={(e) => arrowSelect<Difficulty>(e, ['normal', 'hard'], (d) => d === 'normal' || profile.hardUnlocked, difficulty, pickDifficulty)}
        >
          {(['normal', 'hard'] as Difficulty[]).map((d) => {
            const locked = d === 'hard' && !profile.hardUnlocked
            const selected = difficulty === d
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                data-value={d}
                data-menu-item=""
                disabled={locked}
                onClick={(e) => !clickThrough(e) && pickDifficulty(d)}
                className={`chamfer group relative flex min-h-24 items-start gap-4 p-4 text-left outline-none transition-[background-color,box-shadow] duration-(--dur-fast) focus-visible:shadow-[inset_0_0_0_2px_var(--color-cyan)] disabled:cursor-not-allowed ${
                  selected ? 'bg-cyan/[0.07] shadow-[inset_0_0_0_1px_rgba(62,242,255,0.75)]' : 'bg-white/[0.02] shadow-[inset_0_0_0_1px_var(--color-edge)] hover:bg-white/[0.045] hover:shadow-[inset_0_0_0_1px_var(--color-edge-strong)]'
                }`}
              >
                <span className={`mt-0.5 grid size-10 shrink-0 place-items-center chamfer-sm bg-ink ${locked ? 'text-dim' : d === 'hard' ? 'text-magenta' : 'text-cyan'}`}>
                  <Icon name={locked ? 'lock' : d === 'hard' ? 'skull' : 'target'} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`text-heading uppercase ${locked ? 'text-muted' : 'text-white'}`}>{DIFFICULTY[d].label}</span>
                    {selected && (
                      <Badge tone="cyan" icon="check">
                        Selected
                      </Badge>
                    )}
                    {locked && <Badge icon="lock">Locked</Badge>}
                  </span>
                  {d === 'normal' ? (
                    <span className="mt-1.5 block text-small text-muted">The intended experience. Hostiles at baseline strength.</span>
                  ) : locked ? (
                    <span className="mt-1.5 block text-small text-muted">Complete the protocol once to unlock.</span>
                  ) : (
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.75rem] text-muted">
                      {NIGHTMARE.map(([label, mult]) => (
                        <span key={label}>
                          {label} <span className={mult >= 1 ? 'text-[#ff9ccb]' : 'text-amber'}>×{mult}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        {save && (
          <p className="mt-6 flex items-start gap-2 text-small text-amber">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" /> Starting a new run replaces your saved run at wave {save.wave}.
          </p>
        )}

        <ActionBar sticky inline className="mt-8">
          <p className="mr-auto hidden text-caption text-muted uppercase sm:block">
            Deploying · <span className="text-text">{WEAPONS[weapon].name}</span> · <span className={difficulty === 'hard' ? 'text-[#ff9ccb]' : 'text-text'}>{DIFFICULTY[difficulty].label}</span>
          </p>
          <div className="shrink-0 sm:w-40">
            <Button variant="ghost" icon="back" onClick={onBack} hint={touch ? undefined : 'Esc'} className="max-[359px]:px-2.5">
              Back
            </Button>
          </div>
          <div className="min-w-0 flex-1 sm:w-60 sm:flex-none">
            <Button variant="primary" size="lg" icon="play" onClick={deploy} autoFocus className="max-[359px]:px-3" sub={touch ? `${WEAPONS[weapon].name} · ${DIFFICULTY[difficulty].label}` : undefined}>
              Deploy
            </Button>
          </div>
        </ActionBar>
      </Panel>
    </ScreenShell>
  )
}

function WeaponCard({ weapon: w, unlocked, selected, onSelect }: { weapon: WeaponDef; unlocked: boolean; selected: boolean; onSelect: () => void }) {
  const pr = weaponProfile(w)
  const clickThrough = useClickThroughGuard()
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      data-value={w.id}
      data-menu-item=""
      disabled={!unlocked}
      onClick={(e) => !clickThrough(e) && onSelect()}
      className={`chamfer group relative flex flex-col p-4 text-left outline-none transition-[background-color,box-shadow,transform] duration-(--dur-fast) focus-visible:shadow-[inset_0_0_0_2px_var(--color-cyan)] disabled:cursor-not-allowed ${
        selected
          ? 'bg-cyan/[0.06] shadow-[inset_0_0_0_1px_rgba(62,242,255,0.75)]'
          : unlocked
            ? 'bg-white/[0.02] shadow-[inset_0_0_0_1px_var(--color-edge)] hover:-translate-y-0.5 hover:bg-white/[0.045] hover:shadow-[inset_0_0_0_1px_var(--color-edge-strong)]'
            : 'bg-ink/50 shadow-[inset_0_0_0_1px_var(--color-edge)]'
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className={`chamfer-sm block w-28 bg-ink/90 shadow-[inset_0_0_0_1px_var(--color-edge)] ${unlocked ? '' : 'opacity-70'}`}>
          <WeaponEmblem id={w.id} locked={!unlocked} className="block h-14 w-28" />
        </span>
        <span className="font-mono text-caption text-dim">SLOT {w.slot}</span>
      </span>
      <span className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`text-heading uppercase ${unlocked ? 'text-white' : 'text-muted'}`}>{w.name}</span>
      </span>
      <span className="mt-2 flex">
        {selected ? (
          <Badge tone="cyan" icon="check">
            Selected
          </Badge>
        ) : unlocked ? (
          <Badge>Available</Badge>
        ) : (
          <Badge icon="lock">Locked</Badge>
        )}
      </span>
      {unlocked ? (
        <>
          <span className="mt-3 block text-small text-muted">{w.description}</span>
          <span className="mt-auto block space-y-2 pt-4">
            <StatRow label="Damage" value={w.pellets > 1 ? `${w.damage}×${w.pellets}` : `${w.damage}`} fill={pr.damage / MAX.damage} color={w.color} />
            <StatRow label="Fire rate" value={`${pr.rate.toFixed(1)}/s`} fill={pr.rate / MAX.rate} color={w.color} />
            <StatRow label="Range" fill={pr.range / MAX.range} color={w.color} />
            <span className="flex items-center justify-between font-mono text-[0.75rem] text-muted">
              <span className="text-caption tracking-[0.16em] uppercase">Ammo</span>
              <span className="text-text tabular-nums">{w.maxAmmo === null ? '∞' : `${w.maxAmmo} rounds`}</span>
            </span>
          </span>
          <span className="mt-3 flex flex-wrap gap-1.5">
            {traits(w).map((t) => (
              <span key={t} className="text-[0.6875rem] font-semibold tracking-[0.08em] text-text/75 uppercase before:mr-1.5 before:text-dim before:content-['◆']">
                {t}
              </span>
            ))}
          </span>
        </>
      ) : (
        <span className="mt-3 block text-small text-muted">
          <span className="block text-caption tracking-[0.16em] text-dim uppercase">Unlock requirement</span>
          <span className="mt-1 block text-text">{w.unlockHint}</span>
        </span>
      )}
    </button>
  )
}

function StatRow({ label, value, fill, color }: { label: string; value?: string; fill: number; color: string }) {
  return (
    <span className="grid grid-cols-[4.75rem_1fr_3.25rem] items-center gap-2">
      <span className="text-caption tracking-[0.16em] text-muted uppercase">{label}</span>
      <span className="h-1 bg-white/[0.08]">
        <span className="block h-full origin-left transition-transform duration-(--dur-panel) ease-out-expo" style={{ transform: `scaleX(${Math.max(0.06, fill)})`, background: color }} />
      </span>
      <span className="text-right font-mono text-[0.75rem] text-text tabular-nums">{value ?? ''}</span>
    </span>
  )
}
