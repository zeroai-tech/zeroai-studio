#!/usr/bin/env node
// Package "ZeroAI Studio Legacy" for one or more platforms. Swaps in the offline
// config (legacy=true, no Supabase), builds, then ALWAYS restores the online config,
// and renames outputs to ZeroAI-Studio-Legacy-<ver>-<platform>-<arch>.<ext>.
//
//   node scripts/pack-legacy.cjs             # mac + win + linux
//   node scripts/pack-legacy.cjs mac linux   # a subset
//
// Run `node scripts/bundle-apps-legacy.cjs` first to bake the offline app builds.
const fs = require('node:fs'); const path = require('node:path'); const { execSync } = require('node:child_process')
const root = path.join(__dirname, '..')
const CFG = path.join(root, 'studio.config.json'); const BAK = CFG + '.online.bak'
const REL = path.join(root, 'release')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['mac', 'win', 'linux']
const brand = '-c.productName="ZeroAI Studio Legacy" -c.appId=tech.zeroai.studio.legacy --publish never'
const run = (flags) => execSync(`npx electron-builder ${flags} ${brand}`, { cwd: root, stdio: 'inherit' })

fs.copyFileSync(CFG, BAK)
try {
  fs.writeFileSync(CFG, JSON.stringify({ supabaseUrl: '', supabaseAnonKey: '', legacy: true }, null, 2))
  // mac + linux ship both arches; Windows is x64-only (arm64 Windows is rare in
  // schools) and built separately so the global arch flags don't collide its output.
  const dual = wanted.filter(p => p !== 'win').map(p => ({ mac: '--mac zip', linux: '--linux AppImage' }[p])).filter(Boolean).join(' ')
  if (dual) run(`${dual} --x64 --arm64`)
  if (wanted.includes('win')) run('--win zip')
} finally {
  fs.copyFileSync(BAK, CFG); fs.rmSync(BAK)
  console.log('restored online studio.config.json')
}

// Rename electron-builder's default outputs to clear, arch-labelled names.
const renames = [
  [`ZeroAI-Studio-${version}-x64.zip`, `ZeroAI-Studio-Legacy-${version}-mac-x64.zip`],
  [`ZeroAI-Studio-${version}-arm64.zip`, `ZeroAI-Studio-Legacy-${version}-mac-arm64.zip`],
  [`ZeroAI-Studio-${version}-x86_64.AppImage`, `ZeroAI-Studio-Legacy-${version}-linux-x64.AppImage`],
  [`ZeroAI-Studio-${version}-arm64.AppImage`, `ZeroAI-Studio-Legacy-${version}-linux-arm64.AppImage`],
  [`ZeroAI-Studio-Setup-${version}.zip`, `ZeroAI-Studio-Legacy-${version}-win-x64.zip`],
]
for (const [from, to] of renames) {
  const src = path.join(REL, from)
  if (fs.existsSync(src)) fs.renameSync(src, path.join(REL, to))
}
for (const f of fs.readdirSync(REL)) if (f.endsWith('.blockmap')) fs.rmSync(path.join(REL, f))
console.log('Legacy editions ready in release/:')
for (const f of fs.readdirSync(REL)) if (f.startsWith('ZeroAI-Studio-Legacy-')) console.log('  ' + f)
