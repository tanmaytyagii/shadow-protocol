// Visual QA: captures every important screen across a matrix of viewports and
// audits each one for layout problems: horizontal overflow, controls that
// leave the viewport, touch targets under 44 px on touch devices, overlapping
// controls and truncated labels. Writes PNGs, report.json and index.html.
//
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   npm run screens -- --out=test-artifacts/ui/after [--viewports=phone-390,desk-1440] [--chains=menu,combat]
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
const OUT = args.out ?? 'test-artifacts/ui/latest'
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
  (p) => p && existsSync(p),
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const VIEWPORTS = {
  'phone-320': { width: 320, height: 568, deviceScaleFactor: 2, touch: true },
  'phone-390': { width: 390, height: 844, deviceScaleFactor: 3, touch: true },
  'phone-430': { width: 430, height: 932, deviceScaleFactor: 3, touch: true },
  'phone-land': { width: 844, height: 390, deviceScaleFactor: 3, touch: true },
  'tablet-port': { width: 768, height: 1024, deviceScaleFactor: 2, touch: true },
  'tablet-land': { width: 1024, height: 768, deviceScaleFactor: 2, touch: true },
  'desk-1280': { width: 1280, height: 720, deviceScaleFactor: 1, touch: false },
  'desk-1440': { width: 1440, height: 900, deviceScaleFactor: 2, touch: false },
  ultrawide: { width: 2560, height: 1080, deviceScaleFactor: 1, touch: false },
}

const RETURNING = {
  profile: {
    version: 1,
    highScore: 33982,
    bestWave: 10,
    bestTime: 812,
    totalKills: 1450,
    runs: 7,
    victories: 1,
    bossesDefeated: 3,
    unlockedWeapons: ['pulse', 'scatter', 'lancer', 'seeker'],
    hardUnlocked: true,
    tutorialSeen: true,
    introSeen: true,
    lastLoadout: { weapon: 'lancer', difficulty: 'hard' },
  },
  run: {
    version: 1, difficulty: 'normal', startWeapon: 'scatter', wave: 4, score: 5200, kills: 160, time: 300, level: 7, xp: 10, hp: 80, shield: 20, energy: 60,
    upgrades: { damage: 2 }, weapons: ['pulse', 'scatter'], ammo: { scatter: 30 }, currentWeapon: 'scatter', bossesDefeated: 0, shotsFired: 900, shotsHit: 500, damageDealt: 20000, savedAt: 1,
  },
}
const MIDGAME = { profile: { version: 1, runs: 2, highScore: 9000, unlockedWeapons: ['pulse', 'scatter'], tutorialSeen: true, introSeen: true } }

const INTRO = 'section[aria-label="Opening sequence"]'

