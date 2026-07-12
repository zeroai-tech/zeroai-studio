// ZeroAI Studio — the STEM suite as ONE desktop app (Electron). Proof of concept.
//
// Each web app's built `dist/` is bundled under apps/<name>/ and served to the
// renderer over a custom **app://** scheme (host = app name). A standard secure
// scheme means the apps' default absolute asset paths ("/assets/…") just work —
// no per-app rebuild needed — and we can attach security headers per app
// (e.g. COOP/COEP for zaipy's Pyodide later). One window, switch between apps.

const { app, BrowserWindow, Menu, protocol, shell, ipcMain, dialog } = require('electron')
const licensing = require('./license/verifier')
let STUDIO_CFG = {}; try { STUDIO_CFG = require('./studio.config.json') } catch { /* optional */ }
// Legacy (offline, licensed) edition when studio.config.json has "legacy": true.
const LEGACY = !!STUDIO_CFG.legacy || process.env.ZEROAI_LEGACY === '1'
const fs = require('node:fs/promises')
const fss = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const crypto = require('node:crypto')
const AdmZip = require('adm-zip')
const arduino = require('./arduino')

// Shell auto-update (electron-updater) — Windows & Linux only. macOS builds are
// unsigned, and Squirrel.Mac refuses unsigned updates, so mac keeps the
// in-app "new version" chip + manual download until we have an Apple cert.
// NEVER in the Legacy (offline) edition — it must make zero network calls and
// must never replace itself with the online build.
let autoUpdater = null
if (!LEGACY && (process.platform === 'win32' || process.platform === 'linux')) {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
  } catch { autoUpdater = null }
}

// The manager UI ("studio") ships inside the app. The 5 STEM apps are NOT bundled —
// they install on demand from the catalog into the user's data dir (Adobe-CC model).
const APPS_DIR = path.join(__dirname, 'apps')                                   // bundled: studio manager only
const INSTALL_DIR = () => path.join(app.getPath('userData'), 'installed-apps')  // installed apps live here
const MANIFEST_URL = process.env.ZEROAI_MANIFEST ||
  'https://raw.githubusercontent.com/zeroai-tech/zeroai-studio/main/manifest.json'
const installedDbPath = () => path.join(app.getPath('userData'), 'installed.json')
async function readInstalled() { try { return JSON.parse(await fs.readFile(installedDbPath(), 'utf8')) } catch { return {} } }
async function writeInstalled(db) { await fs.writeFile(installedDbPath(), JSON.stringify(db, null, 2)) }

// GET JSON / download with redirect-following (GitHub release assets redirect to S3).
function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ZeroAI-Studio' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) { res.resume(); return resolve(getJSON(res.headers.location)) }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)) }
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}
function download(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ZeroAI-Studio' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 6) {
        res.resume(); return resolve(download(res.headers.location, dest, onProgress, redirects + 1))
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)) }
      const total = parseInt(res.headers['content-length'] || '0', 10); let done = 0
      const file = fss.createWriteStream(dest)
      res.on('data', c => { done += c.length; if (total) onProgress?.(done / total) })
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
    }).on('error', reject)
  })
}

// Shared suite config (one Supabase project across all 5 apps). Kept in a
// gitignored studio.config.json so the (public, client-side) anon key isn't
// committed. Injected into every app via preload → no per-app .env needed.
let SUITE_CONFIG = {}
try { SUITE_CONFIG = require('./studio.config.json') } catch { /* runs offline-only without it */ }
const CONFIG_ARG = '--zeroai-config=' + Buffer.from(JSON.stringify(SUITE_CONFIG)).toString('base64')

// Where offline projects are stored (per app).
const projectsDir = (appId) => path.join(app.getPath('userData'), 'projects', appId.replace(/[^a-z0-9_-]/gi, ''))

