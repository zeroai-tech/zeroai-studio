# ZeroAI Studio (POC)

The ZeroAI STEM suite as **one installable desktop app** — Adobe-Creative-Cloud style.
Electron shell with a branded launcher that runs each app **offline**, bundled locally
and served over a custom `app://` scheme. Targets Windows · macOS · Linux.

This is a **proof of concept**: the launcher + **ZeroSpark** running fully inside the
Studio window. The other four apps are wired in the launcher as "Soon".

## Run it

```bash
cd zeroai-studio
npm install                 # downloads the Electron binary
npm run bundle:zerospark    # copies ../zerospark/dist into apps/zerospark
npm start                   # opens the ZeroAI Studio window
```

> Bundling requires each app to be built first (`cd ../zerospark && bun run build`).

## How it works

- `main.js` registers a privileged **`app://`** scheme and serves each `apps/<name>/`
  build to the renderer. A standard secure scheme means the apps' default absolute
  asset paths (`/assets/…`) work as-is — **no per-app rebuild** — and security headers
  can be set per app (COOP/COEP for ZaiPy's Pyodide is wired via `NEEDS_COI`).
- `apps/studio/index.html` is the launcher home screen; clicking a ready app navigates
  the window to `app://<app>/`.
- External links open in the OS browser.

## Why this design

The scan showed all five apps are **router-free, client-side Vite apps** — ideal for
Electron. The custom-scheme approach solves asset paths + cross-origin isolation in one
place, so adding an app is just: build it → `bundle:<app>` → flip its tile to ready.

## Next (full product)
- Bundle the other four apps (ZaiPy needs Pyodide bundled offline + COI headers — already wired).
- `electron-builder` for signed installers (.dmg / .exe / AppImage) + auto-update.
- Optional: migrate to a pnpm/Turborepo monorepo so Studio + apps share one codebase.
