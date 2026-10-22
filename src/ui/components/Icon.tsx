import type { UpgradeIcon, WeaponId } from '../../game/types'

export type IconName =
  | UpgradeIcon
  | WeaponId
  | 'lock'
  | 'gear'
  | 'play'
  | 'resume'
  | 'pause'
  | 'restart'
  | 'home'
  | 'info'
  | 'trophy'
  | 'skull'
  | 'clock'
  | 'target'
  | 'chip'
  | 'check'
  | 'back'
  | 'credits'
  | 'controls'

const PATHS: Record<IconName, string> = {
  damage: 'M12 3v4M12 17v4M3 12h4M17 12h4M7 7l2.5 2.5M14.5 14.5 17 17M17 7l-2.5 2.5M9.5 14.5 7 17M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z',
  firerate: 'M4 6l5 6-5 6M10 6l5 6-5 6M16 6l5 6-5 6',
  speed: 'M3 8h9M3 12h13M3 16h9M14 6l6 6-6 6',
  crit: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM12 11v2M3 12h3M18 12h3',
  health: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3ZM12 8.5v7M8.5 12h7',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3ZM12 7v10M7.5 9.5 12 7l4.5 2.5',
  dash: 'M3 12h6M5 8h5M5 16h5M12 6l8 6-8 6V6Z',
  energy: 'M13 2 5 13h6l-1 9 8-11h-6l1-9Z',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4M6 4h3v8a3 3 0 0 0 6 0V4h3M6 8h3M15 8h3',
  pierce: 'M3 12h15M14 7l5 5-5 5M8 6v12M12 8v8',
  multishot: 'M4 12h6M12 12l8-6M12 12h8M12 12l8 6M10 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  leech: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11ZM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5',
  blade: 'M4 20 15 9l2-6 4 4-6 2L4 20ZM4 20l3-1M4 20l1-3',
  explosive: 'M12 2l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2 2-5Z',
  static: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM13 6l-4 6h5l-3 6',
  ammo: 'M6 20V9l2-4 2 4v11H6ZM14 20V9l2-4 2 4v11h-4ZM5 20h14',
  xp: 'M12 2l7 10-7 10-7-10 7-10ZM12 7l3.5 5-3.5 5-3.5-5L12 7Z',
  weapon: 'M3 10h13l2-2h3v5h-3l-1 1h-4l-1 4H8l1-4H3v-4ZM7 10V8',
  pulse: 'M3 12h4l2-5 3 10 2-5h7',
  scatter: 'M4 12h4M10 12l10-7M10 12h10M10 12l10 7M10 12l10-3.5M10 12l10 3.5',
  lancer: 'M2 12h16M15 8l5 4-5 4M5 9v6M9 10v4',
  seeker: 'M5 19c3-1 6-4 7-8l3-6 2 1-1 7c-2 3-5 5-9 7l-2-1ZM17 6l3-3M9 17l-4 4',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11ZM12 15v2',
  gear: 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  play: 'M7 4l13 8-13 8V4Z',
  resume: 'M7 4l13 8-13 8V4Z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  restart: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  home: 'M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5',
  info: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM12 11v6M12 7.5v.5',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4c0 3 2 4.5 4 4.5M16 6h4c0 3-2 4.5-4 4.5M12 13v4M8 21h8M9 17h6',
  skull: 'M12 3a8 8 0 0 0-8 8c0 3 1.5 4.5 3 5.5V20h10v-3.5c1.5-1 3-2.5 3-5.5a8 8 0 0 0-8-8ZM9 11.5h.01M15 11.5h.01M10 20v-2M14 20v-2',
  clock: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM12 7v5l3 2',
  target: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM12 2v4M12 18v4M2 12h4M18 12h4',
  chip: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  check: 'M4 12.5l5 5L20 6.5',
  back: 'M10 5l-7 7 7 7M3 12h18',
  credits: 'M4 5h16v14H4zM8 9h8M8 13h8M8 17h4',
  controls: 'M6 9h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7.2 2.4L14 15h-4l-.8 1.4A4 4 0 0 1 2 14v-1a4 4 0 0 1 4-4ZM7 11v4M5 13h4M16 12h.01M18 14h.01',
}

export function Icon({ name, className = 'size-5', strokeWidth = 1.7 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
