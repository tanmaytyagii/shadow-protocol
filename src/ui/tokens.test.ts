import { describe, expect, it } from 'vitest'
import css from '../index.css?raw'

/** `--color-*` tokens from the @theme block, as hex. */
function themeColors(): Record<string, string> {
  const theme = css.slice(css.indexOf('@theme {'), css.indexOf('\n}', css.indexOf('@theme {')))
  return Object.fromEntries([...theme.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]))
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const colors = themeColors()
/** Surfaces that carry text. `raised` is the lightest of them, so it is the worst case. */
const SURFACES = ['panel', 'raised']

describe('design tokens', () => {
  it('parses the colour tokens from the theme', () => {
    for (const name of ['panel', 'raised', 'text', 'muted', 'dim', 'cyan', 'danger']) expect(colors[name], name).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('keeps the text tiers at their documented contrast on panel surfaces', () => {
    for (const surface of SURFACES) {
      expect(contrast(colors.text, colors[surface])).toBeGreaterThanOrEqual(13)
      expect(contrast(colors.muted, colors[surface])).toBeGreaterThanOrEqual(7)
      expect(contrast(colors.dim, colors[surface])).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps every accent and state colour readable as text on panel surfaces', () => {
    const accents = ['cyan', 'cyan-soft', 'violet', 'violet-soft', 'magenta', 'amber', 'mint', 'hull', 'danger', 'danger-soft']
    for (const name of accents) {
      for (const surface of SURFACES) expect(contrast(colors[name], colors[surface]), `${name} on ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
