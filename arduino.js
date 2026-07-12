// ── Local Arduino toolchain (offline compile + upload) ───────────────────────
//
// ZaiSim in the browser compiles on a remote service and flashes via Web Serial.
// The offline desktop app can't reach the service, so this module manages a
// LOCAL arduino-cli — downloaded on demand into the user's data dir — that
// compiles sketches and uploads to real boards for all three ZaiSim targets
// (Arduino Uno / AVR, ESP32, ESP8266).
//
// Deliberately NO privilege escalation: arduino-cli and the board cores install
// into the user's own folder and need no admin rights. (The only OS step that
// ever needs a password is serial-port permission on Linux — surfaced
// separately as a hint, not run silently.)

const { app } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const https = require('node:https')
const { spawn } = require('node:child_process')
const AdmZip = require('adm-zip')

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT = () => path.join(app.getPath('userData'), 'arduino')
const BIN = () => path.join(ROOT(), process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli')
const DATA_DIR = () => path.join(ROOT(), 'data')       // cores, tools
const USER_DIR = () => path.join(ROOT(), 'user')       // libraries, sketches
const CONFIG = () => path.join(ROOT(), 'arduino-cli.yaml')

// Board target → arduino-cli FQBN.
const FQBN = {
  uno:     'arduino:avr:uno',
  esp32:   'esp32:esp32:esp32',
  esp8266: 'esp8266:esp8266:nodemcuv2',
}
// The three cores ZaiSim needs, and the extra board-manager index URLs for the
// two ESP cores (AVR ships in the default index).
const CORES = ['arduino:avr', 'esp32:esp32', 'esp8266:esp8266']
const BOARD_URLS = [
  'https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json',
  'https://arduino.esp8266.com/stable/package_esp8266com_index.json',
]

// arduino-cli release asset for this platform/arch.
function assetName() {
  const a = process.arch
  if (process.platform === 'darwin') return a === 'arm64' ? 'arduino-cli_latest_macOS_ARM64.tar.gz' : 'arduino-cli_latest_macOS_64bit.tar.gz'
  if (process.platform === 'win32')  return a === 'ia32' ? 'arduino-cli_latest_Windows_32bit.zip' : 'arduino-cli_latest_Windows_64bit.zip'
  return a === 'arm64' ? 'arduino-cli_latest_Linux_ARM64.tar.gz' : 'arduino-cli_latest_Linux_64bit.tar.gz'
}
const DOWNLOAD_BASE = 'https://downloads.arduino.cc/arduino-cli/'

// ── Small helpers ────────────────────────────────────────────────────────────
function download(url, dest, onPct, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ZeroAI-Studio' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 6) {
        res.resume(); return resolve(download(res.headers.location, dest, onPct, redirects + 1))
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)) }
      const total = parseInt(res.headers['content-length'] || '0', 10); let done = 0
      const file = fs.createWriteStream(dest)
      res.on('data', c => { done += c.length; if (total) onPct?.(done / total) })
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
    }).on('error', reject)
  })
}

// Run a bare executable (used only to unpack tarballs via the system `tar`).
function exec(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, opts)
    let out = '', err = ''
    p.stdout?.on('data', d => out += d)
    p.stderr?.on('data', d => err += d)
    p.on('error', e => resolve({ code: -1, out, err: String(e) }))
    p.on('close', code => resolve({ code, out, err }))
  })
}

// Run arduino-cli with our sandboxed data/user dirs and stream stdout lines.
function cli(args, onLine) {
  return new Promise((resolve) => {
    const p = spawn(BIN(), ['--config-file', CONFIG(), ...args], {
      env: { ...process.env, ARDUINO_DIRECTORIES_DATA: DATA_DIR(), ARDUINO_DIRECTORIES_USER: USER_DIR() },
    })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d; onLine?.(String(d)) })
    p.stderr.on('data', d => { err += d; onLine?.(String(d)) })
    p.on('error', e => resolve({ code: -1, out, err: String(e) }))
    p.on('close', code => resolve({ code, out, err }))
  })
}

const cliJSON = async (args) => {
  const r = await cli([...args, '--format', 'json'])
  try { return JSON.parse(r.out) } catch { return null }
}

