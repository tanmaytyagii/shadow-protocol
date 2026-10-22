// End-to-end smoke test: drives the real game in headless Chrome.
//
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   npm run test:e2e
//
// Env: BASE_URL (default http://localhost:4173), CHROME_PATH (auto-detected on macOS).
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = 'test-artifacts'
mkdirSync(OUT, { recursive: true })

const candidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)
const executablePath = candidates.find((p) => existsSync(p))
if (!executablePath) {
  console.error('No Chrome/Chromium found. Set CHROME_PATH.')
  process.exit(1)
}

const results = []
const consoleProblems = []
let failed = false

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failed = true
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })

const INTRO = 'section[aria-label="Opening sequence"]'

/**
 * Fresh contexts start with empty storage, so the game opens with its
 * cinematic. `intro: 'skip'` gets past it the way a player would (the Skip
 * button, or Start Game in the reduced-motion card); 'keep' leaves it running.
 */
async function newPage(opts = {}, query = '?debug', { intro = 'skip' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoleProblems.push(`[${msg.type()}] ${msg.text()}`)
  })
  page.on('pageerror', (err) => consoleProblems.push(`[pageerror] ${err.message}`))
  await page.goto(`${BASE}/${query}`)
  if (intro === 'keep') return { context, page }
  await skipIntro(page)
  await page.waitForSelector('text=New Run')
  return { context, page }
}

async function skipIntro(page) {
  await page.locator(INTRO).or(page.locator('text=New Run')).first().waitFor()
  if (!(await page.isVisible(INTRO))) return
  const skip = (await page.isVisible('button:has-text("Skip intro")')) ? 'button:has-text("Skip intro")' : 'button:has-text("Start Game")'
  await page.click(skip)
}

const G = (page, fn, arg) => page.evaluate(fn, arg)
const state = (page) =>
  G(page, () => {
    const g = window.__shadow
    return {
      phase: g.phase,
      wave: g.director.wave,
      dstate: g.director.state,
      score: g.score,
      kills: g.kills,
      hp: g.player.hp,
      alive: g.player.alive,
      level: g.player.level,
      enemies: g.enemies.length,
      x: g.player.x,
      y: g.player.y,
      weapons: g.player.weapons,
      upgrades: g.player.upgrades,
      boss: g.director.boss ? { hp: g.director.boss.hp, max: g.director.boss.maxHp, phase: g.director.boss.boss.phase } : null,
    }
  })

async function waitFor(page, predicate, arg, timeout = 15000) {
  try {
    await page.waitForFunction(predicate, arg, { timeout, polling: 100 })
    return true
  } catch {
    return false
  }
}

// Holds fire toward the nearest enemy (or a fixed point) while strafing.
async function play(page, ms, { strafe = true, preferBoss = false } = {}) {
  const start = Date.now()
  await page.mouse.move(720, 450)
  await page.mouse.down()
  const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA']
  let k = 0
  while (Date.now() - start < ms) {
    const aim = await G(page, (preferBoss) => {
      const g = window.__shadow
      const p = g.player
      let best = null
      let bd = Infinity
      const boss = g.director.boss
      if (preferBoss && boss && boss.alive && boss.spawnTimer <= 0) {
        best = boss
        bd = (boss.x - p.x) ** 2 + (boss.y - p.y) ** 2
      }
      for (const e of g.enemies) {
        if (best && preferBoss) break
        if (!e.alive || e.spawnTimer > 0) continue
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
        if (d < bd) {
          bd = d
          best = e
        }
      }
      const c = g.camera
      const tx = best ? best.x : p.x + 200
      const ty = best ? best.y : p.y
      let far = best ? Math.sqrt(bd) > 420 : false
      const key = Math.abs(tx - p.x) > Math.abs(ty - p.y) ? (tx > p.x ? 'KeyD' : 'KeyA') : ty > p.y ? 'KeyS' : 'KeyW'
      let side = null
      if (preferBoss && best) {
        // A reactor pillar in the line of fire eats every shot: go round it,
        // sidestepping while still closing in.
        let clear = true
        for (let i = 1; i < 12 && clear; i++) clear = !g.arena.blocked(p.x + ((tx - p.x) * i) / 12, p.y + ((ty - p.y) * i) / 12, 6)
        if (!clear) {
          far = true
          const flip = Math.floor(performance.now() / 1500) % 2
          side = Math.abs(tx - p.x) > Math.abs(ty - p.y) ? (flip ? 'KeyW' : 'KeyS') : flip ? 'KeyA' : 'KeyD'
        }
      }
      return { x: (tx - c.x) * c.renderZoom + c.viewW / 2, y: (ty - c.y) * c.renderZoom + c.viewH / 2, far, key, side }
    }, preferBoss)
    await page.mouse.move(Math.max(5, Math.min(1435, aim.x)), Math.max(5, Math.min(895, aim.y)))
    // Against a boss, keep the cursor on it while moving: the camera's look-ahead
    // shifts the view under a still cursor and the aim drifts off target.
    const hold = async (dur) => {
      if (!preferBoss) return sleep(dur)
      for (let t = 0; t < dur; t += 55) {
        await sleep(55)
        const a = await G(page, () => {
          const g = window.__shadow
          const b = g.director.boss
          if (!b || !b.alive) return null
          const c = g.camera
          return { x: (b.x - c.x) * c.renderZoom + c.viewW / 2, y: (b.y - c.y) * c.renderZoom + c.viewH / 2 }
        })
        if (a) await page.mouse.move(Math.max(5, Math.min(1435, a.x)), Math.max(5, Math.min(895, a.y)))
      }
    }
    if (aim.far) {
      // Close the distance so short-range weapons connect. A boss can arrive
      // the full arena away, beyond what walking covers in the window: boost.
      if (preferBoss) await page.keyboard.down('ShiftLeft')
      await page.keyboard.down(aim.key)
      if (aim.side) await page.keyboard.down(aim.side)
      await hold(220)
      if (aim.side) await page.keyboard.up(aim.side)
      await page.keyboard.up(aim.key)
      if (preferBoss) await page.keyboard.up('ShiftLeft')
    } else if (strafe) {
      await page.keyboard.down(keys[k % 4])
      await hold(220)
      await page.keyboard.up(keys[k % 4])
      k++
    } else {
      await hold(200)
    }
  }
  await page.mouse.up()
}

