// Landing-page QA: screenshots of the main menu at every target viewport, for
// three player states, plus layout checks and a live-resize pass.
//
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   npm run landing:qa -- --out=test-artifacts/landing/after
//
// For each viewport and state it records whether the canvas covers the window,
// horizontal overflow, page scrolling, whether the title, primary action,
// operative record and footer sit fully on screen without colliding, clipped
// text, one-line title words and touch-target sizes. Writes PNGs, report.json
// and index.html. Exits non-zero when a check fails.
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, '').split('='))
    .map(([k, v]) => [k, v ?? 'true']),
)
const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = args.out ?? 'test-artifacts/landing/latest'
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
  (p) => p && existsSync(p),
)
if (!executablePath) {
  console.error('No Chrome/Chromium found. Set CHROME_PATH.')
  process.exit(1)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Desktop viewports must fit without page scrolling; the rest may scroll. */
const VIEWPORTS = {
  '1280x720': { width: 1280, height: 720, dpr: 1, desktop: true },
  '1366x768': { width: 1366, height: 768, dpr: 1, desktop: true },
  '1440x900': { width: 1440, height: 900, dpr: 2, desktop: true },
  '1600x900': { width: 1600, height: 900, dpr: 1, desktop: true },
  '1920x1080': { width: 1920, height: 1080, dpr: 1, desktop: true },
  '2560x1080': { width: 2560, height: 1080, dpr: 1, desktop: true },
  '1024x768': { width: 1024, height: 768, dpr: 2, desktop: true },
  '768x1024': { width: 768, height: 1024, dpr: 2, touch: true },
  '390x844': { width: 390, height: 844, dpr: 3, touch: true },
  '320x700': { width: 320, height: 700, dpr: 2, touch: true },
}

const PROFILE = { version: 1, highScore: 33982, bestWave: 10, bestTime: 812, totalKills: 1450, runs: 7, victories: 1, bossesDefeated: 3, tutorialSeen: true, introSeen: true }
const RUN = { version: 1, difficulty: 'normal', startWeapon: 'scatter', wave: 4, score: 5200, kills: 160, time: 300, level: 7, xp: 10, hp: 80, shield: 20, energy: 60, upgrades: { damage: 2 }, weapons: ['pulse', 'scatter'], ammo: { scatter: 30 }, currentWeapon: 'scatter', bossesDefeated: 0, shotsFired: 900, shotsHit: 500, damageDealt: 20000, savedAt: 1 }
const STATES = {
  // A returning player with Nightmare unlocked and no saved run (the reference layout).
  veteran: { profile: { ...PROFILE, unlockedWeapons: ['pulse', 'scatter', 'lancer', 'seeker'], hardUnlocked: true }, run: null },
  // Mid-progression with a checkpoint to continue.
  continue: { profile: { ...PROFILE, highScore: 9120, bestWave: 6, bestTime: 401, totalKills: 520, runs: 3, victories: 0, unlockedWeapons: ['pulse', 'scatter', 'lancer'], hardUnlocked: false }, run: RUN },
  // First launch after the intro.
  first: { profile: { version: 1, introSeen: true }, run: null },
}

/** Runs in the page: geometry of the landing page's regions and layout problems. */
function inspect({ desktop, touch }) {
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }
  }
  const menu = document.querySelector('nav[aria-label="Main menu"]')
  const root = menu?.closest('[data-launcher]') ?? menu?.parentElement?.closest('div.absolute') ?? document.body
  const primary = menu?.querySelector('button:not([disabled])')
  const title = document.querySelector('h1')
  const record = document.querySelector('aside')
  const footer = [...document.querySelectorAll('footer')].pop()
  const canvas = document.querySelector('canvas')
  const regions = { title: box(title), primary: box(primary), menu: box(menu), record: box(record), footer: box(footer), canvas: box(canvas) }
  const problems = []
  const fully = (name, b) => {
    if (!b) return problems.push(`${name} missing`)
    if (b.x < -1 || b.r > vw + 1) problems.push(`${name} outside the width (${b.x}..${b.r} of ${vw})`)
    if (desktop && (b.y < -1 || b.b > vh + 1)) problems.push(`${name} below the fold (${b.y}..${b.b} of ${vh})`)
  }
  fully('title', regions.title)
  fully('primary action', regions.primary)
  fully('main menu', regions.menu)
  fully('operative record', regions.record)
  fully('footer', regions.footer)
  const c = regions.canvas
  if (!c || c.x > 0 || c.y > 0 || c.r < vw || c.b < vh) problems.push(`canvas does not cover the window (${JSON.stringify(c)})`)
  // Horizontal overflow anywhere.
  if (document.scrollingElement.scrollWidth > vw + 1) problems.push(`page scrolls sideways (+${document.scrollingElement.scrollWidth - vw}px)`)
  for (const el of root.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) problems.push(`sideways scroll in ${el.tagName.toLowerCase()} (+${el.scrollWidth - el.clientWidth}px)`)
  }
  // Vertical scrolling: none on desktop layouts.
  let scroller = null
  for (let el = menu; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el)
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) scroller = el
  }
  const scrollY = scroller ? scroller.scrollHeight - scroller.clientHeight : 0
  if (desktop && scrollY > 0) problems.push(`landing page scrolls vertically (+${scrollY}px)`)
  // Region collisions (the record and footer may not overlap the hero column).
  const hit = (a, b) => a && b && Math.min(a.r, b.r) - Math.max(a.x, b.x) > 2 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 2
  const hero = regions.title && regions.menu ? { x: Math.min(regions.title.x, regions.menu.x), y: regions.title.y, r: Math.max(regions.title.r, regions.menu.r), b: regions.menu.b } : null
  if (hit(hero, regions.record)) problems.push('operative record collides with the title or menu')
  if (hit(hero, regions.footer)) problems.push('footer collides with the title or menu')
  if (hit(regions.record, regions.footer)) problems.push('footer collides with the operative record')
  // Clipped text: ellipsis or content wider than its box in the landing page.
  for (const el of root.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.getBoundingClientRect().width > 0) problems.push(`truncated: "${el.textContent.trim().slice(0, 30)}"`)
  }
  // Each title word stays on one line: no taller than one line box.
  const words = title ? [...title.querySelectorAll('[data-title-word]')] : []
  for (const w of words) {
    const s = getComputedStyle(w)
    const line = s.lineHeight === 'normal' ? parseFloat(s.fontSize) * 1.25 : parseFloat(s.lineHeight)
    if (w.getBoundingClientRect().height > line * 1.5) problems.push(`title word "${w.textContent.trim()}" wraps`)
  }
  // Touch targets.
  if (touch) {
    for (const el of root.querySelectorAll('button, a[href]')) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && (r.width < 44 || r.height < 44)) problems.push(`small target "${el.textContent.trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`)
    }
  }
  const font = title ? parseFloat(getComputedStyle(title.querySelector('[data-title-word]') ?? title).fontSize) : 0
  return { vw, vh, regions, scrollY, titleFont: Math.round(font), problems }
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath, headless: true })
const report = {}
const consoleProblems = []
let failures = 0

