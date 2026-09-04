#!/usr/bin/env node
// Check a BUILT app, not the source tree.
//
//   node scripts/verify-package.cjs release/mac/ZeroAI\ Studio.app
//   node scripts/verify-package.cjs release/win-unpacked
//
// 0.4.0 shipped with a black screen reading "Not found: studio/index.html".
// extraResources copies the CONTENTS of payload/, so the payload landed one
// directory deeper than main.js looked — and every test passed, because
// unpacked the app falls through to a different directory that happens to be
// correct. The dev path and the packaged path were not the same path, and
// only the dev one was ever exercised.
//
// So this asserts against the artefact a school actually installs.

const fs = require('node:fs')
const path = require('node:path')

const target = process.argv[2]
if (!target) { console.error('usage: verify-package.cjs <path to .app or unpacked dir>'); process.exit(1) }

const resources = fs.existsSync(path.join(target, 'Contents', 'Resources'))
  ? path.join(target, 'Contents', 'Resources')          // macOS .app
  : path.join(target, 'resources')                      // win/linux unpacked
if (!fs.existsSync(resources)) { console.error(`✗ no resources dir under ${target}`); process.exit(1) }

const fail = []
const ok = []

// 1. The payload has to be reachable at one of the paths main.js looks in.
const roots = [
  path.join(resources, 'studio-app', 'studio'),
  path.join(resources, 'studio-app'),
]
const root = roots.find(d => fs.existsSync(path.join(d, 'index.html')))
if (!root) fail.push(`no index.html under ${path.relative(target, roots[1])} — this is the black screen`)
else ok.push(`index.html at ${path.relative(resources, root) || '.'}`)

if (root) {
  // 2. index.html must reference assets that are actually there. A stale or
  //    half-copied payload loads a white page with a console error nobody sees.
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(m => m[1])
  const missing = refs.filter(r => !fs.existsSync(path.join(root, r)))
  if (missing.length) fail.push(`index.html references files that are not in the payload: ${missing.join(', ')}`)
  else ok.push(`${refs.length} asset references all resolve`)

  // 3. Edition sanity. Shipping the wrong one is invisible until a school with
  //    no internet opens it and finds a login form.
  const ed = path.join(resources, 'studio-app', 'edition.json')
  if (fs.existsSync(ed)) {
    const { edition, studio } = JSON.parse(fs.readFileSync(ed, 'utf8'))
    ok.push(`edition: ${edition}, hub ${studio}`)
    const hasPyodide = fs.existsSync(path.join(root, 'pyodide', 'pyodide.js'))
    if (edition === 'legacy' && !hasPyodide) fail.push('legacy payload has no pyodide — Python will not run offline')
    if (edition === 'online' && hasPyodide) fail.push('online payload carries pyodide — 205MB nobody will fetch')
    if (edition === 'legacy') {
      // A live anon key must never reach a USB stick.
      const leaked = []
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name)
          if (e.isDirectory()) { walk(p); continue }
          if (!/\.(js|html|css|json)$/.test(e.name)) continue
          const t = fs.readFileSync(p, 'utf8')
          if (/[a-z]{20}\.supabase\.co/.test(t) || /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(t)) leaked.push(path.relative(root, p))
        }
      }
      walk(path.join(root, 'assets'))
      if (leaked.length) fail.push(`Supabase credentials in the offline payload: ${leaked.slice(0, 3).join(', ')}`)
      else ok.push('no Supabase credentials in the offline payload')
    }
  } else fail.push('no edition.json — cannot tell which edition this is')
}

for (const o of ok) console.log(`  ok   ${o}`)
for (const f of fail) console.error(`  ✗    ${f}`)
if (fail.length) { console.error(`\n${path.basename(target)} FAILED\n`); process.exit(1) }
console.log(`\n${path.basename(target)} looks installable\n`)
