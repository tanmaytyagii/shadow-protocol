// Soak test: replays the opening cinematic, starts runs, fights a boss and
// quits back to the menu through the real UI, again and again, then checks
// that nothing accumulates: JS heap (after forced GC), DOM nodes, running
// animations, window/document listeners, animation-frame loops and engine pools.
//
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   npm run soak            (or: node scripts/soak.mjs --cycles=12)
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, '').split('='))
    .map(([k, v]) => [k, v ?? 'true']),
)
const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const CYCLES = Number(args.cycles ?? 10)
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
  (p) => p && existsSync(p),
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Waits use locators, never page.waitForSelector: the element handles it
// returns pin whole unmounted screens in memory and would read as a leak.

const browser = await chromium.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
await context.addInitScript(() => {
  if (!localStorage.getItem('shadow-protocol:profile:v1')) {
    localStorage.setItem('shadow-protocol:profile:v1', JSON.stringify({ version: 1, tutorialSeen: true, introSeen: true }))
  }
  // Count animation-frame requests so a duplicated loop shows up as a doubled rate.
  const raf = window.requestAnimationFrame.bind(window)
  window.__rafCalls = 0
  window.requestAnimationFrame = (cb) => {
    window.__rafCalls++
    return raf(cb)
  }
})
const page = await context.newPage()
const problems = []
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))
const cdp = await context.newCDPSession(page)
await cdp.send('HeapProfiler.enable')

await page.goto(`${BASE}/?debug`)
await page.locator('text=New Run').first().waitFor()

async function listeners(expression) {
  const { result } = await cdp.send('Runtime.evaluate', { expression })
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
  return listeners.length
}

async function sample() {
  await sleep(600)
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  const rafStart = await page.evaluate(() => window.__rafCalls)
  await sleep(1000)
  const state = await page.evaluate((rafStart) => {
    const g = window.__shadow
    return {
      raf: window.__rafCalls - rafStart,
      dom: document.getElementsByTagName('*').length,
      animations: document.getAnimations().length,
      particles: g.fx.particles.length,
      projectilePool: g.projectilePool.length,
      enemies: g.enemies.length,
      projectiles: g.projectiles.length,
      distortions: g.vfx.distortions.length,
      sprites: g.debugCaches().sprites,
      phase: g.phase,
    }
  }, rafStart)
  return { heapMb: usedSize / 1048576, windowListeners: await listeners('window'), documentListeners: await listeners('document'), ...state }
}

async function cycle() {
  // Replay the opening, then skip it.
  await page.click('button:has-text("Credits")')
  await page.click('button:has-text("Replay intro")')
  await page.locator('section[aria-label="Opening sequence"]').first().waitFor()
  await sleep(1500)
  await page.keyboard.press('Escape')
  await page.locator('text=New Run').first().waitFor()
  // A run with a boss fight, ended by quitting from the pause menu.
  await page.click('button:has-text("New Run")')
  await page.click('button:has-text("Deploy")')
  await page.waitForFunction(() => window.__shadow.phase === 'playing')
  await page.evaluate(() => {
    const g = window.__shadow
    g.god = true
    g.input.usingTouch = true
    window.__soakBot = setInterval(() => {
      const p = g.player
      const o = g.store.getState().levelUp
      if (g.phase === 'levelup' && o) g.chooseUpgrade(o.cards[0].id)
      const target = g.enemies.find((e) => e.alive && e.spawnTimer <= 0)
      if (target) g.input.setTouchAim(target.x - p.x, target.y - p.y, true)
      g.input.setTouchMove(Math.cos(performance.now() / 900) * 0.7, Math.sin(performance.now() / 700) * 0.7)
    }, 50)
  })
  await sleep(2500)
  await page.evaluate(() => window.__shadow.debugSkipToWave(5))
  await page.waitForFunction(() => window.__shadow.director.boss?.spawnTimer <= 0, null, { timeout: 15000 })
  await sleep(2500)
  await page.evaluate(() => {
    const g = window.__shadow
    const b = g.director.boss
    if (b) {
      b.invuln = 0
      g.damageEnemy(b, b.hp + 1, { crit: false, kx: 0, ky: 0, knockback: 0 })
    }
  })
  await sleep(2000)
  await page.evaluate(() => clearInterval(window.__soakBot))
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__shadow.phase === 'paused')
  await page.click('button:has-text("Main Menu")')
  await page.click('button:has-text("Yes, quit")')
  await page.locator('text=New Run').first().waitFor()
}

const rows = []
rows.push({ cycle: 0, ...(await sample()) })
for (let i = 1; i <= CYCLES; i++) {
  await cycle()
  rows.push({ cycle: i, ...(await sample()) })
  const r = rows[rows.length - 1]
  console.log(
    `cycle ${String(i).padStart(2)}  heap ${r.heapMb.toFixed(2).padStart(6)} MB  dom ${String(r.dom).padStart(4)}  animations ${String(r.animations).padStart(3)}  ` +
      `listeners win ${r.windowListeners} doc ${r.documentListeners}  rAF/s ${String(r.raf).padStart(3)}  pool ${r.projectilePool}  sprites ${r.sprites}`,
  )
}
await browser.close()

// Least-squares slope of heap over cycles 2..N (cycle 1 warms caches).
const tail = rows.slice(2)
const n = tail.length
const mx = tail.reduce((a, r) => a + r.cycle, 0) / n
const my = tail.reduce((a, r) => a + r.heapMb, 0) / n
const slope = tail.reduce((a, r) => a + (r.cycle - mx) * (r.heapMb - my), 0) / tail.reduce((a, r) => a + (r.cycle - mx) ** 2, 0)
const first = rows[1]
const last = rows[rows.length - 1]
const results = [
  ['Heap does not grow across cycles', slope * 1024 < 250, `${(slope * 1024).toFixed(0)} KB/cycle after warm-up (${rows[0].heapMb.toFixed(1)} -> ${last.heapMb.toFixed(1)} MB)`],
  ['DOM size returns to the same menu', Math.abs(last.dom - first.dom) <= 3, `${first.dom} -> ${last.dom} elements`],
  ['No animations left running', last.animations <= first.animations, `${first.animations} -> ${last.animations}`],
  ['Listeners are removed', last.windowListeners === first.windowListeners && last.documentListeners === first.documentListeners, `window ${first.windowListeners} -> ${last.windowListeners}, document ${first.documentListeners} -> ${last.documentListeners}`],
  ['Single animation loop', rows.every((r) => r.raf <= 70), `max ${Math.max(...rows.map((r) => r.raf))} frame requests/s`],
  ['Sprite caches stay bounded', last.sprites <= rows[2].sprites + 8 && last.sprites < 160, `${rows[1].sprites} -> ${last.sprites} cached canvases`],
  ['Engine pools stay bounded', last.projectilePool <= Math.max(600, first.projectilePool * 1.5) && last.enemies === 0 && last.projectiles === 0, `pool ${first.projectilePool} -> ${last.projectilePool}`],
  ['Console clean', problems.length === 0, problems.slice(0, 5).join(' | ')],
]
let failed = false
for (const [name, ok, detail] of results) {
  if (!ok) failed = true
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  — ${detail}`)
}
process.exit(failed ? 1 : 0)
