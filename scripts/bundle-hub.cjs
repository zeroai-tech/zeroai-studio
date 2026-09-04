#!/usr/bin/env node
// Build ZeroAI Studio (the hub) and stage it as this shell's payload.
//
//   node scripts/bundle-hub.cjs            online edition
//   node scripts/bundle-hub.cjs --legacy   offline edition (VITE_LEGACY=1)
//
// This replaces bundle-apps.cjs / bundle-apps-legacy.cjs, which built the six
// SEPARATE app repos next to this one and zipped each into bundled-apps/. Those
// repos are retired: every app now lives inside zeroai-studio-hub as a route,
// and building from them shipped whatever state they happened to be frozen in.
// The desktop payload is that one hub build.
//
// Smaller too, and not marginally: six bundles meant six copies of React,
// Zustand and every shared library.

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const LEGACY = process.argv.includes('--legacy')
const HUB = path.join(__dirname, '..', '..', 'zeroai-studio-hub')
// One directory per edition. They used to share bundled-apps/, and since
// `dist:mac` never re-ran a bundler, whichever edition was built last decided
// what the OTHER one shipped — the released 0.4.0 online DMGs contain
// VITE_LEGACY=1 apps because of exactly that.
const OUT = path.join(__dirname, '..', LEGACY ? 'payload-legacy' : 'payload-online')

if (!fs.existsSync(HUB)) {
  console.error(`✗ hub not found at ${HUB}`)
  process.exit(1)
}

console.log(`building the hub (${LEGACY ? 'VITE_LEGACY=1, offline' : 'online'}) …`)
execSync('bun run build', {
  cwd: HUB,
  env: LEGACY ? { ...process.env, VITE_LEGACY: '1' } : process.env,
  stdio: 'inherit',
})

const dist = path.join(HUB, 'dist')
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('✗ no dist/index.html after the hub build')
  process.exit(1)
}

// A live Supabase URL or anon key must never reach a USB stick. The hub strips
// them from Legacy builds (src/lib/supabaseClient.ts); this is the second pair
// of eyes on the artefact itself, at the last point before it is packaged.
if (LEGACY) {
  const offenders = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!/\.(js|html|css|json)$/.test(e.name)) continue
      const text = fs.readFileSync(p, 'utf8')
      if (/[a-z]{20}\.supabase\.co/.test(text) || /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(text)) {
        offenders.push(path.relative(dist, p))
      }
    }
  }
  walk(dist)
  if (offenders.length) {
    console.error('\n✗ Supabase credentials found in the offline build:')
    for (const f of offenders) console.error('   ' + f)
    process.exit(1)
  }
  console.log('checked: no Supabase credentials in the offline payload')
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.cpSync(dist, path.join(OUT, 'studio'), { recursive: true })

const pkg = JSON.parse(fs.readFileSync(path.join(HUB, 'package.json'), 'utf8'))
fs.writeFileSync(path.join(OUT, 'versions.json'),
  JSON.stringify({ studio: pkg.version || '0.0.0', legacy: LEGACY }, null, 2))

const du = (d) => fs.readdirSync(d, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? du(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0)
console.log(`\n${path.basename(OUT)}/studio — ${(du(path.join(OUT, 'studio')) / 1048576).toFixed(0)} MB`)