/** In-page layout audit; returns problems found on the current screen. */
function audit(touch) {
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
  }
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40)
  const controls = [...document.querySelectorAll('button, input, a[href], [role="switch"], [role="radio"], [tabindex]:not([tabindex="-1"])')].filter(visible)
  const overflow = []
  if (document.scrollingElement && document.scrollingElement.scrollWidth > vw + 1) overflow.push(`page +${document.scrollingElement.scrollWidth - vw}px`)
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) overflow.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} +${el.scrollWidth - el.clientWidth}px`)
  }
  const offscreen = controls
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.left < -1 || r.right > vw + 1
    })
    .map(label)
  const small = touch
    ? controls
        .filter((el) => el.tagName !== 'INPUT' || el.type !== 'range')
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width < 44 || r.height < 44
        })
        .map((el) => {
          const r = el.getBoundingClientRect()
          return `${label(el)} (${Math.round(r.width)}×${Math.round(r.height)})`
        })
    : []
  const overlaps = []
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i].getBoundingClientRect()
      const b = controls[j].getBoundingClientRect()
      if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue
      // Sticky action bars float over content scrolling beneath them by design.
      if (controls[i].closest('[data-sticky]') || controls[j].closest('[data-sticky]')) continue
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ix > 4 && iy > 4) overlaps.push(`${label(controls[i])} × ${label(controls[j])}`)
    }
  }
  const truncated = [...document.querySelectorAll('*')]
    .filter((el) => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && visible(el))
    .map(label)
  return { vw, vh, overflow, offscreen, small, overlaps, truncated }
}

async function shot(page, ctx, name) {
  await sleep(ctx.settle ?? 900)
  const dir = join(OUT, ctx.viewport)
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: join(dir, `${name}.png`) })
  const result = await page.evaluate(audit, ctx.touch)
  ctx.report[name] = result
  const issues = result.overflow.length + result.offscreen.length + result.small.length + result.overlaps.length
  process.stdout.write(`  ${ctx.viewport.padEnd(12)} ${name.padEnd(18)} ${issues ? `issues ${issues}` : 'ok'}${result.truncated.length ? ` (truncated ${result.truncated.length})` : ''}\n`)
}

async function open(browser, ctx, seed) {
  const vp = VIEWPORTS[ctx.viewport]
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    hasTouch: vp.touch,
    isMobile: vp.touch,
  })
  if (seed) {
    await context.addInitScript((s) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('shadow-protocol:profile:v1', JSON.stringify(s.profile))
      if (s.run) localStorage.setItem('shadow-protocol:run:v1', JSON.stringify(s.run))
    }, seed)
  }
  const page = await context.newPage()
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && ctx.console.push(`${ctx.viewport}: ${m.text()}`))
  page.on('pageerror', (e) => ctx.console.push(`${ctx.viewport}: ${e.message}`))
  await page.goto(`${BASE}/?debug`)
  return { context, page }
}

const menu = (page) => page.locator('text=New Run').first().waitFor()
const G = (page, fn, arg) => page.evaluate(fn, arg)

const CHAINS = {
  // First launch: intro, menu, loadout and the briefing as a new player sees them.
  async first(browser, ctx) {
    const { context, page } = await open(browser, ctx, null)
    await page.locator('button:has-text("Start Game")').waitFor({ timeout: 20000 })
    await sleep(400)
    await shot(page, ctx, 'intro')
    await page.click('button:has-text("Start Game")')
    await menu(page)
    await sleep(2200)
    await shot(page, ctx, 'menu-first')
    await page.click('button:has-text("New Run")')
    await page.locator('text=Choose your loadout').first().waitFor()
    await shot(page, ctx, 'loadout-first')
    await page.click('button:has-text("Deploy")')
    await page.locator('text=How to survive').first().waitFor()
    await shot(page, ctx, 'briefing')
    await context.close()
  },
  // Returning player with records, every unlock and a saved run.
  async menu(browser, ctx) {
    const { context, page } = await open(browser, ctx, RETURNING)
    await menu(page)
    await sleep(1200)
    await shot(page, ctx, 'menu-returning')
    await page.click('button:has-text("Settings")')
    await page.locator('text=Screen shake').first().waitFor()
    await shot(page, ctx, 'settings')
    await page.keyboard.press('Escape')
    await menu(page)
    await page.click('button:has-text("Credits")')
    await page.locator('text=Production').first().waitFor()
    await shot(page, ctx, 'credits')
    await page.keyboard.press('Escape')
    await menu(page)
    await page.click('button:has-text("New Run")')
    await page.locator('text=Choose your loadout').first().waitFor()
    await shot(page, ctx, 'loadout-unlocked')
    await context.close()
  },
  // A run in progress: HUD states, notifications, level-up, pause and defeat.
  async combat(browser, ctx) {
    const { context, page } = await open(browser, ctx, MIDGAME)
    await menu(page)
    await page.click('button:has-text("New Run")')
    await page.click('button:has-text("Deploy")')
    await page.waitForFunction(() => window.__shadow.phase === 'playing')
    await G(page, () => {
      const g = window.__shadow
      g.god = true
      g.debugSkipToWave(3)
      // Real level-ups (wave bonuses) would freeze the run between shots.
      window.__holdLevelUps = false
      window.setInterval(() => {
        const o = g.store.getState().levelUp
        if (g.phase === 'levelup' && o && !window.__holdLevelUps) g.chooseUpgrade(o.cards[0].id)
      }, 150)
    })
    await sleep(3200)
    await G(page, () => {
      const g = window.__shadow
      const p = g.player
      if (!p.weapons.includes('scatter')) p.weapons.push('scatter')
      p.ammo.scatter = 9
      p.current = 'scatter'
      p.powerUps.overdrive = 5
      g.score = 18450
      g.scoreShown = 18450
    })
    await shot(page, ctx, 'hud')
    await G(page, () => {
      const g = window.__shadow
      g.player.hp = g.player.stats.maxHp * 0.18
      g.player.shield = 0
    })
    await shot(page, ctx, 'hud-lowhp')
    await G(page, () => {
      const g = window.__shadow
      g.player.hp = g.player.stats.maxHp
      g.debugKillAll()
    })
    await page.waitForFunction(() => window.__shadow.director.state === 'intermission', null, { timeout: 8000 })
    await shot(page, ctx, 'wave-clear')
    await page.waitForFunction(() => window.__shadow.phase === 'playing')
    await G(page, () => {
      window.__holdLevelUps = true
      window.__shadow.queueLevelUp('level')
    })
    await page.waitForFunction(() => window.__shadow.phase === 'levelup')
    await shot(page, ctx, 'levelup')
    await G(page, () => {
      const g = window.__shadow
      window.__holdLevelUps = false
      g.chooseUpgrade(g.store.getState().levelUp.cards[0].id)
    })
    await page.waitForFunction(() => window.__shadow.phase === 'playing')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => window.__shadow.phase === 'paused')
    await shot(page, ctx, 'pause')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => window.__shadow.phase === 'playing')
    await G(page, () => window.__shadow.debugSkipToWave(5))
    await sleep(1100)
    await shot(page, ctx, 'boss-arrival')
    await page.waitForFunction(() => window.__shadow.director.boss?.spawnTimer <= 0, null, { timeout: 15000 })
    await sleep(1500)
    await shot(page, ctx, 'hud-boss')
    await G(page, () => {
      const g = window.__shadow
      g.god = false
      g.player.iframes = 0
      g.player.shield = 0
      g.damagePlayer(9999, g.player.x + 10, g.player.y)
    })
    await page.waitForFunction(() => window.__shadow.phase === 'gameover', null, { timeout: 8000 })
    await sleep(1400)
    await shot(page, ctx, 'gameover')
    await context.close()
  },
  async victory(browser, ctx) {
    const { context, page } = await open(browser, ctx, MIDGAME)
    await menu(page)
    await page.click('button:has-text("New Run")')
    await page.click('button:has-text("Deploy")')
    await page.waitForFunction(() => window.__shadow.phase === 'playing')
    await G(page, () => {
      window.__shadow.god = true
      window.__shadow.debugSkipToWave(10)
    })
    await page.waitForFunction(() => window.__shadow.director.boss?.spawnTimer <= 0, null, { timeout: 15000 })
    await G(page, () => {
      const g = window.__shadow
      const b = g.director.boss
      b.invuln = 0
      g.damageEnemy(b, b.hp + 1, { crit: false, kx: 0, ky: 0, knockback: 0 })
    })
    await page.waitForFunction(() => window.__shadow.phase === 'victory', null, { timeout: 12000 })
    await sleep(1400)
    await shot(page, ctx, 'victory')
    await context.close()
  },
}

const viewports = args.viewports ? args.viewports.split(',') : Object.keys(VIEWPORTS)
const chains = args.chains ? args.chains.split(',') : Object.keys(CHAINS)
const browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const report = {}
const consoleProblems = []
const jobs = viewports.flatMap((viewport) => chains.map((chain) => ({ viewport, chain })))
let next = 0
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++]
    report[job.viewport] ??= {}
    const ctx = { viewport: job.viewport, touch: VIEWPORTS[job.viewport].touch, report: report[job.viewport], console: consoleProblems }
    try {
      await CHAINS[job.chain](browser, ctx)
    } catch (err) {
      consoleProblems.push(`${job.viewport}/${job.chain} crashed: ${err.message.split('\n')[0]}`)
      process.stdout.write(`  ${job.viewport.padEnd(12)} ${job.chain} CRASHED: ${err.message.split('\n')[0]}\n`)
    }
  }
}
console.log(`Capturing ${chains.join(', ')} on ${viewports.length} viewports into ${OUT}/`)
await Promise.all([worker(), worker(), worker()])
await browser.close()

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ report, console: consoleProblems }, null, 2))
const order = ['intro', 'menu-first', 'menu-returning', 'loadout-first', 'loadout-unlocked', 'briefing', 'settings', 'credits', 'hud', 'hud-lowhp', 'wave-clear', 'boss-arrival', 'hud-boss', 'levelup', 'pause', 'gameover', 'victory']
const rows = order
  .map((s) => `<h2>${s}</h2><div class="row">${viewports.map((v) => (report[v]?.[s] ? `<figure><img loading="lazy" src="${v}/${s}.png"><figcaption>${v}</figcaption></figure>` : '')).join('')}</div>`)
  .join('\n')
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Screens</title><style>body{background:#05070f;color:#dbe6ff;font:13px system-ui;margin:24px}h2{font-size:14px;letter-spacing:.2em;text-transform:uppercase;margin:28px 0 8px}.row{display:flex;gap:12px;overflow-x:auto;align-items:flex-start}figure{margin:0}img{height:260px;border:1px solid #1c2a4d}figcaption{color:#7d8bb3;margin-top:4px}</style>${rows}`,
)
let totals = { overflow: 0, offscreen: 0, small: 0, overlaps: 0, truncated: 0 }
for (const v of Object.values(report)) for (const r of Object.values(v)) for (const k of Object.keys(totals)) totals[k] += r[k].length
console.log(`\nTotals: ${JSON.stringify(totals)}${consoleProblems.length ? ` | console/crash problems: ${consoleProblems.length}` : ' | console clean'}`)