// Strip the web-only chrome so the apps feel native, not like a website.
// (!important beats the apps' inline styles, so this works without per-app edits.)
const DEWEBIFY_CSS = `
  a[href*="wa.me"], a[href*="api.whatsapp"], a[href*="whatsapp.com"],
  .whatsapp-float, [class*="whatsapp" i], [id*="whatsapp" i] { display: none !important; }

  /* Native-feel dialogs: kill the website-style heavy dark dim + blur that every
     modal overlay (Gallery, Quiz, Combo map, Save, …) uses as a full-screen scrim. */
  div[style*="position: fixed"][style*="inset: 0"][style*="rgba(0, 0, 0"] {
    background: rgba(6, 8, 20, 0.40) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
`

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.map': 'application/json', '.txt': 'text/plain',
}

// Apps that need cross-origin isolation (SharedArrayBuffer). zaipy/Pyodide will;
// zerospark does NOT — and forcing COEP would block its Google-Fonts requests.
const NEEDS_COI = new Set(['zaipy'])

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}])

async function handle(req) {
  const url = new URL(req.url)
  const host = url.hostname                       // 'studio' | 'zerospark' | …
  let rel = decodeURIComponent(url.pathname) || '/'
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html'

  // 'studio' is the bundled manager; every other host is an installed app on disk.
  const baseDir = host === 'studio' ? path.join(APPS_DIR, 'studio') : path.join(INSTALL_DIR(), host)
  const filePath = path.normalize(path.join(baseDir, rel))
  if (!filePath.startsWith(baseDir)) return new Response('forbidden', { status: 403 })

  const headers = (fp) => {
    const h = { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' }
    if (NEEDS_COI.has(host)) {
      h['Cross-Origin-Opener-Policy'] = 'same-origin'
      h['Cross-Origin-Embedder-Policy'] = 'require-corp'
    }
    return h
  }

  try {
    return new Response(await fs.readFile(filePath), { headers: headers(filePath) })
  } catch {
    // SPA fallback → the app's index.html
    try {
      return new Response(await fs.readFile(path.join(baseDir, 'index.html')), { headers: headers('index.html') })
    } catch {
      return new Response('Not found: ' + host + rel, { status: 404 })
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 840, minWidth: 900, minHeight: 600,
    backgroundColor: '#0a0c15', title: 'ZeroAI Studio',
    webPreferences: {
      contextIsolation: true,
      sandbox: false,                 // preload needs Node (Buffer/require) to inject the shared config
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [CONFIG_ARG],
    },
  })
  // Legacy edition gates on an offline license before opening the studio.
  if (LEGACY && !licensing.status(app.getPath('userData')).ok) {
    win.loadFile(path.join(__dirname, 'activate.html'))
  } else {
    win.loadURL('app://studio/index.html')
  }
  // Native window title tracks the current app.
  win.webContents.on('did-navigate', (_e, url) => {
    try {
      const host = new URL(url).hostname
      const entry = SUITE_APPS.find(a => a.id === host)
      win.setTitle(entry ? `${entry.name} — ZeroAI Studio` : 'ZeroAI Studio')
    } catch { /* keep current title */ }
  })
  // The apps set document.title for the browser; in the shell the native title wins.
  win.on('page-title-updated', (e) => e.preventDefault())
  // After each app loads, strip web-only chrome so it feels native + forward errors.
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(DEWEBIFY_CSS).catch(() => {})
    win.webContents.executeJavaScript(
      "window.addEventListener('error',e=>console.log('JS-ERROR: '+((e.error&&e.error.stack)||e.message)));" +
      "window.addEventListener('unhandledrejection',e=>console.log('PROMISE-REJECT: '+((e.reason&&e.reason.stack)||e.reason)));" +
      // The apps' '← Suite' link points at the marketing site; in the desktop app
      // it must go back to the Studio manager. Catch the click directly (bulletproof).
      "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href*=\"stem.zeroaitech.tech\"]');if(a){e.preventDefault();e.stopPropagation();location.href='app://studio/index.html';}},true);"
    ).catch(() => {})
  })
  // Forward renderer console + crashes to the terminal/log so we can debug.
  win.webContents.on('console-message', (_e, _lvl, message) => { if (/error|fail|cannot|undefined|null/i.test(message)) console.log('[renderer]', message) })
  win.webContents.on('render-process-gone', (_e, d) => console.log('[render-process-gone]', d.reason))
  // An app's "← Suite" link → back to the Studio manager (not the marketing site).
  const backToStudio = (url) => /stem\.zeroaitech\.tech/.test(url)
  win.webContents.on('will-navigate', (e, url) => {
    if (backToStudio(url)) { e.preventDefault(); win.loadURL('app://studio/index.html') }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (backToStudio(url)) { win.loadURL('app://studio/index.html'); return { action: 'deny' } }
    if (url.startsWith('http')) { shell.openExternal(url); return { action: 'deny' } }  // other external links → OS browser
    return { action: 'allow' }
  })
}

