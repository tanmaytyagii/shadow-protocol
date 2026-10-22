// Renders the README banner and the GitHub social preview from a real gameplay
// screenshot plus the game's own title lockup and fonts. Needs Chrome and
// `cwebp` (libwebp).
//
//   node scripts/brand.mjs [--background=docs/screenshots/boss-sovereign.webp]
//
// Writes docs/brand/banner.webp and docs/brand/social-preview.png.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, '').split('='))
    .map(([k, v]) => [k, v ?? 'true']),
)
const BACKGROUND = resolve(args.background ?? 'docs/screenshots/boss-sovereign.webp')
const OUT = 'docs/brand'
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
  (p) => p && existsSync(p),
)
if (!executablePath) {
  console.error('No Chrome/Chromium found. Set CHROME_PATH.')
  process.exit(1)
}
// Inlined as data URIs: a page made with setContent can't load file:// resources.
const dataUri = (path, type) => `data:${type};base64,${readFileSync(path).toString('base64')}`
const font = (pkg, file) => dataUri(resolve('node_modules/@fontsource-variable', pkg, 'files', file), 'font/woff2')
const background = dataUri(BACKGROUND, BACKGROUND.endsWith('.png') ? 'image/png' : 'image/webp')

function html({ width, height, title, social }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Oxanium; src: url(${font('oxanium', 'oxanium-latin-wght-normal.woff2')}) format('woff2'); font-weight: 200 800; }
@font-face { font-family: 'JetBrains Mono'; src: url(${font('jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 800; }
* { box-sizing: border-box; margin: 0; }
body { width: ${width}px; height: ${height}px; overflow: hidden; background: #05070f; font-family: Oxanium, sans-serif; }
.bg { position: absolute; inset: 0; background: url(${background}) ${social ? '68% 50%' : '78% 52%'} / ${social ? '125%' : '112%'} auto no-repeat; }
.shade { position: absolute; inset: 0; background:
  linear-gradient(90deg, #05070f 0%, rgba(5,7,15,0.96) ${social ? 30 : 26}%, rgba(5,7,15,0.55) ${social ? 55 : 50}%, rgba(5,7,15,0.05) 80%),
  radial-gradient(ellipse at 70% 50%, transparent 40%, rgba(3,5,11,0.65) 100%); }
.scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px); }
.frame { position: absolute; inset: ${social ? 28 : 18}px; border: 1px solid rgba(62,242,255,0.18);
  clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px)); }
.copy { position: absolute; left: ${social ? 80 : 64}px; top: 50%; transform: translateY(-50%); }
.kicker { font: 600 ${social ? 17 : 14}px 'JetBrains Mono', monospace; letter-spacing: 0.42em; color: #ff5fae; text-transform: uppercase; }
.title { margin-top: ${social ? 18 : 12}px; font-size: ${title}px; line-height: 1; }
.main { display: block; font-weight: 800; line-height: 0.86; letter-spacing: 0.035em; white-space: nowrap;
  background: linear-gradient(180deg, #ffffff 0%, #f1fbff 50%, #b3f4ff 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 28px rgba(62,242,255,0.3)) drop-shadow(0 0 2px rgba(157,249,255,0.45)); }
.sub { display: flex; align-items: center; gap: 0.4em; margin-top: 0.3em; padding-left: 0.08em; font-size: 0.3em; font-weight: 600; line-height: 1.1;
  letter-spacing: 0.44em; color: #3ef2ff; text-shadow: 0 0 18px rgba(62,242,255,0.4); }
.sub::after { content: ''; flex: 1; min-width: 0.75em; height: 1px; background: linear-gradient(90deg, rgba(62,242,255,0.7), rgba(62,242,255,0.08)); box-shadow: 0 0 8px rgba(62,242,255,0.45); }
.tag { margin-top: ${social ? 30 : 20}px; font-size: ${social ? 26 : 20}px; font-weight: 500; letter-spacing: 0.02em; color: #c9d6f5; }
.facts { margin-top: ${social ? 26 : 14}px; display: flex; gap: 10px; font: 600 ${social ? 15 : 12}px 'JetBrains Mono', monospace; letter-spacing: 0.16em; text-transform: uppercase; }
.facts span { padding: ${social ? '8px 12px' : '6px 10px'}; color: #9df9ff; background: rgba(12,20,38,0.85); box-shadow: inset 0 0 0 1px rgba(62,242,255,0.3); }
</style></head><body>
<div class="bg"></div><div class="shade"></div><div class="scan"></div><div class="frame"></div>
<div class="copy">
  <div class="kicker">// Facility 07 · Containment breach</div>
  <div class="title"><span class="main">SHADOW</span><span class="sub">PROTOCOL</span></div>
  <div class="tag">Cyberpunk arcade survival shooter for the browser</div>
  <div class="facts">${(social ? ['10 waves', '2 bosses', '21 augments'] : ['Canvas 2D', 'Web Audio', 'React + TypeScript']).map((f) => `<span>${f}</span>`).join('')}</div>
  ${social ? `<div class="facts" style="margin-top:12px"><span>React</span><span>TypeScript</span><span>HTML5 Canvas</span><span>Web Audio</span></div>` : ''}
</div>
</body></html>`
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath, headless: true })
async function render(opts, path, scale) {
  const page = await browser.newPage({ viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: scale })
  await page.setContent(html(opts), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path })
  await page.close()
}

const tmp = join(OUT, 'banner.tmp.png')
await render({ width: 1280, height: 400, title: 132, social: false }, tmp, 2)
execFileSync('cwebp', ['-quiet', '-q', '86', '-m', '6', '-resize', '1920', '0', tmp, '-o', join(OUT, 'banner.webp')])
rmSync(tmp)
await render({ width: 1280, height: 640, title: 168, social: true }, join(OUT, 'social-preview.png'), 1)
await browser.close()
for (const f of ['banner.webp', 'social-preview.png']) console.log(`  ${join(OUT, f)} ${(statSync(join(OUT, f)).size / 1024).toFixed(0)} KB`)
