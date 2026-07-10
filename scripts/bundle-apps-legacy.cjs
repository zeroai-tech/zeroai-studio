#!/usr/bin/env node
// Build each suite app in OFFLINE legacy mode (VITE_LEGACY=1) from local source
// and bake it into bundled-apps/ for "ZeroAI Studio Legacy". No downloads.
//
// Usage:  node scripts/bundle-apps-legacy.cjs   (then: npm run dist:legacy)

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const CODE = path.join(__dirname, '..', '..') // …/Code
const OUT = path.join(__dirname, '..', 'bundled-apps')

// id → local repo dir (all suite apps live next to zeroai-studio in …/Code)
const APPS = [
  { id: 'zerospark', dir: 'zerospark' },
  { id: 'zaiblock', dir: 'zaiblock' },
  { id: 'zaisim', dir: 'zaisim' },
  { id: 'zaipy', dir: 'zaipy' },
  { id: 'zaicad', dir: 'zaicad' },
]

fs.mkdirSync(OUT, { recursive: true })
const versions = {}

for (const a of APPS) {
  const appDir = path.join(CODE, a.dir)
  if (!fs.existsSync(appDir)) { console.error(`✗ ${a.id}: repo not found at ${appDir}`); process.exit(1) }
  process.stdout.write(`${a.id} (VITE_LEGACY build) … `)

  execSync('bun run build', { cwd: appDir, env: { ...process.env, VITE_LEGACY: '1' }, stdio: 'ignore' })

  const dist = path.join(appDir, 'dist')
  if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error(`\n✗ ${a.id}: no dist/index.html after build`); process.exit(1) }

  const zip = path.join(OUT, a.id + '.zip')
  fs.rmSync(zip, { force: true })
  execSync(`cd "${dist}" && zip -qr "${zip}" .`, { stdio: 'ignore' }) // zip the CONTENTS of dist/

  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))
  versions[a.id] = pkg.version || '0.0.0'
  console.log('ok', (fs.statSync(zip).size / 1048576).toFixed(1), 'MB')
}

fs.writeFileSync(path.join(OUT, 'versions.json'), JSON.stringify(versions, null, 2))
console.log('\nbundled-apps/ ready (offline legacy) — build the installer with: npm run dist:legacy')