// ── Shared installer: download → verify sha256 → extract → register ─────────
// The hash is checked BEFORE the old install is touched, so a truncated or
// tampered download can never leave a broken (or malicious) app behind.
async function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    fss.createReadStream(p).on('data', c => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
}
async function installApp({ id, url, version, sha256 }, onProgress) {
  await fs.mkdir(INSTALL_DIR(), { recursive: true })
  const tmp = path.join(app.getPath('temp'), `${id}-${Date.now()}.zip`)
  try {
    await download(url, tmp, onProgress)
    if (sha256) {
      const got = await sha256File(tmp)
      if (got !== sha256) throw new Error(`download corrupted (sha256 mismatch for ${id})`)
    }
    const zip = new AdmZip(tmp)   // parse before rm — a bad zip must not destroy the old install
    const dir = path.join(INSTALL_DIR(), id)
    await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true })
    zip.extractAllTo(dir, true)
    const db = await readInstalled(); db[id] = { version, installedAt: Date.now() }; await writeInstalled(db)
  } finally {
    await fs.unlink(tmp).catch(() => {})
  }
}

// First run of a "full" installer: seed apps bundled under resources/bundled-apps
// (created by scripts/bundle-apps.cjs before `npm run dist:full`). Lets schools
// with no/slow internet install one file and have the whole suite offline.
async function seedBundledApps() {
  const bundleDir = path.join(process.resourcesPath || __dirname, 'bundled-apps')
  try {
    const files = (await fs.readdir(bundleDir)).filter(f => f.endsWith('.zip'))
    if (!files.length) return
    let versions = {}
    try { versions = JSON.parse(await fs.readFile(path.join(bundleDir, 'versions.json'), 'utf8')) } catch {}
    const db = await readInstalled()
    for (const f of files) {
      const id = f.replace(/\.zip$/, '')
      if (db[id]) continue                       // never clobber a user's newer install
      const dir = path.join(INSTALL_DIR(), id)
      await fs.mkdir(dir, { recursive: true })
      new AdmZip(path.join(bundleDir, f)).extractAllTo(dir, true)
      db[id] = { version: versions[id] || '0.0.0', installedAt: Date.now(), seeded: true }
      console.log('[seed]', id, db[id].version)
    }
    await writeInstalled(db)
  } catch { /* no bundle dir → slim installer, nothing to seed */ }
}

// Lab provisioning: `ZeroAI Studio --install-all` installs every catalog app
// headlessly (progress on stdout) and exits — for imaging scripts.
async function installAllHeadless() {
  try {
    const apps = (await getJSON(MANIFEST_URL)).apps || []
    for (const a of apps) {
      let last = -1
      process.stdout.write(`[install-all] ${a.id}@${a.version} … `)
      await installApp(a, pct => {
        const p = Math.floor(pct * 10)
        if (p > last) { last = p; process.stdout.write('▪') }
      })
      process.stdout.write(' ok\n')
    }
    console.log('[install-all] done —', apps.length, 'apps installed')
    return 0
  } catch (e) { console.error('[install-all] FAILED:', e.message); return 1 }
}

// ── App catalog: install / uninstall on demand (Adobe-CC model) ──────────────
// ---- Offline licensing (Legacy edition) ----
ipcMain.handle('license:machine', () => licensing.machineId())
ipcMain.handle('license:status', () => licensing.status(app.getPath('userData')))
ipcMain.handle('license:activate', (_e, { key }) => {
  const res = licensing.activate(app.getPath('userData'), key)
  if (res.ok) {
    const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (w) w.loadURL('app://studio/index.html')  // enter the studio on success
  }
  return res
})