async function open(vp, state) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, hasTouch: !!vp.touch, isMobile: !!vp.touch })
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.clear()
    localStorage.setItem('shadow-protocol:profile:v1', JSON.stringify(s.profile))
    if (s.run) localStorage.setItem('shadow-protocol:run:v1', JSON.stringify(s.run))
  }, STATES[state])
  const page = await ctx.newPage()
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/AudioContext/.test(m.text()) && consoleProblems.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => consoleProblems.push(`[pageerror] ${e.message}`))
  await page.goto(`${BASE}/?debug`)
  await page.waitForSelector('nav[aria-label="Main menu"]')
  // Entrance animations and the camera settling on its framing.
  await sleep(2600)
  return { ctx, page }
}

const only = args.viewports ? args.viewports.split(',') : Object.keys(VIEWPORTS)
const states = args.states ? args.states.split(',') : Object.keys(STATES)
for (const name of only) {
  const vp = VIEWPORTS[name]
  report[name] = {}
  for (const state of states) {
    const { ctx, page } = await open(vp, state)
    const dir = join(OUT, name)
    mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: join(dir, `${state}.png`) })
    const r = await page.evaluate(inspect, { desktop: !!vp.desktop, touch: !!vp.touch })
    report[name][state] = r
    failures += r.problems.length
    console.log(`${name.padEnd(10)} ${state.padEnd(9)} title ${String(r.titleFont).padStart(3)}px  ${r.problems.length ? 'PROBLEMS: ' + r.problems.join('; ') : 'ok'}`)
    await ctx.close()
  }
}

