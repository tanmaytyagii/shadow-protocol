import { WEAPONS } from '../../game/systems/weapons'
import type { WeaponId } from '../../game/types'

/**
 * Each weapon's projectile as the renderer draws it (render/draw/projectiles.ts),
 * in its own colours: the pulse bolt with its hot core, the scatter fan of
 * shards, the rail lancer's long beam, and the seeker's twin homing missiles.
 */
export function WeaponEmblem({ id, locked = false, className = '' }: { id: WeaponId; locked?: boolean; className?: string }) {
  const w = WEAPONS[id]
  const color = locked ? '#3a4a74' : w.color
  const core = locked ? '#566894' : w.core
  const gid = `emblem-${id}${locked ? '-locked' : ''}`
  return (
    <svg viewBox="0 0 96 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${gid}-trail`} x1="0" x2="1">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="0.75" stopColor={color} stopOpacity="0.55" />
          <stop offset="1" stopColor={core} stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id={`${gid}-glow`}>
          <stop offset="0" stopColor={color} stopOpacity="0.55" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Chamber grid. */}
      <g stroke="rgba(120,150,230,0.08)" strokeWidth="1">
        {[12, 24, 36].map((y) => (
          <line key={y} x1="0" x2="96" y1={y} y2={y} />
        ))}
        {[16, 32, 48, 64, 80].map((x) => (
          <line key={x} x1={x} x2={x} y1="0" y2="48" />
        ))}
      </g>
      {id === 'pulse' && (
        <g strokeLinecap="round">
          <circle cx="74" cy="24" r="14" fill={`url(#${gid}-glow)`} />
          <line x1="22" y1="24" x2="74" y2="24" stroke={`url(#${gid}-trail)`} strokeWidth="6" />
          <line x1="52" y1="24" x2="76" y2="24" stroke={core} strokeWidth="2.4" />
        </g>
      )}
      {id === 'scatter' && (
        <g strokeLinecap="round">
          {[-0.275, -0.165, -0.055, 0.055, 0.165, 0.275].map((a, i) => {
            const len = 30 + (i % 3) * 7
            const x2 = 18 + Math.cos(a) * (len + 30)
            const y2 = 24 + Math.sin(a) * (len + 30)
            const x1 = 18 + Math.cos(a) * 30
            const y1 = 24 + Math.sin(a) * 30
            return (
              <g key={a}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={locked ? color : '#ff9a3c'} strokeOpacity="0.75" strokeWidth="4" />
                <line x1={x2 - Math.cos(a) * 8} y1={y2 - Math.sin(a) * 8} x2={x2} y2={y2} stroke={locked ? core : '#fff1d2'} strokeWidth="2" />
              </g>
            )
          })}
          <circle cx="18" cy="24" r="9" fill={`url(#${gid}-glow)`} />
        </g>
      )}
      {id === 'lancer' && (
        <g strokeLinecap="round">
          <circle cx="80" cy="24" r="16" fill={`url(#${gid}-glow)`} />
          <line x1="4" y1="24" x2="80" y2="24" stroke={`url(#${gid}-trail)`} strokeWidth="6.5" />
          <line x1="62" y1="24" x2="80" y2="24" stroke={locked ? core : '#ffffff'} strokeWidth="5" />
          {[20, 36, 52].map((x) => (
            <line key={x} x1={x} x2={x} y1="15" y2="33" stroke={color} strokeOpacity="0.35" strokeWidth="1" />
          ))}
        </g>
      )}
      {id === 'seeker' &&
        [
          { path: 'M10 34 C 32 34, 44 14, 70 15', head: { x: 70, y: 15, a: -0.08 } },
          { path: 'M10 40 C 36 40, 52 30, 76 31', head: { x: 76, y: 31, a: 0.02 } },
        ].map(({ path, head }) => (
          <g key={path}>
            <path d={path} fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 5" />
            <circle cx={head.x - 8} cy={head.y} r="7" fill={`url(#${gid}-glow)`} />
            <path
              d="M7 0 L-5 3.6 L-3 0 L-5 -3.6 Z"
              transform={`translate(${head.x} ${head.y}) rotate(${(head.a * 180) / Math.PI}) scale(1.5)`}
              fill={locked ? core : '#d9fff0'}
              stroke={color}
              strokeWidth="0.8"
            />
          </g>
        ))}
    </svg>
  )
}
