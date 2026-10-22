// README screenshots: captures the gallery in docs/screenshots/ from the real
// production build. Combat is played through real keyboard, mouse and touch
// input by a small aiming/kiting bot; nothing in the game state is edited to
// stage a shot. The documented `?debug` mode is used for three things only:
// skipping ahead to the boss waves, god mode during the boss captures, and the
// `H` hotkey (20% boss damage) to reach the victory screen. See
// docs/screenshots/README.md.
//
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   npm run docs:screenshots -- [--out=test-artifacts/readme] [--chains=menus,play,bosses,victory,mobile]
//
// Writes PNGs to --out (default test-artifacts/readme). Pick the best frames and
// convert them with scripts/optimize-screenshots.mjs.
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
const OUT = args.out ?? 'test-artifacts/readme'
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
  (p) => p && existsSync(p),
)
if (!executablePath) {
  console.error('No Chrome/Chromium found. Set CHROME_PATH.')
  process.exit(1)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const G = (page, fn, arg) => page.evaluate(fn, arg)

const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 }
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
const PHONE_LAND = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }

// Test fixture (the same shape scripts/screens.mjs seeds): a returning player
// with records, every unlock and a checkpoint, so the menu shows Continue.
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
    lastLoadout: { weapon: 'scatter', difficulty: 'normal' },
  },
  run: {
    version: 1, difficulty: 'normal', startWeapon: 'scatter', wave: 4, score: 5200, kills: 160, time: 300, level: 7, xp: 10, hp: 80, shield: 20, energy: 60,
    upgrades: { damage: 2 }, weapons: ['pulse', 'scatter'], ammo: { scatter: 30 }, currentWeapon: 'scatter', bossesDefeated: 0, shotsFired: 900, shotsHit: 500, damageDealt: 20000, savedAt: 1,
  },
}
/** A player who has finished the briefing once and unlocked every loadout; records are empty. */
const VETERAN = { profile: { ...RETURNING.profile, highScore: 0, bestWave: 0, bestTime: 0, totalKills: 0, runs: 0, victories: 0, bossesDefeated: 0 } }

let browser
const log = (msg) => console.log(`  ${msg}`)

async function open(device, seed, query = '?debug') {
  const context = await browser.newContext(device)
  await context.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('shadow-protocol:settings:v1', JSON.stringify({ graphics: 'high', showFps: false, damageNumbers: true }))
    if (!s) return
    localStorage.setItem('shadow-protocol:profile:v1', JSON.stringify(s.profile))
    if (s.run) localStorage.setItem('shadow-protocol:run:v1', JSON.stringify(s.run))
  }, seed)
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error(`  page error: ${e.message}`))
  await page.goto(`${BASE}/${query}`)
  return { context, page }
}

async function shot(page, name, settle = 600) {
  await sleep(settle)
  mkdirSync(OUT, { recursive: true })
  const level = await G(page, () => window.__shadow?.governor?.level ?? 0).catch(() => 0)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  log(`${name}.png${level ? ` (adaptive quality step ${level})` : ''}`)
}

const menuReady = (page) => page.locator('text=New Run').first().waitFor({ timeout: 20000 })

async function deploy(page) {
  await menuReady(page)
  await page.click('button:has-text("New Run")')
  await page.locator('text=Choose your loadout').first().waitFor()
  await page.click('button:has-text("Deploy")')
  await page.waitForFunction(() => window.__shadow.phase === 'playing', null, { timeout: 15000 })
}

