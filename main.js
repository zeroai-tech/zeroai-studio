// ZeroAI Studio — the STEM suite as ONE desktop app (Electron). Proof of concept.
//
// Each web app's built `dist/` is bundled under apps/<name>/ and served to the
// renderer over a custom **app://** scheme (host = app name). A standard secure
// scheme means the apps' default absolute asset paths ("/assets/…") just work —
// no per-app rebuild needed — and we can attach security headers per app
// (e.g. COOP/COEP for zaipy's Pyodide later). One window, switch between apps.

const { app, BrowserWindow, protocol, shell, ipcMain, dialog } = require('electron')
const fs = require('node:fs/promises')
const fss = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const AdmZip = require('adm-zip')

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
  win.loadURL('app://studio/index.html')
  // After each app loads, strip web-only chrome so it feels native + forward errors.
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(DEWEBIFY_CSS).catch(() => {})
    win.webContents.executeJavaScript(
      "window.addEventListener('error',e=>console.log('JS-ERROR: '+((e.error&&e.error.stack)||e.message)));" +
      "window.addEventListener('unhandledrejection',e=>console.log('PROMISE-REJECT: '+((e.reason&&e.reason.stack)||e.reason)));"
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

// ── App catalog: install / uninstall on demand (Adobe-CC model) ──────────────
ipcMain.handle('studio:catalog', async () => {
  let apps = []
  try { apps = (await getJSON(MANIFEST_URL)).apps || [] }
  catch (e) { return { ok: false, error: 'Could not reach the catalog: ' + e.message, apps: [], installed: await readInstalled() } }
  return { ok: true, apps, installed: await readInstalled() }
})
ipcMain.handle('studio:install', async (e, { id, url, version }) => {
  try {
    await fs.mkdir(INSTALL_DIR(), { recursive: true })
    const tmp = path.join(app.getPath('temp'), `${id}-${Date.now()}.zip`)
    await download(url, tmp, pct => e.sender.send('studio:progress', { id, pct }))
    const dir = path.join(INSTALL_DIR(), id)
    await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true })
    new AdmZip(tmp).extractAllTo(dir, true)
    await fs.unlink(tmp).catch(() => {})
    const db = await readInstalled(); db[id] = { version, installedAt: Date.now() }; await writeInstalled(db)
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
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

app.whenReady().then(() => {
  protocol.handle('app', handle)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