// ── Status ───────────────────────────────────────────────────────────────────
async function status() {
  if (!fs.existsSync(BIN())) return { installed: false, cliVersion: null, cores: {} }
  const list = await cliJSON(['core', 'list'])
  const rows = Array.isArray(list) ? list : (list?.platforms ?? [])
  const installedIds = new Set(rows.map(r => r.id))
  const cores = {}
  for (const c of CORES) cores[c] = installedIds.has(c)
  const ver = await cliJSON(['version'])
  return { installed: true, cliVersion: ver?.VersionString ?? 'unknown', cores, ready: CORES.every(c => cores[c]) }
}

// Write arduino-cli.yaml with THIS machine's absolute data/user paths. The paths
// are machine-specific, so a config shipped inside a pack would be wrong — always
// regenerate after install. Double-quoted forward slashes keep Windows drive
// letters ("C:\…") from breaking the YAML (arduino-cli/Go accepts forward slashes).
async function writeConfig() {
  const yq = (p) => JSON.stringify(p.replace(/\\/g, '/'))
  const yaml = `directories:\n  data: ${yq(DATA_DIR())}\n  user: ${yq(USER_DIR())}\nboard_manager:\n  additional_urls:\n${BOARD_URLS.map(u => `    - ${u}`).join('\n')}\n`
  await fsp.writeFile(CONFIG(), yaml)
}

// ── Offline install: unpack a board-support pack from disk/USB (no internet) ──
// A pack is a .tar.gz / .zip whose contents are ROOT-relative: the arduino-cli
// binary plus data/packages/<core>/… . Packs merge — install several (AVR, ESP32,
// ESP8266) into the same ROOT and each adds its core. This is how zero-internet
// schools get compile+upload: the ZeroAI USB carries the packs.
async function installFromPack(packPath, onProgress) {
  const p = (pct, msg) => onProgress?.({ phase: 'install-pack', pct, msg })
  if (!fs.existsSync(packPath)) throw new Error('Board pack not found: ' + packPath)
  await fsp.mkdir(ROOT(), { recursive: true })
  await fsp.mkdir(DATA_DIR(), { recursive: true })
  await fsp.mkdir(USER_DIR(), { recursive: true })

  p(0.1, 'Reading board pack…')
  if (packPath.toLowerCase().endsWith('.zip')) {
    new AdmZip(packPath).extractAllTo(ROOT(), true)
  } else {
    const r = await exec('tar', ['-xzf', packPath, '-C', ROOT()])
    if (r.code !== 0) throw new Error('Could not unpack the board pack:\n' + r.err.slice(0, 300))
  }
  if (process.platform !== 'win32' && fs.existsSync(BIN())) await fsp.chmod(BIN(), 0o755).catch(() => {})
  if (!fs.existsSync(BIN())) throw new Error('Pack did not contain arduino-cli — is this a ZeroAI board pack?')

  p(0.9, 'Finalising…')
  await writeConfig()      // rewrite config with this machine's paths
  p(1, 'Board support installed.')
  return await status()
}

// ── Setup: download arduino-cli, install the three cores (no elevation) ──────
async function setup(onProgress) {
  const p = (phase, pct, msg) => onProgress?.({ phase, pct, msg })
  await fsp.mkdir(ROOT(), { recursive: true })
  await fsp.mkdir(DATA_DIR(), { recursive: true })
  await fsp.mkdir(USER_DIR(), { recursive: true })

  // 1 · arduino-cli binary
  if (!fs.existsSync(BIN())) {
    p('download-cli', 0, 'Downloading Arduino toolchain…')
    const asset = assetName()
    const tmp = path.join(os.tmpdir(), asset)
    await download(DOWNLOAD_BASE + asset, tmp, frac => p('download-cli', frac, 'Downloading Arduino toolchain…'))
    p('extract-cli', 1, 'Unpacking…')
    if (asset.endsWith('.zip')) {
      new AdmZip(tmp).extractAllTo(ROOT(), true)
    } else {
      // system tar is present on macOS and Linux
      await exec('tar', ['-xzf', tmp, '-C', ROOT()])
    }
    await fsp.unlink(tmp).catch(() => {})
    if (process.platform !== 'win32') await fsp.chmod(BIN(), 0o755).catch(() => {})
    if (!fs.existsSync(BIN())) throw new Error('arduino-cli did not unpack correctly')
  }

  // 2 · config (see writeConfig — paths are machine-specific so always regenerate)
  await writeConfig()

  // 3 · index + cores (this is the step that needs the internet, once)
  p('index', 0, 'Updating board index…')
  const idx = await cli(['core', 'update-index'])
  if (idx.code !== 0) throw new Error('Could not update the board index — check your connection.\n' + idx.err.slice(0, 300))

  for (let i = 0; i < CORES.length; i++) {
    const core = CORES[i]
    p('core', i / CORES.length, `Installing ${core} board support…`)
    const r = await cli(['core', 'install', core], line => p('core', i / CORES.length, line.trim().slice(0, 80)))
    if (r.code !== 0) throw new Error(`Failed to install ${core}:\n` + r.err.slice(0, 300))
  }
  p('done', 1, 'Arduino compilation ready.')
  return await status()
}