// Live resize: one page taken through a sequence of window sizes.
const resize = []
if (!args.viewports) {
  const { ctx, page } = await open(VIEWPORTS['1440x900'], 'veteran')
  const steps = [
    [1440, 900],
    [1100, 700],
    [1920, 1080],
    [2560, 1080],
    [1280, 620],
    [900, 900],
    [1366, 768],
  ]
  mkdirSync(join(OUT, 'resize'), { recursive: true })
  for (const [w, h] of steps) {
    await page.setViewportSize({ width: w, height: h })
    await sleep(900)
    const r = await page.evaluate(inspect, { desktop: w >= 1024 && h >= 600, touch: false })
    const cam = await page.evaluate(() => {
      const g = window.__shadow
      const c = document.querySelector('canvas')
      return { viewW: g.camera.viewW, viewH: g.camera.viewH, css: c.clientWidth, px: c.width, dpr: g.dpr }
    })
    if (cam.viewW !== w || cam.viewH !== h || cam.css !== w) r.problems.push(`canvas/camera not resized (${JSON.stringify(cam)})`)
    await page.screenshot({ path: join(OUT, 'resize', `${w}x${h}.png`) })
    resize.push({ size: `${w}x${h}`, ...r, cam })
    failures += r.problems.length
    console.log(`resize ${`${w}x${h}`.padEnd(10)} ${r.problems.length ? 'PROBLEMS: ' + r.problems.join('; ') : 'ok'}`)
  }
  await ctx.close()
}
await browser.close()

writeFileSync(join(OUT, 'report.json'), JSON.stringify({ report, resize, console: consoleProblems }, null, 2))
const rows = Object.entries(report)
  .map(
    ([vp, s]) =>
      `<h2>${vp}</h2><div class="row">${Object.entries(s)
        .map(([st, r]) => `<figure><a href="${vp}/${st}.png"><img src="${vp}/${st}.png" alt="${vp} ${st}"></a><figcaption>${st}: ${r.problems.length ? r.problems.join('; ') : 'no problems'}</figcaption></figure>`)
        .join('')}</div>`,
  )
  .join('')
const resizeRow = resize.length
  ? `<h2>Live resize</h2><div class="row">${resize.map((r) => `<figure><img src="resize/${r.size}.png" alt="${r.size}"><figcaption>${r.size}: ${r.problems.length ? r.problems.join('; ') : 'no problems'}</figcaption></figure>`).join('')}</div>`
  : ''
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Landing QA</title><style>body{background:#05070f;color:#dbe6ff;font:13px system-ui;margin:24px}h2{font-size:14px;letter-spacing:.2em;text-transform:uppercase;margin:28px 0 8px}.row{display:flex;gap:12px;overflow-x:auto;align-items:flex-start}figure{margin:0}img{height:280px;border:1px solid #1c2a4d}figcaption{color:#7d8bb3;margin-top:4px;max-width:520px}</style>${rows}${resizeRow}`,
)
if (consoleProblems.length) {
  console.log('Console:', consoleProblems.slice(0, 6).join(' | '))
  failures += consoleProblems.length
}
console.log(`\n${failures === 0 ? 'All landing checks passed' : `${failures} problem(s)`}. Report: ${join(OUT, 'index.html')}`)
process.exit(failures ? 1 : 0)
