/**
 * Upgrade descriptions end with a running total ("+15% weapon damage. Total: +30%.").
 * Split it off so the effect of this pick and the result read separately.
 * Weapon cards end with their slot hint ("[2]"), which the card shows as a label.
 */
export function splitDescription(text: string): { effect: string; total: string | null } {
  const clean = text.replace(/\s*\[\d\]$/, '')
  const m = clean.match(/^(.*?\.)\s+((?:Total|Crits|Max hull|Max shield|Cooldown|Max|Radius|Capacity):\s.+?)\.?$/)
  return m ? { effect: m[1], total: m[2] } : { effect: clean, total: null }
}
