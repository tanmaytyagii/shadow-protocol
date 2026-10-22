// Balance probe: a simple kiting bot plays full runs through the real engine,
// fast-forwarded (no rendering). Reports how far it gets per difficulty.
//
//   npx vite preview --port 4173   (in another terminal, after npm run build)
//   node scripts/balance.mjs [runs=4]
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const RUNS = Number(process.argv[2] ?? 4)
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
  (p) => p && existsSync(p),
)

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage()
await page.goto(`${BASE}/?debug`)
// A fresh profile opens with the cinematic; skip it like a player would.
await page.locator('section[aria-label="Opening sequence"]').or(page.locator('text=New Run')).first().waitFor()
if (await page.isVisible('button:has-text("Skip intro")')) await page.click('button:has-text("Skip intro")')
await page.waitForSelector('text=New Run')

async function simulate(difficulty, skill) {
  return page.evaluate(
    ({ difficulty, skill }) => {
      const g = window.__shadow
      g.startRun({ difficulty, startWeapon: 'pulse' })
      g.input.usingTouch = true
      const dt = 1 / 60
      const maxTime = 1200
      let t = 0
      const waves = []
      let lastWave = 0
      let damageTaken = 0
      const startHp = () => g.player.hp + g.player.shield
      let prevHp = startHp()
      const preference = ['multishot', 'damage', 'firerate', 'hp', 'shield', 'crit', 'pierce', 'volatile', 'leech', 'weapon_seeker', 'weapon_lancer', 'speed', 'dash']

      while (t < maxTime) {
        if (g.phase === 'levelup') {
          const o = g.store.getState().levelUp
          const ranked = [...o.cards].sort((a, b) => {
            const ia = preference.indexOf(a.id)
            const ib = preference.indexOf(b.id)
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
          })
          g.chooseUpgrade(ranked[0].id)
          continue
        }
        if (g.phase !== 'playing') break
        const p = g.player
        if (!p.alive) break
        if (g.director.state === 'complete') break

        // --- Bot brain -------------------------------------------------------
        let mx = 0
        let my = 0
        let nearest = null
        let nd = Infinity
        let crowd = 0
        for (const e of g.enemies) {
          if (!e.alive) continue
          const dx = p.x - e.x
          const dy = p.y - e.y
          const d = Math.hypot(dx, dy) || 1
          if (e.spawnTimer <= 0 && d < nd) {
            nd = d
            nearest = e
          }
          const danger = e.isBoss ? 420 : 300
          if (d < danger) {
            const w = (danger - d) / danger
            mx += (dx / d) * w * (e.isBoss ? 2 : 1)
            my += (dy / d) * w * (e.isBoss ? 2 : 1)
            crowd++
          }
        }
        let dodge = false
        for (const b of g.projectiles) {
          if (b.friendly || !b.alive) continue
          const dx = p.x - b.x
          const dy = p.y - b.y
          const d = Math.hypot(dx, dy)
          if (d > 160 * skill) continue
          const sp = Math.hypot(b.vx, b.vy) || 1
          const approach = (b.vx * dx + b.vy * dy) / (sp * (d || 1))
          if (approach > 0.6) {
            // Step sideways out of the bullet's path.
            const side = b.vx * dy - b.vy * dx > 0 ? 1 : -1
            mx += (-b.vy / sp) * side * 1.6 * skill
            my += (b.vx / sp) * side * 1.6 * skill
            if (d < 45) dodge = true
          }
        }
        for (const h of g.hazards) {
          if (h.kind === 'mine') {
            const dx = p.x - h.x
            const dy = p.y - h.y
            const d = Math.hypot(dx, dy) || 1
            if (d < h.radius + 40) {
              mx += (dx / d) * 2 * skill
              my += (dy / d) * 2 * skill
            }
          }
          if (h.kind === 'laser' && h.t > h.telegraph - 0.3) {
            const ax = Math.cos(h.angle)
            const ay = Math.sin(h.angle)
            const rx = p.x - h.owner.x
            const ry = p.y - h.owner.y
            const perp = rx * -ay + ry * ax
            if (Math.abs(perp) < 70) dodge = true
          }
          if (h.kind === 'ring') {
            const d = Math.hypot(p.x - h.x, p.y - h.y)
            if (Math.abs(d - h.radius) < 40) dodge = true
          }
        }
        // Stay away from walls and drift to the centre when idle.
        const cx = 1200 - p.x
        const cy = 800 - p.y
        const cl = Math.hypot(cx, cy) || 1
        const wallPull = p.x < 200 || p.x > 2200 || p.y < 200 || p.y > 1400 ? 1.5 : 0.15
        mx += (cx / cl) * wallPull
        my += (cy / cl) * wallPull
        // Grab nearby pickups.
        for (const pk of g.pickups) {
          const dx = pk.x - p.x
          const dy = pk.y - p.y
          const d = Math.hypot(dx, dy) || 1
          if (d < 260 && pk.kind !== 'xp') {
            mx += (dx / d) * 0.6
            my += (dy / d) * 0.6
          }
        }
        const ml = Math.hypot(mx, my)
        if (ml > 1) {
          mx /= ml
          my /= ml
        }
        if (nearest) {
          // Imperfect aim: error grows as skill drops.
          const err = (Math.random() - 0.5) * (1 - skill) * 0.5
          const a = Math.atan2(nearest.y - p.y, nearest.x - p.x) + err
          g.input.touchAiming = true
          g.input.touchAimX = Math.cos(a)
          g.input.touchAimY = Math.sin(a)
        } else g.input.touchAiming = false

        const controls = {
          moveX: mx,
          moveY: my,
          fire: !!nearest,
          dash: dodge && Math.random() < skill,
          boost: crowd >= 4,
          weaponSlot: 0,
          weaponCycle: 0,
          pause: false,
        }
        g.update(dt, controls, true)
        g.maybeOpenLevelUp()

        const hpNow = g.player.hp + g.player.shield
        if (hpNow < prevHp) damageTaken += prevHp - hpNow
        prevHp = hpNow
        if (g.director.wave !== lastWave) {
          lastWave = g.director.wave
          waves.push({ wave: lastWave, t: Math.round(t), hp: Math.round(g.player.hp), lvl: g.player.level })
        }
        t += dt
      }
      const result = {
        difficulty,
        skill,
        outcome: g.director.state === 'complete' ? 'VICTORY' : g.player.alive ? 'timeout' : 'died',
        wave: g.director.wave,
        time: Math.round(t),
        level: g.player.level,
        kills: g.kills,
        score: g.score,
        damageTaken: Math.round(damageTaken),
        waves: waves.map((w) => `w${w.wave}@${w.t}s(hp${w.hp},L${w.lvl})`).join(' '),
      }
      g.quitToMenu()
      return result
    },
    { difficulty, skill },
  )
}

const configs = (process.env.CONFIGS ?? 'normal:0,normal:0.3,normal:0.6,normal:1,hard:0.6,hard:1')
  .split(',')
  .map((c) => c.split(':'))
  .map(([d, s]) => [d, Number(s)])
for (const [difficulty, skill] of configs) {
  for (let i = 0; i < RUNS; i++) {
    const r = await simulate(difficulty, skill)
    console.log(
      `${r.difficulty.padEnd(6)} skill=${r.skill} ${r.outcome.padEnd(7)} wave=${r.wave} t=${r.time}s L${r.level} kills=${r.kills} dmgTaken=${r.damageTaken}`,
    )
  }
}
await browser.close()