ipcMain.handle('studio:catalog', async () => {
  // Legacy is fully offline: every app is bundled + already seeded, so never
  // touch the network — just report what's installed.
  if (LEGACY) return { ok: true, apps: [], installed: await readInstalled() }
  let apps = []
  try { apps = (await getJSON(MANIFEST_URL)).apps || [] }
  catch (e) { return { ok: false, error: 'Could not reach the catalog: ' + e.message, apps: [], installed: await readInstalled() } }
  return { ok: true, apps, installed: await readInstalled() }
})
ipcMain.handle('studio:install', async (e, spec) => {
  try {
    await installApp(spec, pct => e.sender.send('studio:progress', { id: spec.id, pct }))
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
})
// Disk footprint of an installed app (recursive), for the launcher's ⋯ menu.
ipcMain.handle('studio:size', async (_e, { id }) => {
  async function du(dir) {
    let total = 0
    for (const ent of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) total += await du(p)
      else total += (await fs.stat(p).catch(() => ({ size: 0 }))).size
    }
    return total
  }
  return { bytes: await du(path.join(INSTALL_DIR(), safeId(id))) }
})
ipcMain.handle('studio:uninstall', async (_e, { id }) => {
  try { await fs.rm(path.join(INSTALL_DIR(), id), { recursive: true, force: true }); const db = await readInstalled(); delete db[id]; await writeInstalled(db); return { ok: true } }
  catch (err) { return { ok: false, error: err.message } }
})

// ── Offline project storage (IPC) ───────────────────────────────────────────
const safeId = (s) => String(s || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80) || 'untitled'
ipcMain.handle('zeroai:save', async (_e, { app: a, id, data }) => {
  const dir = projectsDir(a); await fs.mkdir(dir, { recursive: true })
  const pid = safeId(id)
  await fs.writeFile(path.join(dir, pid + '.json'), JSON.stringify({ id: pid, savedAt: Date.now(), data }, null, 2))
  return { ok: true, id: pid }
})
ipcMain.handle('zeroai:load', async (_e, { app: a, id }) => {
  try { return JSON.parse(await fs.readFile(path.join(projectsDir(a), safeId(id) + '.json'), 'utf8')) }
  catch { return null }
})
ipcMain.handle('zeroai:list', async (_e, { app: a }) => {
  try {
    const dir = projectsDir(a)
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'))
    return Promise.all(files.map(async (f) => {
      const j = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'))
      return { id: j.id, savedAt: j.savedAt, name: j.data?.name ?? j.id }
    }))
  } catch { return [] }
})
ipcMain.handle('zeroai:remove', async (_e, { app: a, id }) => {
  try { await fs.unlink(path.join(projectsDir(a), safeId(id) + '.json')); return { ok: true } } catch { return { ok: false } }
})

