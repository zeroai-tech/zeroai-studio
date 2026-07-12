#!/usr/bin/env node
// Build offline Arduino board-support packs for ZeroAI Studio Legacy.
//
// Each pack is a ROOT-relative .tar.gz — the arduino-cli binary + data/packages/<core>
// — that the app installs offline via arduino.js installFromPack(). Zero-internet
// schools get compile+upload by installing these from the ZeroAI USB.
//
// Toolchains are NATIVE binaries, so a pack built on macOS runs on macOS only.
// Run this once per OS (or in a mac/win/linux CI matrix) to cover every platform.
//
//   node scripts/build-arduino-packs.cjs              # all 3 boards for THIS os
//   node scripts/build-arduino-packs.cjs avr          # just AVR (Uno/Nano)
//   node scripts/build-arduino-packs.cjs avr esp8266  # a subset
//
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const https = require('node:https')
const { spawnSync } = require('node:child_process')

const OUT = path.join(__dirname, '..', 'arduino-packs')
const WORK = path.join(os.tmpdir(), 'zeroai-arduino-build')
const CLI_BASE = 'https://downloads.arduino.cc/arduino-cli/'
const BOARD_URLS = [
  'https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json',
  'https://arduino.esp8266.com/stable/package_esp8266com_index.json',
]
// board id → { core fqbn prefix, package dir under data/packages }
const BOARDS = {
  avr:     { core: 'arduino:avr',     pkg: 'arduino' },
  esp32:   { core: 'esp32:esp32',     pkg: 'esp32' },
  esp8266: { core: 'esp8266:esp8266', pkg: 'esp8266' },
}

function osTag() {
  const a = process.arch
  if (process.platform === 'darwin') return a === 'arm64' ? 'mac-arm64' : 'mac-x64'
  if (process.platform === 'win32') return a === 'ia32' ? 'win-ia32' : 'win-x64'
  return a === 'arm64' ? 'linux-arm64' : 'linux-x64'
}
function cliAsset() {
  const a = process.arch
  if (process.platform === 'darwin') return a === 'arm64' ? 'arduino-cli_latest_macOS_ARM64.tar.gz' : 'arduino-cli_latest_macOS_64bit.tar.gz'
  if (process.platform === 'win32') return a === 'ia32' ? 'arduino-cli_latest_Windows_32bit.zip' : 'arduino-cli_latest_Windows_64bit.zip'
  return a === 'arm64' ? 'arduino-cli_latest_Linux_ARM64.tar.gz' : 'arduino-cli_latest_Linux_64bit.tar.gz'
}
const CLI_BIN = process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli'

function download(url, dest, redirects = 0) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'ZeroAI-Studio' } }, r => {
      if ([301, 302, 307, 308].includes(r.statusCode) && r.headers.location && redirects < 6) {
        r.resume(); return res(download(r.headers.location, dest, redirects + 1))
      }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode + ' ' + url)) }
      const f = fs.createWriteStream(dest); r.pipe(f)
      f.on('finish', () => f.close(() => res())); f.on('error', rej)
    }).on('error', rej)
  })
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} → exit ${r.status}`)
}

async function ensureCli(root) {
  const bin = path.join(root, CLI_BIN)
  if (fs.existsSync(bin)) return bin
  const asset = cliAsset()
  const tmp = path.join(WORK, asset)
  console.log('  ↓ arduino-cli', asset)
  await download(CLI_BASE + asset, tmp)
  if (asset.endsWith('.zip')) run('unzip', ['-oq', tmp, '-d', root])
  else run('tar', ['-xzf', tmp, '-C', root])
  if (process.platform !== 'win32') fs.chmodSync(bin, 0o755)
  return bin
}

async function buildBoard(board) {
  const spec = BOARDS[board]
  if (!spec) throw new Error('unknown board: ' + board)
  const tag = osTag()
  const root = path.join(WORK, board)          // isolated arduino ROOT for this board
  const data = path.join(root, 'data')
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(data, { recursive: true })
  const bin = await ensureCli(root)
  const cfg = path.join(root, 'arduino-cli.yaml')
  const yq = p => JSON.stringify(p.replace(/\\/g, '/'))
  fs.writeFileSync(cfg, `directories:\n  data: ${yq(data)}\n  user: ${yq(path.join(root, 'user'))}\nboard_manager:\n  additional_urls:\n${BOARD_URLS.map(u => `    - ${u}`).join('\n')}\n`)
  const cli = (...a) => run(bin, ['--config-file', cfg, ...a])
  console.log('  · updating index for', board)
  cli('core', 'update-index')
  console.log('  · installing', spec.core, '(this is the big download for esp32)…')
  cli('core', 'install', spec.core)

  // Trim: staging holds the already-unpacked download archives — not needed at runtime.
  fs.rmSync(path.join(data, 'staging'), { recursive: true, force: true })
  fs.rmSync(path.join(data, 'tmp'), { recursive: true, force: true })

  // Pack = ROOT-relative: arduino-cli + data/ (packages + index). installFromPack
  // extracts this straight into the app's arduino ROOT.
  fs.mkdirSync(OUT, { recursive: true })
  const outFile = path.join(OUT, `arduino-${board}-${tag}.tar.gz`)
  fs.rmSync(outFile, { force: true })
  run('tar', ['-czf', outFile, '-C', root, CLI_BIN, 'data'])
  const mb = (fs.statSync(outFile).size / 1048576).toFixed(0)
  console.log(`  ✓ ${path.basename(outFile)}  ${mb} MB`)
  return outFile
}

;(async () => {
  fs.mkdirSync(WORK, { recursive: true })
  const wanted = process.argv.slice(2).filter(b => BOARDS[b])
  const boards = wanted.length ? wanted : Object.keys(BOARDS)
  console.log(`Building Arduino packs for ${osTag()} — boards: ${boards.join(', ')}`)
  for (const b of boards) { console.log(`\n[${b}]`); await buildBoard(b) }
  console.log('\nPacks in arduino-packs/ — ship these on the ZeroAI USB; the app installs them via Settings → Board support.')
})().catch(e => { console.error('✗', e.message); process.exit(1) })
