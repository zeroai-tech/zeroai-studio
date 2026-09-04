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

// Two of these must never run at once. Both swap studio.config.json out and
// back, so a second run's restore deletes the backup the first is still
// relying on — which is how a build died with ENOENT on
// studio.config.json.online.bak halfway through.
const LOCK = path.join(root, '.pack-legacy.lock')
try {
  fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' })
} catch {
  console.error(`✗ another Legacy build is already running (${LOCK}). Wait for it, or remove that file if it is stale.`)
  process.exit(1)
}
process.on('exit', () => fs.rmSync(LOCK, { force: true }))

// studio.config.json is generated (scripts/fetch-config.cjs) and gitignored, so
// it is not always there — and a missing one used to abort the whole Legacy
// build at the backup step, for a file whose contents Legacy overwrites with
// empties anyway.
const hadConfig = fs.existsSync(CFG)
if (hadConfig) fs.copyFileSync(CFG, BAK)
try {
  fs.writeFileSync(CFG, JSON.stringify({ supabaseUrl: '', supabaseAnonKey: '', legacy: true }, null, 2))
  // One invocation per target AND per arch, each naming its own output.
  //
  // Both editions used electron-builder's default artifact names, so they wrote
  // the SAME filenames into release/ and building one silently destroyed the
  // other. Naming them up front fixes that — but electron-builder's ${arch}
  // macro does not expand reliably across a dual-arch run (it produced a third
  // dmg with an empty arch), so the arch is pinned per invocation instead of
  // left to a macro. Slower, and unambiguous.
  const TARGETS = { mac: ['dmg', 'dmg'], linux: ['AppImage', 'appImage'] }
  const EXT = { dmg: 'dmg', AppImage: 'AppImage' }
  const OS = { mac: 'mac', linux: 'linux' }
  for (const plat of wanted.filter(p => p !== 'win')) {
    const [target, cfgKey] = TARGETS[plat]
    for (const arch of ['x64', 'arm64']) {
      const name = `ZeroAI-Studio-Legacy-${version}-${OS[plat]}-${arch}.${EXT[target]}`
      run(`--${plat} ${target} --${arch} -c.${cfgKey}.artifactName=${name}`)
    }
  }
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
    `-c.nsis.artifactName=ZeroAI-Studio-Legacy-${version}-win-x64-setup.exe`,
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

// Nothing to rename: artifactName above already produced the final names. A
// Legacy build wearing the online name would be handed to a school as the
// wrong edition, so this is checked rather than assumed.
const stray = fs.readdirSync(REL).filter(f =>
  /\.(dmg|AppImage|exe)$/.test(f) && !f.startsWith('ZeroAI-Studio-Legacy-') && !f.startsWith('ZeroAI-Studio-' + version))
if (stray.length) {
  console.error('\n⚠ unexpected artifacts in release/ — check before shipping any of these:')
  for (const f of stray) console.error('   ' + f)
}
for (const f of fs.readdirSync(REL)) if (f.endsWith('.blockmap')) fs.rmSync(path.join(REL, f))
console.log('Legacy editions ready in release/:')
for (const f of fs.readdirSync(REL)) if (f.startsWith('ZeroAI-Studio-Legacy-')) console.log('  ' + f)