try {
  // ---------------------------------------------------------------- Opening cinematic
  {
    const { context, page: ip } = await newPage({}, '?debug', { intro: 'keep' })
    const t0 = Date.now()
    await ip.waitForSelector(INTRO)
    check(
      'Opening cinematic plays on first launch',
      (await ip.isVisible('button:has-text("Skip intro")')) && !(await ip.isVisible('text=New Run')) && (await G(ip, () => window.__shadow.intro.active)),
    )
    check('Audio stays locked until the first gesture', (await G(ip, () => window.__shadow.audio.state)) === 'locked')
    const sample = () => G(ip, () => ({ t: window.__shadow.intro.t, power: window.__shadow.intro.shot.power, zoom: window.__shadow.camera.renderZoom }))
    await sleep(1200 - (Date.now() - t0))
    const boot = await sample()
    await ip.screenshot({ path: `${OUT}/00a-intro-boot.png` })
    check('Boot log types out over a dark facility', boot.power < 0.2 && (await ip.isVisible('text=neural uplink')), JSON.stringify(boot))
    await sleep(4300 - (Date.now() - t0))
    await ip.screenshot({ path: `${OUT}/00b-intro-surge.png` })
    await sleep(5800 - (Date.now() - t0))
    const lit = await sample()
    check('Power surge lights the deck', lit.power > 0.95, `power=${lit.power.toFixed(2)}`)
    await sleep(7600 - (Date.now() - t0))
    await ip.screenshot({ path: `${OUT}/00c-intro-title.png` })
    check('Title is revealed', await ip.isVisible('h1:has-text("Shadow Protocol")'))
    await ip.waitForSelector('button:has-text("Start Game")', { timeout: 15000 })
    const readyAt = (Date.now() - t0) / 1000
    const wide = await sample()
    check('Camera pulls back from the reactor to the whole platform', wide.zoom < boot.zoom * 0.35, `zoom ${boot.zoom.toFixed(2)} -> ${wide.zoom.toFixed(2)}`)
    check('Start Game appears as the sequence ends (10-15 s)', readyAt >= 10 && readyAt <= 15, `${readyAt.toFixed(1)}s`)
    await sleep(700)
    await ip.screenshot({ path: `${OUT}/00d-intro-ready.png` })
    await ip.click('button:has-text("Start Game")')
    check('Start Game enters the main menu', await waitFor(ip, () => !window.__shadow.intro.active && !!document.querySelector('[aria-label="Main menu"]'), null, 3000))
    check('Audio unlocks on the first gesture', await waitFor(ip, () => window.__shadow.audio.state === 'running', null, 2000))
    check('Intro is remembered as seen', (await G(ip, () => JSON.parse(localStorage.getItem('shadow-protocol:profile:v1')).introSeen)) === true)
    await sleep(1200)
    await ip.screenshot({ path: `${OUT}/00e-menu-after-intro.png` })
    await ip.reload()
    await ip.waitForSelector('text=New Run', { timeout: 5000 })
    check('Returning players go straight to the menu', !(await ip.isVisible(INTRO)))
    await context.close()
  }
  {
    // Skipping with the keyboard as soon as it starts.
    const { context, page: sp } = await newPage({}, '?debug', { intro: 'keep' })
    await sp.waitForSelector(INTRO)
    await sleep(800)
    const t = Date.now()
    await sp.keyboard.press('Escape')
    await sp.waitForSelector('text=New Run', { timeout: 3000 })
    const took = Date.now() - t
    check('Escape skips the intro immediately', took < 1500, `${took}ms`)
    check('Lights come up after an early skip', await waitFor(sp, () => window.__shadow.intro.shot.power === 1, null, 1500))
    check('Skipping also counts as seen', (await G(sp, () => JSON.parse(localStorage.getItem('shadow-protocol:profile:v1')).introSeen)) === true)
    await context.close()
  }
  {
    // A player updating from v1.1: profile and run save written before the intro existed.
    const legacy = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    await legacy.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem(
        'shadow-protocol:profile:v1',
        JSON.stringify({ version: 1, highScore: 33982, bestWave: 10, bestTime: 812, totalKills: 1450, runs: 7, victories: 1, bossesDefeated: 3, unlockedWeapons: ['pulse', 'scatter', 'lancer'], hardUnlocked: true, tutorialSeen: true, lastLoadout: { weapon: 'lancer', difficulty: 'hard' } }),
      )
      localStorage.setItem(
        'shadow-protocol:run:v1',
        JSON.stringify({ version: 1, difficulty: 'normal', startWeapon: 'scatter', wave: 4, score: 5200, kills: 160, time: 300, level: 7, xp: 10, hp: 80, shield: 20, energy: 60, upgrades: { damage: 2 }, weapons: ['pulse', 'scatter'], ammo: { scatter: 30 }, currentWeapon: 'scatter', bossesDefeated: 0, shotsFired: 900, shotsHit: 500, damageDealt: 20000, savedAt: 1 }),
      )
    })
    const lp = await legacy.newPage()
    lp.on('pageerror', (err) => consoleProblems.push(`[pageerror] ${err.message}`))
    await lp.goto(`${BASE}/?debug`)
    await skipIntro(lp)
    await lp.waitForSelector('text=New Run')
    const prof = await lp.evaluate(() => JSON.parse(localStorage.getItem('shadow-protocol:profile:v1')))
    check(
      'v1.1 save data survives the update',
      !(await lp.isDisabled('button:has-text("Continue")')) &&
        (await lp.isVisible('text=Wave 4')) &&
        (await lp.isVisible('text=33,982')) &&
        prof.highScore === 33982 &&
        prof.unlockedWeapons.length === 3 &&
        prof.hardUnlocked === true &&
        prof.introSeen === true,
      `introSeen=${prof.introSeen}`,
    )
    await legacy.close()
  }
  {
    const { context, page: rp } = await newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' }, '?debug', { intro: 'keep' })
    await rp.waitForSelector(INTRO)
    const z1 = await G(rp, () => window.__shadow.camera.renderZoom)
    await sleep(1000)
    const still = await G(rp, () => ({ zoom: window.__shadow.camera.renderZoom, power: window.__shadow.intro.shot.power, typed: document.querySelectorAll('.intro-type').length }))
    await rp.screenshot({ path: `${OUT}/00f-intro-reduced-motion.png` })
    check(
      'Reduced-motion intro is a still title card',
      (await rp.isVisible(`${INTRO}[data-intro="reduced"]`)) && (await rp.isVisible('button:has-text("Start Game")')) && still.typed === 0 && still.power === 1 && Math.abs(still.zoom - z1) < 1e-6,
      JSON.stringify(still),
    )
    await rp.keyboard.press('Enter')
    check('Reduced-motion card continues to the menu', await waitFor(rp, () => !!document.querySelector('[aria-label="Main menu"]'), null, 2000))
    await context.close()
  }
  {
    // Touch: skip in portrait, wait for Start Game in landscape.
    const tp = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?debug', { intro: 'keep' })
    await tp.page.waitForSelector(INTRO)
    await sleep(1600)
    await tp.page.screenshot({ path: `${OUT}/00g-intro-portrait.png` })
    await tp.page.tap('button:has-text("Skip intro")')
    check('Touch: Skip intro works in portrait', await waitFor(tp.page, () => !!document.querySelector('[aria-label="Main menu"]'), null, 3000))
    await tp.context.close()
    const tl = await newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?debug', { intro: 'keep' })
    await tl.page.waitForSelector('button:has-text("Start Game")', { timeout: 15000 })
    await sleep(600)
    await tl.page.screenshot({ path: `${OUT}/00h-intro-landscape-ready.png` })
    const fits = await G(tl.page, () => {
      const r = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start Game')).getBoundingClientRect()
      return r.top >= 0 && r.bottom <= window.innerHeight && r.height >= 40
    })
    await tl.page.tap('button:has-text("Start Game")')
    check('Touch: Start Game is on screen and tappable in landscape', fits && (await waitFor(tl.page, () => !!document.querySelector('[aria-label="Main menu"]'), null, 3000)))
    await tl.context.close()
  }
  {
    // Opened in a background tab: the sequence waits until the player can see it.
    const bg = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    await bg.addInitScript(() => {
      let hidden = true
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
      window.__reveal = () => {
        hidden = false
        document.dispatchEvent(new Event('visibilitychange'))
      }
    })
    const bp = await bg.newPage()
    bp.on('pageerror', (err) => consoleProblems.push(`[pageerror] ${err.message}`))
    await bp.goto(`${BASE}/?debug`)
    await sleep(1500)
    const waiting = await G(bp, () => !window.__shadow.intro.active && !document.querySelector('.intro-boot'))
    await G(bp, () => window.__reveal())
    const started = await waitFor(bp, () => window.__shadow.intro.active && window.__shadow.intro.t < 1, null, 2000)
    check('Intro waits until the tab is visible', waiting && started)
    await bg.close()
  }
  {
    // Resizing (e.g. rotating a tablet) mid-sequence.
    const { context, page: zp } = await newPage({}, '?debug', { intro: 'keep' })
    await zp.waitForSelector(INTRO)
    await sleep(2000)
    await zp.setViewportSize({ width: 900, height: 1200 })
    await sleep(600)
    const size = await G(zp, () => ({ w: window.__shadow.camera.viewW, h: window.__shadow.camera.viewH, active: window.__shadow.intro.active }))
    check('Intro survives a resize', size.w === 900 && size.h === 1200 && size.active, JSON.stringify(size))
    await context.close()
  }

  // ---------------------------------------------------------------- Main flow
  const { page } = await newPage()
  await sleep(600)
  await page.screenshot({ path: `${OUT}/01-main-menu.png` })
  check('Main menu renders', await page.isVisible('text=SHADOW'))
  check('Continue disabled without a save', await page.isDisabled('button:has-text("Continue")'))

  await page.click('button:has-text("Settings")')
  await page.waitForSelector('text=System config', { timeout: 3000 }).catch(() => null)
  await page.screenshot({ path: `${OUT}/02-settings.png` })
  check('Settings screen opens', await page.isVisible('text=Screen shake'))
  await page.keyboard.press('Escape')
  await sleep(200)

  await page.click('button:has-text("Credits")')
  check('Credits screen opens', await page.isVisible('text=Production'))
  await page.keyboard.press('Escape')
  await sleep(200)

  await page.click('button:has-text("Credits")')
  await page.click('button:has-text("Replay intro")')
  check('Credits can replay the intro', await waitFor(page, () => window.__shadow.intro.active && !!document.querySelector('section[aria-label="Opening sequence"]'), null, 2000))
  await sleep(600)
  await page.keyboard.press('Escape')
  await page.waitForSelector('text=New Run')
  await sleep(300)

  await page.click('button:has-text("New Run")')
  await page.waitForSelector('text=Choose your loadout')
  await sleep(600)
  await page.screenshot({ path: `${OUT}/03-loadout.png` })
  check('Locked weapons are disabled', await page.isDisabled('button[role="radio"]:has-text("Rail Lancer")'))
  await page.click('button:has-text("Deploy")')
  await page.waitForSelector('text=How to survive')
  await sleep(700) // let the briefing panel finish its entrance before the screenshot
  await page.screenshot({ path: `${OUT}/04-tutorial.png` })
  check('Tutorial shown before first deploy', true)
  await page.keyboard.press('Escape')
  check('Escape in the briefing returns to the loadout', await page.waitForSelector('text=Choose your loadout', { timeout: 2000 }).then(() => true, () => false))
  check('Backing out of the briefing does not start a run', (await G(page, () => window.__shadow.phase)) === 'idle')
  await page.click('button:has-text("Deploy")')
  await page.waitForSelector('text=How to survive')
  await page.click('button:has-text("Understood")')
  check('Run starts', await waitFor(page, () => window.__shadow.phase === 'playing'))
  await sleep(2600)
  check('First deploy shows a controls reminder', await page.isVisible('[data-first-run-hint]'))

  const before = await state(page)
  await play(page, 9000)
  const after = await state(page)
  await page.screenshot({ path: `${OUT}/05-gameplay.png` })
  check('Player moved', Math.hypot(after.x - before.x, after.y - before.y) > 5, `${Math.round(before.x)},${Math.round(before.y)} -> ${Math.round(after.x)},${Math.round(after.y)}`)
  check('Enemies spawned and were killed', after.kills > 0, `kills=${after.kills}`)
  check('Score increased', after.score > 0, `score=${after.score}`)
  check('HUD shows score', await page.isVisible('text=Score'))

  // Pause
  await page.keyboard.press('Escape')
  check('Escape pauses', await waitFor(page, () => window.__shadow.phase === 'paused'))
  await sleep(300)
  await page.screenshot({ path: `${OUT}/06-pause.png` })
  const frozen1 = await state(page)
  await sleep(500)
  const frozen2 = await state(page)
  check('Simulation frozen while paused', frozen1.x === frozen2.x && frozen1.enemies === frozen2.enemies)
  await page.click('button:has-text("Resume")')
  check('Resume works', await waitFor(page, () => window.__shadow.phase === 'playing'))

  // Level up via debug queue
  await G(page, () => window.__shadow.queueLevelUp('level'))
  check('Level-up overlay opens', await waitFor(page, () => window.__shadow.phase === 'levelup'))
  await sleep(700)
  await page.screenshot({ path: `${OUT}/07-levelup.png` })
  const offer = await G(page, () => window.__shadow.store.getState().levelUp)
  check('Three upgrade cards offered', offer?.cards?.length === 3, offer?.cards?.map((c) => c.name).join(', '))
  const statsBefore = await G(page, () => JSON.stringify(window.__shadow.player.stats))
  await page.keyboard.press('1')
  check('Choosing a card resumes play', await waitFor(page, () => window.__shadow.phase === 'playing'))
  const picked = offer.cards[0].id
  const stacks = await G(page, (id) => window.__shadow.player.upgrades[id] ?? 0, picked)
  const statsAfter = await G(page, () => JSON.stringify(window.__shadow.player.stats))
  check('Upgrade applied with real stat effect', stacks >= 1 && (statsAfter !== statsBefore || picked.startsWith('weapon_')), `${picked} x${stacks}`)

  // From here on, automatically take the first augment whenever a level-up pauses the game.
  const autoPick = (pg) =>
    G(pg, () => {
      window.__autoPick = window.setInterval(() => {
        const g = window.__shadow
        const o = g.store.getState().levelUp
        if (g.phase === 'levelup' && o) g.chooseUpgrade(o.cards[0].id)
      }, 150)
    })
  await autoPick(page)

  // Wave progression -> wave 2 (checkpoint saved)
  await G(page, () => window.__shadow.debugKillAll())
  check('Wave clears and intermission starts', await waitFor(page, () => window.__shadow.director.state === 'intermission', null, 8000))
  await page.screenshot({ path: `${OUT}/08-wave-cleared.png` })
  check('Next wave starts automatically', await waitFor(page, () => window.__shadow.director.wave === 2, null, 9000))
  const saved = await G(page, () => localStorage.getItem('shadow-protocol:run:v1'))
  check('Checkpoint saved at wave start', !!saved && JSON.parse(saved).wave === 2)

  // Boss 1: Warden
  await G(page, () => {
    window.__shadow.god = true
    window.__shadow.debugSkipToWave(5)
  })
  await sleep(1300)
  const letterbox = await G(page, () => {
    const bar = document.querySelector('.letterbox')
    return { cinematic: window.__shadow.store.getState().hud.cinematic, bottom: bar ? bar.getBoundingClientRect().bottom : -1 }
  })
  check('Boss arrival letterboxes the frame', letterbox.cinematic && letterbox.bottom > 10, JSON.stringify(letterbox))
  check('Warden spawns on wave 5', await waitFor(page, () => !!window.__shadow.director.boss, null, 8000))
  await sleep(2500)
  await page.keyboard.press('Digit1')
  await play(page, 5000, { preferBoss: true })
  await page.screenshot({ path: `${OUT}/09-boss-warden.png` })
  const w1 = await state(page)
  check('Boss health bar visible', await page.isVisible('text=WARDEN'))
  check('Boss takes damage from weapons', w1.boss && w1.boss.hp < w1.boss.max, `${Math.round(w1.boss?.hp)}/${w1.boss?.max}`)
  await G(page, () => {
    const b = window.__shadow.director.boss
    b.hp = b.maxHp * 0.45
  })
  check('Warden enters phase 2', await waitFor(page, () => window.__shadow.director.boss?.boss.phase === 2, null, 5000))
  const cues = await G(page, () => window.__shadow.audio.requested)
  check(
    'Boss attacks announce themselves with audio cues',
    (cues.telegraph ?? 0) + (cues.stompWindup ?? 0) + (cues.bossCharge ?? 0) > 0,
    `telegraph=${cues.telegraph ?? 0} stomp=${cues.stompWindup ?? 0} charge=${cues.bossCharge ?? 0}`,
  )
  check('Boss phase change has its own cue', (cues.bossPhase ?? 0) >= 1, `bossPhase=${cues.bossPhase ?? 0}`)
  await sleep(2200)
  await play(page, 3000)
  await page.screenshot({ path: `${OUT}/10-warden-phase2.png` })
  await G(page, () => {
    const g = window.__shadow
    const b = g.director.boss
    b.invuln = 0
    g.damageEnemy(b, b.hp + 1, { crit: false, kx: 0, ky: 0, knockback: 0 })
  })
  check('Warden defeat clears the wave', await waitFor(page, () => window.__shadow.director.state === 'intermission', null, 8000))
  const unlocked = await G(page, () => JSON.parse(localStorage.getItem('shadow-protocol:profile:v1')).unlockedWeapons)
  check('Defeating the Warden unlocks the Rail Lancer', unlocked.includes('lancer'), unlocked.join(','))

  // Final boss
  await G(page, () => window.__shadow.debugSkipToWave(10))
  check('Null Sovereign spawns on wave 10', await waitFor(page, () => window.__shadow.director.boss?.kind === 'sovereign', null, 8000))
  await sleep(2500)
  await G(page, () => {
    const b = window.__shadow.director.boss
    b.hp = b.maxHp * 0.5
  })
  await waitFor(page, () => window.__shadow.director.boss?.boss.phase === 2, null, 5000)
  await sleep(2000)
  // Force a laser attack to verify it renders and runs.
  await G(page, () => {
    const g = window.__shadow
    const b = g.director.boss
    b.boss.attack = 'laser'
    b.boss.t = 0
    b.boss.shots = 0
  })
  await sleep(1700)
  await page.screenshot({ path: `${OUT}/11-sovereign-laser.png` })
  check('Laser hazard active', await G(page, () => window.__shadow.hazards.some((h) => h.kind === 'laser')))
  await G(page, () => {
    const b = window.__shadow.director.boss
    b.hp = b.maxHp * 0.3
  })
  check('Sovereign enters phase 3', await waitFor(page, () => window.__shadow.director.boss?.boss.phase === 3, null, 5000))
  await sleep(2200)
  await play(page, 3500)
  await page.screenshot({ path: `${OUT}/12-sovereign-phase3.png` })
  await G(page, () => {
    const g = window.__shadow
    const b = g.director.boss
    b.invuln = 0
    g.damageEnemy(b, b.hp + 1, { crit: false, kx: 0, ky: 0, knockback: 0 })
  })
  check('Victory screen after final boss', await waitFor(page, () => window.__shadow.phase === 'victory', null, 10000))
  await sleep(900)
  await page.screenshot({ path: `${OUT}/13-victory.png` })
  check('Victory screen shows stats', await page.isVisible('text=PROTOCOL COMPLETE'))
  const prof = await G(page, () => JSON.parse(localStorage.getItem('shadow-protocol:profile:v1')))
  check('Victory unlocks Nightmare + records saved', prof.hardUnlocked && prof.victories === 1 && prof.highScore > 0, `hs=${prof.highScore}`)
  check('Run save cleared after victory', (await G(page, () => localStorage.getItem('shadow-protocol:run:v1'))) === null)

  // Defeat flow
  await page.click('button:has-text("New Run")')
  await page.waitForSelector('text=Choose your loadout')
  check('Nightmare selectable after victory', !(await page.isDisabled('button[role="radio"]:has-text("Nightmare")')))
  await page.click('button:has-text("Deploy")')
  check('Second run starts (tutorial skipped)', await waitFor(page, () => window.__shadow.phase === 'playing'))
  await sleep(500)
  await G(page, () => {
    const g = window.__shadow
    g.player.iframes = 0
    g.player.shield = 0
    g.damagePlayer(9999, g.player.x + 10, g.player.y)
  })
  check('Game over after death', await waitFor(page, () => window.__shadow.phase === 'gameover', null, 6000))
  await sleep(900)
  await page.screenshot({ path: `${OUT}/14-game-over.png` })
  check('Game over shows time & kills', (await page.isVisible('text=Time survived')) && (await page.isVisible('text=Enemies defeated')))
  await page.click('button:has-text("Retry")')
  check('Retry restarts the run', await waitFor(page, () => window.__shadow.phase === 'playing' && window.__shadow.director.wave === 1))

  // Continue flow
  await G(page, () => window.__shadow.debugSkipToWave(3))
  await sleep(300)
  await page.keyboard.press('Escape')
  await waitFor(page, () => window.__shadow.phase === 'paused')
  await page.click('button:has-text("Main Menu")')
  await page.click('button:has-text("Yes, quit")')
  check('Quit returns to main menu', await waitFor(page, () => window.__shadow.phase === 'idle'))
  await page.reload()
  await page.waitForSelector('text=New Run')
  check('Continue enabled after reload', !(await page.isDisabled('button:has-text("Continue")')))
  check('Continue shows saved wave', await page.isVisible('text=Wave 3'))
  await autoPick(page)
  await page.click('button:has-text("Continue")')
  check('Continue resumes at saved wave', await waitFor(page, () => window.__shadow.phase === 'playing' && window.__shadow.director.wave === 3))
  await page.keyboard.press('Escape')
  await waitFor(page, () => window.__shadow.phase === 'paused')

  // Settings persistence
  await page.click('button:has-text("Settings")')
  await page.click('button[role="radio"]:has-text("Low")')
  await page.click('button[role="switch"]:has-text("Mute all audio")')
  await page.keyboard.press('Escape')
  await page.reload()
  await page.waitForSelector('text=New Run')
  const settings = await G(page, () => JSON.parse(localStorage.getItem('shadow-protocol:settings:v1')))
  check('Settings persist across reloads', settings.graphics === 'low' && settings.muted === true)

  // Focus loss auto-pause
  await page.click('button:has-text("Continue")')
  await waitFor(page, () => window.__shadow.phase === 'playing')
  await G(page, () => window.dispatchEvent(new Event('blur')))
  check('Window blur auto-pauses', await waitFor(page, () => window.__shadow.phase === 'paused', null, 2000))
  await page.screenshot({ path: `${OUT}/15-low-quality-pause.png` })

  // ------------------------------------------------------------ Production (no debug) console check
  const prod = await newPage({}, '')
  await prod.page.click('button:has-text("New Run")')
  await prod.page.click('button:has-text("Deploy")')
  await prod.page.click('button:has-text("Understood")')
  await sleep(1500)
  await prod.page.mouse.move(900, 300)
  await prod.page.mouse.down()
  await prod.page.keyboard.down('KeyD')
  await sleep(2500)
  await prod.page.keyboard.up('KeyD')
  await prod.page.keyboard.press('Space')
  await sleep(2000)
  await prod.page.mouse.up()
  check('Non-debug build hides debug hook', (await prod.page.evaluate(() => typeof window.__shadow)) === 'undefined')
  await prod.context.close()

  // ------------------------------------------------------------ Mobile
  const mobile = await newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  await sleep(500)
  await mobile.page.screenshot({ path: `${OUT}/16-mobile-menu.png` })
  await mobile.page.tap('button:has-text("New Run")')
  await mobile.page.tap('button:has-text("Deploy")')
  await mobile.page.tap('button:has-text("Understood")')
  check('Mobile run starts', await waitFor(mobile.page, () => window.__shadow.phase === 'playing'))
  await sleep(2500)
  check('Touch controls shown on touch device', await mobile.page.isVisible('button[aria-label="Dash"]'))
  await mobile.page.screenshot({ path: `${OUT}/17-mobile-gameplay.png` })
  await mobile.context.close()

  // ------------------------------------------------------------ Touch play, landscape and portrait
  for (const [label, viewport] of [
    ['landscape', { width: 844, height: 390 }],
    ['portrait', { width: 390, height: 844 }],
  ]) {
    const t = await newPage({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    await t.page.tap('button:has-text("New Run")')
    await t.page.tap('button:has-text("Deploy")')
    if (await t.page.isVisible('button:has-text("Understood")')) await t.page.tap('button:has-text("Understood")')
    await waitFor(t.page, () => window.__shadow.phase === 'playing')
    await G(t.page, () => (window.__shadow.god = true))
    await sleep(800)
    const cdp = await t.context.newCDPSession(t.page)
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints })
    const before = await G(t.page, () => ({ x: window.__shadow.player.x, shots: window.__shadow.shotsFired }))
    const lx = viewport.width * 0.2
    const ly = viewport.height * 0.7
    const rx = viewport.width * 0.75
    const ry = viewport.height * 0.5
    await touch('touchStart', [{ x: lx, y: ly, id: 1 }, { x: rx, y: ry, id: 2 }])
    for (let i = 0; i < 20; i++) {
      await touch('touchMove', [{ x: lx + i * 3, y: ly, id: 1 }, { x: rx, y: ry - i * 2, id: 2 }])
      await sleep(60)
    }
    await sleep(500)
    await t.page.screenshot({ path: `${OUT}/18-touch-${label}.png` })
    await touch('touchEnd', [])
    const after = await G(t.page, () => ({ x: window.__shadow.player.x, shots: window.__shadow.shotsFired }))
    check(`Touch ${label}: left stick moves the operative`, after.x - before.x > 20, `dx=${Math.round(after.x - before.x)}`)
    check(`Touch ${label}: right stick aims and fires`, after.shots > before.shots, `shots=${after.shots - before.shots}`)
    await t.page.tap('button[aria-label="Dash"]')
    check(`Touch ${label}: dash button dashes`, await waitFor(t.page, () => window.__shadow.player.dashCooldown > 0, null, 2000))
    await t.context.close()
  }

  // ------------------------------------------------------------ Reduced motion
  const rm = await newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' })
  check(
    'Reduced motion follows the OS preference',
    await G(rm.page, () => window.__shadow.settings.reducedMotion === true && document.documentElement.dataset.motion === 'reduced'),
  )
  const dur = await G(rm.page, () => getComputedStyle(document.querySelector('.animate-rise')).animationDuration)
  check('Reduced motion collapses decorative UI animation', parseFloat(dur) < 0.01, dur)
  await rm.page.click('button:has-text("New Run")')
  await rm.page.click('button:has-text("Deploy")')
  if (await rm.page.isVisible('button:has-text("Understood")')) await rm.page.click('button:has-text("Understood")')
  await waitFor(rm.page, () => window.__shadow.phase === 'playing')
  const motion = await G(rm.page, async () => {
    const g = window.__shadow
    g.vfx.onDash(1, 0)
    g.vfx.onBossPhase(g.player)
    g.camera.zoomPunch(0.1)
    await new Promise((r) => requestAnimationFrame(r))
    return { distortions: g.vfx.distortions.length, punch: g.camera.punch }
  })
  check('Reduced motion disables refraction and zoom punches', motion.distortions === 0 && motion.punch === 0, JSON.stringify(motion))
  await rm.context.close()

  // ------------------------------------------------------------ Screen shake setting
  const sh = await newPage({ viewport: { width: 1280, height: 720 } })
  await sh.page.click('button:has-text("New Run")')
  await sh.page.click('button:has-text("Deploy")')
  if (await sh.page.isVisible('button:has-text("Understood")')) await sh.page.click('button:has-text("Understood")')
  await waitFor(sh.page, () => window.__shadow.phase === 'playing')
  const shake = await G(sh.page, async () => {
    const g = window.__shadow
    const measure = async (scale) => {
      g.applySettings({ ...g.settings, screenShake: scale })
      g.camera.addTrauma(1)
      g.camera.kick(6, 6)
      let peak = 0
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => requestAnimationFrame(r))
        peak = Math.max(peak, Math.abs(g.camera.offsetX) + Math.abs(g.camera.offsetY))
      }
      return peak
    }
    return { off: await measure(0), on: await measure(1) }
  })
  check('Screen shake 0% removes shake and recoil', shake.off < 1e-6, `peak=${shake.off}`)
  check('Screen shake 100% shakes the camera', shake.on > 1, `peak=${shake.on.toFixed(2)}`)
  // Keyboard-only pause and resume.
  await sh.page.keyboard.press('Escape')
  const paused = await waitFor(sh.page, () => window.__shadow.phase === 'paused', null, 2000)
  await sleep(250)
  await sh.page.keyboard.press('Escape')
  check('Escape pauses and Escape resumes', paused && (await waitFor(sh.page, () => window.__shadow.phase === 'playing', null, 2000)))
  await sh.context.close()

  // ------------------------------------------------------------ Audio behaviour (graph state and offline levels; nothing is listened to)
  const au = await newPage({ viewport: { width: 1280, height: 720 } })
  await au.page.click('button:has-text("Settings")')
  await waitFor(au.page, () => window.__shadow.audio.state === 'running', null, 2000)
  const master = () => G(au.page, () => window.__shadow.audio.masterGain)
  await sleep(500)
  const on = await master()
  await au.page.click('button[role="switch"]:has-text("Mute all audio")')
  await sleep(500)
  const muted = await master()
  await au.page.click('button[role="switch"]:has-text("Mute all audio")')
  await sleep(500)
  const unmuted = await master()
  check('Mute silences the master bus and unmute restores it', on > 0.5 && muted < 0.001 && Math.abs(unmuted - on) < 0.01, `${on.toFixed(3)} -> ${muted.toFixed(4)} -> ${unmuted.toFixed(3)}`)
  await au.page.focus('input[aria-label="Master volume"]')
  await au.page.keyboard.press('Home')
  for (let i = 0; i < 6; i++) await au.page.keyboard.press('ArrowRight')
  await sleep(500)
  const lowered = await master()
  const stored = await G(au.page, () => JSON.parse(localStorage.getItem('shadow-protocol:settings:v1')).masterVolume)
  check('Master volume slider sets the master bus and persists', Math.abs(lowered - 0.3 * 0.9) < 0.01 && Math.abs(stored - 0.3) < 1e-9, `gain=${lowered.toFixed(3)} stored=${stored}`)
  const levels = await G(au.page, async () => {
    const a = window.__shadow.audio
    const sfx = {}
    for (const n of a.constructor.SFX) sfx[n] = await a.measure(n)
    return { sfx, combat: await a.measureMusic('combat', 8) }
  })
  const entries = Object.entries(levels.sfx)
  // At default volumes effects sit 6 dB below their unity render, music 15 dB.
  const mix = (r) => r.loudness - 5.95
  const hottest = entries.reduce((a, b) => (b[1].peakDb > a[1].peakDb ? b : a))
  const loudest = entries.reduce((a, b) => (mix(b[1]) > mix(a[1]) ? b : a))
  check('Every sound effect renders', entries.length >= 41 && entries.every(([, r]) => Number.isFinite(r.loudness) && r.duration > 0), `${entries.length} effects`)
  check('No effect clips before the limiter', hottest[1].peakDb < -3, `${hottest[0]} ${hottest[1].peakDb.toFixed(1)} dBFS`)
  check('No effect is excessively loud at default volume', mix(loudest[1]) < -20, `${loudest[0]} ${mix(loudest[1]).toFixed(1)} LUFS`)
  const combatMean = levels.combat.integrated - 15
  const tells = ['telegraph', 'bossCharge', 'laserCharge', 'stompWindup'].map((n) => [n, mix(levels.sfx[n])])
  check('Boss telegraph cues sit above the combat music', tells.every(([, v]) => v > combatMean + 3), tells.map(([n, v]) => `${n} ${v.toFixed(1)}`).join(', ') + ` vs music ${combatMean.toFixed(1)}`)
  check('Victory and defeat stingers are level-matched', Math.abs(mix(levels.sfx.victory) - mix(levels.sfx.defeat)) < 3)
  await au.context.close()

  // ------------------------------------------------------------ Every remaining menu button, clicked with the mouse
  const bs = await newPage({ viewport: { width: 1280, height: 720 } })
  const bp = bs.page
  const shown = (text) => bp.waitForSelector(`text=${text}`, { timeout: 3000 }).then(() => true, () => false)
  // By role: a weapon card's description ("heavy knockback") would also match a text selector.
  const back = () => bp.getByRole('button', { name: /^Back/ }).click()
  // A mid-progression player: every loadout and Nightmare unlocked, briefing not yet seen.
  await G(bp, () =>
    localStorage.setItem(
      'shadow-protocol:profile:v1',
      JSON.stringify({ version: 1, runs: 2, highScore: 900, unlockedWeapons: ['pulse', 'scatter', 'lancer', 'seeker'], hardUnlocked: true, tutorialSeen: false, introSeen: true }),
    ),
  )
  await bp.reload()
  await bp.waitForSelector('text=New Run')
  await bp.click('button:has-text("How to Play")')
  const briefingOpen = await shown('How to survive')
  await back()
  check('How to Play opens the briefing and Back returns', briefingOpen && (await shown('New Run')))
  await bp.click('button:has-text("Credits")')
  await back()
  check('Credits Back button returns to the menu', await shown('New Run'))
  await bp.click('button:has-text("New Run")')
  await bp.waitForSelector('text=Choose your loadout')
  await back()
  check('Loadout Back button returns to the menu', await shown('New Run'))
  await bp.click('button:has-text("New Run")')
  await bp.click('button[role="radio"]:has-text("Rail Lancer")')
  await bp.click('button[role="radio"]:has-text("Nightmare")')
  const chosen = await G(bp, () => [...document.querySelectorAll('button[role="radio"][aria-checked="true"]')].map((b) => b.textContent))
  await bp.click('button:has-text("Deploy")')
  await bp.waitForSelector('text=How to survive')
  await bp.click('button:has-text("Loadout")')
  const backToLoadout = await shown('Choose your loadout')
  await bp.click('button:has-text("Deploy")')
  await bp.click('button:has-text("Understood")')
  const config = (await waitFor(bp, () => window.__shadow.phase === 'playing')) && (await G(bp, () => ({ ...window.__shadow.config, current: window.__shadow.player.current })))
  check('Briefing Loadout button returns to the loadout', backToLoadout)
  check(
    'Loadout weapon and difficulty choices are used for the run',
    chosen.some((t) => t.includes('Rail Lancer')) && chosen.some((t) => t.includes('Nightmare')) && config.startWeapon === 'lancer' && config.difficulty === 'hard' && config.current === 'lancer',
    JSON.stringify(config),
  )
  await G(bp, () => (window.__shadow.god = true))
  await G(bp, () => window.__shadow.queueLevelUp('level'))
  await waitFor(bp, () => window.__shadow.phase === 'levelup')
  await sleep(900)
  const cardNames = await G(bp, () => window.__shadow.store.getState().levelUp.cards.map((c) => c.id + '|' + c.name))
  const [cardId, cardName] = cardNames[1].split('|')
  await bp.locator('button', { hasText: cardName }).first().click()
  const cardTaken = (await waitFor(bp, () => window.__shadow.phase === 'playing', null, 2000)) && (await G(bp, (id) => (window.__shadow.player.upgrades[id] ?? 0) >= 1, cardId))
  check('Clicking a level-up card picks that card', cardTaken, cardName)
  await bp.keyboard.press('Escape')
  await waitFor(bp, () => window.__shadow.phase === 'paused')
  await bp.click('button:has-text("Main Menu")')
  await bp.click('button:has-text("Cancel")')
  const keptRun = await G(bp, () => window.__shadow.phase === 'paused')
  await bp.click('button:has-text("Restart")')
  await bp.click('button:has-text("Yes, restart")')
  check(
    'Pause: Cancel keeps the run, Restart starts again from wave 1',
    keptRun && (await waitFor(bp, () => window.__shadow.phase === 'playing' && window.__shadow.director.wave === 1 && window.__shadow.time < 3, null, 3000)),
  )
  await G(bp, () => (window.__shadow.god = true))
  await bp.keyboard.press('Escape')
  await waitFor(bp, () => window.__shadow.phase === 'paused')
  await bp.click('button:has-text("Settings")')
  const prior = await G(bp, () => ({ ...window.__shadow.settings }))
  for (const label of ['Reduce motion', 'Damage numbers', 'Show FPS counter']) await bp.click(`button[role="switch"]:has-text("${label}")`)
  await bp.click('button[role="radio"]:has-text("Medium")')
  await bp.click('button[role="radio"]:has-text("On")')
  const stored2 = await G(bp, () => JSON.parse(localStorage.getItem('shadow-protocol:settings:v1')))
  check(
    'Every settings toggle and option persists',
    stored2.reducedMotion === !prior.reducedMotion && stored2.damageNumbers === !prior.damageNumbers && stored2.showFps === !prior.showFps && stored2.graphics === 'medium' && stored2.touchControls === 'on',
  )
  await back()
  await bp.click('button:has-text("Resume")')
  await waitFor(bp, () => window.__shadow.phase === 'playing')
  await sleep(600)
  check(
    'Settings changed mid-run apply on resume (FPS counter, touch controls, reduced motion)',
    (await bp.isVisible('text=FPS')) && (await bp.isVisible('button[aria-label="Dash"]')) && (await G(bp, () => document.documentElement.dataset.motion)) === (stored2.reducedMotion ? 'reduced' : 'full'),
  )
  await bp.setViewportSize({ width: 960, height: 600 })
  await sleep(500)
  const dims = await G(bp, () => {
    const c = document.querySelector('canvas')
    const g = window.__shadow
    return { css: c.clientWidth, px: c.width, dpr: g.dpr, view: g.camera.viewW }
  })
  check('Resizing mid-run resizes the canvas and camera', dims.css === 960 && dims.view === 960 && dims.px === Math.round(960 * dims.dpr), JSON.stringify(dims))
  await G(bp, () => {
    const g = window.__shadow
    g.god = false
    g.player.iframes = 0
    g.player.shield = 0
    g.damagePlayer(9999, g.player.x + 10, g.player.y)
  })
  await waitFor(bp, () => window.__shadow.phase === 'gameover', null, 6000)
  await sleep(900)
  await bp.click('button:has-text("Main Menu")')
  check('Results Main Menu button returns to the menu', await shown('New Run'))
  await bp.click('button:has-text("Settings")')
  await bp.click('button:has-text("Reset progress")')
  await bp.click('button:has-text("Cancel")')
  const runsKept = await G(bp, () => JSON.parse(localStorage.getItem('shadow-protocol:profile:v1')).runs)
  await bp.click('button:has-text("Reset progress")')
  await bp.click('button:has-text("Erase everything")')
  const wiped = await G(bp, () => JSON.parse(localStorage.getItem('shadow-protocol:profile:v1')))
  check(
    'Reset progress: Cancel keeps records, Erase everything wipes them',
    runsKept === 3 && wiped.runs === 0 && wiped.highScore === 0 && wiped.unlockedWeapons.length === 1 && !wiped.hardUnlocked,
    `runs ${runsKept} -> ${wiped.runs}`,
  )
  await back()
  check('Settings Back button returns to the menu', await shown('New Run'))
  await bs.context.close()

  // ------------------------------------------------------------ Interface: one gesture, one action (keyboard, focus, Escape)
  {
    // 1440×900: here a confirm's destructive action and the briefing's Deploy
    // sit exactly under the buttons that open them.
    const { context, page: kp } = await newPage({ viewport: { width: 1440, height: 900 } })
    await G(kp, () =>
      localStorage.setItem(
        'shadow-protocol:profile:v1',
        JSON.stringify({ version: 1, runs: 4, highScore: 1234, unlockedWeapons: ['pulse', 'scatter'], hardUnlocked: false, tutorialSeen: false, introSeen: true }),
      ),
    )
    await kp.reload()
    await kp.waitForSelector('text=New Run')
    // Count every run start, restarts included.
    await G(kp, () => {
      const g = window.__shadow
      const start = g.startRun.bind(g)
      window.__starts = 0
      g.startRun = (config) => {
        window.__starts++
        return start(config)
      }
    })
    const starts = () => G(kp, () => window.__starts)
    const phaseNow = () => G(kp, () => window.__shadow.phase)
    const focused = () => G(kp, () => document.activeElement?.getAttribute('data-focus-id') ?? document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    const focusText = () => G(kp, () => document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    const holdKey = async (key, ms) => {
      await kp.keyboard.down(key)
      for (let t = 0; t < ms; t += 40) {
        await sleep(40)
        await kp.keyboard.down(key) // a second keydown without keyup is an auto-repeat
      }
      await kp.keyboard.up(key)
    }
    await sleep(600)

    await kp.keyboard.press('Escape')
    await sleep(300)
    check('Escape on the main menu does nothing', (await kp.isVisible('[aria-label="Main menu"]')) && (await phaseNow()) === 'idle' && !(await kp.isVisible(INTRO)))

    await kp.click('button:has-text("Settings")')
    await kp.waitForSelector('text=System config')
    await kp.keyboard.press('Escape')
    await kp.waitForSelector('[aria-label="Main menu"]')
    await sleep(150)
    const fromSettings = await focused()
    await kp.click('button:has-text("Credits")')
    await kp.waitForSelector('text=Production')
    await kp.getByRole('button', { name: /^Back/ }).click()
    await kp.waitForSelector('[aria-label="Main menu"]')
    await sleep(150)
    const fromCredits = await focused()
    check('Closing a screen returns focus to the control that opened it', fromSettings === 'settings' && fromCredits === 'credits', `${fromSettings}, ${fromCredits}`)
    await kp.keyboard.press('ArrowUp')
    const up = await focused()
    await kp.keyboard.press('ArrowDown')
    const down = await focused()
    check('Arrow keys move focus through the menu', up === 'settings' && down === 'credits', `credits -> ${up} -> ${down}`)

    // Settings: slider and option-group keyboard patterns, and the reset confirm.
    await kp.click('button:has-text("Settings")')
    await kp.waitForSelector('text=System config')
    await sleep(400)
    const music = () => G(kp, () => window.__shadow.settings.musicVolume)
    const m0 = await music()
    await kp.focus('input[aria-label="Music"]')
    await kp.keyboard.press('ArrowDown')
    const m1 = await music()
    const sliderFocus = await G(kp, () => document.activeElement?.getAttribute('aria-label'))
    await kp.keyboard.press('ArrowUp')
    const m2 = await music()
    check('Slider arrow keys step the value and keep focus on the slider', Math.abs(m0 - m1 - 0.05) < 1e-6 && Math.abs(m2 - m0) < 1e-6 && sliderFocus === 'Music', `${m0} -> ${m1} -> ${m2}`)
    const quality = () => G(kp, () => window.__shadow.settings.graphics)
    const order = ['low', 'medium', 'high']
    const q0 = await quality()
    await kp.focus('[role="radiogroup"][aria-label="Quality"] [aria-checked="true"]')
    await kp.keyboard.press('ArrowRight')
    const q1 = await quality()
    const q1Focus = await G(kp, () => document.activeElement?.dataset.value)
    const tabStops = await G(kp, () => [...document.querySelectorAll('[role="radiogroup"][aria-label="Quality"] [role="radio"]')].filter((b) => b.tabIndex === 0).length)
    await kp.keyboard.press('ArrowLeft')
    const q2 = await quality()
    check('Option groups use the radio pattern: arrows move the selection, one tab stop', q1 === order[(order.indexOf(q0) + 1) % 3] && q1Focus === q1 && tabStops === 1 && q2 === q0, `${q0} -> ${q1} -> ${q2}`)
    await kp.click('button:has-text("Reset progress")')
    await sleep(100)
    const resetFocus = await focusText()
    await kp.keyboard.press('Enter')
    await sleep(150)
    const enterCancels = await kp.isVisible('button:has-text("Reset progress")')
    await kp.click('button:has-text("Reset progress")')
    await kp.keyboard.press('Escape')
    await sleep(150)
    const escCancels = (await kp.isVisible('button:has-text("Reset progress")')) && (await kp.isVisible('text=System config'))
    await kp.dblclick('button:has-text("Reset progress")')
    await sleep(300)
    const kept = await G(kp, () => JSON.parse(localStorage.getItem('shadow-protocol:profile:v1')))
    check(
      'Reset progress opens on Cancel: Enter, Escape or a double-click never erase',
      /^Cancel/.test(resetFocus) && enterCancels && escCancels && kept.runs === 4 && kept.highScore === 1234,
      `focus=${resetFocus} runs=${kept.runs}`,
    )
    await kp.keyboard.press('Escape') // closes the confirm the double-click opened
    await sleep(150)
    await kp.keyboard.press('Escape')
    await kp.waitForSelector('[aria-label="Main menu"]')

    // Loadout: states in words, arrow keys, Escape.
    await kp.click('button:has-text("New Run")')
    await kp.waitForSelector('text=Choose your loadout')
    await sleep(500)
    const radios = await G(kp, () =>
      [...document.querySelectorAll('[role="radio"][data-value]')].map((b) => ({ v: b.dataset.value, text: b.textContent.replace(/\s+/g, ' '), on: b.getAttribute('aria-checked') === 'true', off: b.disabled })),
    )
    const r = Object.fromEntries(radios.map((x) => [x.v, x]))
    check(
      'Loadout states are written out: Selected, Available, Locked with its requirement',
      r.pulse?.on &&
        /Selected/.test(r.pulse.text) &&
        !r.scatter?.off &&
        /Available/.test(r.scatter.text) &&
        ['lancer', 'seeker'].every((id) => r[id]?.off && /Locked/.test(r[id].text) && /Unlock requirement/.test(r[id].text)) &&
        r.normal?.on &&
        /Selected/.test(r.normal.text) &&
        r.hard?.off &&
        /Locked/.test(r.hard.text) &&
        /Complete the protocol once to unlock/.test(r.hard.text),
      radios.map((x) => `${x.v}:${x.on ? 'selected' : x.off ? 'locked' : 'available'}`).join(' '),
    )
    await kp.focus('[role="radio"][data-value="pulse"]')
    await kp.keyboard.press('ArrowRight')
    const picked1 = await G(kp, () => ({ on: document.querySelector('[role="radio"][data-value][aria-checked="true"]')?.dataset.value, focus: document.activeElement?.dataset.value }))
    await kp.keyboard.press('ArrowRight')
    const picked2 = await G(kp, () => document.querySelector('[role="radio"][data-value][aria-checked="true"]')?.dataset.value)
    check('Arrow keys choose among unlocked weapons and skip locked ones', picked1.on === 'scatter' && picked1.focus === 'scatter' && picked2 === 'pulse', `pulse -> ${picked1.on} -> ${picked2}`)
    await kp.keyboard.press('Escape')
    const leftLoadout = await kp.waitForSelector('[aria-label="Main menu"]', { timeout: 2000 }).then(
      () => true,
      () => false,
    )
    check('Escape on the loadout returns to the menu without starting a run', leftLoadout && (await phaseNow()) === 'idle' && (await starts()) === 0)

    // Held keys and double-clicks act once.
    await sleep(300)
    await kp.focus('[data-focus-id="new-run"]')
    await holdKey('Enter', 1200)
    await sleep(300)
    check(
      'Holding Enter activates one control, not each screen it opens',
      (await kp.isVisible('text=Choose your loadout')) && !(await kp.isVisible('text=How to survive')) && (await starts()) === 0,
    )
    await sleep(300)
    await kp.dblclick('button:has-text("Deploy")')
    await sleep(500)
    const briefingHeld = (await kp.isVisible('text=How to survive')) && (await starts()) === 0
    await kp.dblclick('button:has-text("Understood")')
    await waitFor(kp, () => window.__shadow.phase === 'playing', null, 3000)
    await sleep(400)
    check('Double-clicking Deploy and Understood shows the briefing and starts exactly one run', briefingHeld && (await starts()) === 1, `briefing=${briefingHeld} starts=${await starts()}`)

    // Level-up: a weapon key held from the fight and Escape are both ignored.
    await G(kp, () => {
      window.__shadow.god = true
      window.__shadow.queueLevelUp('level')
    })
    await waitFor(kp, () => window.__shadow.phase === 'levelup')
    await holdKey('2', 1000)
    const heldIgnored = (await phaseNow()) === 'levelup'
    const offerNow = await G(kp, () => window.__shadow.store.getState().levelUp.cards.map((c) => ({ id: c.id, rarity: c.rarity, weapon: c.weapon ?? null })))
    const cardText = await G(kp, () => [...document.querySelectorAll('section[aria-label="Select augment"] button')].map((b) => b.textContent))
    const RARITY_LABEL = { common: 'Standard', rare: 'Advanced', epic: 'Prototype' }
    check(
      'Level-up cards state their rarity in words',
      offerNow.length === 3 && offerNow.every((c, i) => cardText[i]?.includes(c.weapon ? 'Weapon · slot' : RARITY_LABEL[c.rarity])),
      offerNow.map((c) => c.weapon ?? c.rarity).join(', '),
    )
    await kp.keyboard.press('Escape')
    await sleep(300)
    const escIgnored = (await phaseNow()) === 'levelup'
    await kp.keyboard.press('2')
    const tookCard = await waitFor(kp, () => window.__shadow.phase === 'playing', null, 2000)
    await sleep(400)
    const applied = await G(kp, (id) => (window.__shadow.player.upgrades[id] ?? 0) >= 1 || id.startsWith('weapon_'), offerNow[1].id)
    check('Level-up ignores Escape and held keys; a fresh key press picks', heldIgnored && escIgnored && tookCard && applied && (await phaseNow()) === 'playing', `held=${heldIgnored} esc=${escIgnored}`)

    // Pause: confirmations open on Cancel; Escape steps back one level at a time.
    await kp.keyboard.press('Escape')
    await waitFor(kp, () => window.__shadow.phase === 'paused')
    await sleep(400)
    await kp.click('button:has-text("Restart")')
    await sleep(100)
    const restartFocus = await focusText()
    await kp.keyboard.press('Enter')
    await sleep(150)
    const enterKept = (await phaseNow()) === 'paused' && (await kp.isVisible('nav[aria-label="Pause menu"]'))
    await kp.click('button:has-text("Main Menu")')
    await sleep(100)
    const quitFocus = await focusText()
    await kp.keyboard.press('Escape')
    await sleep(150)
    const escKept = (await phaseNow()) === 'paused' && (await kp.isVisible('nav[aria-label="Pause menu"]'))
    await kp.dblclick('button:has-text("Restart")')
    await sleep(300)
    const dblKept = (await phaseNow()) === 'paused' && (await starts()) === 1
    check(
      'Pause confirmations open on Cancel: Enter, Escape or a double-click keep the run',
      /^Cancel/.test(restartFocus) && /^Cancel/.test(quitFocus) && enterKept && escKept && dblKept,
      `${restartFocus} | ${quitFocus} | starts=${await starts()}`,
    )
    await kp.keyboard.press('Escape') // closes the confirm the double-click opened
    await sleep(150)
    await kp.click('button:has-text("Settings")')
    await kp.waitForSelector('text=System config')
    await kp.keyboard.press('Escape')
    await kp.waitForSelector('nav[aria-label="Pause menu"]')
    await sleep(150)
    const pauseFocus = await focused()
    const stillPaused = (await phaseNow()) === 'paused'
    await kp.keyboard.press('Escape')
    const resumed = await waitFor(kp, () => window.__shadow.phase === 'playing', null, 2000)
    check('Escape steps back one level at a time: Settings, pause menu (focus on Settings), game', pauseFocus === 'pause-settings' && stillPaused && resumed, pauseFocus)
    await sleep(300)
    await holdKey('Escape', 1000)
    await sleep(300)
    check('Holding Escape pauses once instead of toggling', (await phaseNow()) === 'paused')

    // Results: mashed keys can't restart; then Retry takes focus; Escape never leaves.
    await kp.keyboard.press('Escape')
    await waitFor(kp, () => window.__shadow.phase === 'playing')
    await G(kp, () => {
      const g = window.__shadow
      g.god = false
      g.player.iframes = 0
      g.player.shield = 0
      g.damagePlayer(9999, g.player.x + 10, g.player.y)
    })
    await waitFor(kp, () => window.__shadow.phase === 'gameover', null, 6000)
    for (const key of ['Enter', 'Space', 'Escape', 'Enter', 'Space']) {
      await kp.keyboard.press(key)
      await sleep(40)
    }
    await sleep(100)
    const early = { phase: await phaseNow(), starts: await starts() }
    await sleep(900)
    const retryFocus = await focusText()
    await kp.keyboard.press('Escape')
    await sleep(200)
    const escStays = (await phaseNow()) === 'gameover'
    await kp.keyboard.press('Enter')
    const retried = await waitFor(kp, () => window.__shadow.phase === 'playing' && window.__shadow.director.wave === 1, null, 3000)
    check(
      'Results hold off mashed keys, then focus Retry; Escape never leaves the results',
      early.phase === 'gameover' && early.starts === 1 && /^Retry/.test(retryFocus) && escStays && retried && (await starts()) === 2,
      `${JSON.stringify(early)} focus=${retryFocus}`,
    )
    await context.close()
  }

  // ------------------------------------------------------------ Interface: full-viewport landing page
  {
    const { context, page: lp } = await newPage({ viewport: { width: 1280, height: 720 } })
    // Where the reactor lands on screen, against the open stage the layout reserves for it.
    const framing = () =>
      G(lp, () => {
        const g = window.__shadow
        const rc = g.arena.reactor
        const at = g.camera.worldToScreen(rc.x, rc.y)
        const s = document.querySelector('.launcher-stage').getBoundingClientRect()
        return { x: at.x, y: at.y, inside: at.x > s.left && at.x < s.right && at.y > s.top && at.y < s.bottom, stage: [s.left, s.top, s.width, s.height].map(Math.round), cam: [g.camera.x, g.camera.y] }
      })
    const fits = () =>
      G(lp, () => {
        const vw = document.documentElement.clientWidth
        const vh = document.documentElement.clientHeight
        const shell = document.querySelector('[data-launcher]')
        const onScreen = (sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect()
          return !!r && r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw
        }
        return {
          scroll: shell.scrollHeight - shell.clientHeight,
          wide: document.scrollingElement.scrollWidth - vw,
          parts: ['h1', 'nav[aria-label="Main menu"] button:not([disabled])', 'aside', '.launcher-foot'].map(onScreen),
        }
      })
    await sleep(2500)
    const small = await fits()
    check(
      'Landing page fills 1280×720 without scrolling; title, primary action, record and footer all on screen',
      small.scroll <= 0 && small.wide <= 0 && small.parts.every(Boolean),
      JSON.stringify(small),
    )
    const at720 = await framing()
    check('Landing camera frames the reactor in the open stage', at720.inside, JSON.stringify(at720))
    await lp.setViewportSize({ width: 2560, height: 1080 })
    await sleep(2500)
    const atWide = await framing()
    const wideFit = await fits()
    check('Resizing to ultrawide re-frames the reactor and still fits without scrolling', atWide.inside && wideFit.scroll <= 0 && wideFit.parts.every(Boolean), JSON.stringify({ atWide, wideFit }))
    await context.close()

    const still = await newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    await sleep(1500)
    const a = await G(still.page, () => [window.__shadow.camera.x, window.__shadow.camera.y, window.__shadow.camera.renderZoom])
    await still.page.mouse.move(200, 200)
    await still.page.mouse.move(1300, 800, { steps: 8 })
    await sleep(1200)
    const b = await G(still.page, () => [window.__shadow.camera.x, window.__shadow.camera.y, window.__shadow.camera.renderZoom])
    const reactorInStage = await G(still.page, () => {
      const g = window.__shadow
      const at = g.camera.worldToScreen(g.arena.reactor.x, g.arena.reactor.y)
      const s = document.querySelector('.launcher-stage').getBoundingClientRect()
      return at.x > s.left && at.x < s.right && at.y > s.top && at.y < s.bottom
    })
    check('Reduced motion holds the landing composition still (no drift or parallax)', a.every((v, i) => Math.abs(v - b[i]) < 1e-6) && reactorInStage, `${a.map((v) => v.toFixed(2))} -> ${b.map((v) => v.toFixed(2))}`)
    await still.context.close()
  }

  // ------------------------------------------------------------ Interface: sliders by mouse and by touch
  {
    const openSettings = async (opts) => {
      const s = await newPage(opts)
      await s.page.locator('button:has-text("Settings")').first().click()
      await s.page.waitForSelector('text=System config')
      await sleep(600)
      return s
    }
    const music = (pg) => G(pg, () => window.__shadow.settings.musicVolume)
    const mouse = await openSettings({ viewport: { width: 1280, height: 720 } })
    const box = await mouse.page.locator('input[aria-label="Music"]').boundingBox()
    const y = box.y + box.height / 2
    await mouse.page.mouse.click(box.x + box.width * 0.25, y)
    const clicked = await music(mouse.page)
    await mouse.page.mouse.move(box.x + box.width * 0.25, y)
    await mouse.page.mouse.down()
    for (let i = 1; i <= 10; i++) await mouse.page.mouse.move(box.x + box.width * (0.25 + i * 0.05), y)
    await mouse.page.mouse.up()
    const dragged = await music(mouse.page)
    await mouse.context.close()
    const touch = await openSettings({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const slider = touch.page.locator('input[aria-label="Music"]')
    await slider.scrollIntoViewIfNeeded()
    await sleep(200)
    const tb = await slider.boundingBox()
    const cdp = await touch.context.newCDPSession(touch.page)
    const point = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: tb.y + tb.height / 2, id: 1 }] })
    const before = await music(touch.page)
    await point('touchStart', tb.x + tb.width * 0.2)
    for (let i = 1; i <= 12; i++) {
      await point('touchMove', tb.x + tb.width * (0.2 + i * 0.05))
      await sleep(16)
    }
    await point('touchEnd')
    await sleep(150)
    const swiped = await music(touch.page)
    check(
      'Sliders follow a mouse click, a mouse drag and a touch drag',
      Math.abs(clicked - 0.25) <= 0.06 && Math.abs(dragged - 0.75) <= 0.06 && Math.abs(swiped - 0.8) <= 0.08 && swiped !== before,
      `click ${clicked}, drag ${dragged}, touch ${before} -> ${swiped}`,
    )
    await touch.context.close()
  }

  // ------------------------------------------------------------ Interface: the smallest phone (320×568, touch)
  {
    const { context, page: np } = await newPage({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const audit = () =>
      G(np, () => {
        const vw = document.documentElement.clientWidth
        const shown = (el) => {
          const b = el.getBoundingClientRect()
          const s = getComputedStyle(el)
          return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
        }
        const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 32)
        const controls = [...document.querySelectorAll('button, input, a[href], [role="switch"], [role="radio"]')].filter(shown)
        const wide = document.scrollingElement.scrollWidth > vw + 1 ? [`page +${document.scrollingElement.scrollWidth - vw}px`] : []
        for (const el of document.querySelectorAll('*')) {
          const s = getComputedStyle(el)
          if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) wide.push(`${name(el)} +${el.scrollWidth - el.clientWidth}px`)
        }
        for (const el of controls) {
          const b = el.getBoundingClientRect()
          if (b.left < -1 || b.right > vw + 1) wide.push(`${name(el)} off screen`)
        }
        // Range inputs are excluded: their target is the whole labelled row.
        const small = controls
          .filter((el) => !(el.tagName === 'INPUT' && el.type === 'range'))
          .map((el) => [el, el.getBoundingClientRect()])
          .filter(([, b]) => b.width < 44 || b.height < 44)
          .map(([el, b]) => `${name(el)} ${Math.round(b.width)}×${Math.round(b.height)}`)
        return { wide, small }
      })
    const report = {}
    const visit = async (label) => {
      await sleep(700)
      report[label] = await audit()
    }
    const backTo = async (selector) => {
      await np.getByRole('button', { name: /^Back/ }).tap()
      await np.waitForSelector(selector)
      // At a person's pace: a second tap within Chrome's 300 ms double-tap
      // window, on a control that just appeared, is treated as a double tap.
      await sleep(400)
    }
    await visit('menu')
    await np.tap('button:has-text("How to Play")')
    await np.waitForSelector('text=How to survive')
    await visit('briefing')
    await backTo('[aria-label="Main menu"]')
    await np.tap('button:has-text("Settings")')
    await np.waitForSelector('text=System config')
    await visit('settings')
    await backTo('[aria-label="Main menu"]')
    await np.tap('button:has-text("Credits")')
    await np.waitForSelector('text=Production')
    await visit('credits')
    await backTo('[aria-label="Main menu"]')
    await np.tap('button:has-text("New Run")')
    await np.waitForSelector('text=Choose your loadout')
    await visit('loadout')
    await np.tap('button:has-text("Deploy")')
    await np.waitForSelector('text=How to survive')
    await visit('briefing before deploy')
    await np.tap('button:has-text("Understood")')
    await waitFor(np, () => window.__shadow.phase === 'playing')
    await G(np, () => (window.__shadow.god = true))
    await visit('hud')
    await np.tap('button[aria-label="Pause"]')
    await waitFor(np, () => window.__shadow.phase === 'paused')
    await visit('pause')
    await np.tap('button:has-text("Resume")')
    await waitFor(np, () => window.__shadow.phase === 'playing')
    await G(np, () => window.__shadow.queueLevelUp('level'))
    await waitFor(np, () => window.__shadow.phase === 'levelup')
    await visit('level-up')
    await np.locator('section[aria-label="Select augment"] button').first().tap()
    await waitFor(np, () => window.__shadow.phase === 'playing', null, 3000)
    await G(np, () => {
      const g = window.__shadow
      g.god = false
      g.player.iframes = 0
      g.player.shield = 0
      g.damagePlayer(9999, g.player.x + 10, g.player.y)
    })
    await waitFor(np, () => window.__shadow.phase === 'gameover', null, 6000)
    await visit('results')
    const sideways = Object.entries(report).filter(([, a]) => a.wide.length)
    const tiny = Object.entries(report).filter(([, a]) => a.small.length)
    check(
      '320 px: no screen scrolls sideways or pushes a control off screen',
      Object.keys(report).length === 10 && sideways.length === 0,
      sideways.map(([k, a]) => `${k}: ${a.wide.slice(0, 3).join(', ')}`).join(' | '),
    )
    check('Phones: every control is at least 44×44 px', Object.keys(report).length === 10 && tiny.length === 0, tiny.map(([k, a]) => `${k}: ${a.small.slice(0, 3).join(', ')}`).join(' | '))
    await context.close()
  }
} catch (err) {
  failed = true
  console.error('E2E crashed:', err)
} finally {
  await browser.close()
}

const relevant = consoleProblems.filter((m) => !/AudioContext was not allowed to start/.test(m))
check('Console clean (no errors/warnings)', relevant.length === 0, relevant.slice(0, 8).join(' | '))
const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} checks passed. Screenshots in ${OUT}/`)
process.exit(failed ? 1 : 0)
