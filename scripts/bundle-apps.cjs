#!/usr/bin/env node
// Download the current catalog's app zips into bundled-apps/ so `npm run
// dist:full` can bake the whole suite into one offline installer. The shell
// seeds these into the user's install dir on first run (see seedBundledApps).
//
// Usage:  node scripts/bundle-apps.cjs   (then: npm run dist:full)

const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const crypto = require('node:crypto')

const OUT = path.join(__dirname, '..', 'bundled-apps')
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'))

function get(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ZeroAI-Studio-bundler' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 6) {
        res.resume(); return resolve(get(res.headers.location, dest, redirects + 1))
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' for ' + url)) }
      const f = fs.createWriteStream(dest)
      res.pipe(f); f.on('finish', () => f.close(resolve)); f.on('error', reject)
    }).on('error', reject)
  })
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const versions = {}
  for (const a of manifest.apps) {
    const dest = path.join(OUT, a.id + '.zip')
    process.stdout.write(`${a.id}@${a.version} … `)
    await get(a.url, dest)
    if (a.sha256) {
      const got = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')
      if (got !== a.sha256) throw new Error(`sha256 mismatch for ${a.id}`)
    }
    versions[a.id] = a.version
    console.log('ok', (fs.statSync(dest).size / 1048576).toFixed(1), 'MB')
  }
  fs.writeFileSync(path.join(OUT, 'versions.json'), JSON.stringify(versions, null, 2))
  console.log('bundled-apps/ ready — build the full installer with: npm run dist:full')
})().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
