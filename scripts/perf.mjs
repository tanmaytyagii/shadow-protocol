// Performance probe: measures per-frame engine cost (update + render, CPU side)
// and frame pacing while a bot fights through the heaviest scenarios.
//
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   node scripts/perf.mjs [--throttle=4] [--quality=high] [--width=1440 --height=900 --dpr=2]
//
// Headless Chrome may rasterise the canvas differently from a desktop GPU, so
// treat absolute numbers as indicative and compare runs against each other.
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, '').split('='))
    .map(([k, v]) => [k, v ?? 'true']),
)
const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const THROTTLE = Number(args.throttle ?? 1)
const QUALITY = args.quality ?? 'high'
const WIDTH = Number(args.width ?? 1440)
const HEIGHT = Number(args.height ?? 900)
const DPR = Number(args.dpr ?? 2)
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
  (p) => p && existsSync(p),
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// --software forces CPU rasterisation: a stand-in for a weak or missing GPU.
const SOFTWARE = args.software === 'true'
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: SOFTWARE ? ['--disable-gpu', '--disable-gpu-compositing', '--disable-accelerated-2d-canvas'] : ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: DPR })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.addInitScript((quality) => {
  localStorage.setItem(
    'shadow-protocol:settings:v1',
    JSON.stringify({ masterVolume: 0, sfxVolume: 0, musicVolume: 0, muted: true, screenShake: 0.8, graphics: quality, damageNumbers: true, showFps: false, touchControls: 'off' }),
  )
  localStorage.setItem('shadow-protocol:profile:v1', JSON.stringify({ version: 1, tutorialSeen: true, introSeen: true, unlockedWeapons: ['pulse', 'scatter', 'lancer', 'seeker'] }))
}, QUALITY)
// `?intro` replays the opening cinematic even though the profile has seen it.
await page.goto(`${BASE}/?debug&intro`)
await page.waitForSelector('section[aria-label="Opening sequence"]')

if (THROTTLE > 1) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
}

const renderer = await page.evaluate(() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
  } catch {
    return 'unknown'
  }
})

// Instrument the engine tick and frame pacing.
await page.evaluate(() => {
  const g = window.__shadow
  const tick = g.tick.bind(g)
  window.__perf = { work: [], gaps: [], last: 0, particles: 0, recording: false }
  g.tick = (dt) => {
    const t0 = performance.now()
    tick(dt)
    const p = window.__perf
    if (p.recording) {
      p.work.push(performance.now() - t0)
      let alive = 0
      for (const q of g.fx.particles) if (q.alive) alive++
      p.particles = Math.max(p.particles, alive)
    }
  }
  const pace = (t) => {
    const p = window.__perf
    if (p.recording && p.last) p.gaps.push(t - p.last)
    p.last = t
    requestAnimationFrame(pace)
  }
  requestAnimationFrame(pace)
  // Simple combat bot: strafe and fire at the nearest enemy.
  window.__bot = setInterval(() => {
    const g = window.__shadow
    if (g.phase !== 'playing') {
      const o = g.store.getState().levelUp
      if (g.phase === 'levelup' && o) g.chooseUpgrade(o.cards[0].id)
      return
    }
    const p = g.player
    let best = null
    let bd = Infinity
    for (const e of g.enemies) {
      if (!e.alive || e.spawnTimer > 0) continue
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
      if (d < bd) {
        bd = d
        best = e
      }
    }
    g.input.usingTouch = true
    if (best) g.input.setTouchAim(best.x - p.x, best.y - p.y, true)
    const t = performance.now() / 1000
    g.input.setTouchMove(Math.cos(t * 0.9) * 0.8, Math.sin(t * 1.3) * 0.8)
  }, 50)
})

async function measure(name, ms, setup) {
  if (setup) await setup()
  await page.evaluate(() => {
    window.__perf.work = []
    window.__perf.gaps = []
    window.__perf.particles = 0
    window.__perf.recording = true
  })
  await sleep(ms)
  const r = await page.evaluate(() => {
    const p = window.__perf
    p.recording = false
    const sorted = (a) => [...a].sort((x, y) => x - y)
    const pct = (a, q) => (a.length ? sorted(a)[Math.min(a.length - 1, Math.floor(a.length * q))] : 0)
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
    const g = window.__shadow
    return {
      frames: p.work.length,
      workAvg: avg(p.work),
      workP95: pct(p.work, 0.95),
      workMax: Math.max(0, ...p.work),
      fps: p.gaps.length ? 1000 / avg(p.gaps) : 0,
      gapP95: pct(p.gaps, 0.95),
      longFrames: p.gaps.filter((x) => x > 33.4).length,
      particles: p.particles,
      enemies: g.enemies.length,
      bullets: g.projectiles.length,
      level: g.governor ? g.governor.level : 0,
    }
  })
  console.log(
    `${name.padEnd(30)} work avg ${r.workAvg.toFixed(2).padStart(5)}ms p95 ${r.workP95.toFixed(2).padStart(5)}ms max ${r.workMax.toFixed(1).padStart(5)}ms | ` +
      `fps ${r.fps.toFixed(0).padStart(3)} gap p95 ${r.gapP95.toFixed(1).padStart(5)}ms >33ms:${String(r.longFrames).padStart(3)} | ` +
      `peak particles ${String(r.particles).padStart(4)} enemies ${String(r.enemies).padStart(3)} bullets ${String(r.bullets).padStart(3)} | quality step ${r.level}`,
  )
  return r
}

console.log(`Chrome renderer: ${SOFTWARE ? 'software (GPU disabled)' : renderer} | viewport ${WIDTH}x${HEIGHT} @${DPR}x | quality ${QUALITY} | CPU throttle ${THROTTLE}x`)

// Boot log, power surge, title and the pull-back to the establishing shot.
await measure('Opening cinematic', 10500)
await page.keyboard.press('Enter')
await page.waitForSelector('text=New Run')
await sleep(3000) // camera hand-over to the menu
await measure('Menu (attract mode)', 4000)

await page.evaluate(() => {
  const g = window.__shadow
  g.startRun({ difficulty: 'hard', startWeapon: 'scatter' })
  g.god = true
  for (const id of ['multishot', 'multishot', 'firerate', 'firerate', 'volatile']) g.applyUpgrade(id)
  g.debugSkipToWave(9)
})
await sleep(6000) // let the wave fill up
await measure('Wave 9 Nightmare melee', 8000)

await measure('Mass detonation (kill all)', 1500, () =>
  page.evaluate(() => {
    const g = window.__shadow
    for (const e of g.enemies) if (e.alive && !e.isBoss) g.killEnemy(e)
  }),
)

await page.evaluate(() => window.__shadow.debugSkipToWave(5))
await sleep(5500)
await measure('Warden fight', 8000)

await page.evaluate(() => window.__shadow.debugSkipToWave(10))
await sleep(5500)
await page.evaluate(() => {
  const b = window.__shadow.director.boss
  if (b) b.hp = b.maxHp * 0.3
})
await sleep(2500)
await measure('Sovereign phase 3', 10000)

await measure('Boss defeat sequence', 3000, () =>
  page.evaluate(() => {
    const g = window.__shadow
    const b = g.director.boss
    if (b) {
      b.invuln = 0
      g.damageEnemy(b, b.hp + 1, { crit: false, kx: 0, ky: 0, knockback: 0 })
    }
  }),
)

await browser.close()
if (errors.length) {
  console.log(`Page errors:\n${errors.join('\n')}`)
  process.exit(1)
}
