// Audio level report: renders every sound effect, each music mode and the
// reactor ambience offline in headless Chrome (OfflineAudioContext; nothing is
// played) and prints sample peak and K-weighted loudness. This is measurement
// only: it shows relative levels and clipping, not how anything sounds.
//
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   npm run audio:levels
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
  (p) => p && existsSync(p),
)

// Gains between a voice and the output at default settings (see AudioEngine.applySettings).
const db = (g) => 20 * Math.log10(g)
const DEFAULTS = { master: 0.8 * 0.9, sfx: 0.7, music: 0.45 * 0.55 }
const SFX_OFFSET = db(DEFAULTS.sfx * DEFAULTS.master)
const MUSIC_OFFSET = db(DEFAULTS.music * DEFAULTS.master)

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage()
await page.goto(`${BASE}/?debug`)
await page.waitForFunction(() => !!window.__shadow)
const report = await page.evaluate(async () => {
  const a = window.__shadow.audio
  const sfx = {}
  for (const n of a.constructor.SFX) sfx[n] = await a.measure(n)
  const music = {}
  for (const m of ['menu', 'combat', 'boss']) music[m] = await a.measureMusic(m, 8)
  const ambience = {}
  for (const [k, level] of [['intro', 1], ['menu', 0.45], ['combat', 0.3]]) ambience[k] = await a.measureAmbience(level, 6)
  return { sfx, music, ambience }
})
await browser.close()

const f = (v) => (v <= -119 ? '   -inf' : v.toFixed(1).padStart(7))
console.log('Offline render, 48 kHz. "mix" = loudness at default volumes (sfx 70%, music 45%, master 80%).')
console.log('loudness = loudest 100 ms window, K-weighted (≈ momentary LUFS). Measured, not listened to.\n')
console.log(`${'effect'.padEnd(14)} ${'peak dBFS'.padStart(9)} ${'loudness'.padStart(9)} ${'mix'.padStart(7)} ${'length s'.padStart(9)}`)
const rows = Object.entries(report.sfx).sort((a, b) => b[1].loudness - a[1].loudness)
for (const [name, r] of rows) {
  console.log(`${name.padEnd(14)} ${f(r.peakDb).padStart(9)} ${f(r.loudness).padStart(9)} ${f(r.loudness + SFX_OFFSET)} ${r.duration.toFixed(2).padStart(9)}`)
}
console.log(`\n${'music / bed'.padEnd(14)} ${'peak dBFS'.padStart(9)} ${'loudness'.padStart(9)} ${'mix'.padStart(7)} ${'mean'.padStart(9)}`)
for (const [name, r] of Object.entries(report.music)) {
  console.log(`${('music ' + name).padEnd(14)} ${f(r.peakDb).padStart(9)} ${f(r.loudness).padStart(9)} ${f(r.loudness + MUSIC_OFFSET)} ${f(r.integrated + MUSIC_OFFSET).padStart(9)}`)
}
for (const [name, r] of Object.entries(report.ambience)) {
  console.log(`${('ambience ' + name).padEnd(14)} ${f(r.peakDb).padStart(9)} ${f(r.loudness).padStart(9)} ${f(r.loudness + MUSIC_OFFSET)} ${f(r.integrated + MUSIC_OFFSET).padStart(9)}`)
}
const hot = rows.filter(([, r]) => r.peakDb > -1)
console.log(hot.length ? `\nClipping risk (peak above -1 dBFS before the limiter): ${hot.map(([n]) => n).join(', ')}` : '\nNo effect peaks above -1 dBFS before the limiter.')