/** One bot decision, computed in the page from the live game state. */
function decide() {
  const g = window.__shadow
  const p = g.player
  let target = null
  let best = Infinity
  let pushX = 0
  let pushY = 0
  let closest = Infinity
  for (const e of g.enemies) {
    if (!e.alive) continue
    const dx = e.x - p.x
    const dy = e.y - p.y
    const d = Math.hypot(dx, dy) || 1
    const score = e.isBoss ? d * 0.6 : d
    if (score < best) {
      best = score
      target = e
    }
    closest = Math.min(closest, d - (e.radius ?? 0))
    const reach = e.isBoss ? 420 : 300
    if (d < reach) {
      const w = (reach - d) / reach
      pushX -= (dx / d) * w
      pushY -= (dy / d) * w
    }
  }
  for (const pr of g.projectiles) {
    if (!pr.alive || pr.friendly) continue
    const dx = pr.x - p.x
    const dy = pr.y - p.y
    const d = Math.hypot(dx, dy) || 1
    if (d < 160) {
      // Step sideways out of the bullet's path.
      const side = Math.sign(dx * pr.vy - dy * pr.vx) || 1
      pushX += (-pr.vy / (Math.hypot(pr.vx, pr.vy) || 1)) * side * 0.6
      pushY += (pr.vx / (Math.hypot(pr.vx, pr.vy) || 1)) * side * 0.6
    }
  }
  // Drift back toward the middle of the deck, and circle the target.
  const cx = 1200 - p.x
  const cy = 800 - p.y
  const cd = Math.hypot(cx, cy) || 1
  pushX += (cx / cd) * Math.min(1, cd / 600) * 0.7
  pushY += (cy / cd) * Math.min(1, cd / 600) * 0.7
  if (target) {
    const tx = target.x - p.x
    const ty = target.y - p.y
    const td = Math.hypot(tx, ty) || 1
    pushX += (-ty / td) * 0.35
    pushY += (tx / td) * 0.35
  }
  const aim = target ? g.camera.worldToScreen(target.x, target.y) : g.camera.worldToScreen(p.x + 200, p.y)
  const me = g.camera.worldToScreen(p.x, p.y)
  return {
    phase: g.phase,
    firing: g.input.mouseDown,
    aim,
    me,
    keys: { KeyW: pushY < -0.25, KeyS: pushY > 0.25, KeyA: pushX < -0.25, KeyD: pushX > 0.25 },
    dash: closest < 70 && p.dashCooldown <= 0,
    enemies: g.enemies.filter((e) => e.alive).length,
    wave: g.director.wave,
    boss: !!g.director.boss?.alive,
  }
}

/** Plays with real keyboard and mouse input until `until(state)` is true or the time runs out. */
async function play(page, ms, until = () => false, onStep = async () => {}) {
  const held = new Set()
  let mouseDown = false
  const end = Date.now() + ms
  let s
  while (Date.now() < end) {
    s = await G(page, decide)
    if (s.phase !== 'playing') break
    await page.mouse.move(s.aim.x, s.aim.y)
    // Pausing or losing focus releases the game's mouse state; press again.
    if (!mouseDown || !s.firing) {
      if (mouseDown) await page.mouse.up()
      await page.mouse.down()
      mouseDown = true
    }
    for (const [k, on] of Object.entries(s.keys)) {
      if (on && !held.has(k)) {
        await page.keyboard.down(k)
        held.add(k)
      } else if (!on && held.has(k)) {
        await page.keyboard.up(k)
        held.delete(k)
      }
    }
    if (s.dash) await page.keyboard.press('Space')
    await onStep(s)
    if (until(s)) break
    await sleep(30)
  }
  for (const k of held) await page.keyboard.up(k)
  if (mouseDown) await page.mouse.up()
  return s
}

/** Picks the first augment with the keyboard, the way a player would. */
async function chooseAugment(page) {
  await page.waitForFunction(() => window.__shadow.phase === 'levelup')
  await sleep(900)
  await page.keyboard.press('Digit1')
  await page.waitForFunction(() => window.__shadow.phase === 'playing', null, { timeout: 5000 }).catch(() => {})
}

