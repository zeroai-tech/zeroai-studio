#!/usr/bin/env node
// Copy each installer to a version-free name alongside the versioned one.
//
// The website links to
//   .../releases/latest/download/ZeroAI-Studio-<version>-x64.dmg
// which resolves the RELEASE to latest but pins the FILENAME to whatever
// version the site was last built with. The moment a new version ships, every
// download link on the site 404s: the latest release simply has no file by
// that name any more. That is a landmine under any automated release.
//
// So each release also carries stable names that never change. The site can
// link to those and keep working through every version bump, and the version
// constant becomes a display detail rather than the thing holding the download
// page together.
//
// Versioned names are still published: electron-updater needs them, and so
// does anyone pinning a specific build.

const fs = require('node:fs')
const path = require('node:path')

const REL = path.join(__dirname, '..', 'release')
if (!fs.existsSync(REL)) { console.log('no release/ directory — nothing to alias'); process.exit(0) }

const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version
const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Each rule maps a built artifact to the stable name the website will use.
// Anything not matched is left alone rather than guessed at.
const RULES = [
  [new RegExp(`^ZeroAI-Studio-${esc}-arm64\\.dmg$`),                    'ZeroAI-Studio-mac-arm64.dmg'],
  [new RegExp(`^ZeroAI-Studio-${esc}-x64\\.dmg$`),                      'ZeroAI-Studio-mac-x64.dmg'],
  [new RegExp(`^ZeroAI-Studio-Setup-${esc}\\.exe$`),                    'ZeroAI-Studio-win-setup.exe'],
  [new RegExp(`^ZeroAI-Studio-${esc}-x86_64\\.AppImage$`),              'ZeroAI-Studio-linux-x64.AppImage'],
  [new RegExp(`^ZeroAI-Studio-${esc}-arm64\\.AppImage$`),               'ZeroAI-Studio-linux-arm64.AppImage'],
  [new RegExp(`^ZeroAI-Studio-${esc}-amd64\\.deb$`),                    'ZeroAI-Studio-linux-x64.deb'],
  [new RegExp(`^ZeroAI-Studio-${esc}-arm64\\.deb$`),                    'ZeroAI-Studio-linux-arm64.deb'],

  [new RegExp(`^ZeroAI-Studio-Legacy-${esc}-mac-arm64\\.dmg$`),         'ZeroAI-Studio-Legacy-mac-arm64.dmg'],
  [new RegExp(`^ZeroAI-Studio-Legacy-${esc}-mac-x64\\.dmg$`),           'ZeroAI-Studio-Legacy-mac-x64.dmg'],
  [new RegExp(`^ZeroAI-Studio-Legacy-${esc}-win-x64-setup\\.exe$`),     'ZeroAI-Studio-Legacy-win-x64-setup.exe'],
  [new RegExp(`^ZeroAI-Studio-Legacy-${esc}-linux-x64\\.AppImage$`),    'ZeroAI-Studio-Legacy-linux-x64.AppImage'],
  [new RegExp(`^ZeroAI-Studio-Legacy-${esc}-linux-arm64\\.AppImage$`),  'ZeroAI-Studio-Legacy-linux-arm64.AppImage'],
]

let made = 0
for (const file of fs.readdirSync(REL)) {
  for (const [pattern, stable] of RULES) {
    if (!pattern.test(file)) continue
    fs.copyFileSync(path.join(REL, file), path.join(REL, stable))
    console.log(`  ${file}  ->  ${stable}`)
    made++
    break
  }
}
console.log(made ? `\n${made} stable alias(es) written` : '\nno artifacts matched — nothing aliased')
