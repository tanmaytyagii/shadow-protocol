// Converts the frames picked for the README from the capture folder into
// compressed WebP files in docs/screenshots/, and assembles the recorded
// gameplay clip into an animated WebP at its original pace. Needs `cwebp` and
// `img2webp` (libwebp: `brew install webp`, `apt install webp`).
//
//   node scripts/optimize-screenshots.mjs [--from=test-artifacts/readme] [--quality=82]
//
// Copy the frames you choose to the `pick-*.png` names below (frame numbers change
// from run to run), or edit PICKS, after a fresh `npm run docs:screenshots`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, '').split('='))
    .map(([k, v]) => [k, v ?? 'true']),
)
const FROM = args.from ?? 'test-artifacts/readme'
const TO = 'docs/screenshots'
const QUALITY = args.quality ?? '82'

/** README name → captured frame. Width is the output width in pixels (height keeps the aspect ratio). */
export const PICKS = {
  'title-screen': { src: 'intro.png', width: 1600 },
  'main-menu': { src: 'main-menu.png', width: 1600 },
  'loadout': { src: 'loadout.png', width: 1600 },
  'settings': { src: 'settings.png', width: 1600 },
  'gameplay-combat': { src: 'pick-combat.png', width: 1600 },
  'enemy-wave': { src: 'pick-enemy-wave.png', width: 1600 },
  'upgrade-selection': { src: 'pick-upgrade-selection.png', width: 1600 },
  'pause-menu': { src: 'pick-pause-menu.png', width: 1600 },
  'boss-warden': { src: 'pick-warden.png', width: 1600 },
  'boss-sovereign': { src: 'pick-sovereign.png', width: 1600 },
  'game-over': { src: 'pick-game-over.png', width: 1600 },
  'victory': { src: 'victory.png', width: 1600 },
  'mobile-menu': { src: 'mobile-menu.png', width: 780 },
  'mobile-gameplay': { src: 'pick-mobile-gameplay.png', width: 780 },
}

mkdirSync(TO, { recursive: true })
let total = 0
for (const [name, { src, width }] of Object.entries(PICKS)) {
  const input = join(FROM, src)
  if (!existsSync(input)) {
    console.warn(`  skip ${name}: ${input} not found`)
    continue
  }
  const output = join(TO, `${name}.webp`)
  execFileSync('cwebp', ['-quiet', '-q', QUALITY, '-m', '6', '-resize', String(width), '0', input, '-o', output])
  const kb = statSync(output).size / 1024
  total += kb
  console.log(`  ${output.padEnd(40)} ${kb.toFixed(0).padStart(5)} KB`)
}
console.log(`Total ${(total / 1024).toFixed(2)} MB`)

// The hero clip: the kept frames are resized, then each is shown for as long as it actually lasted.
const clipDir = join(FROM, 'clip')
if (existsSync(join(clipDir, 'frames.json'))) {
  const frames = JSON.parse(readFileSync(join(clipDir, 'frames.json'), 'utf8'))
  const tmp = join(clipDir, 'resized')
  mkdirSync(tmp, { recursive: true })
  const argv = ['-loop', '0', '-lossy', '-q', '75', '-m', '6']
  // Keep about 15 frames per second; each kept frame lasts until the next kept one.
  const kept = []
  for (const f of frames) if (!kept.length || f.t - kept.at(-1).t >= 60) kept.push(f)
  kept.forEach((f, i) => {
    const out = join(tmp, f.file.replace(/\.jpg$/, '.webp'))
    execFileSync('cwebp', ['-quiet', '-q', '95', '-resize', '800', '0', join(clipDir, f.file), '-o', out])
    const next = kept[i + 1]?.t ?? f.t + 66
    argv.push('-d', String(Math.round(next - f.t)), out)
  })
  const output = join(TO, 'hero-gameplay.webp')
  execFileSync('img2webp', [...argv, '-o', output])
  rmSync(tmp, { recursive: true })
  const seconds = (frames.at(-1).t - frames[0].t) / 1000
  console.log(`  ${output.padEnd(40)} ${(statSync(output).size / 1024).toFixed(0).padStart(5)} KB (${kept.length} frames, ${seconds.toFixed(1)} s)`)
}
