import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useSfx } from '../context'
import { swallowRepeat, useClickThroughGuard } from '../input'
import { Icon, type IconName } from './Icon'

type Variant = 'hero' | 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'xl'

/*
 * Interaction states, shared by every button in the game:
 *   rest     – surface and a 1px inset border (inside the chamfer, so it isn't clipped)
 *   hover    – brighter surface and border, accent bar on the leading edge
 *   focus    – a 2px inset ring in the focus colour (an outline would be clipped away)
 *   press    – slight scale-down
 *   disabled – 40% opacity, no hover response
 */
const VARIANTS: Record<Variant, string> = {
  // The landing page's main action; its surface and lit outline live in .cta-hero (index.css).
  hero: 'cta-hero text-white',
  primary:
    'bg-cyan/[0.13] text-cyan-soft shadow-[inset_0_0_0_1px_rgba(62,242,255,0.55)] hover:bg-cyan/[0.2] hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(62,242,255,0.95)] active:bg-cyan/[0.26]',
  secondary:
    'bg-white/[0.035] text-text shadow-[inset_0_0_0_1px_var(--color-edge-strong)] hover:bg-raised hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(62,242,255,0.5)]',
  ghost: 'bg-transparent text-muted hover:bg-white/[0.05] hover:text-text',
  danger:
    'bg-danger/[0.1] text-danger-soft shadow-[inset_0_0_0_1px_rgba(255,77,109,0.5)] hover:bg-danger/[0.18] hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(255,77,109,0.9)]',
}

const SIZES: Record<Size, string> = {
  sm: 'min-h-11 gap-2.5 px-3.5 text-[0.75rem] tracking-[0.1em]',
  md: 'min-h-12 gap-3 px-4 text-[0.8125rem] tracking-[0.14em]',
  lg: 'min-h-14 gap-3 px-5 text-[0.9375rem] tracking-[0.14em]',
  xl: 'min-h-16 gap-3.5 px-5 text-base tracking-[0.14em] sm:px-6',
}

const FOCUS = 'focus-visible:text-white focus-visible:shadow-[inset_0_0_0_2px_var(--color-cyan)]'
/** The hero action keeps its inner light under the focus ring. */
const FOCUS_HERO = 'focus-visible:shadow-[inset_0_0_0_2px_rgba(225,253,255,1),inset_0_0_0_4px_rgba(62,242,255,0.5),inset_0_-28px_36px_-26px_rgba(62,242,255,0.7)]'

/** Clicks closer together than this are treated as one (no double deploys or restarts). */
const REPEAT_GUARD_MS = 350

export interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: Variant
  icon?: IconName
  hint?: string
  disabled?: boolean
  className?: string
  autoFocus?: boolean
  menuItem?: boolean
  size?: Size
  sub?: ReactNode
  /** Full width of its container (default) or sized to its content. */
  fill?: boolean
  /** Identifies the button so focus can be restored to it when its screen returns. */
  focusId?: string
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  icon,
  hint,
  disabled,
  className = '',
  autoFocus,
  menuItem = true,
  size = 'md',
  sub,
  fill = true,
  focusId,
}: ButtonProps) {
  const sfx = useSfx()
  const ref = useRef<HTMLButtonElement>(null)
  const clickThrough = useClickThroughGuard()
  // -Infinity, not 0: performance.now() starts at page load, so a first click in
  // the opening 350 ms would otherwise be taken for a repeat and dropped.
  const lastClick = useRef(-Infinity)
  // Focus without scrolling: a panel whose primary action sits at the bottom
  // should still open at its top (the native autofocus jumps to the button).
  useEffect(() => {
    if (autoFocus && !disabled) ref.current?.focus({ preventScroll: true })
  }, [autoFocus, disabled])
  return (
    <button
      ref={ref}
      type="button"
      data-menu-item={menuItem ? '' : undefined}
      data-focus-id={focusId}
      disabled={disabled}
      onMouseEnter={() => !disabled && sfx('uiHover')}
      onFocus={() => !disabled && sfx('uiHover')}
      onKeyDown={swallowRepeat}
      onClick={(e) => {
        if (disabled || clickThrough(e)) return
        const now = performance.now()
        if (now - lastClick.current < REPEAT_GUARD_MS) return
        lastClick.current = now
        sfx('uiClick')
        onClick?.()
      }}
      className={`chamfer-sm sheen group relative flex items-center text-left font-semibold uppercase outline-none transition-[background-color,color,box-shadow,transform,opacity] duration-(--dur-fast) select-none active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40 ${
        fill ? 'w-full' : 'w-auto'
      } ${SIZES[size]} ${VARIANTS[variant]} ${variant === 'hero' ? FOCUS_HERO : FOCUS} ${className}`}
    >
      {icon && <Icon name={icon} className={`${size === 'xl' ? 'size-5' : 'size-[18px]'} shrink-0 opacity-80 group-hover:opacity-100`} />}
      <span className="flex min-w-0 flex-1 flex-col py-2">
        <span className="truncate">{children}</span>
        {sub && <span className="mt-1 text-small leading-snug font-normal tracking-normal text-muted normal-case group-hover:text-text/85">{sub}</span>}
      </span>
      {hint && <KeyCap>{hint}</KeyCap>}
      <span className="pointer-events-none absolute top-0 left-0 h-full w-[3px] origin-top scale-y-0 bg-current transition-transform duration-(--dur-base) group-hover:scale-y-100 group-focus-visible:scale-y-100 group-disabled:hidden" />
    </button>
  )
}

