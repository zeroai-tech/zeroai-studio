#!/usr/bin/env node
// Package "ZeroAI Studio Legacy" for one or more platforms. Swaps in the offline
// config (legacy=true, no Supabase), builds, then ALWAYS restores the online config,
// and renames outputs to ZeroAI-Studio-Legacy-<ver>-<platform>-<arch>.<ext>.
//
//   node scripts/pack-legacy.cjs             # mac + win + linux
//   node scripts/pack-legacy.cjs mac linux   # a subset
//
// Run `npm run bundle:legacy` first to stage the offline hub build.
const fs = require('node:fs'); const path = require('node:path'); const { execSync } = require('node:child_process')
const root = path.join(__dirname, '..')
const CFG = path.join(root, 'studio.config.json'); const BAK = CFG + '.online.bak'
const REL = path.join(root, 'release')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['mac', 'win', 'linux']
// Legacy is a fully SEPARATE app from the online Studio so both can live on one PC:
//  · productName / appId  → distinct app, installs side-by-side, own Dock/Start entry
//  · extraMetadata.name   → distinct userData dir (zeroai-studio-legacy) so the two
//                           editions never share license.dat, installed apps or config
//  · icon-legacy.png      → gold "OFFLINE" badge so they're tellable apart at a glance
const brand = [
  '-c.productName="ZeroAI Studio Legacy"',
  '-c.appId=tech.zeroai.studio.legacy',
  '-c.extraMetadata.name=zeroai-studio-legacy',
  '-c.mac.icon=build/icon-legacy.png',
  '-c.win.icon=build/icon-legacy.png',
  '-c.linux.icon=build/icon-legacy.png',
  '--publish never',
].join(' ')
const run = (flags) => execSync(`npx electron-builder ${flags} ${brand}`, { cwd: root, stdio: 'inherit' })

// The staged payload is shared ground, and shipping the wrong edition is
// invisible until a school opens the app: an online build on a machine with no
// network shows a login form nobody can satisfy. Check, don't assume — this is
// the failure that put VITE_LEGACY=1 apps inside the released online DMGs.
const editionFile = path.join(root, 'payload', 'edition.json')
if (!fs.existsSync(editionFile)) {
  console.error('✗ no payload staged — run `npm run bundle:legacy` first')
  process.exit(1)
}
const staged = JSON.parse(fs.readFileSync(editionFile, 'utf8'))
if (staged.edition !== 'legacy') {
  console.error(`✗ payload/ holds the ${staged.edition} edition — run \`npm run bundle:legacy\``)
  process.exit(1)
}
console.log(`payload: ${staged.edition}, hub ${staged.studio}, staged ${staged.builtAt}`)

// studio.config.json is generated (scripts/fetch-config.cjs) and gitignored, so
// it is not always there — and a missing one used to abort the whole Legacy
// build at the backup step, for a file whose contents Legacy overwrites with
// empties anyway.
const hadConfig = fs.existsSync(CFG)
if (hadConfig) fs.copyFileSync(CFG, BAK)
try {
  fs.writeFileSync(CFG, JSON.stringify({ supabaseUrl: '', supabaseAnonKey: '', legacy: true }, null, 2))
  // mac + linux ship both arches; Windows is x64-only (arm64 Windows is rare in
  // schools) and built separately so the global arch flags don't collide its output.
  const dual = wanted.filter(p => p !== 'win').map(p => ({ mac: '--mac dmg', linux: '--linux AppImage' }[p])).filter(Boolean).join(' ')
  if (dual) run(`${dual} --x64 --arm64`)
  // NSIS, not a zip. This installs off a USB stick onto a school PC, and a zip
  // is not an install — it leaves a folder someone has to know what to do with,
  // no Start-menu entry and no uninstaller. allowToChangeInstallationDirectory
  // matters on machines where C: is a small SSD and the lab data sits elsewhere.
  if (wanted.includes('win')) run([
    '--win nsis --x64',
    '-c.nsis.oneClick=false',
    '-c.nsis.perMachine=true',
    '-c.nsis.allowToChangeInstallationDirectory=true',
    '-c.nsis.createDesktopShortcut=true',
    '-c.nsis.createStartMenuShortcut=true',
    '-c.nsis.artifactName="ZeroAI-Studio-Legacy-${version}-win-x64-setup.exe"',
  ].join(' '))
} finally {
  if (hadConfig) {
    fs.copyFileSync(BAK, CFG); fs.rmSync(BAK)
    console.log('restored online studio.config.json')
  } else {
    // Leaving the legacy config behind would silently turn the NEXT online
    // build into a Supabase-less one.
    fs.rmSync(CFG, { force: true })
    console.log('removed the temporary legacy studio.config.json')
  }
}

// Rename electron-builder's outputs to clear, arch-labelled names.
//
// Derived rather than listed: a fixed list silently misses a name that shifts
// between electron-builder versions, and what it leaves behind is a Legacy
// build still wearing the online product name — an installer that will be
// handed to a school as the wrong edition. Anything not renamed is called out
// below rather than left sitting there.
const ARCH = { x64: 'x64', arm64: 'arm64', x86_64: 'x64' }
for (const f of fs.readdirSync(REL)) {
  const m = f.match(new RegExp(`^ZeroAI-Studio-${version}(?:-(x64|arm64|x86_64))?\\.(dmg|AppImage|exe)$`))
  if (!m) continue
  const arch = ARCH[m[1] || 'x64']
  const os = { dmg: 'mac', AppImage: 'linux', exe: 'win' }[m[2]]
  fs.renameSync(path.join(REL, f), path.join(REL, `ZeroAI-Studio-Legacy-${version}-${os}-${arch}.${m[2]}`))
}
const stray = fs.readdirSync(REL).filter(f =>
  /\.(dmg|AppImage|exe)$/.test(f) && !f.startsWith('ZeroAI-Studio-Legacy-'))
if (stray.length) {
  console.error('\n⚠ these are Legacy builds still wearing the online name — do NOT ship them as the online edition:')
  for (const f of stray) console.error('   ' + f)
}
for (const f of fs.readdirSync(REL)) if (f.endsWith('.blockmap')) fs.rmSync(path.join(REL, f))
console.log('Legacy editions ready in release/:')
for (const f of fs.readdirSync(REL)) if (f.startsWith('ZeroAI-Studio-Legacy-')) console.log('  ' + f)
