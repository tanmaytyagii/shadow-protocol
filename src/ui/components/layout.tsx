import { useRef, type ReactNode } from 'react'
import { useMenuKeys } from '../context'

const WIDTHS = {
  sm: 'max-w-xl',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
} as const

/**
 * Full-screen layer used by every menu screen and overlay: scrim, safe-area
 * aware gutters, vertical centring that turns into scrolling when content is
 * taller than the viewport, and Escape / arrow-key navigation.
 */
export function ScreenShell({
  children,
  onEscape,
  label,
  width = 'md',
  scrim = 'strong',
  layer = 'screen',
  className = '',
  innerClassName = '',
}: {
  children: ReactNode
  onEscape?: () => void
  /** Accessible name for the screen region. */
  label: string
  width?: keyof typeof WIDTHS
  scrim?: 'strong' | 'soft' | 'none'
  /** Overlays (pause, level-up, results) sit under full screens opened from them. */
  layer?: 'screen' | 'overlay'
  className?: string
  innerClassName?: string
}) {
  const ref = useRef<HTMLElement>(null)
  useMenuKeys(ref, onEscape)
  const scrimClass = scrim === 'strong' ? 'scrim' : scrim === 'soft' ? 'scrim-soft' : ''
  return (
    <section
      ref={ref}
      aria-label={label}
      className={`absolute inset-0 overflow-y-auto overscroll-contain ${layer === 'screen' ? 'z-(--z-screen)' : 'z-(--z-overlay)'} ${scrimClass} ${className}`}
    >
      <div
        className={`mx-auto flex min-h-full w-full flex-col justify-center pt-[max(2rem,calc(var(--safe-top)+1rem))] pr-[max(var(--gutter),var(--safe-right))] pb-[max(2rem,calc(var(--safe-bottom)+1rem))] pl-[max(var(--gutter),var(--safe-left))] ${WIDTHS[width]} ${innerClassName}`}
      >
        {children}
      </div>
    </section>
  )
}

const KICKER_TONES = {
  cyan: 'text-cyan/85',
  violet: 'text-violet-soft',
  amber: 'text-amber',
  danger: 'text-danger-soft',
  mint: 'text-mint',
  magenta: 'text-[#ff9ccb]',
} as const

export type KickerTone = keyof typeof KICKER_TONES

/** The `// SECTION` line above a heading. */
export function Kicker({ children, tone = 'cyan', className = '' }: { children: ReactNode; tone?: KickerTone; className?: string }) {
  return (
    <p className={`font-mono text-caption tracking-[0.28em] uppercase ${KICKER_TONES[tone]} ${className}`}>
      <span aria-hidden>// </span>
      {children}
    </p>
  )
}

/** Kicker, title and an optional description; `aside` sits to the right on wide screens. */
export function ScreenHeader({
  kicker,
  title,
  description,
  aside,
  tone = 'cyan',
  className = '',
}: {
  kicker: ReactNode
  title: ReactNode
  description?: ReactNode
  aside?: ReactNode
  tone?: KickerTone
  className?: string
}) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-x-10 gap-y-3 ${className}`}>
      <div className="min-w-0">
        <Kicker tone={tone}>{kicker}</Kicker>
        <h2 className="mt-2 text-title text-white uppercase">{title}</h2>
        {description && <p className="mt-2.5 max-w-[62ch] text-body text-muted">{description}</p>}
      </div>
      {aside && <div className="max-w-sm text-small text-muted">{aside}</div>}
    </header>
  )
}

/** Hairline divider with a short accent segment. */
export function Divider({ className = '' }: { className?: string }) {
  return (
    <div className={`relative h-px bg-linear-to-r from-edge-strong via-edge to-transparent ${className}`} aria-hidden>
      <span className="absolute top-0 left-0 h-px w-10 bg-cyan/70" />
    </div>
  )
}

/**
 * Primary and secondary actions for a screen. Primary goes last (right on
 * desktop); on phones the order flips so the primary sits on top.
 * `sticky` keeps the bar reachable at the bottom of long scrolling screens.
 */
export function ActionBar({
  children,
  sticky = false,
  inline = false,
  className = '',
}: {
  children: ReactNode
  sticky?: boolean
  /** Keep the actions on one row at every width (e.g. Back + Deploy in a sticky bar). */
  inline?: boolean
  className?: string
}) {
  return (
    <div
      data-sticky={sticky ? '' : undefined}
      className={`flex gap-3 ${inline ? 'flex-row items-center sm:justify-end' : 'flex-col-reverse sm:flex-row sm:items-center sm:justify-end'} ${
        sticky ? 'sticky bottom-0 z-10 -mx-1 bg-linear-to-t from-[#060a17] from-60% to-transparent px-1 pt-6 pb-[max(0.25rem,var(--safe-bottom))]' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}