// ── Compile → firmware bytes (base64) ────────────────────────────────────────
async function compile(code, board) {
  const fqbn = FQBN[board] || FQBN.uno
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'zaisim-'))
  const sketchDir = path.join(dir, 'sketch')
  await fsp.mkdir(sketchDir, { recursive: true })
  await fsp.writeFile(path.join(sketchDir, 'sketch.ino'), code)
  const outDir = path.join(dir, 'out')

  const r = await cli(['compile', '--fqbn', fqbn, '--output-dir', outDir, sketchDir])
  if (r.code !== 0) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
    // arduino-cli puts the compiler diagnostics on stderr
    throw new Error(r.err.trim() || r.out.trim() || 'Compilation failed')
  }
  // AVR → .hex ; ESP → merged .bin (fall back to the plain .bin)
  const files = await fsp.readdir(outDir)
  const pick = board === 'uno'
    ? files.find(f => f.endsWith('.hex') && !f.includes('with_bootloader'))
    : (files.find(f => f.endsWith('.merged.bin')) || files.find(f => f.endsWith('.bin')))
  if (!pick) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
    throw new Error('Compiled, but no firmware file was produced.')
  }
  const bytes = await fsp.readFile(path.join(outDir, pick))
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  return { format: pick.endsWith('.hex') ? 'hex' : 'bin', dataB64: bytes.toString('base64'), name: pick }
}

// ── Ports ────────────────────────────────────────────────────────────────────
async function listPorts() {
  const j = await cliJSON(['board', 'list'])
  const rows = Array.isArray(j) ? j : (j?.detected_ports ?? [])
  return rows
    .map(r => {
      const port = r.port || r
      return {
        address: port.address,
        protocol: port.protocol,
        label: port.label || port.address,
        board: (r.matching_boards && r.matching_boards[0]?.name) || (port.properties && port.properties.pid ? 'USB device' : ''),
      }
    })
    .filter(p => p.address && (p.protocol === 'serial' || !p.protocol))
}

// ── Upload: compile then flash the chosen serial port ────────────────────────
async function upload(code, board, port, onLine) {
  const fqbn = FQBN[board] || FQBN.uno
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'zaisim-up-'))
  const sketchDir = path.join(dir, 'sketch')
  await fsp.mkdir(sketchDir, { recursive: true })
  await fsp.writeFile(path.join(sketchDir, 'sketch.ino'), code)
  try {
    onLine?.('Compiling…\n')
    const c = await cli(['compile', '--fqbn', fqbn, sketchDir], onLine)
    if (c.code !== 0) throw new Error(c.err.trim() || 'Compilation failed')
    onLine?.(`Uploading to ${port}…\n`)
    const u = await cli(['upload', '-p', port, '--fqbn', fqbn, sketchDir], onLine)
    if (u.code !== 0) {
      const hint = process.platform === 'linux'
        ? '\nOn Linux you may need serial permission: run `sudo usermod -a -G dialout $USER` then log out and back in.'
        : ''
      throw new Error((u.err.trim() || 'Upload failed') + hint)
    }
    return { ok: true }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

module.exports = { status, setup, installFromPack, compile, listPorts, upload, FQBN }
