// ZeroAI Studio — the STEM suite as ONE desktop app (Electron). Proof of concept.
//
// Each web app's built `dist/` is bundled under apps/<name>/ and served to the
// renderer over a custom **app://** scheme (host = app name). A standard secure
// scheme means the apps' default absolute asset paths ("/assets/…") just work —
// no per-app rebuild needed — and we can attach security headers per app
// (e.g. COOP/COEP for zaipy's Pyodide later). One window, switch between apps.

const { app, BrowserWindow, protocol, shell, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const APPS_DIR = path.join(__dirname, 'apps')

// Shared suite config (one Supabase project across all 5 apps). Kept in a
// gitignored studio.config.json so the (public, client-side) anon key isn't
// committed. Injected into every app via preload → no per-app .env needed.
let SUITE_CONFIG = {}
try { SUITE_CONFIG = require('./studio.config.json') } catch { /* runs offline-only without it */ }
const CONFIG_ARG = '--zeroai-config=' + Buffer.from(JSON.stringify(SUITE_CONFIG)).toString('base64')

// Where offline projects are stored (per app).
const projectsDir = (appId) => path.join(app.getPath('userData'), 'projects', appId.replace(/[^a-z0-9_-]/gi, ''))

// Strip the web-only chrome so the apps feel native, not like a website.
const DEWEBIFY_CSS = `
  a[href*="wa.me"], a[href*="api.whatsapp"], a[href*="whatsapp.com"],
  .whatsapp-float, [class*="whatsapp" i], [id*="whatsapp" i] { display: none !important; }
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

  const baseDir = path.join(APPS_DIR, host)
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
  // External links (e.g. an app's "← Suite" link to the website) open in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow' }
  })
}

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

app.whenReady().then(() => {
  protocol.handle('app', handle)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