const CHAINS = {
  async menus() {
    // First launch: the opening cinematic's establishing shot.
    {
      const { context, page } = await open(DESKTOP, null, '')
      await page.locator('button:has-text("Start Game")').waitFor({ timeout: 25000 })
      await shot(page, 'intro', 800)
      await context.close()
    }
    const { context, page } = await open(DESKTOP, RETURNING)
    await menuReady(page)
    await shot(page, 'main-menu', 2400)
    await page.click('button:has-text("Settings")')
    await page.locator('text=Screen shake').first().waitFor()
    await shot(page, 'settings')
    await page.keyboard.press('Escape')
    await menuReady(page)
    await page.click('button:has-text("How to Play")')
    await page.locator('text=How to survive').first().waitFor()
    await shot(page, 'how-to-play')
    await page.keyboard.press('Escape')
    await menuReady(page)
    await page.click('button:has-text("New Run")')
    await page.locator('text=Choose your loadout').first().waitFor()
    await shot(page, 'loadout')
    await context.close()
  },

  // A normal run from wave 1, played by the bot without god mode or skips.
  async play() {
    const { context, page } = await open(DESKTOP, VETERAN)
    await deploy(page)
    let n = 0
    let lastShot = 0
    let paused = false
    let levelUps = 0
    const started = Date.now()
    // A short clip for the README hero: timestamped screenshots taken alongside the bot's input.
    const clip = { state: 'waiting', frames: [], bossAt: 0 }
    const record = async () => {
      mkdirSync(join(OUT, 'clip'), { recursive: true })
      const end = Date.now() + 7000
      while (Date.now() < end && (await G(page, () => window.__shadow.phase)) === 'playing') {
        const t = Date.now()
        const file = `${String(clip.frames.length).padStart(3, '0')}.jpg`
        await page.screenshot({ path: join(OUT, 'clip', file), type: 'jpeg', quality: 90 })
        clip.frames.push({ file, t })
      }
      writeFileSync(join(OUT, 'clip', 'frames.json'), JSON.stringify(clip.frames))
      clip.state = 'done'
      log(`clip: ${clip.frames.length} frames`)
    }
    while (Date.now() - started < 240000) {
      const s = await play(
        page,
        240000,
        () => false,
        async (st) => {
          // A frame every few seconds once the arena is busy; the best are picked by hand.
          if (st.enemies >= 6 && Date.now() - lastShot > 3500) {
            lastShot = Date.now()
            await page.screenshot({ path: join(OUT, `combat-w${st.wave}-${String(++n).padStart(2, '0')}.png`) })
          }
          // The clip starts a few seconds into the Warden fight, once the arrival sequence is over.
          if (st.boss && !clip.bossAt) clip.bossAt = Date.now()
          if (clip.state === 'waiting' && clip.bossAt && Date.now() - clip.bossAt > 4000) {
            clip.state = 'recording'
            record()
          }
          if (clip.state !== 'recording' && !paused && st.wave >= 2 && st.enemies >= 8) {
            paused = true
            await page.keyboard.press('Escape')
            await page.waitForFunction(() => window.__shadow.phase === 'paused')
            await shot(page, 'pause-menu')
            await page.keyboard.press('Escape')
            await page.waitForFunction(() => window.__shadow.phase === 'playing')
          }
        },
      )
      const phase = await G(page, () => window.__shadow.phase)
      if (phase === 'levelup') {
        if (levelUps++ < 2) await shot(page, `upgrade-selection-${levelUps}`, 900)
        await chooseAugment(page)
      } else if (phase === 'gameover') {
        await shot(page, 'game-over', 2200)
        break
      } else if (s?.wave >= 5) {
        break
      }
    }
    log(`run ended on wave ${await G(page, () => window.__shadow.director.wave)} (${Math.round((Date.now() - started) / 1000)} s)`)
    // Still alive: stop defending and let the wave finish the run, for the defeat screen.
    if ((await G(page, () => window.__shadow.phase)) !== 'gameover') {
      const end = Date.now() + 120000
      while (Date.now() < end) {
        const phase = await G(page, () => window.__shadow.phase)
        if (phase === 'gameover') break
        if (phase === 'levelup') await chooseAugment(page)
        await sleep(250)
      }
      if ((await G(page, () => window.__shadow.phase)) === 'gameover') await shot(page, 'game-over', 2200)
    }
    await context.close()
  },

  // Boss fights: reached with ?debug wave skips, fought by the bot in god mode.
  async bosses() {
    const { context, page } = await open(DESKTOP, VETERAN)
    await deploy(page)
    for (const [wave, name] of [
      [5, 'warden'],
      [10, 'sovereign'],
    ]) {
      await G(page, (w) => {
        window.__shadow.god = true
        window.__shadow.debugSkipToWave(w)
      }, wave)
      await sleep(1100)
      await shot(page, `boss-${name}-arrival`, 0)
      await page.waitForFunction(() => window.__shadow.director.boss?.spawnTimer <= 0, null, { timeout: 15000 })
      let k = 0
      let last = Date.now()
      const fightEnd = Date.now() + 40000
      while (Date.now() < fightEnd) {
        await play(page, fightEnd - Date.now(), () => Date.now() - last > 2500)
        const phase = await G(page, () => window.__shadow.phase)
        if (phase === 'levelup') {
          await chooseAugment(page)
          continue
        }
        if (phase !== 'playing') break
        last = Date.now()
        await page.screenshot({ path: join(OUT, `boss-${name}-${String(++k).padStart(2, '0')}.png`) })
        // Move the fight along to the later phases (debug hotkey H: 20% boss damage).
        if (k % 4 === 0) await page.keyboard.press('KeyH')
        if (!(await G(page, () => !!window.__shadow.director.boss?.alive))) break
      }
      log(`${name}: ${k} frames`)
    }
    // Defeat: god mode off and the bot stands still, so the Sovereign ends the run.
    if (await G(page, () => window.__shadow.phase === 'playing' && !!window.__shadow.director.boss?.alive)) {
      await G(page, () => (window.__shadow.god = false))
      await page.mouse.down()
      await page.waitForFunction(() => window.__shadow.phase === 'gameover', null, { timeout: 60000 }).catch(() => {})
      await page.mouse.up()
      if (await G(page, () => window.__shadow.phase === 'gameover')) await shot(page, 'game-over-boss', 2200)
    }
    await context.close()
  },

  async victory() {
    const { context, page } = await open(DESKTOP, VETERAN)
    await deploy(page)
    await G(page, () => {
      window.__shadow.god = true
      window.__shadow.debugSkipToWave(10)
    })
    await page.waitForFunction(() => window.__shadow.director.boss?.spawnTimer <= 0, null, { timeout: 15000 })
    for (let i = 0; i < 40; i++) {
      await play(page, 1500)
      const phase = await G(page, () => window.__shadow.phase)
      if (phase === 'levelup') await chooseAugment(page)
      if (phase === 'victory') break
      if (await G(page, () => window.__shadow.director.boss?.alive && window.__shadow.director.boss.invuln <= 0)) await page.keyboard.press('KeyH')
    }
    await page.waitForFunction(() => window.__shadow.phase === 'victory', null, { timeout: 20000 })
    await shot(page, 'victory', 2600)
    await context.close()
  },

  async mobile() {
    for (const [device, tag] of [
      [PHONE, 'mobile'],
      [PHONE_LAND, 'mobile-landscape'],
    ]) {
      const { context, page } = await open(device, VETERAN)
      await menuReady(page)
      await shot(page, `${tag}-menu`, 2000)
      await page.locator('button:has-text("New Run")').tap()
      await page.locator('text=Choose your loadout').first().waitFor()
      await page.locator('button:has-text("Deploy")').tap()
      await page.waitForFunction(() => window.__shadow.phase === 'playing', null, { timeout: 15000 })
      await G(page, () => (window.__shadow.god = true))
      // Twin-stick input over CDP: a held touch on the left half moves, one on the right aims and fires.
      const cdp = await context.newCDPSession(page)
      const { width, height } = device.viewport
      // Clear of the Dash / Boost / Swap buttons in the bottom-right corner.
      const stick = { x: width * 0.25, y: height * 0.6, id: 1 }
      const aimBase = { x: width * 0.72, y: height * 0.45, id: 2 }
      const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })) })
      await touch('touchStart', [stick, aimBase])
      const end = Date.now() + 26000
      let k = 0
      let last = Date.now()
      while (Date.now() < end) {
        const s = await G(page, decide)
        if (s.phase === 'levelup') {
          await touch('touchEnd', [])
          await sleep(900)
          await page.locator('[aria-label="Select augment"] button').first().tap().catch(() => page.keyboard.press('Digit1'))
          await page.waitForFunction(() => window.__shadow.phase === 'playing', null, { timeout: 5000 }).catch(() => {})
          await touch('touchStart', [stick, aimBase])
          continue
        }
        if (s.phase !== 'playing') break
        const mx = (s.keys.KeyD ? 1 : 0) - (s.keys.KeyA ? 1 : 0)
        const my = (s.keys.KeyS ? 1 : 0) - (s.keys.KeyW ? 1 : 0)
        const ax = s.aim.x - s.me.x
        const ay = s.aim.y - s.me.y
        const ad = Math.hypot(ax, ay) || 1
        await touch('touchMove', [
          { ...stick, x: stick.x + mx * 40, y: stick.y + my * 40 },
          { ...aimBase, x: aimBase.x + (ax / ad) * 40, y: aimBase.y + (ay / ad) * 40 },
        ])
        if (s.enemies >= 4 && Date.now() - last > 3000) {
          last = Date.now()
          await page.screenshot({ path: join(OUT, `${tag}-gameplay-${String(++k).padStart(2, '0')}.png`) })
        }
        await sleep(40)
      }
      await touch('touchEnd', [])
      log(`${tag}: ${k} gameplay frames`)
      await context.close()
    }
  },
}

const chains = args.chains ? args.chains.split(',') : Object.keys(CHAINS)
browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
mkdirSync(OUT, { recursive: true })
for (const name of chains) {
  console.log(`${name}:`)
  try {
    await CHAINS[name]()
  } catch (err) {
    console.error(`  ${name} failed: ${err.message.split('\n')[0]}`)
    process.exitCode = 1
  }
}
await browser.close()
console.log(`Done. Frames are in ${OUT}/`)
