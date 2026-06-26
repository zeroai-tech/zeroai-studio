// ZeroAI Studio — the STEM suite as ONE desktop app (Electron). Proof of concept.
//
// Each web app's built `dist/` is bundled under apps/<name>/ and served to the
// renderer over a custom **app://** scheme (host = app name). A standard secure
// scheme means the apps' default absolute asset paths ("/assets/…") just work —
// no per-app rebuild needed — and we can attach security headers per app
// (e.g. COOP/COEP for zaipy's Pyodide later). One window, switch between apps.

const { app, BrowserWindow, protocol, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const APPS_DIR = path.join(__dirname, 'apps')

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
    webPreferences: { contextIsolation: true },
  })
  win.loadURL('app://studio/index.html')
  // External links (e.g. an app's "← Suite" link to the website) open in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow' }
  })
}

app.whenReady().then(() => {
  protocol.handle('app', handle)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