export function KeyCap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex h-[1.4rem] min-w-[1.6rem] shrink-0 items-center justify-center rounded-[3px] border border-edge-strong bg-ink/80 px-1.5 font-mono text-[0.6875rem] font-semibold tracking-normal text-cyan-soft normal-case shadow-[0_2px_0_rgba(62,242,255,0.14)] ${className}`}
    >
      {children}
    </kbd>
  )
}

type Tone = 'default' | 'accent' | 'danger' | 'success' | 'progress'

const PANEL_TONES: Record<Tone, string> = {
  default: '',
  accent: 'frame-accent',
  danger: 'frame-danger',
  success: 'frame-success',
  progress: 'frame-progress',
}

/** The game's machined panel: chamfered silhouette, hairline frame and corner ticks. */
export function Panel({ children, className = '', live = false, tone = 'default' }: { children: ReactNode; className?: string; live?: boolean; tone?: Tone }) {
  return <div className={`panel chamfer frame ${PANEL_TONES[tone]} ${live ? 'frame-live' : ''} ${className}`}>{children}</div>
}

export function SectionLabel({ children, className = '', aside }: { children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <div className={`flex items-center gap-3 text-caption text-muted uppercase ${className}`}>
      <span className="h-px w-5 shrink-0 bg-cyan/60" />
      <span className="shrink-0">{children}</span>
      <span className="h-px min-w-2 flex-1 bg-linear-to-r from-edge-strong to-transparent" />
      {aside && <span className="min-w-0 truncate font-mono text-[0.6875rem] tracking-normal text-dim normal-case max-[359px]:hidden">{aside}</span>}
    </div>
  )
}

export function Slider({
  label,
  value,
  onChange,
  onCommit,
  description,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  onCommit?: () => void
  description?: string
}) {
  const pct = Math.round(value * 100)
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-4">
      <span className="text-small font-semibold tracking-[0.04em] text-text">{label}</span>
      <span className="w-12 text-right font-mono text-small text-cyan-soft tabular-nums" aria-hidden>
        {value === 0 ? 'Off' : `${pct}%`}
      </span>
      {description && <span className="col-span-2 text-[0.75rem] text-dim">{description}</span>}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        aria-label={label}
        aria-valuetext={value === 0 ? 'Off' : `${pct}%`}
        className="range col-span-2"
        style={{ ['--fill' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </label>
  )
}

export function Toggle({ label, value, onChange, description }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string }) {
  const sfx = useSfx()
  const clickThrough = useClickThroughGuard()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onKeyDown={swallowRepeat}
      onClick={(e) => {
        if (clickThrough(e)) return
        sfx('uiClick')
        onChange(!value)
      }}
      className="chamfer-sm flex min-h-12 w-full items-center justify-between gap-4 py-2 text-left outline-none transition-colors duration-(--dur-fast) hover:bg-white/[0.035] focus-visible:shadow-[inset_0_0_0_2px_var(--color-cyan)] coarse:min-h-14"
    >
      <span className="min-w-0 pl-0.5">
        <span className="block text-small font-semibold tracking-[0.04em] text-text">{label}</span>
        {description && <span className="mt-0.5 block text-[0.75rem] leading-snug text-dim">{description}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2.5 pr-1">
        <span className={`w-7 text-right font-mono text-[0.6875rem] font-semibold uppercase ${value ? 'text-cyan-soft' : 'text-dim'}`} aria-hidden>
          {value ? 'On' : 'Off'}
        </span>
        <span
          className={`chamfer-sm relative h-6 w-11 transition-colors duration-(--dur-base) ${
            value ? 'bg-cyan/30 shadow-[inset_0_0_0_1px_rgba(62,242,255,0.7)]' : 'bg-white/[0.06] shadow-[inset_0_0_0_1px_var(--color-edge-strong)]'
          }`}
        >
          <span
            className={`absolute top-1.5 size-3 transition-[left,background-color] duration-(--dur-base) ease-out-expo ${
              value ? 'left-6.5 bg-cyan shadow-[0_0_10px_rgba(62,242,255,0.8)]' : 'left-1.5 bg-dim'
            }`}
          />
        </span>
      </span>
    </button>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  description,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  description?: string
}) {
  const sfx = useSfx()
  const group = useRef<HTMLDivElement>(null)
  const clickThrough = useClickThroughGuard()
  const select = (v: T) => {
    if (v === value) return
    sfx('uiClick')
    onChange(v)
  }
  // Radio-group keyboard pattern: arrows move the selection (and focus) along the options.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]
    select(next.value)
    group.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="min-w-0">
        <span className="block text-small font-semibold tracking-[0.04em] text-text">{label}</span>
        {description && <span className="mt-0.5 block text-[0.75rem] leading-snug text-dim">{description}</span>}
      </span>
      <div ref={group} className="chamfer-sm flex bg-ink/80 p-1 shadow-[inset_0_0_0_1px_var(--color-edge)]" role="radiogroup" aria-label={label} onKeyDown={onKey}>
        {options.map((o) => {
          const on = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-value={o.value}
              onClick={(e) => !clickThrough(e) && select(o.value)}
              className={`flex min-h-10 min-w-[3.75rem] items-center justify-center gap-1.5 px-3 text-[0.75rem] font-semibold tracking-[0.12em] uppercase outline-none transition-colors duration-(--dur-fast) focus-visible:shadow-[inset_0_0_0_2px_var(--color-cyan)] coarse:min-h-11 ${
                on ? 'bg-cyan/20 text-cyan-soft' : 'text-muted hover:bg-white/[0.04] hover:text-text'
              }`}
            >
              {on && <Icon name="check" className="size-3.5" strokeWidth={2.2} />}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Stat({ label, value, accent = 'text-text', icon }: { label: string; value: ReactNode; accent?: string; icon?: IconName }) {
  return (
    <div className="chamfer-sm bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-edge)]">
      <div className="flex items-start gap-1.5 text-caption leading-tight text-muted uppercase">
        {icon && <Icon name={icon} className="size-3.5 shrink-0" />}
        <span className="min-w-0">{label}</span>
      </div>
      <div className={`mt-1 font-mono text-data tabular-nums ${accent}`}>{value}</div>
    </div>
  )
}

type BadgeTone = 'neutral' | 'cyan' | 'violet' | 'amber' | 'danger' | 'mint' | 'magenta'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-white/[0.05] text-muted shadow-[inset_0_0_0_1px_var(--color-edge-strong)]',
  cyan: 'bg-cyan/[0.12] text-cyan-soft shadow-[inset_0_0_0_1px_rgba(62,242,255,0.45)]',
  violet: 'bg-violet/[0.14] text-violet-soft shadow-[inset_0_0_0_1px_rgba(157,107,255,0.5)]',
  amber: 'bg-amber/[0.12] text-amber shadow-[inset_0_0_0_1px_rgba(255,195,92,0.5)]',
  danger: 'bg-danger/[0.12] text-danger-soft shadow-[inset_0_0_0_1px_rgba(255,77,109,0.5)]',
  mint: 'bg-mint/[0.1] text-mint shadow-[inset_0_0_0_1px_rgba(77,255,181,0.45)]',
  magenta: 'bg-magenta/[0.12] text-[#ff9ccb] shadow-[inset_0_0_0_1px_rgba(255,61,154,0.5)]',
}

/** Small status chip. Always carries text, so state never depends on colour alone. */
export function Badge({ children, tone = 'neutral', icon, className = '' }: { children: ReactNode; tone?: BadgeTone; icon?: IconName; className?: string }) {
  return (
    <span className={`chamfer-sm inline-flex h-6 shrink-0 items-center gap-1.5 px-2 text-caption whitespace-nowrap uppercase ${BADGE_TONES[tone]} ${className}`}>
      {icon && <Icon name={icon} className="size-3.5" strokeWidth={2} />}
      {children}
    </span>
  )
}
