// Runs in every app loaded in the Studio, before the app's own scripts. It hands
// the apps three things so they behave like a desktop app, not a website:
//   1. window.__ZEROAI_DESKTOP__  — a flag apps can check to drop web-only UI
//   2. window.__ZEROAI_CONFIG__   — the shared Supabase config (so no per-app
//      .env / no "VITE key missing" warning, and cloud features work)
//   3. window.zeroaiDesktop       — offline local save/load (JSON on disk via IPC)

const { contextBridge, ipcRenderer } = require('electron')

function readArg(prefix) {
  const a = process.argv.find((x) => x.startsWith(prefix))
  return a ? a.slice(prefix.length) : ''
}

let cfg = {}
try { cfg = JSON.parse(Buffer.from(readArg('--zeroai-config='), 'base64').toString('utf8') || '{}') } catch {}

// the app id = the app:// host of whatever app is currently loaded
const appId = () => { try { return location.hostname || 'studio' } catch { return 'studio' } }

contextBridge.exposeInMainWorld('__ZEROAI_DESKTOP__', true)
contextBridge.exposeInMainWorld('__ZEROAI_CONFIG__', {
  supabaseUrl: cfg.supabaseUrl || '',
  supabaseAnonKey: cfg.supabaseAnonKey || '',
})
contextBridge.exposeInMainWorld('zeroaiDesktop', {
  isDesktop: true,
  app: appId(),
  // Offline project storage — JSON files in the user's app-data dir.
  save:   (id, data) => ipcRenderer.invoke('zeroai:save',   { app: appId(), id, data }),
  load:   (id)       => ipcRenderer.invoke('zeroai:load',   { app: appId(), id }),
  list:   ()         => ipcRenderer.invoke('zeroai:list',   { app: appId() }),
  remove: (id)       => ipcRenderer.invoke('zeroai:remove', { app: appId(), id }),
  // Proprietary project files (custom extension, only readable in this app):
  saveFile: (data, name) => ipcRenderer.invoke('zeroai:saveFile', { app: appId(), data, name }),
  openFile: ()           => ipcRenderer.invoke('zeroai:openFile', { app: appId() }),

  // Local Arduino toolchain — offline compile + upload for ZaiSim.
  arduino: {
    status:    ()               => ipcRenderer.invoke('arduino:status'),
    setup:     ()               => ipcRenderer.invoke('arduino:setup'),
    compile:   (code, board)    => ipcRenderer.invoke('arduino:compile', { code, board }),
    listPorts: ()               => ipcRenderer.invoke('arduino:listPorts'),
    upload:    (code, board, port) => ipcRenderer.invoke('arduino:upload', { code, board, port }),
    onSetupProgress: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('arduino:setupProgress', h); return () => ipcRenderer.removeListener('arduino:setupProgress', h) },
    onUploadLog:     (cb) => { const h = (_e, l) => cb(l); ipcRenderer.on('arduino:uploadLog', h); return () => ipcRenderer.removeListener('arduino:uploadLog', h) },
  },
})

// Manager API (used by the Studio launcher to install/uninstall apps on demand).
contextBridge.exposeInMainWorld('studio', {
  catalog:   ()    => ipcRenderer.invoke('studio:catalog'),
  install:   (app) => ipcRenderer.invoke('studio:install', app),
  uninstall: (id)  => ipcRenderer.invoke('studio:uninstall', { id }),
  size:      (id)  => ipcRenderer.invoke('studio:size', { id }),
  open:      (id)  => { location.href = 'app://' + id + '/index.html' },
  onProgress: (cb) => ipcRenderer.on('studio:progress', (_e, d) => cb(d)),
})