// ── Local Arduino toolchain (ZaiSim offline compile + upload) ────────────────
ipcMain.handle('arduino:status', async () => {
  try { return { ok: true, ...(await arduino.status()) } } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('arduino:setup', async (e) => {
  try { return { ok: true, ...(await arduino.setup(prog => e.sender.send('arduino:setupProgress', prog))) } }
  catch (err) { return { ok: false, error: err.message } }
})
ipcMain.handle('arduino:compile', async (_e, { code, board }) => {
  try { return { ok: true, ...(await arduino.compile(code, board)) } } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('arduino:listPorts', async () => {
  try { return { ok: true, ports: await arduino.listPorts() } } catch (e) { return { ok: false, error: e.message, ports: [] } }
})
ipcMain.handle('arduino:upload', async (e, { code, board, port }) => {
  try { return { ok: true, ...(await arduino.upload(code, board, port, line => e.sender.send('arduino:uploadLog', line))) } }
  catch (err) { return { ok: false, error: err.message } }
})

// ── Proprietary project files (only readable in ZeroAI Studio) ───────────────
// Custom per-app extension + an encoded container with a magic header, so the
// files aren't plain JSON and other programs won't open them.
const FILE_EXT = { zerospark: 'zspark', zaisim: 'zsim', zaiblock: 'zblock', zaipy: 'zpy', zaicad: 'zcad' }
const MAGIC = 'ZEROAI/v1\n'
const encodeProject = (a, data) => MAGIC + Buffer.from(JSON.stringify({ app: a, savedAt: Date.now(), data })).toString('base64')
function decodeProject(buf) {
  const s = buf.toString('utf8')
  if (!s.startsWith(MAGIC)) throw new Error('Not a ZeroAI project file')
  return JSON.parse(Buffer.from(s.slice(MAGIC.length), 'base64').toString('utf8'))
}
ipcMain.handle('zeroai:saveFile', async (e, { app: a, data, name }) => {
  const ext = FILE_EXT[a] || 'zeroai'
  const win = BrowserWindow.fromWebContents(e.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save project',
    defaultPath: `${(name || 'My Project').replace(/[\/\\:]/g, '-')}.${ext}`,
    filters: [{ name: 'ZeroAI Project', extensions: [ext] }],
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  await fs.writeFile(filePath, encodeProject(a, data))
  return { ok: true, path: filePath }
})
ipcMain.handle('zeroai:openFile', async (e, { app: a }) => {
  const ext = FILE_EXT[a] || 'zeroai'
  const win = BrowserWindow.fromWebContents(e.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Open project', properties: ['openFile'],
    filters: [{ name: 'ZeroAI Project', extensions: [ext] }],
  })
  if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true }
  try {
    const p = decodeProject(await fs.readFile(filePaths[0]))
    return { ok: true, app: p.app, data: p.data, path: filePaths[0] }
  } catch (err) { return { ok: false, error: err.message } }
})

// Native application menu — the suite behaves like a real desktop app:
// switch apps with ⌘1–⌘5, jump home with ⌘0, standard Edit/View/Window roles.
const SUITE_APPS = [
  { id: 'zerospark', name: 'ZeroSpark' },
  { id: 'zaiblock', name: 'ZaiBlock' },
  { id: 'zaisim', name: 'ZaiSim' },
  { id: 'zaipy', name: 'ZaiPy' },
  { id: 'zaicad', name: 'ZaiCAD' },
]
const focusedWin = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
const goTo = (host) => focusedWin()?.loadURL(`app://${host}/index.html`)

function buildMenu() {
  const releases = 'https://github.com/zeroai-tech/zeroai-studio/releases/latest'
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => shell.openExternal(releases) },
        { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Home (App Library)', accelerator: 'CmdOrCtrl+0', click: () => goTo('studio') },
        { type: 'separator' },
        // Project files are owned by each app's own File menu (⌘S there saves
        // .zspark/.zsim/… through the proprietary-file IPC); this stays app-agnostic.
        { role: 'close' },
        ...(process.platform === 'darwin' ? [] : [{ role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Apps',
      submenu: [
        ...SUITE_APPS.map((a, i) => ({
          label: a.name,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: async () => {
            const db = await readInstalled()
            if (db[a.id]) goTo(a.id)
            else goTo('studio')          // not installed → the library, where Install lives
          },
        })),
        { type: 'separator' },
        { label: 'Manage Apps…', click: () => goTo('studio') },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'ZeroAI Website', click: () => shell.openExternal('https://zeroaitech.tech') },
        { label: 'Support', click: () => shell.openExternal('mailto:support@zeroaitech.tech') },
        { label: 'Check for Updates…', click: () => shell.openExternal(releases) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  // Lab imaging path: install everything, print progress, exit.
  if (process.argv.includes('--install-all')) {
    const code = await installAllHeadless()
    app.exit(code)
    return
  }
  protocol.handle('app', handle)
  buildMenu()
  await seedBundledApps()   // no-op on the slim installer
  createWindow()

  // Check for a newer shell on launch (win/linux). Silent: electron-updater
  // downloads in the background and installs on next quit; a notification lets
  // the user restart now. Failures are ignored — the app still works offline.
  if (autoUpdater) {
    autoUpdater.on('update-downloaded', (info) => {
      const win = BrowserWindow.getAllWindows()[0]
      dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        title: 'ZeroAI Studio update ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'Restart to finish installing the update.',
      }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall() })
    })
    autoUpdater.checkForUpdates().catch(() => {})
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
